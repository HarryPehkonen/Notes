/**
 * Content-Security-Policy for HTML page responses.
 *
 * Caddy already sends HSTS / X-Frame-Options / X-Content-Type-Options /
 * Referrer-Policy in production, so those are deliberately NOT duplicated
 * here. CSP lives in the app instead of the proxy so dev and staging (which
 * run Oak directly, with no Caddy in front) get the same protection.
 */

/** Where the frontend loads lit / marked / dompurify from */
const CDN_ORIGIN = "https://cdn.jsdelivr.net";

/**
 * Build the CSP header value for one response
 *
 * script-src carries a per-response nonce instead of 'unsafe-inline': the only
 * inline scripts we ship are the import map and the service-worker registration
 * in index.html, and both get the nonce stamped on at serve time.
 * @param {string} nonce - Per-response nonce, also injected into the HTML
 * @returns {string} Policy suitable for the Content-Security-Policy header
 */
export function buildCspPolicy(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' ${CDN_ORIGIN} 'nonce-${nonce}'`,
    // 'unsafe-inline' is required for style-src only: Lit injects component
    // styles as inline <style> elements into each shadow root at runtime, and
    // there is no way to nonce those. Scripts stay nonce-only.
    `style-src 'self' ${CDN_ORIGIN} 'unsafe-inline'`,
    // data: and blob: cover pasted-image previews and object URLs in the editor
    "img-src 'self' data: blob:",
    `font-src 'self' ${CDN_ORIGIN} data:`,
    // ws:/wss: for the /ws live-sync socket (ws: on plain-HTTP dev/staging)
    "connect-src 'self' wss: ws:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Generate a fresh CSP nonce
 * @returns {string} Random token safe to use unquoted inside a CSP directive
 */
export function generateNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Matches opening <script> tags that have no src attribute (i.e. inline ones) */
const INLINE_SCRIPT_TAG = /<script(?![^>]*\ssrc=)([^>]*)>/gi;

/**
 * Stamp the nonce onto every inline <script> in an HTML document
 *
 * The HTML files on disk stay nonce-free; injection happens per request, right
 * where main.js reads them with Deno.readTextFile.
 * @param {string} html - HTML document text
 * @param {string} nonce - Nonce from ctx.state.cspNonce
 * @returns {string} HTML with nonce attributes on inline scripts
 */
export function injectNonce(html, nonce) {
  if (!nonce) return html;
  return html.replace(INLINE_SCRIPT_TAG, (_match, attrs) => `<script nonce="${nonce}"${attrs}>`);
}

/**
 * Oak middleware that attaches the CSP header to HTML responses
 *
 * The nonce is published on `ctx.state.cspNonce` before the handler runs so the
 * page handler can inject the same value into the document it serves. The
 * header is only set for HTML: API JSON responses do not need it.
 * @returns {Function} Oak middleware
 */
export function cspMiddleware() {
  return async (ctx, next) => {
    const nonce = generateNonce();
    ctx.state.cspNonce = nonce;

    await next();

    const type = ctx.response.type || ctx.response.headers.get("content-type") || "";
    if (!String(type).includes("html")) return;

    ctx.response.headers.set("Content-Security-Policy", buildCspPolicy(nonce));
  };
}

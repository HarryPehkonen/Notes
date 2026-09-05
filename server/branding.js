/**
 * App display-name branding (APP_NAME override)
 *
 * The app's name shows up in a handful of places: the browser tab title, the
 * PWA install name, the login screen heading, and the app's own sidebar
 * header. All default to the hardcoded product name; setting APP_NAME in
 * .env overrides every one of them to the SAME configured value at once, so
 * the branding never looks half-changed.
 */

/** Shown everywhere when APP_NAME is unset - the app's formal name */
export const DEFAULT_APP_NAME = "Notes App";

/** Shown everywhere when APP_NAME is unset - the app's short name (sidebar, login heading) */
export const DEFAULT_APP_SHORT_NAME = "Notes";

/**
 * Resolve one display name: the configured override if non-blank, else a
 * per-surface fallback. When APP_NAME IS set, every surface gets the exact
 * same value regardless of which fallback it would otherwise use.
 * @param {string|null|undefined} rawValue - Deno.env.get("APP_NAME")
 * @param {string} fallback - What to show when unset/blank
 * @returns {string} The name to display
 */
export function resolveAppName(rawValue, fallback) {
  const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Escape text for safe use inside HTML content or a "..." attribute value.
 * Deliberately self-contained (mirrors public/utils/text.js) rather than
 * importing across the server/public boundary.
 * @param {string} text - Raw text
 * @returns {string} HTML-escaped text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Replace the `{{APP_NAME}}` / `{{APP_SHORT_NAME}}` placeholders in an HTML
 * document (index.html, login.html) with the resolved, HTML-escaped names.
 *
 * Matches either spacing - `{{APP_NAME}}` or `{{ APP_NAME }}` - since
 * `deno fmt` rewrites the former to the latter inside HTML text content, and
 * the match must not depend on which one is on disk at any given moment.
 * @param {string} html - Document text
 * @param {{ full: string, short: string }} names - Resolved names
 * @returns {string} HTML with placeholders replaced
 */
export function injectAppName(html, { full, short }) {
  return html
    .replace(/\{\{\s*APP_NAME\s*\}\}/g, escapeHtml(full))
    .replace(/\{\{\s*APP_SHORT_NAME\s*\}\}/g, escapeHtml(short));
}

/**
 * Apply the resolved names to manifest.json's `name` / `short_name` fields.
 * Parses and re-stringifies rather than templating text, so the value is
 * always correctly JSON-escaped no matter what APP_NAME contains.
 * @param {string} manifestJson - manifest.json file contents
 * @param {{ full: string, short: string }} names - Resolved names
 * @returns {string} Updated manifest.json contents
 */
export function injectAppNameIntoManifest(manifestJson, { full, short }) {
  const manifest = JSON.parse(manifestJson);
  manifest.name = full;
  manifest.short_name = short;
  return JSON.stringify(manifest, null, 2);
}

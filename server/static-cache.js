/**
 * Cache-Control policy for files served under /static/.
 *
 * The filenames there are not content-hashed, so a long max-age on code is how
 * a deploy goes invisible: the browser keeps serving the old component and a
 * shipped button never appears. Code therefore revalidates (the static route
 * sets a content-hash ETag and answers a matching If-None-Match with a real
 * 304, so an unchanged file costs headers only), while images and fonts keep
 * the long cache - a new image is not a deploy.
 *
 * Pure and separate from the route so the policy is testable.
 */

const IMAGE_AND_FONT_EXTS = new Set([
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "woff",
  "woff2",
]);

const CODE_EXTS = new Set(["js", "css", "html", "json"]);

/**
 * The Cache-Control header value for a static file.
 *
 * @param {{filePath?: string, ext?: string|null, environment?: string|null}} [params]
 * @returns {string}
 */
export function cacheControlFor({ filePath = "", ext = null, environment = null } = {}) {
  const extension = (ext ?? filePath.split(".").pop() ?? "").toLowerCase();
  const maxAge = environment === "production" ? 86400 : 3600;

  // The service worker must never be cached: the browser has to see new ones.
  if (filePath === "sw.js") return "no-cache";

  if (CODE_EXTS.has(extension)) return "no-cache";

  if (IMAGE_AND_FONT_EXTS.has(extension) || filePath.includes("favicon")) {
    return `public, max-age=${maxAge * 24}`;
  }

  return `public, max-age=${maxAge}`;
}

/**
 * The environment name the cache policy keys off.
 *
 * Deliberately a named helper rather than an inline `Deno.env.get` at the call
 * site: it lets the tests exercise the actual wiring, so reading a variable
 * that nothing sets cannot silently downgrade every image and font to the
 * short max-age again.
 *
 * `NODE_ENV` is the variable the runtime really exports (systemd
 * `Notes.service` and `/opt/Notes/.env`).
 *
 * @returns {string|null} the value of NODE_ENV, or null when it is unset
 */
export function staticCacheEnvironment() {
  return Deno.env.get("NODE_ENV") ?? null;
}

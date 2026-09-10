/**
 * Cache-Control policy for files served under /static/.
 *
 * The filenames there are not content-hashed, so a long max-age on code is how
 * a deploy goes invisible: the browser keeps serving the old component and a
 * shipped button never appears. Code therefore revalidates (the static route
 * sets a content-hash ETag, so an unchanged file costs one 304), while images
 * and fonts keep the long cache - a new image is not a deploy.
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

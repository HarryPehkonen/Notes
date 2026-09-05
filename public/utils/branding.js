/**
 * Read the app's configured display name on the client.
 *
 * The server injects it as a <meta name="app-short-name"> tag on index.html
 * (see server/branding.js); this just reads it back, with the product
 * default as a fallback for anywhere the tag is missing or blank (e.g. a
 * test environment with no real document head).
 */

const DEFAULT_SHORT_NAME = "Notes";

/**
 * @param {Document|null|undefined} [doc] - Injectable for tests; defaults to
 *   the real `document` where one exists (the browser), and to nothing
 *   otherwise (e.g. a test runner with no DOM global)
 * @param {string} [fallback] - Used when the meta tag is missing/blank
 * @returns {string} The app's short display name
 */
export function readAppShortName(
  doc = typeof document === "undefined" ? null : document,
  fallback = DEFAULT_SHORT_NAME,
) {
  const content = doc?.querySelector?.('meta[name="app-short-name"]')?.content;
  return typeof content === "string" && content.trim() ? content.trim() : fallback;
}

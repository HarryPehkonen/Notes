/**
 * Keep the rendered preview on screen when only a checkbox flipped.
 *
 * The bug this exists for (Harri's phone, notes #123/#124): tapping a checkbox
 * in View mode throws the reader back to the top of the note. Measured with
 * Playwright on a 390x844 touch viewport: scrollTop 150 -> 0, 400 -> 0,
 * 700 -> 234, 1000 -> 78 on the same tap that ticked the box. The cause is
 * not the tap: `_handlePreviewClick` marks the note dirty, Lit re-renders,
 * `renderMarkdown` returns new HTML because one `[ ]` became `[x]`, and
 * replacing every node under `.markdown-preview` makes the browser drop the
 * scroller. Freezing `renderMarkdown` (so the same string is re-rendered)
 * leaves the DOM untouched and the position unchanged - that is the fix.
 *
 * The DOM is already correct at that moment: the input the finger hit is
 * checked by the browser before any of this runs. So the cache advances its
 * source content while keeping the markup it already handed to the DOM. Every
 * later render compares content again: unchanged content reuses the same
 * string (the directive sees no change and does nothing), and changed content
 * renders fresh. The cache must be discarded when the preview is torn down
 * (view-mode toggle, note switch) - stale checked attributes would otherwise
 * come back.
 */

/**
 * @typedef {object} PreviewCache
 * @property {string} source - Content the cached markup was rendered from
 * @property {string} html - Markup last handed to the preview
 */

/**
 * Markup for the current content, reusing the previous render when the content
 * has not moved.
 * @param {PreviewCache|null} cache
 * @param {string} content - Current markdown
 * @param {(content: string) => string} render - Renders markdown to HTML
 * @returns {PreviewCache}
 */
export function previewMarkup(cache, content, render) {
  if (cache && typeof cache.html === "string" && cache.source === content) {
    return cache;
  }
  return { source: content, html: render(content) };
}

/**
 * Record a checkbox tap: the markdown changed, but the browser has already
 * applied that exact change to the DOM, so the rendered markup stays as it is.
 * @param {PreviewCache|null} cache
 * @param {string} content - Markdown after the toggle
 * @returns {PreviewCache|null} cache with advanced source, or null if none
 */
export function advancePreviewSource(cache, content) {
  if (!cache || typeof cache.html !== "string") return cache ?? null;
  return { source: content, html: cache.html };
}

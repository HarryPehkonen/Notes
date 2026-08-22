/**
 * Match-badge helpers for semantic search results.
 *
 * The API returns `similarity` (0..1) only on semantic-search results;
 * text-search results never carry it. These helpers keep the display
 * logic pure and testable.
 */

/**
 * Format a similarity score as a human-readable percentage.
 * @param {number|undefined|null} similarity - 0..1 from the API
 * @returns {string|null} "87% match" or null when there is no score
 */
export function formatMatch(similarity) {
  if (typeof similarity !== "number" || !Number.isFinite(similarity)) {
    return null;
  }
  const clamped = Math.max(0, Math.min(1, similarity));
  return `${Math.round(clamped * 100)}% match`;
}

/**
 * Should a match badge be rendered for this note?
 * Only when the result carries a real similarity score (semantic mode).
 * @param {Object} note - A search result
 * @returns {boolean}
 */
export function hasMatchBadge(note) {
  return typeof note?.similarity === "number" && Number.isFinite(note.similarity);
}

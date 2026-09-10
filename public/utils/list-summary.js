/**
 * How the notes list describes itself.
 *
 * "20 Notes" was a lie whenever more existed: the number came from the page,
 * not the collection, so a note on page two looked like it had been deleted.
 * These helpers keep the wording pure and unit-testable rather than buried in
 * a template.
 *
 * A `total` of null/undefined means "unknown" (for example a search response
 * that does not report one) and falls back to the loaded count alone.
 */

/**
 * The header count: "20 of 65 Notes", or "20 Notes" when 20 is all there is.
 *
 * @param {{loaded: number, total?: number|null}} params
 * @returns {string}
 */
export function formatListCount({ loaded, total = null }) {
  const known = Number.isFinite(total);
  const count = known ? total : loaded;
  const noun = count === 1 ? "Note" : "Notes";
  if (known && total > loaded) {
    return `${loaded} of ${total} ${noun}`;
  }
  return `${count} ${noun}`;
}

/**
 * The label for the "more" control: how much is still hidden.
 *
 * @param {{loaded: number, total?: number|null}} params
 * @returns {string} Empty when nothing is hidden, "Load more" when unknown.
 */
export function remainingLabel({ loaded, total = null }) {
  if (!Number.isFinite(total)) {
    return "Load more";
  }
  if (total > loaded) {
    return `Show ${total - loaded} more`;
  }
  if (total === loaded) {
    return "";
  }
  // Stale total (a note was deleted since the count): never show a negative.
  return "Load more";
}

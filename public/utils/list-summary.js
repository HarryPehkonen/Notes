/**
 * How the notes header describes the list.
 *
 * "20 Notes" was a lie whenever more existed: the number was the page, not the
 * collection. These helpers make the distinction explicit and keep the wording
 * unit-testable instead of buried in a template.
 */

/**
 * The count line for the notes header.
 *
 * @param {{loaded: number, total?: number|null}} params
 *   `loaded` is how many notes are on screen; `total` is the server's count for
 *   the current filters, or null when the active query does not report one.
 * @returns {string} e.g. "20 of 65 Notes", "20 Notes", "1 Note"
 */
export function formatListCount({ loaded, total = null }) {
  const hasTotal = Number.isFinite(total);
  // A total below what is already on screen is stale - left over from the
  // previous query (switching the pinned-only filter back off refills the list
  // with a fetch that has not updated the total yet). Trust the rows on screen:
  // "0 Notes" above a full list is worse than an honest page count.
  const known = hasTotal && total >= loaded;
  const count = known ? total : loaded;
  const noun = count === 1 ? "Note" : "Notes";

  if (known && total > loaded) return `${loaded} of ${total} ${noun}`;
  return `${count} ${noun}`;
}

/**
 * The label for the "more" button.
 *
 * Returns "" when nothing is hidden; a stale or unknown total falls back to the
 * plain label rather than inventing a negative count.
 *
 * @param {{loaded: number, total?: number|null}} params
 * @returns {string}
 */
export function remainingLabel({ loaded, total = null }) {
  if (!Number.isFinite(total)) return "Load more";
  if (total === loaded) return "";
  if (total > loaded) return `Show ${total - loaded} more`;
  return "Load more";
}

/**
 * The number in the drawer's "All Notes" row.
 *
 * The row used to sum `note_count` across the tag list, which is the number of (note, tag)
 * LINKS, not notes: on production (2026-10-10) that read 74 while only 63 notes carried at
 * least one tag - 11 notes have a second tag, and that gap is the whole error. It is not a
 * rounding artefact of one dataset either: in the small local fixture the same expression
 * over-counts from 16 to 27, so the sign of the error depends on how multi-tagged the
 * collection happens to be, which is why it survived casual inspection.
 *
 * The count is a collection-wide fact the client cannot compute from one page of notes, so
 * the server supplies it (`GET /api/tags` -> `meta.taggedCount`) and this formats it. A
 * missing value renders as nothing rather than a wrong number: an unknown count must not
 * look like zero.
 */

/**
 * @param {number|null|undefined} value - Notes with at least one tag, or null when unknown
 * @returns {string} - e.g. "63", "0", ""
 */
export function formatTaggedCount(value) {
  return Number.isFinite(value) ? String(value) : "";
}

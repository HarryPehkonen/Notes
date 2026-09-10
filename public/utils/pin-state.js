/**
 * The pin toggle's wording, and what a pin does to a note object.
 *
 * Pinning is a state change, not an edit, so it does not go through the
 * content-save path. But the server bumps `updated_at` when it changes (a DB
 * trigger), and the sync layer compares that timestamp to spot conflicts - so
 * after a pin we must remember the timestamp the server actually stored, or the
 * next content save looks like it was written against a stale copy.
 *
 * Pure, so both the label and the timestamp handling are testable without a DOM.
 */

/**
 * What the pin button should say for this note.
 *
 * @param {Object|null} note
 * @returns {{pinned: boolean, label: string, title: string, nextValue: boolean}}
 */
export function describePin(note) {
  const pinned = Boolean(note?.is_pinned);
  return {
    pinned,
    label: pinned ? "Pinned" : "Pin",
    title: pinned ? "Unpin this note" : "Pin this note to the top",
    nextValue: !pinned,
  };
}

/**
 * A copy of the note with the pin flag applied.
 *
 * Call it with `{ is_pinned }` for an optimistic flip, then again with the
 * server's note (or its `updated_at`) when the request lands.
 *
 * @param {Object|null} note
 * @param {{is_pinned?: unknown, updated_at?: string|null}} [patch]
 * @returns {Object|null}
 */
export function withPinResult(note, { is_pinned, updated_at = null } = {}) {
  if (!note) return note;
  return {
    ...note,
    is_pinned: Boolean(is_pinned),
    updated_at: updated_at ?? note.updated_at,
  };
}

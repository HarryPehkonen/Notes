/**
 * Where a single tag edit goes.
 *
 * Tag edits are operations, never "here is the new full list": attaching is a
 * PUT of the tag's own URL and detaching is a DELETE of the same URL. That makes
 * both idempotent (safe to retry on a flaky connection) and means two clients
 * editing tags can't clobber each other the way a whole-list rewrite does.
 *
 * The id lives in the path on purpose: RFC 9110 9.3.5 gives content in a DELETE
 * no generally defined semantics, so a detach carries no body.
 */

/**
 * @param {number} noteId
 * @param {number} tagId
 * @param {boolean} attach - true to put the tag on, false to take it off
 * @returns {{method: string, path: string}}
 */
export function tagEndpoint(noteId, tagId, attach) {
  return {
    method: attach ? "PUT" : "DELETE",
    path: `/api/notes/${noteId}/tags/${tagId}`,
  };
}

/**
 * The new tag list after a toggle, for the optimistic update.
 *
 * Never mutates the input: Lit sees a changed array identity, and the previous
 * value stays intact for the revert path if the request fails.
 *
 * @param {Array<{id: number}>|undefined} tags - Current list (may be malformed)
 * @param {{id: number}} tag - The tag being toggled
 * @param {boolean} attach
 * @returns {Array<{id: number}>} A new array
 */
export function applyTagToggle(tags, tag, attach) {
  const list = Array.isArray(tags) ? tags.filter((t) => t && t.id) : [];

  if (attach) {
    if (list.some((t) => t.id === tag.id)) return list;
    return [...list, tag];
  }
  return list.filter((t) => t.id !== tag.id);
}

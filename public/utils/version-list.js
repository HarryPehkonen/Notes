/**
 * Version-history rows: "Current" first, then the recorded versions, newest first.
 *
 * Why "Current" is a row of its own: the database trigger records the state a note
 * had BEFORE a change, so the newest recorded version is never the note you are
 * looking at. A list that implied "newest = now" would be lying by one edit.
 *
 * Rows carry each version's title and content, so opening one in read-only
 * preview needs no extra request - the history payload already has everything.
 */

/** Sentinel id for the row representing the live note. */
export const CURRENT_ROW_ID = "current";

/**
 * @param {{title?: string, content?: string, updated_at?: string, created_at?: string}|null} note
 * @param {Array<object>} versions - as returned by GET /notes/:id/versions
 * @returns {Array<{id: number|string, label: string, isCurrent: boolean, when: string|null, title: string, content: string, versionNumber: number|null}>}
 */
export function buildVersionRows(note, versions) {
  const rows = [];

  if (note) {
    rows.push({
      id: CURRENT_ROW_ID,
      label: "Current",
      isCurrent: true,
      when: note.updated_at || note.created_at || null,
      title: note.title ?? "",
      content: note.content ?? "",
      versionNumber: null,
    });
  }

  const recorded = (Array.isArray(versions) ? versions : [])
    .filter((version) => version && version.id !== undefined && version.id !== null)
    .slice()
    .sort((a, b) => numberOrZero(b.version_number) - numberOrZero(a.version_number));

  for (const version of recorded) {
    rows.push({
      id: version.id,
      label: `Version ${version.version_number}`,
      isCurrent: false,
      when: version.created_at || null,
      title: version.title ?? "",
      content: version.content ?? "",
      versionNumber: version.version_number ?? null,
    });
  }

  return rows;
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Step to the neighbouring recorded version, for the Older / Newer arrows.
 *
 * Index 0 of a row list is Current, so the arrows deliberately stop at index 1:
 * moving "newer" from the newest recorded version is a dead end rather than a
 * quiet switch into read/write editing. Getting back to the live note is "Back to
 * Current" - an explicit choice.
 *
 * @param {Array<object>} rows - from buildVersionRows
 * @param {number|string} currentId - id of the row being viewed
 * @param {"newer"|"older"} direction
 * @returns {object|null} the row to show, or null when there is nowhere to go
 */
export function stepVersionRow(rows, currentId, direction) {
  if (!Array.isArray(rows)) return null;
  const index = rows.findIndex((row) => row && row.id === currentId);
  if (index === -1) return null;

  const next = direction === "newer" ? index - 1 : direction === "older" ? index + 1 : -1;
  // next < 1 keeps the arrows inside the recorded versions (0 is Current).
  if (next < 1 || next >= rows.length) return null;
  return rows[next];
}

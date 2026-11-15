/**
 * Which text a reader sees, per note format.
 *
 * A groff note keeps its raw source in `content` and the markdown projection
 * the server derived on save in `content_markdown`. Editing stays on the
 * source — groff is never rendered in the browser — while the reading preview
 * shows the projection. The projection is display-only: nothing here or in the
 * editor writes it back into `content`.
 *
 * A groff note with no usable projection (an older row, or a source that
 * projects to nothing) falls back to its source. Showing raw groff is ugly;
 * hiding the note's text entirely would be worse.
 */

/**
 * @param {{format?: unknown}|null|undefined} note
 * @returns {boolean} True when the note's source is raw groff
 */
export function isGroffNote(note) {
  return note?.format === "groff";
}

/**
 * The text to render as markdown for reading.
 * @param {{format?: unknown, content?: unknown, content_markdown?: unknown}|null|undefined} note
 * @returns {string}
 */
export function displayText(note) {
  if (!note) return "";
  const source = typeof note.content === "string" ? note.content : "";
  if (!isGroffNote(note)) return source;
  const projected = typeof note.content_markdown === "string" ? note.content_markdown : "";
  return projected.trim() ? projected : source;
}

/**
 * Whether the editor should open showing the rendered preview rather than the
 * source.
 *
 * A groff note is a document: its source is raw groff, so it opens as the
 * projection unless the writer has said otherwise for groff notes. Markdown
 * notes keep the single global preference they have always had, which defaults
 * to the editor.
 *
 * @param {{format?: unknown}|null|undefined} note
 * @param {{groff?: string|null, markdown?: string|null}} stored - localStorage values
 * @returns {boolean}
 */
export function prefersPreview(note, stored) {
  if (isGroffNote(note)) return stored?.groff !== "false";
  return stored?.markdown === "true";
}

/**
 * The localStorage key a format's preview preference lives under. Groff notes
 * get their own, so choosing to read documents cannot change how markdown notes
 * are edited - and the other way round.
 *
 * @param {{format?: unknown}|null|undefined} note
 * @returns {string}
 */
export function previewPreferenceKey(note) {
  return isGroffNote(note) ? "notes-groffPreview" : "notes-previewMode";
}

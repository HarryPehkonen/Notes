/**
 * Normalize note fields before persisting.
 *
 * Title is trimmed (a note titled with stray whitespace is never what the user
 * meant), but content is preserved VERBATIM. Trailing whitespace in a note body
 * is meaningful in Markdown: two trailing spaces force a hard line break, and a
 * trailing blank line changes rendering. Trimming it silently corrupts the note.
 *
 * @param {{title?: unknown, content?: unknown}} fields - Raw fields from a request
 * @returns {{title?: string, content?: string}} Normalized fields; a key is only
 *   present when the raw field is a string
 */
export function normalizeNoteFields({ title, content }) {
  const out = {};
  if (typeof title === "string") out.title = title.trim();
  if (typeof content === "string") out.content = content;
  return out;
}

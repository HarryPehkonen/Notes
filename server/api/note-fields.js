/** The ways a note can be written. */
const NOTE_FORMATS = new Set(["markdown", "groff"]);

/**
 * Normalize note fields before persisting.
 *
 * Title is trimmed (a note titled with stray whitespace is never what the user
 * meant), but content is preserved VERBATIM. Trailing whitespace in a note body
 * is meaningful in Markdown: two trailing spaces force a hard line break, and a
 * trailing blank line changes rendering. Trimming it silently corrupts the note.
 *
 * @param {{title?: unknown, content?: unknown, format?: unknown}} fields - Raw fields from a request
 * @returns {{title?: string, content?: string, format?: string}} Normalized fields; a key is only
 *   present when the raw field is usable
 */
export function normalizeNoteFields({ title, content, format }) {
  const out = {};
  if (typeof title === "string") out.title = title.trim();
  if (typeof content === "string") out.content = content;
  // An unknown format is dropped rather than passed on, so a typo cannot
  // half-convert a note: it stays markdown, which is what it already was. The
  // database CHECK constraint is the loud backstop.
  if (typeof format === "string" && NOTE_FORMATS.has(format)) out.format = format;
  return out;
}

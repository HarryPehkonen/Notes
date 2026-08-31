/**
 * Pure helpers for printing a note.
 *
 * The editor prints the *rendered* note (the same HTML the markdown preview
 * shows), not the raw textarea, so the only logic that is not CSS is the
 * paper-vs-screen fixups made here. They live outside the component so they
 * can be unit tested without a DOM.
 */

/** Shown when a note has no usable title, on paper and as the PDF filename. */
const UNTITLED = "Untitled note";

/** Matches a whole `<input>` tag. Values are HTML-escaped by the time we see
 * them (the markup comes out of DOMPurify), so `>` cannot appear inside one. */
const INPUT_TAG = /<input\b([^>]*)>/gi;

/** Matches one `name`, `name=value`, `name="value"` or `name='value'` pair. */
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;

/**
 * Read the attributes of a tag into a lookup keyed by lowercased name.
 * @param {string} source - Everything between the tag name and the closing `>`
 * @returns {Map<string, string>} Attribute names to their (possibly empty) values
 */
function parseAttributes(source) {
  const attributes = new Map();
  for (const match of source.matchAll(ATTRIBUTE)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

/**
 * Title for the printed page and for `document.title` while the print dialog
 * is open -- the latter is what browsers offer as the "Save as PDF" filename.
 * @param {{title?: unknown}|null|undefined} note
 * @returns {string} The note's title, or a placeholder when it has none
 */
export function printDocumentTitle(note) {
  const title = note?.title;
  if (typeof title !== "string") return UNTITLED;
  return title.trim() || UNTITLED;
}

/**
 * Swap rendered checkboxes for a text glyph.
 *
 * On screen a checkbox is a tappable control sized for thumbs and tinted with
 * `accent-color`; on paper it is a large colored blob that wastes ink and says
 * nothing a `[x]` does not. Note this only rewrites real `<input>` elements --
 * a checkbox *written about* inside a code block arrives escaped, so it stays
 * text, matching how the rest of the checkbox pipeline treats code.
 *
 * @param {string} html - Sanitized preview HTML
 * @returns {string} The same HTML with checkbox inputs replaced by glyph spans
 */
export function checkboxesToPrintGlyphs(html) {
  if (typeof html !== "string") return html;

  return html.replace(INPUT_TAG, (tag, attributeSource) => {
    const attributes = parseAttributes(attributeSource);
    if (attributes.get("type")?.toLowerCase() !== "checkbox") return tag;
    const glyph = attributes.has("checked") ? "[x]" : "[ ]";
    return `<span class="print-checkbox">${glyph}</span>`;
  });
}

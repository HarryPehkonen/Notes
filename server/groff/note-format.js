/**
 * Derived note fields, by format.
 *
 * A markdown note derives nothing new: its plain text is the body, stripped, as
 * it always was. A groff note derives three things from its source -- the
 * markdown projection the app reads and searches, the plain text of that
 * projection, and the version of the projection that built it, so a change to
 * the projection can refresh exactly the notes that are behind.
 *
 * Nothing here touches the database, and nothing here can touch `content`: the
 * groff source is the note, and the projection is a copy for reading.
 */

import { projectGroff } from "./project.js";

/** Bump when a change to the projection should re-render existing notes. */
export const PROJECTION_VERSION = 1;

/**
 * @param {unknown} value - A format from a request
 * @returns {"markdown"|"groff"} The format, defaulting to markdown
 */
export function normalizeNoteFormat(value) {
  return value === "groff" ? "groff" : "markdown";
}

/**
 * @typedef {Object} DerivedNoteFields
 * @property {string|null} title - Title from the document, or null to keep the caller's
 * @property {string|null} content_markdown - The projection, or null for a markdown note
 * @property {string} plainSource - The text whose stripped form is content_plain
 * @property {number|null} projection_version - Which projection built the projection
 * @property {string[]} warnings - What the projection could not carry over
 */

/**
 * @param {{format?: unknown, content?: unknown}} note - The note being saved
 * @returns {DerivedNoteFields}
 */
export function derivedNoteFields({ format, content }) {
  const source = typeof content === "string" ? content : "";

  if (normalizeNoteFormat(format) !== "groff") {
    return {
      title: null,
      content_markdown: null,
      plainSource: source,
      projection_version: null,
      warnings: [],
    };
  }

  const projection = projectGroff(source);
  return {
    // The document owns its title: .RECIPE is the title, and search weights the
    // title highest, so a stale copy of it is worse than none. An empty one
    // leaves whatever the caller sent alone.
    title: projection.title === "" ? null : projection.title,
    content_markdown: projection.markdown,
    // Search reads content_plain, and for a groff note the readable text IS the
    // projection -- indexing the source would index ".RECIPE" and ".STEP".
    plainSource: projection.markdown,
    projection_version: PROJECTION_VERSION,
    warnings: projection.warnings,
  };
}

/**
 * Is this note's stored projection behind the current projection?
 *
 * Used by the re-projection script, which is the only thing that runs after the
 * projection itself changes.
 *
 * @param {{format?: unknown, projection_version?: number|null}} note
 * @returns {boolean}
 */
export function needsReprojection(note) {
  if (normalizeNoteFormat(note.format) !== "groff") return false;
  return (note.projection_version ?? 0) < PROJECTION_VERSION;
}

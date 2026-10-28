/**
 * The kind of document a new note is.
 *
 * Chosen once, when the note is created, and never switched: a groff document
 * is a groff document for life, a markdown note is markdown for life. Changing
 * kind would mean converting the source, not toggling a flag - so if you want
 * the other kind, create another note.
 *
 * Pure decisions only (no DOM, no fetch), so the chooser that renders them and
 * the body that gets POSTed are both unit-testable.
 */

/** The kinds, in the order the chooser shows them. Markdown first. */
export const NOTE_KINDS = [
  {
    format: "markdown",
    label: "Markdown",
    hint: "An ordinary note. Checkboxes, tags, search.",
  },
  {
    format: "groff",
    label: "Groff",
    hint: "A document you write in raw groff and print.",
  },
];

/** Markdown, because the overwhelming majority of notes are notes. */
export const DEFAULT_NOTE_FORMAT = "markdown";

const FORMATS = new Set(NOTE_KINDS.map((kind) => kind.format));

/** Is this one of the kinds we can create? Anything else is not. */
export function isNoteFormat(value) {
  return FORMATS.has(value);
}

/**
 * The body for POST /api/notes.
 *
 * Title and content are deliberately empty: the editor's placeholders prompt
 * the writer better than real text they would have to select and delete first.
 *
 * A groff document starts empty too - no skeleton, no macro cheat-sheet. You
 * drive it; the macros are the thing you are learning.
 *
 * @param {string} [format] - one of NOTE_KINDS; anything else falls back to markdown
 * @returns {{title: string, content: string, tags: string[], format: string}}
 */
export function newNoteBody(format) {
  return {
    title: "",
    content: "",
    tags: [],
    format: isNoteFormat(format) ? format : DEFAULT_NOTE_FORMAT,
  };
}

/** Wording of the chooser, kept here so the dialog has no literals of its own. */
export const NEW_NOTE_DIALOG = {
  question: "What kind of document?",
  cancel: "Cancel",
};

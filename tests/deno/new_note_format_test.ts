/**
 * Creating a note: which kind, decided once.
 *
 * The plus button used to write an empty markdown note immediately. It now asks
 * first, because the answer is permanent - a groff document cannot become a
 * markdown note - so the choice has to be made before the row exists. These
 * tests pin the rule, the body, and the wiring that keeps a dismissed chooser
 * from leaving an empty note behind.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  DEFAULT_NOTE_FORMAT,
  isNoteFormat,
  NEW_NOTE_DIALOG,
  newNoteBody,
  NOTE_KINDS,
} from "../../public/utils/new-note-format.js";

Deno.test("the chooser offers exactly two kinds, markdown first", () => {
  assertEquals(NOTE_KINDS.length, 2);
  assertEquals(NOTE_KINDS.map((kind) => kind.format), ["markdown", "groff"]);
  for (const kind of NOTE_KINDS) {
    assert(kind.label.length > 0, "every kind needs a label");
    assert(kind.hint.length > 0, "every kind needs a hint");
  }
  assertEquals(DEFAULT_NOTE_FORMAT, "markdown");
});

Deno.test("isNoteFormat accepts the two kinds and nothing else", () => {
  assertEquals(isNoteFormat("markdown"), true);
  assertEquals(isNoteFormat("groff"), true);
  assertEquals(isNoteFormat("GROFF"), false);
  assertEquals(isNoteFormat("latex"), false);
  assertEquals(isNoteFormat(""), false);
  assertEquals(isNoteFormat(null), false);
  assertEquals(isNoteFormat(undefined), false);
});

Deno.test("newNoteBody: a new note is blank, and carries its kind", () => {
  const markdown = newNoteBody("markdown");
  assertEquals(markdown, { title: "", content: "", tags: [], format: "markdown" });
  const groff = newNoteBody("groff");
  assertEquals(groff, { title: "", content: "", tags: [], format: "groff" });
});

Deno.test("newNoteBody: a groff document starts empty, with no skeleton", () => {
  // Deliberate: full immersion. No macro cheat-sheet is planted in the
  // document, because driving groff is the thing being learned.
  const groff = newNoteBody("groff");
  assertEquals(groff.content, "");
});

Deno.test("newNoteBody: an unknown kind falls back to markdown, never to groff", () => {
  assertEquals(newNoteBody("latex").format, "markdown");
  assertEquals(newNoteBody(undefined).format, "markdown");
  assertEquals(newNoteBody("").format, "markdown");
  // A bare request can never smuggle an unintended kind into the database.
  assertEquals(newNoteBody("groff").format, "groff");
});

Deno.test("the dialog wording is English and non-empty", () => {
  assert(NEW_NOTE_DIALOG.question.endsWith("?"));
  assertEquals(NEW_NOTE_DIALOG.cancel, "Cancel");
  for (const text of Object.values(NEW_NOTE_DIALOG)) {
    assert(!/[\u4e00-\u9fff]/.test(text), "the dialog is English only");
  }
});

Deno.test("wiring: the plus button asks before it writes", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/notes-app.js", import.meta.url),
  );
  assert(
    source.includes('from "../utils/new-note-format.js"'),
    "the root component must import the choice helper",
  );

  // createNewNote must not reach the API any more: it only opens the chooser.
  const opener = source.slice(
    source.indexOf("async createNewNote() {"),
    source.indexOf("async confirmNewNote("),
  );
  assert(opener.includes("this.newNoteChooserOpen = true"), "the plus opens the chooser");
  assert(!opener.includes("createNote("), "the plus must not create a note by itself");

  // The answer is what writes, with the chosen kind in the same request.
  const answer = source.slice(
    source.indexOf("async confirmNewNote("),
    source.indexOf("performSearch() {"),
  );
  assert(
    answer.includes("createNote(newNoteBody(format))"),
    "the chosen kind must travel in the create request",
  );

  // Every entry point still reaches the chooser. Three of them bind the method
  // rather than calling it, and the keyboard shortcut calls it - so four
  // references means one definition, three bindings and the shortcut: nobody
  // is left pointing at a method that no longer creates anything.
  const entryPoints = source.match(/this\.createNewNote\b/g) || [];
  assert(entryPoints.length >= 4, "all four entry points must open the chooser");
});

Deno.test("wiring: dismissing the chooser creates nothing", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/notes-app.js", import.meta.url),
  );
  const cancel = source.slice(
    source.indexOf("cancelNewNote() {"),
    source.indexOf("performSearch() {"),
  );
  assert(cancel.includes("this.newNoteChooserOpen = false"), "Cancel closes the chooser");
  assert(
    !cancel.includes("createNote(") && !cancel.includes("NotesApp.createNote"),
    "Cancel must never create a note",
  );

  // The dialog is rendered as a labelled modal with both kinds as buttons.
  const markup = source.slice(
    source.indexOf('class="chooser-overlay"'),
    source.indexOf('class="toast-container"'),
  );
  assert(markup.includes('role="dialog"'), "the chooser is a dialog");
  assert(markup.includes("aria-modal"), "the chooser is modal");
  assert(markup.includes("NOTE_KINDS.map("), "the kinds come from the shared list");
  assert(markup.includes("this.confirmNewNote(kind.format)"), "a kind button answers");
  assert(markup.includes("this.cancelNewNote"), "there is a way out");
});

Deno.test("wiring: the editor's prompt names the kind being written", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/note-editor.js", import.meta.url),
  );
  // deno fmt breaks this attribute over three lines and switches the inner
  // quotes, so match the head of the expression and require BOTH prompts: the
  // pair is what proves the prompt branches on the note's kind.
  assert(
    source.includes('placeholder="${isGroffNote(this.note)'),
    "the textarea prompt must follow the note's kind",
  );
  assert(
    source.includes("Write groff source..."),
    "a groff document asks for groff source",
  );
  assert(
    source.includes("Start writing your note (Markdown supported)..."),
    "a markdown note keeps the prompt it always had",
  );
});

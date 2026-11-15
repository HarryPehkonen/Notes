/**
 * Which text a reader sees, per note format.
 *
 * A groff note stores its source in `content` and the markdown projection the
 * server derived in `content_markdown`. The reader shows the projection; the
 * editor keeps editing the source. These tests pin that selection rule, and
 * that a missing projection never hides the note's text.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  displayText,
  isGroffNote,
  prefersPreview,
  previewPreferenceKey,
} from "../../public/utils/note-text.js";

Deno.test("isGroffNote: only the groff format counts", () => {
  assertEquals(isGroffNote({ format: "groff" }), true);
  assertEquals(isGroffNote({ format: "markdown" }), false);
  assertEquals(isGroffNote({}), false);
  assertEquals(isGroffNote(null), false);
  assertEquals(isGroffNote(undefined), false);
});

Deno.test("displayText: a markdown note reads its own content", () => {
  assertEquals(
    displayText({ format: "markdown", content: "# Title\n\nBody." }),
    "# Title\n\nBody.",
  );
  // A note from before `format` existed is a markdown note.
  assertEquals(displayText({ content: "# Title" }), "# Title");
});

Deno.test("displayText: a groff note reads the projection, never the source", () => {
  const note = {
    format: "groff",
    content: '.RECIPE "Buttermilk pancakes"\n.STEP Whisk.',
    content_markdown: "# Buttermilk pancakes\n\n1. Whisk.",
  };
  assertEquals(displayText(note), "# Buttermilk pancakes\n\n1. Whisk.");
  assert(!displayText(note).includes(".RECIPE"), "a request line must not reach the reader");
});

Deno.test("displayText: a markdown note ignores a stray projection", () => {
  assertEquals(
    displayText({ format: "markdown", content: "source", content_markdown: "projected" }),
    "source",
  );
});

Deno.test("displayText: a groff note with no usable projection shows its source", () => {
  const source = '.TITLE "Half a recipe"';
  assertEquals(displayText({ format: "groff", content: source }), source);
  assertEquals(displayText({ format: "groff", content: source, content_markdown: "" }), source);
  assertEquals(
    displayText({ format: "groff", content: source, content_markdown: "   \n" }),
    source,
  );
  assertEquals(displayText({ format: "groff", content: source, content_markdown: null }), source);
});

Deno.test("displayText: nothing to show is an empty string, never undefined", () => {
  assertEquals(displayText(null), "");
  assertEquals(displayText(undefined), "");
  assertEquals(displayText({}), "");
  assertEquals(displayText({ format: "groff", content: 42, content_markdown: 7 }), "");
});

Deno.test("wiring: the editor's reading preview goes through displayText", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/note-editor.js", import.meta.url),
  );
  assert(
    /import \{[^}]*\bdisplayText\b[^}]*\} from "\.\.\/utils\/note-text\.js";/.test(source),
    "note-editor must import the display helper from the util that owns the rule",
  );
  const readingFallback = source.slice(
    source.indexOf("getMarkdownContent() {"),
    source.indexOf("renderMarkdown(content) {"),
  );
  assert(
    readingFallback.includes("displayText(this.note)"),
    "getMarkdownContent must fall back to displayText",
  );
  assert(
    !readingFallback.includes("this.note?.content"),
    "the reading fallback must not be the raw content any more",
  );
  assert(
    /isGroffNote\(this\.note\)/.test(source),
    "the preview must say when it is showing a projection",
  );
});

Deno.test("prefersPreview: a groff note opens as its projection", () => {
  const groff = { format: "groff", content: '.RECIPE "x"' };
  assertEquals(prefersPreview(groff, { groff: null, markdown: null }), true);
  assertEquals(prefersPreview(groff, { groff: "true" }), true);
  assertEquals(
    prefersPreview(groff, { groff: "false" }),
    false,
    "an explicit choice for groff notes is honoured",
  );
});

Deno.test("prefersPreview: a markdown note still opens in the editor", () => {
  const md = { format: "markdown", content: "# x" };
  assertEquals(prefersPreview(md, { markdown: null }), false);
  assertEquals(prefersPreview(md, { markdown: "true" }), true);
  assertEquals(
    prefersPreview(md, { groff: "true" }),
    false,
    "the groff preference must not leak onto markdown notes",
  );
});

Deno.test("previewPreferenceKey: the preference is stored per format", () => {
  assertEquals(previewPreferenceKey({ format: "groff" }), "notes-groffPreview");
  assertEquals(previewPreferenceKey({ format: "markdown" }), "notes-previewMode");
  assertEquals(previewPreferenceKey({}), "notes-previewMode");
});

Deno.test("the editor opens a note in the mode its format calls for", async () => {
  const source = await Deno.readTextFile("public/components/note-editor.js");
  const open = source.slice(
    source.indexOf("const isSameNote = isSameNoteUpdate"),
    source.indexOf("if (isSameNote) {"),
  );
  assert(open.includes("prefersPreview(this.note"), "opening a note must consult the format rule");
  assert(open.includes("this._previewCache = null"), "a new mode must drop the cached markup");
  assert(
    open.includes('markdown: localStorage.getItem("notes-previewMode")'),
    "the markdown preference must only be the markdown note's input to that rule",
  );
  const toggle = source.slice(
    source.indexOf("togglePreviewMode(toPreview)"),
    source.indexOf("toggleVersionHistory"),
  );
  assert(toggle.includes("previewPreferenceKey(this.note)"), "the toggle must store per format");
});

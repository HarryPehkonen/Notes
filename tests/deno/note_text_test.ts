/**
 * Which text a reader sees, per note format.
 *
 * A groff note stores its source in `content` and the markdown projection the
 * server derived in `content_markdown`. The reader shows the projection; the
 * editor keeps editing the source. These tests pin that selection rule, and
 * that a missing projection never hides the note's text.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { displayText, isGroffNote } from "../../public/utils/note-text.js";

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
    source.includes("import { displayText, isGroffNote }"),
    "note-editor must import the display helper",
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

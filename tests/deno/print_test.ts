import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  checkboxesToPrintGlyphs,
  printDocumentTitle,
  printSource,
} from "../../public/utils/print.js";

// printDocumentTitle tests

Deno.test("printDocumentTitle: uses the note title", () => {
  assertEquals(printDocumentTitle({ title: "Sourdough notes" }), "Sourdough notes");
});

Deno.test("printDocumentTitle: trims surrounding whitespace", () => {
  assertEquals(printDocumentTitle({ title: "  Sourdough notes \n" }), "Sourdough notes");
});

Deno.test("printDocumentTitle: a blank title falls back to a placeholder", () => {
  assertEquals(printDocumentTitle({ title: "   " }), "Untitled note");
});

Deno.test("printDocumentTitle: a missing title falls back to a placeholder", () => {
  assertEquals(printDocumentTitle({ content: "body only" }), "Untitled note");
});

Deno.test("printDocumentTitle: a missing note falls back to a placeholder", () => {
  assertEquals(printDocumentTitle(null), "Untitled note");
  assertEquals(printDocumentTitle(undefined), "Untitled note");
});

Deno.test("printDocumentTitle: a non-string title falls back to a placeholder", () => {
  assertEquals(printDocumentTitle({ title: 42 }), "Untitled note");
});

// printSource tests

const GROFF_NOTE = {
  format: "groff",
  content: '.RECIPE "Seed Crispbread" "about 18 crackers"\n.ING "2 tbsp rosemary"',
  content_markdown: "_about 18 crackers_\n\n- 2 tbsp rosemary",
};

Deno.test("printSource: a groff note prints its projection, not its source", () => {
  assertEquals(printSource(GROFF_NOTE), GROFF_NOTE.content_markdown);
});

Deno.test("printSource: a groff note prints the projection even while the editor holds the source", () => {
  // The regression: a note opens in edit mode, so the editor's text IS the raw
  // groff, and printing it put .RECIPE / .ING on the page.
  assertEquals(printSource(GROFF_NOTE, GROFF_NOTE.content), GROFF_NOTE.content_markdown);
});

Deno.test("printSource: a markdown note prints what the editor holds, unsaved edits included", () => {
  const note = { format: "markdown", content: "saved text" };
  assertEquals(printSource(note, "typed but not saved"), "typed but not saved");
});

Deno.test("printSource: a markdown note with no editor text prints the note", () => {
  const note = { format: "markdown", content: "saved text" };
  assertEquals(printSource(note, undefined), "saved text");
  assertEquals(printSource(note, null), "saved text");
});

Deno.test("printSource: an empty editor still prints empty, not the last saved text", () => {
  assertEquals(printSource({ format: "markdown", content: "saved text" }, ""), "");
});

Deno.test("printSource: a groff note with no projection falls back to its source", () => {
  // Readable beats blank: an older row with no derived projection still prints.
  const note = { format: "groff", content: '.STEP "Roll the pastry."' };
  assertEquals(printSource(note, note.content), note.content);
});

Deno.test("printSource: a note with no format is treated as markdown", () => {
  assertEquals(printSource({ content: "plain" }, "editor text"), "editor text");
});

Deno.test("printSource: a missing note prints nothing", () => {
  assertEquals(printSource(null, undefined), "");
  assertEquals(printSource(undefined, undefined), "");
});

// The rule that broke, pinned in the component that broke it: the print view
// must take its text from printSource, never straight from the editor.

const EDITOR_SOURCE = await Deno.readTextFile(
  new URL("../../public/components/note-editor.js", import.meta.url),
);

/** The body of a method: its header through its closing brace, or null. */
function methodBody(source, name) {
  const match = source.match(new RegExp(`  ${name}\\(\\) \\{[\\s\\S]*?\\n  \\}`));
  return match ? match[0] : "";
}

Deno.test("_renderPrintDoc: prints the note through printSource", () => {
  const body = methodBody(EDITOR_SOURCE, "_renderPrintDoc");
  // The slice must behave: an empty slice would satisfy the assertion below
  // for the wrong reason, so pin its shape too.
  assertEquals(body.length > 0 && body.length < 800, true);
  assertEquals(body.includes("printSource("), true);
});

Deno.test("_renderPrintDoc: no longer renders the editor's text directly", () => {
  const body = methodBody(EDITOR_SOURCE, "_renderPrintDoc");
  assertEquals(body.includes("renderMarkdown("), true);
  assertEquals(body.includes("renderMarkdown(this.getMarkdownContent())"), false);
});

// checkboxesToPrintGlyphs tests

Deno.test("checkboxesToPrintGlyphs: an unchecked box becomes an empty glyph", () => {
  assertEquals(
    checkboxesToPrintGlyphs('<li><input type="checkbox" data-cb-index="0"> Buy flour</li>'),
    '<li><span class="print-checkbox">[ ]</span> Buy flour</li>',
  );
});

Deno.test("checkboxesToPrintGlyphs: a checked box becomes a ticked glyph", () => {
  assertEquals(
    checkboxesToPrintGlyphs('<li><input type="checkbox" data-cb-index="0" checked> Done</li>'),
    '<li><span class="print-checkbox">[x]</span> Done</li>',
  );
});

Deno.test('checkboxesToPrintGlyphs: DOMPurify\'s checked="" serialization counts as checked', () => {
  // DOMPurify re-serializes the sanitized DOM, so the boolean attribute comes
  // back as checked="" rather than the bare `checked` the parser emitted.
  assertEquals(
    checkboxesToPrintGlyphs('<input type="checkbox" data-cb-index="1" checked="">'),
    '<span class="print-checkbox">[x]</span>',
  );
  assertEquals(
    checkboxesToPrintGlyphs('<input type="checkbox" checked="checked">'),
    '<span class="print-checkbox">[x]</span>',
  );
});

Deno.test("checkboxesToPrintGlyphs: attribute order and quoting do not matter", () => {
  assertEquals(
    checkboxesToPrintGlyphs("<input checked data-cb-index=2 type='checkbox' />"),
    '<span class="print-checkbox">[x]</span>',
  );
  assertEquals(
    checkboxesToPrintGlyphs("<INPUT TYPE=CHECKBOX>"),
    '<span class="print-checkbox">[ ]</span>',
  );
});

Deno.test("checkboxesToPrintGlyphs: converts every box in the document", () => {
  assertEquals(
    checkboxesToPrintGlyphs(
      '<ul><li><input type="checkbox" data-cb-index="0" checked> a</li>' +
        '<li><input type="checkbox" data-cb-index="1"> b</li></ul>',
    ),
    '<ul><li><span class="print-checkbox">[x]</span> a</li>' +
      '<li><span class="print-checkbox">[ ]</span> b</li></ul>',
  );
});

Deno.test("checkboxesToPrintGlyphs: leaves other inputs alone", () => {
  const html = '<input type="text" value="checked">';
  assertEquals(checkboxesToPrintGlyphs(html), html);
});

Deno.test("checkboxesToPrintGlyphs: a checkbox written about in a code block stays text", () => {
  // Markdown code blocks arrive escaped, so there is no tag to convert.
  const html = '<pre><code>&lt;input type="checkbox"&gt;</code></pre>';
  assertEquals(checkboxesToPrintGlyphs(html), html);
});

Deno.test("checkboxesToPrintGlyphs: html without checkboxes is unchanged", () => {
  const html = "<h1>Title</h1><p>Body</p>";
  assertEquals(checkboxesToPrintGlyphs(html), html);
});

Deno.test("checkboxesToPrintGlyphs: an empty string stays empty", () => {
  assertEquals(checkboxesToPrintGlyphs(""), "");
});

Deno.test("checkboxesToPrintGlyphs: a non-string value is returned untouched", () => {
  assertEquals(checkboxesToPrintGlyphs(null), null);
  assertEquals(checkboxesToPrintGlyphs(undefined), undefined);
});

Deno.test("checkboxesToPrintGlyphs: a value containing 'checked' does not tick the box", () => {
  // Only the boolean attribute counts - not the word appearing in some other
  // attribute's value.
  assertEquals(
    checkboxesToPrintGlyphs('<input type="checkbox" aria-label="checked?">'),
    '<span class="print-checkbox">[ ]</span>',
  );
});

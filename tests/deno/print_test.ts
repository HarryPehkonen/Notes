import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { checkboxesToPrintGlyphs, printDocumentTitle } from "../../public/utils/print.js";

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

Deno.test("checkboxesToPrintGlyphs: DOMPurify's checked=\"\" serialization counts as checked", () => {
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
  const html = "<pre><code>&lt;input type=\"checkbox\"&gt;</code></pre>";
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

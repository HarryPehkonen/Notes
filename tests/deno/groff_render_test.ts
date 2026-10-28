// End-to-end tests for the groff renderer. These spawn the real groff, which is
// why `deno task test` carries --allow-run=groff (that one binary, nothing else).
//
// The unit tests in groff_sanitize_test.ts prove the allowlist; these prove the
// things only a real render can: that a good document becomes a PDF, that a
// refused document never reaches groff, and that groff's exit code is not taken
// as the verdict -- measured on groff 1.23.0, ".sp 999999999" reports
// "error: numeric overflow" and STILL exits 0.

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { GroffDocumentError, renderPdf } from "../../server/groff/render.js";

const GOOD = `.RECIPE "Test document" "one page"
.SECTION "Ingredients"
.ING "190 g flour"
.ING "1 egg"
.SECTION "Method"
.STEP "Whisk it."
.NOTE "Rest it."
.PP
And that is all.
`;

Deno.test("render: a good document becomes a PDF", async () => {
  const { pdf, warnings } = await renderPdf(GOOD);
  assert(pdf.length > 1000, `expected a real PDF, got ${pdf.length} bytes`);
  // %PDF magic, so a caller cannot cache an error page as a document
  assertEquals(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
  assertEquals(warnings, []);
});

Deno.test("render: the first real recipe renders", async () => {
  const source = await Deno.readTextFile("groff/examples/buttermilk-pancakes.ms");
  const { pdf } = await renderPdf(source);
  assert(pdf.length > 1000);
  assertEquals(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
});

Deno.test("render: a document with .so is refused and groff is never run", async () => {
  const err = await assertRejects(
    () => renderPdf('.SECTION "x"\n.so /etc/hostname\n'),
    GroffDocumentError,
  );
  assertEquals(err.kind, "rejected");
  assertStringIncludes(err.message, 'request "so" is not allowed');
  assertEquals(err.violations.length, 1);
  assertEquals(err.violations[0].line, 2);
});

Deno.test("render: groff's exit code is not the verdict (error with exit 0)", async () => {
  // The document passes the allowlist -- .sp is allowed -- but overflow is a real
  // groff error. If this ever stops throwing, someone has "simplified" the
  // renderer into trusting the exit code, and a broken render becomes a cached PDF.
  const err = await assertRejects(() => renderPdf(".sp 999999999\n"), GroffDocumentError);
  assertEquals(err.kind, "failed");
  assertStringIncludes(err.message, "numeric overflow");
});

Deno.test("render: warnings are returned, not swallowed, and do not fail the render", async () => {
  const { pdf, warnings } = await renderPdf(".sp abc\n.PP\nStill renders.\n");
  assert(pdf.length > 1000);
  assert(warnings.length > 0, "expected the numeric-expression warning to come back");
  assertStringIncludes(warnings.join("\n"), "expected numeric expression");
});

Deno.test("render: the rendered PDF embeds its fonts", async () => {
  // The stock Times/Symbol setup produced UNembedded fonts (pdffonts showed
  // emb no), so a reader or printer substituted its own faces. The DejaVu faces
  // built by scripts/groff-fonts.sh are embedded, and /FontFile in the bytes is
  // what says so. If this fails, the fonts were not installed (-F) or the
  // embedding flag was dropped, and the typography quietly depends on the
  // reader again.
  const { pdf } = await renderPdf(GOOD);
  const raw = new TextDecoder("latin1").decode(pdf);
  assertStringIncludes(raw, "/FontFile");
});

Deno.test("render: the house style file is pure ASCII", async () => {
  // groff reads a macro file with the default input encoding rather than -Kutf8,
  // so a single literal non-ASCII character in a COMMENT produces
  // "warning: invalid input character code" on every render. A stray circled
  // digit in house.tmac did exactly that.
  const style = await Deno.readTextFile("groff/house.tmac");
  const bad = [...style].filter((c) => c.charCodeAt(0) > 127);
  assertEquals(bad, [], `non-ASCII characters in groff/house.tmac: ${JSON.stringify(bad)}`);
});

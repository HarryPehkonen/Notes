import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { decodeGroffEscapes, projectGroff, quotedArguments } from "../../server/groff/project.js";
import { stripMarkdown } from "../../server/database/client.js";

Deno.test("projectGroff: the title and subtitle come from .RECIPE", () => {
  const out = projectGroff('.RECIPE "Buttermilk pancakes" "breakfast for two"\n');
  assertEquals(out.title, "Buttermilk pancakes");
  assertEquals(out.subtitle, "breakfast for two");
  assertEquals(out.markdown, "_breakfast for two_");
  assertEquals(out.warnings, []);
});

Deno.test("projectGroff: a document with no .RECIPE leaves the title empty", () => {
  const out = projectGroff('.SECTION "Ingredients"\n');
  assertEquals(out.title, "");
  assertEquals(out.markdown, "## Ingredients");
});

Deno.test("projectGroff: ingredients become one list, steps become another", () => {
  const out = projectGroff([
    '.SECTION "Ingredients"',
    '.ING "flour"',
    '.ING "salt"',
    '.SECTION "Method"',
    '.STEP "Mix."',
    '.STEP "Fry."',
  ].join("\n"));
  assertEquals(
    out.markdown,
    [
      "## Ingredients",
      "",
      "- flour",
      "- salt",
      "",
      "## Method",
      "",
      "1. Mix.",
      "1. Fry.",
    ].join("\n"),
  );
});

Deno.test("projectGroff: a list of the other kind starts a new list, not a merged one", () => {
  // Without the blank line markdown reads a bullet list and a numbered list as
  // one list, and the steps come out numbered wrong.
  const out = projectGroff('.ING "flour"\n.STEP "Mix."\n');
  assertEquals(out.markdown, "- flour\n\n1. Mix.");
});

Deno.test("projectGroff: .NOTE is a blockquote, .CODE a fence that keeps its lines", () => {
  const out = projectGroff('.NOTE "Rest it."\n.CODE\ngroff -ms file\n.ENDCODE\n');
  assertEquals(out.markdown, "> Rest it.\n\n```\ngroff -ms file\n```");
  assertEquals(out.warnings, []);
});

Deno.test("projectGroff: .nf is fenced too, and .fi closes it", () => {
  const out = projectGroff(".nf\na    b\n.fi\n");
  assertEquals(out.markdown, "```\na    b\n```");
  assertEquals(out.warnings, []);
});

Deno.test("projectGroff: prose lines are joined so markdown reflows them", () => {
  const out = projectGroff("One line\nand its continuation.\n\nA second paragraph.\n");
  assertEquals(out.markdown, "One line\nand its continuation.\n\nA second paragraph.");
});

Deno.test("projectGroff: a request outside the vocabulary is dropped and reported", () => {
  // The guard would refuse this document outright; the projection still has to
  // be honest about what it could not carry over.
  const out = projectGroff('.SH "Sneaky"\n.PP\nText.\n');
  assertEquals(out.markdown, "Text.");
  assertEquals(out.warnings.length, 1);
  assertStringIncludes(out.warnings[0], "line 1");
  assertStringIncludes(out.warnings[0], ".SH");
});

Deno.test("projectGroff: an unbalanced fence is reported either way", () => {
  assertEquals(projectGroff(".ENDCODE\n").warnings.length, 1);
  const unclosed = projectGroff(".CODE\nx\n");
  assertEquals(unclosed.warnings.length, 1);
  assertStringIncludes(unclosed.warnings[0], "never closed");
});

Deno.test("decodeGroffEscapes: unicode escapes become the characters they name", () => {
  assertEquals(decodeGroffEscapes("\\[u00BD] tsp"), "\u00BD tsp");
  assertEquals(decodeGroffEscapes("190 \\[u00B0]C"), "190 \u00B0C");
  assertEquals(decodeGroffEscapes("a \\(em b"), "a \u2014 b");
  assertEquals(decodeGroffEscapes("\\[u1F600]"), "\u{1F600}");
});

Deno.test("decodeGroffEscapes: typographic escapes are dropped, never printed", () => {
  assertEquals(decodeGroffEscapes("\\fBbold\\fR text"), "bold text");
});

Deno.test("quotedArguments: quoted arguments only, escaped quotes included", () => {
  assertEquals(quotedArguments('"one" "two"'), ["one", "two"]);
  assertEquals(quotedArguments('a "b" c'), ["b"]);
  assertEquals(quotedArguments('"say \\"hi\\""'), ['say "hi"']);
  assertEquals(quotedArguments(""), []);
});

Deno.test("projectGroff: the example recipe projects cleanly and survives the search path", async () => {
  const source = await Deno.readTextFile("groff/examples/buttermilk-pancakes.ms");
  const out = projectGroff(source);

  assertEquals(out.warnings, []);
  assertEquals(out.title, "Buttermilk pancakes");
  assertStringIncludes(out.subtitle, "25 minutes");
  assertStringIncludes(out.markdown, "## Ingredients");
  assertStringIncludes(out.markdown, "- 190 g all-purpose flour");
  assertStringIncludes(out.markdown, "1. Whisk the flour");
  assertStringIncludes(out.markdown, "> Rest the batter");
  assertStringIncludes(out.markdown, "\u00BD tsp fine salt");
  assertStringIncludes(out.markdown, "190 \u00B0C");

  // No request line may survive into the reading copy.
  const leaked = out.markdown.split("\n").filter((line) => /^\.[A-Za-z]/.test(line));
  assertEquals(leaked, []);

  // Search reads the projection's plain text, so the words have to survive it.
  const plain = stripMarkdown(out.markdown);
  assertStringIncludes(plain, "190 g all-purpose flour");
  assertStringIncludes(plain, "baking powder");
  assertStringIncludes(plain, "Rest the batter");
});

Deno.test("stripMarkdown leaves the blockquote marker in the plain text", () => {
  // Pinning a known cosmetic: stripMarkdown strips lists and headings but not
  // blockquotes, so a projected .NOTE leaves a ">" in the plain text that the
  // search index is built from. It costs nothing at search time and the marker
  // is visible in a snippet, so it is recorded rather than papered over.
  assertStringIncludes(stripMarkdown("> Rest it."), ">");
});

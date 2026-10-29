import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  describeViolations,
  MAX_SOURCE_BYTES,
  sanitizeGroff,
} from "../../server/groff/sanitize.js";

// The attacks below are not hypothetical. Each one was run through groff 1.23.0
// on 2026-10-28 to find out what the renderer actually does with it; the comment
// on each says which. Two of them are stopped by groff itself, and the guard is
// here because the others are not.

Deno.test("sanitizeGroff: a legitimate document passes untouched", () => {
  const doc = `
.RECIPE "Buttermilk pancakes" "breakfast for two"
.SECTION "Ingredients"
.ING "190 g all-purpose flour"
.ING "1 egg"
.SECTION "Method"
.STEP "Whisk the dry ingredients."
.NOTE "Rest the batter for ten minutes."
.PP
Then fry them.
`;
  const result = sanitizeGroff(doc);
  assertEquals(result.ok, true);
  assertEquals(result.violations, []);
});

Deno.test("sanitizeGroff: .DOC is allowed -- the generic document opener", () => {
  const result = sanitizeGroff(
    '.DOC "Iterating over a vector" "the forms worth using"\n.SECTION "Range-based for"\n',
  );
  assertEquals(result.ok, true);
  assertEquals(result.violations, []);
});

Deno.test("sanitizeGroff: .so is refused (groff safer mode does NOT stop it)", () => {
  // Verified: groff 1.23.0 rendered ".so /etc/hostname" without complaint and
  // printed the contents into the PDF.
  const result = sanitizeGroff('.SECTION "x"\n.so /etc/hostname\n');
  assertEquals(result.ok, false);
  assertEquals(result.violations.length, 1);
  assertEquals(result.violations[0].line, 2);
  assertEquals(result.violations[0].reason, 'request "so" is not allowed in a document');
});

Deno.test("sanitizeGroff: .mso is refused", () => {
  const result = sanitizeGroff(".mso evil.tmac\n");
  assertEquals(result.ok, false);
  assertEquals(result.violations[0].reason, 'request "mso" is not allowed in a document');
});

Deno.test("sanitizeGroff: the ' control character is watched too", () => {
  // ' is the no-break control character, and a request after it runs just the same.
  const result = sanitizeGroff("'so /etc/passwd\n");
  assertEquals(result.ok, false);
  assertEquals(result.violations[0].reason, 'request "so" is not allowed in a document');
});

Deno.test("sanitizeGroff: shell requests are refused, belt and braces", () => {
  // groff's safer mode already refuses these with an explicit error (verified),
  // but a renderer that ever gained -U must not suddenly become a shell.
  for (const line of [".sy echo SY_RAN", ".pso echo PSO_RAN", ".pi whoami"]) {
    const result = sanitizeGroff(line + "\n");
    assertEquals(result.ok, false, `${line} should be refused`);
  }
});

Deno.test("sanitizeGroff: other file-touching requests are refused", () => {
  for (const line of [".open fd /etc/passwd", ".opena fd", ".nx /etc/passwd", ".rd x"]) {
    const result = sanitizeGroff(line + "\n");
    assertEquals(result.ok, false, `${line} should be refused`);
  }
});

Deno.test("sanitizeGroff: conditionals cannot smuggle a request", () => {
  // .if is not on the allowlist, so the whole line dies at the door rather than
  // needing the guard to understand what the conditional would have done.
  const result = sanitizeGroff(".if 1 .sy rm -rf /\n");
  assertEquals(result.ok, false);
  assertEquals(result.violations[0].reason, 'request "if" is not allowed in a document');
});

Deno.test("sanitizeGroff: \\X and \\! are refused as escapes", () => {
  for (const [doc, probe] of [["text \\X'pdfmark'", "\\X"], ["text \\!raw", "\\!"]]) {
    const result = sanitizeGroff(doc + "\n");
    assertEquals(result.ok, false, `${probe} should be refused`);
    assertEquals(result.violations[0].reason.includes(probe), true);
  }
});

Deno.test("sanitizeGroff: a bypass attempt deep in an otherwise valid document is located", () => {
  const doc = [
    '.RECIPE "Innocent"',
    '.SECTION "Ingredients"',
    '.ING "flour"',
    ".so /etc/shadow",
    '.SECTION "Method"',
  ].join("\n");
  const result = sanitizeGroff(doc);
  assertEquals(result.ok, false);
  assertEquals(result.violations.length, 1);
  assertEquals(result.violations[0].line, 4);
});

Deno.test("sanitizeGroff: a dot that is not at the start of a line is just text", () => {
  const result = sanitizeGroff("Costs $2.99 and .so is a word here.\n");
  assertEquals(result.ok, true);
});

Deno.test("sanitizeGroff: comments are inert and allowed", () => {
  const result = sanitizeGroff('.\\" a note to the next reader\n');
  assertEquals(result.ok, true);
});

Deno.test("sanitizeGroff: ms styling macros are allowed, sectioning shortcuts are not", () => {
  // .PP/.B/.I are fine; .SH and .NH would let a document set its own typography
  // and step outside the house style.
  assertEquals(sanitizeGroff(".PP\n.B bold\n.I italic\n").ok, true);
  assertEquals(sanitizeGroff('.SH "Does it myself"\n').ok, false);
  assertEquals(sanitizeGroff(".NH 1\n").ok, false);
});

Deno.test("sanitizeGroff: STYLE is allowed, but a document still cannot set raw typography", () => {
  // A document may name an appearance SET; it may not name a font, a size, a
  // measure or a margin. house.tmac looks the name up in a fixed list, so this
  // is a lookup rather than a hole in the style-comes-from-the-command-line rule,
  // and an unknown name aborts the render rather than being ignored.
  assertEquals(sanitizeGroff(".STYLE palatino\n").ok, true);
  assertEquals(sanitizeGroff(".STYLE dejavu\n").ok, true);
  const raw = [
    ".ds FONTBODY T",
    ".nr PS 30",
    ".nr LL 9i",
    ".nr PO 0",
    ".fam H",
    ".ft B",
    ".ps 30",
    ".ll 9i",
    ".po 0",
    ".vs 40",
  ];
  for (const line of raw) {
    assertEquals(sanitizeGroff(line + "\n").ok, false, `${line} should be refused`);
  }
});

Deno.test("sanitizeGroff: a runaway document is refused on size", () => {
  const result = sanitizeGroff("x".repeat(MAX_SOURCE_BYTES + 1));
  assertEquals(result.ok, false);
  assertEquals(result.violations[0].line, 0);
  assertEquals(result.violations[0].reason.includes("limit"), true);
});

Deno.test("sanitizeGroff: empty and null input is not an error", () => {
  assertEquals(sanitizeGroff("").ok, true);
  assertEquals(sanitizeGroff(null).ok, true);
  assertEquals(sanitizeGroff(undefined).ok, true);
  assertEquals(sanitizeGroff("\n\n\n").ok, true);
});

Deno.test("describeViolations: names the line and the reason", () => {
  const result = sanitizeGroff('.SECTION "x"\n.so /etc/hostname\n');
  assertEquals(
    describeViolations(result.violations),
    'line 2: request "so" is not allowed in a document',
  );
});

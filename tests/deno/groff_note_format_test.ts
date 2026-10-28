import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  derivedNoteFields,
  needsReprojection,
  normalizeNoteFormat,
  PROJECTION_VERSION,
} from "../../server/groff/note-format.js";

Deno.test("normalizeNoteFormat: groff is groff, everything else is markdown", () => {
  assertEquals(normalizeNoteFormat("groff"), "groff");
  assertEquals(normalizeNoteFormat("markdown"), "markdown");
  // Never half-convert: an unknown or missing value leaves the note as it was.
  assertEquals(normalizeNoteFormat("Groff"), "markdown");
  assertEquals(normalizeNoteFormat("grof"), "markdown");
  assertEquals(normalizeNoteFormat(undefined), "markdown");
  assertEquals(normalizeNoteFormat(null), "markdown");
});

Deno.test("derivedNoteFields: a markdown note derives nothing", () => {
  const out = derivedNoteFields({ format: "markdown", content: "# Title\n\nBody." });
  assertEquals(out.title, null);
  assertEquals(out.content_markdown, null);
  assertEquals(out.projection_version, null);
  assertEquals(out.plainSource, "# Title\n\nBody.");
  assertEquals(out.warnings, []);
});

Deno.test("derivedNoteFields: a groff note derives its projection, and search reads that", () => {
  const out = derivedNoteFields({
    format: "groff",
    content: '.RECIPE "Buttermilk pancakes" "about 25 minutes"\n.SECTION "Method"\n.STEP "Mix."\n',
  });
  assertEquals(out.title, "Buttermilk pancakes");
  assertEquals(out.projection_version, PROJECTION_VERSION);
  assertEquals(out.content_markdown, "_about 25 minutes_\n\n## Method\n\n1. Mix.");
  // The plain text that search indexes is the projection's, not the source's:
  // indexing the source would index ".RECIPE" and ".STEP".
  assertEquals(out.plainSource, out.content_markdown);
  assertEquals(out.warnings, []);
});

Deno.test("derivedNoteFields: a groff note with no .RECIPE keeps the title it was given", () => {
  // null means "leave the caller's title alone", which is what a document that
  // does not name itself is asking for.
  const out = derivedNoteFields({ format: "groff", content: '.SECTION "Notes"\n' });
  assertEquals(out.title, null);
  assertEquals(out.content_markdown, "## Notes");
});

Deno.test("derivedNoteFields: a projection that dropped something says what", () => {
  const out = derivedNoteFields({ format: "groff", content: '.SH "Mine"\nBody.\n' });
  assertEquals(out.warnings.length, 1);
  assertEquals(out.content_markdown, "Body.");
});

Deno.test("derivedNoteFields: content that is not a string projects to empty, never throws", () => {
  const out = derivedNoteFields({ format: "groff", content: null });
  assertEquals(out.content_markdown, "");
  assertEquals(out.plainSource, "");
});

Deno.test("needsReprojection: only a groff note behind the current projection", () => {
  assertEquals(needsReprojection({ format: "groff", projection_version: null }), true);
  assertEquals(needsReprojection({ format: "groff", projection_version: 0 }), true);
  assertEquals(
    needsReprojection({ format: "groff", projection_version: PROJECTION_VERSION }),
    false,
  );
  // A newer stamp than this code knows is not something to downgrade.
  assertEquals(
    needsReprojection({ format: "groff", projection_version: PROJECTION_VERSION + 1 }),
    false,
  );
  assertEquals(needsReprojection({ format: "markdown", projection_version: null }), false);
  assertEquals(needsReprojection({ format: "markdown" }), false);
});

Deno.test("PROJECTION_VERSION is a positive integer, and bumping it is a deliberate act", () => {
  // Grows by one when a change to the projection should re-render existing notes;
  // scripts/reproject-notes.ts is what acts on it.
  assertEquals(Number.isInteger(PROJECTION_VERSION), true);
  assertEquals(PROJECTION_VERSION > 0, true);
});

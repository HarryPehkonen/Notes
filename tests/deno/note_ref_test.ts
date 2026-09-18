/**
 * The note id shown on screen: "#18" next to the timestamp in the list, and
 * in front of "Updated ..." in the editor. Terminal tooling already exposes
 * the id; this is the pure formatting rule plus the wiring guards that keep
 * both call sites (list has two - grid and list view) actually using it.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { formatNoteRef } from "../../public/utils/note-ref.js";

Deno.test("formatNoteRef: a positive integer id becomes #id", () => {
  assertEquals(formatNoteRef({ id: 18 }), "#18");
  assertEquals(formatNoteRef({ id: 1 }), "#1");
});

Deno.test("formatNoteRef: a digit string id becomes #id too", () => {
  assertEquals(formatNoteRef({ id: "18" }), "#18");
});

Deno.test("formatNoteRef: no note, no id, no crash", () => {
  assertEquals(formatNoteRef(null), "");
  assertEquals(formatNoteRef(undefined), "");
  assertEquals(formatNoteRef({}), "");
});

Deno.test("formatNoteRef: zero and negative ids are not usable", () => {
  assertEquals(formatNoteRef({ id: 0 }), "");
  assertEquals(formatNoteRef({ id: -1 }), "");
  assertEquals(formatNoteRef({ id: "-1" }), "");
});

Deno.test("formatNoteRef: fractional and NaN ids are not usable", () => {
  assertEquals(formatNoteRef({ id: 1.5 }), "");
  assertEquals(formatNoteRef({ id: NaN }), "");
});

Deno.test("formatNoteRef: non-numeric strings are not usable", () => {
  assertEquals(formatNoteRef({ id: "" }), "");
  assertEquals(formatNoteRef({ id: "abc" }), "");
});

Deno.test("formatNoteRef: an already-prefixed id is not the caller's job to double-handle", () => {
  assertEquals(formatNoteRef({ id: "#18" }), "");
});

Deno.test("formatNoteRef: booleans, arrays and objects are not usable ids", () => {
  assertEquals(formatNoteRef({ id: true }), "");
  assertEquals(formatNoteRef({ id: false }), "");
  assertEquals(formatNoteRef({ id: [18] }), "");
  assertEquals(formatNoteRef({ id: { value: 18 } }), "");
});

Deno.test("formatNoteRef: never renders #undefined or #NaN", () => {
  for (const note of [null, undefined, {}, { id: undefined }, { id: NaN }, { id: "abc" }]) {
    const label = formatNoteRef(note);
    assert(!label.includes("undefined"), `unexpected: ${label}`);
    assert(!label.includes("NaN"), `unexpected: ${label}`);
  }
});

Deno.test("wiring: note-list.js renders the id in both grid and list views", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/note-list.js", import.meta.url),
  );
  assert(
    source.includes('from "../utils/note-ref.js"'),
    "note-list.js must import formatNoteRef",
  );
  // The ref is computed once per card (`const ref = formatNoteRef(note)`) and
  // reused, so the call site itself is singular - what must not regress is
  // that BOTH the list-view and grid-view branches actually render it. One
  // view is the known trap: easy to wire the other and forget it.
  const renderSites = source.match(/class="note-id"/g) || [];
  assertEquals(
    renderSites.length,
    2,
    "expected the id span in both the list-view and grid-view branches",
  );
});

Deno.test("wiring: note-editor.js renders the id before 'Updated' in the doc-meta line", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/note-editor.js", import.meta.url),
  );
  assert(
    source.includes('from "../utils/note-ref.js"'),
    "note-editor.js must import formatNoteRef",
  );
  const callSites = source.match(/formatNoteRef\(/g) || [];
  assertEquals(callSites.length, 1, "expected exactly one formatNoteRef( call site");

  const metaStart = source.indexOf('class="doc-meta"');
  assert(metaStart !== -1, "doc-meta block not found");
  const metaRegion = source.slice(metaStart, metaStart + 400);
  const refIndex = metaRegion.indexOf("noteRef");
  const updatedIndex = metaRegion.indexOf("Updated");
  assert(refIndex !== -1, "noteRef not rendered in doc-meta region");
  assert(updatedIndex !== -1, "Updated text not found in doc-meta region");
  assert(refIndex < updatedIndex, "the id must render before the word 'Updated'");
});

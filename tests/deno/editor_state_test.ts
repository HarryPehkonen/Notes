import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { isSameNoteUpdate, resolveSaveContent } from "../../public/utils/editor-state.js";

// resolveSaveContent tests

Deno.test("resolveSaveContent: edit mode uses the live textarea value", () => {
  assertEquals(resolveSaveContent("typing now", "stale buffer", "persisted"), "typing now");
});

Deno.test("resolveSaveContent: preview mode falls back to the editing buffer", () => {
  assertEquals(resolveSaveContent(undefined, "typed earlier", "persisted"), "typed earlier");
});

Deno.test("resolveSaveContent: tag-only change in preview mode falls back to the note", () => {
  // No textarea (preview mode) and the user never typed, so the buffer is null.
  // The save must still go out, carrying the note's persisted content.
  assertEquals(resolveSaveContent(undefined, null, "persisted"), "persisted");
});

Deno.test("resolveSaveContent: no content anywhere resolves to null", () => {
  assertEquals(resolveSaveContent(undefined, null, null), null);
});

Deno.test("resolveSaveContent: everything undefined resolves to null", () => {
  assertEquals(resolveSaveContent(undefined, undefined, undefined), null);
});

Deno.test("resolveSaveContent: an emptied textarea is content, not a missing value", () => {
  assertEquals(resolveSaveContent("", "typed earlier", "persisted"), "");
});

Deno.test("resolveSaveContent: an emptied buffer is content, not a missing value", () => {
  assertEquals(resolveSaveContent(undefined, "", "persisted"), "");
});

Deno.test("resolveSaveContent: an empty note body resolves to the empty string", () => {
  assertEquals(resolveSaveContent(undefined, null, ""), "");
});

// isSameNoteUpdate tests

Deno.test("isSameNoteUpdate: the same note re-rendered after a save", () => {
  assertEquals(isSameNoteUpdate({ id: 7, content: "a" }, { id: 7, content: "b" }), true);
});

Deno.test("isSameNoteUpdate: switching to a different note", () => {
  assertEquals(isSameNoteUpdate({ id: 7 }, { id: 8 }), false);
});

Deno.test("isSameNoteUpdate: the first render has no previous note", () => {
  assertEquals(isSameNoteUpdate(undefined, { id: 7 }), false);
  assertEquals(isSameNoteUpdate(null, { id: 7 }), false);
});

Deno.test("isSameNoteUpdate: closing the editor leaves no current note", () => {
  assertEquals(isSameNoteUpdate({ id: 7 }, null), false);
  assertEquals(isSameNoteUpdate({ id: 7 }, undefined), false);
});

Deno.test("isSameNoteUpdate: a note without an id never matches", () => {
  assertEquals(isSameNoteUpdate({}, {}), false);
});

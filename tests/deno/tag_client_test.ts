/**
 * Structural guards for the client half of the tag change.
 *
 * The defect these lock out: tag taps used to accumulate in `selectedTags` and
 * ride along in the note's save payload as a full list, which is a
 * read-modify-write - a save built from a stale list silently dropped tags
 * another device had just added.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

const editor = await Deno.readTextFile(
  new URL("../../public/components/note-editor.js", import.meta.url),
);
const app = await Deno.readTextFile(
  new URL("../../public/app.js", import.meta.url),
);

Deno.test("editor: the save payload no longer carries tags", () => {
  const start = editor.indexOf("const updates = {");
  assert(start > -1, "save payload not found");
  const payload = editor.slice(start, start + 300);
  assert(
    !payload.includes("tags:"),
    "the note save must not rewrite the tag list - tags persist on tap",
  );
});

Deno.test("editor: a tag tap goes to the per-tag endpoint, not to the sync queue", () => {
  assertStringIncludes(editor, "globalThis.NotesApp.setNoteTag(");
  const toggle = editor.slice(
    editor.indexOf("async toggleTag(tagId)"),
    editor.indexOf("async toggleTag(tagId)") + 1600,
  );
  assert(
    !toggle.includes("saveNoteWithSync"),
    "a tag tap must not go through the content sync manager",
  );
  assert(
    !toggle.includes("markAsChanged()"),
    "a persisted tag tap must not mark the editor dirty",
  );
});

Deno.test("editor: a tag tap is optimistic and reverts on failure", () => {
  const toggle = editor.slice(editor.indexOf("async toggleTag(tagId)"));
  assertStringIncludes(toggle.slice(0, 1600), "applyTagToggle(");
  assertStringIncludes(toggle.slice(0, 2400), "this.selectedTags = previous");
});

Deno.test("editor: hasChanges ignores tags, so a tap cannot look unsaved", () => {
  const start = editor.indexOf("hasChanges() {");
  const body = editor.slice(start, start + 900);
  assert(!body.includes("TagIds"), "tag ids must not appear in the dirty check");
});

Deno.test("app: setNoteTag exists and picks the verb from the helper", () => {
  assertStringIncludes(app, "setNoteTag(noteId, tagId, attach)");
  assertStringIncludes(app, 'from "./utils/tag-endpoint.js"');
});

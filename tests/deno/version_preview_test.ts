/**
 * Read-only version preview + the Current row: structural guards.
 *
 * The behavior worth locking down is not "does it look right" but these:
 *   - a past version can never be saved (the editor bails out while viewing one)
 *   - the overlay does not put another version's text into the editable fields
 *   - the three labelled ways out exist, because a full-screen read-only view
 *     with no escape route is a trap
 * The row data itself (Current first, newest-first ordering) is unit-tested in
 * version_list_test.ts.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const editor = await Deno.readTextFile(
  new URL("../../public/components/note-editor.js", import.meta.url),
);

Deno.test("previewRow is a reactive property, or the view would never re-render", () => {
  assertStringIncludes(editor, "previewRow: { type: Object }");
});

Deno.test("the history panel builds rows through the pure helper", () => {
  assertStringIncludes(editor, 'import { buildVersionRows } from "../utils/version-list.js"');
  assertStringIncludes(editor, "buildVersionRows(this.note, this.versions)");
});

Deno.test("a past version can never be saved: both save paths bail out", () => {
  assertStringIncludes(editor, "if (this.previewRow) return false;");
  assertStringIncludes(editor, "if (this.previewRow) return;");
});

Deno.test("the editable fields never hold another version's text", () => {
  // The preview is an overlay: no binding writes version content into .doc-title
  // or .content-textarea, so no stray save can write it back.
  assertEquals(/.value="\$\{this\.previewRow/.test(editor), false);
});

Deno.test("the preview is rendered by the component", () => {
  assertStringIncludes(editor, "_renderVersionPreview()");
  assertStringIncludes(editor, 'class="version-preview"');
  assertStringIncludes(editor, 'role="dialog"');
});

Deno.test("the old version is shown read-only, with its date and title", () => {
  assertStringIncludes(editor, "read only");
  assertStringIncludes(editor, 'renderMarkdown(row.content || "")');
  assertStringIncludes(editor, "version-preview-title");
});

Deno.test("two labelled ways out exist: restore and back", () => {
  assertStringIncludes(editor, "Restore - make editable");
  assertStringIncludes(editor, "Back to current");
});

Deno.test("copying is selecting: no Copy button, and the body is selectable", () => {
  // His call: "Copy text doesn't need to be a button. I'll just select and copy
  // myself." So the affordance that must exist is selectable text - not a button
  // that could rot away from the design.
  assertEquals(/>Copy text</.test(editor), false);
  assertEquals(/copyVersionText/.test(editor), false);
  assertStringIncludes(editor, "user-select: text;");
  assertStringIncludes(editor, "-webkit-user-select: text;");
});

Deno.test("restoring clears the preview, so the content is editable again", () => {
  const clears = editor.match(/this\.previewRow = null;/g) ?? [];
  assert(
    clears.length >= 3,
    `expected at least 3 previewRow resets (close, restore, note switch), found ${clears.length}`,
  );
});

Deno.test("the Current row is labelled by the helper and offers no Restore", () => {
  assertStringIncludes(editor, "row.label");
  assertStringIncludes(editor, "history-current-tag");
  assertStringIncludes(editor, "this.previewRow && this.previewRow.id === row.id");
});

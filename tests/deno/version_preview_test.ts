/**
 * Version browsing: structural guards.
 *
 * What must stay true (each of these was a decision, not an accident):
 *   - an old version can never be saved over the live note
 *   - the editable fields never hold another version's text
 *   - the bar is labelled: Newer / Older / Restore This Version / Back to Current
 *   - Newer sits LEFT of Older (his call, opposite to my first guess)
 *   - the arrows dead-end at the oldest/newest recorded version instead of
 *     silently dropping him into read/write Current
 *   - stepping keeps the reading position
 *   - tapping the read-only body does nothing (there is no tap-to-close any more)
 * Row data and stepping arithmetic live in version_list_test.ts / version_step_test.ts.
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

const editor = await Deno.readTextFile(
  new URL("../../public/components/note-editor.js", import.meta.url),
);

Deno.test("previewRow is a reactive property, or the view would never re-render", () => {
  assertStringIncludes(editor, "previewRow: { type: Object }");
});

Deno.test("the history panel builds rows through the pure helper", () => {
  assertStringIncludes(editor, 'from "../utils/version-list.js"');
  assertStringIncludes(editor, "buildVersionRows(this.note, this.versions)");
});

Deno.test("a past version can never be saved: both save paths bail out", () => {
  assertStringIncludes(editor, "if (this.previewRow) return false;");
  assertStringIncludes(editor, "if (this.previewRow) return;");
});

Deno.test("the editable fields never hold another version's text", () => {
  assertEquals(/.value="\$\{this\.previewRow/.test(editor), false);
});

Deno.test("the canvas steps aside so the preview sits below the topbar", () => {
  // Below the topbar - not over it - so the clock stays reachable while an old
  // version is on screen. Static flex child, so the positioned topbar paints above.
  assertStringIncludes(editor, '?hidden="${!!this.previewRow}"');
  assertStringIncludes(editor, ".canvas[hidden]");
  assertEquals(/\.version-preview\s*\{[^}]*position:\s*fixed/.test(editor), false);
});

Deno.test("the bar carries the four labelled controls", () => {
  assertStringIncludes(editor, "Restore This Version");
  assertStringIncludes(editor, "Back to Current");
  assert(/>\s*Newer\s*</.test(editor), "Newer button label missing");
  assert(/>\s*Older\s*</.test(editor), "Older button label missing");
});

Deno.test("Newer is left of Older, as he specified", () => {
  const bar = editor.slice(
    editor.indexOf('class="version-preview-actions"'),
    editor.indexOf("</div>", editor.indexOf('class="version-preview-actions"')),
  );
  assert(bar.length > 0, "version-preview-actions block not found");
  const newer = bar.indexOf("Newer");
  const older = bar.indexOf("Older");
  assert(newer !== -1 && older !== -1, "both arrows must be inside the actions block");
  assert(newer < older, `expected Newer before Older, got Newer@${newer} Older@${older}`);
});

Deno.test("the arrows dead-end rather than jumping into read/write Current", () => {
  assertStringIncludes(editor, '?disabled="${!this.canStepNewer}"');
  assertStringIncludes(editor, '?disabled="${!this.canStepOlder}"');
  assertStringIncludes(editor, 'stepVersionRow(this._versionRows, this.previewRow?.id, "newer")');
  assertStringIncludes(editor, 'stepVersionRow(this._versionRows, this.previewRow?.id, "older")');
});

Deno.test("stepping keeps the reading position", () => {
  assertStringIncludes(editor, "const scrollTop = body ? body.scrollTop : 0;");
  assertStringIncludes(editor, "if (after) after.scrollTop = scrollTop;");
});

Deno.test("tapping the read-only body does nothing (no tap-to-close)", () => {
  const bodyStart = editor.indexOf('class="version-preview-body"');
  assert(bodyStart !== -1, "preview body not found");
  const bodyTag = editor.slice(bodyStart, editor.indexOf(">", bodyStart) + 1);
  assertEquals(bodyTag.includes("@click"), false, "body must not be clickable any more");
  // And the old gesture must not linger anywhere in the preview.
  assertEquals(/version-preview-body[\s\S]{0,200}?@click/.test(editor), false);
});

Deno.test("the old version is rendered read-only, greyed, and selectable", () => {
  assertStringIncludes(editor, 'renderMarkdown(row.content || "")');
  assertStringIncludes(editor, "user-select: text;");
  assertStringIncludes(editor, "-webkit-user-select: text;");
  assertStringIncludes(editor, "read only");
});

Deno.test("restoring clears the preview, so the content is editable again", () => {
  const clears = editor.match(/this\.previewRow = null;/g) ?? [];
  assert(clears.length >= 3, `expected >= 3 previewRow resets, found ${clears.length}`);
});

Deno.test("the Current row is labelled by the helper and offers no Restore", () => {
  assertStringIncludes(editor, "row.label");
  assertStringIncludes(editor, "history-current-tag");
  assertStringIncludes(editor, "this.previewRow && this.previewRow.id === row.id");
});

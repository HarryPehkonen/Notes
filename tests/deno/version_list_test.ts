/**
 * Version-history rows: "Current" first, then the recorded versions, newest first.
 *
 * Why "Current" is a row of its own: the database trigger records the state a note
 * had BEFORE a change, so the newest recorded version is never the note you are
 * looking at. A list that implied "newest = now" would be lying by one edit.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildVersionRows, CURRENT_ROW_ID } from "../../public/utils/version-list.js";

const note = {
  id: 42,
  title: "Live title",
  content: "Live content",
  updated_at: "2026-09-12T10:00:00Z",
};

const versions = [
  { id: 3, version_number: 3, title: "third", content: "c3", created_at: "2026-09-12T09:00:00Z" },
  { id: 2, version_number: 2, title: "second", content: "c2", created_at: "2026-09-11T09:00:00Z" },
  { id: 1, version_number: 1, title: "first", content: "c1", created_at: "2026-09-10T09:00:00Z" },
];

Deno.test("the first row is Current, carrying the note's live content", () => {
  const rows = buildVersionRows(note, versions);
  assertEquals(rows[0].id, CURRENT_ROW_ID);
  assertEquals(rows[0].label, "Current");
  assertEquals(rows[0].isCurrent, true);
  assertEquals(rows[0].title, "Live title");
  assertEquals(rows[0].content, "Live content");
  assertEquals(rows[0].when, note.updated_at);
});

Deno.test("recorded versions follow, newest first, labelled by number", () => {
  const rows = buildVersionRows(note, versions);
  assertEquals(rows.slice(1).map((r) => r.id), [3, 2, 1]);
  assertEquals(rows.slice(1).map((r) => r.label), ["Version 3", "Version 2", "Version 1"]);
  assertEquals(rows.slice(1).every((r) => r.isCurrent === false), true);
  assertEquals(rows[1].content, "c3");
});

Deno.test("sorts defensively: an unordered API response still reads newest first", () => {
  const shuffled = [versions[1], versions[2], versions[0]];
  const rows = buildVersionRows(note, shuffled);
  assertEquals(rows.slice(1).map((r) => r.versionNumber), [3, 2, 1]);
});

Deno.test("a version carries what a preview needs: title, content, date", () => {
  const row = buildVersionRows(note, versions)[2];
  assertEquals(row.title, "second");
  assertEquals(row.content, "c2");
  assertEquals(row.when, "2026-09-11T09:00:00Z");
});

Deno.test("no versions yet still yields the Current row (list is never empty)", () => {
  const rows = buildVersionRows(note, []);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].isCurrent, true);
});

Deno.test("no note yields only the recorded versions", () => {
  const rows = buildVersionRows(null, versions);
  assertEquals(rows.length, 3);
  assertEquals(rows.some((r) => r.isCurrent), false);
});

Deno.test("ignores junk entries rather than rendering blank rows", () => {
  const rows = buildVersionRows(note, [null, { version_number: 9 }, versions[0]]);
  assertEquals(rows.length, 2);
  assertEquals(rows[1].id, 3);
});

Deno.test("defaults missing title/content to empty strings, not undefined", () => {
  const rows = buildVersionRows(note, [{ id: 7, version_number: 7 }]);
  assertEquals(rows[1].title, "");
  assertEquals(rows[1].content, "");
  assertEquals(rows[1].when, null);
});

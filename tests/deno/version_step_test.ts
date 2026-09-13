/**
 * Stepping between versions with the Older / Newer arrows.
 *
 * Rows come from buildVersionRows: index 0 is Current, then recorded versions
 * newest -> oldest. The arrows move only WITHIN the recorded versions - getting
 * back to the live note is "Back to Current", an explicit choice, so "Newer" from
 * the newest recorded version is a dead end rather than a surprise mode change
 * into read/write.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildVersionRows,
  CURRENT_ROW_ID,
  stepVersionRow,
} from "../../public/utils/version-list.js";

const note = { id: 42, title: "live", content: "live body", updated_at: "2026-09-12T12:00:00Z" };
const versions = [
  { id: 5, version_number: 5, title: "v5", content: "c5", created_at: "2026-09-12T11:00:00Z" },
  { id: 4, version_number: 4, title: "v4", content: "c4", created_at: "2026-09-12T10:00:00Z" },
  { id: 3, version_number: 3, title: "v3", content: "c3", created_at: "2026-09-12T09:00:00Z" },
];
const rows = buildVersionRows(note, versions);

Deno.test("rows are Current, then newest-first recorded versions", () => {
  assertEquals(rows.map((r) => r.id), [CURRENT_ROW_ID, 5, 4, 3]);
});

Deno.test("Older steps back in time; Newer steps forward", () => {
  assertEquals(stepVersionRow(rows, 5, "older").id, 4);
  assertEquals(stepVersionRow(rows, 4, "older").id, 3);
  assertEquals(stepVersionRow(rows, 4, "newer").id, 5);
});

Deno.test("Newer from the newest recorded version is a dead end (not Current)", () => {
  assertEquals(stepVersionRow(rows, 5, "newer"), null);
  // and explicitly: the arrows never land on Current
  for (const id of [5, 4, 3]) {
    for (const dir of ["older", "newer"]) {
      const row = stepVersionRow(rows, id, dir);
      if (row) assertEquals(row.isCurrent, false);
    }
  }
});

Deno.test("Older from the oldest version is a dead end", () => {
  assertEquals(stepVersionRow(rows, 3, "older"), null);
});

Deno.test("stepping from Current goes to the newest recorded version", () => {
  assertEquals(stepVersionRow(rows, CURRENT_ROW_ID, "older").id, 5);
});

Deno.test("an unknown row, junk input, or a missing direction yields nothing", () => {
  assertEquals(stepVersionRow(rows, 999, "older"), null);
  assertEquals(stepVersionRow(null, 5, "older"), null);
  assertEquals(stepVersionRow(rows, 5, "sideways"), null);
  assertEquals(stepVersionRow([], 5, "older"), null);
});

Deno.test("a single recorded version has no neighbours at all", () => {
  const one = buildVersionRows(note, [versions[0]]);
  assertEquals(stepVersionRow(one, 5, "older"), null);
  assertEquals(stepVersionRow(one, 5, "newer"), null);
});

Deno.test("no recorded versions means nothing to step to", () => {
  const none = buildVersionRows(note, []);
  assertEquals(stepVersionRow(none, CURRENT_ROW_ID, "older"), null);
});

Deno.test("titles and content travel with the row that is stepped to", () => {
  const row = stepVersionRow(rows, 5, "older");
  assertEquals(row.title, "v4");
  assertEquals(row.content, "c4");
  assertEquals(row.when, "2026-09-12T10:00:00Z");
  assert(row.label.includes("Version"));
});

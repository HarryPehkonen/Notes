/**
 * Mapping a notes response onto the list state.
 *
 * Every path that loads notes receives the same envelope, and each must read
 * the rows *and* `meta.total` / `meta.hasMore` from it. The initial load did
 * not: it kept only `data.notes`, so a freshly loaded page showed "20 Notes"
 * with no "Load more" button, while the same data fetched through a filter
 * showed "20 of 65". One reader, one place to get it wrong.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { readNotesPage } from "../../public/utils/notes-response.js";

Deno.test("readNotesPage: a list payload", () => {
  const page = readNotesPage({
    data: { notes: [{ id: 1 }, { id: 2 }] },
    meta: { total: 65, hasMore: true },
  });
  assertEquals(page.notes.length, 2);
  assertEquals(page.total, 65);
  assertEquals(page.hasMore, true);
});

Deno.test("readNotesPage: a search payload carries its rows under results", () => {
  const page = readNotesPage({
    data: { results: [{ id: 3 }] },
    meta: { total: 3, hasMore: false },
  });
  assertEquals(page.notes.length, 1);
  assertEquals(page.total, 3);
  assertEquals(page.hasMore, false);
});

Deno.test("readNotesPage: no meta means an unknown total and no next page", () => {
  const page = readNotesPage({ data: { notes: [{ id: 1 }] } });
  assertEquals(page.notes.length, 1);
  assertEquals(page.total, null);
  assertEquals(page.hasMore, false);
});

Deno.test("readNotesPage: a total of zero is a real answer, not a missing one", () => {
  const page = readNotesPage({ data: { notes: [] }, meta: { total: 0, hasMore: false } });
  assertEquals(page.total, 0);
});

Deno.test("readNotesPage: a malformed payload is not a crash", () => {
  for (const payload of [null, undefined, {}, { data: null }, { data: {} }]) {
    const page = readNotesPage(payload);
    assertEquals(page.notes, []);
    assertEquals(page.total, null);
    assertEquals(page.hasMore, false);
  }
});

Deno.test("both loading paths read the page through this helper", async () => {
  // The regression this guards: the initial load and the filter path drifting
  // apart, one of them silently dropping meta.
  const source = await Deno.readTextFile(
    new URL("../../public/components/notes-app.js", import.meta.url),
  );
  assert(
    source.includes('from "../utils/notes-response.js"'),
    "notes-app.js should import the helper",
  );
  assert(
    !source.includes("this.notes = notesResult.data"),
    "the initial load must not take only the rows",
  );
  assert(
    source.includes("this._applyNotesPage(notesResult)"),
    "the initial load must apply the whole page",
  );
  const uses = source.match(/_applyNotesPage\(/g)?.length ?? 0;
  assert(
    uses >= 6,
    `the initial load, four filter branches and the definition are expected (found ${uses})`,
  );
});

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { DatabaseClient } from "../../server/database/client.js";

/**
 * Call pruneNoteVersions against a stub that captures the SQL and parameters,
 * without constructing a DatabaseClient (no connection pool, no DB).
 * @param {number} [keepCount] - Versions to keep per note; omitted to test the default
 * @param {number} [rowCount] - rowCount the stubbed query reports back
 */
async function capturePrune(keepCount?: number, rowCount = 0) {
  const captured: { sql: string; params: unknown[] } = { sql: "", params: [] };
  const stub = {
    // deno-lint-ignore require-await
    query: async (sql: string, params: unknown[] = []) => {
      captured.sql = sql;
      captured.params = params;
      return { rows: [], rowCount };
    },
  };
  const deleted = keepCount === undefined
    ? await DatabaseClient.prototype.pruneNoteVersions.call(stub)
    : await DatabaseClient.prototype.pruneNoteVersions.call(stub, keepCount);
  return { ...captured, deleted };
}

Deno.test("pruneNoteVersions: deletes from note_versions", async () => {
  const { sql } = await capturePrune(50);
  assert(/DELETE\s+FROM\s+note_versions/i.test(sql), "SQL must delete from note_versions");
});

Deno.test("pruneNoteVersions: ranks versions per note with a window function", async () => {
  const { sql } = await capturePrune(50);
  assert(sql.includes("PARTITION BY note_id"), "SQL must partition the ranking by note_id");
  assert(/ROW_NUMBER\s*\(\s*\)\s*OVER/i.test(sql), "SQL must rank rows with ROW_NUMBER() OVER");
  assert(/ORDER BY[^)]*DESC/i.test(sql), "SQL must order newest-first so the newest are kept");
});

Deno.test("pruneNoteVersions: keeps the newest keepCount via an rn > $1 predicate", async () => {
  const { sql } = await capturePrune(50);
  assert(/rn\s*>\s*\$1/i.test(sql), "SQL must drop only rows ranked beyond the keepCount");
});

Deno.test("pruneNoteVersions: passes the keepCount as a bound parameter", async () => {
  const { params } = await capturePrune(50);
  assertEquals(params, [50]);
  const { params: params10 } = await capturePrune(10);
  assertEquals(params10, [10]);
});

Deno.test("pruneNoteVersions: never interpolates the keepCount into the SQL", async () => {
  const { sql } = await capturePrune(50);
  assert(!sql.includes("50"), "keepCount must be parameterized, not concatenated");
});

Deno.test("pruneNoteVersions: defaults to keeping 50 versions per note", async () => {
  const { params } = await capturePrune();
  assertEquals(params, [50]);
});

Deno.test("pruneNoteVersions: returns the number of deleted rows", async () => {
  const { deleted } = await capturePrune(50, 137);
  assertEquals(deleted, 137);
});

Deno.test("pruneNoteVersions: reports 0 when the driver omits rowCount", async () => {
  const stub = {
    // deno-lint-ignore require-await
    query: async () => ({ rows: [] }),
  };
  assertEquals(await DatabaseClient.prototype.pruneNoteVersions.call(stub, 50), 0);
});

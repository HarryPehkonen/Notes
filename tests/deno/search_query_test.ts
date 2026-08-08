import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildPrefixTsQuery, DatabaseClient } from "../../server/database/client.js";

// buildPrefixTsQuery tests

Deno.test("buildPrefixTsQuery: single token gets a prefix marker", () => {
  assertEquals(buildPrefixTsQuery("furnace"), "furnace:*");
});

Deno.test("buildPrefixTsQuery: multiple tokens are ANDed, each with a prefix marker", () => {
  assertEquals(buildPrefixTsQuery("furnace filter"), "furnace:* & filter:*");
  assertEquals(buildPrefixTsQuery("furnace filter size"), "furnace:* & filter:* & size:*");
});

Deno.test("buildPrefixTsQuery: collapses extra whitespace", () => {
  assertEquals(buildPrefixTsQuery("  furnace   filter  "), "furnace:* & filter:*");
  assertEquals(buildPrefixTsQuery("furnace\tfilter\nsize"), "furnace:* & filter:* & size:*");
});

Deno.test("buildPrefixTsQuery: returns empty string for empty input", () => {
  assertEquals(buildPrefixTsQuery(""), "");
  assertEquals(buildPrefixTsQuery("   "), "");
});

Deno.test("buildPrefixTsQuery: returns empty string for missing input", () => {
  assertEquals(buildPrefixTsQuery(undefined), "");
  assertEquals(buildPrefixTsQuery(null), "");
});

Deno.test("buildPrefixTsQuery: strips tsquery operators from tokens", () => {
  // sanitizeQuery normally removes these first; the helper must not emit them
  // either way, or Postgres raises "syntax error in tsquery".
  assertEquals(buildPrefixTsQuery("furn!ace fil|ter"), "furnace:* & filter:*");
  assertEquals(buildPrefixTsQuery("it's"), "its:*");
});

Deno.test("buildPrefixTsQuery: drops tokens that are entirely operators", () => {
  assertEquals(buildPrefixTsQuery("furnace &&&"), "furnace:*");
  assertEquals(buildPrefixTsQuery("!!!"), "");
});

Deno.test("buildPrefixTsQuery: never emits a bare prefix marker", () => {
  for (const input of ["", "   ", "&", "furnace", "furnace filter", " a  b "]) {
    const built = buildPrefixTsQuery(input);
    assert(!built.includes(" :*"), `bare prefix marker in ${JSON.stringify(built)}`);
    assert(!built.startsWith(":*"), `bare prefix marker in ${JSON.stringify(built)}`);
  }
});

// searchNotes SQL tests

/**
 * Call searchNotes against a stub that captures the SQL and parameters,
 * without constructing a DatabaseClient (no connection pool, no DB).
 * @param {string} query - User search query
 */
async function captureSearchQuery(query: string) {
  const captured: { sql: string; params: unknown[] } = { sql: "", params: [] };
  const stub = {
    // deno-lint-ignore require-await
    query: async (sql: string, params: unknown[] = []) => {
      captured.sql = sql;
      captured.params = params;
      return { rows: [] };
    },
  };
  await DatabaseClient.prototype.searchNotes.call(stub, 7, query);
  return captured;
}

Deno.test("searchNotes: no longer concatenates ':*' onto the whole query in SQL", async () => {
  const { sql } = await captureSearchQuery("furnace filter");
  assert(!sql.includes("$5 || ':*'"), "SQL still concatenates ':*' onto the full query");
  assert(sql.includes("to_tsquery('english', $5)"), "SQL should pass the prebuilt tsquery as $5");
});

Deno.test("searchNotes: passes a per-token prefix tsquery as $5", async () => {
  const { params } = await captureSearchQuery("furnace filter");
  assertEquals(params[4], "furnace:* & filter:*");
});

Deno.test("searchNotes: single-word queries keep working", async () => {
  const { params } = await captureSearchQuery("furnace");
  assertEquals(params[4], "furnace:*");
});

Deno.test("searchNotes: blank query leaves $5 empty so the guard skips the tsquery", async () => {
  const { sql, params } = await captureSearchQuery("   ");
  assertEquals(params[4], "");
  assert(sql.includes("$5 != ''"), "the empty-query guard must stay in place");
});

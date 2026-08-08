import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { testing } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { parseSearchQuery } from "../../server/api/search-query.js";
import { createSearchRouter } from "../../server/api/search.js";
import { DatabaseClient } from "../../server/database/client.js";

// parseSearchQuery tests

Deno.test("parseSearchQuery: bare words become tokens", () => {
  assertEquals(parseSearchQuery("led home"), { tokens: ["led", "home"], tagTokens: [] });
});

Deno.test("parseSearchQuery: '#' prefixed words become tagTokens", () => {
  assertEquals(parseSearchQuery("led #home"), { tokens: ["led"], tagTokens: ["home"] });
});

Deno.test("parseSearchQuery: is order-insensitive", () => {
  assertEquals(parseSearchQuery("#home led"), parseSearchQuery("led #home"));
});

Deno.test("parseSearchQuery: a lone tag token yields no bare tokens", () => {
  assertEquals(parseSearchQuery("#home"), { tokens: [], tagTokens: ["home"] });
});

Deno.test("parseSearchQuery: collapses surrounding and repeated whitespace", () => {
  assertEquals(parseSearchQuery("  led   home  "), { tokens: ["led", "home"], tagTokens: [] });
  assertEquals(parseSearchQuery("led\t#home\nbulb"), {
    tokens: ["led", "bulb"],
    tagTokens: ["home"],
  });
});

Deno.test("parseSearchQuery: repeated '#' prefixes collapse to one tag name", () => {
  // Documented choice: every leading '#' is stripped, the remainder is the name.
  assertEquals(parseSearchQuery("###home"), { tokens: [], tagTokens: ["home"] });
});

Deno.test("parseSearchQuery: a nameless '#' is dropped entirely", () => {
  // Documented choice: '#' with no name is neither a text token nor a tag filter.
  assertEquals(parseSearchQuery("#"), { tokens: [], tagTokens: [] });
  assertEquals(parseSearchQuery("led #"), { tokens: ["led"], tagTokens: [] });
});

Deno.test("parseSearchQuery: empty input yields empty results", () => {
  assertEquals(parseSearchQuery(""), { tokens: [], tagTokens: [] });
  assertEquals(parseSearchQuery("   "), { tokens: [], tagTokens: [] });
});

Deno.test("parseSearchQuery: missing input yields empty results", () => {
  assertEquals(parseSearchQuery(undefined), { tokens: [], tagTokens: [] });
  assertEquals(parseSearchQuery(null), { tokens: [], tagTokens: [] });
});

Deno.test("parseSearchQuery: preserves token case for the caller to fold", () => {
  assertEquals(parseSearchQuery("LED #Home"), { tokens: ["LED"], tagTokens: ["Home"] });
});

// searchNotes SQL tests (hybrid text-or-tag matching)

/**
 * Call searchNotes against a stub that captures the SQL and parameters,
 * without constructing a DatabaseClient (no connection pool, no DB).
 * @param {string} query - User search query (bare tokens only)
 * @param {number[]} tagIds - Strict '#tag' filters, resolved to tag ids
 */
async function captureSearchQuery(query: string, tagIds?: number[]) {
  const captured: { sql: string; params: unknown[] } = { sql: "", params: [] };
  const stub = {
    // deno-lint-ignore require-await
    query: async (sql: string, params: unknown[] = []) => {
      captured.sql = sql;
      captured.params = params;
      return { rows: [] };
    },
  };
  await DatabaseClient.prototype.searchNotes.call(stub, 7, query, 20, tagIds);
  return captured;
}

Deno.test("searchNotes: matches per token instead of ILIKE-ing the whole query", async () => {
  const { sql, params } = await captureSearchQuery("led home");
  assert(
    !sql.includes("n.title ILIKE $4 OR n.content ILIKE $4"),
    "SQL still ILIKEs the whole query string",
  );
  assert(
    !params.includes("%led home%"),
    "the whole query is still passed as a single ILIKE pattern",
  );
  assert(sql.includes("unnest($4::text[])"), "SQL should unnest the bare tokens for per-token AND");
  assert(
    sql.includes("cardinality($4::text[])"),
    "every bare token must match (count = cardinality)",
  );
});

Deno.test("searchNotes: passes the bare tokens as an array parameter", async () => {
  const { params } = await captureSearchQuery("led home");
  assertEquals(params[3], ["led", "home"]);
});

Deno.test("searchNotes: a bare token may match a tag name instead of the text", async () => {
  const { sql } = await captureSearchQuery("led home");
  assert(sql.includes("note_tags"), "the per-token check must reach note_tags");
  assert(sql.includes("t2.name ILIKE"), "the per-token check must match tag names");
});

Deno.test("searchNotes: escapes ILIKE metacharacters in bare tokens", async () => {
  const { params } = await captureSearchQuery("100%");
  assertEquals(params[3], ["100\\%"]);
});

Deno.test("searchNotes: keeps the per-token prefix tsquery as $5", async () => {
  const { sql, params } = await captureSearchQuery("led home");
  assert(sql.includes("to_tsquery('english', $5)"), "SQL should pass the prebuilt tsquery as $5");
  assertEquals(params[4], "led:* & home:*");
});

Deno.test("searchNotes: no tag filters means an empty array and a cardinality guard", async () => {
  const { sql, params } = await captureSearchQuery("led home");
  assertEquals(params[5], []);
  assert(
    sql.includes("cardinality($6::int[]) = 0"),
    "an empty tag filter must not restrict the result set",
  );
});

Deno.test("searchNotes: strict '#tag' filters are passed as an int array parameter", async () => {
  const { sql, params } = await captureSearchQuery("led", [3, 4]);
  assertEquals(params[5], [3, 4]);
  assert(sql.includes("tag_id = ANY($6::int[])"), "tag filters must be applied by id");
  assert(
    sql.includes("COUNT(DISTINCT nt.tag_id) = cardinality($6::int[])"),
    "multiple '#tag' filters must be ANDed, not ORed",
  );
});

Deno.test("searchNotes: a tag-only query still runs with no bare tokens", async () => {
  const { params } = await captureSearchQuery("", [3]);
  assertEquals(params[1], "");
  assertEquals(params[3], []);
  assertEquals(params[4], "");
  assertEquals(params[5], [3]);
});

// GET /api/search routing tests

/**
 * A route as exposed by Oak's Router iterator
 */
type RouteLike = {
  path: string;
  methods: string[];
  middleware: Array<(ctx: unknown) => Promise<void>>;
};

/**
 * Pull the GET /api/search handler out of the search router
 */
function getSearchHandler() {
  const router = createSearchRouter() as unknown as Iterable<RouteLike>;
  for (const route of router) {
    if (route.path === "/" && route.methods.includes("GET")) {
      return route.middleware[route.middleware.length - 1];
    }
  }
  throw new Error("No GET / route registered on the search router");
}

/**
 * Build a fake db that records tag lookups, searchNotes and getNotes calls
 * @param {Array} tagRows - Rows the tag-name lookup should return
 */
function fakeSearchDb(tagRows: Array<{ id: number; name: string }> = []) {
  const calls: {
    query: Array<{ sql: string; params: unknown[] }>;
    searchNotes: unknown[][];
    getNotes: unknown[][];
  } = { query: [], searchNotes: [], getNotes: [] };

  return {
    calls,
    // deno-lint-ignore require-await
    query: async (sql: string, params: unknown[] = []) => {
      calls.query.push({ sql, params });
      return { rows: tagRows };
    },
    // deno-lint-ignore require-await
    searchNotes: async (...args: unknown[]) => {
      calls.searchNotes.push(args);
      return [{ id: 1, title: "Bathroom mirror light bulbs" }];
    },
    // deno-lint-ignore require-await
    getNotes: async (...args: unknown[]) => {
      calls.getNotes.push(args);
      return [{ id: 1, title: "Bathroom mirror light bulbs" }];
    },
  };
}

/**
 * Run GET /api/search with the given raw query against a fake db
 * @param {string} q - Raw search query
 * @param {Object} db - Fake database client
 */
async function runSearch(q: string, db: unknown) {
  const ctx = testing.createMockContext({
    method: "GET",
    path: `/?q=${encodeURIComponent(q)}`,
  });
  const state = ctx.state as unknown as Record<string, unknown>;
  state.user = { id: 7 };
  state.db = db;
  await getSearchHandler()(ctx);
  return ctx;
}

Deno.test("GET /api/search: a plain query searches text and tags with no tag lookup", async () => {
  const db = fakeSearchDb();
  const ctx = await runSearch("led home", db);

  assertEquals(db.calls.query.length, 0, "a bare query needs no tag-name lookup");
  assertEquals(db.calls.searchNotes.length, 1);
  assertEquals(db.calls.searchNotes[0][0], 7);
  assertEquals(db.calls.searchNotes[0][1], "led home");
  assertEquals(db.calls.searchNotes[0][3], []);
  assertEquals((ctx.response.body as { success: boolean }).success, true);
});

Deno.test("GET /api/search: '#tag' alongside text becomes a strict tag filter", async () => {
  const db = fakeSearchDb([{ id: 42, name: "home" }]);
  await runSearch("led #home", db);

  assertEquals(db.calls.query.length, 1, "the tag name must be resolved to an id");
  assertEquals(db.calls.query[0].params[0], 7);
  assertEquals(db.calls.query[0].params[1], ["home"]);
  assertEquals(db.calls.searchNotes.length, 1);
  assertEquals(db.calls.searchNotes[0][1], "led");
  assertEquals(db.calls.searchNotes[0][3], [42]);
});

Deno.test("GET /api/search: token order does not matter", async () => {
  const db = fakeSearchDb([{ id: 42, name: "home" }]);
  await runSearch("#home led", db);

  assertEquals(db.calls.searchNotes[0][1], "led");
  assertEquals(db.calls.searchNotes[0][3], [42]);
});

Deno.test("GET /api/search: tag names are matched case-insensitively", async () => {
  const db = fakeSearchDb([{ id: 42, name: "home" }]);
  await runSearch("led #Home", db);

  assertEquals(db.calls.query[0].params[1], ["home"]);
});

Deno.test("GET /api/search: an unknown '#tag' matches nothing", async () => {
  const db = fakeSearchDb([]);
  const ctx = await runSearch("led #nosuchtag", db);

  assertEquals(db.calls.searchNotes.length, 0, "no point searching for an impossible filter");
  const body = ctx.response.body as { success: boolean; data: { results: unknown[] } };
  assertEquals(body.success, true);
  assertEquals(body.data.results, []);
});

Deno.test("GET /api/search: a lone '#tag' keeps using the tag-filter path", async () => {
  const db = fakeSearchDb([{ id: 42, name: "home" }]);
  const ctx = await runSearch("#home", db);

  assertEquals(db.calls.getNotes.length, 1, "'#home' alone must behave exactly as before");
  assertEquals(db.calls.getNotes[0][0], 7);
  assertEquals((db.calls.getNotes[0][1] as { tags: number[] }).tags, [42]);
  assertEquals((ctx.response.body as { data: { results: unknown[] } }).data.results.length, 1);
});

Deno.test("GET /api/search: a nameless '#' matches nothing instead of everything", async () => {
  const db = fakeSearchDb([]);
  const ctx = await runSearch("#", db);

  assertEquals(db.calls.searchNotes.length, 0);
  assertEquals(db.calls.getNotes.length, 0);
  const body = ctx.response.body as { success: boolean; data: { results: unknown[] } };
  assertEquals(body.success, true);
  assertEquals(body.data.results, []);
});

Deno.test("GET /api/search: the reported query stays the raw user input", async () => {
  const db = fakeSearchDb([{ id: 42, name: "home" }]);
  const ctx = await runSearch("led #home", db);

  assertEquals((ctx.response.body as { data: { query: string } }).data.query, "led #home");
});

Deno.test("searchNotes: keeps user scoping and the archived filter", async () => {
  const { sql, params } = await captureSearchQuery("led home");
  assertEquals(params[0], 7);
  assertEquals(
    sql.match(/n\.user_id = \$1/g)?.length,
    2,
    "both CTEs must stay scoped to the user",
  );
  assertEquals(
    sql.match(/NOT n\.is_archived/g)?.length,
    2,
    "both CTEs must keep excluding archived notes",
  );
});

/**
 * Semantic search must honour tag filters.
 *
 * Before this feature the semantic path was an exclusive switch that dropped
 * tag filters silently while the UI still showed them as selected. These tests
 * pin down the two halves: the pure query builder (no DB) and the handler
 * wiring on GET /api/search.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { testing } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { buildSemanticSearchQuery, parseTagIds } from "../../server/api/semantic.js";
import { createSearchRouter } from "../../server/api/search.js";

// parseTagIds - the `tags` query parameter, same shape as /api/search/advanced

Deno.test("parseTagIds: a comma-separated list becomes an id array", () => {
  assertEquals(parseTagIds("1,2,3"), [1, 2, 3]);
});

Deno.test("parseTagIds: surrounding whitespace and empty slots are ignored", () => {
  assertEquals(parseTagIds(" 1 , 2 ,, 3 ,"), [1, 2, 3]);
});

Deno.test("parseTagIds: a single id needs no comma", () => {
  assertEquals(parseTagIds("7"), [7]);
});

Deno.test("parseTagIds: duplicates collapse so the HAVING count stays correct", () => {
  assertEquals(parseTagIds("2,2,5,2"), [2, 5]);
});

Deno.test("parseTagIds: nothing to filter on yields an empty array", () => {
  assertEquals(parseTagIds(""), []);
  assertEquals(parseTagIds("   "), []);
  assertEquals(parseTagIds(null), []);
  assertEquals(parseTagIds(undefined), []);
});

Deno.test("parseTagIds: only positive integers survive", () => {
  assertEquals(parseTagIds("abc"), []);
  assertEquals(parseTagIds("0"), []);
  assertEquals(parseTagIds("-4"), []);
  assertEquals(parseTagIds("1.5"), []);
  assertEquals(parseTagIds("1,abc,2"), [1, 2]);
});

// buildSemanticSearchQuery - pure SQL construction, unit-testable without a DB

Deno.test("buildSemanticSearchQuery: with no tags it is the plain nearest-neighbour search", () => {
  const { sql, params } = buildSemanticSearchQuery({
    vector: "[0.1,0.2]",
    userId: 7,
    limit: 20,
    offset: 0,
    tagIds: [],
  });

  assert(sql.includes("note_embeddings"), "reads the embedding table");
  assert(sql.includes("ORDER BY e.embedding <=> $1::vector"), "nearest neighbours first");
  assert(!sql.includes("nt.tag_id = ANY("), "no tag filter when no tags are selected");
  assertEquals(params, ["[0.1,0.2]", 7, 20, 0]);
});

Deno.test("buildSemanticSearchQuery: tags become an AND-all membership filter", () => {
  const { sql, params } = buildSemanticSearchQuery({
    vector: "[0.1,0.2]",
    userId: 7,
    limit: 20,
    offset: 0,
    tagIds: [3, 5],
  });

  assert(sql.includes("FROM note_tags nt"), "the tag filter reads note_tags");
  assert(sql.includes("nt.tag_id = ANY($5::int[])"), "tag ids are bound as $5");
  assert(
    sql.includes("HAVING COUNT(DISTINCT nt.tag_id) = $6"),
    "every returned note must carry ALL the tags, not any of them",
  );
  assertEquals(params, ["[0.1,0.2]", 7, 20, 0, [3, 5], 2]);
});

Deno.test("buildSemanticSearchQuery: the tag filter never disturbs the similarity ranking", () => {
  const { sql } = buildSemanticSearchQuery({
    vector: "[0.1]",
    userId: 7,
    limit: 10,
    offset: 0,
    tagIds: [3],
  });

  const orderIndex = sql.indexOf("ORDER BY e.embedding <=> $1::vector");
  const tagIndex = sql.indexOf("nt.tag_id = ANY(");
  assert(tagIndex !== -1 && orderIndex !== -1);
  assert(tagIndex < orderIndex, "the tag filter is a WHERE condition, not a re-ordering");
});

Deno.test("buildSemanticSearchQuery: results stay scoped to the owner and exclude archived", () => {
  const { sql } = buildSemanticSearchQuery({
    vector: "[0.1]",
    userId: 7,
    limit: 10,
    offset: 0,
    tagIds: [3],
  });

  assert(sql.includes("e.user_id = $2"), "row-level scoping by user id");
  assert(sql.includes("NOT n.is_archived"), "archived notes stay out of search");
});

// GET /api/search?semantic=1&tags=... - handler wiring

/** A route as exposed by Oak's Router iterator */
type RouteLike = {
  path: string;
  methods: string[];
  middleware: Array<(ctx: unknown) => Promise<void>>;
};

/** Pull the GET /api/search handler out of a search router */
function getSearchHandler(deps?: Record<string, unknown>) {
  const router = createSearchRouter(deps) as unknown as Iterable<RouteLike>;
  for (const route of router) {
    if (route.path === "/" && route.methods.includes("GET")) {
      return route.middleware[route.middleware.length - 1];
    }
  }
  throw new Error("No GET / route registered on the search router");
}

/** A fake db recording raw queries plus searchNotes/getNotes calls */
function fakeDb(rows: unknown[] = []) {
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
      return { rows };
    },
    // deno-lint-ignore require-await
    searchNotes: async (...args: unknown[]) => {
      calls.searchNotes.push(args);
      return [{ id: 1, title: "text hit" }];
    },
    // deno-lint-ignore require-await
    getNotes: async (...args: unknown[]) => {
      calls.getNotes.push(args);
      return [{ id: 1, title: "text hit" }];
    },
  };
}

/** Run GET /api/search with an injected embedder */
async function runSearch(
  path: string,
  db: unknown,
  embed: (text: string) => Promise<number[]>,
) {
  const ctx = testing.createMockContext({ method: "GET", path: `/${path}` });
  const state = ctx.state as unknown as Record<string, unknown>;
  state.user = { id: 7 };
  state.db = db;
  await getSearchHandler({ embed })(ctx);
  return ctx;
}

/** An embedder returning a fixed vector */
function fakeEmbedder(vector: number[] = [0.1, 0.2, 0.3]) {
  const calls: string[] = [];
  return {
    calls,
    // deno-lint-ignore require-await
    embed: async (text: string) => {
      calls.push(text);
      return vector;
    },
  };
}

type SearchBody = {
  success: boolean;
  data: { query: string; results: unknown[] };
  meta: { semantic: boolean; tagsApplied: boolean; tags: number[]; total: number };
};

Deno.test("GET /api/search: semantic=1 with tags filters the embedding results", async () => {
  const db = fakeDb([{ id: 12, title: "Bathroom bulbs", similarity: 0.9 }]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1&tags=3,5", db, embedder.embed);

  assertEquals(db.calls.query.length, 1, "one query: the tag-filtered semantic search");
  const { sql, params } = db.calls.query[0];
  assert(sql.includes("note_embeddings"), "still the embedding search");
  assert(sql.includes("nt.tag_id = ANY($5::int[])"), "tags were NOT silently dropped");
  assert(sql.includes("HAVING COUNT(DISTINCT nt.tag_id) = $6"), "AND-all tag semantics");
  assertEquals(params[4], [3, 5]);
  assertEquals(params[5], 2);

  const body = ctx.response.body as SearchBody;
  assertEquals(body.success, true);
  assertEquals(body.meta.semantic, true);
  assertEquals(body.meta.tagsApplied, true, "the client must be able to see tags were applied");
  assertEquals(body.meta.tags, [3, 5]);
});

Deno.test("GET /api/search: semantic=1 without tags reports tagsApplied false", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1", db, embedder.embed);

  const body = ctx.response.body as SearchBody;
  assertEquals(body.meta.tagsApplied, false);
  assertEquals(body.meta.tags, []);
  assertEquals(db.calls.query[0].params.length, 4, "no tag params are bound");
});

Deno.test("GET /api/search: an empty tag-filtered semantic result is a valid result", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1&tags=3", db, embedder.embed);

  assertEquals(ctx.response.status, 200, "an empty result set is a success, not an error");
  const body = ctx.response.body as SearchBody;
  assertEquals(body.success, true);
  assertEquals(body.data.results, []);
  assertEquals(body.meta.total, 0);
  assertEquals(body.meta.tagsApplied, true);
});

Deno.test("GET /api/search: semantic tag ids are deduped before the HAVING count", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  await runSearch("?q=lighting&semantic=1&tags=3,3,5", db, embedder.embed);

  const { params } = db.calls.query[0];
  assertEquals(params[4], [3, 5]);
  assertEquals(params[5], 2, "a duplicated id must not make the filter unsatisfiable");
});

Deno.test("GET /api/search: a tags param with no usable ids is a 400, never a silent drop", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1&tags=abc", db, embedder.embed);

  assertEquals(ctx.response.status, 400);
  assertEquals(ctx.response.body, {
    success: false,
    error: "Invalid tags parameter",
  });
  assertEquals(embedder.calls.length, 0, "a bad request must not cost an embedding call");
  assertEquals(db.calls.query.length, 0);
});

Deno.test("GET /api/search: an empty tags param simply means no tag filter", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1&tags=", db, embedder.embed);

  assertEquals(ctx.response.status, 200);
  assertEquals((ctx.response.body as SearchBody).meta.tagsApplied, false);
  assertEquals(db.calls.query[0].params.length, 4);
});

Deno.test("GET /api/search: semantic tag filtering keeps the limit/offset params in place", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  await runSearch("?q=lighting&semantic=1&tags=3&limit=5&offset=10", db, embedder.embed);

  const { params } = db.calls.query[0];
  assertEquals(params[2], 5);
  assertEquals(params[3], 10);
  assertEquals(params[4], [3]);
});

Deno.test("GET /api/search: the text path ignores the tags param and stays as it was", async () => {
  const db = fakeDb();
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=led&tags=3,5", db, embedder.embed);

  assertEquals(embedder.calls.length, 0);
  assertEquals(db.calls.searchNotes.length, 1, "text search still runs");
  const body = ctx.response.body as { success: boolean; meta: Record<string, unknown> };
  assertEquals(body.success, true);
  assertEquals(body.meta.semantic, undefined, "the text response shape is unchanged");
});

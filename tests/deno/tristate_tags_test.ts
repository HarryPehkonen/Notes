/**
 * Tri-state tag filters, end to end on the server.
 *
 * The three endpoints that filter by tags must agree: `tags` lists the tags a
 * note must carry, `exclude_tags` (`excludeTags` in the advanced-search JSON
 * body) lists the tags it must not, and both may appear in one request.
 *
 *   GET  /api/notes            - tag-only filtering, no text query
 *   POST /api/search/advanced  - text search combined with tags
 *   GET  /api/search?semantic=1 - embedding search, tag-filtered
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { testing } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { buildSemanticSearchQuery } from "../../server/api/semantic.js";
import { buildNotesListQuery } from "../../server/database/client.js";
import { createSearchRouter } from "../../server/api/search.js";
import { createNotesRouter } from "../../server/api/notes.js";

/** A route as exposed by Oak's Router iterator */
type RouteLike = {
  path: string;
  methods: string[];
  middleware: Array<(ctx: unknown) => Promise<void>>;
};

/** Pull one route handler out of a router */
function handlerFrom(router: unknown, method: string, path: string) {
  for (const route of router as Iterable<RouteLike>) {
    if (route.path === path && route.methods.includes(method)) {
      return route.middleware[route.middleware.length - 1];
    }
  }
  throw new Error(`No ${method} ${path} route registered`);
}

/** A fake db recording raw queries and getNotes options */
function fakeDb(rows: unknown[] = []) {
  const calls: {
    query: Array<{ sql: string; params: unknown[] }>;
    getNotes: unknown[][];
  } = { query: [], getNotes: [] };

  return {
    calls,
    // deno-lint-ignore require-await
    query: async (sql: string, params: unknown[] = []) => {
      calls.query.push({ sql, params });
      return { rows };
    },
    // deno-lint-ignore require-await
    getNotes: async (...args: unknown[]) => {
      calls.getNotes.push(args);
      return rows;
    },
  };
}

/** An embedder returning a fixed vector */
function fakeEmbedder(vector: number[] = [0.1, 0.2]) {
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

type FilterMeta = {
  tags: number[];
  excludeTags: number[];
  tagsApplied: boolean;
  excludeTagsApplied: boolean;
};

// buildSemanticSearchQuery - exclusions on the embedding search

Deno.test("buildSemanticSearchQuery: excluded tags become a NOT EXISTS on the note", () => {
  const { sql, params } = buildSemanticSearchQuery({
    vector: "[0.1]",
    userId: 7,
    limit: 20,
    offset: 0,
    excludeTagIds: [4],
  });

  assert(sql.includes("NOT EXISTS ("), "an anti-join, so one matching tag drops the note");
  assert(sql.includes("ANY($5::int[])"), "excluded ids take the first free slot");
  assertEquals(params, ["[0.1]", 7, 20, 0, [4]]);
});

Deno.test("buildSemanticSearchQuery: required and excluded tags combine", () => {
  const { sql, params } = buildSemanticSearchQuery({
    vector: "[0.1]",
    userId: 7,
    limit: 20,
    offset: 0,
    tagIds: [3],
    excludeTagIds: [4, 9],
  });

  assert(sql.includes("nt.tag_id = ANY($5::int[])"), "required first");
  assert(sql.includes("HAVING COUNT(DISTINCT nt.tag_id) = $6"));
  assert(sql.includes("ANY($7::int[])"), "excluded after the required ids");
  assertEquals(params, ["[0.1]", 7, 20, 0, [3], 1, [4, 9]]);
});

Deno.test("buildSemanticSearchQuery: exclusions never disturb the similarity ranking", () => {
  const { sql } = buildSemanticSearchQuery({
    vector: "[0.1]",
    userId: 7,
    limit: 10,
    offset: 0,
    excludeTagIds: [4],
  });

  assert(
    sql.indexOf("NOT EXISTS (") < sql.indexOf("ORDER BY e.embedding <=> $1::vector"),
    "the exclusion is a WHERE condition, not a re-ordering",
  );
});

// buildNotesListQuery - the tag-only filtered list, factored out of getNotes

Deno.test("buildNotesListQuery: no tag options means no tag conditions", () => {
  const { query, params } = buildNotesListQuery(7, { limit: 20, offset: 0 });

  assert(!query.includes("note_tags nt\n"), "no required-tag membership test");
  assert(!query.includes("NOT EXISTS ("), "no exclusion test");
  assertEquals(params, [7, 20, 0]);
});

Deno.test("buildNotesListQuery: required tags must all be present", () => {
  const { query, params } = buildNotesListQuery(7, { tags: [3, 5], limit: 20, offset: 0 });

  assert(query.includes("n.id IN ("));
  assert(query.includes("HAVING COUNT(DISTINCT nt.tag_id) = $3"));
  assertEquals(params, [7, [3, 5], 2, 20, 0]);
});

Deno.test("buildNotesListQuery: excluded tags drop every note carrying one", () => {
  const { query, params } = buildNotesListQuery(7, { excludeTags: [4], limit: 20, offset: 0 });

  assert(query.includes("NOT EXISTS ("));
  assert(query.includes("ANY($2::int[])"));
  assertEquals(params, [7, [4], 20, 0]);
});

Deno.test("buildNotesListQuery: an exclusion-only filter still excludes archived notes", () => {
  const { query } = buildNotesListQuery(7, { excludeTags: [4], limit: 20, offset: 0 });

  assert(query.includes("NOT n.is_archived"));
  assert(query.includes("n.user_id = $1"), "row-level scoping survives the new clause");
});

Deno.test("buildNotesListQuery: required and excluded combine, and LIMIT still comes last", () => {
  const { query, params } = buildNotesListQuery(7, {
    tags: [3],
    excludeTags: [4],
    limit: 10,
    offset: 5,
  });

  assertEquals(params, [7, [3], 1, [4], 10, 5]);
  assert(query.includes("LIMIT $5 OFFSET $6"), `limit/offset bind after the tag ids: ${query}`);
  assert(query.trimEnd().endsWith("OFFSET $6"));
});

Deno.test("buildNotesListQuery: tag filters compose with the pinned filter", () => {
  const { query, params } = buildNotesListQuery(7, {
    pinned: true,
    excludeTags: [4],
    limit: 20,
    offset: 0,
  });

  assert(query.includes("n.is_pinned = $2"));
  assertEquals(params, [7, true, [4], 20, 0]);
});

// GET /api/notes - the tag-only filtered list

/** Run GET /api/notes with the given query string */
async function runNotesList(search: string, db: unknown) {
  const ctx = testing.createMockContext({ method: "GET", path: `/${search}` });
  const state = ctx.state as unknown as Record<string, unknown>;
  state.user = { id: 7 };
  state.db = db;
  await handlerFrom(createNotesRouter(), "GET", "/")(ctx);
  return ctx;
}

Deno.test("GET /api/notes: exclude_tags reaches getNotes as excludeTags", async () => {
  const db = fakeDb([]);
  const ctx = await runNotesList("?exclude_tags=4,9", db);

  assertEquals(ctx.response.status, 200);
  const options = db.calls.getNotes[0][1] as { tags?: number[]; excludeTags?: number[] };
  assertEquals(options.excludeTags, [4, 9]);
  assertEquals(options.tags, undefined, "no required tags were asked for");
});

Deno.test("GET /api/notes: required and excluded tags travel together", async () => {
  const db = fakeDb([]);
  await runNotesList("?tags=3&exclude_tags=4", db);

  const options = db.calls.getNotes[0][1] as { tags?: number[]; excludeTags?: number[] };
  assertEquals(options.tags, [3]);
  assertEquals(options.excludeTags, [4]);
});

Deno.test("GET /api/notes: meta reports which tag filters were applied", async () => {
  const db = fakeDb([]);
  const ctx = await runNotesList("?tags=3&exclude_tags=4", db);

  const meta = (ctx.response.body as { meta: FilterMeta }).meta;
  assertEquals(meta.tags, [3]);
  assertEquals(meta.excludeTags, [4]);
  assertEquals(meta.tagsApplied, true);
  assertEquals(meta.excludeTagsApplied, true);
});

Deno.test("GET /api/notes: with no tag filter meta says so rather than lying", async () => {
  const db = fakeDb([]);
  const ctx = await runNotesList("", db);

  const meta = (ctx.response.body as { meta: FilterMeta }).meta;
  assertEquals(meta.tagsApplied, false);
  assertEquals(meta.excludeTagsApplied, false);
  assertEquals(meta.tags, []);
  assertEquals(meta.excludeTags, []);
});

Deno.test("GET /api/notes: an unreadable tag filter is a 400, never an unfiltered list", async () => {
  const db = fakeDb([]);
  const ctx = await runNotesList("?exclude_tags=abc", db);

  assertEquals(ctx.response.status, 400);
  assertEquals(ctx.response.body, { success: false, error: "Invalid tags parameter" });
  assertEquals(db.calls.getNotes.length, 0, "the query must not run at all");
});

// POST /api/search/advanced - text search combined with tags

/** Run POST /api/search/advanced with the given JSON body */
async function runAdvanced(body: Record<string, unknown>, db: unknown) {
  const ctx = testing.createMockContext({ method: "POST", path: "/advanced" });
  const state = ctx.state as unknown as Record<string, unknown>;
  state.user = { id: 7 };
  state.db = db;

  Object.defineProperty(ctx.request, "hasBody", { value: true, configurable: true });
  Object.defineProperty(ctx.request, "body", {
    value: () => ({ value: Promise.resolve(body) }),
    configurable: true,
  });

  await handlerFrom(createSearchRouter(), "POST", "/advanced")(ctx);
  return ctx;
}

Deno.test("POST /api/search/advanced: excludeTags filters out notes carrying them", async () => {
  const db = fakeDb([]);
  await runAdvanced({ query: "led", excludeTags: [4] }, db);

  const { sql, params } = db.calls.query[0];
  assert(sql.includes("NOT EXISTS ("), "the exclusion is an anti-join on note_tags");
  assert(params.some((p) => Array.isArray(p) && p.length === 1 && p[0] === 4));
});

Deno.test("POST /api/search/advanced: required and excluded tags combine with the text query", async () => {
  const db = fakeDb([]);
  await runAdvanced({ query: "led", tags: [3], excludeTags: [4] }, db);

  const { sql, params } = db.calls.query[0];
  assert(sql.includes("plainto_tsquery"), "the text search is still there");
  assert(sql.includes("HAVING COUNT(DISTINCT nt.tag_id)"), "required tags are ANDed");
  assert(sql.includes("NOT EXISTS ("), "excluded tags are anti-joined");
  assertEquals(params[0], 7);
  assertEquals(params[1], "led");
  assertEquals(params[2], [3]);
  assertEquals(params[3], 1);
  assertEquals(params[4], [4]);
});

Deno.test("POST /api/search/advanced: an exclusion-only search needs no text query", async () => {
  const db = fakeDb([]);
  const ctx = await runAdvanced({ excludeTags: [4] }, db);

  assertEquals(ctx.response.status, 200);
  const { sql, params } = db.calls.query[0];
  assert(sql.includes("NOT EXISTS ("));
  assertEquals(params[1], [4], "with no text query the excluded ids follow the user id");
});

Deno.test("POST /api/search/advanced: the response echoes what was filtered on", async () => {
  const db = fakeDb([]);
  const ctx = await runAdvanced({ query: "led", tags: [3], excludeTags: [4] }, db);

  const body = ctx.response.body as {
    data: { criteria: { tags: number[]; excludeTags: number[] } };
    meta: FilterMeta;
  };
  assertEquals(body.data.criteria.tags, [3]);
  assertEquals(body.data.criteria.excludeTags, [4]);
  assertEquals(body.meta.tagsApplied, true);
  assertEquals(body.meta.excludeTagsApplied, true);
});

Deno.test("POST /api/search/advanced: an unreadable tag filter is a 400", async () => {
  const db = fakeDb([]);
  const ctx = await runAdvanced({ query: "led", excludeTags: ["nope"] }, db);

  assertEquals(ctx.response.status, 400);
  assertEquals(ctx.response.body, { success: false, error: "Invalid tags parameter" });
  assertEquals(db.calls.query.length, 0);
});

// GET /api/search?semantic=1 - exclusions on the embedding search

/** Run GET /api/search with an injected embedder */
async function runSearch(search: string, db: unknown, embed: (t: string) => Promise<number[]>) {
  const ctx = testing.createMockContext({ method: "GET", path: `/${search}` });
  const state = ctx.state as unknown as Record<string, unknown>;
  state.user = { id: 7 };
  state.db = db;
  await handlerFrom(createSearchRouter({ embed }), "GET", "/")(ctx);
  return ctx;
}

Deno.test("GET /api/search: semantic=1 honours exclude_tags", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1&exclude_tags=4", db, embedder.embed);

  const { sql, params } = db.calls.query[0];
  assert(sql.includes("NOT EXISTS ("));
  assertEquals(params[4], [4]);

  const meta = (ctx.response.body as { meta: FilterMeta }).meta;
  assertEquals(meta.excludeTags, [4]);
  assertEquals(meta.excludeTagsApplied, true);
  assertEquals(meta.tagsApplied, false);
});

Deno.test("GET /api/search: semantic=1 combines required and excluded tags", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1&tags=3&exclude_tags=4", db, embedder.embed);

  const { params } = db.calls.query[0];
  assertEquals(params[4], [3]);
  assertEquals(params[5], 1);
  assertEquals(params[6], [4]);

  const meta = (ctx.response.body as { meta: FilterMeta }).meta;
  assertEquals(meta.tags, [3]);
  assertEquals(meta.excludeTags, [4]);
});

Deno.test("GET /api/search: a semantic exclusion filter with no usable id is a 400", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1&exclude_tags=abc", db, embedder.embed);

  assertEquals(ctx.response.status, 400);
  assertEquals(ctx.response.body, { success: false, error: "Invalid tags parameter" });
  assertEquals(embedder.calls.length, 0, "a bad request must not cost an embedding call");
});

Deno.test("GET /api/search: semantic meta always carries both tag fields", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1", db, embedder.embed);

  const meta = (ctx.response.body as { meta: FilterMeta }).meta;
  assertEquals(meta.tags, []);
  assertEquals(meta.excludeTags, []);
  assertEquals(meta.tagsApplied, false);
  assertEquals(meta.excludeTagsApplied, false);
});

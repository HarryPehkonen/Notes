import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { testing } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import {
  buildEmbeddingPrompt,
  EmbeddingError,
  parseEmbeddingResponse,
  toVectorLiteral,
} from "../../server/api/embed.js";
import { parseSemanticResults, semanticQueryNeeds } from "../../server/api/semantic.js";
import { createSearchRouter } from "../../server/api/search.js";
import { shouldSendSemantic } from "../../public/utils/search-mode.js";

// buildEmbeddingPrompt tests

Deno.test("buildEmbeddingPrompt: title and content are separated by a blank line", () => {
  assertEquals(
    buildEmbeddingPrompt("Bathroom", "Mirror light bulbs"),
    "Bathroom\n\nMirror light bulbs",
  );
});

Deno.test("buildEmbeddingPrompt: empty content yields the title alone", () => {
  assertEquals(buildEmbeddingPrompt("Bathroom", ""), "Bathroom");
  assertEquals(buildEmbeddingPrompt("Bathroom", "   "), "Bathroom");
  assertEquals(buildEmbeddingPrompt("Bathroom", null), "Bathroom");
  assertEquals(buildEmbeddingPrompt("Bathroom", undefined), "Bathroom");
});

Deno.test("buildEmbeddingPrompt: empty title yields the content alone", () => {
  assertEquals(buildEmbeddingPrompt("", "Mirror light bulbs"), "Mirror light bulbs");
  assertEquals(buildEmbeddingPrompt(null, "Mirror light bulbs"), "Mirror light bulbs");
});

Deno.test("buildEmbeddingPrompt: trims both parts", () => {
  assertEquals(buildEmbeddingPrompt("  Bathroom  ", "  bulbs  "), "Bathroom\n\nbulbs");
});

Deno.test("buildEmbeddingPrompt: an empty note yields an empty prompt", () => {
  assertEquals(buildEmbeddingPrompt("", ""), "");
  assertEquals(buildEmbeddingPrompt(undefined, undefined), "");
});

// toVectorLiteral tests

Deno.test("toVectorLiteral: formats a float array as a pgvector literal", () => {
  assertEquals(toVectorLiteral([0.1, -0.25, 3]), "[0.1,-0.25,3]");
});

Deno.test("toVectorLiteral: rejects anything that is not a non-empty number array", () => {
  assertThrows(() => toVectorLiteral([]), EmbeddingError);
  assertThrows(() => toVectorLiteral("nope" as unknown as number[]), EmbeddingError);
  assertThrows(() => toVectorLiteral([1, NaN]), EmbeddingError);
  assertThrows(() => toVectorLiteral([1, "2" as unknown as number]), EmbeddingError);
});

// parseEmbeddingResponse tests

Deno.test("parseEmbeddingResponse: pulls the first embedding out of an OpenAI-shaped body", () => {
  const body = { data: [{ embedding: [0.5, 0.25] }], model: "bge-m3" };
  assertEquals(parseEmbeddingResponse(body), [0.5, 0.25]);
});

Deno.test("parseEmbeddingResponse: a malformed body is an embedding failure", () => {
  assertThrows(() => parseEmbeddingResponse(null), EmbeddingError);
  assertThrows(() => parseEmbeddingResponse({}), EmbeddingError);
  assertThrows(() => parseEmbeddingResponse({ data: [] }), EmbeddingError);
  assertThrows(() => parseEmbeddingResponse({ data: [{}] }), EmbeddingError);
  assertThrows(() => parseEmbeddingResponse({ data: [{ embedding: [] }] }), EmbeddingError);
});

// semanticQueryNeeds tests - the switch is exclusive, never hybrid

Deno.test("semanticQueryNeeds: '1' or true selects the semantic path", () => {
  assertEquals(semanticQueryNeeds("1"), true);
  assertEquals(semanticQueryNeeds(true), true);
});

Deno.test("semanticQueryNeeds: anything else stays on the text path", () => {
  assertEquals(semanticQueryNeeds("0"), false);
  assertEquals(semanticQueryNeeds(""), false);
  assertEquals(semanticQueryNeeds(null), false);
  assertEquals(semanticQueryNeeds(undefined), false);
  assertEquals(semanticQueryNeeds(false), false);
  assertEquals(semanticQueryNeeds("true"), false);
  assertEquals(semanticQueryNeeds("yes"), false);
});

// parseSemanticResults tests

Deno.test("parseSemanticResults: maps a pgvector row to the searchNotes result shape", () => {
  const row = {
    id: 12,
    user_id: 7,
    title: "Bathroom mirror light bulbs",
    content: "# Bulbs\nE14 warm white",
    content_plain: "Bulbs E14 warm white",
    is_pinned: false,
    is_archived: false,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-02T10:00:00Z",
    similarity: 0.8321,
    tags: [{ id: 3, name: "home", color: "#667eea" }],
  };

  assertEquals(parseSemanticResults(row), {
    id: 12,
    user_id: 7,
    title: "Bathroom mirror light bulbs",
    content: "# Bulbs\nE14 warm white",
    content_plain: "Bulbs E14 warm white",
    is_pinned: false,
    is_archived: false,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-02T10:00:00Z",
    similarity: 0.8321,
    rank: 0.8321,
    tags: [{ id: 3, name: "home", color: "#667eea" }],
  });
});

Deno.test("parseSemanticResults: a numeric-string similarity becomes a number", () => {
  const mapped = parseSemanticResults({ id: 1, title: "t", similarity: "0.5" });
  assertEquals(mapped.similarity, 0.5);
  assertEquals(mapped.rank, 0.5);
});

Deno.test("parseSemanticResults: a missing similarity is 0, not NaN", () => {
  const mapped = parseSemanticResults({ id: 1, title: "t" });
  assertEquals(mapped.similarity, 0);
  assertEquals(mapped.rank, 0);
});

Deno.test("parseSemanticResults: a row with no tags gets an empty tag array", () => {
  assertEquals(parseSemanticResults({ id: 1, title: "t", similarity: 0.9 }).tags, []);
});

// GET /api/search?semantic=1 routing tests

/**
 * A route as exposed by Oak's Router iterator
 */
type RouteLike = {
  path: string;
  methods: string[];
  middleware: Array<(ctx: unknown) => Promise<void>>;
};

/**
 * Pull the GET /api/search handler out of a search router
 * @param {Object} deps - Router dependencies (an injected embed function)
 */
function getSearchHandler(deps?: Record<string, unknown>) {
  const router = createSearchRouter(deps) as unknown as Iterable<RouteLike>;
  for (const route of router) {
    if (route.path === "/" && route.methods.includes("GET")) {
      return route.middleware[route.middleware.length - 1];
    }
  }
  throw new Error("No GET / route registered on the search router");
}

/**
 * Build a fake db that records raw queries plus searchNotes/getNotes calls
 * @param {Array} rows - Rows every raw query should return
 */
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

/**
 * Run GET /api/search with an injected embedder
 * @param {string} path - Query string portion, e.g. "?q=x&semantic=1"
 * @param {Object} db - Fake database client
 * @param {Function} embed - Injected embedding function
 */
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

/** An embedder that records its calls and returns a fixed vector */
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

Deno.test("GET /api/search: semantic=1 embeds the query and searches pgvector", async () => {
  const db = fakeDb([{ id: 12, title: "Bathroom bulbs", similarity: 0.9 }]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=lighting&semantic=1", db, embedder.embed);

  assertEquals(embedder.calls, ["lighting"], "the raw query is what gets embedded");
  assertEquals(db.calls.searchNotes.length, 0, "semantic mode must not run the text search");
  assertEquals(db.calls.query.length, 1);

  const { sql, params } = db.calls.query[0];
  assert(sql.includes("note_embeddings"), "the semantic search must read note_embeddings");
  assert(sql.includes("<=> $1::vector"), "the query vector must be bound as $1");
  assert(sql.includes("ORDER BY e.embedding <=> $1::vector"), "nearest neighbours come first");
  assertEquals(params[0], "[0.1,0.2,0.3]");
  assertEquals(params[1], 7, "results stay scoped to the authenticated user");

  const body = ctx.response.body as {
    success: boolean;
    data: { query: string; results: Array<{ id: number; similarity: number }> };
    meta: { semantic: boolean; total: number; limit: number; offset: number; hasMore: boolean };
  };
  assertEquals(body.success, true);
  assertEquals(body.data.query, "lighting");
  assertEquals(body.data.results[0].id, 12);
  assertEquals(body.data.results[0].similarity, 0.9);
  assertEquals(body.meta.semantic, true);
  assertEquals(body.meta.total, 1);
});

Deno.test("GET /api/search: semantic results keep the requested limit and offset", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  await runSearch("?q=lighting&semantic=1&limit=5&offset=10", db, embedder.embed);

  const { params } = db.calls.query[0];
  assertEquals(params[2], 5);
  assertEquals(params[3], 10);
});

Deno.test("GET /api/search: the semantic limit is capped like the text search", async () => {
  const db = fakeDb([]);
  const embedder = fakeEmbedder();
  await runSearch("?q=lighting&semantic=1&limit=9999", db, embedder.embed);

  assertEquals(db.calls.query[0].params[2], 100);
});

Deno.test("GET /api/search: semantic mode ignores '#tag' filters instead of resolving them", async () => {
  const db = fakeDb([{ id: 12, title: "Bathroom bulbs", similarity: 0.7 }]);
  const embedder = fakeEmbedder();
  const ctx = await runSearch(
    "?q=" + encodeURIComponent("lighting #home") + "&semantic=1",
    db,
    embedder.embed,
  );

  assertEquals(embedder.calls, ["lighting #home"], "the whole query, '#tag' included, is embedded");
  assertEquals(db.calls.query.length, 1, "no tag-name lookup happens in semantic mode");
  assert(
    db.calls.query[0].sql.includes("note_embeddings"),
    "the one query must be the semantic search, not a tag lookup",
  );
  assertEquals(db.calls.getNotes.length, 0);
  assertEquals(db.calls.searchNotes.length, 0);
  assertEquals(
    (ctx.response.body as { meta: { semantic: boolean } }).meta.semantic,
    true,
  );
});

Deno.test("GET /api/search: an unreachable embedding server is a 502, never a text fallback", async () => {
  const db = fakeDb([]);
  const embed = () => Promise.reject(new EmbeddingError("connection refused"));
  const ctx = await runSearch("?q=lighting&semantic=1", db, embed);

  assertEquals(ctx.response.status, 502);
  assertEquals(ctx.response.body, {
    success: false,
    error: "Semantic search unavailable",
  });
  assertEquals(db.calls.searchNotes.length, 0, "exclusive mode must not fall back to text search");
  assertEquals(db.calls.query.length, 0);
});

Deno.test("GET /api/search: semantic=0 leaves the text path untouched", async () => {
  const db = fakeDb();
  const embedder = fakeEmbedder();
  const ctx = await runSearch(
    "?q=" + encodeURIComponent("led home") + "&semantic=0",
    db,
    embedder.embed,
  );

  assertEquals(embedder.calls.length, 0, "no embedding call on the text path");
  assertEquals(db.calls.searchNotes.length, 1);
  assertEquals(db.calls.searchNotes[0][1], "led home");
  const body = ctx.response.body as { success: boolean; meta: Record<string, unknown> };
  assertEquals(body.success, true);
  assertEquals(body.meta.semantic, undefined, "the text response shape stays as it was");
});

Deno.test("GET /api/search: an empty query is still a 400 in semantic mode", async () => {
  const db = fakeDb();
  const embedder = fakeEmbedder();
  const ctx = await runSearch("?q=%20%20&semantic=1", db, embedder.embed);

  assertEquals(ctx.response.status, 400);
  assertEquals(embedder.calls.length, 0);
});

// public/utils/search-mode.js - the frontend flag

Deno.test("shouldSendSemantic: a checked box turns the flag on", () => {
  assertEquals(shouldSendSemantic(true), true);
});

Deno.test("shouldSendSemantic: anything but a checked box leaves it off", () => {
  assertEquals(shouldSendSemantic(false), false);
  assertEquals(shouldSendSemantic(undefined), false);
  assertEquals(shouldSendSemantic(null), false);
  assertEquals(shouldSendSemantic("false"), false);
  assertEquals(shouldSendSemantic(0), false);
  assertEquals(shouldSendSemantic(1), false);
});

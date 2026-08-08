import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { testing } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { createNotesRouter } from "../../server/api/notes.js";

/**
 * A route as exposed by Oak's Router iterator
 */
type RouteLike = {
  path: string;
  methods: string[];
  middleware: Array<(ctx: unknown) => Promise<void>>;
};

/**
 * Pull a single route handler out of the notes router
 * @param {string} method - HTTP method, e.g. "DELETE"
 * @param {string} path - Route path as registered, e.g. "/:id"
 */
function getRouteHandler(method: string, path: string) {
  const router = createNotesRouter() as unknown as Iterable<RouteLike>;
  for (const route of router) {
    if (route.path === path && route.methods.includes(method)) {
      return route.middleware[route.middleware.length - 1];
    }
  }
  throw new Error(`No ${method} ${path} route registered`);
}

/**
 * Build a fake db whose query() returns queued results and records calls
 * @param {Array} results
 */
function fakeDb(results: Array<{ rows: unknown[] }>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    // deno-lint-ignore require-await
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return results.shift() ?? { rows: [] };
    },
  };
}

/**
 * Build a mock Oak context for DELETE /api/notes/:id
 * @param {Object} db - Fake database client
 * @param {string} id - Note id path parameter
 */
function deleteContext(db: unknown, id = "1") {
  const ctx = testing.createMockContext({
    method: "DELETE",
    path: `/${id}`,
    params: { id },
  });
  const state = ctx.state as unknown as Record<string, unknown>;
  state.user = { id: 7 };
  state.db = db;
  return ctx;
}

Deno.test("DELETE /api/notes/:id: responds 204 with no body set", async () => {
  const db = fakeDb([{ rows: [{ id: 1, content: "plain note, no images" }] }]);
  const ctx = deleteContext(db);

  await getRouteHandler("DELETE", "/:id")(ctx);

  assertEquals(ctx.response.status, 204);
  assert(
    ctx.response.body === undefined || ctx.response.body === null,
    `204 response must not carry a body, got ${JSON.stringify(ctx.response.body)}`,
  );
});

Deno.test("DELETE /api/notes/:id: response is buildable (no 204-with-body crash)", async () => {
  const db = fakeDb([{ rows: [{ id: 1, content: "plain note, no images" }] }]);
  const ctx = deleteContext(db);

  await getRouteHandler("DELETE", "/:id")(ctx);

  // This is what Oak does when writing the response to the socket. With a body
  // set on a 204 it throws, the error escapes the handler, and the process dies.
  const domResponse = await ctx.response.toDomResponse();
  assertEquals(domResponse.status, 204);
});

Deno.test("DELETE /api/notes/:id: archives the note scoped to the owner", async () => {
  const db = fakeDb([{ rows: [{ id: 1, content: "plain note, no images" }] }]);
  const ctx = deleteContext(db, "42");

  await getRouteHandler("DELETE", "/:id")(ctx);

  assertEquals(db.calls.length, 1);
  assertEquals(db.calls[0].params, [42, 7]);
});

Deno.test("DELETE /api/notes/:id: still returns a JSON body on 404", async () => {
  const db = fakeDb([{ rows: [] }]);
  const ctx = deleteContext(db);

  await getRouteHandler("DELETE", "/:id")(ctx);

  assertEquals(ctx.response.status, 404);
  assertEquals(ctx.response.body, { success: false, error: "Note not found" });
});

Deno.test("204 responses cannot carry a body (crash mechanism)", () => {
  assertThrows(() => new Response("", { status: 204 }), TypeError);
  const noBody = new Response(null, { status: 204 });
  assertEquals(noBody.status, 204);
});

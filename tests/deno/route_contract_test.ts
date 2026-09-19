/**
 * The URL contract between the browser and the server, checked by reading the
 * sources (see route_contract.ts for why).
 *
 * Two halves:
 *   - synthetic tests: do the extractors and the matcher behave, and can the
 *     checker FAIL? (a guard that has never failed is a guess)
 *   - the real repository: every call site in public/app.js resolves to a route
 *     that server/ actually serves, and the extraction is not vacuous.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  apiPrefix,
  checkContract,
  clientCalls,
  declaredRoutes,
  mountedRouters,
  normalizePath,
  routeMatches,
  serverRoutes,
  websocketPath,
} from "./route_contract.ts";

// ---------------------------------------------------------------- extractors

Deno.test("normalizePath: a query string is dropped, whatever built it", () => {
  assertEquals(normalizePath("/search?${buildSearchParams(query)}"), "/search");
  assertEquals(normalizePath("/search/suggestions?q=x&limit=10"), "/search/suggestions");
});

Deno.test("normalizePath: each ${...} becomes one opaque segment", () => {
  assertEquals(normalizePath("/notes/${id}"), "/notes/:param");
  assertEquals(
    normalizePath("/notes/${noteId}/restore/${versionId}"),
    "/notes/:param/restore/:param",
  );
  assertEquals(normalizePath("/images/${filename}"), "/images/:param");
});

Deno.test("normalizePath: a bare or odd path still reads as a path", () => {
  assertEquals(normalizePath("/"), "/");
  assertEquals(normalizePath(""), "/");
  assertEquals(normalizePath("tags"), "/tags");
  assertEquals(normalizePath("//notes//x?y"), "/notes/x");
});

Deno.test("clientCalls: a literal request defaults to GET, options give the method", () => {
  const source = `
    getTags() { return this.request("/tags"); },
    createTag(d) { return this.request("/tags", { method: "POST", body: d }); },
    deleteTag(id) { return this.request(\`/tags/\${id}\`, { method: "DELETE" }); },
  `;
  const { calls, skipped } = clientCalls(source, "synthetic.js");

  assertEquals(calls.map((c) => `${c.method} ${c.path}`), [
    "GET /tags",
    "POST /tags",
    "DELETE /tags/:param",
  ]);
  assertEquals(skipped, 0);
});

Deno.test("clientCalls: a path built in a variable is counted, never guessed", () => {
  const source = `
    setNoteTag(id, tagId, attach) {
      const { method, path } = tagEndpoint(id, tagId, attach);
      return this.request(path, { method });
    },
    getNotes() { const endpoint = "/notes"; return this.request(endpoint); },
  `;
  const { calls, skipped } = clientCalls(source, "synthetic.js");

  assertEquals(calls, [], "no literal path is visible at either site");
  assertEquals(skipped, 2, "both sites must be reported as dynamic");
});

Deno.test("clientCalls: the image upload's fetch is a call site too", () => {
  const source = `await fetch(\`\${this.apiUrl}/images\`, { method: "POST", body: formData });`;
  const { calls } = clientCalls(source, "synthetic.js");

  assertEquals(calls.length, 1);
  assertEquals(`${calls[0].method} ${calls[0].path}`, "POST /images");
});

Deno.test("websocketPath: the live-sync URL yields the path it opens, either shape", () => {
  const inline = "this.ws = new WebSocket(`${protocol}//${location.host}/ws`);";
  assertEquals(websocketPath(inline), "/ws");

  // How live-sync.js actually writes it: the template is assigned first.
  const viaVariable =
    "const url = `${protocol}//${location.host}/ws`;\n    this.ws = new WebSocket(url);";
  assertEquals(websocketPath(viaVariable), "/ws");

  // A URL assembled by a function is not readable statically, and says so.
  assertEquals(websocketPath("this.ws = new WebSocket(buildUrl());"), null);
});

// ------------------------------------------------------------ server routes

Deno.test("declaredRoutes: reads method and path, ignores other router calls", () => {
  const source = `
    router.get("/:id/versions", async (ctx) => {});
    router.put("/:id/tags/:tagId", async (ctx) => {});
    router.use("/api", limiter.middleware);
  `;
  assertEquals(declaredRoutes(source, "synthetic.js").map((r) => `${r.method} ${r.pattern}`), [
    "GET /:id/versions",
    "PUT /:id/tags/:tagId",
  ]);
});

Deno.test("mountedRouters: prefix, variable and factory all come from the entry point", () => {
  const main = `
    import { createNotesRouter } from "./api/notes.js";
    const notesRouter = createNotesRouter();
    router.use("/api/notes", requireAuth, notesRouter.routes(), notesRouter.allowedMethods());
    router.use("/api", apiRateLimiter.middleware);
  `;
  assertEquals([...mountedRouters(main)], [["server/api/notes.js", "/api/notes"]]);
});

Deno.test("serverRoutes: a mounted router's '/' route is the mount, not '/api/notes/'", () => {
  const main = `
    import { createTagsRouter } from "./api/tags.js";
    const tagsRouter = createTagsRouter();
    router.use("/api/tags", requireAuth, tagsRouter.routes(), tagsRouter.allowedMethods());
  `;
  const routes = serverRoutes([
    { file: "server/main.js", source: main },
    { file: "server/api/tags.js", source: 'router.get("/", h); router.get("/:id/notes", h);' },
  ]);

  assertEquals(routes.map((r) => `${r.method} ${r.pattern}`), [
    "GET /api/tags",
    "GET /api/tags/:id/notes",
  ]);
});

Deno.test("routeMatches: literals, :params and the :path* wildcard", () => {
  assert(routeMatches("/api/notes", "/api/notes"));
  assert(routeMatches("/api/notes/:id", "/api/notes/63"));
  assert(routeMatches("/api/notes/:id/tags/:tagId", "/api/notes/63/tags/9"));
  assert(routeMatches("/static/:path*", "/static/components/note-editor.js"));

  assert(!routeMatches("/api/notes/:id", "/api/notes/63/versions"), "no trailing segments");
  assert(!routeMatches("/api/notes/:id", "/api/notes"), "a param needs a value");
  assert(!routeMatches("/api/Tags", "/api/tags"), "literals are case-sensitive");
  assert(!routeMatches("/static/:path*", "/static"), "the wildcard needs one segment");
});

// ------------------------------------------- can the checker fail? (the point)

/** A minimal two-file server: one router factory, mounted at /api/notes. */
const syntheticServer = (routerSource: string) => [
  {
    file: "server/main.js",
    source: `import { createNotesRouter } from "./api/notes.js";
const notesRouter = createNotesRouter({ db });
router.use("/api/notes", requireAuth, notesRouter.routes(), notesRouter.allowedMethods());`,
  },
  { file: "server/api/notes.js", source: routerSource },
];

Deno.test("checkContract: a client path with no route is reported, with the path and method", () => {
  const source = 'return this.request(`/notes/${id}/typo`, { method: "PUT" });';
  const { calls } = clientCalls(source, "synthetic.js");
  const routes = serverRoutes(syntheticServer('router.put("/:id", h);'));

  const mismatches = checkContract({ calls, routes, prefix: "/api" });

  assertEquals(mismatches.length, 1);
  assertEquals(mismatches[0].fullPath, "/api/notes/:param/typo");
  assertEquals(mismatches[0].reason, "no route serves PUT /api/notes/:param/typo");
});

Deno.test("checkContract: the right path with the wrong method is a mismatch too", () => {
  const source = 'return this.request("/notes", { method: "PATCH" });';
  const { calls } = clientCalls(source, "synthetic.js");
  const routes = serverRoutes(syntheticServer('router.get("/", h); router.post("/", h);'));

  const mismatches = checkContract({ calls, routes, prefix: "/api" });

  assertEquals(mismatches.length, 1);
  assertEquals(mismatches[0].reason, "a route serves /api/notes, but not for PATCH");
});

Deno.test("checkContract: the doubled /api prefix of 2026-09-18 would be caught", () => {
  // The shape of the bug that started this: a helper returning a path that
  // already carries the prefix, composed onto it again.
  const { calls } = clientCalls('this.request("/api/notes/63/tags/9", { method: "PUT" });', "x.js");
  const routes = serverRoutes(syntheticServer('router.put("/:id/tags/:tagId", h);'));

  const mismatches = checkContract({ calls, routes, prefix: "/api" });

  assertEquals(mismatches.length, 1);
  assertEquals(mismatches[0].fullPath, "/api/api/notes/63/tags/9");
  assertEquals(mismatches[0].reason, "no route serves PUT /api/api/notes/63/tags/9");
});

// ------------------------------------------------------- the real repository

const read = (path: string) => Deno.readTextFile(new URL(`../../${path}`, import.meta.url));

const appSource = await read("public/app.js");
const mainSource = await read("server/main.js");
const serverSources = [
  { file: "server/main.js", source: mainSource },
  { file: "server/api/notes.js", source: await read("server/api/notes.js") },
  { file: "server/api/tags.js", source: await read("server/api/tags.js") },
  { file: "server/api/search.js", source: await read("server/api/search.js") },
  { file: "server/api/images.js", source: await read("server/api/images.js") },
  { file: "server/api/auth.js", source: await read("server/api/auth.js") },
];

Deno.test("contract: the app composes every path onto the apiUrl prefix", () => {
  assertEquals(apiPrefix(appSource), "/api");
  assertStringIncludes(appSource, "const url = `${this.apiUrl}${endpoint}`;");
});

Deno.test("contract: the extraction is not vacuous (a broken parser fails loudly)", () => {
  const { calls } = clientCalls(appSource, "public/app.js");

  assert(calls.length >= 17, `expected 17+ literal call sites, found ${calls.length}`);
  assertEquals(
    serverRoutes(serverSources).length >= 30,
    true,
    `expected 30+ server routes, found ${serverRoutes(serverSources).length}`,
  );
});

Deno.test("contract: exactly two call sites build their path dynamically, both known", () => {
  const { calls, skipped } = clientCalls(appSource, "public/app.js");

  assertEquals(skipped, 2, "getNotes() and setNoteTag() are the two; a third needs review");
  assert(
    !calls.some((call) => call.path.includes(":param:param")),
    "a path that already carries :param is not being double-substituted",
  );
});

Deno.test("contract: every call site in app.js resolves to a route the server serves", () => {
  const { calls } = clientCalls(appSource, "public/app.js");
  const routes = serverRoutes(serverSources);
  const mismatches = checkContract({ calls, routes, prefix: apiPrefix(appSource)! });

  assertEquals(
    mismatches.map((m) => `${m.call.raw} -> ${m.reason}`),
    [],
  );
});

Deno.test("contract: the families the app actually depends on are all present", () => {
  const { calls } = clientCalls(appSource, "public/app.js");
  const found = new Set(calls.map((c) => `${c.method} ${c.path}`));

  for (
    const expected of [
      "POST /notes",
      "GET /notes/:param",
      "PUT /notes/:param",
      "DELETE /notes/:param",
      "GET /notes/:param/versions",
      "POST /notes/:param/restore/:param",
      "GET /tags",
      "POST /tags",
      "PUT /tags/:param",
      "DELETE /tags/:param",
      "GET /search",
      "GET /search/suggestions",
      "POST /search/advanced",
      "POST /images",
      "DELETE /images/:param",
      "POST /auth/logout",
      "POST /auth/logout-all",
    ]
  ) {
    assert(found.has(expected), `expected the app to call ${expected}`);
  }
});

Deno.test("contract: the one non-request client URL (live sync) has a route", async () => {
  const liveSync = await read("public/services/live-sync.js");
  const path = websocketPath(liveSync);

  assertEquals(path, "/ws");
  const routes = serverRoutes(serverSources);
  assert(
    routes.some((route) => route.method === "GET" && routeMatches(route.pattern, path!)),
    "live sync opens a WebSocket the server does not serve",
  );
});

Deno.test("contract: the tag endpoints' literal path is pinned by api_paths_test", async () => {
  // setNoteTag() is one of the two dynamic sites, so its URL is composed by
  // tagEndpoint(). That helper's output is asserted - as a composed URL - in
  // api_paths_test.ts; this fails if that guard ever disappears.
  const guard = await read("tests/deno/api_paths_test.ts");
  assertStringIncludes(guard, "tagEndpoint(63, 9, true)");
  assertStringIncludes(guard, '"/api/notes/63/tags/9"');
});

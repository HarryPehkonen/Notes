/**
 * The null-body-status law: `204` must never carry a body, twice over.
 *
 * Why this file exists (2026-10-10): `DELETE /api/tags/:id` answered `204` and
 * then set `ctx.response.body = ""`. Oak refuses a body on a null-body status:
 * when it builds the DOM response it throws `Response with null body status
 * cannot have body`, and that throw happens while writing the response - outside
 * every handler's try/catch - so it took the process down. The tag was deleted,
 * every other in-flight request died, the WebSocket registry went with it, and
 * systemd restarted the unit. Tapping Delete on a tag in the drawer was a
 * self-inflicted restart in production. `DELETE /api/images/:filename` had the
 * identical shape, and the note route (`server/api/notes.js`) had already paid
 * for this bug once, which is why it sets a bare 204.
 *
 * So the guard is two-sided:
 *
 *   1. RUN IT - the tag and image delete handlers are invoked with a mock Oak
 *      context and the response is built the way Oak builds it, which is what
 *      throws on the pre-fix line.
 *   2. SCAN FOR IT - every router source under `server/api/` is read as text,
 *      and a handler that sets `status = 204` and a body on the same path fails
 *      the test. The routers are derived from `server/main.js` (the same
 *      derivation tests/deno/route_contract.ts uses), so a new route cannot
 *      relearn this lesson; the scanner is itself shown to fail on a planted
 *      snippet, so it cannot pass vacuously.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { testing } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { createTagsRouter } from "../../server/api/tags.js";
import { createImagesRouter } from "../../server/api/images.js";

/**
 * A route as exposed by Oak's Router iterator
 */
type RouteLike = {
  path: string;
  methods: string[];
  middleware: Array<(ctx: unknown) => Promise<void>>;
};

/**
 * Pull one route handler out of a router
 * @param router - Router instance from create*Router()
 * @param method - HTTP method, e.g. "DELETE"
 * @param path - Route path as registered, e.g. "/:id"
 */
function getRouteHandler(router: unknown, method: string, path: string) {
  for (const route of router as Iterable<RouteLike>) {
    if (route.path === path && route.methods.includes(method)) {
      return route.middleware[route.middleware.length - 1];
    }
  }
  throw new Error(`No ${method} ${path} route registered`);
}

/**
 * Fake db whose query() returns queued results
 * @param results - One entry per query the handler makes
 */
function fakeDb(results: Array<{ rows: unknown[] }>) {
  return {
    // deno-lint-ignore require-await
    query: async () => results.shift() ?? { rows: [] },
  };
}

/**
 * Mock context for a DELETE whose id travels in the path
 * @param db - Fake database client
 * @param id - Path parameter
 * @param extra - Further params, e.g. a tag id
 */
function deleteContext(db: unknown, id: string, extra: Record<string, string> = {}) {
  const ctx = testing.createMockContext({
    method: "DELETE",
    path: `/${id}`,
    params: { id, ...extra },
  });
  const state = ctx.state as unknown as Record<string, unknown>;
  state.user = { id: 7 };
  state.db = db;
  return ctx;
}

Deno.test("DELETE /api/tags/:id: 204 with no body, and the response builds", async () => {
  const ctx = deleteContext(fakeDb([{ rows: [{ id: 12 }] }]), "12");

  await getRouteHandler(createTagsRouter(), "DELETE", "/:id")(ctx);

  assertEquals(ctx.response.status, 204);
  assert(
    ctx.response.body === undefined || ctx.response.body === null,
    `204 must not carry a body, got ${JSON.stringify(ctx.response.body)}`,
  );

  // What Oak does when it writes the response. On the pre-fix line (body = "")
  // this throws `Response with null body status cannot have body` and the
  // process dies, so this call IS the regression test.
  const domResponse = await ctx.response.toDomResponse();
  assertEquals(domResponse.status, 204);
});

Deno.test("DELETE /api/images/:filename: 204 with no body, and the response builds", async () => {
  const filename = "123e4567-e89b-12d3-a456-426614174000.png";
  const ctx = deleteContext(fakeDb([{ rows: [{ id: 3 }] }]), filename, { filename });

  await getRouteHandler(createImagesRouter(), "DELETE", "/:filename")(ctx);

  assertEquals(ctx.response.status, 204);
  assert(
    ctx.response.body === undefined || ctx.response.body === null,
    `204 must not carry a body, got ${JSON.stringify(ctx.response.body)}`,
  );

  const domResponse = await ctx.response.toDomResponse();
  assertEquals(domResponse.status, 204);
  // The file removal inside the handler is denied under this suite's
  // permissions and the route logs that on purpose: losing the file must not
  // fail the delete. The database row is what the caller sees gone.
});

type Breach = { file: string; statusLine: number; bodyLine: number; text: string };

/**
 * Indentation of a source line - the branches in these files are brace blocks,
 * so indent is how "the same path" is delimited without parsing JavaScript.
 * @param line - One source line
 */
function indentWidth(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Find handlers that set a 204 status and then a body on the same path.
 *
 * Both defects took the same shape: the 204 assignment, then `body = ""` on the
 * next statement of the same branch. So for each 204 the scan looks forward at
 * the statements of that branch until the branch closes (an outdent, a closing
 * brace, a `return`, or another status assignment) and fails on a body
 * assignment; it also checks the statement immediately before, for the reversed
 * order.
 * @param source - Router file contents
 * @param file - File name, for the failure message
 */
function scanSource(source: string, file: string): { breaches: Breach[]; sites: number } {
  const lines = source.split("\n");
  const breaches: Breach[] = [];
  const skippable = (t: string) =>
    t === "" || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
  let sites = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!/\.status\s*=\s*204\b/.test(lines[i])) continue;
    sites++;
    const indent = indentWidth(lines[i]);

    for (let j = i + 1; j < lines.length; j++) {
      const text = lines[j].trim();
      if (skippable(text)) continue;
      if (indentWidth(lines[j]) < indent) break; // the branch closed
      if (/^[}\])]/.test(text)) break; // a block closed
      if (/^(return|throw)\b/.test(text)) break; // this path ends here
      if (/\.status\s*=/.test(text)) break; // another status on this path
      if (/\.body\s*=/.test(text)) {
        breaches.push({ file, statusLine: i + 1, bodyLine: j + 1, text });
        break;
      }
    }

    // The reversed order: a body set immediately before the 204.
    for (let j = i - 1; j >= 0; j--) {
      const text = lines[j].trim();
      if (skippable(text)) continue;
      if (indentWidth(lines[j]) < indent) break;
      if (/[{(]\s*$/.test(text)) break; // a block opened here
      if (/\.status\s*=/.test(text) || /^(return|throw)\b/.test(text)) break;
      if (/\.body\s*=/.test(text)) {
        breaches.push({ file, statusLine: i + 1, bodyLine: j + 1, text });
      }
      break; // only the statement immediately abutting the 204 matters
    }
  }

  return { breaches, sites };
}

const mainSource = await Deno.readTextFile(new URL("../../server/main.js", import.meta.url));
const routerFiles = [
  ...new Set(
    [...mainSource.matchAll(/from\s+"\.\/(api\/[\w-]+\.js)"/g)].map((m) => m[1]),
  ),
].sort();

Deno.test("routers: every 204 in server/api is body-free", async () => {
  assert(routerFiles.length >= 5, `expected the api routers, derived ${routerFiles.length}`);

  const breaches: Breach[] = [];
  let sites = 0;
  for (const file of routerFiles) {
    const source = await Deno.readTextFile(new URL(`../../server/${file}`, import.meta.url));
    const found = scanSource(source, file);
    breaches.push(...found.breaches);
    sites += found.sites;
  }

  // Anti-vacuity: three routes set a 204 today (notes, images, tags). A scanner
  // that matched nothing would otherwise "prove" the law holds everywhere.
  assert(sites >= 3, `expected at least 3 null-body-status routes, found ${sites}`);
  assertEquals(
    breaches,
    [],
    `204 responses must set no body - Oak throws while writing them and the process dies:\n` +
      breaches.map((b) =>
        `  server/${b.file}:${b.bodyLine} (after the 204 on line ${b.statusLine})`
      ).join("\n"),
  );
});

Deno.test("routers: the 204 scanner has teeth (planted breaches are caught)", () => {
  const plantedBad = `
  router.delete("/:id", async (ctx) => {
    try {
      ctx.response.status = 204;
      ctx.response.body = "";
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: "boom" };
    }
  });
`;
  const plantedGood = `
  router.delete("/:id", async (ctx) => {
    try {
      ctx.response.status = 204;
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: "boom" };
    }
  });
`;
  const plantedReversed = `
  router.delete("/:id", async (ctx) => {
    ctx.response.body = "";
    ctx.response.status = 204;
  });
`;

  const bad = scanSource(plantedBad, "planted.js");
  assertEquals(bad.sites, 1);
  assertEquals(bad.breaches.length, 1);
  assertEquals(bad.breaches[0].bodyLine, 5);

  const reversed = scanSource(plantedReversed, "planted.js");
  assertEquals(reversed.breaches.length, 1);

  // The neighbouring 500 handler sets a body a few lines below - that must not
  // count as a breach of the 204 above it.
  assertEquals(scanSource(plantedGood, "planted.js"), { breaches: [], sites: 1 });
});

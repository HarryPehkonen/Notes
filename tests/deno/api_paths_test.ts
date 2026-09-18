/**
 * Guards against the `/api/api/...` doubling bug.
 *
 * `app.js#request()` prepends `NotesApp.apiUrl` ("/api") to whatever path a
 * caller hands it. Every caller must therefore pass a path WITHOUT the "/api"
 * prefix - `tag-endpoint.js` once broke this rule (returned
 * `/api/notes/${noteId}/tags/${tagId}`), which composed into
 * `/api/api/notes/63/tags/9` and 404'd on every tag tap in the browser while
 * the unit tests, which asserted the buggy value in isolation, stayed green.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import { tagEndpoint } from "../../public/utils/tag-endpoint.js";

const app = await Deno.readTextFile(new URL("../../public/app.js", import.meta.url));
const notesRouter = await Deno.readTextFile(
  new URL("../../server/api/notes.js", import.meta.url),
);
const main = await Deno.readTextFile(new URL("../../server/main.js", import.meta.url));

async function collectJsFiles(dirUrl) {
  const files = [];
  for await (const entry of Deno.readDir(dirUrl)) {
    const entryUrl = new URL(entry.name, dirUrl.href.endsWith("/") ? dirUrl : `${dirUrl}/`);
    if (entry.isDirectory) {
      files.push(...(await collectJsFiles(entryUrl)));
    } else if (entry.isFile && entry.name.endsWith(".js")) {
      files.push(entryUrl);
    }
  }
  return files;
}

Deno.test("app: request() composes apiUrl and the given endpoint", () => {
  assertStringIncludes(app, 'apiUrl: "/api"');
  assertStringIncludes(app, "const url = `${this.apiUrl}${endpoint}`;");
});

Deno.test("no public/**/*.js call site passes an already-prefixed /api path to request()", async () => {
  const files = await collectJsFiles(new URL("../../public/", import.meta.url));
  const offenders = [];

  // `app.js` owns the prefix (`apiUrl`) and `sw.js` matches it at runtime to
  // decide what to keep out of the cache. Nothing else may name it in CODE: a
  // path built in a component, util, or service is relative to
  // `NotesApp.apiUrl`. Comments are stripped first - prose is allowed to name
  // the wire path ("GET /api/notes/:id/versions") without tripping the guard.
  const mayNameThePrefix = (pathname) =>
    pathname.endsWith("/public/app.js") || pathname.endsWith("/public/sw.js");
  const codeOnly = (source) =>
    source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trimStart();
        return !(trimmed.startsWith("//") || trimmed.startsWith("*") ||
          trimmed.startsWith("/*"));
      })
      .join("\n");

  for (const fileUrl of files) {
    const source = await Deno.readTextFile(fileUrl);
    const code = codeOnly(source);
    const reasons = [];
    if (/request\(\s*[`"']\/api/.test(code)) {
      reasons.push("request() is handed an /api-prefixed path");
    }
    if (!mayNameThePrefix(fileUrl.pathname) && code.includes("/api/")) {
      reasons.push("names the /api prefix; such paths are relative to NotesApp.apiUrl");
    }
    if (reasons.length) offenders.push(`${fileUrl.pathname}: ${reasons.join("; ")}`);
  }

  assertEquals(
    offenders,
    [],
    `these files would double the prefix into /api/api/...: ${offenders.join(", ")}`,
  );
});

Deno.test("the reported bug case: PUT /api/notes/63/tags/9 is the exact URL the browser fetches", () => {
  const endpoint = tagEndpoint(63, 9, true);
  const composedUrl = "/api" + endpoint.path;
  assertEquals(composedUrl, "/api/notes/63/tags/9");
});

Deno.test("server: the composed tag URL is a route that actually exists", () => {
  assert(
    notesRouter.includes('router.put("/:id/tags/:tagId"'),
    "server/api/notes.js must define PUT /:id/tags/:tagId",
  );
  assert(
    notesRouter.includes('router.delete("/:id/tags/:tagId"'),
    "server/api/notes.js must define DELETE /:id/tags/:tagId",
  );
  assertStringIncludes(main, 'router.use("/api/notes"');
});

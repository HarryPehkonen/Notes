/**
 * Structural guards for the tag endpoints.
 *
 * These assert the shape of the routes rather than their runtime behavior (the
 * repo has no Postgres test harness, and the end-to-end proof runs against the
 * deployed API). Each assertion here corresponds to a defect that was live in
 * production on 2026-09-10:
 *
 *   - `PUT /api/notes/:id` coerced any non-array `tags` to [] — a string value
 *     WIPED every tag on the note and returned 200.
 *   - There was no way to add or remove one tag, so clients rewrote the whole
 *     list and clobbered concurrent edits.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

const notesSource = await Deno.readTextFile(
  new URL("../../server/api/notes.js", import.meta.url),
);
const tagsSource = await Deno.readTextFile(
  new URL("../../server/api/tags.js", import.meta.url),
);

Deno.test("routes: one tag per request, id in the path", () => {
  assertStringIncludes(notesSource, 'router.put("/:id/tags/:tagId"');
  assertStringIncludes(notesSource, 'router.delete("/:id/tags/:tagId"');
});

Deno.test("routes: the silent-wipe coercion is gone", () => {
  assert(
    !notesSource.includes("Array.isArray(tags) ? tags : []"),
    "notes.js must not coerce a bad tags value to [] — that cleared tags with a 200",
  );
  assertStringIncludes(notesSource, "parseTagIds(tags)");
});

Deno.test("routes: tag ids are validated before they reach the database", () => {
  assertStringIncludes(notesSource, 'from "./tag-input.js"');
  assertStringIncludes(notesSource, "getOwnedTagIds");
  assertStringIncludes(notesSource, "unknown tag id");
});

Deno.test("routes: the DELETE tag route carries no request body", () => {
  // RFC 9110 9.3.5: content in a DELETE has no generally defined semantics.
  const start = notesSource.indexOf('router.delete("/:id/tags/:tagId"');
  assert(start > -1, "detach route not found");
  const body = notesSource.slice(start, start + 2000);
  assert(
    !body.includes("request.body"),
    "the detach route must not read a request body",
  );
});

Deno.test("routes: tag names are normalized through one helper", () => {
  assertStringIncludes(tagsSource, 'from "./tag-input.js"');
  const uses = tagsSource.match(/normalizeTagName\(/g) ?? [];
  assert(uses.length >= 2, `expected create + rename to normalize, found ${uses.length} call`);
  assert(
    !tagsSource.includes("name.trim().toLowerCase()"),
    "inline normalization should be replaced by the shared helper",
  );
});

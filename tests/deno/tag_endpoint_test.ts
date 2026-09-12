/**
 * Client-side tag edits: one tag at a time, immediately, optimistically.
 *
 * Tag taps are no longer collected into the note's save payload. They persist
 * on the spot against the per-tag endpoints, which is what makes a tap
 * idempotent (safe to retry on a flaky phone) and keeps two clients from
 * clobbering each other's tags with a whole-list rewrite.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

import { applyTagToggle, tagEndpoint } from "../../public/utils/tag-endpoint.js";

Deno.test("tagEndpoint: attaching is a PUT of the tag's own URL", () => {
  assertEquals(tagEndpoint(42, 6, true), {
    method: "PUT",
    path: "/api/notes/42/tags/6",
  });
});

Deno.test("tagEndpoint: detaching is a DELETE of the same URL, no body", () => {
  assertEquals(tagEndpoint(42, 6, false), {
    method: "DELETE",
    path: "/api/notes/42/tags/6",
  });
});

Deno.test("applyTagToggle: attaching puts the tag on, keeping the order", () => {
  const cpp = { id: 6, name: "c++" };
  const linux = { id: 1, name: "linux" };
  const next = applyTagToggle([linux], cpp, true);
  assertEquals(next.map((t) => t.id), [1, 6]);
});

Deno.test("applyTagToggle: attaching something already attached changes nothing", () => {
  const cpp = { id: 6, name: "c++" };
  const tags = [cpp];
  assertEquals(applyTagToggle(tags, cpp, true).map((t) => t.id), [6]);
});

Deno.test("applyTagToggle: detaching removes it", () => {
  const tags = [{ id: 1 }, { id: 6 }];
  assertEquals(applyTagToggle(tags, { id: 6 }, false).map((t) => t.id), [1]);
});

Deno.test("applyTagToggle: detaching something absent is a no-op, not an error", () => {
  const tags = [{ id: 1 }];
  assertEquals(applyTagToggle(tags, { id: 6 }, false).map((t) => t.id), [1]);
});

Deno.test("applyTagToggle: it never mutates the array it was given", () => {
  const tags = [{ id: 1 }];
  const next = applyTagToggle(tags, { id: 6 }, true);
  assertEquals(tags.length, 1, "the original list must be left alone");
  assert(next !== tags, "a new array is returned, so Lit sees the change");
});

Deno.test("applyTagToggle: a missing or malformed list degrades to the toggle alone", () => {
  assertEquals(applyTagToggle(undefined, { id: 6 }, true).map((t) => t.id), [6]);
  assertEquals(applyTagToggle([null, { id: 1 }], { id: 6 }, true).map((t) => t.id), [1, 6]);
});

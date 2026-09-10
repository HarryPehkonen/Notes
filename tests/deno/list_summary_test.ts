/**
 * How the notes header describes the list.
 *
 * "20 Notes" was a lie whenever more existed: the number was the page, not the
 * collection. These helpers make the distinction explicit and keep the wording
 * unit-testable instead of buried in a template.
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { formatListCount, remainingLabel } from "../../public/utils/list-summary.js";

Deno.test("count: more to load shows loaded of total", () => {
  assertEquals(formatListCount({ loaded: 20, total: 65 }), "20 of 65 Notes");
});

Deno.test("count: everything loaded shows the total alone", () => {
  assertEquals(formatListCount({ loaded: 20, total: 20 }), "20 Notes");
});

Deno.test("count: one note is singular", () => {
  assertEquals(formatListCount({ loaded: 1, total: 1 }), "1 Note");
  assertEquals(formatListCount({ loaded: 1, total: 65 }), "1 of 65 Notes");
});

Deno.test("count: an empty list says zero", () => {
  assertEquals(formatListCount({ loaded: 0, total: 0 }), "0 Notes");
});

Deno.test("count: an unknown total falls back to the loaded count", () => {
  assertEquals(formatListCount({ loaded: 20, total: null }), "20 Notes");
  assertEquals(formatListCount({ loaded: 20 }), "20 Notes");
});

Deno.test("count: a filtered page still shows the honest numbers", () => {
  assertEquals(formatListCount({ loaded: 20, total: 23 }), "20 of 23 Notes");
});

Deno.test("count label: a stale total never hides the rows on screen", () => {
  // Seen in the wild: switching the pinned-only filter back off restored 20
  // notes while `total` was still 0 from the previous query, and the header
  // read "0 Notes" with a full list underneath it. Trust the rows.
  assertEquals(formatListCount({ loaded: 20, total: 0 }), "20 Notes");
  assertEquals(formatListCount({ loaded: 20, total: 5 }), "20 Notes");
  assertEquals(formatListCount({ loaded: 0, total: 0 }), "0 Notes");
});

Deno.test("remainingLabel: a stale total falls back to the generic label", () => {
  assertEquals(remainingLabel({ loaded: 20, total: 0 }), "Load more");
});

Deno.test("remaining: nothing hidden gives no label", () => {
  assertEquals(remainingLabel({ loaded: 65, total: 65 }), "");
});

Deno.test("remaining: unknown total keeps the plain label", () => {
  assertEquals(remainingLabel({ loaded: 20, total: null }), "Load more");
  assertEquals(remainingLabel({ loaded: 20 }), "Load more");
});

Deno.test("remaining: never negative, even if the total is stale", () => {
  assertEquals(remainingLabel({ loaded: 30, total: 20 }), "Load more");
});

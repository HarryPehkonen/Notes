import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { formatMatch, hasMatchBadge } from "../../public/utils/search-match.js";

Deno.test("formatMatch: formats a similarity score as a percentage", () => {
  assertEquals(formatMatch(0.63), "63% match");
  assertEquals(formatMatch(1), "100% match");
  assertEquals(formatMatch(0), "0% match");
});

Deno.test("formatMatch: rounds to whole percent", () => {
  assertEquals(formatMatch(0.579), "58% match");
  assertEquals(formatMatch(0.995), "100% match");
});

Deno.test("formatMatch: clamps out-of-range scores", () => {
  assertEquals(formatMatch(1.5), "100% match");
  assertEquals(formatMatch(-0.5), "0% match");
});

Deno.test("formatMatch: returns null when there is no similarity score", () => {
  assertEquals(formatMatch(undefined), null);
  assertEquals(formatMatch(null), null);
  assertEquals(formatMatch("0.6"), null); // string, not a number
  assertEquals(formatMatch(NaN), null);
  assertEquals(formatMatch(Infinity), null);
});

Deno.test("hasMatchBadge: true only for finite numeric similarity", () => {
  assert(hasMatchBadge({ similarity: 0.63 }));
  assert(hasMatchBadge({ similarity: 0 }));
  assertEquals(hasMatchBadge({}), false);
  assertEquals(hasMatchBadge({ similarity: undefined }), false);
  assertEquals(hasMatchBadge({ similarity: "0.6" }), false);
  assertEquals(hasMatchBadge(null), false);
  assertEquals(hasMatchBadge(undefined), false);
});

Deno.test("hasMatchBadge: text-search results never show a badge", () => {
  // Text-search results carry rank but NOT similarity — no badge
  assertEquals(hasMatchBadge({ rank: 1 }), false);
});

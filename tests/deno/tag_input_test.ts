/**
 * Tag input validation — the contract the notes API promises.
 *
 * These exist because the live API answered the same wrong input four different
 * ways: `tags: ["c++"]` was a 500, `tags: "c++"` on update silently WIPED every
 * tag on the note, `[999]` was silently ignored on update and a 500 on create.
 * One validator, one answer: anything that is not an array of positive integers
 * is a 400, and absence is the only thing that means "leave them alone".
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

import { findUnknownTagIds, normalizeTagName, parseTagIds } from "../../server/api/tag-input.js";

// --- parseTagIds: absence vs empty vs garbage -----------------------------

Deno.test("parseTagIds: an absent field means leave the tags alone", () => {
  const result = parseTagIds(undefined);
  assertEquals(result.ok, true);
  assertEquals(result.ids, null);
});

Deno.test("parseTagIds: an empty array means clear them, and is not an error", () => {
  const result = parseTagIds([]);
  assertEquals(result.ok, true);
  assertEquals(result.ids, []);
});

Deno.test("parseTagIds: a bare string is an error, never a silent wipe", () => {
  const result = parseTagIds("c++");
  assertEquals(result.ok, false);
  assertEquals(result.error, "tags must be an array of tag ids");
});

Deno.test("parseTagIds: null is an error too — [] is the documented way to clear", () => {
  const result = parseTagIds(null);
  assertEquals(result.ok, false);
  assertEquals(result.error, "tags must be an array of tag ids");
});

Deno.test("parseTagIds: tag NAMES are rejected, because notes reference ids", () => {
  const result = parseTagIds(["c++", "linux"]);
  assertEquals(result.ok, false);
  assertEquals(result.error, "tags must be an array of tag ids");
});

Deno.test("parseTagIds: only positive integers pass", () => {
  for (const bad of [[0], [-1], [1.5], [NaN], [Infinity], ["6"], [null], [{}], [[]]]) {
    const result = parseTagIds(bad);
    assertEquals(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assertEquals(result.error, "tags must be an array of tag ids");
  }
});

Deno.test("parseTagIds: duplicates collapse, order is kept", () => {
  const result = parseTagIds([3, 1, 3, 2, 1]);
  assertEquals(result.ok, true);
  assertEquals(result.ids, [3, 1, 2]);
});

Deno.test("parseTagIds: a plain list of ids passes through", () => {
  const result = parseTagIds([1, 2, 3]);
  assertEquals(result.ok, true);
  assertEquals(result.ids, [1, 2, 3]);
});

// --- normalizeTagName: tags are lower-case, always -------------------------

Deno.test("normalizeTagName: upper-case becomes lower-case", () => {
  assertEquals(normalizeTagName("CPP").name, "cpp");
  assertEquals(normalizeTagName("Linux").name, "linux");
});

Deno.test("normalizeTagName: stray whitespace is trimmed", () => {
  assertEquals(normalizeTagName("  C++  ").name, "c++");
  assertEquals(normalizeTagName("\tTNG\n").name, "tng");
});

Deno.test("normalizeTagName: a name that is only whitespace is refused", () => {
  assert(normalizeTagName("").ok === false);
  assert(normalizeTagName("   ").ok === false);
});

Deno.test("normalizeTagName: non-strings are refused, not coerced", () => {
  for (const bad of [42, null, {}, ["cpp"]]) {
    assert(normalizeTagName(bad).ok === false, `expected ${JSON.stringify(bad)} to be refused`);
  }
});

Deno.test("normalizeTagName: the 100-char column limit is enforced before the DB sees it", () => {
  assertEquals(normalizeTagName("a".repeat(100)).ok, true);
  const tooLong = normalizeTagName("a".repeat(101));
  assertEquals(tooLong.ok, false);
  assert(tooLong.error.includes("100"));
});

Deno.test("normalizeTagName: length is measured after trimming", () => {
  // "  " + 100 chars + "  " is a 100-char tag, not a 104-char failure.
  assertEquals(normalizeTagName("  " + "a".repeat(100) + "  ").ok, true);
});

// --- findUnknownTagIds: which id to name in the 400 -----------------------

Deno.test("findUnknownTagIds: reports ids the user does not own", () => {
  assertEquals(findUnknownTagIds([1, 2, 3], [1, 3]), [2]);
  assertEquals(findUnknownTagIds([9], [1]), [9]);
});

Deno.test("findUnknownTagIds: everything owned means no complaint", () => {
  assertEquals(findUnknownTagIds([1, 2], [1, 2, 3]), []);
  assertEquals(findUnknownTagIds([], [1]), []);
});

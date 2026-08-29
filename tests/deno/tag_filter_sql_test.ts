/**
 * Tri-state tag filters: the server-side query building.
 *
 * A tag is in one of three states for a query: "any" (not mentioned),
 * "required" (the note must carry it) or "excluded" (the note must not carry
 * it). Every endpoint that filters by tags - the notes list, advanced search
 * and semantic search - has to agree on those semantics, so the SQL fragment
 * and the parameter parsing live in one pure module and are tested here
 * without a database.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildTagFilterClause,
  parseTagFilterParams,
  parseTagIds,
} from "../../server/api/tag-filter.js";
import { parseTagIds as parseTagIdsFromSemantic } from "../../server/api/semantic.js";

// parseTagIds - unchanged behaviour, now living in the shared module

Deno.test("parseTagIds: still parses a comma-separated id list", () => {
  assertEquals(parseTagIds("1,2,3"), [1, 2, 3]);
  assertEquals(parseTagIds("2,2,5,2"), [2, 5]);
  assertEquals(parseTagIds("abc"), []);
});

Deno.test("parseTagIds: semantic.js keeps re-exporting it, so existing callers still work", () => {
  assertEquals(parseTagIdsFromSemantic("3,5"), [3, 5]);
});

// parseTagFilterParams - one place decides what a request asked for

Deno.test("parseTagFilterParams: no parameters at all means no tag filtering", () => {
  assertEquals(parseTagFilterParams({}), {
    tagIds: [],
    excludeTagIds: [],
    invalid: false,
  });
});

Deno.test("parseTagFilterParams: required and excluded ids are parsed separately", () => {
  assertEquals(parseTagFilterParams({ tags: "1,2", excludeTags: "3,4" }), {
    tagIds: [1, 2],
    excludeTagIds: [3, 4],
    invalid: false,
  });
});

Deno.test("parseTagFilterParams: an exclusion-only request is perfectly valid", () => {
  assertEquals(parseTagFilterParams({ excludeTags: "9" }), {
    tagIds: [],
    excludeTagIds: [9],
    invalid: false,
  });
});

Deno.test("parseTagFilterParams: a non-empty parameter with no usable id is invalid", () => {
  assertEquals(parseTagFilterParams({ tags: "abc" }).invalid, true);
  assertEquals(parseTagFilterParams({ excludeTags: "abc" }).invalid, true);
  assertEquals(parseTagFilterParams({ tags: "1", excludeTags: "-2" }).invalid, true);
});

Deno.test("parseTagFilterParams: empty or blank parameters simply mean no filter", () => {
  assertEquals(parseTagFilterParams({ tags: "", excludeTags: "" }).invalid, false);
  assertEquals(parseTagFilterParams({ tags: "   " }).invalid, false);
  assertEquals(parseTagFilterParams({ tags: null, excludeTags: undefined }).invalid, false);
});

Deno.test("parseTagFilterParams: arrays are accepted too, for the JSON body of advanced search", () => {
  assertEquals(parseTagFilterParams({ tags: [1, 2], excludeTags: [3] }), {
    tagIds: [1, 2],
    excludeTagIds: [3],
    invalid: false,
  });
});

Deno.test("parseTagFilterParams: a body array of junk is invalid, not silently unfiltered", () => {
  assertEquals(parseTagFilterParams({ tags: ["abc"] }).invalid, true);
  assertEquals(parseTagFilterParams({ tags: [] }).invalid, false);
});

// buildTagFilterClause - the SQL fragment shared by every filtered endpoint

Deno.test("buildTagFilterClause: nothing selected adds nothing to the query", () => {
  const { clause, params, nextIndex } = buildTagFilterClause({ startIndex: 5 });

  assertEquals(clause, "");
  assertEquals(params, []);
  assertEquals(nextIndex, 5, "an unfiltered query binds exactly the parameters it always had");
});

Deno.test("buildTagFilterClause: required tags are an AND-all membership test", () => {
  const { clause, params, nextIndex } = buildTagFilterClause({
    tagIds: [3, 5],
    startIndex: 5,
  });

  assert(clause.includes("n.id IN ("), "membership on the note id");
  assert(clause.includes("nt.tag_id = ANY($5::int[])"), "ids bound at the given index");
  assert(
    clause.includes("HAVING COUNT(DISTINCT nt.tag_id) = $6"),
    "a note must carry ALL required tags, not any of them",
  );
  assertEquals(params, [[3, 5], 2]);
  assertEquals(nextIndex, 7);
});

Deno.test("buildTagFilterClause: excluded tags keep out every note carrying any of them", () => {
  const { clause, params, nextIndex } = buildTagFilterClause({
    excludeTagIds: [4],
    startIndex: 5,
  });

  assert(clause.includes("NOT EXISTS ("), "exclusion is an anti-join, never a NOT IN");
  assert(clause.includes("tag_id = ANY($5::int[])"), "excluded ids bound at the given index");
  assert(!clause.includes("HAVING"), "excluding needs no count - one match is enough to drop it");
  assertEquals(params, [[4]]);
  assertEquals(nextIndex, 6, "exclusion binds one parameter, not two");
});

Deno.test("buildTagFilterClause: required and excluded combine in one query", () => {
  const { clause, params, nextIndex } = buildTagFilterClause({
    tagIds: [3],
    excludeTagIds: [4, 7],
    startIndex: 2,
  });

  assert(clause.includes("nt.tag_id = ANY($2::int[])"), "required ids first");
  assert(clause.includes("HAVING COUNT(DISTINCT nt.tag_id) = $3"));
  assert(clause.includes("tag_id = ANY($4::int[])"), "excluded ids follow the required ones");
  assertEquals(params, [[3], 1, [4, 7]]);
  assertEquals(nextIndex, 5);
});

Deno.test("buildTagFilterClause: the exclusion subquery correlates with the outer note", () => {
  const { clause } = buildTagFilterClause({ excludeTagIds: [4], startIndex: 2 });

  assert(
    /NOT EXISTS \(\s*SELECT 1\s+FROM note_tags (\w+)\s+WHERE \1\.note_id = n\.id/.test(clause),
    `the anti-join must be correlated to the note being filtered: ${clause}`,
  );
});

Deno.test("buildTagFilterClause: the note column is overridable for other query shapes", () => {
  const { clause } = buildTagFilterClause({
    tagIds: [3],
    excludeTagIds: [4],
    startIndex: 2,
    column: "ar.id",
  });

  assert(clause.includes("ar.id IN ("), "required membership uses the given column");
  assert(clause.includes("note_id = ar.id"), "the anti-join uses the given column too");
  assert(!clause.includes("n.id"), "no stray reference to a table alias that is not in scope");
});

Deno.test("buildTagFilterClause: every clause is ANDed on, so it can follow any WHERE", () => {
  const required = buildTagFilterClause({ tagIds: [3], startIndex: 2 }).clause;
  const excluded = buildTagFilterClause({ excludeTagIds: [3], startIndex: 2 }).clause;

  assert(required.trimStart().startsWith("AND "), `required clause: ${required}`);
  assert(excluded.trimStart().startsWith("AND "), `excluded clause: ${excluded}`);
});

Deno.test("buildTagFilterClause: startIndex defaults to the first free parameter slot", () => {
  const { clause, params } = buildTagFilterClause({ tagIds: [3] });

  assert(clause.includes("ANY($1::int[])"));
  assertEquals(params, [[3], 1]);
});

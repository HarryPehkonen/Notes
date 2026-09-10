/**
 * The notes list must be able to say "20 of 65", not "20".
 *
 * The list endpoint pages at 20 notes and the header showed only the number it
 * had loaded, so anything past page one looked like it did not exist. Fixing
 * that needs a real total: a COUNT that honours exactly the same filters as the
 * list query. These tests pin down the shared-filter property (a count that
 * ignores a filter is worse than no count) and the shape of the query.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildNotesCountQuery, buildNotesListQuery } from "../../server/database/client.js";

/**
 * The filter half of a notes query: FROM notes n through the last condition,
 * without the SELECT list (which contains its own subquery) and without the
 * ORDER BY / LIMIT that only the list query needs.
 */
function filterPart(query) {
  const start = query.indexOf("FROM notes n");
  const order = query.indexOf(" ORDER BY ");
  return query.slice(start, order === -1 ? undefined : order);
}

Deno.test("count query: counts the user's active notes", () => {
  const { query, params } = buildNotesCountQuery(7, {});
  assert(query.includes("COUNT(*)::int"), "must ask the database for a count");
  assert(query.includes("FROM notes n"), "must count notes");
  assert(query.includes("WHERE n.user_id = $1"), "scoped to one user");
  assert(query.includes("AND NOT n.is_archived"), "archived notes are not listed");
  assertEquals(params, [7]);
});

Deno.test("count query: a total, not a page - no LIMIT or OFFSET", () => {
  const { query } = buildNotesCountQuery(7, { limit: 20, offset: 40 });
  assert(!query.includes("LIMIT"), "a count must not be paginated");
  assert(!query.includes("OFFSET"), "a count must not be paginated");
});

Deno.test("count query: honours exactly the filters of the list query", () => {
  const options = {
    limit: 20,
    offset: 40,
    search: "flight",
    pinned: true,
    tags: [1, 2],
    excludeTags: [3],
  };

  const list = buildNotesListQuery(7, options);
  const count = buildNotesCountQuery(7, options);

  assertEquals(
    filterPart(count.query),
    filterPart(list.query),
    "a count that drops a filter would report the wrong total",
  );
  assertEquals(
    count.params,
    list.params.slice(0, -2),
    "same filter parameters, minus the trailing limit/offset",
  );
});

Deno.test("count query: archived view counts archived notes", () => {
  const { query } = buildNotesCountQuery(7, { archived: true });
  assert(query.includes("AND n.is_archived = true"));
  assert(!query.includes("AND NOT n.is_archived"));
});

Deno.test("count query: tag filters reach the count too", () => {
  const { query, params } = buildNotesCountQuery(7, { tags: [4], excludeTags: [5] });
  assert(query.includes("NOT EXISTS ("), "exclusions must be honoured");
  assert(query.includes("HAVING COUNT(DISTINCT nt.tag_id)"), "requirements too");
  assertEquals(params, [7, [4], 1, [5]]);
});

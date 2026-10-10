/**
 * The drawer's "All Notes" number: notes with at least one tag.
 *
 * What it used to be: `tags.reduce((sum, t) => sum + t.note_count, 0)` - the number of
 * (note, tag) LINKS. On production (2026-10-10) that read 74 while only 63 notes carried
 * at least one tag (89 notes, 26 untagged, 11 notes with a second tag). The gap is the
 * multi-tagged notes, so the error follows the data rather than sitting at a constant
 * offset: in the small local fixture the same sum reads 27 against a true 16. That is why
 * it looked plausible for as long as it did.
 *
 * The client cannot fix this by arithmetic (it holds one page of notes, and the tag rows
 * hold links), so the server supplies the count on the endpoint the drawer already calls:
 * `GET /api/tags` -> `meta.taggedCount`. These tests hold all three halves of that: the
 * COUNT query counts notes, the route reports it in `meta` without changing `data`, and the
 * client renders the server's number rather than a sum of its own.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { TAGGED_NOTES_COUNT_SQL } from "../../server/database/client.js";
import { formatTaggedCount } from "../../public/utils/tagged-count.js";

const tagsSource = await Deno.readTextFile(
  new URL("../../server/api/tags.js", import.meta.url),
);
const managerSource = await Deno.readTextFile(
  new URL("../../public/components/tag-manager.js", import.meta.url),
);
const appSource = await Deno.readTextFile(
  new URL("../../public/components/notes-app.js", import.meta.url),
);

Deno.test("count: the query counts notes, not (note, tag) links", () => {
  assertStringIncludes(
    TAGGED_NOTES_COUNT_SQL,
    "COUNT(DISTINCT n.id)",
    "COUNT(*) over note_tags counts links: a note with two tags would count twice",
  );
  assertStringIncludes(TAGGED_NOTES_COUNT_SQL, "JOIN note_tags");
  assertStringIncludes(TAGGED_NOTES_COUNT_SQL, "WHERE n.user_id = $1", "scoped to one user");
  assertStringIncludes(
    TAGGED_NOTES_COUNT_SQL,
    "NOT n.is_archived",
    "archived notes are not in the list this number describes",
  );
  assert(
    !TAGGED_NOTES_COUNT_SQL.includes("tags t"),
    "the tag table is not needed to answer this, and joining it reintroduces the link count",
  );
});

Deno.test("count: the route reports it in meta and leaves data as the tag array", () => {
  assertStringIncludes(tagsSource, "countTaggedNotes(user.id)");
  assertStringIncludes(tagsSource, "meta: { taggedCount }");
  // Every existing client reads `data` as the array of tags; the count must not turn it
  // into an object under their feet.
  assertStringIncludes(tagsSource, "data: tags,");
});

Deno.test("count: the drawer renders the server's number", () => {
  assertStringIncludes(managerSource, "formatTaggedCount(this.taggedCount)");
  const sum = managerSource.match(/reduce\(\s*\(sum, t\)/);
  assertEquals(sum, null, "no client-side sum of tag counts survives in tag-manager.js");
  assertStringIncludes(appSource, '.taggedCount="${this.taggedCount}"');
});

Deno.test("count: an unknown value renders as nothing, not as zero", () => {
  assertEquals(formatTaggedCount(63), "63");
  assertEquals(formatTaggedCount(0), "0", "a real zero is a real number");
  assertEquals(formatTaggedCount(null), "", "no answer yet is not an answer of zero");
  assertEquals(formatTaggedCount(undefined), "");
});

Deno.test("drawer: Home reports the collection, not the page on screen", () => {
  // "Home 20" beside a header reading "20 of 89 Notes": the row rendered the loaded page.
  assertStringIncludes(appSource, "this.allNotesTotal ?? this.notes.length");
  assertStringIncludes(
    appSource,
    "this.allNotesTotal = this.total;",
    "the collection's size comes from the one unfiltered fetch, not from the filter in force",
  );
  assert(
    !appSource.includes('class="cnt">${this.notes.length}'),
    "the Home row must not go back to counting the loaded page",
  );
});

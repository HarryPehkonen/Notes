/**
 * Tag filtering at the search bar.
 *
 * The selection logic and the search-request shaping are pulled out of the Lit
 * component so they can be tested without a DOM. The component keeps only
 * rendering and event plumbing.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  clearTagSelection,
  filterTagOptions,
  isTagSelected,
  removeTagFromSelection,
  selectedTagIds,
  tagFilterLabel,
  tagSelectionDetail,
  toggleTagSelection,
} from "../../public/utils/tag-filter.js";
import { buildSearchParams } from "../../public/utils/search-mode.js";

const home = { id: 3, name: "home", color: "#667eea" };
const work = { id: 5, name: "work", color: "#f59e0b" };
const errands = { id: 9, name: "errands", color: "#10b981" };

// isTagSelected

Deno.test("isTagSelected: matches on id, not object identity", () => {
  assertEquals(isTagSelected([home, work], 5), true);
  assertEquals(isTagSelected([home, work], 9), false);
  assertEquals(isTagSelected([], 3), false);
});

Deno.test("isTagSelected: a missing selection list is simply nothing selected", () => {
  assertEquals(isTagSelected(null, 3), false);
  assertEquals(isTagSelected(undefined, 3), false);
});

// toggleTagSelection - the picker's row tap

Deno.test("toggleTagSelection: an unselected tag is added", () => {
  assertEquals(toggleTagSelection([home], work), [home, work]);
});

Deno.test("toggleTagSelection: a selected tag is removed", () => {
  assertEquals(toggleTagSelection([home, work], home), [work]);
});

Deno.test("toggleTagSelection: matching is by id, so a refetched tag object still toggles off", () => {
  const refetched = { id: 3, name: "home", color: "#000000" };
  assertEquals(toggleTagSelection([home, work], refetched), [work]);
});

Deno.test("toggleTagSelection: never mutates the array it was given", () => {
  const selection = [home];
  const next = toggleTagSelection(selection, work);
  assertEquals(selection, [home], "Lit needs a new array to see the change");
  assert(next !== selection);
});

Deno.test("toggleTagSelection: works from an empty or missing selection", () => {
  assertEquals(toggleTagSelection([], home), [home]);
  assertEquals(toggleTagSelection(undefined, home), [home]);
});

// removeTagFromSelection - the chip's own "x"

Deno.test("removeTagFromSelection: drops just that tag", () => {
  assertEquals(removeTagFromSelection([home, work, errands], 5), [home, errands]);
});

Deno.test("removeTagFromSelection: removing something absent is a no-op", () => {
  assertEquals(removeTagFromSelection([home], 999), [home]);
});

Deno.test("removeTagFromSelection: never mutates the array it was given", () => {
  const selection = [home, work];
  const next = removeTagFromSelection(selection, 3);
  assertEquals(selection, [home, work]);
  assert(next !== selection);
});

// clearTagSelection - the "Clear all" chip

Deno.test("clearTagSelection: yields an empty selection", () => {
  assertEquals(clearTagSelection(), []);
});

// selectedTagIds / tagSelectionDetail - what goes to the server and the event

Deno.test("selectedTagIds: pulls the ids in selection order", () => {
  assertEquals(selectedTagIds([work, home]), [5, 3]);
  assertEquals(selectedTagIds([]), []);
  assertEquals(selectedTagIds(null), []);
});

Deno.test("tagSelectionDetail: the 'tags-selected' payload keeps `tags` and adds `tagIds`", () => {
  assertEquals(tagSelectionDetail([home, work]), {
    tags: [home, work],
    tagIds: [3, 5],
  });
});

Deno.test("tagSelectionDetail: clearing everything is still a well-formed payload", () => {
  assertEquals(tagSelectionDetail([]), { tags: [], tagIds: [] });
  assertEquals(tagSelectionDetail(undefined), { tags: [], tagIds: [] });
});

// filterTagOptions - the picker must stay usable with MANY tags

Deno.test("filterTagOptions: an empty filter shows every tag", () => {
  assertEquals(filterTagOptions([home, work, errands], ""), [home, work, errands]);
  assertEquals(filterTagOptions([home, work], "   "), [home, work]);
});

Deno.test("filterTagOptions: matches a case-insensitive substring of the name", () => {
  assertEquals(filterTagOptions([home, work, errands], "OR"), [work]);
  assertEquals(filterTagOptions([home, work, errands], "rr"), [errands]);
});

Deno.test("filterTagOptions: no match is an empty list, not everything", () => {
  assertEquals(filterTagOptions([home, work], "zzz"), []);
});

Deno.test("filterTagOptions: a leading '#' is stripped so #-typing still finds tags", () => {
  assertEquals(filterTagOptions([home, work], "#home"), [home]);
});

Deno.test("filterTagOptions: a missing tag list is an empty list", () => {
  assertEquals(filterTagOptions(null, "a"), []);
  assertEquals(filterTagOptions(undefined, ""), []);
});

// tagFilterLabel - the button must always say what it is, never an icon alone

Deno.test("tagFilterLabel: reads 'Tags' with nothing selected", () => {
  assertEquals(tagFilterLabel([]), "Tags");
  assertEquals(tagFilterLabel(null), "Tags");
});

Deno.test("tagFilterLabel: shows the count so the filter is visible at a glance", () => {
  assertEquals(tagFilterLabel([home]), "Tags (1)");
  assertEquals(tagFilterLabel([home, work, errands]), "Tags (3)");
});

// buildSearchParams - the wire format, including the new server-side `tags`

Deno.test("buildSearchParams: a bare query", () => {
  assertEquals(buildSearchParams("led", {}), "q=led");
});

Deno.test("buildSearchParams: limit and offset ride along when given", () => {
  assertEquals(buildSearchParams("led", { limit: 5, offset: 10 }), "q=led&limit=5&offset=10");
});

Deno.test("buildSearchParams: an offset of 0 is not worth sending", () => {
  assertEquals(buildSearchParams("led", { offset: 0 }), "q=led");
});

Deno.test("buildSearchParams: semantic mode sets the flag the server expects", () => {
  assertEquals(buildSearchParams("led", { semantic: true }), "q=led&semantic=1");
});

Deno.test("buildSearchParams: only a real checked box turns semantic on", () => {
  assertEquals(buildSearchParams("led", { semantic: "true" }), "q=led");
  assertEquals(buildSearchParams("led", { semantic: 1 }), "q=led");
});

Deno.test("buildSearchParams: selected tags become the comma-separated `tags` param", () => {
  assertEquals(
    decodeURIComponent(buildSearchParams("led", { tags: [3, 5] })),
    "q=led&tags=3,5",
  );
});

Deno.test("buildSearchParams: tags apply in semantic mode too - that is the whole point", () => {
  assertEquals(
    decodeURIComponent(buildSearchParams("led", { semantic: true, tags: [3, 5] })),
    "q=led&semantic=1&tags=3,5",
  );
});

Deno.test("buildSearchParams: an empty or missing tag selection sends no `tags` param", () => {
  assert(!buildSearchParams("led", { tags: [] }).includes("tags"));
  assert(!buildSearchParams("led", {}).includes("tags"));
});

Deno.test("buildSearchParams: the query is encoded, not concatenated raw", () => {
  const params = new URLSearchParams(buildSearchParams("a & b #home", {}));
  assertEquals(params.get("q"), "a & b #home");
});

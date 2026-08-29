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
  cycleTagSelection,
  excludedTagIds,
  filterTagOptions,
  isTagSelected,
  nextTagState,
  removeTagFromSelection,
  requiredTagIds,
  tagFilterLabel,
  tagFilterState,
  tagSelectionDetail,
  tagStateMeta,
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

// tagFilterState / nextTagState - the three states a tag can be in

Deno.test("tagFilterState: a tag nobody selected is 'any'", () => {
  assertEquals(tagFilterState([], 3), "any");
  assertEquals(tagFilterState(null, 3), "any");
  assertEquals(tagFilterState([{ ...work, filterState: "required" }], 3), "any");
});

Deno.test("tagFilterState: a selected tag reports its own state", () => {
  const selection = [
    { ...home, filterState: "required" },
    { ...work, filterState: "excluded" },
  ];
  assertEquals(tagFilterState(selection, 3), "required");
  assertEquals(tagFilterState(selection, 5), "excluded");
});

Deno.test("tagFilterState: a selected tag with no state at all counts as required", () => {
  assertEquals(
    tagFilterState([home], 3),
    "required",
    "a selection saved before tri-state existed still means 'must have this tag'",
  );
});

Deno.test("nextTagState: click cycles any -> required -> excluded -> any", () => {
  assertEquals(nextTagState("any"), "required");
  assertEquals(nextTagState("required"), "excluded");
  assertEquals(nextTagState("excluded"), "any");
});

Deno.test("nextTagState: anything unrecognised starts the cycle from the beginning", () => {
  assertEquals(nextTagState(undefined), "required");
  assertEquals(nextTagState("nonsense"), "required");
});

// cycleTagSelection - one click, wherever the tag is rendered

Deno.test("cycleTagSelection: the first click makes a tag required", () => {
  const next = cycleTagSelection([], home);
  assertEquals(next, [{ ...home, filterState: "required" }]);
});

Deno.test("cycleTagSelection: the second click flips it to excluded", () => {
  const next = cycleTagSelection([{ ...home, filterState: "required" }], home);
  assertEquals(next, [{ ...home, filterState: "excluded" }]);
});

Deno.test("cycleTagSelection: the third click drops it back out of the filter", () => {
  const next = cycleTagSelection([{ ...home, filterState: "excluded" }], home);
  assertEquals(next, []);
});

Deno.test("cycleTagSelection: a tag keeps its place in the chip row while it cycles", () => {
  const selection = [
    { ...home, filterState: "required" },
    { ...work, filterState: "required" },
  ];
  const next = cycleTagSelection(selection, home);
  assertEquals(next.map((t) => t.id), [3, 5], "the chips must not reshuffle under the finger");
  assertEquals(next[0].filterState, "excluded");
});

Deno.test("cycleTagSelection: matching is by id, so a refetched tag object still cycles", () => {
  const refetched = { id: 3, name: "home", color: "#000000" };
  const next = cycleTagSelection([{ ...home, filterState: "required" }], refetched);
  assertEquals(next[0].filterState, "excluded");
  assertEquals(next[0].color, "#000000", "the freshest tag data wins");
});

Deno.test("cycleTagSelection: a legacy stateless entry cycles required -> excluded", () => {
  assertEquals(cycleTagSelection([home], home), [{ ...home, filterState: "excluded" }]);
});

Deno.test("cycleTagSelection: never mutates the array it was given", () => {
  const selection = [{ ...home, filterState: "required" }];
  const next = cycleTagSelection(selection, home);
  assertEquals(selection, [{ ...home, filterState: "required" }], "Lit needs a new array");
  assert(next !== selection);
});

Deno.test("cycleTagSelection: works from an empty or missing selection", () => {
  assertEquals(cycleTagSelection(undefined, home), [{ ...home, filterState: "required" }]);
});

// requiredTagIds / excludedTagIds - what the two wire parameters carry

Deno.test("requiredTagIds / excludedTagIds: split the selection by sign", () => {
  const selection = [
    { ...home, filterState: "required" },
    { ...work, filterState: "excluded" },
    { ...errands, filterState: "required" },
  ];
  assertEquals(requiredTagIds(selection), [3, 9]);
  assertEquals(excludedTagIds(selection), [5]);
});

Deno.test("requiredTagIds: a stateless entry is required, so old links keep working", () => {
  assertEquals(requiredTagIds([home]), [3]);
  assertEquals(excludedTagIds([home]), []);
});

Deno.test("requiredTagIds / excludedTagIds: no selection means two empty lists", () => {
  assertEquals(requiredTagIds([]), []);
  assertEquals(excludedTagIds(null), []);
});

// tagStateMeta - the three states must be obvious on the control itself

Deno.test("tagStateMeta: each state has its own label, marker and class", () => {
  const required = tagStateMeta("required");
  const excluded = tagStateMeta("excluded");

  assertEquals(required.state, "required");
  assertEquals(excluded.state, "excluded");
  assert(required.label.length > 0 && excluded.label.length > 0, "always spelled out in words");
  assert(required.label !== excluded.label);
  assert(required.marker !== excluded.marker, "and distinguishable without reading the label");
  assert(required.className !== excluded.className, "so colour can differ too");
});

Deno.test("tagStateMeta: 'any' is a real state, not a missing one", () => {
  const any = tagStateMeta("any");
  assertEquals(any.state, "any");
  assert(any.label.length > 0);
});

Deno.test("tagStateMeta: an unknown state degrades to 'any' rather than rendering blank", () => {
  assertEquals(tagStateMeta(undefined).state, "any");
  assertEquals(tagStateMeta("nonsense").state, "any");
});

Deno.test("tagStateMeta: each state explains what it does to the results", () => {
  for (const state of ["any", "required", "excluded"]) {
    assert(tagStateMeta(state).description.length > 0, `${state} needs a plain-words hint`);
  }
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

// tagSelectionDetail - what goes to the server and rides on the event

Deno.test("tagSelectionDetail: the 'tags-selected' payload carries both signs", () => {
  const selection = [
    { ...home, filterState: "required" },
    { ...work, filterState: "excluded" },
  ];
  assertEquals(tagSelectionDetail(selection), {
    tags: selection,
    requiredTagIds: [3],
    excludedTagIds: [5],
  });
});

Deno.test("tagSelectionDetail: clearing everything is still a well-formed payload", () => {
  assertEquals(tagSelectionDetail([]), { tags: [], requiredTagIds: [], excludedTagIds: [] });
  assertEquals(tagSelectionDetail(undefined), {
    tags: [],
    requiredTagIds: [],
    excludedTagIds: [],
  });
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

/**
 * Tri-state tag filtering.
 *
 * A tag is in one of three states: "any" (not part of the filter at all),
 * "required" (only notes WITH it) or "excluded" (only notes WITHOUT it). A
 * click cycles any -> required -> excluded -> any, wherever the tag is drawn.
 *
 * Kept out of the Lit component so it is testable without a DOM, and so the
 * search bar and the tag-manager can agree on one set of rules for the single
 * `selectedTags` array that notes-app owns.
 *
 * Every function returns a NEW array - Lit only re-renders on identity change,
 * and mutating the shared selection in place would leave one surface stale.
 */

/**
 * Is this tag part of the current selection?
 *
 * Compares ids, not object identity: tag objects are refetched (after a rename
 * or a colour change) and would otherwise stop matching their own chip.
 *
 * @param {Array<Object>|null|undefined} selectedTags - Current selection
 * @param {number} tagId - Tag id to look for
 * @returns {boolean}
 */
export function isTagSelected(selectedTags, tagId) {
  if (!Array.isArray(selectedTags)) return false;
  return selectedTags.some((tag) => tag.id === tagId);
}

/**
 * The state a tag is in when it is part of the selection but carries no state
 * of its own - a selection made before tri-state filtering existed.
 */
const DEFAULT_STATE = "required";

/** How the three states are shown wherever a tag can be clicked. */
const STATE_META = {
  any: {
    state: "any",
    label: "Any",
    marker: "",
    className: "state-any",
    description: "Not filtering on this tag",
  },
  required: {
    state: "required",
    label: "Required",
    marker: "✓",
    className: "state-required",
    description: "Only notes WITH this tag",
  },
  excluded: {
    state: "excluded",
    label: "Excluded",
    marker: "≠",
    className: "state-excluded",
    description: "Hide notes with this tag",
  },
};

/**
 * Which of the three states is this tag in?
 *
 * A selected tag with no `filterState` counts as required, so a selection made
 * before tri-state filtering (or restored from an older client) still means
 * what it used to.
 *
 * @param {Array<Object>|null|undefined} selectedTags - Current selection
 * @param {number} tagId - Tag id to look up
 * @returns {"any"|"required"|"excluded"}
 */
export function tagFilterState(selectedTags, tagId) {
  if (!Array.isArray(selectedTags)) return "any";

  const entry = selectedTags.find((tag) => tag.id === tagId);
  if (!entry) return "any";

  return entry.filterState === "excluded" ? "excluded" : DEFAULT_STATE;
}

/**
 * The state one more click lands on: any -> required -> excluded -> any.
 *
 * @param {unknown} state - Current state
 * @returns {"any"|"required"|"excluded"}
 */
export function nextTagState(state) {
  if (state === "required") return "excluded";
  if (state === "excluded") return "any";
  return "required";
}

/**
 * Advance one tag through the cycle - the single click handler behind the
 * picker rows, the chips and the sidebar tag list alike.
 *
 * The tag keeps its position while it cycles, so the chip row does not
 * reshuffle under the user's finger, and the freshest tag object wins so a
 * renamed or recoloured tag updates its own chip.
 *
 * @param {Array<Object>|null|undefined} selectedTags - Current selection
 * @param {Object} tag - Tag the user clicked
 * @returns {Array<Object>} The new selection
 */
export function cycleTagSelection(selectedTags, tag) {
  const current = Array.isArray(selectedTags) ? selectedTags : [];
  const next = nextTagState(tagFilterState(current, tag.id));

  if (next === "any") {
    return current.filter((t) => t.id !== tag.id);
  }

  if (isTagSelected(current, tag.id)) {
    return current.map((t) => (t.id === tag.id ? { ...tag, filterState: next } : t));
  }

  return [...current, { ...tag, filterState: next }];
}

/**
 * How a state is presented. Never returns undefined: an unrecognised state
 * renders as "any" rather than as a blank control.
 *
 * @param {unknown} state - A tag filter state
 * @returns {{state: string, label: string, marker: string, className: string, description: string}}
 */
export function tagStateMeta(state) {
  return STATE_META[state] ?? STATE_META.any;
}

/**
 * Drop one tag from the selection - the chip's own remove button.
 *
 * @param {Array<Object>|null|undefined} selectedTags - Current selection
 * @param {number} tagId - Tag id to remove
 * @returns {Array<Object>} The new selection
 */
export function removeTagFromSelection(selectedTags, tagId) {
  const current = Array.isArray(selectedTags) ? selectedTags : [];
  return current.filter((tag) => tag.id !== tagId);
}

/**
 * The "Clear all" chip: no tags at all.
 *
 * @returns {Array<Object>} An empty selection
 */
export function clearTagSelection() {
  return [];
}

/**
 * Ids of the tags a note must carry - the `tags` request parameter.
 *
 * @param {Array<Object>|null|undefined} selectedTags - Current selection
 * @returns {number[]}
 */
export function requiredTagIds(selectedTags) {
  if (!Array.isArray(selectedTags)) return [];
  return selectedTags
    .filter((tag) => tagFilterState(selectedTags, tag.id) === "required")
    .map((tag) => tag.id);
}

/**
 * Ids of the tags a note must NOT carry - the `exclude_tags` parameter.
 *
 * @param {Array<Object>|null|undefined} selectedTags - Current selection
 * @returns {number[]}
 */
export function excludedTagIds(selectedTags) {
  if (!Array.isArray(selectedTags)) return [];
  return selectedTags
    .filter((tag) => tag.filterState === "excluded")
    .map((tag) => tag.id);
}

/**
 * The `tags-selected` event payload.
 *
 * `tags` is the field notes-app and tag-manager already exchange, so both
 * surfaces stay on one source of truth; the two id lists save every listener
 * from splitting the selection by sign again.
 *
 * @param {Array<Object>|null|undefined} selectedTags - The new selection
 * @returns {{tags: Array<Object>, requiredTagIds: number[], excludedTagIds: number[]}}
 */
export function tagSelectionDetail(selectedTags) {
  const tags = Array.isArray(selectedTags) ? selectedTags : [];
  return {
    tags,
    requiredTagIds: requiredTagIds(tags),
    excludedTagIds: excludedTagIds(tags),
  };
}

/**
 * Narrow the picker list as the user types.
 *
 * The owner will accumulate many tags, so the picker needs a filter rather
 * than only a scrollbar. A leading '#' is stripped because that is how tags
 * are written in the search box itself.
 *
 * @param {Array<Object>|null|undefined} allTags - Every tag the user owns
 * @param {string} filterText - What was typed in the picker's filter field
 * @returns {Array<Object>} Matching tags, in the order given
 */
export function filterTagOptions(allTags, filterText) {
  if (!Array.isArray(allTags)) return [];

  const needle = String(filterText ?? "").trim().replace(/^#+/, "").toLowerCase();
  if (needle.length === 0) return [...allTags];

  return allTags.filter((tag) => String(tag.name ?? "").toLowerCase().includes(needle));
}

/**
 * The label on the Tags button.
 *
 * Always spells out the word - an icon-only glyph gives no clue that tag
 * filtering exists - and carries the count so an active filter is obvious
 * even when the chips have scrolled out of view.
 *
 * @param {Array<Object>|null|undefined} selectedTags - Current selection
 * @returns {string} "Tags" or "Tags (2)"
 */
export function tagFilterLabel(selectedTags) {
  const count = Array.isArray(selectedTags) ? selectedTags.length : 0;
  return count > 0 ? `Tags (${count})` : "Tags";
}

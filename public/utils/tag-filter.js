/**
 * Tag-selection logic for the search bar.
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
 * Add a tag to the selection, or take it out if it is already there.
 *
 * @param {Array<Object>|null|undefined} selectedTags - Current selection
 * @param {Object} tag - Tag the user tapped in the picker
 * @returns {Array<Object>} The new selection
 */
export function toggleTagSelection(selectedTags, tag) {
  const current = Array.isArray(selectedTags) ? selectedTags : [];

  if (isTagSelected(current, tag.id)) {
    return current.filter((t) => t.id !== tag.id);
  }
  return [...current, tag];
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
 * The ids the server filters on, in selection order.
 *
 * @param {Array<Object>|null|undefined} selectedTags - Current selection
 * @returns {number[]}
 */
export function selectedTagIds(selectedTags) {
  if (!Array.isArray(selectedTags)) return [];
  return selectedTags.map((tag) => tag.id);
}

/**
 * The `tags-selected` event payload.
 *
 * `tags` is the field notes-app and tag-manager already exchange, so both
 * surfaces stay on one source of truth; `tagIds` saves every listener from
 * mapping the same array again.
 *
 * @param {Array<Object>|null|undefined} selectedTags - The new selection
 * @returns {{tags: Array<Object>, tagIds: number[]}}
 */
export function tagSelectionDetail(selectedTags) {
  const tags = Array.isArray(selectedTags) ? selectedTags : [];
  return { tags, tagIds: selectedTagIds(tags) };
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

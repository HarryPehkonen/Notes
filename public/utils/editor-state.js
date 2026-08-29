/**
 * Pure state decisions made by the note editor.
 *
 * These live outside the component so they can be unit tested without a DOM:
 * the editor keeps the wiring (querying the shadow root, dispatching events)
 * and delegates the "what should happen" questions here.
 */

/**
 * Decide which content string a save should carry.
 *
 * The editor has three possible sources, in descending order of freshness:
 * the live textarea (edit mode only), `_editingContent` (what the user typed
 * before switching to preview) and the note's persisted content.
 *
 * The last fallback is what makes a tag-only change savable: in preview mode
 * there is no textarea, and if the user never typed there is no buffer either,
 * yet the save still has to go out to persist the new tag set -- it just
 * carries the content the note already had.
 *
 * @param {string|null|undefined} textareaValue - Live textarea value, or
 *   undefined when the textarea is absent (preview mode)
 * @param {string|null|undefined} editingBuffer - Content typed this session
 * @param {string|null|undefined} noteContent - Content as last persisted
 * @returns {string|null} The content to save, or null when there is none
 *   anywhere (nothing to save -- the caller should bail)
 */
export function resolveSaveContent(textareaValue, editingBuffer, noteContent) {
  return textareaValue ?? editingBuffer ?? noteContent ?? null;
}

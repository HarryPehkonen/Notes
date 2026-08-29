# Two editor bugs: tag-only saves + scroll jump on save

## Bug 1 — "unsaved" pill sticks after a tag-only change in preview mode

Repro: open a note (preview mode, never edit text), click a tag chip in the
header. `toggleTag()` calls `markAsChanged()` → status "unsaved", auto-save
timer set. 3s later `autoSave()` runs but bails at
`if (content === null || content === undefined) return;` — in preview mode
there is no textarea, and `_editingContent` is null when the user never
typed. The save never happens; the pill stays "unsaved" forever (data
genuinely unsaved) until a text edit populates the buffer.

Fix: in `autoSave()`, when the textarea is absent and `_editingContent` is
null, fall back to `this.note.content` (the persisted content) — the save
then carries the unchanged content plus the new tags. Guard: if BOTH are
null (no content at all), still bail. Check the same early-return path in
`saveNoteExplicitly`/related save paths if they share the pattern.

Testable: extract the "resolve content to save" decision into a pure
function (e.g. `_resolveSaveContent(noteContent, editingBuffer,
hasTextarea)` or similar) — TDD it: preview+tag-click case resolves to the
note's content; edit case resolves to the buffer; both-null returns null.

## Bug 2 — editor scrolls to top when a save completes

Repro: edit a long note midway down, let auto-save fire (or hit save). The
round-trip dispatches `note-updated` → notes-app sets `currentNote` → the
editor's `note` property changes → re-render → `_autoGrowTextarea()` sets
`textarea.style.height = "auto"` (collapsing it for a frame) then restores
the height. During the collapse the scroller (`.canvas`) loses its scroll
position → viewport jumps to top. Cursor stays (the textarea value
survives) but the scroll is jarring.

Fix (either or both, implementer's judgment, but the user-visible outcome
must be: no scroll jump on save):
- Preserve `.canvas` scrollTop across the re-render: capture before the
  property update lands, restore after (requestAnimationFrame), only when
  the same note id (never fight a genuine note switch).
- And/or make `_autoGrowTextarea` non-destructive: only touch height when
  it would actually change (compare computed/scrollHeight first), avoiding
  the transient collapse entirely.

Note: DOM behavior — no test harness exists for it. Cover any pure logic
you extract; verify the rest by careful reasoning in the commit message and
flag it for a human browser check.

## TDD + rules (standard)

- RED first where testable (bug 1's content-resolution logic), watch fail,
  minimal GREEN, `deno task test` + `deno task lint` green before each
  commit. Bug 2: extract/cover what's pure; document the manual check.
- One commit per bug. Update REQUIREMENTS.md only if behavior is
  contract-worthy (bug 1's "tag-only edits save" probably is).
- Bump service worker CACHE_NAME (v12 → v13).
- Do not push. Same constraints as previous briefs (repo-local, no new
  deps, fmt only on changed files).

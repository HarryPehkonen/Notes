# Tri-state tag filters: required / excluded

## Problem (user-requested)

Tag filters are two-state (on/off). The owner wants THREE states when
searching, because some tags will dominate his collection (e.g. many C++
notes he does not always want to see):

1. **any** (default — tag not selected)
2. **required** — only notes WITH this tag
3. **excluded** — only notes WITHOUT this tag

## UX (settled with the owner)

- **Click cycles: any → required → excluded → any.** This applies in the
  tag picker rows AND to the already-rendered chips under the search bar.
- **Clear visual distinction between the three states** — required and
  excluded must be distinguishable at a glance (e.g. color-dot + filled
  chip for required; strikethrough / red-tinted / "≠" marker + distinct
  label for excluded). Owner's UI rules: large, high-contrast, obviously
  labeled; never rely on subtle differences alone. Add a legend or inline
  hint the first time the picker opens is fine, but states must be
  self-evident on the control itself.
- Chips keep working exactly as now (remove button, clear-all) — removal
  returns a tag to "any".

## Server

- Tag-filter parameters must carry sign. Suggested wire format:
  `tags=1,2` (required) and `exclude_tags=3,4` (excluded), or an explicit
  `tags=+1,-3` scheme — implementer's choice, but document it in
  REQUIREMENTS.md and keep /api/search/advanced + the notes-list filter
  path + semantic search consistent with each other.
- Semantics: required = note carries ALL required tags; excluded = note
  carries NONE of the excluded tags; both may be present in one query.
  Apply in BOTH search modes (text and semantic) and in the tag-only
  filtered list (no text query).
- `meta` flag(s) should tell the client what was applied.

## Frontend

- The shared tag state (notes-app.js selectedTags) becomes tri-state.
  Keep ONE source of truth; search-bar chips, picker rows, and the
  sidebar tag-manager must all reflect the same state. Sidebar tag-manager
  also cycles on click now (it is a selection surface too).
- The search request builders (app.js searchNotes/advancedSearch, and the
  no-text list filter in notes-app.js) send the new parameters.
- Visual states per the UX section; 44px targets; iOS-safe input sizes.

## TDD — strict, as before

- RED first: server-side tests for required/excluded/combined semantics
  (pure query-building functions, factor them testable); frontend tests
  for the tri-state cycle logic (pure module — extend
  public/utils/tag-filter.js).
- Watch failures for the right reason; minimal GREEN; `deno task test` +
  `deno task lint` green before each commit. Commit per logical unit.
- Update REQUIREMENTS.md (semantics + wire format) and CLAUDE.md if it
  documents the tags parameter.
- Bump service worker CACHE_NAME (v11 → v12).
- Do not push.

## Constraints

- Same as the previous brief: this repo only, Deno + Lit, no build step,
  no new deps, API envelope rules, envelope {"success":true,"data":...}.
- deno fmt only on changed files.

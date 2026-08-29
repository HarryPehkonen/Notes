# Search + tags: visible tag filtering, applied in every mode

## Problem (user-reported)

The tag filter exists but is buried (rail `#` flyout on desktop, drawer on
mobile) — nobody finds it next to search. Worse: in **semantic mode the
backend silently drops tag filters** (server/api/search.js treats semantic
as an exclusive switch), while the UI still shows tags as selected. The
owner will accumulate MANY tags over time, so the design must scale beyond
a handful.

## Deliverable 1 — server: semantic search honors tag filters

`GET /api/search?...&semantic=true` must accept a `tags` parameter
(comma-separated tag IDs, same shape as /api/search/advanced) and filter
the semantic results by it. Design: keep the embedding search as the
ranking source, then intersect with tag membership (either post-filter in
SQL with a JOIN on note_tags for the candidate IDs, or fold the JOIN into
the semantic query itself — implementer's choice, but results must be
(tag-filtered, similarity-ranked). No silent dropping: if tags are passed,
every returned note carries ALL of them. Empty result set is a valid
result. Update the `meta` flags so the client can see tags WERE applied.

## Deliverable 2 — frontend: tag filtering visible at the search bar

Redesign the search area so tag selection is a first-class, visible
control:
- A "Tags" affordance adjacent to the search input (a labeled button —
  the owner needs LARGE, HIGH-CONTRAST, OBVIOUSLY-LABELED controls;
  icon-only glyphs have failed him before), opening a picker showing all
  his tags (color dots + names, from /api/tags).
- Selected tags render as chips **in/under the search bar** — always
  visible while active, individually removable, plus a clear-all.
- Chips + picker must scale to MANY tags: the picker list scrolls; chips
  wrap to multiple rows; nothing hides behind overflow ellipsis.
- Mobile: same visibility rules (chips visible under the search input,
  picker as a bottom sheet or dropdown — must not depend on the drawer).
- Selected tags apply to BOTH text search and semantic search (wire the
  new server param; when semantic is on and tags are selected, they now
  genuinely filter — the meta flag from D1 confirms it).
- Keep the existing tag-manager component working (sidebar/flyout still
  manage/create/delete tags); this is about surfacing SELECTION at the
  search bar. Ideally both surfaces stay in sync (one source of truth in
  notes-app state — they already share selectedTags).

## TDD — mandatory, strict

For each deliverable, vertical slices, RED first:
- D1: tests/deno/ — unit tests for the query-building / filter logic
  (testable pure functions; factor the tag-filter SQL construction so
  it's unit-testable without a live DB), plus an integration-style test
  of the handler wiring if the existing test setup supports it. RED:
  test that semantic+tags filters (fails today — tags ignored).
- D2: tests for the new search-bar component logic (chip state, "all
  tags applied" event payload, clear-all) — factor the pure logic out of
  the Lit component into a testable module, test that; component render
  covered by the project's existing conventions if any.
- Watch each test FAIL for the right reason, minimal GREEN, full suite:
  `deno task test` AND `deno task lint` green before each commit.

## Constraints

- Repo: this one only. Deno + Lit, no build step, no new deps.
- API envelope: {"success":true,"data":...} — see CLAUDE.md pitfalls.
- UI rules: large labeled controls, min 44px touch targets, iOS-safe
  font sizes (>=16px inputs), no icon-only mystery buttons.
- `deno fmt` only on files you change (11 pre-existing files non-compliant).
- Commit per logical unit, clear messages. Do NOT push, do NOT deploy.
- Existing behavior preserved: #tag syntax in the text box, tag-only
  filtering (no text), advanced search, suggestions — all keep working.

# Print note → PDF (clean, header/footer-free)

## Goal

Add a "Print" action to the note editor so Harri can print a note to PDF
from the browser, and have it look like a clean document — no browser
URL/date/page-number chrome, serif typography like the on-screen preview
(which already uses `--font-serif` for headings).

## Scope (frontend only, no server changes)

1. **A Print button** in the `note-editor` toolbar (alongside the existing
   icon buttons, 44px touch target, labeled for Harri — not an unlabeled
   icon; a title/aria-label is NOT enough on its own given his eyesight).

2. **`window.print()`** wired to that button. Print the note in PREVIEW
   mode (the `.markdown-preview` rendered HTML), not the raw textarea.

3. **A `@media print` stylesheet** in `note-editor.js` (Lit static styles)
   that:
   - hides everything except the note's title + markdown preview
     (sidebar, toolbar, buttons, editor chrome all `display:none`)
   - sets `@page { margin: 0 }` and adds a clean printable margin on the
     body/container instead (so there's no browser-imposed gutter)
   - uses the serif font family for headings AND body (the LaTeX-ish look),
     with reasonable print font sizes, line-height, and spacing
   - avoids page-breaks inside code blocks (`break-inside: avoid`)
   - keeps checkboxes from rendering as giant colored thumbs — print them
     as a plain `[x]`/`[ ]` text glyph or small box (they're tappable on
     screen but meaningless on paper)
   - removes `accent-color`, hover states, and any background colors that
     waste ink (code/pre backgrounds → light or none)

4. **No headers/footers** = `@page { margin: 0 }` plus the fact that we
   call `window.print()` (browsers still add URL/date by default unless the
   user unchecks "Headers and footers" in the print dialog — document this
   caveat in the UI or a comment; we cannot programmatically force it off,
   only make it look clean when they do).

## Constraints

- No build process (ES modules + Lit, matches the repo's core principle).
- TDD where testable: extract any pure logic (e.g. "what gets shown in
  print mode", checkbox→glyph conversion if done in JS) into a testable
  function under `tests/deno/`. The CSS itself is not unit-testable — note
  that honestly in the commit message.
- `deno task lint` + `deno task test` green before commit.
- Do not push. Do not bump the service worker (no new assets).
- Harri's UI rule: controls must be obviously labeled, not icon-only.

## Verification (you)

- Lint + tests green.
- Read the rendered print CSS once and confirm the `@page` + `@media print`
  rules are coherent and the selector list correctly hides app chrome.

## Verification (Harri, manual — tell him)

- Open a note, click Print, choose "Save as PDF", uncheck "Headers and
  footers", and confirm it looks like a clean document.

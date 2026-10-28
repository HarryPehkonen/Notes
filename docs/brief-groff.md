# Brief: groff documents in Notes

Where this stands, what was measured, and what is left. Updated 2026-10-28, after
the appearance sets and the document-level `.STYLE`. The web-app wiring at the
end is still not built, and is the part that needs decisions.

## What exists

| file                                    | what it is                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `groff/house.tmac`                      | the house style: the sets, the page setup, and the vocabulary a document may use |
| `groff/examples/buttermilk-pancakes.ms` | the first recipe, written as a groff document                              |
| `server/groff/sanitize.js`              | the allowlist guard between an untrusted document and the renderer         |
| `server/groff/render.js`                | the renderer: stdin, argv, no shell, errors read from stderr               |
| `server/cli/groff.js`                   | `deno task groff:render <doc.ms> [out.pdf]`, the same path the server uses |
| `scripts/groff-fonts.sh`                | builds the DejaVu font descriptions the optional set needs (see below)     |
| `tests/deno/groff_sanitize_test.ts`     | 16 tests, the guard                                                        |
| `tests/deno/groff_render_test.ts`       | 8 tests, spawning the real groff                                           |

## Rendering: what a document is and is not

A document is prose plus this vocabulary, and nothing else:

    .RECIPE "title" "subtitle"     .SECTION "heading"
    .ING "one ingredient"          .STEP "one step"
    .NOTE "an aside"               .CODE / .ENDCODE

Plus `PP` `P` `LP` `B` `I` `R` `BR` `nf` `fi` `br` `sp`. The command line owns
everything else:

    groff -Kutf8 -ww -dpaper=letter -P-pletter -F <font-dir> -P-e \
          -ms -M groff -m house -Tpdf -

Three parts are load-bearing. **`-ms` before `-m house`** — loaded the other way
round, the macro package initialises after us and silently overwrites the page
setup. The **style comes from the command line**, which is why a document needs
no include — with the one deliberate exception below. And **`-F`** is what makes
`.fam DS` resolve at all, since the DejaVu faces are not in groff's default font
path; only the `dejavu` set needs it.

A document may also choose its *appearance set*, and only that:

    .STYLE palatino          (or)          .STYLE dejavu

This is a lookup, not an escape hatch. The name is resolved inside `house.tmac`
against a fixed list, so a document still names no font, no size, no measure and
no margin, and the allowlist keeps refusing `.ds`, `.nr`, `.fam`, `.ft`, `.ps`,
`.ll` and `.po` — there is a test for each of those refusals. A name that is not
in the list **aborts the render** (`error: unknown style 'x'` on stderr, no PDF),
because a document that asked for one appearance and quietly got another would be
worse than a failure.

A measured trap for anyone editing `house.tmac`: **a macro call as the body of an
`.ie` cannot then be paired with an `.el`.** That arrangement warns `unbalanced
'el' request` on every render, and groff reports the warning at the *call site*
rather than the offending line, so it reads like the caller's fault. The `.STYLE`
dispatch is plain `.if` lines plus a flag register for that reason.

## Fonts: two appearance sets, and who chooses

A set bundles the whole appearance decision — faces, type size, leading, measure,
margins — because the measure depends on the faces: Palatino at the same measure
holds 76 characters where DejaVu Serif holds 62. Measured on the pancake recipe,
letter, one page either way:

| set        | size | measure | mean | PDF    | faces                                     |
| ---------- | ---- | ------- | ---- | ------ | ----------------------------------------- |
| `palatino` | 12pt | 5.2in   | 67ch | 731 KB | P052 / Nimbus Sans / Nimbus Mono, embedded |
| `dejavu`   | 11pt | 5.5in   | 62ch | 2.4 MB | DejaVu Serif / Sans / Sans Mono, embedded  |

**`palatino` is the default.** It is the URW base-35 family groff mounts itself,
so nothing has to be installed, and gropdf embeds P052 anyway because it is not
one of the PDF base-14 fonts — the same embedding `-P-e` forces. Nimbus Roman
(Times) and C059 (Century Schoolbook) are available the same way.

**`dejavu` is the opt-in set** for a document that needs the wide repertoire.
`gropdf` in this build accepts **PostScript Type 1 only** — "this implementation
only accepts the Type 1 PostScript font" (gropdf(1)) — while Debian ships DejaVu
as TrueType. So `scripts/groff-fonts.sh` converts each face with `fontforge`,
adapts its metrics with `afmtodit` against the same 8-bit encoding gropdf uses,
and installs the result into a font directory the renderer prepends with `-F`.
Twelve faces are built: DejaVu Serif (body), DejaVu Sans (headings, and the
fallback), DejaVu Sans Mono (code), each in R/B/I/BI. On a new machine:
`sudo scripts/groff-fonts.sh`; it needs `fontforge`, full `groff` (not
`groff-base`) and `fonts-dejavu-core` + `fonts-dejavu-extra` (the italics live in
`-extra`). The description files are text; the PFB binaries are not, which is why
this is a script and not a checked-in blob.

Coverage, measured. The `palatino` set reaches Latin-1, the typographic
punctuation, the named specials (`\(bu` `\(em` `\(de` `\(12`) and what Symbol
carries (`≈ ≠ ≤ ≥ → ← ∞ α β Ω`). It **cannot** set `⅓`, `①` or `☺` — "special
character not defined", dropped — so a recipe writes `1/3`, not a third-glyph.
The `dejavu` set's descriptions expose 3499 `uXXXX` names, so `\[uXXXX]` reaches
DejaVu's whole repertoire; `①` is missing from DejaVu Serif itself and
`.special DVR` renders it anyway.

Cost of the opt-in: **2.4 MB**, because gropdf does not subset embedded fonts and
all twelve faces go in whole. The default set avoids that entirely.

## Security: measured against groff 1.23.0, 2026-10-28

| document contains               | what groff did                                                            |
| ------------------------------- | ------------------------------------------------------------------------- |
| `.sy echo SY_RAN`               | refused: `error: 'sy' request is not allowed in safer mode`               |
| `.pso echo PSO_RAN`             | refused (safer mode)                                                      |
| `.pi whoami`, `.open`, `.opena` | refused (safer mode)                                                      |
| **`.so /etc/hostname`**         | **NOT refused — the file was read and its contents printed into the PDF** |
| `.sp 999999999`                 | `error: numeric overflow` **and exit code 0**                             |

Three consequences, and they are the whole design:

1. Safer mode is on by default and stops shell execution. `-U` is never passed.
2. Safer mode does **not** sandbox file inclusion, so the allowlist is mandatory:
   any request outside the vocabulary refuses the render, and nothing is
   silently stripped. Tested, including the `'` control character and a
   conditional trying to smuggle a request inside itself.
3. **groff's exit code is not the verdict** — it reports errors and exits 0. The
   renderer reads stderr, fails on `error:`, and returns `warning:` lines to the
   caller instead of swallowing them. `.ab`'s message carries `error:` too, which
   is how an unknown `.STYLE` is caught by the same rule.

`\X` and `\!` are escapes rather than requests, so they are refused by scanning.

The house style is deliberately **pure ASCII**: groff reads a macro file with the
default input encoding rather than `-Kutf8`, so one literal non-ASCII character in
a comment produced an "invalid input character code" warning on every render. A
test now holds that line.

Still to add on the deployment side: run the render inside the service's systemd
sandbox (`ProtectSystem=strict`, `PrivateTmp`, `NoNewPrivileges`) so a hole that
gets past the allowlist still cannot write or reach the network. The allowlist is
the lock; the unit file is the walls.

## What is left, and the decisions in it

The rendering path works from the shell, with the typography and coverage
intended, in either set. What is missing is the app:

1. **Where does the source live?** A text column on the note (with a flag saying
   it is groff) keeps one site and one search, as you wanted. Files in git with
   the database holding metadata makes the source diffable and reviewable, but
   adds a second place for content to live.
2. **The reading path.** Markdown stays the standard. For a groff note, either
   project groff to markdown for display and search (you said it does not have to
   be amazing), or store an authored markdown summary alongside.
3. **The PDF cache.** Rendered on save and cached, keyed by the source hash, so
   print-to-PDF and print-to-printer serve the cached bytes and the renderer runs
   only when the source changes. Size belongs in this decision: 731 KB for a
   `palatino` document, 2.4 MB for a `dejavu` one.
4. **Print.** How the PWA hands the cached PDF to the phone's print sheet.
5. **Tables.** `.CODE` covers code-like blocks; real two-column data wants `tbl`
   (`groff -t` plus `.TS`/`.TE` in the document, which the allowlist would need
   to permit).
6. **The per-document flag.** groff stays optional, as you asked — a note without
   the flag never touches any of this.

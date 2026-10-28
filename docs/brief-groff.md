# Brief: groff documents in Notes

Where this stands, what was measured, and what is left. Written 2026-10-28 after
building and verifying the rendering foundation; the web-app wiring below is not
built yet and is the part that needs your decisions.

## What exists now (verified, not committed yet)

| file | what it is |
| --- | --- |
| `groff/house.tmac` | the house style: page setup plus the semantic vocabulary a document may use |
| `groff/examples/buttermilk-pancakes.ms` | the first recipe, written as a groff document |
| `server/groff/sanitize.js` | the allowlist guard between an untrusted document and the renderer |
| `server/groff/render.js` | the renderer: stdin, argv, no shell, errors read from stderr |
| `server/cli/groff.js` | `deno task groff:render <doc.ms> [out.pdf]`, same path as the server's |
| `tests/deno/groff_sanitize_test.ts` | 15 tests |
| `tests/deno/groff_render_test.ts` | 5 tests, spawn the real groff |

Suite: 853 passed, 0 failed. `deno.json` gained `--allow-run=groff` on the test
task and the `groff:render` task.

## Rendering: what a document is and is not

A document is prose plus this vocabulary, and nothing else:

    .RECIPE "title" "subtitle"     .SECTION "heading"
    .ING "one ingredient"          .STEP "one step"
    .NOTE "an aside"               .CODE / .ENDCODE

Plus `PP` `P` `LP` `B` `I` `R` `BR` `nf` `fi` `br` `sp`. The command line owns
everything else:

    groff -Kutf8 -ww -dpaper=letter -P-pletter -ms -M groff -m house -Tpdf -

Two parts of that are load-bearing. **`-ms` before `-m house`** — loaded the other
way round, the macro package initialises after us and silently overwrites the page
setup; that cost two rounds of "why is the line still 90 characters long". And the
**style comes from the command line**, which is why a document needs no include.

## Typography, as measured

* Page: letter, 1.9in margins, measure 4.7in at 12pt/15.5pt leading.
* Filled lines average **66 characters** (`pdftotext`), inside the readable 45–75.
  A first cut at 6.7in/10.5pt averaged 90–100 and read badly.
* Text extent ends at exactly PO+LL (136.8+338.4 = 475.2pt on a 612pt page), so
  nothing overflows.
* Renders with **zero warnings**.
* The pancake recipe is 2 pages: the last section spills. Tightening paragraph
  spacing and widening the measure to 5.0in both failed to pull it back, so it is
  the content, not the settings — the honest options are to trim the recipe or to
  accept two pages. Your call; a recipe that lands one section onto page two is
  the one rough edge in the current output.

## Security: measured against groff 1.23.0, 2026-10-28

| document contains | what groff did |
| --- | --- |
| `.sy echo SY_RAN` | refused: `error: 'sy' request is not allowed in safer mode` |
| `.pso echo PSO_RAN` | refused: `error: 'pso' request is not allowed in safer mode` |
| `.pi whoami` | refused (safer mode) |
| `.open` / `.opena` | refused (safer mode) |
| **`.so /etc/hostname`** | **NOT refused — the file was read and its contents printed into the PDF** |
| `.sp 999999999` | `error: numeric overflow` **and exit code 0** |

Three consequences, and they are the whole security design:

1. Safer mode is on by default and stops shell execution. We never pass `-U`.
2. Safer mode does **not** sandbox file inclusion. So the allowlist is mandatory:
   any request outside the vocabulary above refuses the render, and nothing is
   silently stripped. The examples are tested, including the `'` control
   character and a conditional trying to smuggle a request inside itself.
3. **groff's exit code is not the verdict** — it reports errors and exits 0. The
   renderer reads stderr and fails on `error:`, returning `warning:` lines to the
   caller instead of swallowing them.

`\X` and `\!` are escapes rather than requests, so they are refused by scanning;
they inject raw output-driver commands.

Still to add on the deployment side: run the render inside the service's systemd
sandbox (`ProtectSystem=strict`, `PrivateTmp`, `NoNewPrivileges`) so a hole that
gets past the allowlist still cannot write or reach the network. The allowlist is
the lock; the unit file is the walls.

## Unicode and fonts — the real limit

The stock Times/Symbol fonts groff ships cover Latin-1 and the usual typographic
punctuation: `é ü ñ ç Å ø œ ß ° ± µ × ÷ ½ ¼ ¾ – — ’ “ ” … † ‡ § ¶` all render, and
`≈ ≠ ≤ ≥ → ← ∞ α β Ω` come through via Symbol. What is **missing**: `⅓ ① ☺` and
anything beyond — `warning: special character 'u2153' not defined`, and the
character is dropped.

Also, **the fonts are not embedded** in the PDF (`pdffonts`: `emb no`). For
printing that normally still works, because the base fonts live in the printer,
but it is not an archival document.

This is exactly what DejaVu fixes, and the DejaVu TTFs are already installed on
the machine. groff, however, has **no font description for them** (nothing in
`/usr/share/groff/1.23.0/` mentions DejaVu), so this is a piece of work rather
than a setting: build `devpdf` font descriptions for DejaVu Serif and Mono, point
the house style at them, and re-measure coverage and embedding. That is the
natural next slice after the app wiring, since it changes the very thing the
house style is for.

## What is left, and the decisions in it

The rendering path works from the shell. What is missing is the app, and it needs
your answers before it is worth building:

1. **Where does the source live?** A text column on the note (with a flag saying
   it is groff) keeps one site and one search, as you wanted. The alternative —
   files in git with the database holding metadata — makes the source diffable
   and reviewable but adds a second place for content to live.
2. **The reading path.** Markdown stays the standard. For a groff note, either
   project groff to markdown for display and search (you said it does not have to
   be amazing), or store an authored markdown summary alongside. The first is
   less to maintain and keeps one source of truth; the second reads better.
3. **The PDF cache.** Rendered on save and cached (database column or file), keyed
   by the source hash, so print-to-PDF and print-to-printer both serve the cached
   byte stream and the renderer runs only when the source changes.
4. **Print.** How the PWA hands the cached PDF to the phone's print sheet.
5. **The per-document flag.** groff stays optional, as you asked — a note without
   the flag never touches any of this.

Nothing above is committed yet. All of it is untracked or modified in the working
tree; the only touched existing file is `deno.json`.

# Driving a groff document in Notes

A groff note is not a markdown note with a different renderer. It is a document
whose source is groff, and the app treats it that way in three places:

- `content` **is** the groff source. You write it in the editor, in raw groff.
- On every save the server projects the source to markdown
  (`server/groff/project.js`) and stores that in `content_markdown`. Search,
  snippets and the reading view use the projection. It is display-only and is
  never written back over your source.
- The typeset page comes from groff, not from the browser. Nothing is rendered
  client-side.

The kind of a document is permanent. A groff document stays groff; if you want
the other kind, create another note.

## Creating one

Tap the plus button. A chooser asks **"What kind of document?"** with two
buttons: _Markdown_ and _Groff_. Nothing is written until you answer, so
cancelling leaves no empty note in your list. Choosing _Groff_ creates a blank
groff document and opens it in the editor. It is blank on purpose — there is no
skeleton and no macro cheat-sheet planted in the file, because driving groff is
the thing you are here to learn. This document is the cheat-sheet.

## A complete document

`groff/examples/buttermilk-pancakes.ms` in the repository is a working recipe —
copy it into a new groff note and mutate it. Every line is either prose or one
of the macros below; there are no includes, no font names, no page geometry and
no raw escapes. That is the whole contract a document has with the renderer.

```
.RECIPE "Buttermilk pancakes" "breakfast for two, about 25 minutes"
.SECTION "Ingredients"
.ING "190 g all-purpose flour"
.ING "1 tbsp baking powder"
.ING "2 tbsp sugar"
.ING "\[u00BD] tsp fine salt"
.ING "1 large egg"
.ING "300 ml buttermilk"
.ING "30 g butter, melted, plus more for the pan"
.SECTION "Method"
.STEP "Whisk the flour, baking powder, sugar and salt together in a large bowl."
.STEP "Beat the egg with the buttermilk and the melted butter, then pour it into the dry mix."
.STEP "Stir until barely combined. Lumps are correct; a smooth batter is overmixed and will be tough."
.NOTE "Rest the batter for ten minutes before frying. The flour hydrates in that time and the pancakes come out noticeably more tender. This is the one step worth not skipping."
.STEP "Heat a heavy pan over medium heat to about 190 \[u00B0]C, then wipe it with a little butter."
.STEP "Pour about \[u00BC] cup of batter per pancake and cook for two minutes, until the surface bubbles and the edges look dry."
.STEP "Flip once and cook for one more minute. Serve immediately, or hold in a 90 \[u00B0]C oven."
.SECTION "Timings"
.CODE
rest, batter   10 min
first side      2 min
second side     1 min
.ENDCODE
.SECTION "Notes on ingredients"
.PP
Buttermilk is the point of this recipe, not a detail. If you have none, stir one
tablespoon of lemon juice into 300 ml of milk and leave it for ten minutes.
```

Steps number themselves, so you never type a number. That document sets as one
letter page.

## The vocabulary — all of it

Nine house macros (`groff/house.tmac`), plus the ms primitives a document may
use directly. Anything else is refused before rendering.

- `.DOC "Title"` or `.DOC "Title" "subtitle"` — the document's title, once, at the top. The reading view shows the title as a heading and the subtitle in italics.
- `.RECIPE "Title" "subtitle"` — the same title block under the recipe-flavoured name. Use whichever word matches what you are writing; both render identically.
- `.SECTION "Heading"` — a section heading. Quote multi-word headings.
- `.ING "175 g unsalted butter"` — one ingredient line, hung as a bullet. Becomes `-` in the reading view.
- `.STEP "Whisk the flour."` — one numbered step. Numbering is per document and automatic. Becomes `1.` in the reading view.
- `.NOTE "Rest the batter."` — a note set off from the steps, labelled _Note._, indented to line up with the step text. Becomes a `>` blockquote.
- `.CODE` … `.ENDCODE` — a preformatted, monospaced block for code-like text or plain columns. Becomes a fenced code block.
- `.STYLE palatino` or `.STYLE dejavu` — choose the appearance set (below). Optional; palatino is the default.
- `.PP`, `.P`, `.LP` — a normal paragraph. `.PP` before body text after a list, so the indent resets.
- `.B`, `.I`, `.R`, `.BR` — bold, italic, roman, bold-roman on the rest of the line.
- `.nf`, `.fi` — turn filling off and on (`.nf` opens the same monospaced block as `.CODE`).
- `.br`, `.sp` — break the line, insert space.

Rules that follow from the list:

- **Multi-word arguments are quoted.** `.SECTION Method notes` passes only the first word to the macro's first argument; `.SECTION "Method notes"` is the whole heading.
- **No tables yet.** tbl is not available: the renderer does not pass `-t` and `.TS` is not on the allowlist, so a table does not render. Align columns with `.CODE` and spaces. (The comment in `house.tmac` about running groff with `-t` looks forward to a later slice; it does not work today.)
- **No images.** There is no image macro on the allowlist.

## Appearance: `.STYLE`

A document may choose the **set**, and only from this list. It names a set,
never a font: the request is looked up in `house.tmac`, so a document carries no
font names, no sizes, no measures and no page geometry. An unknown name
**aborts** the render — `error: unknown style 'x'` on stderr and no PDF, rather
than quietly producing something else.

| `.STYLE`             | type  | measure | characters | PDF     |
| -------------------- | ----- | ------- | ---------- | ------- |
| `palatino` (default) | 12 pt | 5.2 in  | 67         | 731 KB  |
| `dejavu`             | 11 pt | 5.5 in  | 62         | 2321 KB |

- **palatino** is the URW base-35 family groff mounts by itself, so nothing has
  to be installed and the PDF is small. What it _cannot_ set: `1/3`, `(1)` and
  the smiley face are "special character not defined" and are dropped. Write
  `1/3`, not `⅓`. `\[u00BD]`, `\[u00BC]`, `\[u00BE]` and `\[u00B0]` do work.
- **dejavu** covers DejaVu's whole repertoire through `\[uXXXX]`, but needs
  `scripts/groff-fonts.sh` installed and produces a much larger PDF, because
  gropdf does not subset the embedded faces.

**Write non-ASCII as escapes** (`\[u00BD]`, `\[u00B0]C`), so the source stays
pure ASCII: it cannot be mangled by an editor's encoding and it diffs cleanly.

## Rendering

From the shell, today, on the machine that holds the repository:

```
cd ~/hermes-workspace/Notes
deno task groff:render groff/examples/buttermilk-pancakes.ms ~/buttermilk-pancakes.pdf
```

Or groff directly, which is what that task runs:

```
groff -Kutf8 -ww -dpaper=letter -P-pletter -F <font-dir> -P-e \
      -ms -M <styles-dir> -m house -Tpdf - < doc > out.pdf
```

Four things in that command line are load-bearing, and worth knowing before you
change them:

- `-ms` **before** `-m house`. The macro package sets its line length and page
  offset when it initialises; loading our file first meant ms silently
  overwrote the page setup.
- The style comes from the command line, not the document, so a document
  contains no includes, no fonts and no geometry. That is a security decision,
  not a style one (see below).
- `-P-e` forces every font to be embedded in the PDF.
- `-ww` shows all warnings. Read stderr: **groff exits 0 even when it
  errors**, so a successful exit is not a successful render.

## What the app does with a groff note today

- **Reading**: the reading view shows the markdown projection, with a caption
  saying so. A groff document that has no usable projection shows its source
  instead — your text is never hidden.
- **Search, snippets, tags, versions**: all unchanged, because they run on the
  projection. Groff notes keep the same version history as everything else.
- **Editing**: the textarea edits the raw source. On the phone that is the
  intended way to make small corrections.
- **Printing a groff note from the app is not built yet.** Today the app's print
  button prints what the reading view shows — the markdown projection, not the
  typeset groff page. The PDF you want currently comes from the shell command
  above. The print hand-off (render on the server, cache the PDF by source
  hash, hand the browser the file) is its own slice.

## Security: why the vocabulary is closed

groff's safer mode is on by default and refuses `.sy`, `.pso`, `.pi` and
`.open` with an explicit error — but it does **not** refuse `.so`: `.so
/etc/hostname` reads the file and prints its contents into the output. So the
app does not rely on safer mode for that. It keeps includes out of documents
entirely and checks every request line against an allowlist
(`server/groff/sanitize.js`). The escapes `\X` and `\!` are refused anywhere in
the text, because both inject raw output-driver commands.

**Nothing is silently stripped.** A violation refuses the whole render and is
reported with the line number and the reason. A document that smuggles a request
should be reported, not quietly edited into something that renders — stripping
can change a document's meaning.

Source is capped at 200 KB so a runaway document cannot tie up the renderer.

## Learning groff itself

The house macros are the top layer; beneath them it is ordinary groff and `ms`.
The real manuals, in the order they are useful:

- `man 7 groff_ms` — the ms macro package: paragraphs, headings, lists, quotes.
- `man groff` — the request and escape reference, and how the pipeline works.
- `man groff_char` — the `\[uXXXX]` character escapes, which is how you write
  anything outside ASCII.
- The GNU troff manual: <https://www.gnu.org/software/groff/manual/groff.html>

The way to learn it is to copy the pancake document into a new note and change
one line at a time: swap `.ING` for `.PP`, put a `.B` inside a step, add a
`.STYLE dejavu` and watch the page change. When a render fails, read stderr —
the app reports the same lines, with line numbers.

## Where appearance lives

`groff/house.tmac` is the one groff file under git. The document owns content;
that file owns appearance — faces, type size, leading, measure, margins. Retheme
by editing it there and re-rendering; re-measure the character count and the PDF
size after any change to a set, because the measure depends on the faces.

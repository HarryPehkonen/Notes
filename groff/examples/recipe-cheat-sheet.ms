.STYLE palatino
.RECIPE "Recipe documents: the cheat sheet" "serves 4, and works for any .RECIPE"
.PP
A recipe note is opened by \fB.RECIPE\fR. That is the only thing that makes it a
recipe: \fB.RECIPE\fR and \fB.DOC\fR are one title block under two names, so
they render identically. What follows is the whole vocabulary, with the recipe
conventions called out where they apply.
.NOTE
A note\'s kind is fixed when it is created and cannot be changed afterwards.
A recipe that was created as markdown stays markdown: make a new note instead.
.SECTION "The title block, and the yield"
.PP
The first line carries the dish and its yield. The second argument is set in
italic under the title, which is where a recipe puts servings.
.CODE
\&.RECIPE "Buttermilk pancakes" "serves 4"
\&.RECIPE "Lemon drizzle cake" "makes one 900 g loaf"
.ENDCODE
.SECTION "Ingredients"
.PP
\fB.ING "175 g unsalted butter"\fR is one ingredient line, hung as a bullet.
Write the quantity and the unit the way a cook reads them: \fB175 g\fR, or
\fB1 1/2 tsp\fR. Spell fractions out -- palatino has no one-third or one-half
glyph, and a character it lacks is a warning, which fails this renderer.
.CODE
\&.ING "175 g unsalted butter, softened"
\&.ING "2 large eggs, at room temperature"
\&.ING "1 1/2 tsp baking powder"
\&.ING "300 ml buttermilk"
.ENDCODE
.SECTION "Method"
.PP
\fB.STEP "..."\fR numbers a step. The counter runs for the whole document and
\fBdoes not reset at a section\fR, so numbering continues across "For the
topping" and similar headings -- which is what you want when the topping is
part of the same method.
.CODE
\&.STEP "Beat the butter and sugar until pale."
\&.STEP "Beat in the eggs, one at a time."
\&.STEP "Fold in the flour and baking powder."
\&.STEP "Stir in the buttermilk."
\&.STEP "Rest the batter for 20 minutes while the pan heats."
.ENDCODE
.SECTION "Warnings and asides"
.PP
\fB.NOTE\fR sets a labelled aside, aligned with the text of the steps rather
than stepping further in. This is the place for the things that ruin a dish if
missed: resting time, pan temperature, what "fold" means, substitutions.
.CODE
\&.NOTE
Resting is not optional: it lets the flour hydrate and
the baking powder start, which is the rise.
.ENDCODE
.SECTION "Sections"
.PP
\fB.SECTION "For the topping"\fR is how one recipe is split -- method, topping,
assembly, storing, variations. Keep the step numbering in mind: it carries on.
.CODE
\&.SECTION "For the topping"
\&.SECTION "To serve"
\&.SECTION "Variations"
.ENDCODE
.SECTION "Plain paragraphs and emphasis"
.PP
Prose between the lists is \fB.PP\fR. For emphasis use the inline escape, which
takes a whole phrase: \fB.B\fR and \fB.I\fR take one argument only, and groff
silently ignores anything after it.
.CODE
\&.PP
This cake keeps three days in a tin, or freezes a month.
\&.PP
Do not open the oven for the first 20 minutes - \fBthat\fR
.ENDCODE
.SECTION "Appearance"
.PP
\fB.STYLE\fR names an appearance set and belongs at the top. Recipes print well
in either: palatino is the compact default, dejavu is larger on the page and
covers more characters.
.CODE
\&.STYLE palatino     12pt  compact   731 KB  the default
\&.STYLE dejavu     11pt  roomier   2.3 MB  full repertoire

Code blocks hold 62 characters at 10pt: palatino, 65: dejavu.
.ENDCODE
.SECTION "Rendering and printing"
.PP
From the Notes repository:
.CODE
cd ~/hermes-workspace/Notes
deno task groff:render \\
    groff/examples/buttermilk-pancakes.ms ~/pancakes.pdf
.ENDCODE
.PP
A clean render prints nothing at all; the result should be checked with pdfinfo
for the page count and pdffonts to confirm the fonts are embedded. Printing a
note from inside the app is not built yet -- this command is the print path
today.
.SECTION "Creating and editing one"
.PP
From the terminal, with the notes command that is on PATH everywhere:
.CODE
notes create --format groff --tag recipe \\
    --title "Buttermilk pancakes" --body-file pancakes.ms
notes edit 92          # the raw source; never clobbers
notes show --raw 92           # exactly what is stored
.ENDCODE
.PP
\fB--format groff\fR is the part that matters and cannot be fixed later: without
it the note is created as markdown and stays markdown. \fB--task\fR writes
markdown checkboxes, so it is refused alongside \fB--format groff\fR.
.SECTION "What a recipe cannot do"
.ING "No tables: ingredients are a bullet list, not a grid"
.ING "No images and no font choices: appearance comes from a .STYLE set"
.ING "No file inclusion, and no raw output-driver escapes"
.ING "No hyphenation, so a long ingredient name is never split across lines"
.PP
Contents pages, outlines and hyperlinks do exist in groff -- they need reference
marks and a multi-pass run, and Notes does not do that yet. The .DOC cheat sheet
in this repository has the details and the measured behaviour.
.SECTION "Where to read more"
.ING "docs/groff-guide.md in this repository"
.ING "man groff_ms for the primitives underneath the house macros"
.ING "groff/examples/buttermilk-pancakes.ms as a complete worked recipe"

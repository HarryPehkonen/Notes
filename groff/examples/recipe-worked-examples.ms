.STYLE palatino
.RECIPE "Recipe documents: worked examples" "every construct: the source, then the result"
.PP
Each pair below is the raw groff source, followed by what it produces. This is
the recipe-shaped companion to "Recipe documents: the cheat sheet"; for the full
tour of the vocabulary, see "Groff documents: worked examples".
.NOTE
A line inside a code block is shown, never run: the zero-width \\& stops it, and
a doubled backslash prints a single one.
.SECTION "The title block and the yield"
.CODE
\&.RECIPE "Buttermilk pancakes" "serves 4"
.ENDCODE
.PP
That line has already run: it is the top of this document. The second argument
is set in italic under the title, and that is where a recipe puts its yield.
.SECTION "A section"
.CODE
\&.SECTION "For the topping"
.ENDCODE
.PP
Which is what produced the heading below.
.SECTION "For the topping"
.SECTION "Ingredients"
.CODE
\&.ING "175 g unsalted butter, softened"
\&.ING "2 large eggs, at room temperature"
\&.ING "1\\[u00BD] tsp baking powder"
\&.ING "300 ml buttermilk"
.ENDCODE
.ING "175 g unsalted butter, softened"
.ING "2 large eggs, at room temperature"
.ING "1\[u00BD] tsp baking powder"
.ING "300 ml buttermilk"
.PP
Quantities read the way a cook writes them. The third pair shows a fraction
written as an escape in the source, coming out as 1\[u00BD] on the page.
.SECTION "Method"
.CODE
\&.STEP "Beat the butter and sugar until pale."
\&.STEP "Beat in the eggs, one at a time."
\&.STEP "Fold in the flour and baking powder."
\&.STEP "Rest the batter for 20 minutes."
.ENDCODE
.STEP "Beat the butter and sugar until pale."
.STEP "Beat in the eggs, one at a time."
.STEP "Fold in the flour and baking powder."
.STEP "Rest the batter for 20 minutes."
.PP
The numbering runs for the whole document and does not restart at a section, so
a method split across headings stays one sequence.
.SECTION "A warning"
.CODE
\&.NOTE
\&Resting is not optional: the flour hydrates
\&and the powder starts.
.ENDCODE
.NOTE
Resting is not optional: the flour hydrates and the powder starts.
.PP
Notes are for the things that ruin a dish if missed. A note narrows the measure
by 4 ens while it lasts, so keep them short.
.SECTION "Emphasis in prose"
.CODE
\&Do not open the oven for the first 20 minutes
\&\\(em \\fBthat\\fR decides
\&whether it rises.
.ENDCODE
.PP
Do not open the oven for the first 20 minutes \(em \fBthat\fR decides whether it
rises.
.PP
\fB.B\fR and \fB.I\fR take one argument only; for a phrase inside a sentence use
the inline escapes, which take anything.
.SECTION "Fractions and temperatures"
.CODE
\&Heat the oven to 190\\[u00B0]C, then add
\&1\\[u00BD] tsp of baking powder.
.ENDCODE
.PP
Heat the oven to 190\[u00B0]C, then add
1\[u00BD] tsp of baking powder.
.PP
A degree sign and a fraction as escapes: how a document stays readable in source
and correct on the page.
.SECTION "What cannot be shown this way"
.PP
\fB.RECIPE\fR opens the title block and has already run at the top, and
\fB.STYLE\fR sets the appearance for the whole document, so neither can be
demonstrated mid-document. Both are in the recipe cheat sheet.
.SECTION "Where to read more"
.ING "Recipe documents: the cheat sheet, in this repository and in Notes"
.ING "Groff documents: worked examples, for every macro in the vocabulary"
.ING "groff/examples/buttermilk-pancakes.ms as a complete worked recipe"

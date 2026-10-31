.STYLE palatino
.DOC "Groff documents: worked examples" "every construct: the source, then the result"
.PP
Each pair below is the raw groff source in a code block, followed immediately by
what that source actually produces. Nothing here is a picture of output: the
results \fIare\fR output, set by the same macros any document uses, so this file
is its own proof.
.NOTE
This is the working companion to "Groff documents: the cheat sheet", which lists
the vocabulary in one place. A line inside a code block is shown, never run: the
zero-width \\& at the start is what stops it, and a doubled backslash prints one.
.SECTION "A section heading"
.CODE
\&.SECTION "A section heading"
.ENDCODE
.PP
One line of source, and the heading above is what it made. A heading keeps three
lines of what follows it rather than being stranded at the foot of a page.
.SECTION "Paragraphs"
.CODE
\&.PP
\&A paragraph is spaced, never indented.
\&.br
\&A forced line break happens here.
\&.sp
\&And .sp leaves a blank line.
.ENDCODE
.PP
A paragraph is spaced, never indented.
.br
A forced line break happens here.
.sp
And .sp leaves a blank line.
.PP
Filled text re-flows to the measure by itself, so paragraph source needs no
attention to line length at all - unlike a code block, which needs all of it.
.SECTION "Emphasis"
.CODE
\&.B One argument
\&.I One argument
\&.R One argument
\&.BR One argument
.ENDCODE
.B One argument
.I One argument
.R One argument
\&.BR One argument
.PP
Each takes exactly one argument. A fourth, \fB.BR\fR, looks like it belongs with
them and does not: ms never defines it, so calling it warns "macro 'BR' not
defined" -- and since this renderer fails on warnings, a document that uses
it refuses rather than losing a line. The next line is shown rather than run for
a different reason: running it \fIis\fR the mistake, because groff warns and
silently drops everything after the first word.
.CODE
\&.B This whole line would be bold and the rest would vanish
.ENDCODE
.PP
For an emphasised phrase inside a sentence the inline escapes take anything:
.CODE
\&The word \\fBentropy\\fR and the phrase
\&\\fIthere is no free lunch\\fR
.ENDCODE
.PP
The word \fBentropy\fR and the phrase \fIthere is no free lunch\fR.
.SECTION "Bullets"
.CODE
\&.ING "175 g unsalted butter"
\&.ING "2 large eggs"
.ENDCODE
.ING "175 g unsalted butter"
.ING "2 large eggs"
.PP
\fB.ING\fR is a bullet. The name comes from ingredients but nothing about it is
recipe-specific: it is a hang on the same place a list item's text sits.
.SECTION "Numbers, and where the counter goes"
.PP
Two steps, then a section, then two more. The numbering does not restart.
.CODE
\&.STEP "Beat the eggs."
\&.STEP "Fold in the flour."
\&.SECTION "A new section"
\&.STEP "Rest the batter."
\&.STEP "Fry in butter."
.ENDCODE
.STEP "Beat the eggs."
.STEP "Fold in the flour."
.SECTION "A new section"
.STEP "Rest the batter."
.STEP "Fry in butter."
.PP
The counter runs for the whole document, which is what you want when the second
half is the same method continued under a heading of its own.
.SECTION "Notes"
.CODE
\&.NOTE
\&Resting is not optional: the flour hydrates
\&and the batter thickens.
.ENDCODE
.NOTE
Resting is not optional: the flour hydrates and the batter thickens.
.PP
A note is labelled, roman rather than italic, and indented to where the text of
a list item starts. It also narrows the measure by 4 ens while it lasts.
.SECTION "A code block"
.CODE
\&.CODE
\&for (std::ptrdiff_t i = 0; i < std::ssize(v); ++i)
\&    use(v[i], i);
\&.ENDCODE
.ENDCODE
.CODE
for (std::ptrdiff_t i = 0; i < std::ssize(v); ++i)
    use(v[i], i);
.ENDCODE
.PP
Monospaced, 10pt, unfilled: nothing wraps, so a line past the measure is drawn
out into the margin with no warning at all. Palatino holds 62 characters of it,
dejavu 65.
.SECTION "Characters"
.CODE
\&One half: \\[u00BD].    A degree: \\[u00B0]C.
\&A bullet: \\(bu.    An em dash: \\(em.
\&Quotes: \\(lqlike this\\(rq.
.ENDCODE
.PP
One half: \[u00BD].   A degree: \[u00B0]C.   A bullet: \(bu.
.br
An em dash: \(em.    Quotes: \(lqlike this\(rq.
.PP
Prefer the numbered escape for anything unusual. The palatino set has gaps: the
fraction one third, a circled one, and the smiley are dropped as special
character not defined, and since this renderer fails on any warning at all, a
missing glyph refuses the document instead of losing a character quietly.
.SECTION "What cannot be shown this way"
.PP
Two macros change the document rather than the text in it, so neither can be
demonstrated in the middle of one: \fB.DOC\fR and \fB.RECIPE\fR open the title
block and have already run at the top, and \fB.STYLE\fR chooses the appearance
set for the whole document, which is why it is the first line of this file. Both
are explained in the cheat sheet.
.SECTION "Where to read more"
.ING "docs/groff-guide.md: the same ground in prose"
.ING "groff/examples/: this file, both cheat sheets, a worked recipe"
.ING "man groff_ms and man groff_char for the primitives and characters"

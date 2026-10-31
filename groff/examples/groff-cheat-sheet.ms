.STYLE palatino
.DOC "Groff documents: the cheat sheet" "everything a .DOC document can do"
.PP
A groff note is opened by exactly one macro, and there are two of them:
\fB.DOC\fR and \fB.RECIPE\fR. They are one title block under two names, so they
render identically. The name is there so that the kind of document is visible in
its own source -- \fB.RECIPE "Lemon drizzle cake" "serves 8"\fR reads as a
recipe, \fB.DOC "Iterating over a vector"\fR reads as everything else.
.NOTE
A note\'s kind is fixed when it is created and cannot be changed afterwards.
Converting one kind into the other is not a thing: create a new note instead.
.SECTION "The title block"
.PP
The first line is the opener with the title, and an optional second argument
that is set in italic under it. That second slot is where a recipe puts its
yield; in a .DOC it is a subtitle.
.CODE
\&.DOC "Iterating over a vector" "the forms worth knowing"
\&.RECIPE "Buttermilk pancakes" "serves 4"
.ENDCODE
.SECTION "Sections and paragraphs"
.PP
\fB.SECTION "Heading"\fR starts a section: a bold heading in the heading family,
with enough vertical space, and it keeps three lines of what it introduces with
it rather than stranding the heading at the foot of a page.
.PP
Paragraphs are block paragraphs -- spaced, never indented -- and \fB.PP\fR is
the one to reach for. \fB.P\fR and \fB.LP\fR do the same thing here.
.PP
A line break inside a paragraph is \fB.br\fR; a deliberate blank line is
\fB.sp\fR. Filled text re-flows to the measure on its own, so paragraph text
needs no attention to line length.
.SECTION "Emphasis: the one-argument rule"
.PP
\fB.B\fR, \fB.I\fR and \fB.R\fR each take ONE argument. Give one of
them a whole sentence and groff warns "excess arguments to .B ignored" and sets
the rest of the line as ordinary text -- quietly, unless you read the warnings.
.NOTE
This renderer fails on any warning at all, so that mistake is caught rather than
shipped. The habit is still worth having: for an emphasised phrase inside a
sentence, use the inline escape, which takes anything.
.CODE
\&.B Entropy
\&.B Only this word is bold - all of this is dropped
\&.B Entropy
Everything after the macro's one argument is plain text.
Inline: \fBEntropy\fR is a phrase in a sentence.
.ENDCODE
.SECTION "Lists: bullets and numbers"
.PP
\fB.ING "175 g unsalted butter"\fR is a bullet item -- named for ingredients,
but it is simply a bullet and any document may use it. \fB.STEP "Beat the
eggs"\fR is a numbered item; the counter runs per document and \fBdoes not
reset at a section\fR, so steps keep numbering across headings.
.CODE
\&.ING "175 g unsalted butter"
\&.ING "2 large eggs"
\&.STEP "Beat the eggs with the sugar."
\&.STEP "Fold in the flour, then the milk."
.ENDCODE
.SECTION "Notes"
.PP
\fB.NOTE\fR sets an aside: it is labelled, roman rather than italic, and
indented to the same place a list item\'s text sits. It also narrows the measure
by 4 ens while it lasts.
.CODE
\&.NOTE
Warnings belong here: substitutions, resting time,
what "fold" means when the batter is stiff.
.ENDCODE
.SECTION "Code and preformatted blocks"
.PP
\fB.CODE\fR starts a preformatted block -- monospaced, 10pt, no filling -- and
\fB.ENDCODE\fR ends it. Nothing wraps inside one: a line that is too long simply
runs past the right margin, without a warning. A line that has to \fBshow\fR a request
instead of running it starts with the zero-width character: the escape \\& and then the
dot. Every block on this sheet is written that way, so nothing here re-executes. Measured widths for the body
measure are in the appearance section below.
.CODE
std::vector<int> v{3, 1, 3};
for (std::ptrdiff_t i = 0; i < std::ssize(v); ++i)
    use(v[i], i);
.ENDCODE
.SECTION "Appearance: the .STYLE sets"
.PP
A document names an appearance set, never a font. \fB.STYLE\fR takes one of two
names and belongs at the very top, before the title. An unknown name aborts the
render with an error on stderr and no PDF at all, which is deliberate: it cannot
quietly produce something else.
.CODE
\&.STYLE palatino   12pt  5.2i  62 code chars  731 KB   default
\&.STYLE dejavu     11pt  5.5i  65 code chars  2.3 MB   needs -F
.ENDCODE
.PP
Palatino is the URW base-35 family groff mounts itself, so nothing has to be
installed. It is also missing a few characters: the fraction one third, a
circled one, and the smiley face are "special character not defined" and are
dropped. DejaVu covers DejaVu\'s whole repertoire, at a larger file size.
.SECTION "Characters"
.PP
A document is read as UTF-8, so ordinary accented letters work directly. For
anything unusual prefer the numbered escape \fB\\[u00BD]\fR, which is what groff
documents use for one half, and \fB\\[u00B0]\fR for a degree sign. Four
characters worth knowing by name are the bullet \fB\\(bu\fR, the em dash
\fB\\(em\fR, a left double quote \fB\\(lq\fR and its partner \fB\\(rq\fR.
.SECTION "Rendering it"
.PP
From the Notes repository, which holds the fonts and the house style:
.CODE
cd ~/hermes-workspace/Notes
deno task groff:render groff/examples/two-vectors.ms \\
    ~/out.pdf
.ENDCODE
.PP
That is a thin wrapper around one groff command, and the order of the pieces in
it matters: the ms macro package has to initialise before the house style loads,
or ms quietly overwrites the page setup.
.CODE
cd ~/hermes-workspace/Notes
groff -Kutf8 -ww -dpaper=letter -P-pletter -P-e \\
      -F <font-dir> -ms \\
      -m house -Tpdf - < doc > out.pdf
      -M <styles-dir> -m house -Tpdf - < doc > out.pdf
.ENDCODE
.PP
A clean render has \fBno output on stderr at all\fR. Worth checking with pdfinfo
and pdffonts too: page count, and every font embedded.
.SECTION "What a house document cannot do"
.PP
The vocabulary is closed on purpose. A document may use the macros in this sheet
plus a short list of ms primitives, and nothing else -- a request outside that
list refuses the whole render rather than being silently stripped.
.ING "No sectioning or title macros of its own: titles and headings go through .DOC and .SECTION"
.ING "No file inclusion: a document cannot pull in another file"
.ING "No tables: .TS and .TE are not on the list yet, so the preformatted block is the way to align columns"
.ING "No images, and no fonts, sizes, measures or margins: appearance comes from a .STYLE set"
.ING "No raw output-driver escapes, in either direction"
.ING "No hyphenation anywhere: an identifier is never split across a line break"
.SECTION "Beyond Notes: contents, outlines and indexes"
.PP
groff does have all of this, and yes -- it works exactly the way LaTeX does:
the first pass collects references, a later pass resolves them. What it is not
is available inside Notes yet.
.PP
The machinery is the pdfmark macros. \fB.TC\fR marks where a table of contents
belongs; with the ms binding package loaded, \fB.NH\fR and \fB.XN\fR together
produce both a contents entry and a live cross-reference from a heading, which
plain ms has no way to do. Reference marks are set with the \fB.pdfhref\fR
macro, and the wrapper \fBpdfroff\fR then runs as many pre-formatting passes as
needed to resolve them -- up to four -- merges the contents into the front and
publishes one PDF.
.NOTE
Measured on groff 1.23: a single groff pass renders the body and leaves the
contents section empty, reporting an unresolved reference; the same source
through pdfroff comes out with a full contents page, dotted leaders and correct
page numbers. Two ways to see it with the same source: groff once, then pdfroff.
.PP
There is no equivalent of a LaTeX index command, though: groff has no built-in
index generator. An index is built from the same marks -- a reference whose
text is the target\'s page number, or a data file written in one pass and read
in the next. The pdfmark manual is the reference for that, and it ships on this
machine.
.PP
Two reasons this is out of reach in Notes today: the renderer makes one pass and
fails on warnings, so an unresolved reference refuses rather than shipping; and
pdfroff publishes through Ghostscript rather than the PDF device the house style
is built on. It is a print-time feature, and the print path is not built yet.
.SECTION "Where to read more"
.ING "docs/groff-guide.md in this repository: the same ground, prose form"
.ING "man groff_ms, man groff, man groff_char for the primitives and characters"
.ING "/usr/share/doc/groff-base/pdf/pdfmark.pdf.gz for contents, outlines, links and indexes"
.ING "groff/examples/ in this repository: this sheet, the vector notes, a recipe"

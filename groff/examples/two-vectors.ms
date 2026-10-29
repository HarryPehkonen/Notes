.DOC "Two vectors, compared element by element" "the three length policies, and the code for each"

.PP
Comparing two vectors element by element is really two decisions: what a
mismatch in length means, and whether you walk them by position or hand the
job to an algorithm. The first decision picks the loop. Make it in the code,
where a reader can see it, and the rest follows.

.SECTION "First, decide what a mismatch means"
.PP
Almost every bug in this area is a length policy nobody chose. There are three,
and they are not interchangeable.
.PP
\fBMismatch is an error.\fR The vectors are meant to hold one element per item
on each side, so a difference in length means the data is wrong. Check the
sizes, refuse, and then walk with a plain index.
.PP
\fBOnly as far as the shorter one.\fR Sizes may legitimately differ, and the
pairing stops where either side runs out. This is the rule zip implements, and
what a compare-the-overlap loop does.
.PP
\fBCompare a prefix.\fR The shorter range is known to be a prefix and the
longer one is known to be at least as long. This is the one to avoid: the
precondition is invisible at the call, and code that breaks it reads exactly
like code that satisfies it.

.SECTION "Policy 1: the same length is required"
.CODE
std::optional<int> countDiffs(const std::vector<int>& a,
                              const std::vector<int>& b) {
    if (a.size() != b.size()) return std::nullopt;
    int diffs = 0;
    for (std::size_t i = 0; i < a.size(); ++i) {
        if (a[i] != b[i]) ++diffs;
    }
    return diffs;
}
.ENDCODE
.PP
The guard is the policy. Once it holds, a.size() is the length of both, and the
index loop is the plainest thing that walks them in step.
.PP
For the failure itself, choose what the caller can act on. Throw when a
mismatch is a programming error, return std::optional or std::expected when it
is bad input, return an error code when it is neither. Do \fBnot\fR use assert
as the check on data you did not generate: assert vanishes when NDEBUG is
defined, and the release build then walks whatever it was handed.

.SECTION "Policy 2: only as far as the shorter one"
.CODE
const std::size_t n = std::min(a.size(), b.size());
for (std::size_t i = 0; i < n; ++i) {
    compare(a[i], b[i]);
}
.ENDCODE
.PP
std::min names the policy, which is why it beats a pair of conditions folded
into the loop test. Both sides are indexed with the same i, so the two cannot
drift apart.
.PP
The iterator version says the same thing without an index:
.CODE
for (auto ia = a.begin(), ib = b.begin();
     ia != a.end() && ib != b.end(); ++ia, ++ib) {
    compare(*ia, *ib);
}
.ENDCODE
.PP
Two details carry the whole meaning. The test is \fB&&\fR, so the loop ends
when either range does; make it || and you read past the shorter one. And each
iterator is only ever compared against the end of its own container -- writing
ia != b.end() is not a measure of progress, it is undefined behaviour.

.SECTION "std::equal, and the shorter form that cannot see length"
.PP
When the answer is only yes or no, the library does the walking:
.CODE
#include <algorithm>
bool same = std::equal(a.begin(), a.end(),
                       b.begin(), b.end());
.ENDCODE
.PP
That four-iterator form is the entire comparison: true when both ranges have
the same length and every pair matches. It is policy 1, asked as a question.
.PP
The three-iterator form is shorter, and for a reason that matters:
.CODE
// precondition: b is at least as long as a
bool prefix = std::equal(a.begin(), a.end(), b.begin());
.ENDCODE
.PP
It never looks at b's end, so it cannot notice that b has more elements.
Measured: [1, 2, 3] against [1, 2, 3, 4] returns \fBtrue\fR. This is the
prefix policy wearing the clothes of an equality test, and it is the shortest
way to write a comparison that is silently wrong.

.SECTION "Where do they first differ? std::mismatch"
.CODE
auto [ia, ib] = std::mismatch(a.begin(), a.end(),
                              b.begin(), b.end());
if (ia != a.end()) {
    const auto at = std::distance(a.begin(), ia);
    report(at, *ia, *ib);        // first place they disagree
}
.ENDCODE
.PP
It stops at the first difference, or wherever the shorter range runs out
first, and returns that position in each range. On two identical vectors both
iterators come back as their end iterators, so \fBia == a.end()\fR is the test
for agreement. Reach for this one when a human has to see where a comparison
went wrong, because the index falls out of it.

.SECTION "Equality and ordering with no loop at all"
.CODE
if (a == b) { }   // same length and same elements
if (a != b) { }   // a length difference already counts
if (a < b)  { }   // lexicographic: first difference wins
.ENDCODE
.PP
The vector's own operators are element-wise, and a length difference is
answerable rather than fatal: a four-element vector is simply not equal to a
three-element one, and the shorter is the lesser. \fBoperator<\fR is
lexicographical -- the first difference decides, and a proper prefix is the
lesser vector -- which is the same rule as std::lexicographical_compare, one
line longer:
.CODE
bool less = std::lexicographical_compare(
    a.begin(), a.end(), b.begin(), b.end());
.ENDCODE
.PP
So when the question really is "are these the same?" or "which comes first?",
the operators answer it and no policy has to be chosen at all. The policy only
appears when you must visit each pair.

.SECTION "zip: the shorter policy built in (C++23)"
.CODE
#include <ranges>
for (auto&& [x, y] : std::views::zip(a, b)) {
    compare(x, y);
}
.ENDCODE
.PP
zip stops at the shorter range: policy 2, written once, in the for statement.
The bindings are references into both vectors rather than copies, so writing
to x writes into a:
.CODE
for (auto&& [x, y] : std::views::zip(acc, error)) {
    x += y;
}
.ENDCODE
.PP
Two companions live in the same header. zip_transform applies a function to
each pair as it goes, without building a range of pairs first; enumerate hands
you the index beside the element, which is what you want when the loop also
has to index a third container:
.CODE
for (auto [i, x] : std::views::enumerate(a)) {
    report(i, x, b[i]);
}
.ENDCODE
.PP
The index from enumerate is the range's difference type, so it is signed,
unlike the std::size_t an index loop carries.
.PP
On C++20 there is no zip, and the honest stand-in is the index loop. std::views::iota
gives a lazy index range if you would rather stay in pipeline style -- both
build and run at -std=c++20:
.CODE
const std::size_t n = std::min(a.size(), b.size());
for (auto i : std::views::iota(std::size_t{0}, n)) {
    compare(a[i], b[i]);
}
.ENDCODE

.SECTION "One job per pair: transform"
.CODE
#include <algorithm>
std::vector<int> sums(a.size());
std::transform(a.begin(), a.end(), b.begin(),
               sums.begin(), std::plus<int>{});
.ENDCODE
.PP
With a binary operation, transform applies it to the pairs and writes each
result into a third range. The output has to be large enough for the first
range, and in this three-iterator form b must hold at least as many elements as
a -- otherwise the final reads run past its end. With equal lengths there is
nothing to think about; with unequal lengths, the index loop says so out loud.

.SECTION "Comparing doubles is not comparison"
.CODE
auto near = [](double x, double y) {
    return std::fabs(x - y) <= 1e-9;
};
bool same = std::equal(a.begin(), a.end(),
                       b.begin(), b.end(), near);
.ENDCODE
.PP
0.1 + 0.2 is not 0.3, so a vector holding the sum is not equal to one holding
the literal, and no care taken in the loop changes that. Compare with a
tolerance, and pick the tolerance from the arithmetic rather than from the
first value that makes the test pass.
.PP
NaN is the case a tolerance does not fix. A vector holding a NaN is not equal
to itself, and \fBfabs(NaN - NaN) <= eps\fR is false too, because every
comparison against NaN is false. That leaves the policy to you: call two NaNs
equal by testing isnan on both sides, or call the pair an error, but decide it
rather than discover it.

.SECTION "Which form to reach for"
.PP
\fB"These two must be the same length."\fR Check the sizes, refuse or throw,
then an index loop. std::equal with four iterators if the answer is only yes
or no.
.PP
\fB"Compare as far as they overlap."\fR std::min with an index loop; zip on
C++23; the two-iterator loop when an index means nothing.
.PP
\fB"Where do they first differ?"\fR std::mismatch, which hands back the index.
.PP
\fB"Are they identical, or which is smaller?"\fR a == b, a < b. No loop, no
policy chosen, and unequal lengths answered instead of punished.
.PP
\fB"One operation per pair."\fR std::transform with a binary operation, or
zip_transform on C++23 -- equal lengths assumed.
.PP
\fB"Doubles."\fR A tolerance predicate, and a decision about NaN.

.PP
.NOTE "Every snippet here was compiled and run at C++23 (g++ 14.2) before it was set in type, and the stand-in for zip builds at -std=c++20 too. The two measurements quoted -- equal(3) calling [1, 2, 3] equal to a prefix of [1, 2, 3, 4], and zip stopping at the shorter range -- are its output, not a recollection."

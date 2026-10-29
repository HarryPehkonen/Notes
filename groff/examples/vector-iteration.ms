.DOC "Iterating over a vector" "the forms worth using, and the ones that bite"

.PP
Every form below walks one vector and does something to each element. They
differ in what they cost, in what you may do to an element, and in whether you
may change the vector while you walk it. Reach for the first one that fits.

.SECTION "Start here: the range-based for"
.PP
The default. It reads every element, copies none, and works for anything with
begin() and end(): a vector, a std::array, a string, a map, a list, a C array
that is still in scope, and any range from the standard library.
.CODE
for (const auto& item : v) {
    use(item);       // a reference: nothing is copied
}
.ENDCODE
.PP
It says what it means - for each element - with no index to get wrong and no
end() to forget. Use a different form only when you need the position, need to
stop or skip, or need to change the container as you go.

.SECTION "The four binding forms"
.PP
The only decision in a range-based for is how you bind the element.
.CODE
for (const auto& x : v)  // read it    - no copy
for (auto& x : v)        // modify it  - writes through
for (auto x : v)         // copy it    - one per element
for (auto&& x : v)       // bind it    - takes anything
.ENDCODE
.PP
\fIconst auto&\fR is the one to write by habit: it cannot accidentally modify
the vector, and it cannot silently copy. The third form is a trap on purpose -
\fBfor (auto x : v)\fR on a vector of strings copies every string, and the loop
body then edits the copy, which is why the vector looks unchanged afterwards.
Write it when you truly want a copy to edit.
.PP
The fourth form is the safe general one. It binds to a plain reference when the
container holds real objects, and to the temporary that a proxy reference
returns when it does not. That distinction matters for exactly one common
container, below.

.SECTION "When you need the position"
.PP
A range-based for hides the index, so ask for it when you need it: to compare
against a previous element, to report where a problem is, or to skip elements.
.CODE
for (std::size_t i = 0; i < v.size(); ++i) {
    if (i > 0 && v[i] == v[i - 1]) continue;
    use(v[i], i);
}
.ENDCODE
.PP
Use std::size_t, not int. Comparing a signed index against the unsigned
size() is a warning on a good day and a wrong answer on a bad one. Where the
type is awkward, std::ssize(v) gives a signed size.
.PP
Indexing has two flavours and they are not the same: v[i] is unchecked and
v[i] on an out-of-range index is undefined behaviour, while v.at(i) throws
std::out_of_range. Use at() for an index that comes from input or arithmetic,
and [] where the loop invariant already proves the range.

.SECTION "Iterators, when you need to move around"
.CODE
for (auto it = v.begin(); it != v.end(); ++it) {
    use(*it);
}
for (auto it = v.cbegin(); it != v.cend(); ++it) {}  // const
for (auto it = v.rbegin(); it != v.rend(); ++it) {}  // back
.ENDCODE
.PP
Prefer ++it to it++. On an iterator the difference is small; on the habit it
costs nothing to be right. Use cbegin() and cend() when you are reading a
container you must not modify, and remember that iterating a
\fBconst std::vector<T>&\fR already gives you const iterators.
.PP
Routing through iterators buys you three things an index cannot: it works the
same way on containers that have no index at all, it makes "insert or erase
here" expressible, and it lets the standard algorithms do the walking.

.SECTION "Changing the vector while you walk it"
.PP
This is where iterating a vector stops being obvious. Two facts drive
everything here: an iterator or reference into a vector is invalidated when the
vector reallocates, and a range-based for evaluates end() once, at the start.
.PP
So do not add to a vector inside its own range-based for. The cached end() may
outlive the storage it pointed into. Push into a different container, or use an
index loop and walk from the end downwards, which is safe because pushing at
the back never moves the elements before it.
.PP
Removing has a well-worn idiom. Erase-remove first, because std::remove does
not remove anything: it shuffles the kept elements to the front and returns the
new logical end, and erase() cuts the tail off.
.CODE
#include <algorithm>
v.erase(std::remove(v.begin(), v.end(), 42), v.end());
v.erase(std::remove_if(v.begin(), v.end(), pred), v.end());
.ENDCODE
.PP
C++20 replaced both with one call each, and it is worth the upgrade:
.CODE
#include <vector>
std::erase(v, 42);            // remove every 42
std::erase_if(v, pred);       // remove every match
.ENDCODE
.PP
If you must inspect each element before deciding, erase through the iterator
the call hands back - never it++ on an erased iterator, which is the classic
way to skip an element or run off the end:
.CODE
for (auto it = v.begin(); it != v.end(); ) {
    if (gone(*it)) it = v.erase(it); else ++it;
}
.ENDCODE

.SECTION "One job per element: algorithms instead of loops"
.PP
When the loop body is a single well-known operation, the standard library
already has it, named, tested, and often faster. The headers are <algorithm>
and, for the arithmetic ones, <numeric>.
.CODE
#include <algorithm>
#include <numeric>

std::for_each(v.begin(), v.end(), [](int x) { use(x); });

int total = std::accumulate(v.begin(), v.end(), 0);
int big   = *std::max_element(v.begin(), v.end());
auto it   = std::find(v.begin(), v.end(), 42);
bool any  = std::any_of(v.begin(), v.end(), pred);
auto n    = std::count_if(v.begin(), v.end(), pred);

std::vector<int> out(v.size());
std::transform(v.begin(), v.end(), out.begin(), f);
.ENDCODE
.PP
One real difference from a for loop: for_each takes a callable, so there is no
break and no continue. If you need to stop early, or carry state between
elements, write the loop. C++17 added std::reduce for a parallel-friendly
accumulate; C++20 added ranges versions that take a projection, so you can sort
or compare by one member without writing a lambda.

.SECTION "Ranges and views (C++20)"
.PP
A view is a lazy description of a range. Nothing is copied, and nothing is
walked until something asks for an element, so views compose freely:
.CODE
#include <ranges>
for (int x : v | std::views::filter(odd)
             | std::views::transform(square)
             | std::views::take(3)) {
    use(x);
}
for (int x : v | std::views::reverse) { use(x); }
.ENDCODE
.PP
The pitfall is lifetime, and it is not obvious. In C++20 a range-based for
does not extend the life of a temporary range, so the named temporary below
dies before the first element is read, and the loop reads freed memory. C++23
fixed the language so this just works; on a C++20 compiler, name the container:
.CODE
// C++20: dangling - the filtered view dies with the statement
for (int x : makeVec() | std::views::filter(odd)) { /*...*/ }

// do this instead on C++20
auto w = makeVec() | std::views::filter(odd);
for (int x : w) { use(x); }
.ENDCODE

.SECTION "Other containers, same shapes"
.PP
Everything above transfers, with the element types changing. The map is the
one worth spelling out, because the element is a pair:
.CODE
#include <map>
for (const auto& [key, value] : counts) use(key, value);

std::array<int, 4> a{1, 2, 3, 4};
for (int x : a) { use(x); }        // same forms

std::string s = "abc";
for (char c : s) { use(c); }        // char& to modify
.ENDCODE
.PP
A C array works only while it is still an array. Once it is passed to a
function it decays to a pointer, size() and end() are gone, and the loop will
not compile. Fix that by taking a span (C++20) or a reference to the array,
which keeps its extent:
.CODE
#include <span>
void f(std::span<int> v) { for (int x : v) use(x); }  // C++20
template <std::size_t N>
void g(const int (&a)[N]) { for (int x : a) use(x); }
.ENDCODE
.PP
Two containers carry a surprise. \fBstd::vector<bool>\fR does not store bools:
it packs bits, and its element access returns a proxy object rather than a
reference, so
\fBfor (bool b : bits)\fR copies the proxy and
\fBfor (auto&& b : bits)\fR is the form that works, including for writing.
\fBstd::forward_list\fR has no size(), for the good reason that counting would
be a walk. And on a list, erase-remove is pointless: std::list::remove and
remove_if erase in place, in one pass.

.SECTION "Size and emptiness"
.PP
Two lines that are always safe, and the arithmetic that is not:
.CODE
if (v.empty()) return;        // not v.size() == 0
auto n = v.size();            // n is unsigned

if (v.size() - 1 > 0) { }   // WRONG when v is empty
for (std::size_t i = 0; i + 1 < v.size(); ++i) {}
.ENDCODE
.PP
.CODE
for (std::size_t i = 0; i + 1 < v.size(); ++i)
    if (v[i] == v[i + 1]) return true;   // adjacent dupes
.ENDCODE

.SECTION "Which form to reach for"
.PP
\fBRead every element, nothing else.\fR Use for (const auto& x : v).
.PP
\fBChange every element in place.\fR Use for (auto& x : v).
.PP
\fBNeed the index, or the neighbours.\fR Use an index loop with std::size_t.
.PP
\fBMust remove while walking.\fR Use std::erase_if, or the erase-returning
iterator form.
.PP
\fBOne known operation over every element.\fR Use the algorithm: accumulate,
transform, count_if, any_of, max_element.
.PP
\fBA pipeline of filters and transforms.\fR Use views, and name the container
if you are on C++20.
.PP
\fBWalking two containers at once.\fR Iterate one by index and index the other;
a range-based for cannot step two ranges together, and zip is C++23.

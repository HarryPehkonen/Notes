#!/usr/bin/env bash
#
# The gate - run this before you push (and before you deploy).
#
# Why this file exists instead of CI: the checks that keep this app honest are
# cheap (a 4-second suite, a 1-second lint) and they belong to the repo, not to
# somebody else's account. One definition, three callers:
#
#   1. a human, by hand            scripts/gate.sh
#   2. git, on push                .githooks/pre-push  (arm once per clone:
#                                  git config core.hooksPath .githooks)
#   3. a clean checkout elsewhere   the Pi's nightly job (a fresh `git clone`
#                                  into a temp dir, then this same script)
#
# Running the SAME file in all three places is the point: "the gate passed"
# then means one thing no matter who says it.
#
# It reports every failure rather than stopping at the first, so one run tells
# you everything that is wrong.
#
# Bypass deliberately, never accidentally:  git push --no-verify
#
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.deno/bin:$PATH"
# No colour: the gate greps its own tools' output, and ANSI escapes defeat both
# the greps here and any log it is piped into.
export NO_COLOR=1
export DENO_NO_UPDATE_CHECK=1

status=0
step() { printf '\n== %s\n' "$1"; }
fail() { printf 'GATE FAILED: %s\n' "$1" >&2; status=1; }

# ---------------------------------------------------------------- 1. lint
# Quiet on success: one line. Loud on failure: the rules, verbatim.
step "lint"
lint_out="$(deno task lint 2>&1)"; lint_rc=$?
if [ "$lint_rc" -ne 0 ]; then
  printf '%s\n' "$lint_out" | grep -vE "^Task lint" | head -60
  fail "deno task lint (the rules above)"
else
  printf '%s\n' "$lint_out" | grep -E "Checked [0-9]+ files" || echo "clean"
fi

# ---------------------------------------------------------------- 2. tests
# The suite is not only pure functions: it also holds the wire-contract guards
# (client URL vs server route, payload keys, response shapes), which are the
# checks that catch a component/API mismatch no pure-function test can see.
step "tests"
test_out="$(deno task test 2>&1)"; test_rc=$?
if [ "$test_rc" -ne 0 ]; then
  printf '%s\n' "$test_out" | grep -E "FAILED|error:|AssertionError|Diff" | head -40
  fail "deno task test (failures above; full output: deno task test)"
else
  printf '%s\n' "$test_out" | grep -E "^(ok|FAILED) \|" | tail -1
fi

# ---------------------------------------------------------------- 3. format
# Only the files this branch touches. The repo has pre-existing non-compliant
# files; formatting the whole tree would bury the gate in noise nobody edited.
base="$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse HEAD)"
touched="$(
  { git diff --name-only --diff-filter=ACMR "$base" HEAD
    git diff --name-only --diff-filter=ACMR HEAD
    # `git diff HEAD` compares the WORKING TREE and skips the index, so a file whose staged copy
    # differs from its working-tree copy (staged, then formatted on disk) appeared in neither it
    # nor the untracked list, and its formatting went unchecked at the moment a commit would
    # have recorded it.
    git diff --cached --name-only --diff-filter=ACMR
    # New files are invisible to `git diff` until they are staged, so without
    # this line a brand-new file's formatting is never checked at the moment it
    # is written - only after it has already been committed.
    git ls-files --others --exclude-standard
  } | sort -u
)"
# A clean checkout (the nightly job, or any clone sitting exactly on origin/main)
# is not "ahead of" anything, so the two diffs above are empty and the checks
# below would silently pass on files nobody looked at. Fall back to the last
# commit that landed: on a daily cadence that is "what went in yesterday".
if [ -z "$touched" ]; then
  touched="$(git show --name-only --pretty=format: HEAD | sed '/^$/d')"
  late_note=" (last commit, since this checkout is level with origin/main)"
fi
files="$(printf '%s\n' "$touched" | grep -E '\.(js|ts|css|html)$' || true)"
step "format ($(printf '%s\n' "$files" | grep -c . ) changed js/ts/css/html file(s))"
if [ -n "$files" ]; then
  # shellcheck disable=SC2086
  deno fmt --check $files || fail "deno fmt --check (fix: deno fmt $files)"
else
  echo "nothing to check"
fi
# The check above reads files from the WORKING TREE, and a commit records the INDEX. Stage an
# unformatted file, then format it on disk -- what anyone does right after this check fails --
# and everything above passes while the commit records the unformatted text. Kit fix
# `format-checks-staged-deno` (docs/KIT-FIXES.md, kit 9e73c6c).
#
# deno fmt has no --check for stdin (`deno fmt --check --ext ts -` returns 0 for unformatted
# input, measured on 2.9.6), so the test is the formatter as a pure function: a file is
# formatted iff formatting its text returns that text unchanged. deno fmt reads deno.json from
# the current directory -- the repo root here -- so this project's own options apply.
staged_bad=""
staged="$(git diff --cached --name-only --diff-filter=ACMR \
  | grep -E '\.(js|ts|css|html)$' || true)"
for sf in $staged; do
  blob="$(mktemp)"
  if git show ":$sf" > "$blob" 2>/dev/null; then
    if ! deno fmt --ext "${sf##*.}" - < "$blob" | diff -q - "$blob" >/dev/null 2>&1; then
      staged_bad="$staged_bad $sf"
    fi
  fi
  rm -f "$blob"
done
if [ -n "$staged_bad" ]; then
  printf '    the STAGED copy is not formatted (that is what a commit would record):\n'
  for sf in $staged_bad; do printf '      %s\n' "$sf"; done
  fail "deno fmt on the STAGED copy (fix: deno fmt$staged_bad && git add$staged_bad)"
fi

# ------------------------------------------------------- 4. version bump
# A public/ change without a version bump is a deploy that stays invisible on a
# phone that has the service worker cached. app_version_test.ts keeps
# APP_VERSION and CACHE_NAME equal; this keeps the bump from being forgotten.
step "version bump"
changed_public="$(printf '%s\n' "$touched" | grep '^public/' || true)"
if [ -n "$changed_public" ]; then
  if printf '%s\n' "$changed_public" | grep -qx 'public/version.js'; then
    echo "public/ changed, and public/version.js was bumped"
  else
    printf '%s\n' "$changed_public" | sed 's/^/  touched: /'
    fail "public/ changed without bumping public/version.js (and CACHE_NAME in sw.js)"
  fi
else
  echo "no public/ changes"
fi

# ---------------------------------------------------------------- 5. kit probes
# A fix that must propagate ships a probe: each script in tools/kit-probes/ holds this gate to one kit
# fix's contract -- name and behaviour, not bytes -- and exits non-zero when the fix is absent.
# Offline, no kit checkout, no build, about a second.
step "kit probes (the fixes this copy claims to carry)"
self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
if [ ! -d tools/kit-probes ]; then
  echo "  no tools/kit-probes/ - this copy carries no kit probe yet"
else
  for probe in tools/kit-probes/*.sh; do
    [ -f "$probe" ] || continue
    if bash "$probe" "$self" "$PWD"; then
      echo "  ok   $(basename "$probe")"
    else
      fail "$(basename "$probe")"
    fi
  done
fi

if [ "$status" -eq 0 ]; then
  printf '\nGATE PASSED%s\n' "${late_note:-}"
else
  printf '\nGATE FAILED - do not push this\n' >&2
fi

exit "$status"

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
  } | sort -u
)"
files="$(printf '%s\n' "$touched" | grep -E '\.(js|ts|css|html)$' || true)"
step "format ($(printf '%s\n' "$files" | grep -c . ) changed js/ts/css/html file(s))"
if [ -n "$files" ]; then
  # shellcheck disable=SC2086
  deno fmt --check $files || fail "deno fmt --check (fix: deno fmt $files)"
else
  echo "nothing to check"
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

if [ "$status" -eq 0 ]; then
  printf '\nGATE PASSED\n'
else
  printf '\nGATE FAILED - do not push this\n' >&2
fi

exit "$status"

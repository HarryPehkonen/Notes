#!/usr/bin/env bash
#
# format - only the files this branch touches. The repo has pre-existing non-compliant
# files; formatting the whole tree would bury the gate in noise nobody edited.
#
# The staged copy is checked too: the check above reads files from the WORKING TREE and a
# commit records the INDEX, so a file staged unformatted and then formatted on disk
# passed while the commit recorded the unformatted text (kit fix
# `format-checks-staged-deno`, docs/KIT-FIXES.md, kit 9e73c6c).
#
# deno fmt has no --check for stdin (`deno fmt --check --ext ts -` returns 0 for
# unformatted input, measured on 2.9.6), so the test is the formatter as a pure function:
# a file is formatted iff formatting its text returns that text unchanged. deno fmt reads
# deno.json from the current directory - the repo root here - so this project's own
# options apply.
#
# Called from gate.toml as `[stage.format] cmd = "scripts/format.sh"`.
set -uo pipefail
. "$(dirname "$0")/gate-env.sh"

run_stage() {
    local touched files staged staged_bad sf blob
    touched="$(touched_files)"
    files="$(printf '%s\n' "$touched" | grep -E '\.(js|ts|css|html)$' || true)"
    if [ -n "$files" ]; then
        # shellcheck disable=SC2086
        deno fmt --check $files || fail "deno fmt --check (fix: deno fmt $files)"
    else
        echo "nothing to check"
    fi

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
}

run_stage "$@"

#!/usr/bin/env bash
#
# lint - quiet on success: one line. Loud on failure: the rules, verbatim.
#
# Called from gate.toml as `[stage.lint] cmd = "scripts/lint.sh"`.
set -uo pipefail
. "$(dirname "$0")/gate-env.sh"

run_stage() {
    local lint_out lint_rc
    lint_out="$(deno task lint 2>&1)"; lint_rc=$?
    if [ "$lint_rc" -ne 0 ]; then
        printf '%s\n' "$lint_out" | grep -vE "^Task lint" | head -60
        fail "deno task lint (the rules above)"
    fi
    printf '%s\n' "$lint_out" | grep -E "Checked [0-9]+ files" || echo "clean"
}

run_stage "$@"

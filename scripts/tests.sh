#!/usr/bin/env bash
#
# tests - the suite is not only pure functions: it also holds the wire-contract guards
# (client URL vs server route, payload keys, response shapes), which are the checks that
# catch a component/API mismatch no pure-function test can see.
#
# Called from gate.toml as `[stage.tests] cmd = "scripts/tests.sh"`.
set -uo pipefail
. "$(dirname "$0")/gate-env.sh"

run_stage() {
    local test_out test_rc
    test_out="$(deno task test 2>&1)"; test_rc=$?
    if [ "$test_rc" -ne 0 ]; then
        printf '%s\n' "$test_out" | grep -E "FAILED|error:|AssertionError|Diff" | head -40
        fail "deno task test (failures above; full output: deno task test)"
    fi
    printf '%s\n' "$test_out" | grep -E "^(ok|FAILED) \|" | tail -1
}

run_stage "$@"

#!/usr/bin/env bash
#
# version bump - a public/ change without a version bump is a deploy that stays invisible
# on a phone that has the service worker cached. app_version_test.ts keeps APP_VERSION and
# CACHE_NAME equal; this keeps the bump from being forgotten.
#
# Called from gate.toml as `[stage.version] cmd = "scripts/version.sh"`.
set -uo pipefail
. "$(dirname "$0")/gate-env.sh"

run_stage() {
    local touched changed_public
    touched="$(touched_files)"
    changed_public="$(printf '%s\n' "$touched" | grep '^public/' || true)"
    if [ -z "$changed_public" ]; then
        echo "no public/ changes"
        return 0
    fi
    if printf '%s\n' "$changed_public" | grep -qx 'public/version.js'; then
        echo "public/ changed, and public/version.js was bumped"
        return 0
    fi
    printf '%s\n' "$changed_public" | sed 's/^/  touched: /'
    fail "public/ changed without bumping public/version.js (and CACHE_NAME in sw.js)"
}

run_stage "$@"

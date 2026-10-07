#!/usr/bin/env bash
#
# Notes' gate: the configuration every stage reads, and the helpers they share.
#
# The POLICY is gate.toml (which stages exist, which tier runs which of them, how a failure
# is recognised). The ENGINE is kit-ci, one binary installed once per machine
# (cmake -S ~/hermes-workspace/KitCI -B build && cmake --install build --prefix ~/.local).
# Everything a stage needs BEYOND that policy - the Deno on PATH, the touched-file list -
# lives HERE, so the policy file stays a list of stages.
#
# SOURCED, never executed: scripts/gate.sh does not need it; every stage script does
# (`. "$(dirname "$0")/gate-env.sh"`). Until 2026-10-06 this was the prologue of a 163-line
# scripts/gate.sh, which ran every check itself and printed its own summary (card
# t_075c0a6f). The knobs are the ones that script carried, with the defaults it had.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
export PATH="$HOME/.deno/bin:$PATH"
# No colour: the gate greps its own tools' output, and ANSI escapes defeat both the greps
# here and any log it is piped into.
export NO_COLOR=1
export DENO_NO_UPDATE_CHECK=1

# git exports GIT_INDEX_FILE to a hook when the commit is made with a PATHSPEC
# (`git commit -- <path>`): it names git's TEMPORARY index for that one commit, not this
# repo's index, and every process the hook starts inherits it. Any `git` command the gate
# runs inside ANOTHER repository then reads this repo's index entries against that
# repository's object store and dies on the first blob it does not have. Unset once, here,
# so it reaches every stage. This is the kit fix f9c3300, whose guarantee now lives in
# docs/KIT-FIXES.md -> "Retired fixes" (the probe that held it was retired 2026-10-07 and no
# repo on this fleet carries it any more). Latent for this repo, not live: every git call
# this gate makes reads its own repo. scripts/gate.sh unsets it too, for a caller that never
# sources this file. Added 2026-10-07, card t_c50bed30.
unset GIT_INDEX_FILE

if [ -f .ci.env ]; then
    # shellcheck disable=SC1091
    . ./.ci.env
fi

# A stage's verdict is its exit status now, so the old gate's status/step/fail trio is one
# helper: `fail` says why and exits 1, and kit-ci names the stage in its own verdict line.
fail() { printf 'GATE FAILED: %s\n' "$*" >&2; exit 1; }
note() { printf '   %s\n' "$*"; }

# The files this branch touches - used by the format and version stages. The repo has
# pre-existing drift, and reporting on the whole tree every run buries the signal in noise
# nobody edited. A clean checkout (the nightly job, or any clone level with origin/main) is
# not "ahead of" anything, so the diffs are empty there and the LAST COMMIT is what is
# checked instead: on a daily cadence that is "what went in yesterday".
touched_files() {
    local base touched
    if git rev-parse --verify -q HEAD >/dev/null 2>&1; then
        base="$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse HEAD)"
        touched="$(
            { git diff --name-only --diff-filter=ACMR "$base" HEAD
              git diff --name-only --diff-filter=ACMR HEAD
              # `git diff HEAD` compares the WORKING TREE and skips the index, so a file whose
              # staged copy differs from its working-tree copy (staged, then formatted on disk)
              # appeared in neither it nor the untracked list.
              git diff --cached --name-only --diff-filter=ACMR
              # New files are invisible to `git diff` until they are staged, so without this
              # line a brand-new file's formatting is never checked at the moment it is
              # written - only after it has already been committed.
              git ls-files --others --exclude-standard
            } | sort -u
        )"
        if [ -z "$touched" ]; then
            touched="$(git show --name-only --pretty=format: HEAD | sed '/^$/d')"
        fi
    else
        touched="$(git diff --cached --name-only --diff-filter=ACMR)"
    fi
    printf '%s
' "$touched"
}

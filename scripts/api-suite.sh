#!/usr/bin/env bash
#
# api-suite - run the boundary suites (multi-user isolation, token scopes,
# token management) against a real server and a throwaway database.
#
#   scripts/api-suite.sh                 # the Pi's nightly caller runs this
#   scripts/api-suite.sh --keep          # leave the database and server log
#   API_SUITE_DB=notes_api_test scripts/api-suite.sh
#
# WHY THIS IS NOT A GATE STAGE: everything in `gate.toml` runs on a clean
# checkout with no database and no server, which is what makes it runnable by
# the pre-push hook, by hand, and nightly. These suites need both - two scratch
# users with real tokens, and an HTTP server with the dev auth bypass OFF - so
# they run here instead, from the nightly caller, which is already allowed to
# touch the machine.
#
# Two passes, because the halves need opposite auth:
#
#   pass 1  no session        isolation + scopes   (what a TOKEN may do, and
#                                                  that A cannot see B's data)
#   pass 2  DEV_USER_EMAIL    session              (what only a SESSION may do:
#                                                  mint, list and revoke tokens)
#
# With the bypass on, every request is a session, so pass 1 would silently
# measure the wrong thing (it did, the first time this was written by hand);
# the runner asserts which mode the server is in before each pass.
#
# Silent when healthy: one line on success. On failure it prints the failures
# and exits non-zero.
set -uo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

DB="${API_SUITE_DB:-notes_api_test}"
PORT="${API_SUITE_PORT:-8011}"
BASE="http://localhost:$PORT"
PSQL="${API_SUITE_PSQL:-sudo -u postgres psql}"
KEEP=0
WORK="$(mktemp -d)"
LOG="$WORK/server.log"

# The database role the app connects as. A dev clone already names one in its
# .env (and the app would read it if we let it); a nightly checkout has no .env,
# so the password has to come from somewhere outside the repo - the caller's
# config file, which is where the nightly keeps everything else that is
# machine-specific.
DB_USER="${API_SUITE_DB_USER:-}"
DB_PASSWORD="${API_SUITE_DB_PASSWORD:-}"
if [ -f ./.env ]; then
  [ -n "$DB_USER" ] || DB_USER="$(grep -E '^DB_USER=' ./.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  [ -n "$DB_PASSWORD" ] || DB_PASSWORD="$(grep -E '^DB_PASSWORD=' ./.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
DB_USER="${DB_USER:-notes_dev}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1 ;;
    --database) DB="$2"; shift ;;
    --port) PORT="$2"; BASE="http://localhost:$PORT"; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "api-suite: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

report=""
add() { report="${report}${1}"$'\n'; }

case "$DB" in
  *_test|*_scratch) ;;
  *) echo "api-suite: refusing to use '$DB' - the name must end in _test or _scratch" >&2; exit 2 ;;
esac

# ------------------------------------------------------------------ preflight
for tool in deno uv psql; do
  command -v "$tool" >/dev/null 2>&1 || { echo "api-suite: $tool is not on PATH" >&2; exit 2; }
done

if [ -z "$DB_PASSWORD" ]; then
  echo "api-suite: no database password: set API_SUITE_DB_PASSWORD (a fresh checkout has no .env to read it from)" >&2
  exit 2
fi

export PATH="$HOME/.deno/bin:$PATH"

SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  for _ in $(seq 1 20); do ss -ltn 2>/dev/null | grep -q ":$PORT " || break; sleep 0.5; done
  if [ "$KEEP" = "0" ]; then
    $PSQL -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1
    rm -rf "$WORK"
  else
    echo "api-suite: kept database $DB; server log at $LOG"
  fi
}
trap cleanup EXIT

start_server() { # start_server "on"|"off" - is the dev auth bypass wanted?
  local want="$1"
  if [ "$want" = "on" ]; then
    DEV_USER_EMAIL="$(python3 -c 'import sys; sys.path.insert(0,"tests/api"); import scratch_tokens as scratch; print(scratch.SESSION_EMAIL)')"
  else
    DEV_USER_EMAIL=""
  fi
  : >"$LOG"
  # Every required variable is passed EXPLICITLY. That is what makes this
  # runnable from a fresh clone, which has no .env at all: `--env` loads one if
  # it exists, and explicit values win over it either way, so the same command
  # works in the dev clone and in a nightly checkout.
  env \
    GOOGLE_CLIENT_ID=scratch GOOGLE_CLIENT_SECRET=scratch \
    GOOGLE_REDIRECT_URI="http://localhost:$PORT/auth/callback" \
    SESSION_SECRET="api-suite-scratch-$(date +%s)" \
    DB_HOST=localhost DB_PORT=5432 DB_USER="$DB_USER" DB_NAME="$DB" DB_PASSWORD="$DB_PASSWORD" \
    DB_POOL_SIZE=3 NODE_ENV=development \
    DEV_USER_EMAIL="$DEV_USER_EMAIL" PORT="$PORT" HOST=localhost \
    deno run --env --allow-net --allow-read --allow-env --allow-write server/main.js \
    >>"$LOG" 2>&1 &
  SERVER_PID=$!

  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/notes" || true)" != "000" ] && break
    sleep 0.5
  done

  # Which server is answering is not a detail: a wrong mode makes the pass below
  # measure something else entirely.
  local actual="off"
  grep -q "DEV_USER_EMAIL set" "$LOG" && actual="on"
  if [ "$actual" != "$want" ]; then
    add "the server came up with the dev auth bypass $actual, wanted $want"
    return 1
  fi
  return 0
}

stop_server() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  for _ in $(seq 1 20); do ss -ltn 2>/dev/null | grep -q ":$PORT " || break; sleep 0.5; done
  SERVER_PID=""
}

run_pytest() { # run_pytest <mark expression> <label>
  local marks="$1" label="$2" out rc
  out="$(cd tests/api && NOTES_BASE_URL="$BASE" uv run pytest -m "$marks" -q 2>&1)"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    add "$label: FAILED"
    while IFS= read -r line; do add "  $line"; done < <(
      printf '%s\n' "$out" | grep -E "^(FAILED|ERROR)|assert|Error|short test summary|^E " | head -20
    )
    return 1
  fi
  local summary
  summary="$(printf '%s\n' "$out" | tail -1)"
  printf 'api-suite: %s -> %s\n' "$label" "$summary"
  return 0
}

# ------------------------------------------------------------ 1. scratch database
$PSQL -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1
if ! $PSQL -q -c "CREATE DATABASE $DB" >/dev/null 2>&1; then
  add "could not create the scratch database $DB (is PostgreSQL running, and is '$PSQL' right?)"
  printf 'api-suite: %s\n' "$(date '+%Y-%m-%d %H:%M')"
  printf '%s' "$report"
  exit 1
fi
$PSQL -q -c "GRANT ALL ON DATABASE $DB TO $DB_USER" >/dev/null 2>&1
$PSQL -q -d "$DB" -c "GRANT ALL ON SCHEMA public TO $DB_USER" >/dev/null 2>&1

# ------------------------------------------------------- 2. the local venv
if ! (cd tests/api && uv sync --quiet >/dev/null 2>&1); then
  add "uv sync failed in tests/api (the suites need pytest and httpx)"
  printf 'api-suite: %s\n' "$(date '+%Y-%m-%d %H:%M')"
  printf '%s' "$report"
  exit 1
fi

# ------------------------------- 3. pass 1: what a token may do (no session)
if start_server off; then
  if ! python3 tests/api/seed_scratch.py --database "$DB" --psql-prefix "$PSQL"; then
    add "seeding $DB failed - the suites below would fail confusingly (or worse, vacuously)"
  else
    run_pytest "isolation or scopes" "isolation + token scopes (no session)"
    stop_server

    # ------------------------- 4. pass 2: what only a session may do
    if start_server on; then
      run_pytest "session" "token management (session)"
      stop_server
    fi
  fi
fi

# ------------------------------------------------------------------ verdict
if [ -n "$report" ]; then
  printf 'api-suite %s\n%s' "$(date '+%Y-%m-%d %H:%M')" "$report"
  exit 1
fi

exit 0

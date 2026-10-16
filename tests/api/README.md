# Notes API Characterization Test Suite

Black-box HTTP tests that pin the Notes API's current, observable behavior. A future Python (FastAPI) port can run this suite as a **conformance check** — every test documents what the Deno server actually does today, warts included.

## Prerequisites

- Python 3.11+ (`python3`)
- [uv](https://docs.astral.sh/uv/) (package manager)
- PostgreSQL (for local write tests)
- Deno (for local server)

## Setup

```bash
cd tests/api
uv sync
```

## Running Tests

### Read-only tests against production (safe — no writes)

```bash
NOTES_BASE_URL=https://harrisnotes.ca \
NOTES_TOKEN=$(cat ~/.hermes/shared/notes-api.token) \
uv run pytest -m readonly -v
```

### Full suite against local scratch instance

**WARNING: `RESET_DATABASE=true` DESTROYS ALL DATA. NEVER point at `notes_app`.**

1. Create the scratch database:

```bash
sudo -u postgres createdb notes_char_test
sudo -u postgres psql -c "GRANT ALL ON DATABASE notes_char_test TO notes_dev"
sudo -u postgres psql -d notes_char_test -c "GRANT ALL ON SCHEMA public TO notes_dev"
```

2. Start the local server:

```bash
cd /path/to/Notes
DB_NAME=notes_char_test RESET_DATABASE=true deno task dev
```

3. Mint a test token:

```bash
# Create a test user (if needed)
sudo -u postgres psql -d notes_char_test \
  -c "INSERT INTO users (email, name) VALUES ('test@example.com', 'Test User') ON CONFLICT DO NOTHING"

# Mint a token
DB_NAME=notes_char_test deno task token:create --email test@example.com --name char-test
```

4. Run the full suite:

```bash
NOTES_BASE_URL=http://localhost:8000 \
NOTES_TOKEN=<paste-token-here> \
uv run pytest -v
```

## Test Files

| File                 | Coverage                                                  |
| -------------------- | --------------------------------------------------------- |
| `test_auth.py`       | 401 on missing/bad token (readonly)                       |
| `test_isolation.py`  | user B cannot read or touch user A's notes/tags/search     |
| `test_token_scopes.py` | what a token may do: scopes, expiry, revocation, no token management |
| `test_tokens.py`     | the session-only token API: create, list, revoke, one-time plaintext |
| `test_notes.py`      | Notes CRUD, versions, restore, delete                     |
| `test_tags.py`       | Tags CRUD, 409 duplicate, color update, attach/detach     |
| `test_search.py`     | Full-text, advanced, semantic (skip), suggestions, recent |
| `test_filtering.py`  | Tri-state tag filter, pinned/archived filters             |
| `test_errors.py`     | Error JSON shape for 400/401/404/409                      |
| `test_pagination.py` | Meta envelope, boundaries, unicode, empty/oversized body  |
| `test_delete_204.py` | DELETE 204 no-body regression (commit 5cb1910)            |

## The boundary suites (isolation, token scopes, token management)

These three need more than a server: scratch users with real tokens, and one
pass with the dev auth bypass OFF (with `DEV_USER_EMAIL` set every request is a
session, which would make the token suites measure the wrong thing entirely).

```bash
scripts/api-suite.sh            # creates the database, seeds, runs both passes, cleans up
scripts/api-suite.sh --keep     # leave the database and the server log behind
```

The credentials are in `scratch_tokens.py` (one source of truth for the tests and
for `seed_scratch.py`, which writes the matching rows). The runner creates a
throwaway database — `notes_api_test` by default, and it refuses any name that
does not end in `_test` or `_scratch`.

To run one suite by hand against an already-seeded scratch database:

```bash
NOTES_BASE_URL=http://localhost:8011 uv run pytest -m isolation   # no session
NOTES_BASE_URL=http://localhost:8011 uv run pytest -m scopes      # no session
NOTES_BASE_URL=http://localhost:8011 uv run pytest -m session     # session (DEV_USER_EMAIL)
```

## Custom Marks

- `readonly` — safe against production; no writes, no side effects
- (default) — includes writes; local scratch instance only
- `isolation` — cross-user row-level security; needs the seeded scratch users
- `scopes` — what an API token may do; needs the seeded token states, no session
- `session` — the endpoints a token may not touch; needs a session server

## Characterization Honesty

Tests pin **current observed behavior**. Lines marked `# observed:` document server behavior that may be surprising or undocumented — these are **findings, not bugs** to fix in this suite's scope.

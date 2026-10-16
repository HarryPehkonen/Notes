"""Seed a scratch database with the users and tokens the boundary suites need.

Run by `scripts/api-suite.sh` (and by hand) before the suites that need real
credentials. It talks to PostgreSQL through `psql` via subprocess rather than a
driver, so the suite keeps its two dependencies (pytest, httpx) and a machine
that can run the app can also seed it.

    python3 tests/api/seed_scratch.py --database notes_api_test

Idempotent: every statement is an upsert or guarded by a NOT EXISTS, so a
re-run on a seeded database changes nothing. It never touches a database whose
name does not end in `_test` (or `_scratch`): this script writes users and
tokens, and the one thing it must never do is write them into a real one.
"""

import argparse
import shlex
import subprocess
import sys

import scratch_tokens as scratch


def sql_literal(value: str) -> str:
    """A single-quoted SQL string literal."""
    return "'" + value.replace("'", "''") + "'"


def token_array(scopes) -> str:
    """A Postgres text[] literal for a scope list."""
    return "'{" + ",".join(scopes) + "}'::text[]"


def build_sql() -> str:
    """Every statement the seed needs, as one script for psql."""
    statements = []

    def user(email: str, name: str) -> None:
        # ON CONFLICT on the users' unique email keeps this idempotent.
        statements.append(
            "INSERT INTO users (email, name, picture) "
            f"VALUES ({sql_literal(email)}, {sql_literal(name)}, NULL) "
            "ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;"
        )

    def token(email: str, name: str, plaintext: str, scopes, expiry: str, revoked: bool) -> None:
        revoked_at = "CURRENT_TIMESTAMP" if revoked else "NULL"
        # The column is what the middleware hashes against, so the digest is
        # computed here exactly as the app computes it: pgcrypto, in SQL.
        statements.append(
            "INSERT INTO api_tokens (user_id, name, token_hash, scopes, expires_at, revoked_at) "
            f"SELECT id, {sql_literal(name)}, digest({sql_literal(plaintext)}, 'sha256'), "
            f"{token_array(scopes)}, {expiry}, {revoked_at} "
            f"FROM users WHERE email = {sql_literal(email)} "
            "ON CONFLICT (user_id, name) DO UPDATE SET "
            f"token_hash = EXCLUDED.token_hash, scopes = EXCLUDED.scopes, "
            f"expires_at = EXCLUDED.expires_at, revoked_at = EXCLUDED.revoked_at;"
        )

    user(scratch.EMAIL_A, scratch.NAME_A)
    user(scratch.EMAIL_B, scratch.NAME_B)
    user(scratch.EMAIL_OWNER, scratch.NAME_OWNER)
    user(scratch.SESSION_EMAIL, scratch.SESSION_NAME)

    # The isolation suite's two owners, each with an ordinary read/write token.
    token(scratch.EMAIL_A, "isolation-a", scratch.TOKEN_A, ["read", "write"], "NULL", False)
    token(scratch.EMAIL_B, "isolation-b", scratch.TOKEN_B, ["read", "write"], "NULL", False)

    for spec in scratch.STATE_TOKENS:
        token(
            scratch.EMAIL_OWNER,
            spec["name"],
            spec["token"],
            spec["scopes"],
            spec["expiry"],
            spec["revoked"],
        )

    return "\n".join(statements)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, help="scratch database name")
    parser.add_argument("--print", action="store_true", help="print the SQL instead of running it")
    parser.add_argument(
        "--psql-prefix",
        default="psql",
        help='command that runs psql, e.g. "sudo -u postgres psql" (default: psql)',
    )
    args = parser.parse_args()

    if args.print:
        print(build_sql())
        return 0

    # The guard that matters: this writes users and credentials.
    if not (args.database.endswith("_test") or args.database.endswith("_scratch")):
        print(
            f"refusing to seed {args.database!r}: the name must end in _test or _scratch",
            file=sys.stderr,
        )
        return 2

    result = subprocess.run(
        shlex.split(args.psql_prefix) + ["-v", "ON_ERROR_STOP=1", "-q", "-d", args.database],
        input=build_sql(),
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        return result.returncode

    print(f"seeded {args.database}: 4 users, {2 + len(scratch.STATE_TOKENS)} tokens")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""The scratch credentials the boundary suites authenticate with.

One source of truth for both sides of the wire: the tests import these
constants, and `tests/api/seed_scratch.py` writes rows whose SHA-256 digest
matches them into a throwaway database. Duplicating the literals in the seeding
script would let the two drift, and the failure mode of that drift is the worst
one available: a suite that passes because every request is being refused, or
worse, because two "different" users turn out to be one account.

These are throwaway values for a scratch database, on the `scratch.invalid`
domain. They are deliberately not derived from anything real, and they must
never work anywhere but a locally seeded database.
"""

# Two ordinary users: the isolation suite's whole subject is that A cannot
# reach B's data.
TOKEN_A = "nt_A_3twFHg_WeVaxsfmL-3tP3s8LIq6ddEYEQu7re__Ps"
TOKEN_B = "nt_WYO4ztwiRIphj-RrSaVyd61RQcD1BTv7ROyuMVKOLms"
EMAIL_A = "isolation-a@scratch.invalid"
EMAIL_B = "isolation-b@scratch.invalid"
NAME_A = "Isolation A"
NAME_B = "Isolation B"

# One user who owns a token in each state a token can be in. Each state is a
# separate row, because the states have to be usable independently: a revoked
# token cannot stand in for an active one.
EMAIL_OWNER = "token-states@scratch.invalid"
NAME_OWNER = "Token States"

#: name, token, scopes, expiry (an SQL expression), revoked
STATE_TOKENS = (
    {
        "name": "scratch-readonly",
        "token": "nt_bX9Jvg0Gyz3jFd1SQpRn6IiILrc4clPCgCbep3guQI0",
        "scopes": ["read"],
        "expiry": "NULL",
        "revoked": False,
    },
    {
        # The owner's ordinary token. It exists so the read-only suite has a
        # same-user control: proving "the write did not happen" needs a
        # credential that COULD see the note if it had been written, and a
        # different user could never see it either way (a vacuous pass).
        "name": "scratch-write",
        "token": "nt_rwSMF2NYZ-jyKqB6SmL5i_vH9fhv6LQxK14kMn_bTOM",
        "scopes": ["read", "write"],
        "expiry": "NULL",
        "revoked": False,
    },
    {
        "name": "scratch-expired",
        "token": "nt_FoxWqXtgef7vYRJkM6MOe5rccl535XtgVcAOIHXMLsc",
        "scopes": ["read", "write"],
        "expiry": "CURRENT_TIMESTAMP - interval '1 day'",
        "revoked": False,
    },
    {
        "name": "scratch-revoked",
        "token": "nt_v19lF633JEVD8rq7Sp9t1-9kC92nLt-sT8J-MPQcg1c",
        "scopes": ["read", "write"],
        "expiry": "NULL",
        "revoked": True,
    },
)

#: The session-path user: the seeder creates it and the runner starts the
#: server with DEV_USER_EMAIL=<this>, so a browser-session exists for the
#: endpoints that are deliberately session-only (/api/tokens).
SESSION_EMAIL = "session-scratch@scratch.invalid"
SESSION_NAME = "Session Scratch"

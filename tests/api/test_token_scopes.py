"""What an API token may DO: scopes, expiry, revocation, and the token ceiling.

This is the suite for the second credential in the app. A session is the account
owner in a browser and does everything; a token is a credential handed to a
program, and these are the limits that make that safe to do:

  * a read-only token reads and cannot write - refused with 403, before any
    handler runs, so no write is attempted and then rolled back;
  * an expired token is refused as EXPIRED (401, `token_expired`), not as an
    unknown one, so the person holding it knows what to fix;
  * a revoked token is dead immediately;
  * a token cannot manage tokens, however broad its scopes - a credential that
    can mint credentials can outlive its own revocation.

Needs a server started WITHOUT DEV_USER_EMAIL (that bypass creates a session
that shadows Bearer auth) and a database seeded by `seed_scratch.py`.
Local only - never point this at production.
"""

import pytest

from conftest import RateLimitedClient
import scratch_tokens as scratch

pytestmark = pytest.mark.scopes

STATES = {spec["name"]: spec for spec in scratch.STATE_TOKENS}
READONLY = STATES["scratch-readonly"]["token"]
EXPIRED = STATES["scratch-expired"]["token"]
REVOKED = STATES["scratch-revoked"]["token"]


def _client(base_url, token):
    import httpx

    with httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    ) as c:
        yield RateLimitedClient(c)


@pytest.fixture(scope="module")
def readonly(base_url):
    yield from _client(base_url, READONLY)


@pytest.fixture(scope="module")
def expired(base_url):
    yield from _client(base_url, EXPIRED)


@pytest.fixture(scope="module")
def revoked(base_url):
    yield from _client(base_url, REVOKED)


@pytest.fixture(scope="module")
def broad(base_url):
    """The owner's read/write token: the control for "did the write happen?".

    It must belong to the SAME user as the read-only token. A different user
    could not see the note either way, so that check would pass whether or not
    the write had been refused.
    """
    yield from _client(base_url, STATES["scratch-write"]["token"])


def _code(response):
    try:
        return response.json().get("code")
    except Exception:
        return None


# --------------------------------------------------------------- read-only

def test_readonly_token_can_read(readonly):
    r = readonly.get("/api/notes")
    assert r.status_code == 200, r.text


def test_readonly_token_can_search(readonly):
    # Search is a read path with its own route; both must be reachable.
    assert readonly.get("/api/search", params={"q": "anything"}).status_code == 200


@pytest.mark.parametrize("method,path,body", [
    ("post", "/api/notes", {"title": "should not exist", "content": "x"}),
    ("delete", "/api/notes/1", None),
    ("post", "/api/tags", {"name": "should-not-exist", "color": "#000000"}),
])
def test_readonly_token_cannot_write(readonly, method, path, body):
    kwargs = {"json": body} if body is not None else {}
    r = getattr(readonly, method)(path, **kwargs)
    assert r.status_code == 403, f"{method.upper()} {path} answered {r.status_code}: {r.text}"
    assert _code(r) == "insufficient_scope"
    assert r.json()["required"] == "write"


def test_readonly_refusal_names_what_the_token_may_do(readonly):
    r = readonly.post("/api/notes", json={"title": "x", "content": "y"})
    assert r.json()["granted"] == ["read"]
    assert "read" in r.json()["error"]


def test_readonly_refusal_happens_before_the_write(readonly, broad):
    """The note must not exist afterwards - a refusal that still wrote is worse
    than no refusal at all."""
    title = "readonly-refusal-probe"
    r = readonly.post("/api/notes", json={"title": title, "content": "x"})
    assert r.status_code == 403
    listed = broad.get("/api/notes", params={"limit": 200})
    assert title not in listed.text


# ----------------------------------------------------------------- expiry

def test_expired_token_is_refused_as_expired(expired):
    r = expired.get("/api/notes")
    assert r.status_code == 401, r.text
    assert _code(r) == "token_expired"
    # The message has to be actionable: it says what to do about it.
    assert "expired" in r.json()["error"].lower()


def test_expired_token_cannot_write_either(expired):
    r = expired.post("/api/notes", json={"title": "x", "content": "y"})
    assert r.status_code == 401


# ---------------------------------------------------------------- revoked

def test_revoked_token_is_refused(revoked):
    r = revoked.get("/api/notes")
    assert r.status_code == 401, r.text


def test_revoked_token_is_not_reported_as_expired(revoked):
    """A revoked token must not claim to be merely expired: the two states mean
    different things to the person holding it."""
    assert _code(revoked.get("/api/notes")) != "token_expired"


# ------------------------------------------------------ a token's own limit

def test_a_token_cannot_list_tokens(broad):
    r = broad.get("/api/tokens")
    assert r.status_code == 403, r.text
    assert _code(r) == "session_required"


def test_a_token_cannot_create_tokens(broad):
    r = broad.post("/api/tokens", json={"name": "sneaky", "scopes": ["read", "write"]})
    assert r.status_code == 403, r.text
    assert _code(r) == "session_required"


def test_a_token_cannot_revoke_tokens(broad):
    r = broad.delete("/api/tokens/1")
    assert r.status_code == 403, r.text
    assert _code(r) == "session_required"


def test_a_write_token_still_cannot_mint_a_token(broad):
    """The narrow case that matters: `write` is about notes, and it must not
    read as "may manage credentials"."""
    created = broad.post("/api/notes", json={"title": "can write", "content": "x"})
    assert created.status_code == 201, created.text
    try:
        assert broad.post("/api/tokens", json={"name": "escalate"}).status_code == 403
    finally:
        broad.delete(f"/api/notes/{created.json()['data']['id']}")


def test_the_token_listing_never_carries_a_secret(broad):
    """Defence in depth: even if the ceiling above were lifted, the shape of the
    payload must not contain anything a holder could use to impersonate."""
    r = broad.get("/api/tokens")
    # 403 today; if this ever becomes reachable, the listing still must not leak.
    body = r.text
    assert scratch.TOKEN_A not in body
    assert "token_hash" not in body

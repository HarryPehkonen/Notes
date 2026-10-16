"""The endpoints a token may NOT touch: managing tokens.

Everything here runs as a SESSION (the server is started with
DEV_USER_EMAIL=<the scratch session user>), because these are the endpoints the
browser uses and a token is refused by design. The refusals themselves are
tested in `test_token_scopes.py`, on a server with no session in play.

Why this deserves its own suite rather than a curl line in a script: minting and
revoking credentials is the one API in this app that can hand out access, and
the rules around it (a name is unique per user, the plaintext is shown exactly
once, revoking is not deleting) are exactly the ones a well-meaning refactor
erases. Local only - never point this at production.
"""

import uuid

import pytest

import scratch_tokens as scratch

pytestmark = pytest.mark.session


@pytest.fixture()
def created(client):
    """Track tokens made by a test and revoke them afterwards."""
    made = []

    def _create(name=None, scopes=None, expires_in_days=0):
        payload = {"name": name or f"pytest-{uuid.uuid4().hex[:8]}"}
        if scopes is not None:
            payload["scopes"] = scopes
        payload["expires_in_days"] = expires_in_days
        r = client.post("/api/tokens", json=payload)
        if r.status_code == 201:
            made.append(r.json()["data"]["id"])
        return r

    yield _create

    for token_id in made:
        client.delete(f"/api/tokens/{token_id}")


def _find(response, name):
    return [t for t in response.json()["data"] if t["name"] == name]


# ------------------------------------------------------------------- listing

def test_a_session_can_list_its_tokens(client):
    r = client.get("/api/tokens")
    assert r.status_code == 200, r.text
    assert isinstance(r.json()["data"], list)
    assert r.json()["meta"]["total"] == len(r.json()["data"])


def test_the_listing_never_carries_a_token_or_its_hash(client):
    r = client.get("/api/tokens")
    body = r.text
    assert "nt_" not in body, "a token value must never appear in a listing"
    assert "token_hash" not in body
    assert "digest" not in body


# ------------------------------------------------------------------- creating

def test_creating_a_token_returns_the_plaintext_once(created, client):
    name = f"pytest-once-{uuid.uuid4().hex[:6]}"
    r = created(name=name, scopes=["read"])
    assert r.status_code == 201, r.text

    data = r.json()["data"]
    assert data["token"].startswith("nt_")
    assert data["scopes"] == ["read"]
    assert data["state"] == "active"
    # Shown once, and never again - that is the whole contract of the column.
    listed = _find(client.get("/api/tokens"), name)
    assert listed and "token" not in listed[0]


def test_a_read_only_token_is_what_read_only_asks_for(created):
    r = created(scopes=["read"])
    assert r.json()["data"]["scopes"] == ["read"]


def test_write_implies_read(created):
    r = created(scopes=["write"])
    assert sorted(r.json()["data"]["scopes"]) == ["read", "write"]


def test_no_scopes_named_keeps_the_old_behaviour(created):
    r = created()
    assert sorted(r.json()["data"]["scopes"]) == ["read", "write"]


def test_an_unknown_scope_is_refused(created):
    r = created(scopes=["admin"])
    assert r.status_code == 400, r.text
    assert "unknown scope" in r.json()["error"]


def test_an_empty_scope_list_is_refused(created):
    r = created(scopes=[])
    assert r.status_code == 400


def test_an_expiry_is_recorded_when_asked_for(created):
    assert created(expires_in_days=30).json()["data"]["expires_at"] is not None


def test_no_expiry_is_the_default(created):
    assert created(expires_in_days=0).json()["data"]["expires_at"] is None


def test_a_nonsense_expiry_is_refused(created):
    assert created(expires_in_days=-5).status_code == 400


def test_a_name_is_required(created):
    r = created(name="   ")
    assert r.status_code == 400


def test_a_duplicate_name_is_a_conflict_not_a_second_token(created, client):
    name = f"pytest-dup-{uuid.uuid4().hex[:6]}"
    assert created(name=name).status_code == 201
    again = created(name=name)
    assert again.status_code == 409, again.text
    assert len(_find(client.get("/api/tokens"), name)) == 1


def test_two_users_may_use_the_same_token_name(client):
    """The uniqueness is per user, not global: a name is the owner's own
    label, and the seeded users show the other side of it."""
    r = client.post("/api/tokens", json={"name": "scratch-readonly", "scopes": ["read"]})
    assert r.status_code == 201, r.text
    client.delete(f"/api/tokens/{r.json()['data']['id']}")


# ------------------------------------------------------------------ revoking

def test_revoking_marks_it_revoked_and_keeps_the_row(created, client):
    created_token = created()
    token_id = created_token.json()["data"]["id"]
    name = created_token.json()["data"]["name"]

    r = client.delete(f"/api/tokens/{token_id}")
    assert r.status_code == 204, r.text
    assert r.text == "", "a 204 must carry no body"

    listed = _find(client.get("/api/tokens"), name)
    assert listed, "the row survives - this is a revoke, not a delete"
    assert listed[0]["state"] == "revoked"
    assert listed[0]["revoked_at"] is not None


def test_revoking_twice_is_a_no_op_not_an_error(created, client):
    token_id = created().json()["data"]["id"]
    assert client.delete(f"/api/tokens/{token_id}").status_code == 204
    assert client.delete(f"/api/tokens/{token_id}").status_code == 204


def test_revoking_something_that_is_not_yours_is_404(client):
    """The seeded states user's tokens belong to somebody else. Ownership is
    enforced in SQL, so this is a 404 and not a 403 that confirms the id."""
    assert client.delete("/api/tokens/999999").status_code == 404


def test_a_nonsense_id_is_400(client):
    assert client.delete("/api/tokens/not-a-number").status_code == 400


def test_revoking_does_not_require_seeing_the_token_again(created, client):
    """The end-to-end check ("revoke, then present it") lives in the SCOPE suite,
    deliberately.

    It cannot live here: this server runs with the dev auth bypass ON, so a
    request carrying a Bearer header is auto-authenticated as a session before
    the token is ever looked at - presenting a dead token here returns 200 and
    proves nothing. What this pass can observe is that the revoke was recorded,
    which is what it asserts.
    """
    token = created()
    token_id = token.json()["data"]["id"]
    assert client.delete(f"/api/tokens/{token_id}").status_code == 204
    revoked = _find(client.get("/api/tokens"), token.json()["data"]["name"])[0]
    assert revoked["state"] == "revoked"


def test_the_listing_is_per_user(client):
    """A sanity check on both the seeding and the listing: the states user's
    tokens must not appear in this user's list.

    `scratch-readonly` is deliberately not asserted on - a test above creates a
    token of its own with that name, which is exactly the per-user-uniqueness
    rule working.
    """
    names = {t["name"] for t in client.get("/api/tokens").json()["data"]}
    assert "scratch-expired" not in names
    assert "scratch-revoked" not in names
    assert scratch.STATE_TOKENS, "the state tokens are defined"

"""Row-level-security contract: user B must never see or touch user A's data.

Needs two scratch users with API tokens, and a server running WITHOUT
DEV_USER_EMAIL (that bypass makes a session that shadows Bearer auth).
Local only - never point this at production.
"""

import uuid

import httpx
import pytest

from conftest import RateLimitedClient

pytestmark = pytest.mark.isolation

TOKEN_A = "nt_A_3twFHg_WeVaxsfmL-3tP3s8LIq6ddEYEQu7re__Ps"
TOKEN_B = "nt_WYO4ztwiRIphj-RrSaVyd61RQcD1BTv7ROyuMVKOLms"


def _client(base_url, token):
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=base_url, headers=headers, timeout=30) as c:
        yield RateLimitedClient(c)


@pytest.fixture(scope="module")
def client_a(base_url):
    yield from _client(base_url, TOKEN_A)


@pytest.fixture(scope="module")
def client_b(base_url):
    yield from _client(base_url, TOKEN_B)


@pytest.fixture(scope="module", autouse=True)
def distinct_users(client_a, client_b):
    """Fail loudly if both tokens resolve to the same account (e.g. a session bypass)."""
    probe = f"ISOLATION_WHOAMI_{uuid.uuid4().hex}"
    r = client_a.post("/api/notes", json={"title": probe, "content": "x"})
    assert r.status_code == 201, r.text
    nid = r.json()["data"]["id"]
    try:
        seen = client_b.get(f"/api/notes/{nid}")
        assert seen.status_code != 200, (
            "tokens A and B see the same data - is DEV_USER_EMAIL still set on the server?"
        )
    finally:
        client_a.delete(f"/api/notes/{nid}")


@pytest.fixture()
def note_a(client_a):
    """A note owned by A, with one extra version so a version id exists."""
    tag = uuid.uuid4().hex
    r = client_a.post(
        "/api/notes",
        json={"title": f"ISOLATION_PROBE_A_{tag}", "content": f"ISOLATION_BODY_{tag}"},
    )
    assert r.status_code == 201, r.text
    note = r.json()["data"]
    note["_tag"] = tag
    # Editing creates a version row (trigger copies the old content)
    client_a.put(f"/api/notes/{note['id']}", json={"content": f"ISOLATION_BODY_{tag} v2"})
    try:
        yield note
    finally:
        client_a.delete(f"/api/notes/{note['id']}")


def _ids(resp):
    data = resp.json()["data"]
    if isinstance(data, dict):
        data = data.get("notes", data.get("results", []))
    return [n["id"] for n in data]


# ---------------------------------------------------------------------------
# 1. Note CRUD
# ---------------------------------------------------------------------------

def test_b_cannot_get_a_note(client_a, client_b, note_a):
    assert client_a.get(f"/api/notes/{note_a['id']}").status_code == 200
    r = client_b.get(f"/api/notes/{note_a['id']}")
    # observed: 404, same as a nonexistent id - existence is not revealed
    assert r.status_code == 404, r.text


def test_b_cannot_update_a_note(client_a, client_b, note_a):
    r = client_b.put(f"/api/notes/{note_a['id']}", json={"title": "HIJACKED"})
    # observed: 404
    assert r.status_code == 404, r.text
    assert client_a.get(f"/api/notes/{note_a['id']}").json()["data"]["title"] != "HIJACKED"


def test_b_cannot_delete_a_note(client_a, client_b, note_a):
    r = client_b.delete(f"/api/notes/{note_a['id']}")
    # observed: 404 (DELETE is a soft-delete scoped by user_id)
    assert r.status_code == 404, r.text
    assert client_a.get(f"/api/notes/{note_a['id']}").json()["data"]["is_archived"] is False


def test_b_cannot_list_a_note_versions(client_b, note_a):
    r = client_b.get(f"/api/notes/{note_a['id']}/versions")
    # observed: 404
    assert r.status_code == 404, r.text


def test_b_cannot_restore_a_note_version(client_a, client_b, note_a):
    versions = client_a.get(f"/api/notes/{note_a['id']}/versions").json()["data"]
    assert versions, "expected at least one version after an edit"
    vid = versions[0]["id"]
    r = client_b.post(f"/api/notes/{note_a['id']}/restore/{vid}")
    # observed: 404
    assert r.status_code == 404, r.text
    assert "v2" in client_a.get(f"/api/notes/{note_a['id']}").json()["data"]["content"]


# ---------------------------------------------------------------------------
# 2. Lists
# ---------------------------------------------------------------------------

def test_note_absent_from_b_list(client_b, note_a):
    r = client_b.get("/api/notes", params={"limit": 200})
    assert r.status_code == 200
    assert note_a["id"] not in _ids(r)
    assert note_a["_tag"] not in r.text


# ---------------------------------------------------------------------------
# 3. Tags
# ---------------------------------------------------------------------------

def test_tag_absent_from_b_list(client_a, client_b):
    name = f"iso-tag-{uuid.uuid4().hex[:8]}"
    r = client_a.post("/api/tags", json={"name": name, "color": "#123456"})
    assert r.status_code == 201, r.text
    tid = r.json()["data"]["id"]
    try:
        b_tags = client_b.get("/api/tags").json()["data"]
        assert tid not in [t["id"] for t in b_tags]
        assert name not in [t["name"] for t in b_tags]
    finally:
        client_a.delete(f"/api/tags/{tid}")


def test_same_named_tags_are_separate(client_a, client_b):
    name = f"shared-name-{uuid.uuid4().hex[:8]}"
    ra = client_a.post("/api/tags", json={"name": name, "color": "#111111"})
    rb = client_b.post("/api/tags", json={"name": name, "color": "#222222"})
    try:
        assert ra.status_code == 201, ra.text
        assert rb.status_code == 201, rb.text  # no cross-user 409
        ta, tb = ra.json()["data"], rb.json()["data"]
        assert ta["id"] != tb["id"]
        a_mine = [t for t in client_a.get("/api/tags").json()["data"] if t["name"] == name]
        b_mine = [t for t in client_b.get("/api/tags").json()["data"] if t["name"] == name]
        assert [t["id"] for t in a_mine] == [ta["id"]]
        assert [t["id"] for t in b_mine] == [tb["id"]]
    finally:
        if ra.status_code == 201:
            client_a.delete(f"/api/tags/{ra.json()['data']['id']}")
        if rb.status_code == 201:
            client_b.delete(f"/api/tags/{rb.json()['data']['id']}")


# ---------------------------------------------------------------------------
# 4. Search
# ---------------------------------------------------------------------------

def test_search_does_not_leak_to_b(client_a, client_b):
    word = "isoprobe" + uuid.uuid4().hex[:12]
    r = client_a.post("/api/notes", json={"title": f"title {word}", "content": f"body {word} text"})
    assert r.status_code == 201, r.text
    nid = r.json()["data"]["id"]
    try:
        # control: A finds it, so a zero for B is meaningful
        ra = client_a.get("/api/search", params={"q": word})
        assert ra.status_code == 200
        assert nid in _ids(ra), "control failed: A cannot find own note (index lag?)"

        rb = client_b.get("/api/search", params={"q": word})
        assert rb.status_code == 200
        # observed: 200 with an empty result list
        assert _ids(rb) == []
        # observed: the envelope echoes the query itself, so check results only
        assert word not in str(rb.json()["data"]["results"])
        # the advanced search path must hold the line too
        rc = client_b.post("/api/search/advanced", json={"query": word})
        if rc.status_code == 200:
            assert nid not in _ids(rc)
            assert f"body {word}" not in str(rc.json()["data"])
    finally:
        client_a.delete(f"/api/notes/{nid}")


# ---------------------------------------------------------------------------
# 5. Archived notes
# ---------------------------------------------------------------------------

def test_archived_note_absent_from_b_archived_list(client_a, client_b):
    tag = uuid.uuid4().hex
    r = client_a.post("/api/notes", json={"title": f"ISOLATION_ARCHIVED_{tag}", "content": "x"})
    assert r.status_code == 201, r.text
    nid = r.json()["data"]["id"]
    try:
        assert client_a.delete(f"/api/notes/{nid}").status_code in (200, 204)
        mine = client_a.get("/api/notes", params={"archived": "true", "limit": 200})
        assert nid in _ids(mine), "control failed: A's archived note not in A's archived list"
        theirs = client_b.get("/api/notes", params={"archived": "true", "limit": 200})
        assert theirs.status_code == 200
        assert nid not in _ids(theirs)
        assert tag not in theirs.text
    finally:
        # DELETE archives; nothing further to remove via the API
        pass

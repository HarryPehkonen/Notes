"""Shared fixtures and configuration for the Notes API characterization suite."""

import os
import httpx
import pytest

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

DEFAULT_BASE = "http://localhost:8000"


def _base_url() -> str:
    return os.environ.get("NOTES_BASE_URL", DEFAULT_BASE).rstrip("/")


def _token() -> str | None:
    return os.environ.get("NOTES_TOKEN") or None


# ---------------------------------------------------------------------------
# Shape-assertion helper
# ---------------------------------------------------------------------------

def assert_shape(obj, schema, path=""):
    """Recursively assert that *obj* matches *schema*.

    Schema values are Python types (``str``, ``int``, ``list``, ``dict``,
    ``bool``, ``type(None)``) or nested dicts/lists.

    A ``list`` schema means "must be a list" (length is not checked).
    A ``dict`` schema checks that every key in the schema exists and each
    value matches the sub-schema.
    """
    if isinstance(schema, dict):
        assert isinstance(obj, dict), f"{path}: expected dict, got {type(obj).__name__}"
        for key, sub in schema.items():
            assert key in obj, f"{path}: missing key '{key}'"
            assert_shape(obj[key], sub, path=f"{path}.{key}")
    elif isinstance(schema, list):
        assert isinstance(obj, list), f"{path}: expected list, got {type(obj).__name__}"
        if schema:
            for i, item in enumerate(obj):
                assert_shape(item, schema[0], path=f"{path}[{i}]")
    elif isinstance(schema, tuple):
        # Union type: obj must be instance of ANY of the types
        assert isinstance(obj, schema), (
            f"{path}: expected one of {[s.__name__ for s in schema]}, "
            f"got {type(obj).__name__} = {obj!r}"
        )
    elif isinstance(schema, type):
        assert isinstance(obj, schema), (
            f"{path}: expected {schema.__name__}, got {type(obj).__name__} = {obj!r}"
        )
    elif schema is None:
        assert obj is None, f"{path}: expected None, got {obj!r}"
    else:
        raise ValueError(f"Unknown schema entry: {schema!r}")


# ---------------------------------------------------------------------------
# HTTP client fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def base_url():
    return _base_url()


@pytest.fixture(scope="session")
def token():
    return _token()


class RateLimitedClient:
    """Wrapper that retries on 429 with backoff."""

    def __init__(self, client):
        self._c = client

    def request(self, method, url, **kw):
        r = None
        for attempt in range(10):
            r = self._c.request(method, url, **kw)
            if r.status_code != 429:
                return r
            import time
            time.sleep(3 * (attempt + 1))
        return r  # last attempt

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)

    def put(self, url, **kw):
        return self.request("PUT", url, **kw)

    def delete(self, url, **kw):
        return self.request("DELETE", url, **kw)


@pytest.fixture(scope="session")
def client(base_url, token):
    """Synchronous httpx client with optional Bearer auth."""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with httpx.Client(base_url=base_url, headers=headers, timeout=30) as c:
        yield RateLimitedClient(c)


@pytest.fixture()
def no_auth_client(base_url):
    """Client with NO Authorization header (for 401 tests)."""
    with httpx.Client(base_url=base_url, timeout=30) as c:
        yield RateLimitedClient(c)


@pytest.fixture()
def bad_auth_client(base_url):
    """Client with a garbage Bearer token."""
    headers = {"Authorization": "Bearer nt_garbage_token_that_does_not_exist_12345"}
    with httpx.Client(base_url=base_url, headers=headers, timeout=30) as c:
        yield RateLimitedClient(c)


# ---------------------------------------------------------------------------
# Write-capable client (separate so readonly tests never use it)
# ---------------------------------------------------------------------------

@pytest.fixture()
def write_client(client):
    """Alias — same session-scoped client.  Exists so the intent is explicit."""
    return client


# ---------------------------------------------------------------------------
# Helpers for creating scratch resources
# ---------------------------------------------------------------------------

@pytest.fixture()
def make_note(write_client):
    """Factory fixture: creates a note and returns it.  Clean-up is best-effort.
    observed: POST /api/notes returns the note flat in data (not data.note).
    """
    created = []

    def _make(title="Scratch Note", content="body", tags=None, pinned=False):
        body = {"title": title, "content": content, "pinned": pinned}
        if tags:
            body["tags"] = tags
        r = write_client.post("/api/notes", json=body)
        assert r.status_code == 201, f"make_note failed: {r.status_code} {r.text}"
        note = r.json()["data"]
        created.append(note["id"])
        return note

    yield _make

    for nid in created:
        try:
            write_client.delete(f"/api/notes/{nid}")
        except Exception:
            pass


@pytest.fixture()
def make_tag(write_client):
    """Factory fixture: creates a tag and returns it.
    observed: POST /api/tags returns the tag flat in data (not data.tag).
    observed: GET /api/tags returns data as a list (not data.tags).
    """
    created = []

    def _make(name="scratch-tag", color="#ff0000"):
        r = write_client.post("/api/tags", json={"name": name, "color": color})
        assert r.status_code in (201, 409), f"make_tag failed: {r.status_code} {r.text}"
        if r.status_code == 409:
            # Tag already exists — find it
            tags_r = write_client.get("/api/tags")
            for t in tags_r.json()["data"]:
                if t["name"] == name:
                    return t
            pytest.fail(f"Tag '{name}' reported 409 but not in GET /api/tags")
        tag = r.json()["data"]
        created.append(tag["id"])
        return tag

    yield _make

    for tid in created:
        try:
            write_client.delete(f"/api/tags/{tid}")
        except Exception:
            pass
"""Tri-state tag filtering and pinned/archived filters.

observed: Note fields use `is_pinned` / `is_archived` (not `pinned`/`archived`).
observed: Single-note responses return data flat (not data.note).
"""

import uuid
import pytest
from conftest import assert_shape


class TestTagFiltering:
    """Tags: required (AND), excluded, combined."""

    def test_filter_by_required_tags(self, write_client, make_note, make_tag):
        t1 = make_tag(name=f"req1-{uuid.uuid4().hex[:8]}")
        t2 = make_tag(name=f"req2-{uuid.uuid4().hex[:8]}")
        note = make_note(title="Both tags")
        write_client.put(f"/api/notes/{note['id']}/tags/{t1['id']}")
        write_client.put(f"/api/notes/{note['id']}/tags/{t2['id']}")

        # Filter requiring BOTH tags (AND)
        r = write_client.get("/api/notes", params={"tags": f"{t1['id']},{t2['id']}"})
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        ids = [n["id"] for n in data["data"]["notes"]]
        assert note["id"] in ids
        meta = data["meta"]
        assert meta.get("tagsApplied") is True

    def test_filter_by_excluded_tags(self, write_client, make_note, make_tag):
        tag = make_tag(name=f"excl-{uuid.uuid4().hex[:8]}")
        note = make_note(title="Has excluded tag")
        write_client.put(f"/api/notes/{note['id']}/tags/{tag['id']}")

        r = write_client.get("/api/notes", params={"exclude_tags": str(tag["id"])})
        assert r.status_code == 200
        data = r.json()
        ids = [n["id"] for n in data["data"]["notes"]]
        assert note["id"] not in ids
        assert data["meta"].get("excludeTagsApplied") is True

    def test_combined_required_and_excluded(self, write_client, make_note, make_tag):
        req_tag = make_tag(name=f"req-{uuid.uuid4().hex[:8]}")
        excl_tag = make_tag(name=f"exc-{uuid.uuid4().hex[:8]}")
        good = make_note(title="Good note")
        bad = make_note(title="Bad note")
        write_client.put(f"/api/notes/{good['id']}/tags/{req_tag['id']}")
        write_client.put(f"/api/notes/{bad['id']}/tags/{req_tag['id']}")
        write_client.put(f"/api/notes/{bad['id']}/tags/{excl_tag['id']}")

        r = write_client.get("/api/notes", params={
            "tags": str(req_tag["id"]),
            "exclude_tags": str(excl_tag["id"]),
        })
        assert r.status_code == 200
        ids = [n["id"] for n in r.json()["data"]["notes"]]
        assert good["id"] in ids
        assert bad["id"] not in ids

    @pytest.mark.readonly
    def test_empty_tags_param_returns_400(self, client):
        """Non-empty tags with no usable ID -> 400, never unfiltered list."""
        r = client.get("/api/notes", params={"tags": "not-a-number"})
        assert r.status_code == 400

    @pytest.mark.readonly
    def test_empty_exclude_tags_param_returns_400(self, client):
        r = client.get("/api/notes", params={"exclude_tags": "abc"})
        assert r.status_code == 400


class TestPinnedFilter:
    def test_pinned_filter(self, write_client, make_note):
        pinned = make_note(title="Pinned note", pinned=True)
        r = write_client.get("/api/notes", params={"pinned": "true"})
        assert r.status_code == 200
        for note in r.json()["data"]["notes"]:
            assert note["is_pinned"] is True

    def test_unpinned_filter(self, write_client, make_note):
        unpinned = make_note(title="Unpinned", pinned=False)
        r = write_client.get("/api/notes", params={"pinned": "false"})
        assert r.status_code == 200
        for note in r.json()["data"]["notes"]:
            assert note["is_pinned"] is False


class TestArchivedFilter:
    def test_archived_filter(self, write_client, make_note):
        note = make_note(title="Will be archived")
        write_client.delete(f"/api/notes/{note['id']}")
        r = write_client.get("/api/notes", params={"archived": "true"})
        assert r.status_code == 200
        ids = [n["id"] for n in r.json()["data"]["notes"]]
        assert note["id"] in ids

    def test_default_excludes_archived(self, write_client, make_note):
        note = make_note(title="Archived hidden")
        write_client.delete(f"/api/notes/{note['id']}")
        r = write_client.get("/api/notes")
        ids = [n["id"] for n in r.json()["data"]["notes"]]
        assert note["id"] not in ids
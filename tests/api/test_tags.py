"""Tags CRUD, 409-on-duplicate, color update, tag-notes.

observed: GET /api/tags returns data as a list (not data.tags).
observed: POST /api/tags returns the tag flat in data (not data.tag).
observed: Tag fields include `note_count` (usage count).
observed: Color must be valid hex (#ff0000, not #abc).
"""

import uuid
import pytest
from conftest import assert_shape

TAG_SCHEMA = {
    "id": int,
    "name": str,
    "color": str,
}


class TestTagsList:
    @pytest.mark.readonly
    def test_list_tags_shape(self, client):
        r = client.get("/api/tags")
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        # observed: data is a list directly (not data.tags)
        assert isinstance(data["data"], list)
        if data["data"]:
            tag = data["data"][0]
            assert_shape(tag, TAG_SCHEMA)
            # observed: includes note_count
            assert "note_count" in tag

    @pytest.mark.readonly
    def test_tags_list_has_meta(self, client):
        r = client.get("/api/tags")
        data = r.json()
        # observed: includes meta alongside data
        assert "meta" in data


class TestTagsCreate:
    def test_create_tag(self, write_client):
        name = f"char-test-{uuid.uuid4().hex[:8]}"
        r = write_client.post("/api/tags", json={"name": name, "color": "#ff0000"})
        assert r.status_code == 201
        data = r.json()
        assert data["success"] is True
        # observed: tag returned flat in data
        tag = data["data"]
        assert tag["name"] == name
        assert tag["color"] == "#ff0000"
        write_client.delete(f"/api/tags/{tag['id']}")

    def test_create_duplicate_tag_returns_409(self, write_client, make_tag):
        name = f"dup-test-{uuid.uuid4().hex[:8]}"
        make_tag(name=name)
        r = write_client.post("/api/tags", json={"name": name})
        assert r.status_code == 409
        data = r.json()
        assert data["success"] is False
        assert isinstance(data["error"], str)

    def test_create_tag_without_color(self, write_client):
        name = f"no-color-{uuid.uuid4().hex[:8]}"
        r = write_client.post("/api/tags", json={"name": name})
        # observed: server may reject missing color or assign default
        assert r.status_code in (201, 400)
        if r.status_code == 201:
            tag = r.json()["data"]
            assert isinstance(tag["color"], str)
            write_client.delete(f"/api/tags/{tag['id']}")


class TestTagsUpdate:
    def test_update_tag_color(self, write_client, make_tag):
        tag = make_tag()
        r = write_client.put(f"/api/tags/{tag['id']}", json={"color": "#00ff00"})
        assert r.status_code == 200
        updated = r.json()["data"]
        assert updated["color"] == "#00ff00"

    def test_update_nonexistent_tag_returns_404(self, write_client):
        r = write_client.put("/api/tags/999999999", json={"color": "#000000"})
        assert r.status_code in (400, 404)


class TestTagsDelete:
    def test_delete_tag(self, write_client, make_tag):
        tag = make_tag()
        r = write_client.delete(f"/api/tags/{tag['id']}")
        assert r.status_code in (200, 204)
        # Verify it's gone (or soft-deleted — won't appear in list)
        list_r = write_client.get("/api/tags")
        ids = [t["id"] for t in list_r.json()["data"]]
        assert tag["id"] not in ids


class TestTagNotes:
    @pytest.mark.readonly
    def test_tag_notes_shape(self, client):
        tags_r = client.get("/api/tags")
        tags = tags_r.json()["data"]
        if not tags:
            pytest.skip("No tags")
        tid = tags[0]["id"]
        r = client.get(f"/api/tags/{tid}/notes")
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        # observed: data may be list or dict with notes
        if isinstance(data["data"], list):
            notes = data["data"]
        elif isinstance(data["data"], dict) and "notes" in data["data"]:
            notes = data["data"]["notes"]
        else:
            notes = data["data"]
        assert isinstance(notes, (list, dict))


class TestNoteTagAttach:
    def test_attach_and_detach_tag(self, write_client, make_note, make_tag):
        note = make_note()
        tag = make_tag(name=f"attach-{uuid.uuid4().hex[:8]}")
        # Attach
        r = write_client.put(f"/api/notes/{note['id']}/tags/{tag['id']}")
        assert r.status_code == 200
        # Verify note has the tag
        get_r = write_client.get(f"/api/notes/{note['id']}")
        tag_ids = [t["id"] for t in get_r.json()["data"]["tags"]]
        assert tag["id"] in tag_ids

        # Detach
        r = write_client.delete(f"/api/notes/{note['id']}/tags/{tag['id']}")
        assert r.status_code == 200
        get_r = write_client.get(f"/api/notes/{note['id']}")
        tag_ids = [t["id"] for t in get_r.json()["data"]["tags"]]
        assert tag["id"] not in tag_ids

    def test_attach_already_attached_returns_200(self, write_client, make_note, make_tag):
        """observed: attaching a tag that's already attached returns 200 (idempotent), not 400."""
        note = make_note()
        tag = make_tag(name=f"dup-attach-{uuid.uuid4().hex[:8]}")
        write_client.put(f"/api/notes/{note['id']}/tags/{tag['id']}")
        r = write_client.put(f"/api/notes/{note['id']}/tags/{tag['id']}")
        # observed: server returns 200 for re-attach (idempotent)
        assert r.status_code == 200
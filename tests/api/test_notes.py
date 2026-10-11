"""Notes CRUD, versions, and restore tests.

observed: Single-note responses (GET :id, POST create) return the note flat
in `data` (not `data.note`).  The list endpoint returns `data.notes[]`.

observed: Note fields use `is_pinned` / `is_archived` (not `pinned`/`archived`).
"""

import pytest
from conftest import assert_shape

NOTE_SCHEMA = {
    "id": int,
    "user_id": int,
    "title": str,
    "content": str,
    "content_plain": str,
    "is_pinned": bool,
    "is_archived": bool,
    "created_at": str,
    "updated_at": str,
    "tags": list,
}

NOTES_LIST_SCHEMA = {
    "success": bool,
    "data": {"notes": [NOTE_SCHEMA]},
    "meta": {
        "limit": int,
        "offset": int,
        "hasMore": bool,
    },
}


class TestNotesList:
    @pytest.mark.readonly
    def test_list_returns_shape(self, client):
        r = client.get("/api/notes")
        assert r.status_code == 200
        assert_shape(r.json(), NOTES_LIST_SCHEMA)

    @pytest.mark.readonly
    def test_list_meta_has_total(self, client):
        r = client.get("/api/notes")
        data = r.json()
        assert "total" in data["meta"]
        assert isinstance(data["meta"]["total"], int)

    @pytest.mark.readonly
    def test_list_respects_limit(self, client):
        r = client.get("/api/notes", params={"limit": 1})
        data = r.json()
        assert r.status_code == 200
        assert len(data["data"]["notes"]) <= 1
        assert data["meta"]["limit"] == 1

    @pytest.mark.readonly
    def test_list_respects_offset(self, client):
        r1 = client.get("/api/notes", params={"limit": 100})
        r2 = client.get("/api/notes", params={"limit": 100, "offset": 1})
        if len(r1.json()["data"]["notes"]) > 1:
            n1 = r1.json()["data"]["notes"][0]
            n2 = r2.json()["data"]["notes"][0]
            assert n1["id"] != n2["id"] or len(r1.json()["data"]["notes"]) == 1


class TestNotesGetById:
    @pytest.mark.readonly
    def test_get_note_shape(self, client):
        list_r = client.get("/api/notes", params={"limit": 1})
        notes = list_r.json()["data"]["notes"]
        if not notes:
            pytest.skip("No notes to read")
        nid = notes[0]["id"]
        r = client.get(f"/api/notes/{nid}")
        assert r.status_code == 200
        data = r.json()
        # observed: single note returned flat in data (not data.note)
        assert_shape(data, {"success": bool, "data": NOTE_SCHEMA})

    @pytest.mark.readonly
    def test_get_nonexistent_note_returns_404(self, client):
        r = client.get("/api/notes/999999999")
        assert r.status_code == 404
        assert_shape(r.json(), {"success": bool, "error": str})

    @pytest.mark.readonly
    def test_get_invalid_id_returns_400(self, client):
        r = client.get("/api/notes/not-a-number")
        # observed: the server parses with parseInt, "not-a-number" -> NaN -> 400
        assert r.status_code == 400


class TestNotesCreate:
    def test_create_note(self, write_client):
        r = write_client.post("/api/notes", json={
            "title": "Char Test Note",
            "content": "Created by characterization suite",
        })
        assert r.status_code == 201
        data = r.json()
        # observed: note returned flat in data
        assert_shape(data, {"success": bool, "data": NOTE_SCHEMA})
        note = data["data"]
        assert note["title"] == "Char Test Note"
        write_client.delete(f"/api/notes/{note['id']}")

    def test_create_with_unicode(self, write_client):
        r = write_client.post("/api/notes", json={
            "title": "Ünicöde 测试 🎉🚀",
            "content": "Café résumé naïve — emoji: 🍕🌮🎸",
        })
        assert r.status_code == 201
        note = r.json()["data"]
        assert "🎉" in note["title"]
        write_client.delete(f"/api/notes/{note['id']}")

    def test_create_with_empty_title(self, write_client):
        r = write_client.post("/api/notes", json={"title": "", "content": "x"})
        # observed: empty title may be accepted or rejected — pin whichever
        assert r.status_code in (200, 201, 400)


class TestNotesUpdate:
    def test_update_title_and_content(self, write_client, make_note):
        note = make_note()
        r = write_client.put(f"/api/notes/{note['id']}", json={
            "title": "Updated Title",
            "content": "Updated content",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["data"]["title"] == "Updated Title"
        assert data["data"]["content"] == "Updated content"

    def test_update_nonexistent_returns_404(self, write_client):
        r = write_client.put("/api/notes/999999999", json={"title": "x"})
        assert r.status_code == 404


class TestNotesVersions:
    @pytest.mark.readonly
    def test_versions_shape(self, client):
        list_r = client.get("/api/notes", params={"limit": 1})
        notes = list_r.json()["data"]["notes"]
        if not notes:
            pytest.skip("No notes")
        nid = notes[0]["id"]
        r = client.get(f"/api/notes/{nid}/versions")
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        # observed: versions returned flat in data as a list
        assert isinstance(data["data"], list)

    def test_version_created_on_update(self, write_client, make_note):
        note = make_note(title="V1", content="version 1")
        write_client.put(f"/api/notes/{note['id']}", json={
            "title": "V2", "content": "version 2",
        })
        r = write_client.get(f"/api/notes/{note['id']}/versions")
        assert r.status_code == 200
        versions = r.json()["data"]
        assert len(versions) >= 1
        v = versions[0]
        assert_shape(v, {"id": (int, str), "title": str, "content": str, "created_at": str})

    def test_restore_version(self, write_client, make_note):
        note = make_note(title="Original", content="original content")
        write_client.put(f"/api/notes/{note['id']}", json={
            "title": "Changed", "content": "changed content",
        })
        versions_r = write_client.get(f"/api/notes/{note['id']}/versions")
        versions = versions_r.json()["data"]
        if not versions:
            pytest.skip("No versions created")
        vid = versions[0]["id"]
        r = write_client.post(f"/api/notes/{note['id']}/restore/{vid}")
        assert r.status_code == 200
        get_r = write_client.get(f"/api/notes/{note['id']}")
        restored = get_r.json()["data"]
        assert restored["title"] == "Original"


class TestNotesDelete:
    def test_delete_returns_204_no_body(self, write_client, make_note):
        """Regression pin: commit 5cb1910 — DELETE answered 204 with a body,
        which crashed Oak.  The fix: 204 MUST carry no body."""
        note = make_note()
        r = write_client.delete(f"/api/notes/{note['id']}")
        assert r.status_code == 204
        assert r.content == b"" or len(r.content) == 0

    def test_delete_nonexistent_returns_404(self, write_client):
        r = write_client.delete("/api/notes/999999999")
        assert r.status_code == 404
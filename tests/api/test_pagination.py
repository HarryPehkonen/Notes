"""Pagination boundaries, unicode/emoji, empty-body and oversized-body behavior.

observed: Single-note responses return data flat (not data.note).
"""

import pytest
from conftest import assert_shape


class TestPagination:
    @pytest.mark.readonly
    def test_meta_envelope_shape(self, client):
        r = client.get("/api/notes", params={"limit": 5, "offset": 0})
        assert r.status_code == 200
        meta = r.json()["meta"]
        assert_shape(meta, {"limit": int, "offset": int, "hasMore": bool})

    @pytest.mark.readonly
    def test_hasMore_false_when_fewer_results(self, client):
        r = client.get("/api/notes", params={"limit": 1000})
        data = r.json()
        if len(data["data"]["notes"]) < 1000:
            assert data["meta"]["hasMore"] is False

    @pytest.mark.readonly
    def test_limit_clamped_to_max(self, client):
        """The server caps limit at 100."""
        r = client.get("/api/notes", params={"limit": 500})
        assert r.status_code == 200
        assert r.json()["meta"]["limit"] <= 100

    @pytest.mark.readonly
    def test_zero_limit(self, client):
        r = client.get("/api/notes", params={"limit": 0})
        # observed: 0 limit may be accepted (returns 0 notes) or default to 20
        assert r.status_code == 200

    @pytest.mark.readonly
    def test_negative_offset(self, client):
        r = client.get("/api/notes", params={"offset": -5})
        # observed: server clamps to 0
        assert r.status_code == 200
        assert r.json()["meta"]["offset"] >= 0


class TestUnicodeEmoji:
    def test_create_with_emoji_title(self, write_client):
        r = write_client.post("/api/notes", json={
            "title": "🍕🌮🎸🎉🚀",
            "content": "Emoji content: 🎨🎭🎪",
        })
        assert r.status_code == 201
        note = r.json()["data"]
        assert "🍕" in note["title"]
        write_client.delete(f"/api/notes/{note['id']}")

    def test_create_with_unicode(self, write_client):
        r = write_client.post("/api/notes", json={
            "title": "日本語テスト",
            "content": "Ünicöde café résumé naïve",
        })
        assert r.status_code == 201
        write_client.delete(f"/api/notes/{r.json()['data']['id']}")


class TestEmptyBody:
    def test_post_empty_json(self, write_client):
        r = write_client.post("/api/notes", json={})
        # observed: empty body -> 400 (missing title)
        assert r.status_code == 400

    def test_put_empty_json(self, write_client):
        create_r = write_client.post("/api/notes", json={
            "title": "temp", "content": "temp",
        })
        nid = create_r.json()["data"]["id"]
        r = write_client.put(f"/api/notes/{nid}", json={})
        # observed: may be 200 (no-op) or 400
        assert r.status_code in (200, 400)
        write_client.delete(f"/api/notes/{nid}")


class TestOversizedBody:
    def test_large_title(self, write_client):
        big_title = "X" * 10000
        r = write_client.post("/api/notes", json={
            "title": big_title,
            "content": "normal",
        })
        # observed: pin the behavior — accept or reject
        assert r.status_code in (200, 201, 400, 413)
        if r.status_code in (200, 201):
            write_client.delete(f"/api/notes/{r.json()['data']['id']}")

    def test_large_content(self, write_client):
        big_content = "Y" * 100000
        r = write_client.post("/api/notes", json={
            "title": "Big content test",
            "content": big_content,
        })
        assert r.status_code in (200, 201, 400, 413)
        if r.status_code in (200, 201):
            write_client.delete(f"/api/notes/{r.json()['data']['id']}")
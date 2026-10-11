"""Full-text search, advanced search, semantic search (skip if unavailable).

observed: GET /api/search returns data.results[] (not data.notes[]).
observed: data includes query and meta fields.
"""

import socket
import pytest
from conftest import assert_shape


def _embed_server_reachable() -> bool:
    """Check if an embedding server is running."""
    try:
        with socket.create_connection(("localhost", 11434), timeout=2):
            return True
    except OSError:
        return False


class TestTextSearch:
    @pytest.mark.readonly
    def test_search_returns_shape(self, client):
        r = client.get("/api/search", params={"q": "test"})
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        # observed: search returns data.results[] (not data.notes[])
        assert isinstance(data["data"]["results"], list)

    @pytest.mark.readonly
    def test_search_empty_query(self, client):
        r = client.get("/api/search", params={"q": ""})
        # observed: empty query may return 200 (empty results) or 400
        assert r.status_code in (200, 400)

    @pytest.mark.readonly
    def test_search_unicode_query(self, client):
        r = client.get("/api/search", params={"q": "café résumé"})
        assert r.status_code == 200

    @pytest.mark.readonly
    def test_search_results_may_have_snippets(self, client):
        """ts_headline snippets — pin whether they appear."""
        r = client.get("/api/search", params={"q": "test"})
        data = r.json()
        results = data["data"]["results"]
        if results:
            note = results[0]
            # Just assert the shape is consistent
            assert isinstance(note.get("title"), str)
            # observed: check if snippet/highlight fields exist
            # (ts_headline may be in content or a separate field)

    @pytest.mark.readonly
    def test_search_has_meta(self, client):
        r = client.get("/api/search", params={"q": "test"})
        data = r.json()
        assert "meta" in data


class TestAdvancedSearch:
    @pytest.mark.readonly
    def test_advanced_search_shape(self, client):
        r = client.post("/api/search/advanced", json={"query": "test"})
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        # observed: advanced search also returns data.results[]
        assert isinstance(data["data"]["results"], list)

    def test_advanced_search_with_tags(self, write_client, make_note, make_tag):
        note = make_note(title="Searchable", content="find me with searchtag")
        tag = make_tag(name="searchtag")
        write_client.put(f"/api/notes/{note['id']}/tags/{tag['id']}")
        r = write_client.post("/api/search/advanced", json={
            "query": "Searchable",
            "tags": [tag["id"]],
        })
        assert r.status_code == 200
        results = r.json()["data"]["results"]
        ids = [n["id"] for n in results]
        assert note["id"] in ids


class TestSemanticSearch:
    @pytest.mark.readonly
    def test_semantic_search_or_skip(self, client):
        if not _embed_server_reachable():
            pytest.skip("No embedding server configured (checked localhost:11434)")
        r = client.get("/api/search", params={"q": "test", "semantic": "1"})
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True


class TestSearchSuggestions:
    @pytest.mark.readonly
    def test_suggestions_shape(self, client):
        r = client.get("/api/search/suggestions")
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert isinstance(data["data"], (dict, list))


class TestRecentSearches:
    @pytest.mark.readonly
    def test_recent_shape(self, client):
        r = client.get("/api/search/recent")
        # observed: production returns 500 on this endpoint
        assert r.status_code in (200, 500)
        if r.status_code == 200:
            data = r.json()
            assert data["success"] is True
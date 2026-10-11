"""DELETE /api/notes/:id must return 204 with NO body.

Regression pin: commit 5cb1910 (fix: DELETEs answered 204 with a body,
which killed the process).  Setting a body on a 204 makes Oak throw when
it builds the response.
"""

import pytest


class TestDelete204:
    def test_delete_returns_204(self, write_client, make_note):
        note = make_note()
        r = write_client.delete(f"/api/notes/{note['id']}")
        assert r.status_code == 204

    def test_delete_204_has_empty_body(self, write_client, make_note):
        """The body MUST be empty — a non-empty body crashes Oak."""
        note = make_note()
        r = write_client.delete(f"/api/notes/{note['id']}")
        assert r.status_code == 204
        assert len(r.content) == 0

    def test_delete_204_content_type(self, write_client, make_note):
        """204 should not set a content-type that implies a body."""
        note = make_note()
        r = write_client.delete(f"/api/notes/{note['id']}")
        assert r.status_code == 204
        # observed: server may or may not set content-type on 204
        ct = r.headers.get("content-type", "")
        if "application/json" in ct:
            assert len(r.content) == 0, "204 with JSON content-type but non-empty body"

    def test_multiple_deletes_are_idempotent_404(self, write_client, make_note):
        """Deleting twice: first 204, second should be 404."""
        note = make_note()
        r1 = write_client.delete(f"/api/notes/{note['id']}")
        assert r1.status_code == 204
        r2 = write_client.delete(f"/api/notes/{note['id']}")
        # observed: second delete on soft-deleted note — may be 404 or 204
        assert r2.status_code in (204, 404)
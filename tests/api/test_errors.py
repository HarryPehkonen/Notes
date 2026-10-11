"""Error JSON shape tests for 400, 401, 404, 409.

observed: Local dev server returns 200 for no-auth requests (session auto-created).
observed: Error responses follow { success: false, error: str }.
"""

import uuid
import pytest
from conftest import assert_shape


class TestErrorShape:
    """All errors must follow { success: false, error: str }."""

    @pytest.mark.readonly
    def test_401_shape_no_token(self, no_auth_client):
        r = no_auth_client.get("/api/notes")
        if r.status_code == 200:
            pytest.xfail("observed: local dev returns 200 for no-auth")
        assert r.status_code == 401
        data = r.json()
        # observed: production 401 uses { error, redirectTo } (page-level redirect)
        # API-level errors use { success: false, error }
        assert "error" in data
        assert isinstance(data["error"], str)

    @pytest.mark.readonly
    def test_404_shape_nonexistent_note(self, client):
        r = client.get("/api/notes/999999999")
        assert r.status_code == 404
        assert_shape(r.json(), {"success": bool, "error": str})
        assert r.json()["success"] is False

    @pytest.mark.readonly
    def test_400_shape_invalid_note_id(self, client):
        r = client.get("/api/notes/not-a-number")
        assert r.status_code == 400
        assert_shape(r.json(), {"success": bool, "error": str})

    @pytest.mark.readonly
    def test_400_shape_bad_tag_filter(self, client):
        r = client.get("/api/notes", params={"tags": "xyz"})
        assert r.status_code == 400
        assert_shape(r.json(), {"success": bool, "error": str})

    def test_409_shape_duplicate_tag(self, write_client, make_tag):
        name = f"dup-err-{uuid.uuid4().hex[:8]}"
        make_tag(name=name)
        r = write_client.post("/api/tags", json={"name": name})
        assert r.status_code == 409
        assert_shape(r.json(), {"success": bool, "error": str})
        assert r.json()["success"] is False

    @pytest.mark.readonly
    def test_error_response_has_no_extra_keys(self, no_auth_client):
        """Error responses should not leak internal fields.
        observed: local dev returns 200 for no-auth, production 401 includes redirectTo.
        """
        r = no_auth_client.get("/api/notes/999999999")
        if r.status_code == 200:
            pytest.xfail("observed: local dev returns 200 for no-auth")
        data = r.json()
        # observed: production 401 includes redirectTo (page-level auth redirect)
        allowed_keys = {"success", "error", "redirectTo"}
        unexpected = set(data.keys()) - allowed_keys
        assert not unexpected, f"Unexpected keys in error response: {unexpected}"

    @pytest.mark.readonly
    def test_404_error_has_no_extra_keys(self, client):
        """404 error responses should be clean."""
        r = client.get("/api/notes/999999999")
        assert r.status_code == 404
        data = r.json()
        allowed_keys = {"success", "error"}
        unexpected = set(data.keys()) - allowed_keys
        assert not unexpected, f"Unexpected keys in 404 response: {unexpected}"
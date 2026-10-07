import json
import uuid

import pytest

from runtime import antigravity_oauth


def _auth(home, accounts):
    (home / "auth.json").write_text(json.dumps({"credential_pool": {"antigravity": accounts}}), "utf-8")


def _account(account_id="account-a", email="a@example.invalid", project="project-a"):
    return {"id": account_id, "email": email, "refresh_token": "synthetic-refresh",
        "access_token": "synthetic-access", "project_id": project}


def test_native_binding_is_profile_local_unique_and_secret_free(tmp_path):
    profile = tmp_path / "profile"
    profile.mkdir()
    global_home = tmp_path / "global"
    global_home.mkdir()
    _auth(global_home, [_account("global-account", "global@example.invalid", "global-project")])
    _auth(profile, [_account()])

    binding = antigravity_oauth.resolve_native_account_binding(profile)
    assert binding == antigravity_oauth.resolve_native_account_binding(profile, "account-a")
    assert binding["account_id"] == "account-a"
    assert binding["project_id"] == "project-a"
    assert binding["email"] == "a@example.invalid"
    assert "synthetic" not in json.dumps(binding)
    assert antigravity_oauth.resolve_native_account_binding(profile, "global-account") is None


def test_native_binding_fails_closed_for_ambiguous_or_changed_pool(tmp_path):
    profile = tmp_path / "profile"
    profile.mkdir()
    _auth(profile, [_account(), _account("account-b", "b@example.invalid", "project-b")])
    assert antigravity_oauth.resolve_native_account_binding(profile) is None
    pinned = antigravity_oauth.resolve_native_account_binding(profile, "account-a")
    assert pinned["project_id"] == "project-a"

    _auth(profile, [_account("account-a", "a@example.invalid", "rotated-project")])
    changed = antigravity_oauth.resolve_native_account_binding(profile, "account-a")
    assert changed["digest"] != pinned["digest"]


def test_native_antigravity_client_requires_exact_saved_project_and_never_defaults(monkeypatch, tmp_path):
    from runtime.antigravity_cloudcode_adapter import AntigravityCloudCodeClient
    profile = tmp_path / "profile"
    profile.mkdir()
    _auth(profile, [_account()])
    monkeypatch.setenv("SIDEKICK_HOME", str(profile))
    binding = antigravity_oauth.resolve_native_account_binding(profile)
    client = AntigravityCloudCodeClient(native_account_id=binding["account_id"],
        native_project_id=binding["project_id"], native_account_digest=binding["digest"],
        project_id=binding["project_id"])
    try:
        assert client._validate_native_account_binding()["email"] == "a@example.invalid"
        assert client._ensure_project_id("synthetic-access") == "project-a"
        client._configured_project_id = ""
        with pytest.raises(antigravity_oauth.AntigravityOAuthError) as exc:
            client._ensure_project_id("synthetic-access")
        assert exc.value.code == "antigravity_native_binding_changed"
        _auth(profile, [_account("account-a", "a@example.invalid", "rotated-project")])
        with pytest.raises(antigravity_oauth.AntigravityOAuthError) as changed:
            client._validate_native_account_binding()
        assert changed.value.code == "antigravity_native_binding_changed"
    finally:
        client.close()


def test_native_antigravity_completion_uses_captured_account_and_project(monkeypatch, tmp_path):
    from runtime import antigravity_cloudcode_adapter as adapter
    profile = tmp_path / "profile"
    profile.mkdir()
    _auth(profile, [_account()])
    monkeypatch.setenv("SIDEKICK_HOME", str(profile))
    binding = antigravity_oauth.resolve_native_account_binding(profile)
    tokens = []
    monkeypatch.setattr(antigravity_oauth, "get_valid_access_token",
        lambda *, account_email=None: tokens.append(account_email) or "synthetic-access")
    monkeypatch.setattr(adapter, "_translate_gemini_response", lambda _response, *, model: {"model": model})

    class Response:
        status_code = 200
        def json(self):
            return {"response": {}}

    class Http:
        def __init__(self): self.request = None
        def post(self, url, *, json, headers):
            self.request = (url, json, headers)
            return Response()
        def close(self): pass

    client = adapter.AntigravityCloudCodeClient(project_id=binding["project_id"],
        native_account_id=binding["account_id"], native_project_id=binding["project_id"],
        native_account_digest=binding["digest"])
    client._http.close()
    client._http = Http()
    try:
        assert client._create_chat_completion(model="gemini-2.5-flash", messages=[], stream=False) == {"model": "gemini-2.5-flash"}
        url, body, headers = client._http.request
        assert url.endswith("/v1internal:generateContent")
        assert body["project"] == "project-a"
        assert headers["Authorization"] == "Bearer synthetic-access"
        assert tokens == ["a@example.invalid"]
    finally:
        client.close()


@pytest.mark.parametrize("replacement", [
    [_account("account-a", "a@example.invalid", "rotated-project")],
    [],
])
def test_changed_or_revoked_account_fails_before_transport_request(monkeypatch, tmp_path, replacement):
    from runtime import antigravity_cloudcode_adapter as adapter
    profile = tmp_path / "profile"
    profile.mkdir()
    _auth(profile, [_account()])
    monkeypatch.setenv("SIDEKICK_HOME", str(profile))
    binding = antigravity_oauth.resolve_native_account_binding(profile)
    client = adapter.AntigravityCloudCodeClient(project_id=binding["project_id"],
        native_account_id=binding["account_id"], native_project_id=binding["project_id"],
        native_account_digest=binding["digest"])
    class FakeTransport:
        def __init__(self): self.calls = 0
        def post(self, *_args, **_kwargs):
            self.calls += 1
            raise AssertionError("transport must remain untouched for a revoked pin")
        def close(self): pass
    fake = FakeTransport()
    client._http.close()
    client._http = fake
    _auth(profile, replacement)
    try:
        with pytest.raises(antigravity_oauth.AntigravityOAuthError) as error:
            client._create_chat_completion(model="gemini-2.5-flash", messages=[], stream=False)
        assert error.value.code == "antigravity_native_binding_changed"
        assert fake.calls == 0
    finally:
        client.close()


def test_antigravity_native_availability_requires_single_scoped_binding(tmp_path):
    from runtime.independent.contracts import Scope
    from runtime.independent.scoped_models import _native_availability
    profile = tmp_path / "profile"
    profile.mkdir()
    scope = Scope(backend_profile_id=str(uuid.uuid4()), space_id=str(uuid.uuid4()), browser_profile_id="browser-a")
    catalog = {"groups": [{"provider_id": "antigravity", "configured": True, "models": [
        {"id": "gemini-2.5-flash", "supportsIndependent": True, "contextLength": 131072}]}]}

    unavailable = _native_availability(scope, 1, catalog, "antigravity", "gemini-2.5-flash", profile_home=profile)
    assert unavailable["supported"] is True and unavailable["available"] is False
    assert unavailable["reasonCode"] == "binding_mismatch"
    _auth(profile, [_account()])
    available = _native_availability(scope, 1, catalog, "antigravity", "gemini-2.5-flash", profile_home=profile)
    assert available["supported"] is True and available["available"] is True
    _auth(profile, [_account(), _account("account-b", "b@example.invalid", "project-b")])
    ambiguous = _native_availability(scope, 1, catalog, "antigravity", "gemini-2.5-flash", profile_home=profile)
    assert ambiguous["available"] is False and ambiguous["reasonCode"] == "binding_mismatch"

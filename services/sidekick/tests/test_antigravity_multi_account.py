"""Antigravity multi-account OAuth — round-robin rotation and pool management.

Covers the successor to the retired consumer Gemini CLI sign-in: multiple
Google accounts connect into the ``antigravity`` credential-pool slice and chat
requests rotate across them.
"""

import io
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest

from runtime import antigravity_oauth as ag


@pytest.fixture()
def pool_env(tmp_path, monkeypatch):
    """Point the credential pool at a temp auth store so tests stay isolated."""
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(ag, "_account_round_robin_index", 0)
    yield tmp_path
    # Pool state is per-test via tmp_path; nothing to clean globally.


def _add_account(email: str, project: str = "aicode-consumers") -> None:
    ag.save_account_credentials_to_pool(ag.AntigravityCredentials(
        access_token=f"at-{email}",
        refresh_token=f"rt-{email}",
        expires_ms=int((time.time() + 3600) * 1000),
        email=email,
        project_id=project,
    ))


def test_round_robin_cycles_all_accounts_in_pool_order(pool_env):
    _add_account("first@example.com")
    _add_account("second@example.com")
    _add_account("third@example.com")
    picks = [ag.select_next_account_email() for _ in range(6)]
    assert picks == [
        "first@example.com", "second@example.com", "third@example.com",
        "first@example.com", "second@example.com", "third@example.com",
    ]


def test_single_account_round_robin_stays_stable(pool_env):
    _add_account("only@example.com")
    assert [ag.select_next_account_email() for _ in range(3)] == [
        "only@example.com"] * 3


def test_invalid_grant_account_is_skipped_but_not_removed(pool_env):
    _add_account("healthy@example.com")
    _add_account("broken@example.com")
    entries = ag._read_pool_entries()
    for entry in entries:
        if ag._pool_entry_email(entry) == "broken@example.com":
            entry["last_error_reason"] = "invalid_grant"
    ag._write_pool_entries(entries)
    picks = {ag.select_next_account_email() for _ in range(4)}
    assert picks == {"healthy@example.com"}


def test_upsert_same_email_updates_tokens_without_duplicating(pool_env):
    _add_account("user@example.com")
    _add_account("user@example.com", project="updated-project")
    accounts = ag.list_connected_accounts()
    assert len(accounts) == 1
    assert accounts[0]["project_id"] == "updated-project"


def test_concurrent_oauth_callbacks_preserve_both_accounts(pool_env, monkeypatch):
    original_read = ag._read_pool_entries

    def slow_read():
        entries = original_read()
        # Widen the read/modify/write race that used to let two simultaneous
        # logins overwrite one another's newly added pool entry.
        time.sleep(0.03)
        return entries

    monkeypatch.setattr(ag, "_read_pool_entries", slow_read)
    start = threading.Barrier(3)

    def add(email):
        start.wait(timeout=2)
        ag.save_account_credentials_to_pool(ag.AntigravityCredentials(
            access_token=f"access-{email}",
            refresh_token=f"refresh-{email}",
            expires_ms=int((time.time() + 3600) * 1000),
            email=email,
        ))

    workers = [
        threading.Thread(target=add, args=(email,), daemon=True)
        for email in ("first@example.com", "second@example.com")
    ]
    for worker in workers:
        worker.start()
    start.wait(timeout=2)
    for worker in workers:
        worker.join(timeout=3)
        assert not worker.is_alive()
    assert {item["email"] for item in ag.list_connected_accounts()} == {
        "first@example.com", "second@example.com"
    }


def test_remove_account_deletes_only_the_target(pool_env):
    _add_account("keep@example.com")
    _add_account("drop@example.com")
    assert ag.remove_account("drop@example.com") is True
    remaining = {a["email"] for a in ag.list_connected_accounts()}
    assert remaining == {"keep@example.com"}
    assert ag.remove_account("missing@example.com") is False


def test_removing_last_global_fallback_account_stays_removed_in_profile(pool_env, monkeypatch):
    from cli import auth

    global_entry = {
        "email": "global@example.com",
        "access_token": "global-access",
        "refresh_token": "global-refresh",
    }
    monkeypatch.setattr(auth, "_load_global_auth_store", lambda: {
        "credential_pool": {"antigravity": [global_entry]},
    })

    assert [a["email"] for a in ag.list_connected_accounts()] == ["global@example.com"]
    assert ag.remove_account("global@example.com") is True
    assert ag.list_connected_accounts() == []
    assert auth.read_credential_pool("antigravity") == []


def test_load_account_credentials_returns_matching_entry(pool_env):
    _add_account("user@example.com", project="proj-1")
    creds = ag.load_account_credentials("USER@example.com")
    assert creds is not None
    assert creds.email == "user@example.com"
    assert creds.project_id == "proj-1"
    assert creds.refresh_token == "rt-user@example.com"


def test_load_account_credentials_reconnect_required_on_invalid_grant(pool_env):
    _add_account("stale@example.com")
    entries = ag._read_pool_entries()
    for entry in entries:
        entry["last_error_reason"] = "invalid_grant"
    ag._write_pool_entries(entries)
    with pytest.raises(ag.AntigravityOAuthError) as excinfo:
        ag.load_account_credentials("stale@example.com")
    assert excinfo.value.code == "antigravity_account_reconnect_required"


def test_concurrent_refresh_timeout_does_not_reuse_refresh_token(pool_env, monkeypatch):
    """A waiting request fails safely instead of sending the refresh token twice."""
    ag.save_account_credentials_to_pool(ag.AntigravityCredentials(
        access_token="expired-access-token",
        refresh_token="rotating-refresh-token",
        expires_ms=int((time.time() - 120) * 1000),
        email="refresh@example.com",
    ))
    monkeypatch.setattr(ag, "LOCK_TIMEOUT_SECONDS", 0.01)
    refresh_started = threading.Event()
    release_refresh = threading.Event()
    calls = []
    owner_result = []

    def slow_refresh(refresh_token):
        calls.append(refresh_token)
        refresh_started.set()
        assert release_refresh.wait(timeout=2)
        return {"access_token": "new-access-token", "expires_in": 3600}

    monkeypatch.setattr(ag, "refresh_access_token", slow_refresh)
    owner = threading.Thread(
        target=lambda: owner_result.append(ag.get_valid_access_token(
            account_email="refresh@example.com"
        )),
        daemon=True,
    )
    owner.start()
    assert refresh_started.wait(timeout=2)

    with pytest.raises(ag.AntigravityOAuthError) as excinfo:
        ag.get_valid_access_token(account_email="refresh@example.com")
    assert excinfo.value.code == "antigravity_refresh_in_progress"
    assert calls == ["rotating-refresh-token"]

    release_refresh.set()
    owner.join(timeout=2)
    assert not owner.is_alive()
    assert owner_result == ["new-access-token"]
    assert calls == ["rotating-refresh-token"]


def test_waiter_does_not_retry_after_concurrent_refresh_failure(pool_env, monkeypatch):
    ag.save_account_credentials_to_pool(ag.AntigravityCredentials(
        access_token="expired-access-token",
        refresh_token="failed-refresh-token",
        expires_ms=int((time.time() - 120) * 1000),
        email="failed-refresh@example.com",
    ))
    # Model a refresh owner that has completed with an error. The stored
    # access token is still expired, but this waiter must not make a second
    # OAuth request with the same refresh token.
    completed = threading.Event()
    completed.set()
    monkeypatch.setattr(ag, "_refresh_inflight", {
        "antigravity:failed-refresh@example.com:failed-refresh-token": completed,
    })
    calls = []
    monkeypatch.setattr(
        ag, "refresh_access_token",
        lambda token: calls.append(token) or {"access_token": "unexpected"},
    )

    with pytest.raises(ag.AntigravityOAuthError) as excinfo:
        ag.get_valid_access_token(account_email="failed-refresh@example.com")
    assert excinfo.value.code == "antigravity_refresh_failed"
    assert calls == []


def test_status_reports_accounts_without_secrets(pool_env):
    _add_account("one@example.com")
    _add_account("two@example.com")
    status = ag.get_antigravity_auth_status()
    assert status["provider_available"] is True
    assert status["connected_accounts"] == 2
    assert status["round_robin"] is True
    # No token material may leak through the status endpoint.
    blob = json.dumps(status)
    assert "rt-one@example.com" not in blob
    assert "at-one@example.com" not in blob


def test_client_id_composes_from_public_antigravity_constants():
    assert ag.ANTIGRAVITY_CLIENT_ID.startswith("1071006060591-")
    assert ag.ANTIGRAVITY_CLIENT_ID.endswith(".apps.googleusercontent.com")
    assert ag.ANTIGRAVITY_CLIENT_SECRET.startswith("GOCSPX-")


def test_scopes_match_antigravity_ide_contract():
    # The IDE's oauthClient requests these five scopes; aicode is granted
    # implicitly by the consent screen.
    for scope in (
        "cloud-platform", "userinfo.email", "userinfo.profile",
        "cclog", "experimentsandconfigs",
    ):
        assert scope in ag.OAUTH_SCOPES


def test_onboarding_tolerates_only_structured_validation_required():
    body = json.dumps({
        "error": {
            "code": 403,
            "status": "PERMISSION_DENIED",
            "details": [{"reason": "VALIDATION_REQUIRED"}],
        }
    })
    assert ag._is_validation_required_response(403, body) is True
    assert ag._is_validation_required_response(500, body) is False
    assert ag._is_validation_required_response(
        403, json.dumps({"error": {"message": "VALIDATION_REQUIRED"}})
    ) is False
    assert ag._is_validation_required_response(403, "not-json") is False


@pytest.mark.parametrize(
    "status, body, expected_code",
    [
        (
            403,
            json.dumps({"error": {"details": [{"reason": "VALIDATION_REQUIRED"}]}}),
            "antigravity_validation_required",
        ),
        (403, json.dumps({"error": {"message": "VALIDATION_REQUIRED"}}), "code_assist_http_403"),
        (
            503,
            json.dumps({"error": {"details": [{"reason": "VALIDATION_REQUIRED"}]}}),
            "code_assist_http_503",
        ),
        (403, "not-json", "code_assist_http_403"),
    ],
)
def test_code_assist_http_error_classification_is_strict(monkeypatch, status, body, expected_code):
    def fail_request(*_args, **_kwargs):
        raise urllib.error.HTTPError(
            ag.CODE_ASSIST_ENDPOINT,
            status,
            "synthetic error",
            None,
            io.BytesIO(body.encode("utf-8")),
        )

    monkeypatch.setattr(ag.urllib.request, "urlopen", fail_request)
    with pytest.raises(ag.AntigravityOAuthError) as excinfo:
        ag._post_code_assist("/v1internal:onboardUser", {}, "synthetic-access-token")
    assert excinfo.value.code == expected_code


def _run_synthetic_antigravity_oauth(
    monkeypatch, onboarding_response=None, onboarding_error=None, persisted_out=None
):
    """Exercise the browser callback and persistence boundary without Google."""
    bind_callback_server = ag._bind_callback_server
    def bind_ephemeral(_port):
        server, _ = bind_callback_server(0)
        return server, server.server_address[1]

    monkeypatch.setattr(ag, "_get_client_id", lambda: "synthetic-client-id")
    monkeypatch.setattr(ag, "_get_client_secret", lambda: "synthetic-client-secret")
    monkeypatch.setattr(ag, "_bind_callback_server", bind_ephemeral)
    monkeypatch.setattr(
        ag,
        "exchange_code",
        lambda *_args, **_kwargs: {
            "access_token": "synthetic-access-token",
            "refresh_token": "synthetic-refresh-token",
            "expires_in": 3600,
        },
    )
    monkeypatch.setattr(ag, "_fetch_user_email", lambda _token: "synthetic@example.com")
    persisted = persisted_out if persisted_out is not None else []
    monkeypatch.setattr(ag, "save_account_credentials_to_pool", persisted.append)

    if onboarding_error is not None:
        def fail_onboarding(*_args, **_kwargs):
            raise onboarding_error
        monkeypatch.setattr(ag, "_post_code_assist", fail_onboarding)
    else:
        monkeypatch.setattr(ag, "_post_code_assist", lambda *_args, **_kwargs: onboarding_response)

    def open_browser(auth_url, **_kwargs):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(auth_url).query)
        redirect_uri = query["redirect_uri"][0]
        callback_query = urllib.parse.urlencode({
            "state": query["state"][0],
            "code": "synthetic-code",
        })
        with urllib.request.urlopen(f"{redirect_uri}?{callback_query}", timeout=3) as response:
            assert response.status == 200
        return True

    import webbrowser
    monkeypatch.setattr(webbrowser, "open", open_browser)
    result = ag.start_antigravity_oauth_flow(
        open_browser=True,
        callback_wait_seconds=3,
    )
    return result, persisted


def test_oauth_flow_persists_account_when_validation_required_is_explicit(monkeypatch):
    result, persisted = _run_synthetic_antigravity_oauth(
        monkeypatch,
        onboarding_error=ag.AntigravityOAuthError(
            "verification required", code="antigravity_validation_required"
        ),
    )
    assert result.project_id == ag.DEFAULT_ANTIGRAVITY_PROJECT
    assert persisted == [result]


@pytest.mark.parametrize(
    "error, expected_code",
    [
        (ag.AntigravityOAuthError("network failure", code="code_assist_network_error"), "code_assist_network_error"),
        (ag.AntigravityOAuthError("server failure", code="code_assist_http_503"), "code_assist_http_503"),
        (ag.AntigravityOAuthError("other forbidden response", code="code_assist_http_403"), "code_assist_http_403"),
    ],
)
def test_oauth_flow_does_not_persist_on_non_validation_onboarding_errors(monkeypatch, error, expected_code):
    persisted = []
    with pytest.raises(ag.AntigravityOAuthError) as excinfo:
        _run_synthetic_antigravity_oauth(
            monkeypatch, onboarding_error=error, persisted_out=persisted
        )
    assert excinfo.value.code == expected_code
    assert persisted == []


def test_oauth_flow_does_not_persist_on_malformed_onboarding_response(monkeypatch):
    persisted = []
    with pytest.raises(ag.AntigravityOAuthError) as excinfo:
        _run_synthetic_antigravity_oauth(
            monkeypatch, onboarding_response={}, persisted_out=persisted
        )
    assert excinfo.value.code == "antigravity_onboarding_invalid_response"
    assert persisted == []


def test_oauth_flow_does_not_persist_on_malformed_onboarding_json(monkeypatch):
    persisted = []
    malformed = json.JSONDecodeError("invalid JSON", "{", 0)
    with pytest.raises(json.JSONDecodeError):
        _run_synthetic_antigravity_oauth(
            monkeypatch, onboarding_error=malformed, persisted_out=persisted
        )
    assert persisted == []


def test_antigravity_is_listed_as_oauth_provider_before_account_connection(pool_env, monkeypatch):
    from cli import auth as auth_mod
    from web.api import providers

    monkeypatch.setattr(providers, "_PROVIDER_DISPLAY", {"antigravity": "Antigravity"})
    monkeypatch.setattr(
        providers,
        "_PROVIDER_MODELS",
        {"antigravity": [{"id": "gemini-3-flash-preview", "label": "Gemini 3 Flash Preview"}]},
    )
    monkeypatch.setattr(providers, "_PROVIDER_ENV_VAR", {})
    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider_id: False)
    monkeypatch.setattr(providers, "get_config", lambda: {})
    monkeypatch.setattr(auth_mod, "get_auth_status", lambda _provider_id: {"logged_in": False})

    result = providers.get_providers()["providers"]
    antigravity = next(provider for provider in result if provider["id"] == "antigravity")

    assert antigravity["is_oauth"] is True
    assert antigravity["configurable"] is False
    assert antigravity["has_key"] is False
    assert antigravity["models"] == [
        {"id": "gemini-3-flash-preview", "label": "Gemini 3 Flash Preview"}
    ]


def test_antigravity_provider_status_reflects_round_robin_accounts(pool_env, monkeypatch):
    from contextlib import nullcontext
    from cli import auth as auth_mod
    from web.api import providers
    from web.api import profiles

    _add_account("connected@example.com")
    monkeypatch.setattr(providers, "_PROVIDER_DISPLAY", {"antigravity": "Antigravity"})
    monkeypatch.setattr(providers, "_PROVIDER_MODELS", {"antigravity": []})
    monkeypatch.setattr(providers, "_PROVIDER_ENV_VAR", {})
    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider_id: False)
    monkeypatch.setattr(providers, "get_config", lambda: {})
    monkeypatch.setattr(auth_mod, "get_auth_status", lambda _provider_id: {"logged_in": False})
    monkeypatch.setattr(profiles, "cron_profile_context", nullcontext)

    result = providers.get_providers()["providers"]
    antigravity = next(provider for provider in result if provider["id"] == "antigravity")

    assert antigravity["is_oauth"] is True
    assert antigravity["has_key"] is True
    assert antigravity["oauth_connected"] is True
    assert antigravity["auth_state"] == "connected"
    assert antigravity["oauth_email"] == "connected@example.com"


def test_antigravity_oauth_worker_pins_credentials_to_starting_profile(tmp_path, monkeypatch):
    from web.api import oauth

    target_home = tmp_path / "profiles" / "work"
    target_home.mkdir(parents=True)
    flow_id = "antigravity-profile-worker-test"
    finished = threading.Event()
    monkeypatch.setitem(oauth._OAUTH_FLOWS, flow_id, {
        "provider": "antigravity",
        "status": "pending",
        "sidekick_home": str(target_home),
        "cancel_event": threading.Event(),
    })
    observed = {}

    def fake_start_flow(**kwargs):
        observed["sidekick_home"] = Path(__import__("os").environ["SIDEKICK_HOME"])
        kwargs["on_auth_url"]("https://accounts.google.com/o/oauth2/v2/auth?state=test")
        finished.set()
        return ag.AntigravityCredentials(
            access_token="access",
            refresh_token="refresh",
            expires_ms=int((time.time() + 3600) * 1000),
            email="profile@example.com",
        )

    monkeypatch.setattr(ag, "start_antigravity_oauth_flow", fake_start_flow)
    oauth._spawn_antigravity_oauth_worker(flow_id)
    assert finished.wait(timeout=3)
    deadline = time.time() + 3
    while time.time() < deadline:
        with oauth._OAUTH_FLOWS_LOCK:
            flow = dict(oauth._OAUTH_FLOWS[flow_id])
        if flow.get("status") != "pending":
            break
        time.sleep(0.01)

    assert observed["sidekick_home"] == target_home
    assert flow["status"] == "success"
    assert flow["auth_url"].startswith("https://accounts.google.com/")


def test_antigravity_oauth_cancel_during_onboarding_does_not_persist_account(tmp_path, monkeypatch):
    from web.api import oauth

    target_home = tmp_path / "profiles" / "cancelled"
    target_home.mkdir(parents=True)
    flow_id = "antigravity-cancel-during-onboarding"
    cancel_event = threading.Event()
    worker_entered = threading.Event()
    allow_worker_to_finish = threading.Event()
    worker_finished = threading.Event()
    monkeypatch.setitem(oauth._OAUTH_FLOWS, flow_id, {
        "provider": "antigravity",
        "status": "pending",
        "sidekick_home": str(target_home),
        "cancel_event": cancel_event,
    })

    creds = ag.AntigravityCredentials(
        access_token="access",
        refresh_token="refresh",
        expires_ms=int((time.time() + 3600) * 1000),
        email="cancelled@example.com",
    )

    def blocked_onboarding(**kwargs):
        worker_entered.set()
        assert allow_worker_to_finish.wait(timeout=3)
        # Simulates the OAuth runtime reaching its final persistence callback
        # after a slow email lookup/onboarding network request.
        try:
            kwargs["on_credentials"](creds)
        finally:
            worker_finished.set()
        return creds

    monkeypatch.setattr(ag, "start_antigravity_oauth_flow", blocked_onboarding)
    oauth._spawn_antigravity_oauth_worker(flow_id)
    assert worker_entered.wait(timeout=3)

    result = oauth.cancel_onboarding_oauth_flow({"flow_id": flow_id, "provider": "antigravity"})
    assert result["status"] == "cancelled"
    allow_worker_to_finish.set()

    assert worker_finished.wait(timeout=3)

    assert oauth._OAUTH_FLOWS[flow_id]["status"] == "cancelled"
    auth_file = target_home / "auth.json"
    assert not auth_file.exists() or "cancelled@example.com" not in auth_file.read_text(encoding="utf-8")


def test_antigravity_pending_oauth_poll_returns_late_auth_url(monkeypatch):
    from web.api import oauth

    flow_id = "antigravity-pending-url-test"
    monkeypatch.setitem(oauth._OAUTH_FLOWS, flow_id, {
        "provider": "antigravity",
        "status": "pending",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?state=opaque",
        "expires_at": time.time() + 60,
    })

    result = oauth.poll_onboarding_oauth_flow(flow_id)

    assert result["provider"] == "antigravity"
    assert result["status"] == "pending"
    assert result["auth_url"].startswith("https://accounts.google.com/")
    assert "state=opaque" in result["auth_url"]


def test_onboarding_detects_antigravity_account_in_requested_profile(tmp_path):
    from web.api.onboarding import _provider_oauth_authenticated

    (tmp_path / "auth.json").write_text(json.dumps({
        "credential_pool": {
            "antigravity": [{
                "email": "profile@example.com",
                "refresh_token": "refresh-token",
            }]
        }
    }), encoding="utf-8")

    assert _provider_oauth_authenticated("antigravity", tmp_path) is True
    assert _provider_oauth_authenticated("antigravity", tmp_path / "missing") is False


def _start_antigravity_callback_server(expected_state):
    server, _ = ag._bind_callback_server(0)
    callback_state = ag._OAuthCallbackState(
        expected_state=expected_state,
        ready=threading.Event(),
    )
    server.oauth_callback_state = callback_state
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, callback_state, thread


def _stop_antigravity_callback_server(server, thread):
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def test_antigravity_callback_accepts_code_and_sets_state():
    server, callback_state, thread = _start_antigravity_callback_server("expected")
    try:
        query = urllib.parse.urlencode({"state": "expected", "code": "synthetic-code"})
        with urllib.request.urlopen(
            f"http://127.0.0.1:{server.server_address[1]}{ag.CALLBACK_PATH}?{query}",
            timeout=3,
        ) as response:
            assert response.status == 200
        assert callback_state.ready.is_set()
        assert callback_state.code == "synthetic-code"
        assert callback_state.error is None
    finally:
        _stop_antigravity_callback_server(server, thread)


def test_antigravity_callback_rejects_wrong_state_without_aborting_flow():
    server, callback_state, thread = _start_antigravity_callback_server("expected")
    try:
        query = urllib.parse.urlencode({"state": "wrong", "code": "synthetic-code"})
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            urllib.request.urlopen(
                f"http://127.0.0.1:{server.server_address[1]}{ag.CALLBACK_PATH}?{query}",
                timeout=3,
            )
        assert excinfo.value.code == 400
        assert not callback_state.ready.is_set()
        assert callback_state.error is None
        assert callback_state.code is None

        valid_query = urllib.parse.urlencode({"state": "expected", "code": "valid-code"})
        with urllib.request.urlopen(
            f"http://127.0.0.1:{server.server_address[1]}{ag.CALLBACK_PATH}?{valid_query}",
            timeout=3,
        ) as response:
            assert response.status == 200
        assert callback_state.ready.is_set()
        assert callback_state.error is None
        assert callback_state.code == "valid-code"
    finally:
        _stop_antigravity_callback_server(server, thread)


def test_runtime_resolver_requires_connected_account(pool_env, monkeypatch):
    from cli.runtime_provider import resolve_runtime_provider
    with pytest.raises(Exception) as excinfo:
        resolve_runtime_provider(requested="antigravity")
    assert "antigravity" in str(excinfo.value).lower() or "No Antigravity account" in str(excinfo.value)


def test_runtime_resolver_returns_marker_base_url_with_account(pool_env):
    _add_account("ready@example.com")
    from cli.runtime_provider import resolve_runtime_provider
    resolved = resolve_runtime_provider(requested="antigravity")
    assert resolved["provider"] == "antigravity"
    assert resolved["api_mode"] == "chat_completions"
    assert resolved["base_url"] == "cloudcode-pa://antigravity"


def test_provider_alias_resolution():
    # resolve_requested_provider only lowercases; alias normalization happens
    # in auth.resolve_provider (the _PROVIDER_ALIASES map).
    from cli.runtime_provider import resolve_requested_provider
    from cli import auth as auth_mod
    assert resolve_requested_provider("antigravity") == "antigravity"
    assert auth_mod.resolve_provider("antigravity-cli") == "antigravity"
    assert auth_mod.resolve_provider("agy") == "antigravity"


def _chat_start_session(model_provider="antigravity"):
    from types import SimpleNamespace

    return SimpleNamespace(
        session_id="antigravity-chat-session",
        profile="default",
        workspace="C:/workspace",
        model="gemini-3-flash-preview",
        model_provider=model_provider,
        active_stream_id=None,
        messages=[],
        context_messages=[],
        pending_user_message=None,
    )


def _stub_chat_start(monkeypatch, session, forwarded):
    from types import SimpleNamespace
    from web.api import routes

    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda value: value)
    monkeypatch.setattr(
        routes,
        "_resolve_compatible_session_model_state",
        lambda model, provider: (model, provider, False),
    )
    monkeypatch.setattr(
        routes,
        "resolve_active_provider_context",
        lambda: {"provider": "antigravity", "model": session.model},
    )
    monkeypatch.setattr(routes, "_game_mode_guard_payload_for_model", lambda *a, **k: None)
    monkeypatch.setattr("web.api.goals.has_active_goal", lambda *a, **k: False)
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: None)
    monkeypatch.setattr(
        routes,
        "_start_chat_stream_for_session",
        lambda *args, **kwargs: forwarded.append(kwargs) or {"stream_id": "stream-1"},
    )
    monkeypatch.setattr(routes, "j", lambda _handler, payload, **_kwargs: payload)
    return routes._handle_chat_start


def test_chat_start_route_rotates_accounts_across_sequential_unpinned_requests(pool_env, monkeypatch):
    """The actual /api/chat/start route selects and forwards one account per request."""
    _add_account("alpha@example.com")
    _add_account("beta@example.com")
    session = _chat_start_session()
    forwarded = []
    handle_chat_start = _stub_chat_start(monkeypatch, session, forwarded)

    first = handle_chat_start(
        SimpleNamespace(headers={}),
        {"session_id": session.session_id, "message": "first", "workspace": session.workspace},
    )
    second = handle_chat_start(
        SimpleNamespace(headers={}),
        {"session_id": session.session_id, "message": "second", "workspace": session.workspace},
    )

    assert first["stream_id"] == second["stream_id"] == "stream-1"
    choices = [call["google_account_email"] for call in forwarded]
    assert choices == ["alpha@example.com", "beta@example.com"]
    assert all(call["model_provider"] == "antigravity" for call in forwarded)


def test_chat_start_route_pinned_account_bypasses_round_robin(pool_env, monkeypatch):
    _add_account("alpha@example.com")
    _add_account("beta@example.com")
    from web.api import routes

    def unexpected_rotation():
        pytest.fail("a pinned account must not advance round-robin")

    monkeypatch.setattr(ag, "select_next_account_email", unexpected_rotation)
    session = _chat_start_session()
    forwarded = []
    handle_chat_start = _stub_chat_start(monkeypatch, session, forwarded)

    response = handle_chat_start(
        SimpleNamespace(headers={}),
        {
            "session_id": session.session_id,
            "message": "pinned request",
            "workspace": session.workspace,
            "provider_account_email": "BETA@example.com",
        },
    )

    assert response["stream_id"] == "stream-1"
    assert len(forwarded) == 1
    assert forwarded[0]["google_account_email"] == "beta@example.com"
    assert forwarded[0]["model_provider"] == "antigravity"


def test_chat_start_account_choice_reaches_runtime_worker_once(pool_env, monkeypatch):
    """The selected route account is forwarded unchanged to one runtime worker."""
    from web.api import routes

    # This contract is about forwarding the selected account, not persistence
    # of goals; keep the worker-start test independent of profile GoalManager state.
    monkeypatch.setattr("web.api.goals.has_active_goal", lambda *a, **k: False)
    session = _chat_start_session()
    session.pending_started_at = 0.0
    session.save = lambda: None
    runtime_calls = []
    monkeypatch.setattr(routes, "_get_session_agent_lock", lambda _sid: nullcontext())
    monkeypatch.setattr(routes, "activate_kanban_orchestration", lambda *a, **k: None)
    monkeypatch.setattr(routes, "_prepare_chat_start_session_for_stream", lambda *a, **k: None)
    monkeypatch.setattr(routes, "create_stream_channel", object)
    monkeypatch.setattr(routes, "set_last_workspace", lambda _workspace: None)
    monkeypatch.setattr(
        routes,
        "_run_agent_streaming",
        lambda *args, **kwargs: runtime_calls.append(kwargs["google_account_email"]),
    )

    response = routes._start_chat_stream_for_session(
        session,
        msg="test runtime handoff",
        attachments=[],
        workspace=session.workspace,
        model=session.model,
        model_provider="antigravity",
        google_account_email="beta@example.com",
    )

    assert response["stream_id"]
    assert runtime_calls == ["beta@example.com"]
    with routes.STREAMS_LOCK:
        routes.STREAMS.pop(response["stream_id"], None)


def test_client_uses_pool_tokens_and_project(pool_env):
    _add_account("client@example.com", project="aicode-consumers")
    from runtime.antigravity_cloudcode_adapter import AntigravityCloudCodeClient
    client = AntigravityCloudCodeClient(account_email="client@example.com")
    assert client.account_email == "client@example.com"
    assert client._ensure_project_id("dummy-token") == "aicode-consumers"
    client.close()


def test_client_project_falls_back_to_consumer_default(pool_env):
    from runtime.antigravity_cloudcode_adapter import AntigravityCloudCodeClient
    client = AntigravityCloudCodeClient()
    # No account connected → discovery fails → consumer default.
    assert client._ensure_project_id("dummy") == ag.DEFAULT_ANTIGRAVITY_PROJECT
    client.close()


def test_antigravity_quota_status_is_account_scoped_and_does_not_infer_exhaustion(monkeypatch):
    from runtime import google_code_assist
    from web.api import providers

    accounts = [
        {"email": "first@example.com"},
        {"email": "second@example.com"},
    ]
    monkeypatch.setattr(ag, "list_connected_accounts", lambda: accounts)
    monkeypatch.setattr(ag, "load_account_credentials", lambda email: SimpleNamespace(project_id=f"project-{email}"))
    monkeypatch.setattr(ag, "get_valid_access_token", lambda *, account_email: f"token-{account_email}")
    seen = []

    def quota_lookup(token, *, project_id, user_agent_model):
        seen.append((token, project_id, user_agent_model))
        return []

    monkeypatch.setattr(google_code_assist, "retrieve_user_quota", quota_lookup)
    result = providers.get_provider_quota("antigravity")

    assert seen == [
        ("token-first@example.com", "project-first@example.com", ""),
        ("token-second@example.com", "project-second@example.com", ""),
    ]
    assert result["status"] == "empty"
    assert result["ok"] is False
    assert "do not prove" in result["message"]
    assert [entry["status"] for entry in result["quota"]] == ["no_buckets", "no_buckets"]


def test_antigravity_quota_status_reports_disabled_control_plane_without_claiming_exhaustion(monkeypatch):
    from runtime import google_code_assist
    from web.api import providers

    monkeypatch.setattr(ag, "list_connected_accounts", lambda: [{"email": "first@example.com"}])
    monkeypatch.setattr(ag, "load_account_credentials", lambda _email: SimpleNamespace(project_id="consumer-project"))
    monkeypatch.setattr(ag, "get_valid_access_token", lambda *, account_email: "access-token")
    monkeypatch.setattr(
        google_code_assist,
        "retrieve_user_quota",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            google_code_assist.CodeAssistError("disabled", code="provider_unavailable")
        ),
    )

    result = providers.get_provider_quota("antigravity")

    assert result["status"] == "unsupported"
    assert result["quota"][0]["status"] == "unsupported"
    assert "does not confirm daily quota exhaustion" in result["message"]


def test_generic_google_resource_exhausted_is_not_mislabeled_as_daily_quota():
    import httpx
    from runtime.gemini_cloudcode_adapter import _gemini_http_error

    response = httpx.Response(
        429,
        json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Resource exhausted."}},
    )
    error = _gemini_http_error(response)

    assert error.code == "code_assist_rate_limited"
    assert "does not confirm" in str(error)
    assert "Check /gquota" not in str(error)


def test_oauth_callback_state_supports_zero_argument_and_parameterized_construction():
    """_OAuthCallbackState must accept 0 arguments as well as explicit arguments."""
    state_empty = ag._OAuthCallbackState()
    assert state_empty.expected_state == ""
    assert isinstance(state_empty.ready, threading.Event)
    assert state_empty.code is None
    assert state_empty.error is None

    ev = threading.Event()
    state_full = ag._OAuthCallbackState("state-1", ev, "code-1", "error-1")
    assert state_full.expected_state == "state-1"
    assert state_full.ready is ev
    assert state_full.code == "code-1"
    assert state_full.error == "error-1"


def test_antigravity_auth_status_reports_logged_in_and_oauth_key_source(pool_env):
    """get_antigravity_auth_status must report logged_in and oauth key_source."""
    from cli import auth as auth_mod

    # Initially empty pool
    status_empty = ag.get_antigravity_auth_status()
    assert status_empty["provider_available"] is True
    assert status_empty["connected_accounts"] == 0
    assert status_empty["logged_in"] is False
    assert status_empty["key_source"] == "none"

    cli_status_empty = auth_mod.get_auth_status("antigravity")
    assert cli_status_empty["logged_in"] is False

    # After adding an account
    _add_account("verified@example.com")
    status_connected = ag.get_antigravity_auth_status()
    assert status_connected["provider_available"] is True
    assert status_connected["connected_accounts"] == 1
    assert status_connected["logged_in"] is True
    assert status_connected["key_source"] == "oauth"

    cli_status_connected = auth_mod.get_auth_status("antigravity")
    assert cli_status_connected["logged_in"] is True
    assert cli_status_connected["key_source"] == "oauth"


def test_antigravity_provider_status_reports_oauth_key_source_when_connected(pool_env, monkeypatch):
    """providers.get_providers() must report key_source='oauth' (not config_yaml) when accounts exist."""
    from contextlib import nullcontext
    from cli import auth as auth_mod
    from web.api import providers, profiles

    _add_account("user@example.com")
    monkeypatch.setattr(providers, "_PROVIDER_DISPLAY", {"antigravity": "Antigravity"})
    monkeypatch.setattr(providers, "_PROVIDER_MODELS", {"antigravity": []})
    monkeypatch.setattr(providers, "_PROVIDER_ENV_VAR", {})
    # Keep this focused Antigravity assertion from probing unrelated OAuth
    # credential stores (notably Qwen's Path.home() auth file).
    monkeypatch.setattr(providers, "_OAUTH_PROVIDERS", frozenset({"antigravity"}))
    generic_auth_status_calls = []
    original_auth_status = auth_mod.get_auth_status

    def record_generic_auth_status(provider_id=None):
        generic_auth_status_calls.append(provider_id)
        assert provider_id == "antigravity"
        return original_auth_status(provider_id)

    monkeypatch.setattr(auth_mod, "get_auth_status", record_generic_auth_status)
    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider_id: False)
    monkeypatch.setattr(providers, "get_config", lambda: {})
    monkeypatch.setattr(profiles, "cron_profile_context", nullcontext)

    result = providers.get_providers()["providers"]
    assert [provider["id"] for provider in result] == ["antigravity"]
    assert generic_auth_status_calls == ["antigravity"]
    antigravity = next(provider for provider in result if provider["id"] == "antigravity")

    assert antigravity["is_oauth"] is True
    assert antigravity["has_key"] is True
    assert antigravity["oauth_connected"] is True
    assert antigravity["auth_state"] == "connected"
    assert antigravity["key_source"] == "oauth"
    assert antigravity["oauth_email"] == "user@example.com"


def test_quota_429_does_not_disable_account_or_mark_exhausted(pool_env):
    """429 Resource Exhausted during inference must not disable an account from round-robin."""
    _add_account("first@example.com")
    _add_account("second@example.com")

    # Simulate 429 translation error (e.g. from Code Assist)
    import httpx
    from runtime.gemini_cloudcode_adapter import _gemini_http_error

    response = httpx.Response(
        429,
        json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Rate limit exceeded"}},
    )
    error = _gemini_http_error(response)
    assert error.code == "code_assist_rate_limited"

    # Pool entries must remain intact and NOT marked exhausted
    entries = ag._read_pool_entries()
    for entry in entries:
        assert entry.get("last_status") != "exhausted"
        assert entry.get("last_error_reason") != "invalid_grant"

    # Round-robin continues rotating both accounts
    picks = [ag.select_next_account_email() for _ in range(4)]
    assert picks == ["first@example.com", "second@example.com", "first@example.com", "second@example.com"]

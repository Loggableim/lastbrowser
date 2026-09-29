"""Contract tests for the browser-facing Google Gemini OAuth integration."""

from pathlib import Path
import logging
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import pytest

import web.api.oauth as oauth
from runtime import google_oauth


@pytest.mark.parametrize("creds,expected", [
    (None, False),
    (google_oauth.GoogleCredentials("access-secret", "refresh-secret", 0), True),
    (google_oauth.GoogleCredentials("access-secret", "", 0), True),
])
def test_google_provider_status_marks_legacy_credentials_unavailable(monkeypatch, creds, expected):
    from web.api import providers
    monkeypatch.setattr(providers, "get_config", lambda: {})
    monkeypatch.setattr(providers, "_PROVIDER_DISPLAY", {"google-gemini-cli": "Gemini CLI"})
    monkeypatch.setattr(providers, "_PROVIDER_MODELS", {})
    monkeypatch.setattr(providers, "_OAUTH_PROVIDERS", {"google-gemini-cli"})
    monkeypatch.setattr(providers, "_provider_has_key", lambda _: False)
    monkeypatch.setattr(google_oauth, "load_credentials", lambda: creds)
    monkeypatch.setattr("runtime.credential_pool.read_credential_pool", lambda _provider: [])
    result = providers.get_providers()["providers"][0]
    assert result["key_source"] == "oauth"
    assert result["auth_state"] == "unavailable"
    assert result["provider_available"] is False
    assert result["legacy_credentials_present"] is expected
    assert result["has_key"] is False
    assert result["oauth_email"] == ""
    assert "June 18, 2026" in result["auth_error"]
    assert "access-secret" not in str(result)
    assert "refresh-secret" not in str(result)


def test_google_quota_status_fails_closed_without_refresh_or_network(monkeypatch):
    from web.api import providers
    monkeypatch.setattr(google_oauth, "load_credentials", lambda: pytest.fail("quota status must not inspect OAuth credentials"))
    monkeypatch.setattr(google_oauth, "get_valid_access_token", lambda: pytest.fail("quota status must not refresh legacy Google credentials"))
    result = providers.get_provider_quota("google-gemini-cli")
    assert result["status"] == "unsupported"
    assert result["supported"] is False
    assert result["error_code"] == "provider_unavailable"
    assert "June 18, 2026" in result["message"]


def test_google_subscription_card_rejects_stale_oauth_metadata_and_preserves_api_key_distinction():
    import shutil
    import subprocess
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js required")
    script = r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
class Element {
  constructor(){this.children=[];this.dataset={};this.style={};this.events={};}
  appendChild(child){this.children.push(child);return child;}
  setAttribute(){}
  addEventListener(type,fn){this.events[type]=fn;}
  replaceChildren(...children){this.children=children;}
}
const source=fs.readFileSync('web/static/panels.js','utf8');
const start=source.indexOf('function _buildProviderCard(p)');
const end=source.indexOf('\nfunction ',start+1);
const context={document:{createElement:()=>new Element()},esc:x=>x,
  _providerText:(key,fallback)=>key==='providers_status_configured'?'API key configured':fallback,
  api:async()=>{throw new Error('Gemini subscription card must not call OAuth or quota APIs');}};
context.window=context;
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
const card=context._buildProviderCard({id:'google-gemini-cli',display_name:'Gemini CLI',is_oauth:true,has_key:true,key_source:'oauth',auth_state:'connected',models:[]});
assert.doesNotMatch(card.children[0].innerHTML,/verbunden|configured/i);
assert.match(card.children[0].innerHTML,/Gemini CLI nicht verfügbar/);
const body=card.children[1];
assert.match(body.children[0].innerHTML,/Google hat die Anmeldung/);
assert.match(body.children[0].innerHTML,/Antigravity CLI/);
assert.match(body.children[1].textContent,/Gemini API-Schlüssel ist ein separater Zugang/);
assert.equal(body.children.some(x=>x.className==='provider-card-actions'),false);
assert.equal(body.children.some(x=>x.textContent==='Google-Konto: tester@example.com'),false);
const unconfigured=context._buildProviderCard({id:'google-gemini-cli',display_name:'Gemini CLI',is_oauth:true,has_key:false,auth_state:'disconnected',models:[]});
assert.match(unconfigured.children[0].innerHTML,/Gemini CLI nicht verfügbar/);
assert.equal(unconfigured.children[1].children.some(x=>x.className==='provider-card-actions'),false);
"""
    _sidekick_root = Path(__file__).resolve().parent.parent
    result = subprocess.run([node, "-e", script], cwd=str(_sidekick_root), capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr


def test_google_subscription_oauth_is_rejected_as_unsupported(monkeypatch):
    monkeypatch.setattr(oauth, "_spawn_google_oauth_worker", lambda *_args: pytest.fail("Google OAuth worker must not run"))
    with pytest.raises(ValueError, match="supported in WebUI onboarding"):
        oauth.start_onboarding_oauth_flow({"provider": "google-gemini-cli"})


def test_google_cancel_drops_pending_flow_without_secrets(monkeypatch, tmp_path):
    oauth._OAUTH_FLOWS.clear()
    with pytest.raises(ValueError):
        oauth.start_onboarding_oauth_flow({"provider": "google-gemini-cli"})
    assert oauth._OAUTH_FLOWS == {}


@pytest.mark.parametrize(("detail", "code", "expected"), [
    (
        "Google OAuth authorization failed: disallowed_useragent",
        "google_oauth_authorization_failed",
        "Google rejected this OAuth client as an untrusted app. Opening the sign-in page in a system browser cannot fix a client-policy rejection.",
    ),
    (
        "Google OAuth token endpoint returned HTTP 400: {\"error\":\"invalid_grant\",\"refresh_token\":\"private\"}",
        "google_oauth_invalid_grant",
        "Google rejected the authorization code. Restart sign-in and try again.",
    ),
])
def test_google_oauth_errors_are_sanitized_for_renderer(detail, code, expected):
    error = google_oauth.GoogleOAuthError(detail, code=code)
    public = oauth._safe_google_oauth_error(error, code)
    assert public == expected
    assert "private" not in public


def test_google_oauth_public_poll_surfaces_disabled_provider_state():
    payload = oauth._public_status_payload("flow", {
        "provider": "google-gemini-cli", "status": "error",
        "error_code": "google_oauth_authorization_failed", "error": "old private flow detail",
    })
    assert payload["error_code"] == "unsupported_third_party_oauth"
    assert "June 18, 2026" in payload["error"]
    assert "Antigravity" in payload["error"]
    assert "third-party access terms" in payload["error"]
    assert "old private flow detail" not in str(payload)
    assert "access_token" not in str(payload)


def test_google_webui_contract_surfaces_exist():
    _sidekick_root = Path(__file__).resolve().parent.parent
    routes = (_sidekick_root / "web/api/routes.py").read_text(encoding="utf-8")
    panels = (_sidekick_root / "web/static/panels.js").read_text(encoding="utf-8")
    onboarding = (_sidekick_root / "web/static/onboarding.js").read_text(encoding="utf-8")
    assert "/api/oauth/google/start" in routes
    assert "/api/oauth/google/status" in routes
    assert "/api/oauth/google/disconnect" in routes
    assert "startGoogleGeminiOAuth" not in panels
    assert "oauth_email" not in panels
    assert "/api/oauth/google/start" not in panels
    assert "Gemini CLI nicht verfügbar" in panels
    assert "Gemini API-Schlüssel ist ein separater Zugang" in panels
    assert "Gemini CLI Anmeldung derzeit nicht verfügbar" in onboarding
    assert "Antigravity CLI" in onboarding
    assert "startGoogleGeminiOnboardingOAuth" not in onboarding
    assert "googleGeminiOAuthBtn" not in onboarding


def test_anthropic_connect_reports_the_real_local_cli_action(monkeypatch, tmp_path):
    monkeypatch.setattr(oauth, "_get_active_profile_home", lambda: tmp_path)
    monkeypatch.setattr(oauth, "_read_claude_code_credentials", lambda: None)
    monkeypatch.setattr(oauth, "_spawn_anthropic_credential_worker", lambda *_args: None)
    oauth._OAUTH_FLOWS.clear()

    payload = oauth.start_onboarding_oauth_flow({"provider": "anthropic"})
    assert payload["status"] == "pending"
    assert "does not run a Claude OAuth browser login" in payload["action_required"]
    assert "claude login" in payload["action_required"]
    assert "verification_uri" not in payload


def test_anthropic_credential_worker_links_claude_credentials_without_codex_polling(monkeypatch, tmp_path):
    monkeypatch.setattr(oauth, "_get_active_profile_home", lambda: tmp_path)
    monkeypatch.setattr(oauth, "_spawn_anthropic_credential_worker", lambda *_args: None)
    monkeypatch.setattr(oauth, "_read_claude_code_credentials", lambda: {"access_token": "local-claude"})
    monkeypatch.setattr(oauth, "_link_anthropic_credentials", lambda _home: None)
    monkeypatch.setattr(oauth.time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(
        oauth,
        "_poll_codex_authorization",
        lambda *_args: pytest.fail("Anthropic credential polling must never call Codex device auth"),
    )
    oauth._OAUTH_FLOWS.clear()
    try:
        payload = oauth.start_onboarding_oauth_flow({"provider": "anthropic"})
        oauth._run_anthropic_credential_worker(payload["flow_id"])
        status = oauth.poll_onboarding_oauth_flow(payload["flow_id"])
        assert status["status"] == "success"
    finally:
        oauth._OAUTH_FLOWS.clear()


def test_codex_oauth_status_payload_does_not_expose_tokens():
    payload = oauth._codex_public_status_payload("flow", {
        "status": "error", "error": "token exchange failed", "access_token": "secret-token"
    })
    assert payload["error"] == "token exchange failed"
    assert "access_token" not in payload
    assert "secret-token" not in str(payload)


def test_codex_start_uses_browser_pkce_flow_without_device_auth(monkeypatch, tmp_path):
    from urllib.parse import parse_qs, urlparse

    monkeypatch.setattr(oauth, "_get_active_profile_home", lambda: tmp_path)
    monkeypatch.setattr(oauth, "_request_codex_user_code", lambda: pytest.fail("device-auth route must not be called"))
    monkeypatch.setattr(oauth, "_spawn_codex_oauth_worker", lambda _flow_id: None)
    oauth._OAUTH_FLOWS.clear()

    payload = oauth.start_onboarding_oauth_flow({"provider": "openai-codex"})
    flow = oauth._OAUTH_FLOWS[payload["flow_id"]]
    callback_server = flow["callback_server"]
    try:
        assert payload["status"] == "pending"
        assert payload["provider"] == "openai-codex"
        assert payload["auth_url"].startswith("https://auth.openai.com/oauth/authorize?")
        assert "530" not in str(payload)
        assert "code_verifier" not in payload
        query = parse_qs(urlparse(payload["auth_url"]).query)
        assert query["response_type"] == ["code"]
        assert query["code_challenge_method"] == ["S256"]
        assert query["scope"] == ["openid profile email offline_access api.connectors.read api.connectors.invoke"]
        assert query["redirect_uri"] == [flow["redirect_uri"]]
        assert flow["auth_mode"] == "browser"
    finally:
        callback_server.shutdown()
        callback_server.server_close()
        oauth._OAUTH_FLOWS.clear()


def test_codex_browser_callback_pkce_exchange_and_persistence(monkeypatch, tmp_path):
    import urllib.request

    monkeypatch.setattr(oauth, "_get_active_profile_home", lambda: tmp_path)
    monkeypatch.setattr(oauth, "_spawn_codex_oauth_worker", lambda _flow_id: None)
    saved = []
    exchanged = []
    monkeypatch.setattr(oauth, "_persist_codex_credentials", lambda home, tokens: saved.append((home, tokens)))
    monkeypatch.setattr(
        oauth,
        "_exchange_codex_authorization",
        lambda code, verifier, redirect_uri: exchanged.append((code, verifier, redirect_uri))
        or {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh"},
    )
    oauth._OAUTH_FLOWS.clear()

    payload = oauth.start_onboarding_oauth_flow({"provider": "openai-codex"})
    flow = oauth._OAUTH_FLOWS[payload["flow_id"]]
    callback_server = flow["callback_server"]
    try:
        invalid_url = flow["redirect_uri"] + "?" + urllib.parse.urlencode({
            "state": "attacker-controlled-state",
            "code": "injected-code",
        })
        with pytest.raises(urllib.error.HTTPError) as rejected:
            urllib.request.urlopen(invalid_url, timeout=3)
        assert rejected.value.code == 400
        assert flow["callback_state"].ready.is_set() is False

        callback_url = flow["redirect_uri"] + "?" + urllib.parse.urlencode({
            "state": flow["callback_state"].expected_state,
            "code": "synthetic-authorization-code",
        })
        with urllib.request.urlopen(callback_url, timeout=3) as response:
            assert response.status == 200

        expected_exchange = (
            "synthetic-authorization-code",
            flow["code_verifier"],
            flow["redirect_uri"],
        )
        oauth._run_codex_oauth_worker(payload["flow_id"])
        status = oauth.poll_onboarding_oauth_flow(payload["flow_id"])
        assert status["status"] == "success"
        assert exchanged == [expected_exchange]
        assert saved and saved[0][1]["access_token"] == "synthetic-access"
    finally:
        callback_server.shutdown()
        callback_server.server_close()
        oauth._OAUTH_FLOWS.clear()


def test_codex_oauth_onboarding_apply_selects_authenticated_provider(monkeypatch, tmp_path):
    from web.api import onboarding

    profile_home = tmp_path / "profile"
    profile_home.mkdir()
    config_path = tmp_path / "config.yaml"
    monkeypatch.setattr(onboarding, "_get_active_profile_home", lambda: profile_home)
    monkeypatch.setattr(onboarding, "_get_config_path", lambda: config_path)
    monkeypatch.setattr(onboarding, "_provider_oauth_authenticated", lambda provider, _home: provider == "openai-codex")
    monkeypatch.setattr(onboarding, "get_onboarding_status", lambda: {"system": {"current_provider": "openai-codex"}})
    monkeypatch.setattr(onboarding, "reload_config", lambda: None)

    result = onboarding.apply_onboarding_setup({
        "provider": "openai-codex", "model": "gpt-5.5", "confirm_overwrite": True,
    })

    assert result["system"]["current_provider"] == "openai-codex"
    import yaml
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["model"]["provider"] == "openai-codex"
    assert saved["model"]["default"] == "gpt-5.5"


def test_google_poll_expires_without_exposing_flow_secrets():
    oauth._OAUTH_FLOWS.clear()
    oauth._OAUTH_FLOWS["expired-flow"] = {
        "provider": "google-gemini-cli", "status": "pending", "expires_at": 0,
        "updated_at": 0, "access_token": "secret", "refresh_token": "secret",
    }
    result = oauth.poll_onboarding_oauth_flow("expired-flow")
    assert result["status"] == "error"
    assert result["error_code"] == "unsupported_third_party_oauth"
    assert "access_token" not in result
    assert "refresh_token" not in result


def test_google_token_persistence_rejects_incomplete_response():
    with pytest.raises(google_oauth.GoogleOAuthError) as exc:
        google_oauth._persist_token_response({"access_token": "only-access"})
    assert exc.value.code == "google_oauth_incomplete_token_response"


def _start_google_callback_server(expected_state):
    server, _ = google_oauth._bind_callback_server(0)
    callback_state = google_oauth._OAuthCallbackState(
        expected_state=expected_state,
        ready=threading.Event(),
    )
    server.oauth_callback_state = callback_state
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, callback_state, thread


def _stop_google_callback_server(server, thread):
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def test_google_callback_rejects_wrong_state():
    server, callback_state, thread = _start_google_callback_server("expected")
    port = server.server_address[1]
    try:
        with pytest.raises(Exception):
            urllib.request.urlopen(
                f"http://127.0.0.1:{port}/oauth2callback?state=wrong&code=synthetic-code",
                timeout=3,
            )
        assert callback_state.error == "state_mismatch"
        assert callback_state.code is None
        assert callback_state.ready.is_set()
    finally:
        _stop_google_callback_server(server, thread)


def test_google_callbacks_isolate_concurrent_flow_state_and_redact_request_logs(caplog):
    server_a, state_a, thread_a = _start_google_callback_server("state-a")
    server_b, state_b, thread_b = _start_google_callback_server("state-b")
    code_a = "synthetic-code-a"
    code_b = "synthetic-code-b"
    caplog.set_level(logging.DEBUG, logger=google_oauth.logger.name)
    try:
        for index, (server, state, code) in enumerate(((server_a, state_a, code_a), (server_b, state_b, code_b))):
            url = (
                f"http://127.0.0.1:{server.server_address[1]}{google_oauth.CALLBACK_PATH}?"
                + urllib.parse.urlencode({"state": state.expected_state, "code": code})
            )
            with urllib.request.urlopen(url, timeout=3) as response:
                assert response.status == 200
            assert state.ready.wait(timeout=1)

            if index == 0:
                assert not state_b.ready.is_set()
                assert state_b.code is None

        assert state_a.code == code_a
        assert state_b.code == code_b
        assert state_a.error is None
        assert state_b.error is None
        assert code_a not in caplog.text
        assert code_b not in caplog.text
        assert "state-a" not in caplog.text
        assert "state-b" not in caplog.text
    finally:
        _stop_google_callback_server(server_a, thread_a)
        _stop_google_callback_server(server_b, thread_b)


def test_google_oauth_cancel_during_token_exchange_prevents_persist(monkeypatch):
    monkeypatch.setattr(google_oauth, "_require_client_id", lambda: "synthetic-client-id")
    monkeypatch.setattr(google_oauth, "_get_client_secret", lambda: "synthetic-client-secret")
    monkeypatch.setattr(google_oauth, "_generate_pkce_pair", lambda: ("synthetic-verifier", "synthetic-challenge"))

    exchange_started = threading.Event()
    release_exchange = threading.Event()
    cancel_event = threading.Event()
    persisted = []

    def exchange_code(*_args, **_kwargs):
        exchange_started.set()
        assert release_exchange.wait(timeout=3)
        return {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh", "expires_in": 3600}

    monkeypatch.setattr(google_oauth, "exchange_code", exchange_code)
    monkeypatch.setattr(google_oauth, "_persist_token_response", lambda *_args, **_kwargs: persisted.append(True))

    def publish_and_complete_callback(auth_url):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(auth_url).query)
        redirect_uri = (query["redirect_uri"])[0]
        callback_state = (query["state"])[0]

        def send_callback():
            deadline = time.monotonic() + 3
            callback_url = f"{redirect_uri}?" + urllib.parse.urlencode({"state": callback_state, "code": "synthetic-code"})
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(callback_url, timeout=0.25) as response:
                        assert response.status == 200
                    return
                except (OSError, urllib.error.URLError):
                    time.sleep(0.02)
            raise AssertionError("OAuth callback listener did not start")

        threading.Thread(target=send_callback, daemon=True).start()

    result = {}

    def run_flow():
        try:
            google_oauth.start_oauth_flow(
                force_relogin=True,
                open_browser=False,
                callback_wait_seconds=3,
                on_auth_url=publish_and_complete_callback,
                cancel_event=cancel_event,
            )
        except Exception as exc:
            result["error"] = exc

    worker = threading.Thread(target=run_flow, daemon=True)
    worker.start()
    try:
        assert exchange_started.wait(timeout=4)
        cancel_event.set()
        release_exchange.set()
        worker.join(timeout=4)
        assert not worker.is_alive()
        assert isinstance(result.get("error"), google_oauth.GoogleOAuthError)
        assert result["error"].code == "google_oauth_cancelled"
        assert persisted == []
    finally:
        release_exchange.set()
        worker.join(timeout=4)


def test_google_disconnect_does_not_mutate_legacy_credentials(monkeypatch):
    import runtime.google_oauth as google_oauth_module
    import runtime.credential_pool as credential_pool

    def forbidden(*_args, **_kwargs):
        pytest.fail("Legacy Google credentials must not be silently deleted")

    monkeypatch.setattr(google_oauth_module, "clear_credentials", forbidden)
    monkeypatch.setattr(credential_pool, "write_credential_pool", forbidden)
    result = oauth.disconnect_google_oauth()
    assert result["disconnected"] is False
    assert result["ok"] is False


def test_google_gemini_models_catalog_hides_disabled_subscription_provider(monkeypatch):
    from web.api.config import get_available_models, invalidate_models_cache
    from types import SimpleNamespace

    from runtime import google_code_assist
    from runtime.google_code_assist import QuotaBucket
    from web.api import config as web_config
    dummy_creds = SimpleNamespace(email="tester@example.com", project_id="test-proj", managed_project_id=None)
    monkeypatch.setattr(google_oauth, "load_credentials", lambda: dummy_creds)
    monkeypatch.setattr(google_oauth, "get_valid_access_token", lambda *args, **kwargs: "fake-token")
    monkeypatch.setattr(google_oauth, "load_account_credentials", lambda _email: None)
    monkeypatch.setattr("runtime.credential_pool.read_credential_pool", lambda _provider: [])

    quota_calls = []
    def mock_quota(token, *, project_id="", user_agent_model=""):
        quota_calls.append((token, project_id))
        return [
            QuotaBucket(model_id="gemini-3-flash-preview", remaining_fraction=0.85, reset_time_iso="2026-09-24T00:00:00Z"),
            QuotaBucket(model_id="gemini-3.1-pro-preview", remaining_fraction=0.50, reset_time_iso="2026-09-24T00:00:00Z"),
        ]

    monkeypatch.setattr(google_code_assist, "retrieve_user_quota", mock_quota)
    monkeypatch.setattr("cli.models.provider_model_ids", lambda _provider: ["gemini-3-flash-preview", "gemini-3.1-pro-preview"])
    monkeypatch.setattr(web_config, "resolve_active_provider_context", lambda _cfg: {"provider": "openrouter", "model": "openrouter/model"})
    invalidate_models_cache()

    catalog = get_available_models()
    group = next((g for g in catalog.get("groups", []) if g.get("provider_id") == "google-gemini-cli"), None)
    assert group is None
    assert quota_calls == []


def test_google_gemini_models_catalog_does_not_advertise_legacy_model_ids(monkeypatch):
    from web.api.config import get_available_models, invalidate_models_cache
    from runtime import google_code_assist
    from types import SimpleNamespace

    monkeypatch.setattr(google_oauth, "load_credentials", lambda: SimpleNamespace(
        email="tester@example.com", project_id="test-proj", managed_project_id=None
    ))
    monkeypatch.setattr(google_oauth, "get_valid_access_token", lambda *args, **kwargs: "fake-token")
    monkeypatch.setattr(google_code_assist, "retrieve_user_quota", lambda *_args, **_kwargs: [])
    monkeypatch.setattr("cli.models.provider_model_ids", lambda _provider: ["gemini-3-flash-preview"])
    invalidate_models_cache()

    catalog = get_available_models()
    assert all(group.get("provider_id") != "google-gemini-cli" for group in catalog["groups"])



"""Legacy Google account metadata is retained, but subscription inference is disabled."""

from types import SimpleNamespace

import pytest

from cli.auth import AuthError
from cli.runtime_provider import resolve_runtime_provider
from runtime import google_oauth
from runtime.google_code_assist import CodeAssistError, _post_json
from web.api import routes


def test_account_selector_loads_matching_pool_entry_without_runtime_use(monkeypatch):
    entries = [
        {"email": "first@example.com", "access_token": "token-one", "project_id": "project-one"},
        {"email": "second@example.com", "access_token": "token-two", "project_id": "project-two"},
    ]
    monkeypatch.setattr("runtime.credential_pool.read_credential_pool", lambda _provider: entries)
    first = google_oauth.load_account_credentials("FIRST@example.com")
    assert first.email == "first@example.com"
    assert first.project_id == "project-one"


def test_round_robin_metadata_cycles_usable_accounts(monkeypatch):
    entries = [
        {"email": "first@example.com", "access_token": "token-first"},
        {"email": "second@example.com", "access_token": "token-second"},
    ]
    monkeypatch.setattr("runtime.credential_pool.read_credential_pool", lambda _provider: entries)
    monkeypatch.setattr(google_oauth, "_account_round_robin_index", 0)
    assert [google_oauth.select_next_account_email() for _ in range(4)] == [
        "first@example.com", "second@example.com", "first@example.com", "second@example.com",
    ]


def test_google_cli_catalog_does_not_advertise_unavailable_subscription_models():
    from cli.models import curated_models_for_provider, provider_model_ids

    assert provider_model_ids("google-gemini-cli") == []
    assert curated_models_for_provider("google-gemini-cli") == []


def test_static_model_detection_does_not_route_to_unavailable_google_cli(monkeypatch):
    from cli.models import detect_provider_for_model

    # Keep this contract independent of OpenRouter's mutable public model
    # catalog: the assertion is about not selecting the disabled Google CLI.
    # Since the Antigravity provider shipped, gemini-3-flash-preview IS a
    # valid catalog model again — auto-detection routes it to the Antigravity
    # consumer tier (multi-account round-robin), never to the retired CLI.
    monkeypatch.setattr("cli.models._find_openrouter_slug", lambda _model: None)
    detected = detect_provider_for_model("gemini-3-flash-preview", "openrouter")
    assert detected is not None
    assert detected[0] == "antigravity"
    assert detected[1] == "gemini-3-flash-preview"


def test_google_cli_auth_add_rejects_before_pool_or_browser_flow(monkeypatch):
    from cli import auth_commands

    monkeypatch.setattr(auth_commands, "load_pool", lambda *_args, **_kwargs: pytest.fail("must not inspect or mutate auth pool"))
    monkeypatch.setattr("runtime.google_oauth.run_gemini_oauth_login_pure", lambda: pytest.fail("must not start Google OAuth"))
    with pytest.raises(SystemExit, match="June 18, 2026"):
        auth_commands.auth_add_command(SimpleNamespace(provider="google-gemini-cli"))


def test_google_cli_model_setup_does_not_start_oauth_or_prompt(monkeypatch, capsys):
    from cli import main

    monkeypatch.setattr("builtins.input", lambda *_args, **_kwargs: pytest.fail("must not prompt for Google OAuth"))
    monkeypatch.setattr("runtime.google_oauth.start_oauth_flow", lambda *_args, **_kwargs: pytest.fail("must not start Google OAuth"))
    main._model_flow_google_gemini_cli({})
    assert "June 18, 2026" in capsys.readouterr().out


def test_saved_gemini_cli_provider_fails_runtime_resolution_closed(monkeypatch):
    monkeypatch.setattr("cli.runtime_provider._get_model_config", lambda: {
        "provider": "google-gemini-cli", "default": "gemini-3-flash-preview",
        "base_url": "cloudcode-pa://google",
    })
    monkeypatch.setattr(
        "cli.auth.resolve_gemini_oauth_runtime_credentials",
        lambda **_kwargs: pytest.fail("legacy Google credentials must not be loaded for inference"),
    )
    with pytest.raises(AuthError) as exc:
        resolve_runtime_provider()
    assert exc.value.code == "provider_unavailable"


def test_web_chat_start_returns_provider_unavailable_for_saved_gemini_selection(monkeypatch):
    session = SimpleNamespace(
        session_id="saved-google-session", profile="default", workspace="C:\\workspace",
        model="gemini-3-flash-preview", model_provider="google-gemini-cli",
        active_stream_id=None, pending_started_at=0.0, messages=[], context_messages=[],
        pending_user_message=None,
    )
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda value: value)
    monkeypatch.setattr(routes, "_resolve_compatible_session_model_state", lambda model, provider: (model, provider, False))
    monkeypatch.setattr(routes, "resolve_active_provider_context", lambda **_kwargs: {
        "provider": "google-gemini-cli", "model": "gemini-3-flash-preview",
    })
    monkeypatch.setattr(routes, "_game_mode_guard_payload_for_model", lambda *args, **kwargs: None)
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200, **_kwargs: {**payload, "_status": status})
    monkeypatch.setattr(routes.threading, "Thread", lambda **_kwargs: pytest.fail("must not start an inference stream"))

    response = routes._handle_chat_start(SimpleNamespace(headers={}), {
        "session_id": session.session_id, "message": "Use the saved Google account",
        "workspace": session.workspace, "model": session.model,
    })

    assert response["_status"] == 503
    assert response["error_code"] == "provider_unavailable"
    assert "Antigravity CLI" in response["error"]


def test_code_assist_http_transport_fails_closed_before_network(monkeypatch):
    monkeypatch.setattr("urllib.request.urlopen", lambda *_a, **_k: pytest.fail("Code Assist request must not be sent"))
    with pytest.raises(CodeAssistError) as exc:
        _post_json("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota", {}, "stale-token")
    assert exc.value.code == "provider_unavailable"

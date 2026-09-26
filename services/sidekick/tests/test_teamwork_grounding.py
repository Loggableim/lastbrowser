from types import SimpleNamespace

import pytest

from web.api import routes


def test_teamwork_grounding_context_removes_url_credentials_query_and_fragment():
    context = routes._normalize_teamwork_grounding_context({
        "url": "https://user:pass@example.test/private/path?token=secret#section",
        "title": " Example page ",
        "snippet": "Visible excerpt",
    })

    assert context == (
        "URL: https://example.test/private/path\n"
        "Titel: Example page\n"
        "Sichtbarer Auszug: Visible excerpt"
    )
    assert "secret" not in context
    assert "user" not in context


def test_teamwork_grounding_context_is_bounded_and_ignores_non_web_urls():
    context = routes._normalize_teamwork_grounding_context({
        "url": "file:///C:/private/document.html",
        "title": "t" * 500,
        "snippet": "s" * 5000,
    })

    assert "URL:" not in context
    assert len(context.split("Titel: ", 1)[1].split("\n", 1)[0]) == 240
    assert len(context.split("Sichtbarer Auszug: ", 1)[1]) == 1800
    assert routes._normalize_teamwork_grounding_context("not an object") == ""


@pytest.mark.parametrize(
    ("shared_grounding", "requested_model", "expected_context"),
    [(True, "teamwork", "Sichtbarer Auszug: selected text"),
     (False, "teamwork", ""),
     (True, "smart-track-medium", "")],
)
def test_chat_start_forwards_grounding_only_for_enabled_teamwork(
    monkeypatch, shared_grounding, requested_model, expected_context,
):
    session = SimpleNamespace(
        session_id="session-1",
        profile="default",
        workspace="C:/work",
        model=requested_model,
        model_provider="orchestrator",
        active_stream_id=None,
        messages=[],
        context_messages=[],
        pending_user_message=None,
    )
    captured = {}
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda value: value)
    monkeypatch.setattr(routes, "resolve_active_provider_context", lambda: {"provider": "orchestrator", "model": requested_model})
    monkeypatch.setattr(routes, "_game_mode_guard_payload_for_model", lambda *args, **kwargs: None)
    monkeypatch.setattr("web.api.goals.has_active_goal", lambda *args, **kwargs: False)
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: None)
    monkeypatch.setattr("runtime.teamwork_orchestrator.load_teamwork_config", lambda: {"enabled": True, "shared_grounding": shared_grounding})
    monkeypatch.setattr(routes, "_start_chat_stream_for_session", lambda *args, **kwargs: captured.update(kwargs) or {"stream_id": "stream-1"})
    monkeypatch.setattr(routes, "j", lambda _handler, payload, **_kwargs: payload)

    response = routes._handle_chat_start(SimpleNamespace(headers={}), {
        "session_id": "session-1",
        "message": "Please inspect the active page",
        "workspace": "C:/work",
        "model": requested_model,
        "grounding_context": {
            "url": "https://example.test/path?private=1",
            "title": "Example",
            "snippet": "selected text",
        },
    })

    assert response["stream_id"] == "stream-1"
    assert expected_context in captured["grounding_context"]

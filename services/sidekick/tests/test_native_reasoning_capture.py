"""Actual session persistence and goal entry point preserve model-bound effort."""
from types import SimpleNamespace

import pytest


def test_session_roundtrip_uses_exact_pair_and_current_capabilities(tmp_path, monkeypatch):
    from web.api import models, routes, config
    directory = tmp_path / "sessions"
    directory.mkdir()
    monkeypatch.setattr(models, "get_session_dir", lambda: directory)
    monkeypatch.setattr(models.Session, "_legacy_session_path", lambda self: None)
    monkeypatch.setattr(config, "_known_reasoning_efforts_for_model", lambda model, provider:
                        ["low", "high"] if (model, provider) == ("controlled-model", "openai-codex") else [])
    choice = {"schemaVersion": 1, "provider": "openai-codex", "model": "controlled-model", "effort": "high"}
    session = models.Session(session_id="reasoning_roundtrip", workspace=str(tmp_path), model="controlled-model",
                             model_provider="openai-codex", reasoning_selection=choice)
    session.save(skip_index=True)
    reloaded = models.Session.load(session.session_id)
    assert reloaded.reasoning_selection == choice
    assert reloaded.compact()["reasoning_selection"] == choice
    assert routes._chat_reasoning_selection({}, session.model, session.model_provider, reloaded) == ("high", ["low", "high"])
    assert routes._chat_reasoning_selection({}, session.model, "other-provider", reloaded) == (None, None)
    assert routes._chat_reasoning_selection({}, "other-model", session.model_provider, reloaded) == (None, [])
    with pytest.raises(ValueError, match="not supported"):
        routes._chat_reasoning_selection({"reasoning_effort": "high"}, "other-model", "openai-codex", reloaded)
    assert reloaded.reasoning_selection == choice


def test_goal_validates_before_state_change_and_delivers_effort_to_stream(tmp_path, monkeypatch):
    from web.api import config, goals, routes
    session = SimpleNamespace(session_id="reasoning-goal", profile="default", workspace=str(tmp_path),
        model="controlled-model", model_provider="openai-codex", active_stream_id=None,
        messages=[], context_messages=[], pending_user_message=None)
    saved, launched = [], []
    monkeypatch.setattr(routes, "get_session", lambda sid: session)
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda value: value)
    monkeypatch.setattr(routes, "_resolve_compatible_session_model_state", lambda model, provider: (model, provider, model))
    monkeypatch.setattr(routes, "_game_mode_nova_remote_model_state", lambda *args, **kwargs: None)
    monkeypatch.setattr(config, "_known_reasoning_efforts_for_model", lambda model, provider: ["low", "high"])
    monkeypatch.setattr(goals, "goal_state_snapshot", lambda *args, **kwargs: None)
    monkeypatch.setattr(goals, "goal_command_payload", lambda *args, **kwargs: saved.append(args) or {"ok": True, "kickoff_prompt": "actual goal prompt"})
    monkeypatch.setattr(routes, "_start_chat_stream_for_session", lambda *args, **kwargs: launched.append(kwargs) or {"stream_id": "controlled-stream"})
    monkeypatch.setattr(routes, "j", lambda handler, payload, status=200, **kwargs: (status, payload))
    monkeypatch.setattr(routes, "bad", lambda handler, message, status=400: (status, message))
    body = {"session_id": session.session_id, "args": "Complete this work", "reasoning_effort": "high"}
    assert routes._handle_goal_command(object(), body)[0] == 200
    assert len(saved) == len(launched) == 1
    assert launched[0]["reasoning_effort"] == "high"
    assert launched[0]["supported_reasoning_efforts"] == ["low", "high"]
    assert routes._handle_goal_command(object(), {**body, "reasoning_effort": "unsupported"})[0] == 400
    assert len(saved) == len(launched) == 1

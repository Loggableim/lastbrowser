from __future__ import annotations

from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock

import pytest


@pytest.mark.parametrize(
    ("model", "mode", "expected"),
    [
        ("teamwork", "", "teamwork"),
        ("default-model", "teamwork", "teamwork"),
        ("smart-track-low", "", "smart-track"),
        ("default-model", "smart-track", "smart-track"),
        ("ollama:qwen3", "", None),
        ("openai/gpt", "", None),
    ],
)
def test_requested_orchestration_mode_leaves_normal_models_untouched(model, mode, expected):
    from web.api.streaming import _requested_orchestration_mode

    assert _requested_orchestration_mode(model, mode) == expected


@pytest.mark.parametrize("orchestration", ["teamwork", "smart-track"])
def test_orchestration_config_load_errors_fail_closed(monkeypatch, orchestration):
    from web.api import streaming
    if orchestration == "teamwork":
        from runtime import teamwork_orchestrator
        monkeypatch.setattr(teamwork_orchestrator, "load_teamwork_config", Mock(side_effect=OSError("unavailable")))
    else:
        from runtime import smart_track_orchestrator
        monkeypatch.setattr(smart_track_orchestrator, "load_smart_track_config", Mock(side_effect=OSError("unavailable")))

    assert streaming._orchestration_is_enabled(orchestration) is False


@pytest.mark.parametrize(
    ("orchestration", "model", "config_module", "config_loader", "runner_name"),
    [
        ("teamwork", "teamwork", "runtime.teamwork_orchestrator", "load_teamwork_config", "run_teamwork_turn"),
        ("smart-track", "smart-track-high", "runtime.smart_track_orchestrator", "load_smart_track_config", "run_smart_track_turn"),
    ],
)
def test_disabled_orchestration_stream_emits_error_without_model_call(
    monkeypatch, tmp_path, orchestration, model, config_module, config_loader, runner_name
):
    import web.api.streaming as streaming
    from web.api.config import STREAMS, STREAMS_LOCK, StreamChannel
    import importlib

    stream_id = f"disabled-{orchestration}"
    channel = StreamChannel()
    with STREAMS_LOCK:
        STREAMS[stream_id] = channel

    session = SimpleNamespace(
        workspace_slug=None,
        workspace="",
        model="",
        model_provider=None,
        active_stream_id=stream_id,
        pending_user_message="Testfrage",
        save=Mock(),
    )
    monkeypatch.setattr(streaming, "get_session", lambda _sid: session)
    monkeypatch.setattr(streaming, "register_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "update_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "unregister_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "append_turn_journal_event_for_stream", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "_get_session_agent_lock", lambda _sid: nullcontext())
    monkeypatch.setattr(streaming, "meter", lambda: SimpleNamespace(begin_session=lambda *_a: None, get_interval=lambda: 10.0, get_stats=lambda: {}))

    orchestrator_module = importlib.import_module(config_module)
    monkeypatch.setattr(orchestrator_module, config_loader, lambda: {"enabled": False})
    runner = Mock(side_effect=AssertionError("disabled orchestrator must not run"))
    monkeypatch.setattr(orchestrator_module, runner_name, runner)

    try:
        streaming._run_agent_streaming(
            "disabled-session",
            "Testfrage",
            model,
            str(tmp_path),
            stream_id,
        )
        event, payload = channel._offline_buffer.pop(0)
        assert event == "error"
        assert "deaktiviert" in payload["error"]
        assert payload["session_id"] == "disabled-session"
        assert session.active_stream_id is None
        assert session.pending_user_message is None
        session.save.assert_called_once()
        runner.assert_not_called()
    finally:
        with STREAMS_LOCK:
            STREAMS.pop(stream_id, None)

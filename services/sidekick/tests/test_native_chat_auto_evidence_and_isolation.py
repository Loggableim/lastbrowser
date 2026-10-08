"""Behavioral tests for AUTO execution evidence persistence and backend profile isolation.

Covers:
1. Turn success -> save -> reload -> identical execution evidence (provider_evidence, turn_id, stream_id).
2. Two different models in successive turns (preserves earlier turn's evidence, no backward corruption).
3. Abort/error without false positive success evidence.
4. Two backend profiles without cross-contamination.
5. Cancelling an old stream targets its original stream without affecting other profiles.
"""
from __future__ import annotations

import json
import os
import threading
import time
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from web.api import config, streaming
from web.api.config import (
    STREAMS,
    STREAMS_LOCK,
    CANCEL_FLAGS,
    AGENT_INSTANCES,
    STREAM_PARTIAL_TEXT,
    StreamChannel,
    set_session_dir,
)
from web.api.models import Session
from web.api.runtime_identity import RUNTIME_GENERATION, provider_config_generation
from web.api.streaming import (
    _provider_evidence_from_result,
    cancel_stream,
)


def _expected_provider_evidence(provider: str, model: str) -> dict:
    return {"provider_id": provider, "model_id": model, "successful_chat": True,
        "runtime_generation": RUNTIME_GENERATION,
        "provider_config_generation": provider_config_generation(provider)}


def simulate_read_observed_decision_from_session(session_dict: dict, expected_session_id: str):
    """Python reference implementation of model-policy-client.ts:readObservedDecisionFromSession."""
    if not isinstance(session_dict, dict):
        return None
    session_id = str(session_dict.get("session_id") or "").strip()
    if not session_id or session_id != expected_session_id:
        return None
    messages = session_dict.get("messages")
    if not isinstance(messages, list):
        return None
    last_assistant = None
    for m in reversed(messages):
        if isinstance(m, dict) and m.get("role") == "assistant":
            last_assistant = m
            break
    if not last_assistant:
        return None
    if (
        last_assistant.get("pending") is True
        or last_assistant.get("streaming") is True
        or last_assistant.get("interrupted") is True
        or last_assistant.get("error")
        or last_assistant.get("_error") is True
    ):
        return None
    content = str(last_assistant.get("content") or "").strip()
    if not content:
        return None
    evidence = last_assistant.get("provider_evidence") or last_assistant.get("execution_evidence")
    if not isinstance(evidence, dict):
        return None
    if not (
        isinstance(evidence.get("provider_id"), str)
        and isinstance(evidence.get("model_id"), str)
        and evidence.get("successful_chat") is True
    ):
        return None
    provider = evidence["provider_id"].strip()
    model = evidence["model_id"].strip()
    if not provider or not model or model.lower() == "auto":
        return None
    turn_id = (
        last_assistant.get("turn_id")
        or last_assistant.get("stream_id")
        or last_assistant.get("_streamId")
    )
    return {
        "provider": provider,
        "model": model,
        "sessionId": expected_session_id,
        "turnId": turn_id,
        "source": "session_rehydration",
    }


def test_provider_evidence_calculation_and_gateway_routing():
    """Verify provider_evidence resolves correctly from result and gateway_routing."""
    # Direct provider & model
    direct_res = {
        "completed": True,
        "final_response": "Valid response",
        "provider": "openai",
        "model": "gpt-4o",
    }
    ev = _provider_evidence_from_result(direct_res)
    assert ev == {
        "provider_id": "openai",
        "model_id": "gpt-4o",
        "successful_chat": True,
        "runtime_generation": __import__("web.api.runtime_identity", fromlist=["RUNTIME_GENERATION"]).RUNTIME_GENERATION,
        "provider_config_generation": __import__("web.api.runtime_identity", fromlist=["provider_config_generation"]).provider_config_generation("openai"),
    }

    # Gateway routing fallback when model is 'auto'
    auto_res = {
        "completed": True,
        "final_response": "Resolved by router",
        "provider": "openrouter",
        "model": "auto",
    }
    gw = {"used_provider": "anthropic", "used_model": "claude-3-5-sonnet"}
    ev_gw = _provider_evidence_from_result(auto_res, gateway_routing=gw)
    assert ev_gw == {
        "provider_id": "anthropic",
        "model_id": "claude-3-5-sonnet",
        "successful_chat": True,
        "runtime_generation": __import__("web.api.runtime_identity", fromlist=["RUNTIME_GENERATION"]).RUNTIME_GENERATION,
        "provider_config_generation": __import__("web.api.runtime_identity", fromlist=["provider_config_generation"]).provider_config_generation("anthropic"),
    }

    # Unsuccessful chats do not get marked successful
    err_res = {
        "completed": False,
        "error": "Failed",
        "final_response": "",
        "provider": "openai",
        "model": "gpt-4o",
    }
    assert _provider_evidence_from_result(err_res)["successful_chat"] is False

    partial_res = {
        "completed": True,
        "partial": True,
        "final_response": "Partial text",
        "provider": "openai",
        "model": "gpt-4o",
    }
    assert _provider_evidence_from_result(partial_res)["successful_chat"] is False


def test_successful_turn_persists_evidence_and_rehydrates_consistently(tmp_path, monkeypatch):
    """Requirement 3.1: Turn success -> save -> reload -> identical execution evidence."""
    sessions_dir = tmp_path / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    set_session_dir(sessions_dir)

    session_id = "test_sess_001"
    session_file = sessions_dir / f"{session_id}.json"

    initial_data = {
        "session_id": session_id,
        "title": "Test Session",
        "workspace": str(tmp_path),
        "messages": [
            {"role": "user", "content": "What is the status?"}
        ],
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    session_file.write_text(json.dumps(initial_data, indent=2), encoding="utf-8")

    session = Session.load(session_id)
    assert session is not None

    stream_id = "stream_turn_1"
    channel = StreamChannel()
    sub_q = channel.subscribe()
    with STREAMS_LOCK:
        STREAMS[stream_id] = channel

    class MockAIAgent:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.session_prompt_tokens = 120
            self.session_completion_tokens = 45
            self.session_estimated_cost_usd = 0.002
            self.model = kwargs.get("model", "gpt-4o")
            self.provider = kwargs.get("provider", "openai")

        def run_conversation(self, **kwargs):
            return {
                "completed": True,
                "final_response": "All systems operational.",
                "provider": self.provider,
                "model": self.model,
                "messages": [
                    {"role": "user", "content": "What is the status?"},
                    {"role": "assistant", "content": "All systems operational."},
                ],
                "api_calls": 1,
                "interrupted": False,
                "partial": False,
            }

    monkeypatch.setattr(
        "web.api.oauth.resolve_runtime_provider_with_anthropic_env_lock",
        lambda resolver, **kwargs: {"api_key": "mock-key", "provider": kwargs.get("requested", "mock"), "base_url": None},
    )
    monkeypatch.setattr(streaming, "get_session", lambda _sid: session)
    monkeypatch.setattr(streaming, "register_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "update_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "unregister_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "append_turn_journal_event_for_stream", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "_get_session_agent_lock", lambda _sid: nullcontext())
    monkeypatch.setattr(streaming, "meter", lambda: SimpleNamespace(begin_session=lambda *_a: None, get_interval=lambda: 10.0, get_stats=lambda: {}))
    monkeypatch.setattr(streaming, "_get_ai_agent", lambda: MockAIAgent)

    try:
        streaming._run_agent_streaming(
            session_id,
            "What is the status?",
            "gpt-4o",
            str(tmp_path),
            stream_id,
            model_provider="openai",
        )

        # 1. Verify SSE done event payload
        events = []
        while not sub_q.empty():
            events.append(sub_q.get_nowait())

        done_events = [data for evt, data in events if evt == "done"]
        assert len(done_events) == 1
        done_payload = done_events[0]
        assert "provider_evidence" in done_payload
        sse_evidence = done_payload["provider_evidence"]
        assert sse_evidence == _expected_provider_evidence("openai", "gpt-4o")

        # 2. Verify Session persisted on disk
        raw_disk = json.loads(session_file.read_text(encoding="utf-8"))
        messages_disk = raw_disk["messages"]
        assert len(messages_disk) >= 2
        last_asst_disk = [m for m in messages_disk if m.get("role") == "assistant"][-1]

        # Exact turn-bound execution evidence on the assistant message itself:
        assert last_asst_disk.get("stream_id") == stream_id
        assert last_asst_disk.get("turn_id") == stream_id
        assert last_asst_disk.get("provider_evidence") == sse_evidence
        assert last_asst_disk.get("execution_evidence") == sse_evidence

        # 3. Verify Reload & Rehydration via Session.load()
        reloaded = Session.load(session_id)
        assert reloaded is not None
        last_asst_reloaded = [m for m in reloaded.messages if m.get("role") == "assistant"][-1]
        assert last_asst_reloaded.get("provider_evidence") == sse_evidence

        # 4. Verify Renderer Observed Decision recovery
        observed = simulate_read_observed_decision_from_session(reloaded.__dict__, session_id)
        assert observed is not None
        assert observed["provider"] == "openai"
        assert observed["model"] == "gpt-4o"
        assert observed["sessionId"] == session_id
        assert observed["turnId"] == stream_id
        assert observed["source"] == "session_rehydration"

    finally:
        with STREAMS_LOCK:
            STREAMS.pop(stream_id, None)


def test_two_different_models_in_successive_turns(tmp_path, monkeypatch):
    """Requirement 3.2: Two different models in successive turns (no backward corruption)."""
    sessions_dir = tmp_path / "sessions_two_turns"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    set_session_dir(sessions_dir)

    session_id = "test_sess_two_models"
    session_file = sessions_dir / f"{session_id}.json"

    initial_data = {
        "session_id": session_id,
        "title": "Two Turn Session",
        "workspace": str(tmp_path),
        "messages": [],
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    session_file.write_text(json.dumps(initial_data, indent=2), encoding="utf-8")
    session = Session.load(session_id)

    class MultiModelAgent:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.session_prompt_tokens = 50
            self.session_completion_tokens = 20
            self.session_estimated_cost_usd = 0.001
            self.model = kwargs.get("model", "gpt-4o")
            self.provider = kwargs.get("provider", "openai")

        def run_conversation(self, **kwargs):
            return {
                "completed": True,
                "final_response": f"Response from {self.model}",
                "provider": self.provider,
                "model": self.model,
                "messages": [
                    {"role": "user", "content": kwargs.get("user_message", "")},
                    {"role": "assistant", "content": f"Response from {self.model}"},
                ],
                "api_calls": 1,
                "interrupted": False,
                "partial": False,
            }

    monkeypatch.setattr(
        "web.api.oauth.resolve_runtime_provider_with_anthropic_env_lock",
        lambda resolver, **kwargs: {"api_key": "mock-key", "provider": kwargs.get("requested", "mock"), "base_url": None},
    )
    monkeypatch.setattr(streaming, "get_session", lambda _sid: Session.load(_sid))
    monkeypatch.setattr(streaming, "register_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "update_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "unregister_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "append_turn_journal_event_for_stream", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "_get_session_agent_lock", lambda _sid: nullcontext())
    monkeypatch.setattr(streaming, "meter", lambda: SimpleNamespace(begin_session=lambda *_a: None, get_interval=lambda: 10.0, get_stats=lambda: {}))
    monkeypatch.setattr(streaming, "_get_ai_agent", lambda: MultiModelAgent)

    # --- Turn 1: OpenAI gpt-4o ---
    stream_1 = "stream_turn_1"
    channel_1 = StreamChannel()
    sub_q_1 = channel_1.subscribe()
    with STREAMS_LOCK:
        STREAMS[stream_1] = channel_1

    streaming._run_agent_streaming(
        session_id,
        "Question 1",
        "gpt-4o",
        str(tmp_path),
        stream_1,
        model_provider="openai",
    )

    with STREAMS_LOCK:
        STREAMS.pop(stream_1, None)

    # Verify Turn 1 state
    reloaded_t1 = Session.load(session_id)
    assert len(reloaded_t1.messages) >= 2
    asst_1 = [m for m in reloaded_t1.messages if m.get("role") == "assistant"][-1]
    assert asst_1["turn_id"] == stream_1
    assert asst_1["provider_evidence"]["provider_id"] == "openai"
    assert asst_1["provider_evidence"]["model_id"] == "gpt-4o"

    # --- Turn 2: Anthropic claude-3-5-sonnet ---
    stream_2 = "stream_turn_2"
    channel_2 = StreamChannel()
    sub_q_2 = channel_2.subscribe()
    with STREAMS_LOCK:
        STREAMS[stream_2] = channel_2

    streaming._run_agent_streaming(
        session_id,
        "Question 2",
        "claude-3-5-sonnet",
        str(tmp_path),
        stream_2,
        model_provider="anthropic",
    )

    with STREAMS_LOCK:
        STREAMS.pop(stream_2, None)

    # Reload and verify BOTH turns
    reloaded_t2 = Session.load(session_id)
    assistants = [m for m in reloaded_t2.messages if m.get("role") == "assistant"]
    assert len(assistants) == 2

    # First assistant message retains Turn 1 evidence completely untouched:
    assert assistants[0]["turn_id"] == stream_1
    assert assistants[0]["provider_evidence"] == _expected_provider_evidence("openai", "gpt-4o")

    # Second assistant message has Turn 2 evidence:
    assert assistants[1]["turn_id"] == stream_2
    assert assistants[1]["provider_evidence"] == _expected_provider_evidence("anthropic", "claude-3-5-sonnet")


def test_aborted_or_failed_turn_does_not_persist_false_success_evidence(tmp_path, monkeypatch):
    """Requirement 3.3: Abort/error without false positive success evidence."""
    sessions_dir = tmp_path / "sessions_cancel"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    set_session_dir(sessions_dir)

    session_id = "test_sess_cancel"
    session_file = sessions_dir / f"{session_id}.json"

    initial_data = {
        "session_id": session_id,
        "title": "Cancel Session",
        "workspace": str(tmp_path),
        "messages": [
            {"role": "user", "content": "Execute long running task"}
        ],
        "active_stream_id": "stream_cancelled",
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    session_file.write_text(json.dumps(initial_data, indent=2), encoding="utf-8")
    session = Session.load(session_id)

    stream_id = "stream_cancelled"
    channel = StreamChannel()
    cancel_flag = threading.Event()

    mock_agent = Mock()
    mock_agent.session_id = session_id
    mock_agent.interrupt = Mock()

    with STREAMS_LOCK:
        STREAMS[stream_id] = channel
        CANCEL_FLAGS[stream_id] = cancel_flag
        AGENT_INSTANCES[stream_id] = mock_agent
        STREAM_PARTIAL_TEXT[stream_id] = "Partial output before stopping"

    monkeypatch.setattr(streaming, "get_session", lambda _sid: session)

    # Cancel the stream
    res = cancel_stream(stream_id)
    assert res is True
    assert cancel_flag.is_set()
    mock_agent.interrupt.assert_called_once()

    # Re-read session from disk
    reloaded = Session.load(session_id)
    assert reloaded is not None

    # Verify that cancel messages do NOT have positive provider_evidence
    for msg in reloaded.messages:
        if msg.get("role") == "assistant":
            # Must either be _partial: True or _error: True
            assert msg.get("_partial") is True or msg.get("_error") is True
            # Must NOT have successful_chat: True
            ev = msg.get("provider_evidence")
            if ev:
                assert ev.get("successful_chat") is not True

    # Renderer observed decision recovery must return None (decision unknown / in-flight / cancelled)
    observed = simulate_read_observed_decision_from_session(reloaded.__dict__, session_id)
    assert observed is None


def test_two_backend_profiles_full_isolation_without_cross_contamination(tmp_path):
    """Requirement 3.4: Two backend profiles without cross-contamination."""
    profile_alpha_home = tmp_path / "profiles" / "alpha"
    profile_beta_home = tmp_path / "profiles" / "beta"

    alpha_sessions = profile_alpha_home / "sessions"
    beta_sessions = profile_beta_home / "sessions"
    alpha_sessions.mkdir(parents=True, exist_ok=True)
    beta_sessions.mkdir(parents=True, exist_ok=True)

    # Write distinct session files in each profile's session directory
    sess_alpha_file = alpha_sessions / "alpha_sess.json"
    sess_alpha_file.write_text(json.dumps({
        "session_id": "alpha_sess",
        "profile": "alpha",
        "messages": [
            {"role": "user", "content": "Alpha task"},
            {
                "role": "assistant",
                "content": "Alpha response",
                "provider_evidence": {"provider_id": "custom:alpha", "model_id": "alpha-v1", "successful_chat": True},
                "turn_id": "stream-alpha",
            }
        ]
    }), encoding="utf-8")

    sess_beta_file = beta_sessions / "beta_sess.json"
    sess_beta_file.write_text(json.dumps({
        "session_id": "beta_sess",
        "profile": "beta",
        "messages": [
            {"role": "user", "content": "Beta task"},
            {
                "role": "assistant",
                "content": "Beta response",
                "provider_evidence": {"provider_id": "custom:beta", "model_id": "beta-v2", "successful_chat": True},
                "turn_id": "stream-beta",
            }
        ]
    }), encoding="utf-8")

    # When active session dir is Alpha
    set_session_dir(alpha_sessions)
    loaded_alpha = Session.load("alpha_sess")
    assert loaded_alpha is not None
    assert loaded_alpha.messages[1]["provider_evidence"]["model_id"] == "alpha-v1"

    # Beta session cannot be loaded from Alpha dir
    loaded_cross = Session.load("beta_sess")
    assert loaded_cross is None

    # When active session dir is Beta
    set_session_dir(beta_sessions)
    loaded_beta = Session.load("beta_sess")
    assert loaded_beta is not None
    assert loaded_beta.messages[1]["provider_evidence"]["model_id"] == "beta-v2"

    # Alpha session cannot be loaded from Beta dir
    loaded_cross_reverse = Session.load("alpha_sess")
    assert loaded_cross_reverse is None


def test_cancel_stream_after_profile_switch_targets_only_original_stream():
    """Requirement 3.5: Cancelling an old stream after UI profile switch targets its original profile."""
    stream_alpha = "stream-alpha-background"
    stream_beta = "stream-beta-active"

    flag_alpha = threading.Event()
    flag_beta = threading.Event()

    chan_alpha = StreamChannel()
    chan_beta = StreamChannel()

    agent_alpha = Mock()
    agent_beta = Mock()

    with STREAMS_LOCK:
        STREAMS[stream_alpha] = chan_alpha
        STREAMS[stream_beta] = chan_beta
        CANCEL_FLAGS[stream_alpha] = flag_alpha
        CANCEL_FLAGS[stream_beta] = flag_beta
        AGENT_INSTANCES[stream_alpha] = agent_alpha
        AGENT_INSTANCES[stream_beta] = agent_beta

    try:
        # User in UI has switched to Beta, but decides to cancel Alpha's stream
        cancelled = cancel_stream(stream_alpha)
        assert cancelled is True

        # Alpha is cancelled
        assert flag_alpha.is_set()
        agent_alpha.interrupt.assert_called_once()
        with STREAMS_LOCK:
            assert stream_alpha not in STREAMS

        # Beta remains completely active and untouched
        assert not flag_beta.is_set()
        agent_beta.interrupt.assert_not_called()
        with STREAMS_LOCK:
            assert stream_beta in STREAMS
            assert CANCEL_FLAGS[stream_beta] is flag_beta

    finally:
        with STREAMS_LOCK:
            STREAMS.pop(stream_alpha, None)
            STREAMS.pop(stream_beta, None)
            CANCEL_FLAGS.pop(stream_alpha, None)
            CANCEL_FLAGS.pop(stream_beta, None)
            AGENT_INSTANCES.pop(stream_alpha, None)
            AGENT_INSTANCES.pop(stream_beta, None)

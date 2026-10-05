import json
from types import SimpleNamespace

import pytest

from web.api import config, native_chats
from web.api.config import StreamChannel
from runtime.independent.contracts import Scope


class _Scope:
    key = "local-short-chat-test-scope"

    def model_dump(self, *, mode, by_alias):
        return {"backendProfileId": "backend-test", "spaceId": "space-test"}


def _run(tmp_path, monkeypatch, *, outcome="success", cleanup_fails=False):
    scope = _Scope()
    context = SimpleNamespace(
        scope=scope, profile_name="default", profile_home=str(tmp_path),
        sessions_dir=str(tmp_path), session_id="session_test", stream_id="stream_test",
        writer_generation="generation-test", workspace=str(tmp_path),
    )
    saved = {
        "session_id": context.session_id, "profile": context.profile_name,
        "space_scope": scope.model_dump(mode="json", by_alias=True),
        "active_stream_id": context.stream_id, "pending_user_message": "What is 2 + 2?",
        "pending_attachments": [], "pending_started_at": 1, "messages": [],
    }
    (tmp_path / "session_test.json").write_text(json.dumps(saved), encoding="utf-8")
    monkeypatch.setattr("runtime.independent.native_chat_protocol.verify_native_context", lambda *a, **k: True)
    if cleanup_fails:
        monkeypatch.setattr(native_chats, "_cleanup_saved_pending",
            lambda *a, **k: (_ for _ in ()).throw(OSError("fixture storage failure")))
    channel = StreamChannel()
    events = channel.subscribe()
    with config.STREAMS_LOCK:
        config.STREAMS[context.stream_id] = channel

    class Host:
        def execute_native_short_chat(self, _context, _prompt, *, cancel):
            if outcome == "failure":
                raise RuntimeError("fixture_failure")
            if outcome == "cancel":
                cancel.set()
                raise RuntimeError("local_short_chat_cancelled")
            return {"text": "4", "profileRevision": "profile-r1", "artifactId": "model-350m",
                "artifactRevision": "revision-1", "adapterRef": "adapter-chat-v1",
                "qualityEvidenceRef": "quality-proof-1", "memoryEvidenceRef": "memory-proof-1",
                "limits": {"contextTokens": 1024, "maxOutputTokens": 48}}

    decision = {"decisionId": "decision-test", "artifactId": "model-350m"}
    native_chats.run_native_local_short_chat(context, (context.session_id, "What is 2 + 2?", "auto", str(tmp_path), context.stream_id, []),
        {}, host=Host(), decision=decision)
    recorded = []
    while not events.empty():
        recorded.append(events.get_nowait())
    persisted = json.loads((tmp_path / "session_test.json").read_text(encoding="utf-8"))
    with native_chats._lock:
        native_chats._settled.pop(context.stream_id, None)
        native_chats._terminal_pending.pop(context.stream_id, None)
    return context, recorded, persisted


def test_native_local_short_chat_persists_authoritative_evidence_and_turn_identity(tmp_path, monkeypatch):
    context, events, persisted = _run(tmp_path, monkeypatch)
    assistant = next(message for message in persisted["messages"] if message["role"] == "assistant")
    evidence = {"provider_id": "local-ai", "model_id": "model-350m", "successful_chat": True}
    done = next(data for event, data in events if event == "done")
    assert done["provider_evidence"] == evidence
    assert done["stream_id"] == done["turn_id"] == context.stream_id
    assert assistant["provider_evidence"] == assistant["execution_evidence"] == evidence
    assert assistant["stream_id"] == assistant["turn_id"] == context.stream_id
    assert persisted["active_stream_id"] is None and persisted["pending_user_message"] is None
    assert [message["content"] for message in persisted["messages"]] == ["What is 2 + 2?", "4"]


@pytest.mark.parametrize("outcome,terminal", [("failure", "error"), ("cancel", "cancel")])
def test_native_local_short_chat_failure_or_cancel_clears_pending_without_success(tmp_path, monkeypatch, outcome, terminal):
    _, events, persisted = _run(tmp_path, monkeypatch, outcome=outcome)
    assert any(event == terminal for event, _ in events)
    assert not any(event == "done" for event, _ in events)
    assert persisted["active_stream_id"] is None and persisted["pending_user_message"] is None
    assert [message["role"] for message in persisted["messages"]] == ["user"]


def test_native_local_short_chat_unconfirmed_cleanup_keeps_native_writer_unsettled(tmp_path, monkeypatch):
    context, events, persisted = _run(tmp_path, monkeypatch, cleanup_fails=True)
    try:
        assert not native_chats.native_chat_exit_confirmed(context)
        assert persisted["active_stream_id"] == context.stream_id
        assert any(event == "error" and data.get("error_code") == "native_chat_cleanup_unconfirmed"
            for event, data in events)
        assert not any(event == "done" for event, _ in events)
    finally:
        with native_chats._lock:
            native_chats._active.pop(context.stream_id, None)
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id, None)
            config.CANCEL_FLAGS.pop(context.stream_id, None)
        config.unregister_active_run(context.stream_id)


def test_native_local_short_chat_rejects_cancel_after_completion_is_committed(tmp_path):
    scope = Scope(backend_profile_id="0d50b982-4c57-4d17-95bf-4e2f11399454",
        space_id="a9a3dc7f-9e1c-4af9-8fe1-9f33d57ced39", browser_profile_id="browser-test")
    context = SimpleNamespace(scope=scope, profile_name="default", session_id="session_test",
        stream_id="stream_committed", writer_generation="generation-test", workspace=str(tmp_path))
    entry = native_chats._Entry(context, completion_committed=True)
    entry.handle = native_chats._LocalShortChatHandle(entry)
    with native_chats._lock:
        native_chats._active[context.stream_id] = entry
    try:
        assert not native_chats.control_native_chat(context.session_id, context.stream_id,
            actor=context.profile_name, scope=scope, command="cancel")
        assert not entry.cancelled.is_set()
    finally:
        with native_chats._lock:
            native_chats._active.pop(context.stream_id, None)

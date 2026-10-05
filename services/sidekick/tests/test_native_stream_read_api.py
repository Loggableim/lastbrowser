import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from test_native_chat_process import fixture_context
from runtime.independent.contracts import new_id
from web.api import native_chats


@pytest.fixture
def native_read(tmp_path, monkeypatch):
    from web.api import independent, profiles, routes
    from runtime.independent.scope_binding import ProfileHub
    context, store = fixture_context(tmp_path, "a")
    raw = json.loads((Path(context.sessions_dir) / (context.session_id + ".json")).read_text("utf-8"))
    session = SimpleNamespace(**raw)
    profile_hub = ProfileHub(tmp_path / "base", default_state_dir=tmp_path / "state")
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "a")
    token = "bridge-" + new_id()
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", token)
    monkeypatch.setattr(independent, "hub", lambda: profile_hub)
    entry = native_chats.register_native_chat(context)
    yield routes, context, session, store, token, entry
    native_chats._active.pop(context.stream_id, None)
    profile_hub.close()
    store.close()


def test_read_context_requires_exact_private_header_and_scope(native_read):
    routes, context, session, _, token, _ = native_read
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": token})
    value = routes._native_stream_read_context(handler, context.stream_id, session_id=context.session_id, scope=context.scope.model_dump(by_alias=True))
    assert value["nativeChat"] and value["processExited"] is False
    with pytest.raises(PermissionError):
        routes._native_stream_read_context(SimpleNamespace(headers={}), context.stream_id, session_id=context.session_id, scope=context.scope.model_dump(by_alias=True))
    foreign = context.scope.model_copy(update={"browser_profile_id": "foreign"}).model_dump(by_alias=True)
    with pytest.raises(PermissionError):
        routes._native_stream_read_context(handler, context.stream_id, session_id=context.session_id, scope=foreign)


def test_read_context_rejects_unknown_stream_and_foreign_actor(native_read, monkeypatch):
    routes, context, session, _, token, _ = native_read
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": token})
    with pytest.raises(KeyError):
        routes._native_stream_read_context(handler, "unknown-stream", session_id=context.session_id, scope=context.scope.model_dump(by_alias=True))
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr("web.api.profiles.get_active_profile_name", lambda: "foreign")
    with pytest.raises(PermissionError):
        routes._native_stream_read_context(handler, context.stream_id, session_id=context.session_id, scope=context.scope.model_dump(by_alias=True))


def test_read_context_handler_accepts_only_exact_body_and_serializes_schema(native_read, monkeypatch):
    routes, context, _, _, token, _ = native_read
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": token})
    captured = {}
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200: captured.update(payload=payload, status=status) or captured)
    monkeypatch.setattr(routes, "bad", lambda _handler, message, status=400: {"message": message, "status": status})
    body = {"session_id": context.session_id, "stream_id": context.stream_id,
            "space_scope": context.scope.model_dump(mode="json", by_alias=True)}
    result = routes._handle_native_chat_read_context(handler, body)
    assert result["status"] == 200
    assert set(result["payload"]) == {"schemaVersion", "nativeChat", "scope", "sessionId",
                                       "streamId", "profileName", "writerGeneration", "processExited"}
    bad = routes._handle_native_chat_read_context(handler, {**body, "extra": True})
    assert bad["status"] == 400

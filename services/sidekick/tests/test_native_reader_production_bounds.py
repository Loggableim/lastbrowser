import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from runtime.independent.contracts import new_id
from test_native_chat_process import fixture_context


@pytest.fixture
def reader(tmp_path, monkeypatch):
    from runtime.independent.scope_binding import ProfileHub
    from web.api import independent, native_chats, profiles, routes
    context, store = fixture_context(tmp_path, "a")
    hub = ProfileHub(tmp_path / "base", default_state_dir=tmp_path / "state")
    raw = json.loads((Path(context.sessions_dir) / f"{context.session_id}.json").read_text("utf-8"))
    session = SimpleNamespace(**raw)
    token = "reader-" + new_id()
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", token)
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "a")
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    native_chats.register_native_chat(context)
    yield routes, native_chats, context, session, store, hub, token
    native_chats._active.pop(context.stream_id, None)
    hub.close(); store.close()


def _handler(token):
    return SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": token})


def test_reader_returns_saved_native_context_with_large_transcript_fields(reader):
    routes, _, context, session, _, _, token = reader
    session.pending_user_message = "p" * 70000
    session.grill_state = {"objective": "g" * 70000}
    scope = context.scope.model_dump(mode="json", by_alias=True)
    value = routes._native_stream_read_context(_handler(token), context.stream_id,
        session_id=context.session_id, scope=scope)
    assert value["nativeChat"] is True and value["processExited"] is False


def test_reader_rejects_foreign_scope_and_foreign_actor_before_saved_context(reader, monkeypatch):
    routes, _, context, _, _, _, token = reader
    scope = context.scope.model_dump(mode="json", by_alias=True)
    foreign = {**scope, "browserProfileId": "foreign"}
    with pytest.raises(PermissionError):
        routes._native_stream_read_context(_handler(token), context.stream_id,
            session_id=context.session_id, scope=foreign)
    monkeypatch.setattr("web.api.profiles.get_active_profile_name", lambda: "foreign")
    with pytest.raises(PermissionError):
        routes._native_stream_read_context(_handler(token), context.stream_id,
            session_id=context.session_id, scope=scope)


def test_reader_unknown_stream_is_not_ambient_or_pending_fallback(reader):
    routes, _, context, _, _, _, token = reader
    with pytest.raises(KeyError):
        routes._native_stream_read_context(_handler(token), "unknown-stream",
            session_id=context.session_id, scope=context.scope.model_dump(mode="json", by_alias=True))

"""Parent stream registry plus actual native Session JSON, without UI lifetimes."""
from types import SimpleNamespace

from runtime.independent.contracts import ActivitySnapshot, Scope, new_id, utc_now
from runtime.independent.native_activity import observe_native_activity


def test_real_session_metadata_tracks_actual_parent_stream_and_fixed_owner(tmp_path, monkeypatch):
    from pathlib import Path
    from web.api import models, config, independent
    from runtime.independent.scope_binding import ProfileHub
    from test_native_chat_process import fixture_context
    context, store = fixture_context(tmp_path, "a")
    scope = context.scope
    hub = ProfileHub(tmp_path / "base", default_state_dir=tmp_path / "state")
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(config, "STREAMS", {context.stream_id: object()})
    try:
        session = models.Session(session_id=context.session_id, profile=context.profile_name, title="Actual native chat",
            workspace=context.workspace, model="model-a", model_provider="custom", active_stream_id=context.stream_id,
            space_scope=scope.model_dump(by_alias=True))
        session.messages = [{"role": "user", "content": "Private history must not enter status"}]
        session.save(skip_index=True)
        assert session.path == Path(context.sessions_dir) / (context.session_id + ".json")
        resolved = hub.by_scope(scope, context.profile_name)[1].resolve(scope,
            authenticated_profile_name=context.profile_name)
        base = ActivitySnapshot(scope=scope, observed_at=utc_now(), watermark=0)
        value = observe_native_activity(resolved, base)
        assert len(value.active_chats) == 1 and value.active_chats[0]["title"] == session.title
        assert "Private history" not in value.model_dump_json()
        assert value.native_chat_observation.source_state == "live"
        other = scope.model_copy(update={"browser_profile_id": "browser-b"})
        foreign = SimpleNamespace(scope=other, profile=resolved.profile, space=resolved.space)
        assert not observe_native_activity(foreign, base.model_copy(update={"scope": other})).active_chats
        monkeypatch.setattr(config, "STREAMS", {})
        assert not observe_native_activity(resolved, base).active_chats
        # A persisted stream ID after a crash is not evidence of active work.
        assert session.active_stream_id == context.stream_id
    finally:
        store.close()
        hub.close()


def test_actual_ia_row_is_retained_without_native_duplicate(tmp_path, monkeypatch):
    from web.api import config
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="browser")
    monkeypatch.setattr(config, "STREAMS", {})
    snapshot = ActivitySnapshot(scope=scope, observed_at=utc_now(), watermark=0,
        active_chats=({"sessionId": "ia_actual", "state": "running"},))
    actual = observe_native_activity(SimpleNamespace(scope=scope, profile=SimpleNamespace(name="default"),
        space=SimpleNamespace(sessions_dir=tmp_path / "missing")), snapshot)
    assert actual.active_chats == snapshot.active_chats
    assert actual.native_chat_observation.source_state == "live"

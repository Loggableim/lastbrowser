import json
from pathlib import Path
from types import SimpleNamespace

from runtime.independent.contracts import new_id
from test_native_chat_process import fixture_context


def test_native_cancel_control_response_never_leaks_saved_or_bridge_tokens(tmp_path, monkeypatch):
    from runtime.independent.scope_binding import ProfileHub
    from web.api import independent, native_chats, profiles, routes
    context, store = fixture_context(tmp_path, "a")
    hub = ProfileHub(tmp_path / "base", default_state_dir=tmp_path / "state")
    session = SimpleNamespace(**json.loads((Path(context.sessions_dir) / f"{context.session_id}.json").read_text()))
    bridge = "bridge-" + new_id()
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", bridge)
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "a")
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    native_chats.register_native_chat(context)
    try:
        handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": bridge})
        captured = {}
        monkeypatch.setattr(routes, "j", lambda _h, payload, status=200: captured.update(payload=payload, status=status) or captured)
        result = routes._handle_native_chat_control(handler, {
            "session_id": context.session_id, "stream_id": context.stream_id,
            "space_scope": context.scope.model_dump(mode="json", by_alias=True),
            "command": "cancel", "request_id": "cancel-actual"})
        assert result["status"] == 200
        serialized = json.dumps(result["payload"], sort_keys=True)
        assert bridge not in serialized and "CUSTOM_API_KEY" not in serialized
        assert set(result["payload"]) == {"schemaVersion", "scope", "sessionId", "streamId", "accepted", "state"}
    finally:
        native_chats._active.pop(context.stream_id, None)
        hub.close(); store.close()

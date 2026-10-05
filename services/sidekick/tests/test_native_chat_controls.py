import json
from types import SimpleNamespace

import pytest

from runtime.chat_modes import ChatModeConflict, capture_policy
from runtime.independent.child_contracts import ChildParentContext, ChildRunContext
from runtime.independent.scope import ScopeError
from runtime.independent.scope_binding import ProfileHub
from web.api.chat_modes import change_chat_mode, read_chat_mode
from web.api.child_streams import child_history
from web.api.subagent_history import emit_child_event


@pytest.fixture
def native(tmp_path):
    home, state, workspace = tmp_path / "home", tmp_path / "state", tmp_path / "workspace"
    home.mkdir(); state.mkdir(); workspace.mkdir()
    (state / "workspaces.json").write_text(json.dumps([{"path": str(workspace), "name": "workspace"}]), encoding="utf-8")
    hub = ProfileHub(home, default_state_dir=state)
    scope = hub.bind("default", {"workspacePath": str(workspace), "browserProfileId": "browser", "partitionKey": "persist:chat"})["scope"]
    from runtime.independent.contracts import Scope
    scope = Scope.model_validate(scope)
    session = SimpleNamespace(session_id="parent-session", profile="default", workspace=str(workspace),
                              space_scope=scope.model_dump(by_alias=True), chat_execution_mode=None,
                              chat_mode_requests=None, child_parent_turns=["turn-1"], independent=None,
                              save=lambda **_: None)
    yield hub, scope, workspace, session
    from web.api import independent
    with independent._LOCK:
        pairs = tuple(independent._services.values())
        independent._services.clear()
    for manager, _assistant in pairs:
        try:
            manager.shutdown()
        except Exception:
            pass
    hub.close()


def body(scope, **changes):
    return {"space_scope": scope.model_dump(by_alias=True), "client_request_id": "mode-request-1",
            "mode": "plan", "lifetime": "chat", "expected_revision": 0, **changes}


def test_mode_get_set_cas_replay_and_next_turn(native):
    hub, scope, _, session = native
    assert read_chat_mode(session, scope.model_dump(by_alias=True), actor="default", profile_hub=hub)["mode"]["mode"] == "action"
    first = change_chat_mode(session, body(scope, lifetime="next_turn"), actor="default", profile_hub=hub)
    assert first["mode"]["revision"] == 1
    assert change_chat_mode(session, body(scope, lifetime="next_turn"), actor="default", profile_hub=hub)["replayed"]
    with pytest.raises(ChatModeConflict):
        change_chat_mode(session, body(scope, mode="boost", expected_revision=0, client_request_id="mode-request-2"), actor="default", profile_hub=hub)


def test_mode_rejects_foreign_scope_and_writer_lease(native):
    from runtime.independent.store import ResourceBusy
    hub, scope, _, session = native
    foreign = scope.model_copy(update={"browser_profile_id": "foreign"})
    with pytest.raises(ScopeError):
        read_chat_mode(session, foreign.model_dump(by_alias=True), actor="default", profile_hub=hub)
    store, _ = hub.by_scope(scope, "default")
    lease = store.acquire_chat_writer(scope, session.session_id, "existing", "generation")
    try:
        with pytest.raises(ResourceBusy):
            change_chat_mode(session, body(scope), actor="default", profile_hub=hub)
    finally:
        store.release_lease(lease["leaseId"], owner_generation="generation")


def test_next_turn_policy_is_captured_before_persisted_consumption():
    policy, persisted = capture_policy({"schemaVersion": 1, "mode": "boost", "lifetime": "next_turn", "revision": 9})
    assert policy.mode == "boost" and policy.revision == 9
    assert persisted["mode"] == "action" and persisted["revision"] == 10


def test_child_history_rejects_foreign_turn_and_invalid_cursors(native):
    hub, scope, _, session = native
    with pytest.raises(PermissionError):
        child_history(session, {"space_scope": scope.model_dump(by_alias=True), "parent_turn_id": "other"}, actor="default", profile_hub=hub)
    with pytest.raises(ValueError):
        child_history(session, {"space_scope": scope.model_dump(by_alias=True), "after_sequence": {"run": -1}}, actor="default", profile_hub=hub)
    with pytest.raises(ValueError):
        child_history(session, {"space_scope": scope.model_dump(by_alias=True), "after_sequence": {"run": True}}, actor="default", profile_hub=hub)


def test_child_history_recovers_actual_persisted_events(native):
    hub, scope, workspace, session = native
    store, resolver = hub.by_scope(scope, "default")
    resolved = resolver.resolve(scope, authenticated_profile_name="default")
    parent = ChildParentContext(scope, resolved.profile_home, "default", resolved.space.sessions_dir, session.session_id, "turn-1")
    child = ChildRunContext(parent, "child-1", "child-session-1", 1, "controlled-model", "controlled-provider")
    assert emit_child_event(child, event_type="started", payload={"status": "running"})
    assert emit_child_event(child, event_type="answer_delta", payload={"delta": "actual child output"})
    result = child_history(session, {"space_scope": scope.model_dump(by_alias=True), "parent_turn_id": "turn-1"}, actor="default", profile_hub=hub)
    assert result["parentTurns"] == ["turn-1"]
    assert result["runs"][0]["subagentId"] == "child-1"
    assert any(event["kind"] == "answer_delta" for event in result["events"])


def test_child_identity_and_scope_are_bound(native):
    hub, scope, workspace, session = native
    store, resolver = hub.by_scope(scope, "default")
    resolved = resolver.resolve(scope, authenticated_profile_name="default")
    parent = ChildParentContext(scope, resolved.profile_home, "default", resolved.space.sessions_dir, session.session_id, "turn-1")
    child = ChildRunContext(parent, "child-2", "child-session-2", 1, "model", "provider")
    emit_child_event(child, event_type="started", payload={"status": "running"})
    foreign = scope.model_copy(update={"browser_profile_id": "other"})
    with pytest.raises(ScopeError):
        child_history(session, {"space_scope": foreign.model_dump(by_alias=True)}, actor="default", profile_hub=hub)


def test_route_native_header_is_required_before_control_dispatch(monkeypatch):
    from runtime.independent import chat_binding
    from web.api import independent
    handler = SimpleNamespace(headers={})
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", "bridge-token")
    monkeypatch.setattr(independent, "hub", lambda: hub)
    with pytest.raises(ScopeError):
        chat_binding.require_native_scope_header(handler, {"backendProfileId": "p", "spaceId": "s", "browserProfileId": "b"})
    handler.headers["X-Lastbrowser-Bridge-Token"] = "bridge-token"
    chat_binding.require_native_scope_header(handler, {"backendProfileId": "p", "spaceId": "s", "browserProfileId": "b"})


def test_route_mode_serializes_real_get_set_and_rejects_missing_header(native, monkeypatch):
    from web.api import independent, profiles, routes
    hub, scope, _, session = native
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200: (payload, status))
    monkeypatch.setattr(routes, "bad", lambda _handler, message, status=400: ({"error": message}, status))
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    session.compact = lambda include_runtime=False: {"session_id": session.session_id}
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", "bridge-token")
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    missing = routes._handle_chat_mode(SimpleNamespace(headers={}), {"session_id": session.session_id, "action": "get", "space_scope": scope.model_dump(by_alias=True)})
    assert missing[1] == 409
    assert session.chat_execution_mode is None
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": "bridge-token"})
    result = routes._handle_chat_mode(handler, {"session_id": session.session_id, "action": "set", "space_scope": scope.model_dump(by_alias=True), "mode": "plan", "lifetime": "chat", "expected_revision": 0, "client_request_id": "route-request-1"})
    assert result[1] == 200 and result[0]["mode"]["mode"] == "plan"
    assert len(session.chat_mode_requests) == 1


def test_route_child_history_serializes_real_recovery_and_rejects_foreign_scope(native, monkeypatch):
    from runtime.independent.child_contracts import ChildParentContext, ChildRunContext
    from web.api.subagent_history import emit_child_event
    from web.api import independent, profiles, routes
    hub, scope, _, session = native
    store, resolver = hub.by_scope(scope, "default")
    resolved = resolver.resolve(scope, authenticated_profile_name="default")
    parent = ChildParentContext(scope, resolved.profile_home, "default", resolved.space.sessions_dir, session.session_id, "turn-1")
    emit_child_event(ChildRunContext(parent, "route-child", "route-child-session", 1, "model", "provider"), event_type="started", payload={"status": "running"})
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200: (payload, status))
    monkeypatch.setattr(routes, "bad", lambda _handler, message, status=400: ({"error": message}, status))
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", "bridge-token")
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": "bridge-token"})
    result = routes._handle_child_history(handler, {"session_id": session.session_id, "space_scope": scope.model_dump(by_alias=True), "parent_turn_id": "turn-1"})
    assert result[1] == 200 and result[0]["runs"][0]["subagentId"] == "route-child"
    foreign = scope.model_copy(update={"browser_profile_id": "foreign"})
    denied = routes._handle_child_history(handler, {"session_id": session.session_id, "space_scope": foreign.model_dump(by_alias=True)})
    assert denied[1] == 409


def test_route_goal_native_header_and_scope_fail_before_goal_payload(native, monkeypatch):
    from web.api import independent, profiles, routes
    hub, scope, _, session = native
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200: (payload, status))
    monkeypatch.setattr(routes, "bad", lambda _handler, message, status=400: ({"error": message}, status))
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", "bridge-token")
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    body = {"session_id": session.session_id, "args": "continue", "space_scope": scope.model_dump(by_alias=True), "expected_revision": 0, "client_request_id": "goal-request-1"}
    assert routes._handle_goal_command(SimpleNamespace(headers={}), body)[1] == 409
    foreign = scope.model_copy(update={"browser_profile_id": "foreign"})
    assert routes._handle_goal_command(SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": "bridge-token"}), {**body, "space_scope": foreign.model_dump(by_alias=True)})[1] == 409


def test_model_policy_request_contract_fails_closed_before_service(native):
    from web.api.model_policy import handle_model_policy
    hub, scope, _, session = native
    with pytest.raises(ValueError):
        handle_model_policy(session, {"action": "get", "space_scope": scope.model_dump(by_alias=True), "unknown": True}, actor="default", profile_hub=hub)
    with pytest.raises(ValueError):
        handle_model_policy(session, {"action": "set", "space_scope": scope.model_dump(by_alias=True), "draft": {}}, actor="default", profile_hub=hub)


def test_native_control_registry_rejects_foreign_scope_and_forwards_stop(native):
    from web.api import native_chats
    hub, scope, _, session = native
    context = SimpleNamespace(session_id=session.session_id, stream_id="stream-control", profile_name="default", scope=scope)
    entry = native_chats.register_native_chat(context)
    sent = []
    entry.handle = SimpleNamespace(is_alive=True, send_control=lambda *args, **kwargs: sent.append((args, kwargs)))
    try:
        foreign = scope.model_copy(update={"browser_profile_id": "foreign"})
        with pytest.raises(ScopeError):
            native_chats.control_native_chat(session.session_id, "stream-control", actor="default", scope=foreign, command="cancel")
        assert native_chats.control_native_chat(session.session_id, "stream-control", actor="default", scope=scope, command="cancel") is True
        assert sent and sent[-1][0][0] == "cancel"
    finally:
        native_chats._active.pop("stream-control", None)


def test_native_control_requires_actual_pending_request_and_rejects_parent_stream(native):
    from web.api import native_chats
    hub, scope, _, session = native
    context = SimpleNamespace(session_id=session.session_id, stream_id="stream-control-2", profile_name="default", scope=scope)
    entry = native_chats.register_native_chat(context)
    entry.handle = SimpleNamespace(is_alive=True, send_control=lambda *args, **kwargs: None)
    try:
        assert native_chats.control_native_chat(session.session_id, "stream-control-2", actor="default", scope=scope, command="approval", request_id="missing", choice="once") is False
        entry.pending["approval-1"] = {"type": "approval", "requestId": "approval-1",
                                        "scope": scope.model_dump(mode="json", by_alias=True),
                                        "sessionId": session.session_id, "streamId": "stream-control-2",
                                        "writerGeneration": "generation", "data": {"description": "confirm"}}
        assert native_chats.control_native_chat(session.session_id, "stream-control-2", actor="default", scope=scope, command="approval", request_id="approval-1", choice="once") is True
        with pytest.raises(ValueError):
            native_chats.control_native_chat(session.session_id, "stream-control-2", actor="default", scope=scope, command="unknown")
    finally:
        native_chats._active.pop("stream-control-2", None)


def test_root_model_policy_route_real_get_set_replay_and_cas(tmp_path, monkeypatch):
    from test_native_model_policy_api import setup as policy_setup
    from web.api import independent, profiles, routes
    from runtime.independent.contracts import new_id
    scope, session, path, hub, manager, store = policy_setup(tmp_path, monkeypatch)
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200: (payload, status))
    monkeypatch.setattr(routes, "bad", lambda _handler, message, status=400: ({"error": message}, status))
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", "bridge-token")
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "research")
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": "bridge-token"})
    try:
        before = path.read_bytes()
        got = routes._handle_model_policy(handler, {"session_id": session.session_id, "space_scope": session.space_scope, "action": "get"})
        assert got[1] == 200 and got[0]["policy"]["revision"] == 0 and got[0]["executionAvailability"]["available"] is False
        assert path.read_bytes() == before
        request = {"session_id": session.session_id, "space_scope": session.space_scope, "action": "set", "draft": {"mode": "fixed", "allowedModels": []}, "expectedRevision": 0, "clientRequestId": new_id()}
        saved = routes._handle_model_policy(handler, request)
        replay = routes._handle_model_policy(handler, request)
        assert saved[1] == 200 and saved[0]["policy"]["revision"] == 1 and replay[0]["policy"] == saved[0]["policy"]
        stale = routes._handle_model_policy(handler, {**request, "expectedRevision": 0, "clientRequestId": new_id()})
        assert stale[1] == 409
        invalid = routes._handle_model_policy(handler, {**request, "unknown": True})
        assert invalid[1] == 400
    finally:
        manager.shutdown(); hub.close()


def test_root_model_policy_route_rejects_missing_forged_and_foreign_header_before_db(tmp_path, monkeypatch):
    from test_native_model_policy_api import setup as policy_setup
    from web.api import independent, profiles, routes
    scope, session, path, hub, manager, _ = policy_setup(tmp_path, monkeypatch)
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200: (payload, status))
    monkeypatch.setattr(routes, "bad", lambda _handler, message, status=400: ({"error": message}, status))
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", "bridge-token")
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "research")
    body = {"session_id": session.session_id, "space_scope": session.space_scope, "action": "get"}
    try:
        before = path.read_bytes()
        assert routes._handle_model_policy(SimpleNamespace(headers={}), body)[1] == 409
        assert routes._handle_model_policy(SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": "forged"}), body)[1] == 409
        foreign = dict(session.space_scope); foreign["browserProfileId"] = "foreign"
        assert routes._handle_model_policy(SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": "bridge-token"}), {**body, "space_scope": foreign})[1] == 409
        assert path.read_bytes() == before
    finally:
        manager.shutdown(); hub.close()



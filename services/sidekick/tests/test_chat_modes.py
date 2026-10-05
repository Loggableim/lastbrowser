import json
from concurrent.futures import ThreadPoolExecutor
from threading import Thread
from types import SimpleNamespace

import pytest

from runtime.chat_modes import (
    ChatExecutionPolicy,
    ChatModeConflict,
    capture_policy,
    settings_view,
    tool_denial,
    update_settings,
)


def test_plan_allows_only_read_tools():
    policy = ChatExecutionPolicy("plan", 0)
    assert tool_denial(policy, "read_file", {}) is None
    assert tool_denial(policy, "search_files", {}) is None
    for name in ("terminal", "write_file", "delegate_task", "memory", "unknown"):
        assert tool_denial(policy, name, {}) == "plan_mode_read_only"


def test_grill_me_disables_every_tool():
    policy = ChatExecutionPolicy("grill_me", 2)
    for name in ("read_file", "search_files", "terminal", "unknown"):
        assert tool_denial(policy, name, {}) == "grill_me_tools_disabled"


def test_boost_does_not_expand_existing_authority():
    policy = ChatExecutionPolicy("boost", 0, max_parallel_children=2, max_child_iterations=4)
    assert tool_denial(policy, "write_file", {}) is None
    assert tool_denial(policy, "delegate_task", {"tasks": ["a", "b"]}) is None


def test_boost_rejects_children_or_iterations_above_budget():
    policy = ChatExecutionPolicy("boost", 0, max_parallel_children=2, max_child_iterations=4)
    assert tool_denial(policy, "delegate_task", {"tasks": ["a", "b", "c"]}) == "boost_subagent_budget_exceeded"
    assert tool_denial(policy, "delegate_task", {"max_iterations": 5}) == "boost_subagent_budget_exceeded"


def test_capture_policy_freezes_plan_for_naked_thread_and_thread_pool():
    policy, persisted = capture_policy({"schemaVersion": 1, "mode": "plan", "lifetime": "chat", "revision": 3}, config={"delegation": {"max_concurrent_children": 5}})
    assert policy.view()["mode"] == "plan" and policy.max_parallel_children == 5
    results = []
    thread = Thread(target=lambda: results.append(tool_denial(policy, "terminal", {})))
    thread.start(); thread.join()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results.extend(pool.map(lambda _: tool_denial(policy, "terminal", {}), range(2)))
    assert results == ["plan_mode_read_only"] * 3
    assert persisted["revision"] == 3


@pytest.mark.parametrize("raw", [{}, {"schemaVersion": 1, "mode": "invalid", "lifetime": "chat", "revision": 0}, {"schemaVersion": 1, "mode": "plan", "lifetime": "chat", "revision": -1}])
def test_invalid_saved_settings_fail_closed(raw):
    with pytest.raises(ValueError):
        settings_view(raw)


def test_unsupported_mode_fails_closed():
    with pytest.raises(ValueError):
        update_settings(None, mode="unknown", lifetime="chat", expected_revision=0)


def test_next_turn_is_consumed_once_and_revision_increments():
    raw = {"schemaVersion": 1, "mode": "boost", "lifetime": "next_turn", "revision": 4}
    policy, persisted = capture_policy(raw)
    assert policy.mode == "boost" and policy.revision == 4
    assert persisted == {"schemaVersion": 1, "mode": "action", "lifetime": "chat", "revision": 5}
    _, second = capture_policy(persisted)
    assert second == persisted


def test_captured_policy_stays_stable_after_mode_change():
    policy, _ = capture_policy(None, requested_mode="plan")
    changed = update_settings(None, mode="boost", lifetime="chat", expected_revision=0)
    assert policy.mode == "plan" and changed["mode"] == "boost"


def test_update_settings_rejects_stale_revision_and_boolean_revision():
    with pytest.raises(ChatModeConflict):
        update_settings(None, mode="plan", lifetime="chat", expected_revision=1)
    with pytest.raises(ChatModeConflict):
        update_settings(None, mode="plan", lifetime="chat", expected_revision=True)


@pytest.fixture
def scoped_chat(tmp_path):
    from runtime.independent.contracts import Scope
    from runtime.independent.scope_binding import ProfileHub

    home, state, workspace = tmp_path / "home", tmp_path / "state", tmp_path / "workspace"
    home.mkdir(); state.mkdir(); workspace.mkdir()
    (state / "workspaces.json").write_text(json.dumps([{"path": str(workspace), "name": "workspace"}]), encoding="utf-8")
    hub = ProfileHub(home, default_state_dir=state)
    scope = Scope.model_validate(hub.bind("default", {"workspacePath": str(workspace), "browserProfileId": "browser", "partitionKey": "persist:chat"})["scope"])
    session = SimpleNamespace(session_id="chat-mode-test", profile="default", workspace=str(workspace), space_scope=scope.model_dump(by_alias=True), chat_execution_mode=None, chat_mode_requests=None, independent=None, save=lambda **_: None)
    yield hub, scope, workspace, session
    hub.close()


def _body(scope, **values):
    return {"space_scope": scope.model_dump(by_alias=True), "client_request_id": "request-1234", "mode": "plan", "lifetime": "chat", "expected_revision": 0, **values}


def test_session_mode_roundtrip_metadata_only(tmp_path, monkeypatch):
    from web.api import config, models
    monkeypatch.setattr(config, "SESSION_DIR", tmp_path)
    monkeypatch.setattr(models, "get_session_dir", lambda: tmp_path)
    monkeypatch.setattr(models.Session, "_legacy_session_path", lambda self: None)
    session = models.Session(session_id="roundtrip", workspace="workspace", profile="default", chat_execution_mode={"schemaVersion": 1, "mode": "plan", "lifetime": "chat", "revision": 1})
    session.save()
    loaded = models.Session.load_metadata_only("roundtrip")
    assert loaded.chat_execution_mode["mode"] == "plan"
    assert loaded._loaded_metadata_only is True


def test_change_mode_is_idempotent_and_rejects_digest_reuse(scoped_chat):
    from web.api.chat_modes import change_chat_mode
    hub, scope, _, session = scoped_chat
    first = change_chat_mode(session, _body(scope), actor="default", profile_hub=hub)
    replay = change_chat_mode(session, _body(scope), actor="default", profile_hub=hub)
    assert first["mode"]["revision"] == 1 and replay["replayed"] is True
    with pytest.raises(ChatModeConflict):
        change_chat_mode(session, _body(scope, mode="boost"), actor="default", profile_hub=hub)


def test_change_mode_rejects_foreign_scope(scoped_chat):
    from runtime.independent.scope import ScopeError
    from web.api.chat_modes import change_chat_mode
    hub, scope, workspace, session = scoped_chat
    foreign = scope.model_copy(update={"browser_profile_id": "foreign-browser"})
    with pytest.raises(ScopeError):
        change_chat_mode(session, _body(foreign), actor="default", profile_hub=hub)
    assert session.chat_execution_mode is None and session.chat_mode_requests is None


def test_read_mode_returns_current_settings_and_rejects_foreign_scope(scoped_chat):
    from runtime.independent.scope import ScopeError
    from web.api.chat_modes import change_chat_mode, read_chat_mode
    hub, scope, _, session = scoped_chat
    change_chat_mode(session, _body(scope), actor="default", profile_hub=hub)
    result = read_chat_mode(session, scope.model_dump(by_alias=True), actor="default", profile_hub=hub)
    assert result["ok"] and result["mode"]["mode"] == "plan"
    foreign = scope.model_copy(update={"browser_profile_id": "foreign-browser"})
    with pytest.raises(ScopeError):
        read_chat_mode(session, foreign.model_dump(by_alias=True), actor="default", profile_hub=hub)


def test_change_mode_is_blocked_by_existing_writer_lease(scoped_chat):
    from runtime.independent.store import ResourceBusy
    from web.api.chat_modes import change_chat_mode
    hub, scope, workspace, session = scoped_chat
    store, _ = hub.by_scope(scope, "default")
    lease = store.acquire_chat_writer(scope, session.session_id, "existing-writer", "generation")
    try:
        with pytest.raises(ResourceBusy):
            change_chat_mode(session, _body(scope), actor="default", profile_hub=hub)
    finally:
        store.release_lease(lease["leaseId"], owner_generation="generation")

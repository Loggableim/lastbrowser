import json
from dataclasses import replace
from dataclasses import FrozenInstanceError
from types import SimpleNamespace

import pytest

from runtime.independent.chat_binding import capture_chat_profile, require_native_scope_header
from runtime.independent.contracts import ProfilePatch, Scope, SpaceAssistantProfile, new_id, utc_now
from runtime.independent.scope_binding import ProfileHub


@pytest.fixture
def setup(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    state = home / "webui"
    state.mkdir()
    paths = [tmp_path / name for name in ("A", "B")]
    for path in paths:
        path.mkdir()
    (state / "workspaces.json").write_text(json.dumps([{"path": str(path), "name": path.name} for path in paths]), encoding="utf-8")
    hub = ProfileHub(home, default_state_dir=state)
    scopes = [Scope.model_validate(hub.bind("default", {"workspacePath": str(path), "browserProfileId": "browser", "partitionKey": "persist:chat-" + str(i)})["scope"]) for i, path in enumerate(paths)]
    store, _ = hub.by_scope(scopes[0], "default")
    now = utc_now()
    profile = SpaceAssistantProfile(profile_id=new_id(), scope=scopes[0], revision=1, status="confirmed", values=ProfilePatch(purpose="Research in German"), recorded_at=now, confirmed_at=now)
    store.save_profile(profile)
    state = store.ensure_assistant(scopes[0])
    store.update_assistant(scopes[0], state.revision, lambda old: old.model_copy(update={"confirmed_profile_id": profile.profile_id}))
    yield hub, scopes, paths, profile
    hub.close()


def test_confirmed_chat_context_is_frozen_and_scope_specific(setup):
    hub, scopes, paths, profile = setup
    session = SimpleNamespace(profile="default", space_scope=None, independent=None)
    captured = capture_chat_profile(session=session, raw_scope=scopes[0].model_dump(by_alias=True), actor="default", workspace=str(paths[0]), profile_hub=hub)
    assert captured.snapshot_id == profile.profile_id and "Research in German" in captured.prompt
    assert "never authorization" in captured.prompt and session.space_scope == scopes[0].model_dump(by_alias=True)
    with pytest.raises(FrozenInstanceError):
        captured.prompt = "changed"
    other = capture_chat_profile(raw_scope=scopes[1].model_dump(by_alias=True), actor="default", workspace=str(paths[1]), profile_hub=hub)
    assert other.prompt == "" and other.snapshot_id is None


def test_chat_cannot_switch_scope_profile_or_workspace(setup):
    hub, scopes, paths, _ = setup
    session = SimpleNamespace(profile="default", space_scope=scopes[0].model_dump(by_alias=True), independent=None)
    with pytest.raises(PermissionError):
        capture_chat_profile(session=session, raw_scope=scopes[1].model_dump(by_alias=True), actor="default", workspace=str(paths[1]), profile_hub=hub)
    with pytest.raises(PermissionError):
        capture_chat_profile(session=session, actor="default", workspace=str(paths[1]), profile_hub=hub)
    with pytest.raises(PermissionError):
        capture_chat_profile(session=session, actor="missing", workspace=str(paths[0]), profile_hub=hub)


def test_stream_start_rejects_stale_confirmed_quickchat_capture(setup, monkeypatch):
    from web.api import independent, profiles, routes
    hub, scopes, paths, _ = setup
    monkeypatch.setattr(independent, "_hub", hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    session = SimpleNamespace(session_id=new_id(), profile="default",
        space_scope=scopes[0].model_dump(by_alias=True), independent=None,
        workspace=str(paths[0]), active_stream_id=None, messages=[])
    captured = capture_chat_profile(session=session, actor="default", workspace=str(paths[0]), profile_hub=hub)
    stale = replace(captured, snapshot_revision=(captured.snapshot_revision or 0) + 1)
    result = routes._start_chat_stream_for_session(session, msg="Quick question", workspace=str(paths[0]),
        model="controlled", model_provider="custom", confirmed_chat_profile=stale)
    assert result["_status"] == 409 and result["error_code"] == "space_profile_changed"
    assert session.active_stream_id is None and session.messages == []


def test_scoped_quickchat_start_reserves_and_registers_native_worker_binding(setup, monkeypatch):
    import threading
    from web.api import config, goals, independent, native_chats, profiles, routes
    from web.api.models import Session

    hub, scopes, paths, _ = setup
    monkeypatch.setattr(independent, "_hub", hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    monkeypatch.setattr(profiles, "get_profile_home", lambda *_args: hub.get("default").profile_home)
    monkeypatch.setattr(goals, "consume_goal_continuation", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(goals, "has_active_goal", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(routes, "STREAMS", {})
    monkeypatch.setattr(routes, "STREAMS_LOCK", threading.RLock())
    monkeypatch.setattr(routes, "STREAM_GOAL_RELATED", {})
    monkeypatch.setattr(routes, "STREAM_GOAL_CLAIMS", {})
    monkeypatch.setattr(routes, "create_stream_channel", lambda: SimpleNamespace(put_nowait=lambda *_: None))
    monkeypatch.setattr(routes.uuid, "uuid4", lambda: SimpleNamespace(hex="c" * 32))

    threads = []
    class DeferredThread:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            threads.append(self)
        def start(self):
            pass

    monkeypatch.setattr(routes.threading, "Thread", DeferredThread)
    registered = []
    native_context = SimpleNamespace(session_id="quickchat_worker", stream_id="c" * 32, scope=scopes[0],
        workspace=str(paths[0]), profile_home=str(hub.get("default").profile_home))

    def capture_context(session, stream_id, writer, **_kwargs):
        store, _ = hub.by_scope(scopes[0], "default")
        assert writer is not None
        assert any(item["leaseId"] == writer.lease_id for item in store.list_leases())
        assert session.session_kind == "quickchat" and session.space_scope == scopes[0].model_dump(by_alias=True)
        assert stream_id == "c" * 32
        return native_context

    monkeypatch.setattr("runtime.independent.native_chat_protocol.capture_native_chat_context", capture_context)
    monkeypatch.setattr(native_chats, "register_native_chat", lambda context: registered.append(context))
    session = Session(session_id="quickchat_worker", title="Quickchat", workspace=str(paths[0]),
        model="controlled", model_provider="custom", profile="default", space_scope=scopes[0].model_dump(by_alias=True),
        session_kind="quickchat", quick_chat_id="quickchat_worker", enabled_toolsets=[],
        chat_execution_mode={"schemaVersion": 1, "mode": "boost", "lifetime": "chat", "revision": 7})
    captured = capture_chat_profile(session=session, actor="default", workspace=str(paths[0]), profile_hub=hub)

    result = routes._start_chat_stream_for_session(session, msg="Summarize this page", workspace=str(paths[0]),
        model="controlled", model_provider="custom", goal_related=False, mode="",
        confirmed_chat_profile=captured)

    assert result["stream_id"] == "c" * 32
    assert registered == [native_context]
    assert routes.STREAMS
    worker_kwargs = threads[0].kwargs["kwargs"]
    assert worker_kwargs["native_chat_context"] is native_context
    assert worker_kwargs["native_chat_writer"] is not None
    assert worker_kwargs["execution_policy"].mode == "action"
    from runtime.independent.native_chat_protocol import encode_turn
    assert isinstance(worker_kwargs["goal_claim_profile_home"], type(hub.get("default").profile_home))
    turn_kwargs = {key:value for key,value in worker_kwargs.items()
        if key not in {"native_chat_writer", "native_chat_context", "native_chat_session"}}
    encoded = encode_turn(native_context, threads[0].kwargs["args"], turn_kwargs)
    assert encoded["kwargs"]["goal_claim_profile_home"] == native_context.profile_home
    # The deferred thread keeps the accepted lease alive; simulate its normal
    # process-finalizer release so this test leaves no active store ownership.
    writer = hub.by_scope(scopes[0], "default")[0].list_leases()[0]
    hub.by_scope(scopes[0], "default")[0].release_lease(writer["leaseId"], owner_generation=writer["ownerGeneration"])


def test_unknown_independent_writer_fails_closed(setup):
    hub, scopes, paths, _ = setup
    session = SimpleNamespace(profile="default", space_scope=None, independent={"scope": scopes[0].model_dump(by_alias=True), "runId": new_id()})
    with pytest.raises(PermissionError, match="writer"):
        capture_chat_profile(session=session, actor="default", workspace=str(paths[0]), profile_hub=hub)


def test_reserved_task_writer_blocks_normal_chat_before_new_marker_materializes(tmp_path):
    from test_independent_dispatch import manager_fixture
    from runtime.independent.contracts import ProviderSelection, PermissionScope
    from runtime.independent.store import ResourceBusy
    _, space, scope, store, manager, request = manager_fixture(tmp_path)
    hub = SimpleNamespace(by_scope=lambda *_: (store, manager.resolver))
    try:
        dispatch = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="controlled", model="controlled"), permissions=PermissionScope())
        lease = store.acquire_lease(scope, dispatch.run_id, "session_writer:" + dispatch.target_session_id, manager.generation, "2099-01-01T00:00:00Z")
        session = SimpleNamespace(session_id=dispatch.target_session_id, profile="research", space_scope=scope.model_dump(by_alias=True), independent=None)
        with pytest.raises(ResourceBusy, match="session writer"):
            capture_chat_profile(session=session, actor="research", workspace=str(space.root), profile_hub=hub)
        store.release_lease(lease["leaseId"], owner_generation=manager.generation)
        assert capture_chat_profile(session=session, actor="research", workspace=str(space.root), profile_hub=hub).scope == scope
    finally:
        manager.shutdown()
        store.close()


def test_legacy_chat_remains_unbound_and_header_cannot_be_forged(monkeypatch):
    assert capture_chat_profile(actor="default", workspace="legacy") is None
    from web.api import independent as api
    secret = "bridge-" + new_id()
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", secret)
    require_native_scope_header(SimpleNamespace(headers={}), None)
    with pytest.raises(PermissionError):
        require_native_scope_header(SimpleNamespace(headers={}), {})
    require_native_scope_header(SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": secret}), {})


def test_normal_turn_writer_is_owned_until_completion_and_exception(setup, monkeypatch):
    from runtime.independent.chat_binding import native_chat_writer, assert_session_writer_available
    from runtime.independent.store import ResourceBusy
    from web.api import routes
    hub, scopes, paths, _ = setup
    session = SimpleNamespace(session_id=new_id(), profile="default", space_scope=scopes[0].model_dump(by_alias=True), independent=None)
    store, _ = hub.by_scope(scopes[0], "default")
    generation = new_id()
    with native_chat_writer(session, actor="default", owner_ref="normal-request", generation=generation, profile_hub=hub) as writer:
        assert_session_writer_available(session, actor="default", profile_hub=hub)
        assert store.list_leases()[0]["ownerKind"] == "legacy_chat"
        assert store.list_leases()[0]["runId"] is None
        with pytest.raises(ResourceBusy):
            store.acquire_chat_writer(scopes[0], session.session_id, "different-request", generation)
    assert store.list_leases() == ()
    from runtime.independent.chat_binding import reserve_chat_writer
    writer = reserve_chat_writer(session, actor="default", owner_ref="stream", generation=generation, profile_hub=hub)
    def fail(*args, **kwargs):
        assert store.list_leases()
        raise RuntimeError("controlled stream cleanup failure")
    monkeypatch.setattr(routes, "_run_agent_streaming", fail)
    with pytest.raises(RuntimeError, match="cleanup failure"):
        routes._run_agent_streaming_with_native_writer(native_chat_writer=writer)
    assert store.list_leases() == ()


def test_corrupted_independent_marker_cannot_enter_legacy_writer(setup):
    hub, scopes, paths, _ = setup
    for marker in ("bad", {}, {"runId": new_id()}):
        session = SimpleNamespace(profile="default", space_scope=None, independent=marker)
        with pytest.raises(PermissionError, match="metadata"):
            capture_chat_profile(session=session, actor="default", workspace=str(paths[0]), profile_hub=hub)


def test_writer_race_at_real_stream_start_returns_conflict_before_pending_write(setup, monkeypatch):
    from runtime.independent import chat_binding
    from web.api import routes, independent, profiles, goals
    hub, scopes, paths, _ = setup
    store = hub.get("default")
    session = SimpleNamespace(session_id="writer_race", profile="default", independent=None, workspace=str(paths[0]),
        space_scope=scopes[0].model_dump(by_alias=True), active_stream_id=None, messages=[])
    monkeypatch.setattr(independent, "_hub", hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    monkeypatch.setattr(profiles, "get_profile_home", lambda *args: store.profile_home)
    monkeypatch.setattr(goals, "consume_goal_continuation", lambda *args, **kwargs: None)
    monkeypatch.setattr(goals, "has_active_goal", lambda *args, **kwargs: False)
    original = chat_binding.capture_chat_profile
    lease = []
    def capture_then_competing_writer(**kwargs):
        captured = original(**kwargs)
        if not lease:
            lease.append(store.acquire_chat_writer(scopes[0], session.session_id, "competing-turn", new_id()))
        return captured
    monkeypatch.setattr(chat_binding, "capture_chat_profile", capture_then_competing_writer)
    result = routes._start_chat_stream_for_session(session, msg="Human turn", workspace=str(paths[0]),
                                                  model="controlled", model_provider="custom")
    assert result["_status"] == 409 and result["retryable"]
    assert session.messages == [] and session.active_stream_id is None
    assert store.list_leases()[0]["ownerRef"] == "competing-turn"

from types import SimpleNamespace

import pytest

from test_native_chat_process import fixture_context


@pytest.fixture
def bound_native(tmp_path, monkeypatch):
    from runtime.independent.native_chat_worker import bind_native_context
    from web.api import independent, profiles
    from runtime.independent.scope_binding import ProfileHub
    context, store = fixture_context(tmp_path, "a")
    hub = ProfileHub(tmp_path / "base", default_state_dir=tmp_path / "state")
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "a")
    monkeypatch.setattr(profiles, "get_active_profile_home", lambda: __import__("pathlib").Path(context.profile_home))
    monkeypatch.setenv("LASTBROWSER_NATIVE_CHAT_WORKER", "1")
    monkeypatch.setenv("SIDEKICK_HOME", context.profile_home)
    monkeypatch.setenv("LASTBROWSER_NATIVE_GENERATION", context.writer_generation)
    monkeypatch.setenv("LASTBROWSER_BACKEND_PROFILE_ID", context.scope.backend_profile_id)
    monkeypatch.setenv("LASTBROWSER_BROWSER_PROFILE_ID", context.scope.browser_profile_id)
    monkeypatch.setenv("LASTBROWSER_SPACE_ID", context.scope.space_id)
    monkeypatch.setenv("LASTBROWSER_PARTITION_KEY", context.partition_key)
    import web.api.config  # load profile config before the private bind mutates it
    monkeypatch.setenv("SIDEKICK_HOME", context.profile_home)
    import runtime.independent.native_chat_policy as policy
    policy._context = None
    bind_native_context(context)
    yield context, store, hub
    import runtime.independent.native_chat_policy as policy
    policy._context = None
    hub.close(); store.close()


def test_native_stream_resolves_only_bound_context_and_actual_space(bound_native):
    context, _, _ = bound_native
    from web.api import streaming
    session = SimpleNamespace(session_id=context.session_id, profile="a", workspace=context.workspace,
                              space_scope=context.scope.model_dump(mode="json", by_alias=True))
    actual, space = streaming._resolve_native_stream_space(session, context.session_id,
        context.stream_id, context.workspace)
    assert actual == context and str(space.root) == context.space_root
    with pytest.raises(Exception):
        streaming._resolve_native_stream_space(session, context.session_id, "foreign-stream", context.workspace)
    with pytest.raises(Exception):
        streaming._resolve_native_stream_space(session, context.session_id, context.stream_id,
                                                str(context.profile_home))


def test_native_goal_context_binds_profile_home_and_rejects_old_namespace(bound_native, monkeypatch):
    context, _, _ = bound_native
    from web.api import streaming
    session = SimpleNamespace(session_id=context.session_id, profile="a", workspace=context.workspace,
                              space_scope=context.scope.model_dump(mode="json", by_alias=True),
                              workspace_slug="research", goal_space_slug=None)
    monkeypatch.setattr("web.api.goals.goal_state_snapshot", lambda *args, **kwargs: {"revision": 0})
    captured = streaming._capture_goal_turn_context(session, session.session_id, native_context=context)
    assert captured["profile_home"] == context.profile_home
    assert captured["space_slug"] == "research"
    session.workspace_slug = "nova"
    assert streaming._capture_goal_turn_context(session, session.session_id, native_context=context) is None


def test_native_goal_command_blocks_unmigrated_namespace_before_save(bound_native, monkeypatch):
    context, _, _ = bound_native
    from web.api import routes
    session = SimpleNamespace(session_id=context.session_id, profile="a", workspace=context.workspace,
                              space_scope=context.scope.model_dump(mode="json", by_alias=True),
                              goal_space_slug="nova", messages=[], context_messages=[])
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(routes, "j", lambda _h, payload, status=200: {"payload": payload, "status": status})
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": "goal-bridge"})
    from web.api import independent
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", "goal-bridge")
    result = routes._handle_goal_command(handler, {"session_id": context.session_id,
        "space_scope": context.scope.model_dump(mode="json", by_alias=True), "args": "status"})
    assert result["status"] == 409
    assert result["payload"]["error_code"] == "native_goal_migration_required"

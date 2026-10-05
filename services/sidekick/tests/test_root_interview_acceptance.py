"""Targeted root acceptance for legacy Space access (A26)."""

from types import SimpleNamespace

import json
import pytest


@pytest.fixture
def interview_runtime(tmp_path):
    from runtime.independent.assistant import SpaceAssistant
    from runtime.independent.contracts import Scope, new_id
    from runtime.independent.scope import ScopeResolver
    from runtime.independent.scope_binding import ProfileHub

    home = tmp_path / "home"
    home.mkdir()
    state_dir = home / "webui"
    state_dir.mkdir()
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (state_dir / "workspaces.json").write_text(
        json.dumps([{"path": str(workspace), "name": "Workspace"}]), encoding="utf-8"
    )
    (home / "config.yaml").write_text(
        "model:\n  default: controlled-model\n  provider: custom\n", encoding="utf-8"
    )
    hub = ProfileHub(home, default_state_dir=state_dir)
    scope = Scope.model_validate(hub.bind("default", {
        "workspacePath": str(workspace),
        "browserProfileId": "default",
        "partitionKey": "persist:root-interview",
    })["scope"])
    store = hub.get("default")

    class ControlledManager:
        def __init__(self):
            self.dispatches = []

        def activity(self, current_scope):
            return store.activity_snapshot(current_scope)

        def dispatch(self, request, **_kwargs):
            self.dispatches.append(request)
            return store.reserve_dispatch(request)[0]

    manager = ControlledManager()
    assistant = SpaceAssistant(
        store, ScopeResolver(store, profiles_provider=hub.profiles), manager,
        model=lambda *_args: '{"message":"controlled reply"}',
    )
    yield assistant, manager, scope, store
    assistant.shutdown()
    hub.close()

def test_legacy_space_and_unbound_normal_chat_need_no_interview_migration(tmp_path, monkeypatch):
    from runtime.independent.chat_binding import capture_chat_profile
    from web.api import space_engine

    spaces_root = tmp_path / "spaces"
    legacy_root = tmp_path / "workspaces"
    legacy = space_engine.Space("existing-project", "Existing project", custom_root=legacy_root)
    legacy.save_config({"name": "Existing project", "model": {"default": "legacy-model"}})
    before = legacy.config_path.read_bytes()

    monkeypatch.setattr(space_engine, "SPACES_ROOT", spaces_root)
    monkeypatch.setattr(space_engine, "_OLD_ROOT", legacy_root)

    # The explicit read-only lookup must still find the old Space, without
    # creating a profile, interview, or durable native Space identity.
    selected = space_engine.get_existing_space_read_only("existing-project")
    assert selected is not None
    assert selected.root == legacy.root
    assert selected.load_config()["model"]["default"] == "legacy-model"

    # A normal legacy transcript without a native Space binding remains on its
    # ordinary chat path; it does not require onboarding to attach a new profile.
    session = SimpleNamespace(profile="default", space_scope=None, independent=None)
    assert capture_chat_profile(
        session=session,
        actor="default",
        workspace=str(legacy.root),
    ) is None
    assert legacy.config_path.read_bytes() == before
    assert legacy.load_config()["space_id"] == ""


def test_continuing_interview_preserves_existing_rights_schedule_and_dispatches(interview_runtime):
    from runtime.independent.contracts import (
        AgentDefinition, PermissionScope, ProviderSelection, ScheduleSpec,
        TaskDispatchRequest, new_id,
    )

    assistant, manager, scope, store = interview_runtime
    permission = PermissionScope(browser_origins=("https://controlled.test",),
                                allowed_effects=("read", "write"))
    initial_permission = store.get_permission_state(scope)
    store.set_permission_state(scope, permission, expected_revision=initial_permission["revision"])

    state = assistant.snapshot(scope)
    definition = AgentDefinition(
        definition_id=new_id(), scope=scope, title="Existing scheduled task",
        instruction="Keep the existing schedule unchanged",
        provider=ProviderSelection(provider_config_ref="controlled", model="controlled-model"),
        permission_scope=permission,
        activation_conversation_id=state["conversationId"],
        activation_message_id=new_id(),
        schedule=ScheduleSpec(cron_expression="0 9 * * *", timezone="Europe/Vienna"),
    )
    store.put_definition(definition)

    # Record a previously accepted task-start request so this checks that an
    # interview continuation does not add, rewrite, or replay task dispatches.
    assistant_state = store.ensure_assistant(scope)
    user_message_id = new_id()
    store.update_assistant(scope, assistant_state.revision, lambda old: old.model_copy(update={
        "messages": (*old.messages, {"id": user_message_id, "role": "user", "content": "Existing request", "at": "2026-10-05T00:00:00Z"}),
    }))
    manager.dispatch(TaskDispatchRequest(
        client_request_id=new_id(), scope=scope,
        assistant_conversation_id=state["conversationId"], source_message_id=user_message_id,
        kind="start_chat", title="Existing request", instruction="Existing request",
    ))

    before_permission = store.get_permission_state(scope)
    before_definitions = store.list_definitions(scope)
    before_dispatches = store.list_dispatches(scope)
    before_manager_dispatches = tuple(manager.dispatches)

    snapshot = assistant.snapshot(scope)
    started = assistant.interview(scope, "start", {
        "expectedRevision": snapshot["revision"], "clientRequestId": new_id(),
    })
    reviewed = assistant.interview(scope, "review", {
        "expectedRevision": started["interview"]["revision"], "clientRequestId": new_id(),
    })
    assistant.interview(scope, "continue", {
        "expectedRevision": reviewed["interview"]["revision"], "topic": "purpose",
        "clientRequestId": new_id(),
    })

    assert store.get_permission_state(scope) == before_permission
    assert store.list_definitions(scope) == before_definitions
    assert store.list_dispatches(scope) == before_dispatches
    assert tuple(manager.dispatches) == before_manager_dispatches

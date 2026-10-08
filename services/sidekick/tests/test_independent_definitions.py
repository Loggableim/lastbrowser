import json

import pytest

from runtime.independent.contracts import ActionRecord, ConnectionBinding, PermissionScope, ProviderSelection, ScheduleSpec, SpaceAssistantProfile, ProfilePatch, new_id, utc_now
from runtime.independent.definitions import DefinitionDraft, DefinitionService
from runtime.independent.policy import PolicyDenied
from runtime.independent.store import IdempotencyConflict, ResourceBusy, RevisionConflict
from test_independent_dispatch import manager_fixture


def draft_for(request, **updates):
    return DefinitionDraft(title="Scheduled research", instruction="Read the approved page", provider=ProviderSelection(provider_config_ref="controlled", model="controlled"), assistant_conversation_id=request.assistant_conversation_id, source_message_id=request.source_message_id, **updates)


def test_definition_cas_idempotency_scope_and_disable(tmp_path):
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    service, request_id = DefinitionService(manager), new_id()
    try:
        draft = draft_for(request)
        definition = service.save(scope, draft, client_request_id=request_id, expected_revision=None)
        assert service.save(scope, draft, client_request_id=request_id, expected_revision=None) == definition
        assert service.list(scope) == (definition,)
        with pytest.raises(IdempotencyConflict):
            service.save(scope, draft.model_copy(update={"title": "Changed"}), client_request_id=request_id, expected_revision=None)
        with pytest.raises(RevisionConflict):
            service.save(scope, draft.model_copy(update={"definition_id": definition.definition_id}), client_request_id=new_id(), expected_revision=99)
        disabled = service.disable(scope, definition.definition_id, client_request_id=new_id(), expected_revision=1)
        assert disabled.revision == 2 and not disabled.enabled
        with pytest.raises(PolicyDenied, match="definition_disabled"):
            service.start(scope, disabled.definition_id, client_request_id=new_id(), expected_revision=2, expected_permission_revision=1, source_message_id=request.source_message_id, assistant_conversation_id=request.assistant_conversation_id)
    finally:
        manager.shutdown()
        store.close()


def test_schedule_requires_real_user_source_and_revisions_are_server_controlled(tmp_path):
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    service = DefinitionService(manager)
    try:
        schedule = ScheduleSpec(cron_expression="30 9 * * *", timezone="Europe/Vienna", revision=88)
        draft = draft_for(request, schedule=schedule)
        with pytest.raises(PolicyDenied):
            service.save(scope, draft.model_copy(update={"source_message_id": "page-invented-message"}), client_request_id=new_id(), expected_revision=None)
        first = service.save(scope, draft, client_request_id=new_id(), expected_revision=None)
        assert first.schedule.revision == 1
        edited = service.save(scope, draft.model_copy(update={"definition_id": first.definition_id, "schedule": schedule.model_copy(update={"cron_expression": "0 10 * * *"})}), client_request_id=new_id(), expected_revision=1)
        assert edited.revision == 2 and edited.schedule.revision == 2
        titled = service.save(scope, draft.model_copy(update={"definition_id": first.definition_id, "schedule": edited.schedule, "title": "New title"}), client_request_id=new_id(), expected_revision=2)
        assert titled.schedule.revision == 2
    finally:
        manager.shutdown()
        store.close()


def test_definition_pins_confirmed_profile_before_later_assistant_change(tmp_path):
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    try:
        profile = SpaceAssistantProfile(profile_id=new_id(), scope=scope, revision=1, status="confirmed", values=ProfilePatch(purpose="Original purpose"), recorded_at=utc_now(), confirmed_at=utc_now())
        store.save_profile(profile)
        assistant = store.get_assistant(scope)
        store.update_assistant(scope, assistant.revision, lambda state: state.model_copy(update={"confirmed_profile_id": profile.profile_id, "setup_status": "confirmed"}))
        definition = DefinitionService(manager).save(scope, draft_for(request), client_request_id=new_id(), expected_revision=None)
        updated = profile.model_copy(update={"profile_id": new_id(), "revision": 2, "values": ProfilePatch(purpose="Later purpose")})
        store.save_profile(updated)
        assistant = store.get_assistant(scope)
        store.update_assistant(scope, assistant.revision, lambda state: state.model_copy(update={"confirmed_profile_id": updated.profile_id}))
        context = manager.make_context(scope, definition.provider, definition=definition)
        assert context.assistant_profile_snapshot.values.purpose == "Original purpose"
        assert context.assistant_profile_snapshot_ref == profile.profile_id
    finally:
        manager.shutdown()
        store.close()


@pytest.mark.parametrize("model", ["teamwork", "smart-track", "smart-track-low", "smart-track-medium", "smart-track-high"])
def test_virtual_orchestration_fails_closed_but_catalog_context_is_readable(tmp_path, model):
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    provider = ProviderSelection(provider_config_ref="controlled", provider=model, model=model)
    try:
        with pytest.raises(PolicyDenied, match="independent_orchestration_not_supported"):
            manager.make_context(scope, provider)
        context = manager.make_context(scope, provider, allow_virtual_for_catalog=True)
        assert context.provider == provider
        with pytest.raises(PolicyDenied, match="independent_orchestration_not_supported"):
            manager.run_interactive(context, {"mode": "assistant"})
        with pytest.raises(PolicyDenied, match="independent_orchestration_not_supported"):
            manager.enqueue(request, provider=provider, permissions=PermissionScope())
        assert store.list_runs() == () and store.list_dispatches() == ()
    finally:
        manager.shutdown()
        store.close()


def test_definition_capture_uses_actual_binding_revisions_and_revocation_closes_admission(tmp_path):
    from runtime.independent.connections import ConnectionRepository
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    try:
        repo = ConnectionRepository(store)
        catalog = {"scope": scope.model_dump(by_alias=True), "entries": [{"capabilityId": "assistant.conversation", "connectionKind": "provider", "supportedTasks": ["agent_reasoning"], "connections": [{"connectionId": "controlled-provider", "revision": 7, "status": "configured"}]}]}
        row = repo.bind(scope, {"capabilityId": "assistant.conversation", "connectionId": "controlled-provider", "permittedUse": ["agent_reasoning"], "expectedRevision": 0, "clientRequestId": new_id()}, catalog)
        ref = ConnectionBinding(connection_id=row.connection_id, capability_id=row.capability_id, kind="provider", revision=999, binding_id=row.binding_id, connection_revision=999)
        definition = DefinitionService(manager).save(scope, draft_for(request, connection_bindings=(ref,)), client_request_id=new_id(), expected_revision=None)
        assert definition.connection_bindings[0].revision == row.revision
        assert definition.connection_bindings[0].connection_revision == 7
        context = manager.make_context(scope, definition.provider, definition=definition)
        with pytest.raises(PolicyDenied, match="scope_connection_adapter_required"):
            manager._validate_current(context)
        manager.connection_validator = lambda _: True
        manager._validate_current(context)
        repo.begin_revoke(scope, {"bindingId": row.binding_id, "expectedRevision": row.revision, "clientRequestId": new_id()})
        with pytest.raises(PolicyDenied, match="scope_connection_changed"):
            manager._validate_current(context)
        with pytest.raises(PolicyDenied, match="definition_connection_unavailable"):
            DefinitionService(manager).save(scope, draft_for(request, connection_bindings=(ref,)), client_request_id=new_id(), expected_revision=None)
    finally:
        manager.shutdown()
        store.close()


def test_started_definition_retry_survives_later_disable_without_second_chat(tmp_path):
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    service, request_id = DefinitionService(manager), new_id()
    try:
        definition = service.save(scope, draft_for(request), client_request_id=new_id(), expected_revision=None)
        args = dict(client_request_id=request_id, expected_revision=1, expected_permission_revision=1, source_message_id=request.source_message_id, assistant_conversation_id=request.assistant_conversation_id)
        first = service.start(scope, definition.definition_id, **args)
        service.disable(scope, definition.definition_id, client_request_id=new_id(), expected_revision=1)
        assert service.start(scope, definition.definition_id, **args) == first
        assert len(store.list_runs()) == 1
    finally:
        manager.shutdown()
        store.close()


def test_connection_revoke_between_validation_and_atomic_action_claim_is_denied(tmp_path):
    from runtime.independent.connections import ConnectionRepository
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    try:
        repo = ConnectionRepository(store)
        catalog = {"scope": scope.model_dump(by_alias=True), "entries": [{"capabilityId": "assistant.conversation", "connectionKind": "provider", "supportedTasks": ["agent_reasoning"], "connections": [{"connectionId": "controlled", "revision": 1, "status": "configured"}]}]}
        row = repo.bind(scope, {"capabilityId": "assistant.conversation", "connectionId": "controlled", "permittedUse": ["agent_reasoning"], "expectedRevision": 0, "clientRequestId": new_id()}, catalog)
        draft = draft_for(request, connection_bindings=(ConnectionBinding(connection_id="controlled", capability_id="assistant.conversation", kind="provider"),))
        service = DefinitionService(manager)
        definition = service.save(scope, draft, client_request_id=new_id(), expected_revision=None)
        manager.connection_validator = lambda _: True
        dispatch = service.start(scope, definition.definition_id, client_request_id=new_id(), expected_revision=1, expected_permission_revision=1, source_message_id=request.source_message_id, assistant_conversation_id=request.assistant_conversation_id)
        run = store.transition_run(dispatch.run_id, "running")
        context = store.get_run_context(run.run_id)
        manager._validate_current(context)
        action = store.prepare_action(ActionRecord(action_id=new_id(), run_id=run.run_id, step_id="controlled-read", scope=scope, tool_id="independent_file_read", canonical_args_digest="a" * 64, intended_effect="read", authorization_ref=run.dispatch_id, permission_revision=1))
        # Precisely expose the historical gap, before a control-epoch update:
        # binding changes after the manager check, then atomic claim rechecks.
        with store.transaction():
            repo._write(row.model_copy(update={"revision": row.revision + 1, "status": "revoking"}))
        assert store.get_permission_state(scope)["revision"] == 1
        with pytest.raises(RevisionConflict, match="Connection authorization"):
            store.claim_action(action.action_id, expected_permission_revision=1, expected_control_epoch=0)
        assert store.get_action(action.action_id).state == "prepared"
    finally:
        manager.shutdown()
        store.close()


def test_repeated_definition_preserves_one_actual_task_history_and_delayed_results(tmp_path):
    """Real bound child projections across two occurrences, without inference."""
    _, space, scope, store, manager, request = manager_fixture(tmp_path)
    service = DefinitionService(manager)
    try:
        definition = service.save(scope, draft_for(request), client_request_id=new_id(), expected_revision=None)
        args = dict(expected_revision=1, expected_permission_revision=1, source_message_id=request.source_message_id,
                    assistant_conversation_id=request.assistant_conversation_id)
        first = service.start(scope, definition.definition_id, client_request_id=new_id(), **args)
        path = space.sessions_dir / (first.target_session_id + ".json")
        store.transition_run(first.run_id, "running")
        artifact = manager._write_artifact(store.get_run_context(first.run_id), "result", {"response": "First occurrence result"})
        store.transition_run(first.run_id, "completed", result_ref=artifact)
        # A user edit made after the first terminal run must survive reuse.
        raw = json.loads(path.read_text("utf-8"))
        raw["title"] = "User task-history title"
        raw["messages"].append({"role": "user", "content": "User correction between occurrences"})
        path.write_text(json.dumps(raw), "utf-8")
        second_id = new_id()
        original = manager._run_projection
        def lose_saved_confirmation(context, payload):
            result = original(context, payload)
            if payload["mode"] == "materialize_session":
                raise OSError("controlled lost confirmation after append")
            return result
        manager._run_projection = lose_saved_confirmation
        with pytest.raises(OSError, match="controlled lost confirmation"):
            service.start(scope, definition.definition_id, client_request_id=second_id, **args)
        manager._run_projection = original
        second = service.start(scope, definition.definition_id, client_request_id=second_id, **args)
        assert second.target_session_id == first.target_session_id and second.run_id != first.run_id
        assert len([file for file in space.sessions_dir.glob("*.json") if len(file.stem) == 32 and all(c in "0123456789abcdef" for c in file.stem)]) == 1
        raw = json.loads(path.read_text("utf-8"))
        assert raw["title"] == "User task-history title"
        assert any(message["content"] == "User correction between occurrences" for message in raw["messages"])
        assert sum(message.get("independentDispatchId") == second.dispatch_id for message in raw["messages"]) == 1
        assert raw["independent"]["runId"] == second.run_id
        assert store.get_definition(definition.definition_id).revision == 1
        assert any(lease["resourceKey"] == "session_writer:" + second.target_session_id for lease in store.list_leases(run_id=second.run_id))
        with pytest.raises(ResourceBusy):
            service.start(scope, definition.definition_id, client_request_id=new_id(), **args)
        # An earlier delayed terminal report is scoped by its captured dispatch
        # history, and cannot retarget the current run's marker or writer.
        manager._deliver_outbox()
        raw = json.loads(path.read_text("utf-8"))
        assert raw["independent"]["runId"] == second.run_id and raw["independent"]["state"] == "queued"
        assert sum(message.get("deliveryKey") == "result:" + first.run_id for message in raw["messages"]) == 1
        store.transition_run(second.run_id, "running")
        artifact = manager._write_artifact(store.get_run_context(second.run_id), "result", {"response": "Second occurrence result"})
        store.transition_run(second.run_id, "completed", result_ref=artifact)
        manager._deliver_outbox()
        manager._deliver_outbox()
        raw = json.loads(path.read_text("utf-8"))
        assert raw["independent"]["state"] == "completed"
        assert sum(message.get("deliveryKey") == "result:" + second.run_id for message in raw["messages"]) == 1
        assert len(store.list_runs()) == 2
    finally:
        manager.shutdown()
        store.close()


def test_revoked_tool_permissions_allow_only_explicit_empty_interactive_context(tmp_path):
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    provider = ProviderSelection(provider_config_ref="controlled", model="controlled")
    try:
        store.revoke_permissions(scope, expected_revision=1)
        with pytest.raises(PolicyDenied, match="scope_permissions_revoked"):
            manager.make_context(scope, provider)
        context = manager.make_context(scope, provider, interactive=True)
        assert context.effective_permissions == PermissionScope(allowed_effects=())
        assert context.permission_revision == store.get_permission_state(scope)["revision"]
        with pytest.raises(PolicyDenied, match="interactive_tool_authority_forbidden"):
            manager.make_context(scope, provider, interactive=True, permissions=PermissionScope())
        with pytest.raises(PolicyDenied):
            manager.dispatch(request.model_copy(update={"expected_permission_revision": context.permission_revision}),
                             provider=provider, permissions=PermissionScope())
        assert not store.list_runs() and not store.list_dispatches()
    finally:
        manager.shutdown()
        store.close()

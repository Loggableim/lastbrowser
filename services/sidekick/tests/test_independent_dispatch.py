"""Delegation creates a real existing-format session in the bound worker."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from runtime.independent.contracts import BackendProfileRef, PermissionScope, ProviderSelection, Scope, SpaceBinding, TaskDispatchRequest, new_id
from runtime.independent.manager import RunManager
from runtime.independent.scope import ScopeResolver
from runtime.independent.store import IndependentStore, IdempotencyConflict
from runtime.independent.worker_host import WorkerHost
from test_independent_profile_isolation import isolated_python
from web.api.space_engine import Space


def manager_fixture(tmp_path):
    home = tmp_path / "base" / "profiles" / "research"
    home.mkdir(parents=True)
    space = Space("research", custom_root=home / "spaces")
    space.save_config({"name": "Research"}, mint_space_id=True)
    scope = Scope(backend_profile_id=new_id(), space_id=space.load_config()["space_id"], browser_profile_id="default")
    store = IndependentStore(home, scope.backend_profile_id)
    store.register_profile(BackendProfileRef(backend_profile_id=scope.backend_profile_id, name="research", canonical_home=str(home)))
    store.bind_space(SpaceBinding(scope=scope, native_slug="research", partition_key="persist:research_default"))
    state = store.ensure_assistant(scope)
    source = new_id()
    state = store.update_assistant(scope, state.revision, lambda value: value.model_copy(update={"messages": ({"id": source, "role": "user", "content": "Please create a research chat"},)}))
    request = TaskDispatchRequest(client_request_id=new_id(), scope=scope, assistant_conversation_id=state.conversation_id, source_message_id=source, kind="start_chat", title="Controlled research", instruction="Read the controlled local page")
    resolver = ScopeResolver(store, profiles_provider=lambda: [{"name": "research", "path": str(home)}])
    # Match the private interpreter shipped by the desktop. Using the global
    # developer Python here makes isolated (-I) projection workers lose
    # dependencies installed only in the developer user-site.
    manager = RunManager(store, resolver, worker_factory=lambda context: WorkerHost(
        context, python_executable=isolated_python()))
    return home, space, scope, store, manager, request


def test_actual_process_materializes_one_normal_session_and_retry_keeps_original_context(tmp_path):
    home, space, scope, store, manager, request = manager_fixture(tmp_path)
    provider = ProviderSelection(provider_config_ref="test-provider", model="test-model")
    try:
        result = manager.dispatch(request, provider=provider, permissions=PermissionScope())
        assert result.state == "started"
        path = space.sessions_dir / (result.target_session_id + ".json")
        raw = json.loads(path.read_text("utf-8"))
        assert raw["session_id"] == result.target_session_id
        assert raw["title"] == request.title
        assert raw["messages"][0] == {"role": "user", "content": request.instruction}
        assert raw["profile"] == "research"
        assert raw["independent"]["scope"] == scope.model_dump(mode="json", by_alias=True)
        assert raw["independent"]["dispatchId"] == result.dispatch_id
        retried = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="different-ui-provider", model="different-model"), permissions=PermissionScope())
        assert retried == result
        assert store.get_run_context(result.run_id).provider == provider
        assert len(tuple(space.sessions_dir.glob(result.target_session_id + ".json"))) == 1
        assert len(store.list_runs()) == 1
        with pytest.raises(IdempotencyConflict):
            manager.dispatch(request.model_copy(update={"instruction": "A different action"}), provider=provider, permissions=PermissionScope())
    finally:
        manager.shutdown()
        store.close()


def test_prepared_chat_does_not_create_a_run_and_preserves_existing_chat_on_retry(tmp_path):
    _, space, _, store, manager, request = manager_fixture(tmp_path)
    request = request.model_copy(update={"kind": "prepare_chat"})
    try:
        result = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="test-provider", model="test-model"), permissions=PermissionScope())
        assert result.state == "prepared" and result.run_id is None
        assert store.list_runs() == ()
        path = space.sessions_dir / (result.target_session_id + ".json")
        raw = json.loads(path.read_text("utf-8"))
        raw["title"] = "User corrected the title"
        raw["messages"].append({"role": "user", "content": "Preserve this message"})
        path.write_text(json.dumps(raw), "utf-8")
        manager.dispatch(request, provider=ProviderSelection(provider_config_ref="test-provider", model="test-model"), permissions=PermissionScope())
        preserved = json.loads(path.read_text("utf-8"))
        assert preserved["title"] == raw["title"] and preserved["messages"] == raw["messages"]
    finally:
        manager.shutdown()
        store.close()


def test_actual_result_delivery_appends_once_to_original_chat_and_assistant(tmp_path):
    _, space, scope, store, manager, request = manager_fixture(tmp_path)
    try:
        result = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="test-provider", model="test-model"), permissions=PermissionScope())
        run = store.transition_run(result.run_id, "running")
        context = store.get_run_context(run.run_id)
        artifact = manager._write_artifact(context, "result", {"response": "Controlled research is complete", "messages": []})
        store.transition_run(run.run_id, "completed", result_ref=artifact)
        manager._deliver_outbox()
        manager._deliver_outbox()
        raw = json.loads((space.sessions_dir / (result.target_session_id + ".json")).read_text("utf-8"))
        reports = [message for message in raw["messages"] if message.get("deliveryKey") == "result:" + run.run_id]
        assert len(reports) == 1 and reports[0]["content"] == "Controlled research is complete"
        assistant = store.get_assistant(scope)
        feedback = [message for message in assistant.messages if message.get("deliveryKey") == "result:" + run.run_id]
        assert len(feedback) == 1 and feedback[0]["targetSessionId"] == result.target_session_id
        assert store.get_outbox("result:" + run.run_id)["state"] == "delivered"
    finally:
        manager.shutdown()
        store.close()


def test_projection_crash_is_retryable_without_second_session_or_run(tmp_path):
    _, space, _, store, manager, request = manager_fixture(tmp_path)
    original = manager._run_projection
    calls = []
    def fail_once(context, payload):
        value = original(context, payload)
        calls.append(payload)
        if len(calls) == 1:
            from runtime.independent.worker_host import WorkerError
            raise WorkerError("controlled_lost_response_after_save")
        return value
    manager._run_projection = fail_once
    try:
        with pytest.raises(Exception, match="controlled_lost_response"):
            manager.dispatch(request, provider=ProviderSelection(provider_config_ref="test-provider", model="test-model"), permissions=PermissionScope())
        failed = store.list_dispatches()[0]
        assert failed.state == "failed" and store.list_runs() == ()
        manager._run_projection = original
        retried = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="test-provider", model="test-model"), permissions=PermissionScope())
        assert retried.dispatch_id == failed.dispatch_id and retried.target_session_id == failed.target_session_id
        assert len(store.list_runs()) == 1
        raw = json.loads((space.sessions_dir / (retried.target_session_id + ".json")).read_text("utf-8"))
        assert len(raw["messages"]) == 1
    finally:
        manager.shutdown()
        store.close()

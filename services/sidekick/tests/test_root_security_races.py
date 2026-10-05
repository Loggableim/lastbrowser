"""Focused acceptance probes for stop/revoke races and tool-boundary denial."""
from __future__ import annotations

import threading
import time

import pytest

from runtime.independent.connections import ConnectionRepository, SpaceConnectionBinding
from runtime.independent.contracts import (
    BackendProfileRef, ConnectionBinding, PermissionScope, ProviderSelection, SpaceBinding,
    TaskDispatchRequest, new_id, utc_now,
)
from runtime.independent.policy import PolicyDenied
from test_independent_runs import assert_state, dispatch, eventually, fixture


def _tool_event(run, context, name, args):
    return {"kind": "request", "requestKind": "tool", "requestId": new_id(), "runId": run.run_id,
        "runnerGeneration": context.runner_generation,
        "scope": run.scope.model_dump(mode="json", by_alias=True),
        "controlEpoch": run.control_epoch, "tool": name, "args": args}


def test_root_security_late_gateway_success_cannot_resurrect_stopped_run(tmp_path):
    home, store, manager, factory, gateway = fixture(tmp_path)
    entered, release = threading.Event(), threading.Event()
    external_dispatches = []

    def delayed_gateway_success(_lease, action, **kwargs):
        external_dispatches.append((action, kwargs))
        entered.set()
        if not release.wait(5):
            raise TimeoutError("controlled gateway response was not released")
        # Simulate a success reply arriving after Main acknowledged Stop.
        return {"text": "late result from the controlled page"}

    gateway.execute = delayed_gateway_success
    try:
        run = dispatch(home, store, manager, "root-stop-race")
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        handle = factory.handles[run.run_id]
        eventually(lambda: len(handle.replies) == 1)
        handle.request("tool", scope=run.scope.model_dump(mode="json", by_alias=True), controlEpoch=0,
            tool="independent_browser_read", args={"selector": "body"})
        assert entered.wait(3), "browser action never reached controlled gateway dispatch"
        running = store.get_run(run.run_id)
        stopped = manager.control(run.run_id, "cancel", expected_revision=running.state_revision)
        assert stopped.state == "cancelled"
        assert store.list_actions(run.run_id)[0].state == "unknown"
        release.set()
        thread = manager._threads.get(run.run_id)
        if thread:
            thread.join(timeout=4)
        assert store.get_run(run.run_id).state == "cancelled"
        assert store.list_actions(run.run_id)[0].state == "unknown"
        assert len(external_dispatches) == 1
        assert not store.pending_outbox() or not any(item["kind"] == "result" and item["key"] == "result:" + run.run_id
            for item in store.pending_outbox())
    finally:
        release.set()
        manager.shutdown()
        store.close()


def test_root_security_connection_revoke_fences_inflight_gateway_success(tmp_path):
    home, store, manager, factory, gateway = fixture(tmp_path)
    from web.api.space_engine import Space
    from runtime.independent.contracts import Scope, SpaceBinding

    space = Space("root-connection-race", custom_root=home / "spaces")
    space.save_config({"name": "root-connection-race"}, mint_space_id=True)
    scope = Scope(backend_profile_id=store.backend_profile_id,
        space_id=space.load_config()["space_id"], browser_profile_id="default")
    store.bind_space(SpaceBinding(scope=scope, native_slug="root-connection-race", partition_key="persist:root_connection_race"))
    repository = ConnectionRepository(store)
    binding = SpaceConnectionBinding(binding_id=new_id(), scope=scope, capability_id="browser.account",
        connection_id="controlled-account", connection_kind="browser_account", connection_revision=1,
        revision=1, status="active", permitted_use=("browser.account.use",), updated_at=utc_now())
    with store.transaction():
        repository._write(binding)
    captured = ConnectionBinding(binding_id=binding.binding_id, connection_id=binding.connection_id,
        kind="browser_account", capability_id=binding.capability_id, revision=binding.revision,
        connection_revision=binding.connection_revision)
    manager.connection_validator = lambda _context: True
    state = store.ensure_assistant(scope)
    source = new_id()
    state = store.update_assistant(scope, state.revision, lambda value: value.model_copy(update={
        "messages": (*value.messages, {"id": source, "role": "user", "content": "Use controlled browser"})}))
    request = TaskDispatchRequest(client_request_id=new_id(), scope=scope,
        assistant_conversation_id=state.conversation_id, source_message_id=source, kind="start_chat",
        title="root connection race", instruction="Read the controlled page")
    entered, release = threading.Event(), threading.Event()
    external_dispatches = []

    def delayed_gateway_success(_lease, action, **kwargs):
        external_dispatches.append((action, kwargs))
        entered.set()
        if not release.wait(5):
            raise TimeoutError("controlled gateway response was not released")
        return {"text": "late result after connection revoke"}

    gateway.execute = delayed_gateway_success
    try:
        result = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="test-provider", model="test-model"),
            permissions=PermissionScope(browser_origins=("https://controlled.example",)),
            connection_bindings=(captured,))
        run = store.get_run(result.run_id)
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        handle = factory.handles[run.run_id]
        eventually(lambda: len(handle.replies) == 1)
        context = store.get_run_context(run.run_id)
        handle.request("tool", scope=scope.model_dump(mode="json", by_alias=True), controlEpoch=0,
            tool="independent_browser_read", args={"selector": "body"})
        assert entered.wait(3), "browser action never reached controlled gateway dispatch"
        revoke_request_id = new_id()
        pending = repository.begin_revoke(scope, {"bindingId": binding.binding_id,
            "expectedRevision": binding.revision, "clientRequestId": revoke_request_id})
        assert pending.status == "revoking"
        revoked = manager.revoke_connections(scope)
        assert revoked["acknowledged"] is True
        assert store.get_run(run.run_id).state == "interrupted"
        release.set()
        thread = manager._threads.get(run.run_id)
        if thread:
            thread.join(timeout=4)
        current_binding = repository.complete_revoke(pending, request_id=revoke_request_id)
        assert current_binding.status == "revoked"
        assert store.get_run(run.run_id).state == "interrupted"
        assert store.list_actions(run.run_id)[0].state == "unknown"
        assert len(external_dispatches) == 1
        assert context.connection_bindings[0].binding_id == binding.binding_id
    finally:
        release.set()
        manager.shutdown()
        store.close()


@pytest.mark.parametrize("name,args", [
    ("browser_cdp", {"targetId": "controlled-target", "method": "Runtime.evaluate", "expression": "document.body.innerText"}),
    ("independent_browser_read", {"selector": "body", "targetId": "known-foreign-target"}),
])
def test_root_security_live_run_cannot_use_raw_cdp_or_select_foreign_target(tmp_path, name, args):
    home, store, manager, _, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "root-tool-boundary-" + name)
        store.transition_run(run.run_id, "running")
        context = store.get_run_context(run.run_id)
        lease = manager._browser(context)
        # The request is made with an otherwise live scope, run, and known lease.
        with pytest.raises(PolicyDenied):
            manager._handle_request(run.run_id, _tool_event(run, context, name, args))
        assert gateway.actions == []
        assert manager.browser_snapshot(run.run_id)["targetId"] == lease.snapshot["targetId"]
    finally:
        manager.shutdown()
        store.close()

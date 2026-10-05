"""Controlled provider/gateway contracts exercise real broker ownership.

Fake provider transport is explicitly not a model-inference or Electron proof.
Actual worker/session projection is covered separately in dispatch tests.
"""
from __future__ import annotations

import queue
import threading
import time
from pathlib import Path

import pytest

from runtime.independent.browser_gateway import GatewayError, GatewayLease
from runtime.independent.contracts import BackendProfileRef, PermissionScope, ProviderSelection, Scope, SpaceBinding, TaskDispatchRequest, new_id
from runtime.independent.manager import ComputeAdmission, RunManager
from runtime.independent.scope import ScopeResolver
from runtime.independent.store import IndependentStore, RevisionConflict
from web.api.space_engine import Space


class Handle:
    def __init__(self, context, payload):
        self.context, self.payload = context, payload
        self.is_alive = True
        self.events = queue.Queue()
        self.replies = []
        if payload.get("mode") in {"materialize_session", "update_session"}:
            self.events.put({"kind": "result", "runId": context.run_id, "value": {"sessionId": payload["targetSessionId"]}})
        else:
            self.request("provider_request")

    def request(self, kind, **values):
        self.events.put({"kind": "request", "runId": self.context.run_id, "requestId": new_id(), "requestKind": kind, "runnerGeneration": self.context.runner_generation, **values})

    def read_event(self, timeout=0):
        try:
            return self.events.get(timeout=timeout)
        except queue.Empty:
            return None

    def send(self, value):
        self.replies.append(value)

    def terminate(self, **_):
        self.is_alive = False
        self.events.put({"kind": "eof"})
        return 0


class Factory:
    def __init__(self):
        self.handles = {}

    def __call__(self, context):
        factory = self
        class Worker:
            def start(self, *, payload):
                handle = Handle(context, payload)
                if payload.get("mode") == "run":
                    factory.handles[context.run_id] = handle
                return handle
        return Worker()


class Gateway:
    def __init__(self):
        self.actions, self.controls = [], []
        self.error = None

    def create_lease(self, context, **kwargs):
        return GatewayLease({"leaseId": new_id(), "runId": context.run_id, "scope": context.scope.model_dump(mode="json", by_alias=True), "runnerGeneration": context.runner_generation, "mainGeneration": new_id(), "partitionKey": context.partition_key, "targetId": "controlled-target", "navigationEpoch": 1, "permissionEpoch": kwargs["permission_epoch"], "expiresAt": 4070908800000, "state": "ready", "url": "https://controlled.example/"}, "synthetic-capability")

    def snapshot(self, lease):
        return lease.snapshot

    def execute(self, lease, action, **kwargs):
        if lease.snapshot["state"] != "ready":
            raise GatewayError("gate_closed")
        self.actions.append((action, kwargs))
        if self.error:
            raise self.error
        if action["kind"] == "navigate":
            lease.snapshot["navigationEpoch"] += 1
            lease.snapshot["url"] = action["url"]
        return {"text": "Controlled page result"}

    def control(self, lease, operation, **kwargs):
        self.controls.append((operation, kwargs))
        lease.snapshot["state"] = {"resume": "ready", "pause": "paused", "takeover": "paused", "stop": "closed", "revoke": "revoked"}[operation]
        if "permission_epoch" in kwargs:
            lease.snapshot["permissionEpoch"] = kwargs["permission_epoch"]
        return lease.snapshot


def fixture(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    profile_id = new_id()
    store = IndependentStore(home, profile_id)
    store.register_profile(BackendProfileRef(backend_profile_id=profile_id, name="default", canonical_home=str(home)))
    resolver = ScopeResolver(store, profiles_provider=lambda: [{"name": "default", "path": str(home), "is_default": True}])
    factory, gateway = Factory(), Gateway()
    manager = RunManager(store, resolver, gateway, worker_factory=factory)
    return home, store, manager, factory, gateway


def dispatch(home, store, manager, slug, instruction="Wait for controlled provider", effects=("read",)):
    space = Space(slug, custom_root=home / "spaces")
    if not space.config_path.exists():
        space.save_config({"name": slug}, mint_space_id=True)
    scope = Scope(backend_profile_id=store.backend_profile_id, space_id=space.load_config()["space_id"], browser_profile_id="default")
    if not store.get_binding(scope):
        store.bind_space(SpaceBinding(scope=scope, native_slug=slug, partition_key="persist:test_" + slug))
    assistant = store.ensure_assistant(scope)
    source = new_id()
    assistant = store.update_assistant(scope, assistant.revision, lambda value: value.model_copy(update={"messages": (*value.messages, {"id": source, "role": "user", "content": instruction})}))
    request = TaskDispatchRequest(client_request_id=new_id(), scope=scope, assistant_conversation_id=assistant.conversation_id, source_message_id=source, kind="start_chat", title=slug, instruction=instruction)
    result = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="test-provider", model="test-model"), permissions=PermissionScope(browser_origins=("https://controlled.example",), allowed_effects=effects))
    return store.get_run(result.run_id)


def eventually(assertion, timeout=3):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        try:
            result = assertion()
            if result is None or result is True:
                return
            raise AssertionError("Condition is not true yet")
        except AssertionError:
            time.sleep(0.02)
    result = assertion()
    assert result is None or result is True


def assert_state(store, run_id, state):
    assert store.get_run(run_id).state == state


def test_retire_scope_commits_tombstone_before_effects_and_retries_known_targets(tmp_path):
    home, store, manager, factory, gateway = fixture(tmp_path)
    from runtime.independent.scope import ScopeError
    try:
        run = dispatch(home, store, manager, "retirement")
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        context = store.get_run_context(run.run_id)
        lease = manager._browser(context)
        binding = store.get_binding(run.scope)
        original = gateway.control
        attempts = []
        def unavailable(target, operation, **kwargs):
            assert store.get_binding(run.scope).tombstoned_at is not None
            assert store.get_permission_state(run.scope)["permissions"]["revoked"]
            attempts.append((target.lease_id, operation))
            raise GatewayError("controlled_main_unavailable")
        gateway.control = unavailable
        retired = manager.retire_scope(run.scope, expected_revision=binding.revision)
        assert not retired["acknowledged"] and retired["pendingRuns"] == [run.run_id]
        assert attempts == [(lease.lease_id, "revoke")]
        assert not factory.handles[run.run_id].is_alive
        assert store.get_run(run.run_id).state == "interrupted"
        assert run.run_id not in ComputeAdmission._owners
        with pytest.raises(ScopeError):
            manager.make_context(run.scope, context.provider)
        with pytest.raises(RevisionConflict):
            manager.retire_scope(run.scope, expected_revision=999)
        gateway.control = original
        # The native directory may already be gone. Retry uses durable scope
        # identity and the original real handle, never a new resolver binding.
        manager.resolver.resolve = lambda *_: (_ for _ in ()).throw(AssertionError("deleted Space must not resolve"))
        retried = manager.retire_scope(run.scope, expected_revision=binding.revision)
        assert retried["acknowledged"] and retried["acknowledgedRuns"] == [run.run_id]
        assert retried["permissionRevision"] == retired["permissionRevision"]
        assert retried["controlEpoch"] == retired["controlEpoch"]
        assert gateway.controls[-1][0] == "revoke"
    finally:
        manager.shutdown()
        store.close()


def test_retire_scope_stops_live_handle_even_if_run_was_already_terminal(tmp_path):
    home, store, manager, factory, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "terminal-retirement")
        store.transition_run(run.run_id, "running")
        context = store.get_run_context(run.run_id)
        handle = Handle(context, {"mode": "run"})
        manager._workers[run.run_id] = handle
        assert ComputeAdmission.acquire(run.run_id, run.scope)
        store.transition_run(run.run_id, "completed")
        retired = manager.retire_scope(run.scope, expected_revision=1)
        assert retired["acknowledged"] and not handle.is_alive
        assert run.run_id not in ComputeAdmission._owners
        assert store.get_run(run.run_id).state == "completed"
    finally:
        manager._workers.clear()
        manager.shutdown()
        store.close()


def test_retire_scope_stops_metadata_worker_and_archives_undeliverable_result(tmp_path):
    home, store, manager, _, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "projection-retirement")
        context = store.get_run_context(run.run_id)
        projection = Handle(context, {"mode": "run"})
        manager._projection_handles[id(projection)] = (context, projection)
        retired = manager.retire_scope(run.scope, expected_revision=1)
        assert retired["acknowledged"] and not projection.is_alive
        # A retired recipient is never silently reported as delivered, and
        # does not kill the queue owner with a deleted-Space resolver error.
        manager.tick()
        outbox = store.get_outbox("result:" + run.run_id)
        assert outbox["state"] == "failed" and outbox["errorCode"] == "scope_retired"
        assert outbox["nextAttemptAt"] is None
        manager.tick()
        assert store.get_outbox("result:" + run.run_id)["attempts"] == 1
    finally:
        manager._projection_handles.clear()
        manager.shutdown()
        store.close()


def test_scope_retirement_creation_race_retains_unacknowledged_target(tmp_path):
    home, store, manager, _, gateway = fixture(tmp_path)
    entered, release, errors = threading.Event(), threading.Event(), []
    try:
        run = dispatch(home, store, manager, "creating-retirement")
        store.transition_run(run.run_id, "running")
        context = store.get_run_context(run.run_id)
        create, control = gateway.create_lease, gateway.control
        def blocked_create(*args, **kwargs):
            entered.set()
            assert release.wait(3)
            return create(*args, **kwargs)
        def lost_stop(*args, **kwargs):
            raise GatewayError("controlled lost creation-stop acknowledgement")
        gateway.create_lease, gateway.control = blocked_create, lost_stop
        def browser_creation():
            try:
                manager._browser(context)
            except Exception as exc:
                errors.append(exc)
        creator = threading.Thread(target=browser_creation)
        creator.start()
        assert entered.wait(3)
        first = manager.retire_scope(run.scope, expected_revision=1)
        assert not first["acknowledged"] and first["pendingRuns"] == [run.run_id]
        release.set()
        creator.join(timeout=3)
        assert not creator.is_alive() and errors
        assert run.run_id in manager._revoking_targets[run.scope.key]
        gateway.control = control
        retry = manager.retire_scope(run.scope, expected_revision=1)
        assert retry["acknowledged"] and retry["acknowledgedRuns"] == [run.run_id]
        assert first["permissionRevision"] == retry["permissionRevision"]
    finally:
        release.set()
        manager.shutdown()
        store.close()


def test_human_control_receipt_matches_exact_request_and_permission_claim(tmp_path, monkeypatch):
    home, store, manager, _, _ = fixture(tmp_path)
    from types import SimpleNamespace
    from runtime.independent.control_api import _manager_request
    try:
        run = dispatch(home, store, manager, "human-control")
        permissions = store.get_permission_state(run.scope)
        candidate = SimpleNamespace(run_id=run.run_id, expected_revision=run.state_revision, control_epoch=run.control_epoch)
        request = _manager_request(candidate, "pause", run.scope, permissions)
        request_id = new_id()
        result = manager.control(run.run_id, "pause", expected_revision=run.state_revision,
            control_epoch=run.control_epoch, actor_ref="user:desktop", expected_scope=run.scope,
            expected_permission_revision=permissions["revision"], expected_permission_epoch=permissions["controlEpoch"],
            client_request_id=request_id)
        assert result.state == "paused"
        cached = store.get_request_result(run.scope, "manager_control", request_id, request)
        assert cached == result.model_dump(mode="json", by_alias=True)
        assert manager.control(run.run_id, "pause", expected_revision=run.state_revision,
            control_epoch=run.control_epoch, actor_ref="user:desktop", expected_scope=run.scope,
            expected_permission_revision=permissions["revision"], expected_permission_epoch=permissions["controlEpoch"],
            client_request_id=request_id) == result
        current = store.get_run(run.run_id)
        actual_transition = store.transition_run
        # A revocation commits at the last boundary before the state claim.
        # The transition must check the permission epoch inside its own txn.
        changed = []
        def revoke_before_claim(*args, **kwargs):
            if not changed:
                changed.append(True)
                store.revoke_permissions(run.scope, expected_revision=permissions["revision"])
            return actual_transition(*args, **kwargs)
        monkeypatch.setattr(store, "transition_run", revoke_before_claim)
        with pytest.raises(RevisionConflict, match="permission"):
            manager.control(run.run_id, "resume", expected_revision=current.state_revision,
                control_epoch=current.control_epoch, actor_ref="user:desktop", expected_scope=run.scope,
                expected_permission_revision=permissions["revision"], expected_permission_epoch=permissions["controlEpoch"])
        assert store.get_run(run.run_id).state == "paused"
    finally:
        manager.shutdown()
        store.close()


def test_native_scope_drift_fails_one_queue_item_without_killing_next_scope(tmp_path):
    home, store, manager, factory, _ = fixture(tmp_path)
    try:
        first = dispatch(home, store, manager, "changed-native-id")
        second = dispatch(home, store, manager, "preserved-native-id")
        native = Space("changed-native-id", custom_root=home / "spaces")
        config = native.load_config()
        config["space_id"] = new_id()
        native.save_config(config)
        manager.tick()
        assert store.get_run(first.run_id).state == "failed"
        assert store.get_run(first.run_id).reason_code == "scope_mismatch"
        eventually(lambda: second.run_id in factory.handles)
        assert store.get_run(second.run_id).state == "running"
        assert first.run_id not in factory.handles
        assert first.run_id not in ComputeAdmission._owners
        manager.tick()
        assert store.get_outbox("result:" + first.run_id)["errorCode"] == "result_projection_failed"
    finally:
        manager.shutdown()
        store.close()


def test_lost_main_authority_is_dropped_even_when_cleanup_raises(tmp_path):
    _, store, manager, _, _ = fixture(tmp_path)
    try:
        def broken_cleanup(_):
            raise RuntimeError("controlled cleanup failure")
        manager.interrupt_active = broken_cleanup
        with pytest.raises(RuntimeError, match="controlled cleanup"):
            manager.attach_gateway(None)
        assert manager.gateway is None
    finally:
        manager.shutdown()
        store.close()


def test_connection_revoke_preserves_rights_and_epoch_and_waits_for_real_main_ack(tmp_path):
    home, store, manager, _, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "connection-revoke")
        store.transition_run(run.run_id, "running")
        context = store.get_run_context(run.run_id)
        manager._browser(context)
        # Simulate the repository's already committed, same-transaction epoch.
        rights = store.set_permission_state(run.scope, context.effective_permissions, expected_revision=1)
        original_control = gateway.control
        def fail_control(*args, **kwargs):
            raise GatewayError("controlled_main_lost")
        gateway.control = fail_control
        first = manager.revoke_connections(run.scope)
        assert first["acknowledged"] is False and first["state"] == "revoking"
        assert store.get_run(run.run_id).state == "interrupted"
        state = store.get_permission_state(run.scope)
        assert state["revision"] == rights["revision"]
        assert state["controlEpoch"] == rights["controlEpoch"]
        assert state["permissions"] == rights["permissions"].model_dump(mode="json", by_alias=True)
        assert state["controlSequence"] >= rights["controlSequence"]
        gateway.control = original_control
        second = manager.revoke_connections(run.scope)
        assert second["acknowledged"] is True
        assert second["acknowledgedRuns"] == [run.run_id]
        state = store.get_permission_state(run.scope)
        assert state["revision"] == rights["revision"]
        assert state["controlEpoch"] == rights["controlEpoch"]
        assert state["permissions"] == rights["permissions"].model_dump(mode="json", by_alias=True)
        assert state["controlSequence"] >= rights["controlSequence"]
    finally:
        manager.shutdown()
        store.close()


def test_main_events_before_lease_creation_response_are_bound_and_preserved(tmp_path):
    home, store, manager, _, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "event-race")
        run = store.transition_run(run.run_id, "running")
        context = store.get_run_context(run.run_id)
        original = gateway.create_lease
        def create(context, **kwargs):
            lease = original(context, **kwargs)
            manager.browser_event({"kind": "created", "lease": dict(lease.snapshot)})
            return lease
        gateway.create_lease = create
        lease = manager._browser(context)
        assert lease.lease_id == manager.browser_snapshot(run.run_id)["leaseId"]
        assert not manager._early_browser_events and not manager._browser_creating
    finally:
        manager.shutdown()
        store.close()


def test_main_lost_event_before_create_response_never_restores_ready_target(tmp_path):
    from runtime.independent.policy import PolicyDenied
    home, store, manager, _, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "lost-race")
        run = store.transition_run(run.run_id, "running")
        original = gateway.create_lease
        def create(context, **kwargs):
            lease = original(context, **kwargs)
            manager.browser_event({"kind": "lost", "reason": "controlled_target_lost", "lease": {**lease.snapshot, "state": "lost"}})
            return lease
        gateway.create_lease = create
        with pytest.raises(PolicyDenied):
            manager._browser(store.get_run_context(run.run_id))
        assert store.get_run(run.run_id).state == "interrupted"
        assert not manager._leases and not manager._browser_creating
    finally:
        manager.shutdown()
        store.close()


def test_queue_two_global_one_scope_and_stop_release_next_slot(tmp_path):
    home, store, manager, factory, _ = fixture(tmp_path)
    try:
        a = dispatch(home, store, manager, "a")
        second_a = dispatch(home, store, manager, "a")
        b = dispatch(home, store, manager, "b")
        c = dispatch(home, store, manager, "c")
        manager.tick()
        eventually(lambda: assert_state(store, a.run_id, "running"))
        assert store.get_run(b.run_id).state == "running"
        assert store.get_run(second_a.run_id).state == "queued"
        assert store.get_run(c.run_id).state == "queued"
        current = store.get_run(a.run_id)
        stopped = manager.control(a.run_id, "cancel", expected_revision=current.state_revision, client_request_id=new_id())
        assert stopped.state == "cancelled"
        manager.tick()
        assert store.get_run(second_a.run_id).state == "running"
        assert store.get_run(c.run_id).state == "queued"
        assert not factory.handles[a.run_id].is_alive
    finally:
        manager.shutdown()
        store.close()


def test_pause_ack_is_at_next_actual_provider_boundary_resume_reuses_worker(tmp_path):
    home, store, manager, factory, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "a")
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        handle = factory.handles[run.run_id]
        eventually(lambda: len(handle.replies) == 1)
        current = store.get_run(run.run_id)
        assert manager.control(run.run_id, "pause", expected_revision=current.state_revision).state == "pausing"
        assert store.get_run(run.run_id).state == "pausing"
        handle.request("usage", measuredTokens=1)
        eventually(lambda: assert_state(store, run.run_id, "paused"))
        assert store.latest_checkpoint(run.run_id)["safeBoundary"]
        paused = store.get_run(run.run_id)
        manager.control(run.run_id, "resume", expected_revision=paused.state_revision)
        manager.tick()
        eventually(lambda: len(handle.replies) == 2)
        assert factory.handles[run.run_id] is handle
        assert store.get_run(run.run_id).state == "running"
    finally:
        manager.shutdown()
        store.close()


def test_provider_budget_exhaustion_prevents_next_request(tmp_path):
    home, store, manager, factory, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "a")
        context = store.get_run_context(run.run_id)
        store._conn.execute("UPDATE ia_runs SET context_json=? WHERE run_id=?", (context.model_copy(update={"budget": context.budget.model_copy(update={"max_provider_requests": 1})}).model_dump_json(by_alias=True), run.run_id))
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        handle = factory.handles[run.run_id]
        eventually(lambda: len(handle.replies) == 1)
        handle.request("provider_request")
        eventually(lambda: assert_state(store, run.run_id, "failed"))
        assert store.get_run(run.run_id).reason_code == "provider_request_budget_exhausted"
        assert store.get_run(run.run_id).counters.provider_requests == 1
    finally:
        manager.shutdown()
        store.close()


def test_revoke_is_ordered_gateway_ack_and_late_reply_cannot_complete(tmp_path):
    home, store, manager, factory, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "a")
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        context = store.get_run_context(run.run_id)
        lease = manager._browser(context)
        result = manager.revoke(run.scope, expected_revision=1)
        assert result["acknowledged"] and result["state"] == "revoked"
        assert gateway.controls[0][0] == "revoke"
        assert gateway.controls[0][1]["permission_epoch"] > 0
        assert store.get_run(run.run_id).state == "interrupted"
        handle = factory.handles[run.run_id]
        handle.events.put({"kind": "result", "runId": run.run_id, "value": {"response": "too late"}})
        assert store.get_run(run.run_id).state == "interrupted"
        assert lease.snapshot["state"] in {"revoked", "closed"}
    finally:
        manager.shutdown()
        store.close()


def test_generic_mutation_waits_for_exact_approval_and_unknown_effect_is_not_retried(tmp_path):
    home, store, manager, factory, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "a", effects=("read", "write"))
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        handle = factory.handles[run.run_id]
        eventually(lambda: len(handle.replies) == 1)
        gateway.error = GatewayError("gateway_transport_lost", in_flight=True, retryable=True)
        handle.request("tool", scope=run.scope.model_dump(mode="json", by_alias=True), controlEpoch=0, tool="independent_browser_click", args={"selector": "#submit"})
        eventually(lambda: assert_state(store, run.run_id, "waiting_for_approval"))
        approval = store.list_approvals(run.scope)[0]
        assert gateway.actions == []
        manager.approve(approval.approval_id, approved=True, actor_ref="user:controlled", action_digest=approval.action_digest, expected_permission_revision=1)
        manager.tick()
        eventually(lambda: assert_state(store, run.run_id, "failed"))
        assert len(gateway.actions) == 1
        assert store.list_actions(run.run_id)[0].state == "unknown"
        assert any(lease["resourceKey"].startswith("account:") for lease in store.list_leases(run_id=run.run_id))
    finally:
        manager.shutdown()
        store.close()


def test_duplicate_control_and_scope_activity_are_backend_facts(tmp_path):
    home, store, manager, _, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "a")
        request = new_id()
        stopped = manager.control(run.run_id, "cancel", expected_revision=1, client_request_id=request)
        duplicate = manager.control(run.run_id, "cancel", expected_revision=1, client_request_id=request)
        assert duplicate == stopped
        with pytest.raises(Exception):
            manager.control(run.run_id, "resume", expected_revision=1, client_request_id=request)
        snapshot = manager.activity(run.scope)
        assert snapshot.runs[0].state == "cancelled" and snapshot.dispatches[0].run_id == run.run_id
        assert snapshot.source_state == "live" and snapshot.watermark > 0
    finally:
        manager.shutdown()
        store.close()


def test_managed_space_without_actual_nova_capability_denies_admission(tmp_path):
    home, store, manager, _, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "a")
        space = Space("a", custom_root=home / "spaces")
        config = space.load_config()
        config["nova_management"] = {"enrolled": True, "yolo": True, "revision": 1}
        space.save_config(config)
        manager.tick()
        assert store.get_run(run.run_id).state == "failed"
        assert store.get_run(run.run_id).reason_code == "nova_governance_admission_required"
    finally:
        manager.shutdown()
        store.close()


def test_actual_clarification_answer_binds_checkpoint_epoch_actor_and_idempotency(tmp_path):
    from runtime.independent.contracts import WaitingFor
    from runtime.independent.policy import PolicyDenied
    home, store, manager, _, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "clarification")
        store.transition_run(run.run_id, "running")
        checkpoint = store.save_checkpoint(run.run_id, {"summary": "Waiting for you", "question": "Which controlled source should be read?"})
        waiting = store.transition_run(run.run_id, "waiting_for_user", waiting_for=WaitingFor(kind="clarification"))
        arguments = {"expected_revision": waiting.state_revision, "client_request_id": new_id(),
            "question_identity": checkpoint["checkpointId"], "control_epoch": waiting.control_epoch,
            "answer": "Read source A", "actor_ref": "user:desktop"}
        with pytest.raises(PolicyDenied, match="question_identity_required"):
            manager.control(run.run_id, "resume", expected_revision=waiting.state_revision, answer="Blind old answer")
        for updates, reason in (({"actor_ref": "model:assistant"}, "human_actor"),
                ({"question_identity": new_id()}, "question_stale"), ({"control_epoch": waiting.control_epoch + 1}, "epoch_stale")):
            with pytest.raises(PolicyDenied, match=reason):
                manager.control(run.run_id, "answer", **{**arguments, **updates})
            assert store.latest_checkpoint(run.run_id) == checkpoint
            assert store.get_run(run.run_id) == waiting
        answered = manager.control(run.run_id, "answer", **arguments)
        assert answered.state == "queued"
        assert manager.control(run.run_id, "answer", **arguments) == answered
        actual = store.latest_checkpoint(run.run_id)
        assert actual["state"]["questionIdentity"] == checkpoint["checkpointId"]
        assert actual["state"]["question"] == checkpoint["state"]["question"]
        assert actual["state"]["answer"] == arguments["answer"]
        assert actual["state"]["actorRef"] == "user:desktop"
        with pytest.raises(RevisionConflict):
            manager.control(run.run_id, "answer", **{**arguments, "client_request_id": new_id()})
    finally:
        manager.shutdown()
        store.close()


def test_terminal_browser_ack_accepts_only_exact_retired_target_and_keeps_gateway_usable(tmp_path):
    from runtime.independent.policy import PolicyDenied
    home, store, manager, _, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "retired")
        store.transition_run(run.run_id, "running")
        context = store.get_run_context(run.run_id)
        lease = manager._browser(context)
        identity = dict(lease.snapshot)
        # Main can emit its terminal event synchronously before control's HTTP
        # response, and again after the parent removed the target ownership.
        original = gateway.control
        def stop_with_event(target, operation, **kwargs):
            value = original(target, operation, **kwargs)
            manager.browser_event({"kind": "closed", "lease": value})
            return value
        gateway.control = stop_with_event
        manager._close_browser(run.run_id)
        for kind in ("closed", "revoked", "lost"):
            manager.browser_event({"kind": kind, "lease": {**identity, "state": "closed"}})
        assert manager.gateway is gateway and run.run_id not in manager._leases
        assert store.get_run(run.run_id).state == "running"
        for key, value in (("leaseId", new_id()), ("runId", new_id()), ("scope", {**identity["scope"], "browserProfileId": "foreign"}),
                ("mainGeneration", new_id()), ("runnerGeneration", new_id())):
            with pytest.raises(PolicyDenied, match="scope_mismatch"):
                manager.browser_event({"kind": "closed", "lease": {**identity, key: value}})
        with pytest.raises(PolicyDenied, match="scope_mismatch"):
            manager.browser_event({"kind": "created", "lease": identity})
        second = dispatch(home, store, manager, "next")
        store.transition_run(second.run_id, "running")
        assert manager._browser(store.get_run_context(second.run_id)).snapshot["state"] == "ready"
    finally:
        manager.shutdown()
        store.close()

import threading

import pytest

from runtime.independent.governance import LegacyComputeLease, ManagedBrowserAdmission
from runtime.independent.manager import ComputeAdmission
from runtime.independent.contracts import Scope, new_id


def test_actual_shared_pool_counts_both_engines_and_waiting_releases_slot():
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="default")
    other = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="default")
    first, second, third = new_id(), new_id(), new_id()
    legacy = LegacyComputeLease("swarm:controlled-project:" + new_id())
    try:
        assert ComputeAdmission.acquire(first, scope)
        assert legacy.wait_acquire()
        assert not ComputeAdmission.acquire(second, other)
        legacy.release()  # existing Swarm safe pause callback
        assert ComputeAdmission.acquire(second, other)
        assert not ComputeAdmission.acquire_legacy(third)
        ComputeAdmission.release(second)
        assert legacy.wait_acquire()
    finally:
        ComputeAdmission.release(first)
        ComputeAdmission.release(second)
        ComputeAdmission.release(third)
        legacy.release()


def test_waiting_legacy_cancel_cannot_enter_compute():
    ids = new_id(), new_id(), new_id()
    try:
        assert ComputeAdmission.acquire_legacy(ids[0])
        assert ComputeAdmission.acquire_legacy(ids[1])
        cancelled = threading.Event()
        cancelled.set()
        assert LegacyComputeLease(ids[2]).wait_acquire(cancelled) is False
        assert ids[2] not in ComputeAdmission._owners
    finally:
        for identity in ids:
            ComputeAdmission.release(identity)


def test_managed_browser_needs_real_nova_capability_and_cannot_invent_one():
    assert ManagedBrowserAdmission()(object()) is False


def test_real_swarm_background_entrypoint_shares_slot_and_releases_during_pause(tmp_path):
    from web.api import swarm
    reached, pause, resume, finished = (threading.Event() for _ in range(4))
    observed = []
    project, run_id = tmp_path / "project", new_id()
    project.mkdir()
    owner = "swarm:" + str(project.resolve()) + ":" + run_id

    class Service:
        def execute_run(self, project_root, identity, *, on_pause_wait, on_resume):
            observed.append(owner in ComputeAdmission._owners)
            reached.set()
            pause.wait(2)
            on_pause_wait()
            observed.append(owner not in ComputeAdmission._owners)
            resume.wait(2)
            on_resume()
            observed.append(owner in ComputeAdmission._owners)
            finished.set()

    execution = swarm._launch_background_execution(Service(), project, run_id)
    try:
        execution.start_gate.set()
        assert reached.wait(2)
        pause.set()
        # Resume is issued only after the release boundary was observed.
        for _ in range(100):
            if len(observed) >= 2:
                break
            threading.Event().wait(0.01)
        assert observed[:2] == [True, True]
        resume.set()
        assert finished.wait(2)
        execution.thread.join(2)
        assert observed == [True, True, True]
        assert owner not in ComputeAdmission._owners
    finally:
        execution.cancelled.set()
        pause.set()
        resume.set()
        execution.start_gate.set()
        execution.thread.join(2)
        ComputeAdmission.release(owner)


def test_native_supervisor_issues_browser_only_family_and_preserves_global_slot_and_revisions(tmp_path):
    from dataclasses import replace
    from nova.space_supervisor import ManagedSpaceGovernance, ManagedSpaceSupervisor
    from swarm_core.store import ProjectSwarmStore
    root = tmp_path / "registered-project"
    root.mkdir()
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="controlled")
    record = ManagedSpaceGovernance.from_values(space_id=scope.space_id, canonical_root=root,
                yolo=True, enrolled=True, revision=1, policy_identity="real-policy:1")
    records = {"controlled": record, "other": replace(record, space_id=new_id())}
    supervisor = ManagedSpaceSupervisor(ledger_path=tmp_path / "native-supervisor.sqlite", governance_resolver=records.__getitem__)
    binding = {"runId": new_id(), "scope": scope.model_dump(mode="json", by_alias=True), "contextDigest": "a" * 64,
               "runnerGeneration": new_id(), "callBudget": 2, "model": "controlled", "autonomy": "execute_safe"}
    admission = supervisor.admit_independent_browser("controlled", {"goal": "Read approved page", "runId": binding["runId"]}, binding=binding)
    assert admission.status == "created" and admission.capability is not None
    assert admission.capability._allowed_action_families == ("independent_browser",)
    assert supervisor.admit("other", {"goal": "Existing Nova work"}).reason == "active_limit"
    assert supervisor.start_admitted_run(admission.capability, dispatcher=lambda *_: True)
    context = supervisor.resolve_action_context(admission.capability)
    assert context is not None and context.allowed_action_families == ("independent_browser",)
    child = ProjectSwarmStore(root).get_run(admission.run_id)
    assert child.metadata["pack"] == "independent-browser"
    assert supervisor.execution_options_for_run(root, child).blocked_reason == "independent_browser_host_required"
    records["controlled"] = replace(record, revision=2, policy_identity="real-policy:2")
    assert supervisor.resolve_action_context(admission.capability) is None
    assert ProjectSwarmStore(root).get_run(admission.run_id).status == "paused"


@pytest.mark.parametrize("autonomy", ["reviewed_execution", "execute_safe"])
def test_native_policy_claims_browser_actions_once_and_retains_review_quorum_gate(tmp_path, autonomy):
    from nova.space_supervisor import ManagedSpaceGovernance, ManagedSpaceSupervisor
    from swarm_core.policy import PolicyGate, PolicyStatus
    from swarm_core.store import ProjectSwarmStore
    from swarm_core.types import ActionProposal, RequestedToolAction
    root = tmp_path / "registered-project"
    root.mkdir()
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="controlled")
    governance = ManagedSpaceGovernance.from_values(space_id=scope.space_id, canonical_root=root,
                   yolo=True, enrolled=True, revision=1, policy_identity="real-policy:1")
    supervisor = ManagedSpaceSupervisor(ledger_path=tmp_path / "native-supervisor.sqlite", governance_resolver=lambda _: governance)
    binding = {"runId": new_id(), "scope": scope.model_dump(mode="json", by_alias=True), "contextDigest": "b" * 64,
               "runnerGeneration": new_id(), "callBudget": 2, "model": "controlled", "autonomy": autonomy}
    admitted = supervisor.admit_independent_browser("controlled", {"goal": "Approved read"}, binding=binding)
    assert supervisor.start_admitted_run(admitted.capability, dispatcher=lambda *_: True)
    store = ProjectSwarmStore(root)
    run = store.get_run(admitted.run_id)
    proposal = ActionProposal(proposal_id=new_id(), category="independent_browser", reversible=True, external=False,
                    cost_increasing=False, evidence_refs=("controlled-verifier",), requested_action=RequestedToolAction(
                        name="independent_browser.read", workspace=root, arguments={"scope": binding["scope"]}))
    gate = PolicyGate(store, default_autonomy="execute_safe")
    first = gate.authorize_and_claim(proposal, run, proposal.declared_capabilities())
    if autonomy == "reviewed_execution":
        assert first.status is PolicyStatus.NEEDS_MODEL_QUORUM
        with store._connection() as connection:
            assert connection.execute("SELECT COUNT(*) FROM action_executions WHERE run_id=?", (run.run_id,)).fetchone()[0] == 0
    else:
        assert first.status is PolicyStatus.ALLOWED
        repeated = gate.authorize_and_claim(proposal, run, proposal.declared_capabilities())
        assert repeated.status is PolicyStatus.BLOCKED and repeated.reason == "execution_already_claimed"


def _bound_managed_run(tmp_path, *, autonomy="execute_safe", budget=2, effects=("read",)):
    from test_independent_dispatch import manager_fixture
    from runtime.independent.contracts import PermissionScope, ProviderSelection, Budget
    from web.api.space_engine import update_nova_management, space_root_fingerprint
    from swarm_core.config import initialize_project
    import yaml
    home, space, scope, store, manager, request = manager_fixture(tmp_path)
    root = tmp_path / "registered-project"
    root.mkdir()
    configuration = initialize_project(root).config_path
    settings = yaml.safe_load(configuration.read_text("utf-8"))
    settings["default_autonomy"] = autonomy
    configuration.write_text(yaml.safe_dump(settings), "utf-8")
    config = space.load_config()
    config["project_dir"] = str(root)
    space.save_config(config)
    binding = store.get_binding(scope)
    store.bind_space(binding.model_copy(update={"workspace_locator": str(root), "revision": 2}), expected_revision=1)
    update_nova_management(space, yolo=True, enrolled=True,
        confirmation={"space_id": scope.space_id, "root_fingerprint": space_root_fingerprint(root)},
        trusted_project_root=root, actor="dashboard:" + "a" * 64)
    adapter = ManagedBrowserAdmission()
    manager.governance_admission = adapter
    adapter.bind(manager)
    manager._run_projection = lambda *_: {}
    permissions = PermissionScope(allowed_workspace_roots=(str(root),), allowed_effects=effects)
    dispatch = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="controlled", model="controlled"),
        permissions=permissions, budget=Budget(max_provider_requests=budget))
    context = store.get_run_context(dispatch.run_id)
    store.transition_run(dispatch.run_id, "running")
    return home, space, scope, store, manager, adapter, root, context


def test_real_manager_native_admission_budgets_file_claims_and_verified_terminal_release(tmp_path):
    from swarm_core.store import ProjectSwarmStore
    from runtime.independent.policy import PolicyDenied
    _, _, scope, store, manager, adapter, root, context = _bound_managed_run(tmp_path)
    page = root / "controlled.txt"
    page.write_text("Controlled native-bound file", "utf-8")
    try:
        assert manager._governance(context) is True
        authority = adapter._authorities[context.run_id]
        assert authority.project_root == root.resolve()
        assert manager._handle_request(context.run_id, {"requestKind": "provider_request", "requestId": new_id()}) == {"authorized": True}
        request_id = new_id()
        adapter.claim_provider(context, request_id)
        with pytest.raises(PolicyDenied, match="already_claimed"):
            adapter.claim_provider(context, request_id)
        with pytest.raises(PolicyDenied, match="call_budget"):
            adapter.claim_provider(context, new_id())
        result = manager._execute_tool(context, new_id(), "independent_file_read", {"path": str(page)})
        assert "Controlled native-bound file" in str(result)
        native = ProjectSwarmStore(root)
        with native._connection() as connection:
            assert connection.execute("SELECT COUNT(*) FROM action_executions WHERE run_id=?", (authority.native_run_id,)).fetchone()[0] == 1
        artifact = manager._write_artifact(context, "result", {"response": "Controlled read complete"})
        store.transition_run(context.run_id, "completed", result_ref=artifact)
        adapter.finish(context)
        assert native.get_run(authority.native_run_id).status == "completed"
        assert context.run_id not in adapter._authorities
        assert adapter.supervisor.admit("research", {"goal": "Next native work"}).status == "created"
    finally:
        manager.shutdown()
        store.close()


def test_actual_bound_manager_preserves_review_quorum_and_project_scope(tmp_path):
    from runtime.independent.policy import PolicyDenied
    from swarm_core.store import ProjectSwarmStore
    _, space, scope, store, manager, adapter, root, context = _bound_managed_run(tmp_path, autonomy="reviewed_execution")
    page = root / "controlled.txt"
    page.write_text("Controlled read", "utf-8")
    try:
        with pytest.raises(PolicyDenied, match="verifier_and_independent_model_quorum_required"):
            manager._execute_tool(context, new_id(), "independent_file_read", {"path": str(page)})
        authority = adapter._authorities[context.run_id]
        native = ProjectSwarmStore(root)
        with native._connection() as connection:
            assert connection.execute("SELECT COUNT(*) FROM action_executions WHERE run_id=?", (authority.native_run_id,)).fetchone()[0] == 0
        settings = space.load_config()
        settings["nova_management"]["revision"] += 1
        space.save_config(settings)
        with pytest.raises(PolicyDenied, match="nova_governance_not_enrolled"):
            manager._handle_request(context.run_id, {"requestKind": "provider_request", "requestId": new_id()})
        assert native.get_run(authority.native_run_id).status == "paused"
    finally:
        manager.shutdown()
        store.close()


def test_native_cancel_ack_waits_for_bound_effect_and_closes_later_dispatch(tmp_path):
    from nova.space_supervisor import ManagedSpaceSupervisor
    from runtime.independent.contracts import ActionRecord, digest_json
    from runtime.independent.policy import PolicyDenied
    _, _, scope, store, manager, adapter, root, context = _bound_managed_run(tmp_path)
    assert adapter(context)
    authority = adapter._authorities[context.run_id]
    cancelled, requested = threading.Event(), threading.Event()
    another = ManagedSpaceSupervisor(ledger_path=adapter.supervisor._ledger_path, governance_resolver=adapter._resolve_target)
    def cancel():
        requested.set()
        another.cancel(authority.capability._admission_id, actor="dashboard:" + "b" * 64)
        cancelled.set()
    thread = threading.Thread(target=cancel)
    record = ActionRecord(action_id=new_id(), run_id=context.run_id, step_id=new_id(), scope=scope,
        tool_id="independent_browser_read", canonical_args_digest=digest_json({"read": True}), intended_effect="read",
        authorization_ref=context.dispatch_id, permission_revision=context.permission_revision, control_epoch=0)
    try:
        with adapter.action_boundary(context, record, {}, None):
            thread.start()
            assert requested.wait(2)
            assert not cancelled.wait(.1)
        assert cancelled.wait(3)
        with pytest.raises(PolicyDenied, match="nova_capability_not_current"):
            with adapter.action_boundary(context, record.model_copy(update={"action_id": new_id()}), {}, None):
                pytest.fail("Native revocation must close dispatch")
    finally:
        thread.join(3)
        manager.shutdown()
        store.close()


def test_authoritative_project_scope_mapping_blocks_actual_legacy_same_space(tmp_path):
    from runtime.independent.governance import authoritative_scope_keys_for_project
    _, _, scope, store, manager, _, root, context = _bound_managed_run(tmp_path)
    lease = LegacyComputeLease("swarm:" + new_id(), scope_keys=authoritative_scope_keys_for_project(root))
    other = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="other")
    try:
        assert authoritative_scope_keys_for_project(root) == (scope.key,)
        assert lease.wait_acquire()
        assert not ComputeAdmission.acquire(context.run_id, scope)
        assert ComputeAdmission.acquire("other-" + new_id(), other)
    finally:
        for owner in tuple(ComputeAdmission._owners):
            ComputeAdmission.release(owner)
        lease.release()
        manager.shutdown()
        store.close()


def test_managed_mutation_mirrors_only_consumed_exact_actual_human_approval(tmp_path):
    from runtime.independent.contracts import ActionRecord, ApprovalView, digest_json
    from runtime.independent.policy import PolicyDenied
    from swarm_core.store import ProjectSwarmStore
    _, _, scope, store, manager, adapter, root, context = _bound_managed_run(tmp_path, effects=("read", "write"))
    record = ActionRecord(action_id=new_id(), run_id=context.run_id, step_id=new_id(), scope=scope,
        tool_id="independent_browser_click", canonical_args_digest=digest_json({"selector": "#controlled", "effect": "write"}),
        intended_effect="write", authorization_ref=context.dispatch_id, permission_revision=context.permission_revision, control_epoch=0)
    approval = ApprovalView(approval_id=new_id(), run_id=context.run_id, scope=scope,
        action_digest=record.canonical_args_digest, effect="write", target_summary="Controlled fixture target",
        permission_revision=context.permission_revision, expires_at="2099-01-01T00:00:00Z")
    try:
        store.prepare_action(record)
        store.create_approval(approval)
        store.decide_approval(approval.approval_id, approved=True, actor_ref="user:controlled-desktop",
            action_digest=record.canonical_args_digest, expected_permission_revision=context.permission_revision)
        with pytest.raises(PolicyDenied, match="concrete_human_approval_required"):
            with adapter.action_boundary(context, record, {"selector": "#controlled"}, approval.approval_id):
                pytest.fail("An approved but unclaimed action cannot dispatch")
        store.claim_action(record.action_id, expected_permission_revision=context.permission_revision,
            expected_control_epoch=0, approval_id=approval.approval_id)
        store.finish_action(record.action_id, "dispatched")
        assert store.get_approval(approval.approval_id).state == "consumed"
        with adapter.action_boundary(context, record, {"selector": "#controlled"}, approval.approval_id):
            pass  # Controlled effect; no real external user account.
        native = ProjectSwarmStore(root)
        authority = adapter._authorities[context.run_id]
        mirrored = native.list_approvals(authority.native_run_id)
        assert len(mirrored) == 1 and mirrored[0].approver_id == "user:controlled-desktop"
        store.finish_action(record.action_id, "succeeded")
        with pytest.raises(PolicyDenied, match="concrete_human_approval_required"):
            with adapter.action_boundary(context, record.model_copy(update={"action_id": new_id()}), {}, approval.approval_id):
                pytest.fail("A consumed approval cannot authorize another action")
    finally:
        manager.shutdown()
        store.close()

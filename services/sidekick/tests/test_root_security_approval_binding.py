"""Regression probe: write approval must remain attached to the same live target."""
import threading

from runtime.independent.contracts import new_id
import pytest
from test_independent_runs import assert_state, dispatch, eventually, fixture


def test_approved_action_is_denied_if_target_changes_without_navigation_epoch(tmp_path):
    """Same URL/args/scope/epoch must not let an approval float to a new target."""
    home, store, manager, factory, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "approval-target", effects=("read", "write"))
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        worker = factory.handles[run.run_id]
        eventually(lambda: len(worker.replies) == 1)
        worker.request("tool", scope=run.scope.model_dump(mode="json", by_alias=True),
            controlEpoch=0, tool="independent_browser_click", args={"selector": "#confirm"})
        eventually(lambda: assert_state(store, run.run_id, "waiting_for_approval"))
        approval = store.list_approvals(run.scope)[0]
        lease = manager._leases[run.run_id]

        # Model a live lease/target identity replacement that fails to advance
        # navigationEpoch. The approval contract requires this to be stale.
        lease.snapshot["targetId"] = "replacement-target"
        manager.approve(approval.approval_id, approved=True, actor_ref="user:controlled",
            action_digest=approval.action_digest, expected_permission_revision=approval.permission_revision,
            scope=run.scope)
        manager.tick()
        eventually(lambda: len(gateway.actions) == 1 or store.get_run(run.run_id).state == "failed")
        assert gateway.actions == []
        assert store.get_run(run.run_id).state == "failed"
    finally:
        manager.shutdown()
        store.close()


@pytest.mark.parametrize("field", ["leaseId", "targetId", "mainGeneration", "runnerGeneration"])
def test_approved_action_is_denied_if_any_captured_lease_identity_changes(tmp_path, field):
    home, store, manager, factory, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "approval-generation-" + field.lower(), effects=("read", "write"))
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        worker = factory.handles[run.run_id]
        eventually(lambda: len(worker.replies) == 1)
        worker.request("tool", scope=run.scope.model_dump(mode="json", by_alias=True),
            controlEpoch=0, tool="independent_browser_click", args={"selector": "#confirm"})
        eventually(lambda: assert_state(store, run.run_id, "waiting_for_approval"))
        approval = store.list_approvals(run.scope)[0]
        live_lease = manager._leases[run.run_id]
        live_lease.snapshot[field] = "replacement-" + field

        manager.approve(approval.approval_id, approved=True, actor_ref="user:controlled",
            action_digest=approval.action_digest, expected_permission_revision=approval.permission_revision,
            scope=run.scope)
        manager.tick()
        eventually(lambda: store.get_run(run.run_id).state == "failed")
        assert gateway.actions == []
        assert store.get_approval(approval.approval_id).state == "revoked"
    finally:
        manager.shutdown()
        store.close()


def test_approval_with_unchanged_target_identity_still_dispatches_exact_action(tmp_path):
    home, store, manager, factory, gateway = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "approval-target-unchanged", effects=("read", "write"))
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        worker = factory.handles[run.run_id]
        eventually(lambda: len(worker.replies) == 1)
        worker.request("tool", scope=run.scope.model_dump(mode="json", by_alias=True),
            controlEpoch=0, tool="independent_browser_click", args={"selector": "#confirm"})
        eventually(lambda: assert_state(store, run.run_id, "waiting_for_approval"))
        approval = store.list_approvals(run.scope)[0]
        action = store.list_actions(run.run_id)[0]
        assert approval.action_id == action.action_id
        assert approval.lease_id == action.lease_id
        assert approval.target_id == action.target_id == "controlled-target"
        assert approval.main_generation == action.main_generation
        assert approval.runner_generation == action.runner_generation
        assert approval.navigation_epoch == action.navigation_epoch

        manager.approve(approval.approval_id, approved=True, actor_ref="user:controlled",
            action_digest=approval.action_digest, expected_permission_revision=approval.permission_revision,
            scope=run.scope)
        manager.tick()
        eventually(lambda: len(gateway.actions) == 1)
        assert gateway.actions[0][0] == {"kind": "click", "selector": "#confirm", "effect": "write"}
        assert gateway.actions[0][1]["expected_identity"]["target_id"] == approval.target_id
        assert store.get_approval(approval.approval_id).state == "consumed"
    finally:
        manager.shutdown()
        store.close()

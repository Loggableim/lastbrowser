"""Focused restart-boundary checks for the independent run manager."""
from __future__ import annotations

import time

from runtime.independent.contracts import new_id
from runtime.independent.manager import RunManager
from runtime.independent.scope import ScopeResolver
from runtime.independent.store import IndependentStore

from test_independent_migrations import action, initialized, run_started


def test_manager_start_recovers_uncertain_mutation_without_replay_and_fences_run_lease(tmp_path):
    home, scope, store, request, definition = initialized(tmp_path)
    run, context = run_started(home, scope, store, request, definition)
    execution = store.acquire_lease(
        scope, run.run_id, "execution:" + run.run_id, context.runner_generation,
        "2099-01-01T00:00:00Z",
    )
    account = store.acquire_lease(
        scope, run.run_id, "account:controlled-target", context.runner_generation,
        "2099-01-01T00:00:00Z",
    )
    pending = store.prepare_action(action(run))
    store.claim_action(pending.action_id, expected_permission_revision=1, expected_control_epoch=0)
    store.finish_action(pending.action_id, "dispatched")
    store.close()

    recovered = IndependentStore(home, scope.backend_profile_id)
    resolver = ScopeResolver(
        recovered,
        profiles_provider=lambda: [{"name": "default", "path": str(home), "is_default": True}],
    )
    manager = RunManager(recovered, resolver, generation=new_id())
    try:
        manager.start()
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            current = recovered.get_run(run.run_id)
            if current.state == "interrupted":
                break
            time.sleep(0.02)

        assert current.state == "interrupted"
        assert current.reason_code == "process_restarted"
        assert recovered.get_action(pending.action_id).state == "unknown"
        assert recovered.list_leases(run_id=run.run_id) == (account,)
        all_leases = {row["leaseId"]: row for row in recovered.list_leases(run_id=run.run_id, active_only=False)}
        # Recovery makes the execution lease non-reusable before terminal
        # transition cleanup releases it; the still-ambiguous account lease is
        # intentionally retained for explicit reconciliation.
        assert all_leases[execution["leaseId"]]["state"] == "released"
        assert all_leases[account["leaseId"]]["state"] == "active"

        # Let the real manager ticker run: interrupted work must stay terminal.
        time.sleep(0.2)
        assert recovered.get_run(run.run_id).state == "interrupted"
        assert recovered.get_action(pending.action_id).state == "unknown"
        assert recovered.recover_after_restart(new_id()) == ()
    finally:
        manager.shutdown()
        recovered.close()

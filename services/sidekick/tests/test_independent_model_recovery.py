"""Manager-generation recovery does not stand in for local model process exit."""
import json

from runtime.independent.contracts import new_id
from runtime.local_ai.model_recovery import recover_model_leases
from test_local_ai_model_manager import manager_env
from test_local_ai_setup import setup_env


def test_manager_restart_preserves_actual_live_model_host_child_lease(setup_env):
    # The loader is the existing synthetic local HTTP fixture. These are real
    # host/child OS identities and residency ownership, not real model quality.
    with manager_env(setup_env) as (manager, request, scope, _, service, _):
        view = manager.wait(manager.acquire(request, actor="default").handle_id, scope, 5)
        assert view.state == "ready" and view.synthetic
        store = service._store(scope, "default")
        before = store._one("SELECT * FROM ia_resource_leases WHERE resource_key LIKE 'local_ai_model:%' AND state='active'")
        payload = json.loads(before["data_json"])
        assert payload["launchPending"] is False and payload["childPid"] == view.process_pid
        store.recover_after_restart(new_id())
        after = store._one("SELECT * FROM ia_resource_leases WHERE lease_id=?", (before["lease_id"],))
        assert after == before
        assert recover_model_leases(store, scope)["blockedLeaseIds"] == [before["lease_id"]]
        assert recover_model_leases(store, scope, identity_reader=lambda _: ("unknown", None))["blockedLeaseIds"] == [before["lease_id"]]
        assert manager.unload(view.handle_id, scope, 5)
        assert store._one("SELECT state FROM ia_resource_leases WHERE lease_id=?", (before["lease_id"],))["state"] == "released"

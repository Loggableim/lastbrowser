"""Scoped residency recovery needs actual OS creation identity, never empty maps."""
import json
from web.api.local_ai_setup import process_identity

def recover_model_leases(store, scope, *, identity_reader=process_identity):
    released = []; blocked = []
    with store.transaction():
        rows = store._conn.execute("SELECT lease_id,resource_key,owner_generation,data_json FROM ia_resource_leases WHERE scope_key=? AND state='active' AND run_id IS NULL AND resource_key LIKE 'local_ai_model:%'", (scope.key,)).fetchall()
        for row in rows:
            lease, resource, generation, raw = tuple(row)
            try:
                value = json.loads(raw)
                if value.get('ownerKind') != 'local_ai_model' or value.get('scopeKey') != scope.key or value.get('resourceKey') != resource:
                    raise ValueError('model_recovery_binding_invalid')
                if value.get('launchPending') is not False: raise ValueError('model_launch_not_recorded')
                dead = []
                for prefix in ('host', 'child'):
                    pid, creation = value.get(prefix + 'Pid'), value.get(prefix + 'CreationIdentity')
                    if type(pid) is not int or pid <= 0 or not isinstance(creation, str) or not creation: raise ValueError('model_process_identity_missing')
                    state, current = identity_reader(pid)
                    dead.append(state == 'dead' or state == 'alive' and current is not None and current != creation)
                if not all(dead): raise ValueError('model_process_exit_unverified')
            except (ValueError, TypeError, OSError):
                blocked.append(lease); continue
            store._conn.execute("UPDATE ia_resource_leases SET state='released',revision=revision+1 WHERE lease_id=? AND owner_generation=? AND state='active'", (lease, generation))
            released.append(lease)
    return {'releasedLeaseIds': released, 'blockedLeaseIds': blocked}

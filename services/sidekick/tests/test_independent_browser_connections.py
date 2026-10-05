import hashlib
from types import SimpleNamespace

import pytest

from runtime.independent.browser_connections import BrowserConnectionService
from runtime.independent.connections import ConnectionRepository
from runtime.independent.contracts import BackendProfileRef, Scope, SpaceBinding, canonical_json, new_id, utc_now
from runtime.independent.store import IndependentStore, IdempotencyConflict, ResourceBusy, RevisionConflict


@pytest.fixture
def accounts(tmp_path):
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="controlled")
    second = scope.model_copy(update={"space_id": new_id()})
    store = IndependentStore(tmp_path, scope.backend_profile_id)
    store.register_profile(BackendProfileRef(backend_profile_id=scope.backend_profile_id, name="controlled", canonical_home=str(tmp_path)))
    for value in (scope, second):
        store.bind_space(SpaceBinding(scope=value, native_slug="space-" + value.space_id, partition_key="persist:source-" + value.space_id))
    class Resolver:
        def resolve(self, value):
            if value not in (scope, second) or store.get_binding(value).tombstoned_at:
                raise PermissionError("Unknown Space")
    service = BrowserConnectionService(store, Resolver())
    yield service, store, scope, second
    store.close()


def start(service, scope, origin="http://127.0.0.1:35123"):
    return service.start(scope, {"origin": origin, "clientRequestId": new_id(), "mainGeneration": "main-owned", "runnerGeneration": "runner-owned"})


def proof(flow, **changes):
    scope = Scope.model_validate(flow["scope"])
    key = "persist:independent_agent_v1_" + hashlib.sha256(canonical_json([scope.backend_profile_id, scope.space_id, scope.browser_profile_id]).encode()).hexdigest()
    return {"leaseId": flow["leaseId"], "targetId": "owned-target", "partitionKey": key,
            "mainGeneration": flow["mainGeneration"], "runnerGeneration": flow["runnerGeneration"],
            "navigationEpoch": 1, "permissionEpoch": flow["permissionEpoch"], "urlOrigin": flow["origin"], "observedAt": utc_now(), **changes}


def confirm(service, scope, flow):
    opened = service.opened(scope, {"flowId": flow["flowId"], "mainProof": proof(flow)})
    payload = {"flowId": flow["flowId"], "expectedRevision": opened["revision"], "clientRequestId": new_id(), "accountLabel": "Controlled account", "mainProof": proof(flow)}
    return service.confirm(scope, payload), payload


def test_manual_setup_does_not_grant_work_permissions_or_claim_login(accounts):
    service, store, scope, _ = accounts
    before = store.get_permission_state(scope)
    flow = start(service, scope)
    assert store.get_permission_state(scope) == before
    opened = service.opened(scope, {"flowId": flow["flowId"], "mainProof": proof(flow)})
    assert opened["setupStatus"] == "awaiting_user" and opened["authenticationStatus"] == "unknown"
    assert service.catalog_entries(scope)[0]["connections"] == []
    assert not any(key in opened for key in ("mainProof", "mainGeneration", "runnerGeneration", "leaseId", "cookies"))


def test_confirmed_receipt_is_human_evidence_and_replays_without_new_authority(accounts):
    service, _, scope, _ = accounts
    flow = start(service, scope)
    confirmed, payload = confirm(service, scope, flow)
    assert confirmed["setupStatus"] == "user_confirmed" and confirmed["healthStatus"] == "unknown"
    assert confirmed["evidenceKind"] == "explicit_user_confirmation"
    assert service.confirm(scope, {**payload, "mainProof": proof(flow)}) == confirmed
    item = service.catalog_entries(scope)[0]["connections"][0]
    assert item["status"] == "configured" and item["authenticationStatus"] == "user_confirmed"
    assert item["revision"] == confirmed["revision"] and item["partitionKind"] == "dedicated_agent"
    with pytest.raises(IdempotencyConflict):
        service.confirm(scope, {**payload, "accountLabel": "Changed", "mainProof": proof(flow)})


@pytest.mark.parametrize("changed", [{"partitionKey": "persist:source"}, {"targetId": "foreign-target"},
    {"mainGeneration": "foreign-main"}, {"runnerGeneration": "foreign-runner"}, {"leaseId": new_id()},
    {"permissionEpoch": 999}, {"urlOrigin": "https://other.invalid"}, {"observedAt": "2020-01-01T00:00:00Z"}])
def test_confirmation_rejects_wrong_native_identity_and_stale_proof(accounts, changed):
    service, _, scope, _ = accounts
    flow = start(service, scope)
    opened = service.opened(scope, {"flowId": flow["flowId"], "mainProof": proof(flow)})
    with pytest.raises((PermissionError, ValueError)):
        service.confirm(scope, {"flowId": flow["flowId"], "expectedRevision": opened["revision"], "clientRequestId": new_id(), "mainProof": proof(flow, **changed)})
    assert service.poll(scope, {"flowId": flow["flowId"]})["setupStatus"] == "awaiting_user"


def test_two_scopes_and_a_restart_are_isolated(accounts):
    service, _, scope, second = accounts
    first = start(service, scope)
    other = start(service, second)
    assert first["flowId"] != other["flowId"] and proof(first)["partitionKey"] != proof(other)["partitionKey"]
    with pytest.raises(PermissionError):
        service.poll(second, {"flowId": first["flowId"]})
    with pytest.raises(ResourceBusy):
        start(service, scope)
    fresh = service.start(scope, {"origin": first["origin"], "clientRequestId": new_id(), "mainGeneration": "restarted-main", "runnerGeneration": "runner-owned"})
    assert fresh["flowId"] != first["flowId"]
    assert service.poll(scope, {"flowId": first["flowId"]})["setupStatus"] == "interrupted"
    assert service.poll(second, {"flowId": other["flowId"]})["setupStatus"] == "starting"


def test_revocation_during_login_prevents_confirmation(accounts):
    service, store, scope, _ = accounts
    flow = start(service, scope)
    opened = service.opened(scope, {"flowId": flow["flowId"], "mainProof": proof(flow)})
    permissions = store.get_permission_state(scope)
    store.revoke_permissions(scope, expected_revision=permissions["revision"])
    with pytest.raises((PermissionError, RevisionConflict)):
        service.confirm(scope, {"flowId": flow["flowId"], "expectedRevision": opened["revision"], "clientRequestId": new_id(), "mainProof": proof(flow)})
    assert service.poll(scope, {"flowId": flow["flowId"]})["reasonCode"] == "setup_permission_changed"


def test_runtime_requires_explicit_current_binding_and_logout_closes_authority_first(accounts):
    service, store, scope, second = accounts
    flow = start(service, scope)
    confirmed, confirm_payload = confirm(service, scope, flow)
    catalog = {"scope": scope.model_dump(by_alias=True), "entries": service.catalog_entries(scope)}
    binding = ConnectionRepository(store).bind(scope, {"capabilityId": "browser.account", "connectionId": confirmed["connectionId"], "permittedUse": ["browser.account.use"], "expectedRevision": 0, "clientRequestId": new_id()}, catalog)
    request = {"accountBindings": [{"bindingId": binding.binding_id, "connectionId": binding.connection_id, "connectionRevision": binding.connection_revision, "revision": binding.revision}]}
    assert service.authorize(scope, request)["accounts"][0]["origin"] == flow["origin"]
    with pytest.raises(PermissionError):
        service.authorize(second, request)
    with pytest.raises(PermissionError):
        service.authorize(scope, {"accountBindings": [{**request["accountBindings"][0], "connectionRevision": 999}]})
    pending = service.begin_logout(scope, {"connectionId": confirmed["connectionId"], "expectedRevision": confirmed["revision"], "clientRequestId": new_id()})
    assert pending["setupStatus"] == "revoking"
    with pytest.raises(PermissionError):
        service.authorize(scope, request)
    with pytest.raises(PermissionError):
        service.confirm(scope, confirm_payload)
    final = service.complete_logout(scope, {"connectionId": pending["connectionId"], "expectedRevision": pending["revision"], "cleanupAcknowledged": False})
    assert final["setupStatus"] == "revoked" and final["reasonCode"] == "cleanup_unconfirmed"


def test_public_like_payload_cannot_persist_cookies_or_free_partitions(accounts):
    service, _, scope, _ = accounts
    for extra in ({"cookie": "must-not-persist"}, {"partitionKey": "persist:user"}, {"permissions": {"browserOrigins": ["https://other.invalid"]}}):
        with pytest.raises(ValueError):
            service.start(scope, {"origin": "https://example.invalid", "clientRequestId": new_id(), "mainGeneration": "main", "runnerGeneration": "runner", **extra})
    with pytest.raises(ValueError):
        start(service, scope, "https://name:pass@example.invalid")


def test_receipt_survives_store_reopen_without_second_profile_or_database(accounts):
    service, store, scope, _ = accounts
    confirmed, _ = confirm(service, scope, start(service, scope))
    reopened = IndependentStore(store.profile_home, scope.backend_profile_id)
    try:
        second_service = BrowserConnectionService(reopened, service.resolver)
        assert second_service.poll(scope, {"flowId": confirmed["flowId"]}) == confirmed
    finally:
        reopened.close()

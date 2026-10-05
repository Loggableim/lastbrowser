"""Actual persisted browser receipts stay live outside the provider cache."""
import pytest

from runtime.independent.browser_connections import BrowserConnectionService
from runtime.independent.browser_gateway import BrowserGatewayClient, GatewayError
from runtime.independent.capabilities import CapabilityService
from runtime.independent.connections import ConnectionRepository
from runtime.independent.contracts import ProviderSelection, new_id
from runtime.independent.policy import PolicyDenied
from test_independent_browser_connections import confirm, start
from test_independent_capabilities import inventory_fixture
from test_independent_dispatch import manager_fixture


@pytest.fixture
def browser_capabilities(tmp_path, monkeypatch):
    home, _, scope, store, manager, _ = manager_fixture(tmp_path)
    manager.browser_connections = BrowserConnectionService(store, manager.resolver)
    calls = []
    def probe(*_, **__):
        calls.append(1)
        return {"providers": [], "groups": [], "capabilityInventory": inventory_fixture(home)}
    monkeypatch.setattr("runtime.independent.scoped_models.probe_catalog", probe)
    service = CapabilityService(manager)
    try:
        yield service, manager, store, scope, calls
    finally:
        manager.shutdown()
        store.close()


def _bind(service, store, scope, confirmed, *, uses=("browser.account.use",), expected=0):
    return ConnectionRepository(store).bind(scope, {"capabilityId": "browser.account",
        "connectionId": confirmed["connectionId"], "permittedUse": list(uses),
        "expectedRevision": expected, "clientRequestId": new_id()}, service.catalog(scope))


def test_receipt_and_logout_refresh_browser_catalog_without_provider_probe(browser_capabilities):
    service, manager, _, scope, calls = browser_capabilities
    empty = service.catalog(scope)
    assert empty["entries"][-1]["connections"] == []
    confirmed, _ = confirm(manager.browser_connections, scope, start(manager.browser_connections, scope))
    populated = service.catalog(scope)
    entry = populated["entries"][-1]
    assert entry["capabilityId"] == "browser.account" and entry["status"] == "configured"
    assert entry["evidenceKind"] == "explicit_user_confirmation"
    assert entry["connections"][0]["authenticationStatus"] == "user_confirmed"
    assert entry["connections"][0]["healthStatus"] == "unknown"
    assert populated["revision"] != empty["revision"]
    manager.browser_connections.begin_logout(scope, {"connectionId": confirmed["connectionId"],
        "expectedRevision": confirmed["revision"], "clientRequestId": new_id()})
    revoked = service.catalog(scope)
    assert revoked["entries"][-1]["connections"][0]["status"] == "reauth_required"
    assert revoked["revision"] != populated["revision"]
    assert len(calls) == 1


def test_only_explicit_use_captures_and_browser_only_validation_needs_no_provider_cache(browser_capabilities):
    service, manager, store, scope, _ = browser_capabilities
    confirmed, _ = confirm(manager.browser_connections, scope, start(manager.browser_connections, scope))
    assert service.capture_browser(scope) == ()  # A receipt itself grants no use.
    binding = _bind(service, store, scope, confirmed, uses=())
    assert service.capture_browser(scope) == ()
    binding = _bind(service, store, scope, confirmed, expected=binding.revision)
    references = service.capture_browser(scope)
    assert references[0].binding_id == binding.binding_id
    assert references[0].connection_revision == confirmed["revision"]
    context = manager.make_context(scope, ProviderSelection(provider_config_ref="controlled", model="controlled"), connection_bindings=references)
    service._cache.clear()
    assert service.validate(context)
    assert not service.validate(context.model_copy(update={"connection_bindings":
        (references[0].model_copy(update={"revision": references[0].revision + 1}),)}))
    gateway_service = manager.browser_connections
    manager.browser_connections = None
    assert not service.validate(context)
    with pytest.raises(PolicyDenied, match="browser_account_adapter_required"):
        service.capture_browser(scope)
    manager.browser_connections = gateway_service
    gateway_service.begin_logout(scope, {"connectionId": confirmed["connectionId"],
        "expectedRevision": confirmed["revision"], "clientRequestId": new_id()})
    assert not service.validate(context)
    with pytest.raises(PolicyDenied, match="browser_account_receipt_changed"):
        service.capture_browser(scope)


def test_account_ticket_contains_only_exact_bound_receipt_and_rejects_incomplete_refs(browser_capabilities, monkeypatch):
    service, manager, store, scope, _ = browser_capabilities
    confirmed, _ = confirm(manager.browser_connections, scope, start(manager.browser_connections, scope))
    binding = _bind(service, store, scope, confirmed)
    refs = service.capture_browser(scope)
    context = manager.make_context(scope, ProviderSelection(provider_config_ref="controlled", model="controlled"), connection_bindings=refs)
    client = BrowserGatewayClient("http://127.0.0.1:35123", "controlled-private-secret")
    calls = []
    def post(path, payload, **_):
        calls.append((path, payload))
        return {"capability": "controlled"} if path.endswith("capabilities/create") else {"leaseId": payload["ticket"]["leaseId"]}
    monkeypatch.setattr(client, "_post", post)
    client.create_lease(context, control_sequence=1, permission_epoch=1, title="Controlled")
    account = calls[1][1]["ticket"]["accountBindings"]
    assert account == [{"bindingId": binding.binding_id, "connectionId": binding.connection_id,
        "connectionRevision": confirmed["revision"], "revision": binding.revision}]
    calls.clear()
    client.create_lease(context.model_copy(update={"connection_bindings": ()}), control_sequence=2, permission_epoch=1, title="Anonymous")
    assert "accountBindings" not in calls[1][1]["ticket"]
    calls.clear()
    incomplete = refs[0].model_copy(update={"binding_id": None})
    with pytest.raises(GatewayError, match="browser_account_binding_incomplete"):
        client.create_lease(context.model_copy(update={"connection_bindings": (incomplete,)}), control_sequence=3, permission_epoch=1, title="Denied")
    assert not calls

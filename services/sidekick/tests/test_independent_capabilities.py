import base64
import json

import pytest

from runtime.independent.capabilities import CapabilityService, evidence_digest, public_inventory
from runtime.independent.connections import ConnectionRepository
from runtime.independent.contracts import PermissionScope, ProviderSelection, new_id
from runtime.independent.policy import PolicyDenied
from test_independent_dispatch import manager_fixture


def inventory_fixture(home):
    return {"plugins": [{"id": "controlled", "name": "Controlled plugin", "installed": True, "enabled": True}], "mcp": [{"id": "local", "configured": True, "enabled": True}], "evidenceDigest": evidence_digest(home)}


def test_catalog_distinguishes_configuration_health_and_unsupported_tools(tmp_path, monkeypatch):
    home, _, scope, store, manager, _ = manager_fixture(tmp_path)
    try:
        monkeypatch.setattr("runtime.independent.scoped_models.probe_catalog", lambda *_, **__: {"providers": [{"id": "controlled", "display_name": "Local provider", "has_key": True, "provider_available": True}, {"id": "google-gemini-cli", "has_key": True, "provider_available": False}], "groups": [], "capabilityInventory": inventory_fixture(home)})
        service = CapabilityService(manager)
        catalog = service.catalog(scope)
        provider = catalog["entries"][0]["connections"][0]
        assert provider["status"] == "configured"
        assert provider["healthStatus"] == "unknown"
        assert provider["authenticationStatus"] == "credential_present"
        assert "connected" not in [row["status"] for row in catalog["entries"][0]["connections"]]
        assert all(entry["supportedTasks"] == [] and entry["connections"][0]["adapterAvailable"] is False for entry in catalog["entries"][1:])
        repo = ConnectionRepository(store)
        row = repo.bind(scope, {"capabilityId": "assistant.conversation", "connectionId": provider["connectionId"], "permittedUse": ["conversation"], "expectedRevision": 0, "clientRequestId": new_id()}, catalog)
        selection = ProviderSelection(provider_config_ref="controlled", provider="controlled", model="controlled")
        refs = service.capture_provider(scope, selection)
        assert refs[0].kind == "provider" and refs[0].revision == row.revision
        context = manager.make_context(scope, selection, connection_bindings=refs)
        assert service.validate(context)
        # Validation performs only local reads even if the probe is unavailable.
        monkeypatch.setattr("runtime.independent.scoped_models.probe_catalog", lambda *_, **__: pytest.fail("Action gate probed a model catalog"))
        assert service.validate(context)
        with pytest.raises(PolicyDenied, match="scope_provider_use_not_permitted"):
            service.capture_provider(scope, selection, purpose="agent_reasoning")
        (home / ".env").write_text("CONTROLLED_PROFILE_CHANGED=yes", "utf-8")
        assert not service.validate(context)
    finally:
        manager.shutdown()
        store.close()


def test_inventory_scans_actual_manifests_without_importing_plugin_or_starting_mcp(tmp_path, monkeypatch):
    home, _, scope, store, manager, _ = manager_fixture(tmp_path)
    try:
        context = manager.make_context(scope, ProviderSelection(provider_config_ref="controlled", model="controlled"))
        plugin = home / "plugins" / "controlled"
        plugin.mkdir(parents=True)
        (plugin / "plugin.yaml").write_text("name: controlled\nversion: '1'\nprovides_tools: [controlled_read]\n", "utf-8")
        marker = home / "plugin-was-imported"
        (plugin / "__init__.py").write_text(f"from pathlib import Path\nPath({str(marker)!r}).touch()\n", "utf-8")
        monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
        monkeypatch.setenv("SIDEKICK_HOME", str(home))
        config = {"plugins": {"enabled": ["controlled"]}, "mcp_servers": {"controlled": {"url": "https://configured.invalid/?credential=private-marker", "headers": {"Authorization": "private-marker"}, "enabled": True}}}
        result = public_inventory(context, config)
        assert any(row["id"] == "controlled" and row["enabled"] for row in result["plugins"])
        assert not marker.exists()
        encoded = json.dumps(result)
        assert "private-marker" not in encoded and "configured.invalid" not in encoded
        assert result["mcp"][0]["adapterAvailable"] is False
        monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "0")
        with pytest.raises(PolicyDenied):
            public_inventory(context, config)
    finally:
        manager.shutdown()
        store.close()


def test_keyless_endpoint_configuration_does_not_claim_credentials_or_health(tmp_path, monkeypatch):
    home, _, scope, store, manager, _ = manager_fixture(tmp_path)
    try:
        monkeypatch.setattr("runtime.independent.scoped_models.probe_catalog", lambda *_, **__: {
            "providers": [{"id": "controlled-local", "has_key": False, "oauth_connected": False, "provider_available": True}],
            "groups": [{"provider_id": "controlled-local", "configured": True}],
            "capabilityInventory": inventory_fixture(home),
        })
        row = CapabilityService(manager).catalog(scope)["entries"][0]["connections"][0]
        assert row["status"] == row["configurationStatus"] == "configured"
        assert row["authenticationStatus"] == row["healthStatus"] == "unknown"
        assert row["adapterAvailable"] is True
    finally:
        manager.shutdown()
        store.close()


def test_setup_actions_only_advertise_existing_scoped_adapters(tmp_path, monkeypatch):
    home, _, scope, store, manager, _ = manager_fixture(tmp_path)
    try:
        monkeypatch.setattr("runtime.independent.scoped_models.probe_catalog", lambda *_, **__: {
            "providers": [{"id": name, "provider_available": True} for name in ("openai", "openai-codex", "claude-code", "fabricated-oauth")],
            "groups": [], "capabilityInventory": inventory_fixture(home),
        })
        entries = CapabilityService(manager).catalog(scope)["entries"]
        actions = {row["providerId"]: row["setupActions"][0] for row in entries[0]["connections"]}
        assert actions["openai-codex"]["kind"] == "oauth" and actions["openai-codex"]["availability"] == "available"
        assert actions["openai"]["kind"] == "settings" and actions["openai"]["reasonCode"] == "human_configuration_required"
        for name in ("claude-code", "fabricated-oauth"):
            assert actions[name]["availability"] == "unavailable" and actions[name]["reasonCode"] == "scoped_adapter_unavailable"
        assert all(entry["connections"][0]["setupActions"][0]["availability"] == "unavailable" for entry in entries[1:])
    finally:
        manager.shutdown()
        store.close()


def _jwt(subject, expiry):
    payload = base64.urlsafe_b64encode(json.dumps({"sub": subject, "exp": expiry, "aud": "controlled"}).encode()).decode().rstrip("=")
    return "fixture." + payload + ".fixture"


def test_oauth_refresh_preserves_identity_but_account_change_invalidates_fingerprint(tmp_path):
    home = tmp_path
    path = home / "auth.json"
    def write(subject, expiry):
        path.write_text(json.dumps({"providers": {"controlled": {"tokens": {"access_token": _jwt(subject, expiry), "refresh_token": "controlled-refresh-" + str(expiry)}, "last_refresh": str(expiry)}}, "updated_at": str(expiry)}), "utf-8")
    write("account-a", 1)
    original = evidence_digest(home)
    write("account-a", 2)
    assert evidence_digest(home) == original
    write("account-b", 2)
    assert evidence_digest(home) != original

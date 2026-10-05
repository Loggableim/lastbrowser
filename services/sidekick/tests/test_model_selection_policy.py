"""Actual native Space/profile records, confirmed connections and immutable turns."""
import json

import pytest

from runtime.independent.capabilities import CapabilityService, evidence_digest
from runtime.independent.connections import ConnectionRepository
from runtime.independent.contracts import new_id
from runtime.independent.model_selection import AutoSelectionService, ModelRequirements, ModelPair
from runtime.independent.provider_admission import ProviderAdmission
from runtime.independent.runner import provider_configuration_digest
from runtime.independent.policy import PolicyDenied
from runtime.independent.store import RevisionConflict
from test_independent_dispatch import manager_fixture


def auto_fixture(tmp_path, monkeypatch):
    home, space, scope, store, manager, _ = manager_fixture(tmp_path)
    # Parent profile UI choice may remain another provider: only explicit
    # provider configuration and bindings establish eligible AUTO choices.
    (home / "config.yaml").write_text("providers:\n  local-a:\n    base_url: http://127.0.0.1:9/v1\n  remote-b:\n    base_url: https://controlled.example.invalid/v1\n", "utf-8")
    session_id = new_id()
    path = space.sessions_dir / (session_id + ".json")
    space.sessions_dir.mkdir(exist_ok=True)
    path.write_text(json.dumps({"session_id": session_id, "profile": "research", "messages": [], "independent": {"scope": scope.model_dump(mode="json", by_alias=True)}}), "utf-8")
    def validate_session(expected_scope, sid):
        if expected_scope != scope or sid != session_id or not path.is_file():
            raise PolicyDenied("session_scope_mismatch")
    def catalog(*_, **__):
        return {"providerConfigurationDigest": provider_configuration_digest(home),
            "groups": [{"provider_id": pid, "configured": True, "models": [
                {"id": mid, "contextLength": length, "supportsIndependent": True}]} for pid, mid, length in (("local-a", "small", 4096), ("remote-b", "large", 32000))],
            "providers": [{"id": "local-a", "has_key": True}, {"id": "remote-b", "has_key": True}],
            "capabilityInventory": {"plugins": [], "mcp": [], "evidenceDigest": evidence_digest(home)}}
    monkeypatch.setattr("runtime.independent.scoped_models.probe_catalog", catalog)
    manager.capabilities = CapabilityService(manager)
    manager.connection_validator = manager.capabilities.validate
    capabilities = manager.capabilities.catalog(scope)
    repository = ConnectionRepository(store)
    for pid in ("local-a", "remote-b"):
        repository.bind(scope, {"capabilityId": "assistant.conversation", "connectionId": "provider:" + pid,
            "permittedUse": ["conversation"], "expectedRevision": 0, "clientRequestId": new_id()}, capabilities)
    admission = ProviderAdmission(store, base_home=home.parent.parent,
        existing_store_paths=lambda: ((store.backend_profile_id, store.db_path),))
    service = AutoSelectionService(manager, admission, session_validator=validate_session)
    return home, scope, session_id, store, manager, service


def draft(**changes):
    return {"mode": "auto", "allowedModels": [{"provider": "local-a", "model": "small"}, {"provider": "remote-b", "model": "large"}],
            "cloudPolicy": "deny", **changes}


def test_legacy_absence_fixed_and_policy_cas_idempotency_have_no_model_alias(tmp_path, monkeypatch):
    home, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        assert service.get_policy(scope, sid).mode == "fixed"
        with pytest.raises(PolicyDenied, match="not_enabled"):
            service.select_turn(scope, sid, new_id(), ModelRequirements())
        rid = new_id()
        saved = service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=rid)
        assert saved.revision == 1
        assert service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=rid) == saved
        with pytest.raises(RevisionConflict):
            service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=new_id())
        assert "auto" not in (home / "config.yaml").read_text("utf-8")
        with pytest.raises(PolicyDenied, match="bound_catalog"):
            service.set_policy(scope, sid, draft(allowedModels=[{"provider": "remote-b", "model": "auto"}]), expected_revision=1, client_request_id=new_id())
    finally:
        manager.shutdown()
        store.close()


def test_actual_choice_local_cloud_deny_context_and_turn_frozen(tmp_path, monkeypatch):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=new_id())
        turn_id = new_id()
        decision = service.select_turn(scope, sid, turn_id, ModelRequirements())
        assert decision.selected_model == ModelPair(provider="local-a", model="small")
        assert decision.locality == "local" and decision.context.effective_permissions.allowed_effects == ()
        assert service.select_turn(scope, sid, turn_id, ModelRequirements()) == decision
        assert "context" not in decision.public_view()
        with pytest.raises(PolicyDenied, match="no_eligible"):
            service.select_turn(scope, sid, new_id(), ModelRequirements(minimum_context_tokens=5000))
        with pytest.raises(PolicyDenied, match="no_eligible"):
            service.select_turn(scope, sid, new_id(), ModelRequirements(required_capabilities=("vision",)))
        service.set_policy(scope, sid, draft(cloudPolicy="allow", allowedCloudDataClasses=["public"]), expected_revision=1, client_request_id=new_id())
        with pytest.raises(PolicyDenied, match="selection_policy_changed"):
            service.claim_request(decision)
        with pytest.raises(PolicyDenied, match="no_eligible"):
            service.select_turn(scope, sid, new_id(), ModelRequirements(minimum_context_tokens=5000, data_class="private"))
        cloud = service.select_turn(scope, sid, new_id(), ModelRequirements(minimum_context_tokens=5000, data_class="public"))
        assert cloud.selected_model.provider == "remote-b" and cloud.locality == "remote"
    finally:
        manager.shutdown()
        store.close()


def test_revocation_between_selection_and_actual_claim_blocks_provider(tmp_path, monkeypatch):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=new_id())
        decision = service.select_turn(scope, sid, new_id(), ModelRequirements())
        connection = next(row for row in ConnectionRepository(store).list(scope) if row.connection_id == "provider:local-a")
        ConnectionRepository(store).begin_revoke(scope, {"bindingId": connection.binding_id, "expectedRevision": connection.revision, "clientRequestId": new_id()})
        with pytest.raises(PolicyDenied, match="scope_authority_changed"):
            service.claim_request(decision)
        assert store._many("SELECT 1 FROM ia_request_results WHERE operation='provider_claim'") == []
    finally:
        manager.shutdown()
        store.close()


def test_cloud_private_permission_does_not_also_grant_workspace_data(tmp_path, monkeypatch):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        service.set_policy(scope, sid, draft(cloudPolicy="allow", allowedCloudDataClasses=["private"]),
            expected_revision=0, client_request_id=new_id())
        required = ModelRequirements(data_class="private", data_classes=("workspace",), minimum_context_tokens=10000)
        with pytest.raises(PolicyDenied, match="no_eligible"):
            service.select_turn(scope, sid, new_id(), required)
        service.set_policy(scope, sid, draft(cloudPolicy="allow", allowedCloudDataClasses=["private", "workspace"]),
            expected_revision=1, client_request_id=new_id())
        assert service.select_turn(scope, sid, new_id(), required).selected_model.provider == "remote-b"
    finally:
        manager.shutdown()
        store.close()


def test_orchestrator_is_real_allowed_model_and_retry_has_new_turn_identity(tmp_path, monkeypatch):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        service.set_policy(scope, sid, draft(orchestrator={"provider": "local-a", "model": "small"}), expected_revision=0, client_request_id=new_id())
        first = service.select_turn(scope, sid, new_id(), ModelRequirements())
        assert first.route == "orchestrator" and first.reason == "configured_orchestrator"
        claim = service.claim_request(first)
        service.admission.update(scope, claim.claim_id, state="started", delivered_delta=True)
        service.admission.update(scope, claim.claim_id, state="completed", measured_tokens=12, error_code="provider_stream_interrupted")
        assert service.select_turn(scope, sid, first.turn_id, ModelRequirements()).decision_id == first.decision_id
        second = service.select_turn(scope, sid, new_id(), ModelRequirements())
        assert second.turn_id != first.turn_id and second.decision_id != first.decision_id
        assert second.selected_model == first.selected_model
    finally:
        manager.shutdown()
        store.close()


def test_auto_balances_on_observed_headroom_without_inventing_unknown_quota(tmp_path, monkeypatch):
    home, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        allowed = draft(cloudPolicy="allow", allowedCloudDataClasses=["private"],
            budget={"maxConcurrent": 2})
        policy = service.set_policy(scope, sid, allowed, expected_revision=0,
            client_request_id=new_id())

        local = service.select_turn(scope, sid, new_id(), ModelRequirements())
        assert local.selected_model == ModelPair(provider="local-a", model="small")
        local_claim = service.claim_request(local, input_tokens_upper_bound=0, output_tokens=32)
        service.admission.observe(scope, local_claim.claim_id,
            {"x-ratelimit-limit-requests": "100", "x-ratelimit-remaining-requests": "10"})
        service.admission.update(scope, local_claim.claim_id, state="started")
        service.admission.update(scope, local_claim.claim_id, state="completed", measured_tokens=12)

        orchestrated = draft(cloudPolicy="allow", allowedCloudDataClasses=["private"],
            orchestrator={"provider": "remote-b", "model": "large"})
        policy = service.set_policy(scope, sid, orchestrated, expected_revision=1,
            client_request_id=new_id())
        remote = service.select_turn(scope, sid, new_id(), ModelRequirements())
        assert remote.selected_model == ModelPair(provider="remote-b", model="large")
        remote_claim = service.claim_request(remote, input_tokens_upper_bound=0, output_tokens=32)
        service.admission.observe(scope, remote_claim.claim_id,
            {"x-ratelimit-limit-requests": "100", "x-ratelimit-remaining-requests": "90"})
        service.admission.update(scope, remote_claim.claim_id, state="started")
        service.admission.update(scope, remote_claim.claim_id, state="completed", measured_tokens=12)

        service.set_policy(scope, sid, allowed, expected_revision=policy.revision,
            client_request_id=new_id())
        balanced = service.select_turn(scope, sid, new_id(), ModelRequirements())
        assert balanced.selected_model == ModelPair(provider="remote-b", model="large")
        assert balanced.reason == "observed_provider_headroom"
        assert balanced.observed_limit_source == "response_headers"
        assert balanced.remaining_headroom_basis_points == 9000
        assert balanced.fallback_count == 0

        # A provider with no recent response headers stays explicitly unknown;
        # absence is never treated as infinite quota or zero load.
        unknown = service.admission.selection_loads(["not-configured-provider"])["not-configured-provider"]
        assert unknown["observedSource"] == "unknown"
        assert unknown["observedAt"] is None
        assert unknown["remainingHeadroomBasisPoints"] is None
    finally:
        manager.shutdown()
        store.close()


def test_auto_falls_back_when_active_claim_uses_global_admission_capacity(tmp_path, monkeypatch):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        allowed = draft(cloudPolicy="allow", allowedCloudDataClasses=["private"],
            budget={"maxConcurrent": 2})
        pinned_local = draft(cloudPolicy="allow", allowedCloudDataClasses=["private"],
            orchestrator={"provider": "local-a", "model": "small"}, budget={"maxConcurrent": 2})
        saved = service.set_policy(scope, sid, pinned_local, expected_revision=0,
            client_request_id=new_id())
        pinned = service.select_turn(scope, sid, new_id(), ModelRequirements())
        active_local = service.claim_request(pinned, input_tokens_upper_bound=0, output_tokens=32)
        service.set_policy(scope, sid, allowed, expected_revision=saved.revision,
            client_request_id=new_id())

        balanced = service.select_turn(scope, sid, new_id(), ModelRequirements())
        assert balanced.selected_model == ModelPair(provider="remote-b", model="large")
        assert balanced.reason == "fallback_after_admission_unavailable"
        assert balanced.active_claims == 0
        assert balanced.remaining_headroom_basis_points is None
        service.admission.update(scope, active_local.claim_id, state="cancelled", acknowledged=True)
    finally:
        manager.shutdown()
        store.close()

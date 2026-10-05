"""Actual native worker/SDK builder and Parent-owned AUTO admission."""
import json
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from runtime.independent.capabilities import CapabilityService
from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.connections import ConnectionRepository
from runtime.independent.contracts import new_id
from runtime.independent.manager import RunManager, ComputeAdmission
from runtime.independent.model_policy_session import validate_native_session
from runtime.independent.model_selection import AutoSelectionService
from runtime.independent.native_chat_auto import NativeAutoSessionBroker
from runtime.independent.native_chat_host import NativeChatHost
from runtime.independent.native_chat_protocol import verify_native_context
from runtime.independent.policy import PolicyDenied
from runtime.independent.provider_admission import ProviderAdmission
from runtime.independent.scope import ScopeResolver
from runtime.independent.worker_host import WorkerError, WorkerHost
from test_independent_profile_isolation import isolated_python
from test_native_chat_process import fixture_context, ControlledServer, turn


def setup_auto(tmp_path, server, *, name="a", toolsets=None, max_concurrent=1):
    context, store = fixture_context(tmp_path, name, server.port)
    manager = None
    broker = None
    try:
        home = Path(context.profile_home)
        path = home / "config.yaml"
        config = yaml.safe_load(path.read_text("utf-8"))
        config["model"]["context_length"] = 65536
        config["model"]["provider"] = "custom:pipeline"
        if toolsets is not None:
            config["platform_toolsets"] = {"cli": toolsets}
        config["custom_providers"] = [{"name": "Pipeline", "base_url": config["model"]["base_url"],
            "api_key": "fixture-" + name, "model": "controlled-model",
            "models": {"controlled-model": {"context_length": 65536}}}]
        path.write_text(yaml.safe_dump(config), "utf-8")
        resolver = ScopeResolver(store, profiles_provider=lambda: [{"name": name, "path": str(home)}])
        manager = RunManager(store, resolver, worker_factory=lambda run_context: WorkerHost(
            run_context, python_executable=isolated_python()))
        manager.capabilities = CapabilityService(manager)
        manager.connection_validator = manager.capabilities.validate
        catalog = manager.capabilities.catalog(context.scope)
        repository = ConnectionRepository(store)
        provider = next(row for row in catalog["entries"][0]["connections"] if row["providerId"] == "custom:pipeline")
        assert provider["configurationStatus"] == "configured"
        repository.bind(context.scope, {"capabilityId": "assistant.conversation", "connectionId": provider["connectionId"],
            "permittedUse": ["conversation"], "expectedRevision": 0, "clientRequestId": new_id()}, catalog)
        resolved = resolver.resolve(context.scope)
        service = AutoSelectionService(manager, ProviderAdmission(store, base_home=home.parent.parent,
            existing_store_paths=lambda: ((store.backend_profile_id, store.db_path),)),
            session_validator=lambda scope, sid: validate_native_session(resolved, sid, actor=name))
        policy = service.set_policy(context.scope, context.session_id,
            {"mode": "auto", "allowedModels": [{"provider": "custom:pipeline", "model": "controlled-model"}], "cloudPolicy": "deny",
                "budget": {"tokensPerMinute": 100000, "maxConcurrent": max_concurrent}},
            expected_revision=0, client_request_id=new_id())
        context = context.model_copy(update={"selection_mode": "auto", "selection_policy_revision": policy.revision})
        session = SimpleNamespace(session_id=context.session_id, space_scope=context.scope.model_dump(mode="json", by_alias=True),
            profile=name, workspace=context.workspace)
        broker = NativeAutoSessionBroker(context, session, service=service,
            execution_policy=ChatExecutionPolicy("boost" if toolsets and "delegation" in toolsets else "action", 1))
        # The file-effect subprocess uses the host's packaged interpreter too.
        # Tests run under a developer Python, whose user-site is hidden by -I.
        broker.file_fence.python_executable = str(isolated_python())
        return context, store, manager, broker
    except BaseException:
        if broker is not None:
            try: broker.close_after_exit()
            except Exception: pass
        if manager is not None:
            try: manager.shutdown()
            except Exception: pass
        store.close()
        raise


def drain_rpc(handle, context, broker, *, timeout=30):
    events, deadline = [], time.monotonic() + timeout
    while time.monotonic() < deadline:
        message = handle.read_event(timeout=.1)
        if message is None:
            continue
        events.append(message)
        if message.get("kind") == "eof":
            break
        if message.get("kind") == "rpc":
            try:
                result = broker(context, message["method"], message["payload"])
                reply = {"ok": True, "result": result}
            except Exception as error:
                events.append({"kind": "rpc_denied", "method": message["method"],
                    "errorType": type(error).__name__,
                    "errorCode": error.code if isinstance(error, PolicyDenied) else None})
                reply = {"ok": False, "result": None}
            handle.send(context.envelope("rpc_reply", requestId=message["requestId"], **reply))
    else:
        raise AssertionError(("Native AUTO worker did not complete",
            [(row.get("kind"), row.get("method"), row.get("errorCode")) for row in events]))
    return events


def test_actual_native_auto_sdk_tool_turn_has_exact_model_claims_and_own_home(tmp_path):
    server = ControlledServer(parties=1)
    server.release.set()
    manager = store = handle = broker = None
    try:
        context, store, manager, broker = setup_auto(tmp_path, server)
        home = Path(context.profile_home)
        auth_before = (home / "auth.json").read_bytes()
        handle = NativeChatHost(context, python_executable=isolated_python()).start(*turn(context))
        events = drain_rpc(handle, context, broker)
        handle.process.wait(timeout=5)
        assert not any(row.get("errorCode") for row in events if row.get("kind") == "eof"), events[-3:]
        assert handle.returncode == 0, [(row.get("kind"), row.get("failed")) for row in events]
        assert len(server.requests) == 2, {"events": [(row.get("kind"), row.get("method"), row.get("event")) for row in events],
            "saved": json.loads((Path(context.sessions_dir) / (context.session_id + ".json")).read_text("utf-8"))["messages"]}
        assert all(body["model"] == "controlled-model" and token.endswith("fixture-a") for token, body in server.requests)
        assert "content-a" in str(server.requests[1][1]["messages"]), [
            (row.get("method"), row.get("errorType"), row.get("errorCode"))
            for row in events if row.get("kind") == "rpc_denied"]
        receipts = [json.loads(row[0]) for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
        assert len(receipts) == 2 and all(row["state"] == "completed" for row in receipts)
        assert all(row["provider"] == "custom:pipeline" and row["model"] == "controlled-model" for row in receipts)
        assert len({row["decisionId"] for row in receipts}) == 1
        assert all(row["measuredTokens"] is None for row in receipts)  # Server sends no usage.
        assert all(row["inputBoundSource"] == "serialized_text_bytes" and row["reservedInputTokens"] < 65536 for row in receipts)
        assert (home / "auth.json").read_bytes() == auth_before
        assert not ComputeAdmission._owners
        raw = json.loads((Path(context.sessions_dir) / (context.session_id + ".json")).read_text("utf-8"))
        assert any("answer-a" in str(row.get("content")) for row in raw["messages"] if row.get("role") == "assistant")
    finally:
        if handle:
            handle.terminate(grace_seconds=0, hard_seconds=2)
        if broker:
            broker.close_after_exit()
        if manager:
            manager.shutdown()
        if store:
            store.close()
        server.close()


def test_native_auto_broker_rejects_foreign_ids_and_revoke_before_started(tmp_path):
    server = ControlledServer(parties=1)
    manager = store = broker = None
    try:
        context, store, manager, broker = setup_auto(tmp_path, server)
        selected = broker(context, "auto_policy", {"requirements": {"dataClass": "private", "dataClasses": ["workspace"], "minimumContextTokens": 64000}})
        identity = selected["decision"]["decisionId"]
        with pytest.raises(PolicyDenied, match="decision_unknown"):
            broker(context, "auto_validate", {"decision": new_id()})
        claim = broker(context, "auto_claim", {"decision": identity, "outputTokens": 10})
        with pytest.raises(PolicyDenied, match="claim_unknown"):
            broker(context, "compute_acquire", {"claimId": new_id()})
        assert broker(context, "compute_acquire", {"claimId": claim["claimId"]})["acquired"]
        current = store.get_permission_state(context.scope)
        store.revoke_permissions(context.scope, expected_revision=current["revision"])
        with pytest.raises(PolicyDenied, match="authority_changed"):
            broker(context, "auto_usage", {"claimId": claim["claimId"], "state": "started"})
        assert not server.requests
        assert broker(context, "auto_usage", {"claimId": claim["claimId"], "state": "cancelled", "acknowledged": True})
        assert broker(context, "compute_release", {"claimId": claim["claimId"]})["released"]
        assert not ComputeAdmission._owners
    finally:
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


def test_native_auto_sibling_children_share_only_two_bound_compute_slots(tmp_path):
    server = ControlledServer(parties=1)
    manager = store = broker = None
    try:
        context, store, manager, broker = setup_auto(tmp_path, server, max_concurrent=2)
        decision = broker(context, "auto_policy", {"requirements": {
            "dataClass": "private", "dataClasses": ["workspace"], "minimumContextTokens": 64000}})["decision"]["decisionId"]
        request = {"decision": decision, "outputTokens": 10, "inputTokensUpperBound": 100,
            "inputBoundSource": "serialized_text_bytes", "requestPurpose": "child"}
        with pytest.raises(WorkerError, match="native_chat_rpc_not_allowed"):
            broker(context, "auto_claim", {**request, "parentTurnId": "model-supplied-turn"})
        first = broker(context, "auto_claim", request)
        receipt = broker.service.admission.get_claim(context.scope, first["claimId"])
        assert (receipt.turn_id, receipt.owner_generation) == (
            broker._turn_id, broker._decision.context.runner_generation), receipt.model_dump()
        broker(context, "auto_observe", {"claimId": first["claimId"], "headers": {
            "x-ratelimit-remaining-requests": "5", "x-ratelimit-limit-requests": "6",
            "x-ratelimit-remaining-tokens": "100000", "x-ratelimit-limit-tokens": "100000"}})
        second = broker(context, "auto_claim", request)
        assert second.get("pending") is not True
        assert broker(context, "compute_acquire", {"claimId": first["claimId"]})["acquired"] is True
        assert broker(context, "compute_acquire", {"claimId": second["claimId"]})["acquired"] is True
        assert len(ComputeAdmission._owners) == 2
        assert len(set(ComputeAdmission._native_child_families.values())) == 1
        assert {store_claim.turn_id for store_claim in (
            broker._owned_claim(first["claimId"]), broker._owned_claim(second["claimId"]))} == {broker._turn_id}
        assert next(iter(ComputeAdmission._native_child_families.values())) == (
            context.scope.key, context.session_id, broker._turn_id, context.writer_generation)
        # The sibling exception is not a general same-scope concurrency grant.
        assert not ComputeAdmission.acquire_legacy("unrelated-same-scope", scope_key=context.scope.key)
        assert not ComputeAdmission.acquire_native_child("different-turn", scope_key=context.scope.key,
            parent_session_id=context.session_id, parent_turn_id="different-parent-turn",
            writer_generation=context.writer_generation)
        third = broker(context, "auto_claim", request)
        assert third == {"pending": True}

        broker(context, "auto_usage", {"claimId": first["claimId"], "state": "cancelled", "acknowledged": True})
        assert broker(context, "compute_release", {"claimId": first["claimId"]})["released"]
        third = broker(context, "auto_claim", request)
        assert third.get("pending") is not True
        assert broker(context, "compute_acquire", {"claimId": third["claimId"]})["acquired"] is True
        for claim in (second, third):
            broker(context, "auto_usage", {"claimId": claim["claimId"], "state": "cancelled", "acknowledged": True})
            assert broker(context, "compute_release", {"claimId": claim["claimId"]})["released"]
        assert not ComputeAdmission._owners
        assert not server.requests
    finally:
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


def test_native_child_compute_family_replay_cannot_change_scope_or_generation():
    family = {"scope_key": "profile:space:browser", "parent_session_id": "parent-session",
        "parent_turn_id": "parent-turn", "writer_generation": "writer-generation"}
    try:
        assert ComputeAdmission.acquire_native_child("owner-one", **family)
        assert not ComputeAdmission.acquire_native_child("owner-one", **{**family, "scope_key": "other:space:browser"})
        assert not ComputeAdmission.acquire_native_child("owner-two", **{**family, "writer_generation": "other-writer"})
        assert not ComputeAdmission.acquire_native_child("owner-three", **{**family, "parent_turn_id": "other-turn"})
        assert ComputeAdmission.acquire_native_child("owner-two", **family)
        assert not ComputeAdmission.acquire_native_child("owner-three", **family)
        assert not ComputeAdmission.acquire_legacy("legacy-owner", scope_key=family["scope_key"])
    finally:
        for owner in ("owner-one", "owner-two", "owner-three", "legacy-owner"):
            ComputeAdmission.release(owner)


def test_native_child_second_admission_stays_fenced_after_revoke(tmp_path):
    server = ControlledServer(parties=1)
    manager = store = broker = None
    try:
        context, store, manager, broker = setup_auto(tmp_path, server, max_concurrent=2)
        decision = broker(context, "auto_policy", {"requirements": {
            "dataClass": "private", "dataClasses": ["workspace"], "minimumContextTokens": 64000}})["decision"]["decisionId"]
        request = {"decision": decision, "outputTokens": 10, "inputTokensUpperBound": 100,
            "inputBoundSource": "serialized_text_bytes", "requestPurpose": "child"}
        first = broker(context, "auto_claim", request)
        broker(context, "auto_observe", {"claimId": first["claimId"], "headers": {
            "x-ratelimit-remaining-requests": "5", "x-ratelimit-limit-requests": "6",
            "x-ratelimit-remaining-tokens": "100000", "x-ratelimit-limit-tokens": "100000"}})
        second = broker(context, "auto_claim", request)
        assert broker(context, "compute_acquire", {"claimId": first["claimId"]})["acquired"]
        permission = store.get_permission_state(context.scope)
        store.revoke_permissions(context.scope, expected_revision=permission["revision"])
        with pytest.raises(PolicyDenied, match="authority_changed"):
            broker(context, "compute_acquire", {"claimId": second["claimId"]})
        assert len(ComputeAdmission._owners) == 1
        broker(context, "auto_usage", {"claimId": first["claimId"], "state": "cancelled", "acknowledged": True})
        broker(context, "compute_release", {"claimId": first["claimId"]})
        with pytest.raises(PolicyDenied, match="authority_changed"):
            broker(context, "compute_acquire", {"claimId": second["claimId"]})
        assert not ComputeAdmission._owners
    finally:
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


def test_native_child_closed_claim_cannot_reacquire_compute(tmp_path):
    server = ControlledServer(parties=1)
    manager = store = broker = None
    try:
        context, store, manager, broker = setup_auto(tmp_path, server)
        decision = broker(context, "auto_policy", {"requirements": {
            "dataClass": "private", "dataClasses": ["workspace"], "minimumContextTokens": 64000}})["decision"]["decisionId"]
        claim = broker(context, "auto_claim", {"decision": decision, "outputTokens": 10,
            "requestPurpose": "child"})
        broker.close_after_exit()
        assert broker.service.admission.get_claim(context.scope, claim["claimId"]).state == "cancelled"
        with pytest.raises(PolicyDenied, match="native_auto_turn_closed"):
            broker(context, "compute_acquire", {"claimId": claim["claimId"]})
        assert not ComputeAdmission._owners
    finally:
        if broker and not broker._closed: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


def test_native_auto_availability_uses_actual_factory_session_binding_and_catalog(tmp_path):
    server = ControlledServer(parties=1)
    manager = store = broker = None
    try:
        context, store, manager, broker = setup_auto(tmp_path, server)
        session = SimpleNamespace(session_id=context.session_id, space_scope=context.scope.model_dump(mode="json", by_alias=True),
            profile=context.profile_name, workspace=context.workspace)
        resolved = manager.resolver.resolve(context.scope)
        manager.native_auto_broker_factory = lambda *args: None
        assert manager.native_auto_execution_availability(resolved, session)["available"] is False
        manager.native_auto_broker_factory = NativeAutoSessionBroker
        available = manager.native_auto_execution_availability(resolved, session)
        assert available == {"available": True, "sealedWorker": True, "managedCallAuthorizer": False}
        assert not server.requests and not ComputeAdmission._owners
        assert not store._many("SELECT request_id FROM ia_request_results WHERE operation IN ('auto_turn','provider_claim')")
        decision = broker(context, "auto_policy", {"requirements": {
            "dataClass": "private", "dataClasses": ["workspace"], "minimumContextTokens": 64000}})["decision"]["decisionId"]
        child_claim = broker(context, "auto_claim", {"decision": decision, "outputTokens": 10,
            "requestPurpose": "child"})
        path = Path(context.sessions_dir) / (context.session_id + ".json")
        original = path.read_bytes()
        raw = json.loads(original)
        raw["profile"] = "foreign"
        path.write_text(json.dumps(raw), "utf-8")
        assert manager.native_auto_execution_availability(resolved, session)["available"] is False
        path.write_bytes(original)
        config = resolved.space.load_config()
        config["nova_management"] = {"enrolled": True, "yolo": True, "revision": 1}
        resolved.space.save_config(config)
        managed = manager.native_auto_execution_availability(resolved, session)
        assert managed == {"available": False, "sealedWorker": True, "managedCallAuthorizer": False,
            "reasonCode": "auto_nova_execution_adapter_required"}
        with pytest.raises(PolicyDenied, match="nova_governance_admission_required|auto_nova_execution_adapter_required"):
            broker(context, "compute_acquire", {"claimId": child_claim["claimId"]})
        assert not ComputeAdmission._owners
        assert not server.requests
    finally:
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()

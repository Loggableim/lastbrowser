"""Native Teamwork Parent budget and role-plan boundary regressions."""
from concurrent.futures import ThreadPoolExecutor
import threading

import pytest

from runtime.independent.native_teamwork import (
    NativeTeamworkBridge, NativeTeamworkSessionBroker, _candidate_diagnostics_valid,
    _teamwork_cloud_allowed,
)
from runtime.independent.native_chat_worker import validate_rpc_payload
from runtime.independent.policy import PolicyDenied


def test_explicit_default_teamwork_allows_bound_cloud_models_but_saved_denial_wins():
    from runtime.independent.model_selection import SelectionPolicy
    from runtime.independent.contracts import Scope

    policy = SelectionPolicy(scope=Scope(backend_profile_id="00000000-0000-0000-0000-000000000001",
        space_id="00000000-0000-0000-0000-000000000002", browser_profile_id="default"),
        session_id="test-session", mode="fixed")
    classes = ("private", "workspace")
    assert _teamwork_cloud_allowed(policy, 0, local=False, data_classes=classes)
    assert _teamwork_cloud_allowed(policy, 0, local=True, data_classes=classes)

    explicit_deny = policy.model_copy(update={"revision": 1})
    assert not _teamwork_cloud_allowed(explicit_deny, 1, local=False, data_classes=classes)
    explicit_allow = policy.model_copy(update={"revision": 1, "cloud_policy": "allow",
        "allowed_cloud_data_classes": classes})
    assert _teamwork_cloud_allowed(explicit_allow, 1, local=False, data_classes=classes)
    assert not _teamwork_cloud_allowed(explicit_allow, 1, local=False,
        data_classes=("private", "workspace", "browsing"))


def _budget_broker():
    broker = NativeTeamworkSessionBroker.__new__(NativeTeamworkSessionBroker)
    broker._lock = threading.RLock()
    broker._request_count = 0
    broker._output_reserved = 0
    return broker


def test_parent_budget_caps_claims_and_output_reserves_across_stages():
    broker = _budget_broker()
    worker = {"requestPurpose": "teamwork:worker", "outputTokens": 384}
    for _ in range(8):
        broker._reserve_call(worker)
    with pytest.raises(PolicyDenied, match="budget_exhausted"):
        broker._reserve_call(worker)
    assert broker._request_count == 8
    assert broker._output_reserved == 8 * 384

    broker = _budget_broker()
    synthesis = {"requestPurpose": "teamwork:synthesizer", "outputTokens": 1024}
    for _ in range(4):
        broker._reserve_call(synthesis)
    with pytest.raises(PolicyDenied, match="budget_exhausted"):
        broker._reserve_call(synthesis)
    assert broker._request_count == 4
    assert broker._output_reserved == 4096


def test_parent_budget_is_atomic_for_parallel_worker_claims():
    broker = _budget_broker()
    request = {"requestPurpose": "teamwork:worker", "outputTokens": 384}

    def reserve():
        try:
            broker._reserve_call(request)
            return True
        except PolicyDenied:
            return False

    with ThreadPoolExecutor(max_workers=24) as executor:
        accepted = list(executor.map(lambda _index: reserve(), range(32)))
    assert sum(accepted) == 8
    assert broker._request_count == 8
    assert broker._output_reserved == 8 * 384


@pytest.mark.parametrize("payload", [
    {"requestPurpose": "conversation", "outputTokens": 10},
    {"requestPurpose": "teamwork:worker", "outputTokens": 385},
    {"requestPurpose": "teamwork:unknown", "outputTokens": 1},
    {"requestPurpose": "teamwork:synthesizer", "outputTokens": 0},
    {"requestPurpose": "teamwork:worker", "outputTokens": True},
])
def test_parent_rejects_unclassified_or_oversized_stage_claims(payload):
    with pytest.raises(PolicyDenied):
        _budget_broker()._reserve_call(payload)


def test_native_rpc_plan_is_read_only_and_rejects_prompt_or_endpoint_input():
    validate_rpc_payload("teamwork_plan", {})
    for payload in ({"prompt": "choose a model"}, {"endpoint": "https://example.invalid"},
                    {"scope": {"forged": True}}):
        with pytest.raises(Exception, match="native_chat_rpc_not_allowed"):
            validate_rpc_payload("teamwork_plan", payload)


def test_worker_identity_and_fallback_must_stay_inside_parent_pool():
    bridge = NativeTeamworkBridge.__new__(NativeTeamworkBridge)
    bridge._lock = threading.RLock()
    bridge._plan = {
        "planner": {"id": "plan-model", "call_model": "plan-model", "provider": "p1"},
        "workers": [{"worker_id": "worker-1", "model": "m1", "call_model": "m1", "provider": "p1"}],
        "worker_pool": [
            {"id": "m1", "call_model": "m1", "provider": "p1"},
            {"id": "m2", "call_model": "m2", "provider": "p2"},
        ],
        "pool": [{"id": "m1", "call_model": "m1", "provider": "p1"}],
        "critic": "m1", "synthesizer": "m1",
    }
    bridge._config = {}
    bridge._decisions = {}
    bridge._bridges = {}
    bridge.context = object()
    bridge.rpc = object()
    assert bridge.for_role("worker", "worker-1", "p2", "m2", 2).model == "m2"
    with pytest.raises(PolicyDenied, match="role_not_in_parent_plan"):
        bridge.for_role("worker", "worker-2", "p2", "m2", 1)
    with pytest.raises(PolicyDenied, match="role_not_in_parent_plan"):
        bridge.for_role("planner", "planner", "p2", "m2", 1)


def test_parent_broker_closes_owned_authorizer_once_even_when_cleanup_repeats():
    from types import SimpleNamespace

    broker = NativeTeamworkSessionBroker.__new__(NativeTeamworkSessionBroker)
    broker._closed = False
    broker._auto_delegate = None
    broker._claims = {}
    broker._lock = threading.RLock()
    broker.context = SimpleNamespace()
    broker.file_fence = SimpleNamespace(request_stop=lambda _reason: {
        "acknowledged": True, "processesExited": True,
    })
    broker.browser_fence = SimpleNamespace(
        request_stop=lambda _reason: {"acknowledged": True},
        retire_after_exit=lambda: {"acknowledged": True},
    )
    broker.service = SimpleNamespace(manager=SimpleNamespace(
        _lock=threading.RLock(), _native_file_fences={id(broker.file_fence): broker.file_fence}))

    class Authorizer:
        close_count = 0

        def close_after_exit(self):
            self.close_count += 1

    authorizer = Authorizer()
    broker._authorize = authorizer
    broker.close_after_exit()
    broker.close_after_exit()
    assert authorizer.close_count == 1


def test_managed_teamwork_governance_captures_only_parent_plan_models():
    from types import SimpleNamespace
    from runtime.independent.native_governance import NativeManagedGovernance
    from runtime.independent.policy import PolicyDenied

    choices = (("gemini", "flash"), ("ollama", "qwen3:8b"), ("openai", "gpt-fixture"))
    decisions = {f"choice-{index}": SimpleNamespace(
        decision_id=f"decision-{index}",
        selected_model=SimpleNamespace(provider=provider, model=model))
        for index, (provider, model) in enumerate(choices)}
    broker = NativeTeamworkSessionBroker.__new__(NativeTeamworkSessionBroker)
    broker._decisions = decisions
    broker._validate = lambda: None
    by_decision = {row.decision_id: row for row in decisions.values()}
    broker._decision = lambda identity: by_decision[identity]

    assert broker.managed_model_choices() == choices
    governance = object.__new__(NativeManagedGovernance)
    governance.broker = broker
    selected = SimpleNamespace(selected_model=SimpleNamespace(provider="openai", model="gpt-fixture"))
    assert governance._authorized_model_choices(selected) == choices
    outside = SimpleNamespace(selected_model=SimpleNamespace(provider="unbound", model="model"))
    with pytest.raises(PolicyDenied, match="model_choices_invalid"):
        governance._authorized_model_choices(outside)


def test_teamwork_candidate_rejections_are_bounded_enum_diagnostics_on_parent_plan():
    context = object()
    diagnostics = [{"provider": "gemini-fixture", "model": "flash", "code": "catalog_model_missing"},
        {"provider": "ollama-fixture", "model": "qwen", "code": "independent_capability_missing"}]
    assert _candidate_diagnostics_valid(diagnostics)
    assert not _candidate_diagnostics_valid([{"provider": "p", "model": "m", "code": "secret text"}])
    assert not _candidate_diagnostics_valid([{"provider": "p", "model": "m", "code": "catalog_model_missing",
        "exception": "private detail"}])

    broker = NativeTeamworkSessionBroker.__new__(NativeTeamworkSessionBroker)
    broker.context = context
    broker._lock = threading.RLock()
    broker._validate = lambda: None
    broker._plan = {"planner": None, "pool": [], "candidate_rejections": diagnostics}
    broker.config = {}
    broker._decisions = {}
    broker._policy = None
    broker._candidate_diagnostics = diagnostics
    response = broker(context, "teamwork_plan", {})
    assert response["candidateDiagnostics"] == diagnostics


def test_teamwork_claim_waits_for_shared_origin_concurrency_and_refunds_pending_stage_budget():
    from types import SimpleNamespace

    from runtime.independent.store import ResourceBusy

    broker = NativeTeamworkSessionBroker.__new__(NativeTeamworkSessionBroker)
    broker.context = object()
    broker._lock = threading.RLock()
    broker._request_count = 0
    broker._output_reserved = 0
    broker._claims = {}
    broker._claim_reservations = {}
    decision = SimpleNamespace(decision_id="decision-1")
    broker._decision = lambda _identity: decision
    attempts = [ResourceBusy("Shared provider concurrency is occupied"),
        SimpleNamespace(claim_id="claim-1", model_dump=lambda **_kwargs: {"claimId": "claim-1"})]

    def claim_request(_decision, **_kwargs):
        result = attempts.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    broker._claim_request = claim_request

    payload = {"decision": "decision-1", "outputTokens": 384,
        "requestPurpose": "teamwork:worker"}
    assert broker(broker.context, "teamwork_claim", payload) == {"pending": True}
    assert broker._request_count == 0 and broker._output_reserved == 0
    assert broker(broker.context, "teamwork_claim", payload) == {"claimId": "claim-1"}
    assert broker._request_count == 1 and broker._output_reserved == 384


def test_teamwork_claim_does_not_queue_other_resource_busy_reasons():
    from types import SimpleNamespace

    from runtime.independent.store import ResourceBusy

    broker = NativeTeamworkSessionBroker.__new__(NativeTeamworkSessionBroker)
    broker.context = object()
    broker._lock = threading.RLock()
    broker._request_count = 0
    broker._output_reserved = 0
    broker._claims = {}
    broker._claim_reservations = {}
    broker._decision = lambda _identity: SimpleNamespace(decision_id="decision-1")
    broker._claim_request = lambda _decision, **_kwargs: (_ for _ in ()).throw(
        ResourceBusy("Local shared token budget is exhausted"))

    with pytest.raises(ResourceBusy, match="token budget"):
        broker(broker.context, "teamwork_claim", {"decision": "decision-1",
            "outputTokens": 384, "requestPurpose": "teamwork:worker"})
    assert broker._request_count == 0 and broker._output_reserved == 0


def test_native_auto_teamwork_uses_parent_plan_and_streams_real_worker_output(tmp_path):
    import json
    import os
    from pathlib import Path
    from types import SimpleNamespace
    from unittest.mock import patch

    from runtime.chat_modes import ChatExecutionPolicy
    from runtime.independent.native_chat_host import NativeChatHost
    from runtime.independent.native_teamwork import NativeTeamworkSessionBroker
    from runtime.independent.native_teamwork import _NativeTeamworkProviderBridge, _pair_key
    from test_independent_profile_isolation import isolated_python
    from test_native_chat_auto import drain_rpc, setup_auto
    from test_native_chat_process import ControlledServer

    server = ControlledServer(parties=1, fail_second=True)
    manager = store = auto_broker = teamwork_broker = handle = None
    try:
        context, store, manager, auto_broker = setup_auto(tmp_path, server)
        context = context.model_copy(update={"teamwork": True})
        service = auto_broker.service
        auto_broker.close_after_exit()
        auto_broker = None
        raw = json.loads((Path(context.sessions_dir) / (context.session_id + ".json")).read_text("utf-8"))
        session = SimpleNamespace(**raw)
        pool = [{"id": "controlled-model", "call_model": "controlled-model",
            "name": "Controlled fixture", "provider": "custom:pipeline", "tier": "balanced"},
            {"id": "unselected-model", "call_model": "unselected-model",
                "name": "Unselected fixture", "provider": "custom:unselected", "tier": "balanced"}]
        with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=pool):
            teamwork_broker = NativeTeamworkSessionBroker(context, session,
                "Explain the controlled fixture response", service=service,
                execution_policy=ChatExecutionPolicy("action", 1))
            assert teamwork_broker._candidate_diagnostics == [{
                "provider": "custom:unselected", "model": "unselected-model",
                "code": "model_not_allowlisted"}]
            # Prove the exact auxiliary SDK builder can be wrapped against
            # the captured Parent decision before starting the child.
            from runtime.auxiliary_client import _get_cached_client
            from runtime.teamwork_orchestrator import _teamwork_profile_context
            decision = teamwork_broker._decisions[_pair_key("custom:pipeline", "controlled-model")]
            class DirectRPC:
                def call(self, method, payload):
                    return teamwork_broker(context, method, payload)
            with _teamwork_profile_context(context.profile_name), patch.dict(os.environ, {
                "LASTBROWSER_NATIVE_CHAT_WORKER": "1", "LASTBROWSER_INDEPENDENT_WORKER": "1",
                "SIDEKICK_HOME": context.profile_home,
            }):
                provider_bridge = _NativeTeamworkProviderBridge(context, DirectRPC(),
                    decision, teamwork_broker._policy, "teamwork:single_provider")
                client, resolved = _get_cached_client("custom:pipeline", "controlled-model")
                assert client is not None and resolved == "controlled-model"
                wrapped = provider_bridge.wrap_client(client, provider="custom:pipeline", model=resolved)
                wrapped.close()
            args = (context.session_id, "Explain the controlled fixture response", "teamwork",
                context.workspace, context.stream_id)
            kwargs = {"model_provider": "orchestrator", "mode": "teamwork",
                "execution_policy": ChatExecutionPolicy("action", 1)}
            handle = NativeChatHost(context, python_executable=isolated_python()).start(args, kwargs)
            # The controlled SSE fixture deliberately holds tool-call streams until
            # released. Release after the native host is running so its real RPC
            # path can finish instead of making this test time out in the fixture.
            server.release.set()
            events = drain_rpc(handle, context, teamwork_broker, timeout=35)
            handle.process.wait(timeout=5)
        assert handle.returncode == 0, [(row.get("kind"), row.get("errorCode"), row.get("event")) for row in events]
        native_events = [row for row in events if row.get("kind") == "native_event"]
        worker_output = [row["data"].get("content", "") for row in native_events
            if row.get("event") == "delta"]
        safe_requests = [(path, body.get("model")) for path, _auth, body in server.all_requests]
        assert any("first-visible" in text for text in worker_output), {
            "events": [(row.get("event"), row.get("data", {}).get("status"), row.get("data", {}).get("error"))
                for row in native_events],
            "rpc_denied": [(row.get("method"), row.get("errorType")) for row in events
                if row.get("kind") == "rpc_denied"],
            "requests": safe_requests,
        }
        claims = [json.loads(row[0]) for row in store._many(
            "SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
        assert len(claims) == 1 and claims[0]["requestPurpose"] == "teamwork:single_provider"
        assert claims[0]["state"] == "completed"
        saved = json.loads((Path(context.sessions_dir) / (context.session_id + ".json")).read_text("utf-8"))
        assert any("first-visible" in str(message.get("content"))
            for message in saved["messages"] if message.get("role") == "assistant")
    finally:
        if handle:
            handle.terminate(grace_seconds=0, hard_seconds=2)
        if teamwork_broker:
            teamwork_broker.close_after_exit()
        if auto_broker:
            auto_broker.close_after_exit()
        if manager:
            manager.shutdown()
        if store:
            store.close()
        server.close()


def test_fixed_teamwork_captures_configured_profile_model_without_new_scope_binding(tmp_path):
    import json
    from pathlib import Path
    from types import SimpleNamespace
    from unittest.mock import patch

    from runtime.chat_modes import ChatExecutionPolicy
    from runtime.independent.connections import ConnectionRepository
    from runtime.independent.native_chat_host import NativeChatHost
    from runtime.independent.native_teamwork import NativeTeamworkSessionBroker
    from test_independent_profile_isolation import isolated_python
    from test_native_chat_auto import drain_rpc
    from test_native_chat_process import ControlledServer
    from test_native_sdk_broker import setup_fixed

    server = ControlledServer(parties=1)
    manager = store = fixed_broker = teamwork_broker = handle = None
    try:
        context, store, manager, fixed_broker = setup_fixed(tmp_path, server)
        service = fixed_broker.service
        fixed_broker.close_after_exit()
        fixed_broker = None

        existing = ConnectionRepository(store).list(context.scope)
        assert any(row.capability_id == "assistant.conversation" for row in existing)
        with store.transaction():
            store._conn.execute("DELETE FROM ia_connection_bindings WHERE scope_key=?", (store._scope(context.scope),))
        assert not ConnectionRepository(store).list(context.scope)

        context = context.model_copy(update={"teamwork": True, "provider_capture": None})
        raw = json.loads((Path(context.sessions_dir) / (context.session_id + ".json")).read_text("utf-8"))
        session = SimpleNamespace(**raw)
        pool = [{"id": "controlled-model", "call_model": "controlled-model",
            "name": "Controlled fixture", "provider": "custom:pipeline", "tier": "balanced"}]
        with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=pool):
            teamwork_broker = NativeTeamworkSessionBroker(context, session,
                "Use the configured profile model", service=service,
                execution_policy=ChatExecutionPolicy("action", 1))

        assert len(teamwork_broker._decisions) == 1
        assert next(iter(teamwork_broker._decisions.values())).selected_model.model == "controlled-model"
        assert not ConnectionRepository(store).list(context.scope)

        handle = NativeChatHost(context, python_executable=isolated_python()).start(
            (context.session_id, "Use the configured profile model", "teamwork",
                context.workspace, context.stream_id),
            {"model_provider": "orchestrator", "mode": "teamwork",
                "execution_policy": ChatExecutionPolicy("action", 1)})
        server.release.set()
        events = drain_rpc(handle, context, teamwork_broker, timeout=35)
        handle.process.wait(timeout=5)
        assert handle.returncode == 0, [(row.get("kind"), row.get("errorCode")) for row in events]
        assert len(server.requests) == 1
        claims = [json.loads(row[0]) for row in store._many(
            "SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
        assert len(claims) == 1 and claims[0]["state"] == "completed"
        assert claims[0]["requestPurpose"] == "teamwork:single_provider"
    finally:
        if teamwork_broker:
            teamwork_broker.close_after_exit()
        if handle:
            handle.terminate(grace_seconds=0, hard_seconds=2)
        if fixed_broker:
            fixed_broker.close_after_exit()
        if manager:
            manager.shutdown()
        if store:
            store.close()
        server.close()

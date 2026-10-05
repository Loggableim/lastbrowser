"""Real native fixed SDK requests use durable quota/compute admission."""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from runtime.independent.contracts import new_id
from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.manager import ComputeAdmission
from runtime.independent.native_chat_host import NativeChatHost
from runtime.independent.native_sdk_broker import NativeSdkSessionBroker, capture_fixed_provider
from runtime.independent.policy import PolicyDenied
from test_independent_profile_isolation import isolated_python
from test_native_auto_auxiliary import AuxiliaryServer
from test_native_chat_auto import setup_auto, drain_rpc
from test_native_chat_process import turn


def setup_fixed(tmp_path, server, *, name="a", children=False):
    context, store, manager, auto_broker = setup_auto(tmp_path, server, name=name,
        toolsets=["file", "delegation"] if children else ["file"])
    service = auto_broker.service
    auto_broker.close_after_exit()
    policy = service.set_policy(context.scope, context.session_id, {"mode": "fixed"},
        expected_revision=context.selection_policy_revision, client_request_id=new_id())
    path = Path(context.sessions_dir) / (context.session_id + ".json")
    raw = json.loads(path.read_text("utf-8"))
    raw["model_provider"] = "custom:pipeline"
    raw["enabled_toolsets"] = ["file", "delegation"] if children else ["file"]
    raw = {"enabled_toolsets": raw.pop("enabled_toolsets"), **raw}
    path.write_text(json.dumps(raw), "utf-8")
    session = SimpleNamespace(session_id=context.session_id, profile=name, workspace=context.workspace,
        space_scope=context.scope.model_dump(mode="json", by_alias=True),
        model="controlled-model", model_provider="custom:pipeline")
    capture = capture_fixed_provider(session, service=service)
    context = context.model_copy(update={"selection_mode": "fixed", "selection_policy_revision": policy.revision,
        "provider_capture": capture})
    return context, store, manager, NativeSdkSessionBroker(context, session, service=service,
        execution_policy=ChatExecutionPolicy("boost" if children else "action", 1))


def fixed_turn(context, *, mode="action"):
    args, kwargs = turn(context, mode=mode)
    kwargs["model_provider"] = context.provider_capture.provider.provider
    return args, kwargs


def receipts(store):
    return [json.loads(row[0]) for row in store._many(
        "SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]


@pytest.mark.parametrize("children", [False, True])
def test_actual_fixed_parent_children_have_exact_claims_and_single_scope_compute(tmp_path, children):
    server = AuxiliaryServer(children=children, tail_only_child=children)
    context = store = manager = broker = handle = None
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server, children=children)
        auth = Path(context.profile_home) / "auth.json"
        before = auth.read_bytes()
        handle = NativeChatHost(context, python_executable=isolated_python()).start(
            *fixed_turn(context, mode="boost" if children else "action"))
        events = drain_rpc(handle, context, broker, timeout=45)
        handle.process.wait(timeout=5)
        assert not [row for row in events if row.get("kind") == "rpc_denied" or row.get("errorCode")], events[-12:]
        assert handle.returncode == 0
        claimed = receipts(store)
        assert len(server.requests) == len(claimed) == (4 if children else 2), {
            "purposes": [row["requestPurpose"] for row in claimed], "events": events[-10:]}
        assert all(row["state"] == "completed" for row in claimed)
        assert all(row["policyRevision"] == context.selection_policy_revision for row in claimed)
        assert len({row["decisionId"] for row in claimed}) == 1
        assert all(token == "Bearer fixture-a" and body["model"] == "controlled-model" for token, body in server.requests)
        assert server.max_active == 1 and not ComputeAdmission._owners
        assert broker.service.get_policy(context.scope, context.session_id).mode == "fixed"
        assert store._many("SELECT request_id FROM ia_request_results WHERE operation='native_fixed_turn'")
        assert not store._many("SELECT request_id FROM ia_request_results WHERE operation='auto_turn'")
        assert auth.read_bytes() == before
        if children:
            assert sum(row["requestPurpose"] == "child" for row in claimed) == 2
            assert all(row["deliveredDelta"] for row in claimed if row["requestPurpose"] == "child")
        else:
            assert "content-a" in str(server.requests[1][1]["messages"])
    finally:
        if handle: handle.terminate(grace_seconds=0, hard_seconds=2)
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


@pytest.mark.parametrize("reject", [False, True])
def test_actual_fixed_goal_judge_is_claimed_and_never_uses_auxiliary_account(tmp_path, reject):
    from cli.goals import GoalState, persist_goal_state
    from runtime._compat.shim_state import SessionDB
    server = AuxiliaryServer(reject_judge=reject)
    store = manager = broker = handle = None
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server)
        database = SessionDB(db_path=Path(context.space_root) / "goals.db")
        try:
            persist_goal_state(database, context.session_id, GoalState(goal="Report own controlled file content"), expected_revision=0)
        finally: database.close()
        args, kwargs = fixed_turn(context)
        kwargs["goal_related"] = True
        handle = NativeChatHost(context, python_executable=isolated_python()).start(args, kwargs)
        events = drain_rpc(handle, context, broker, timeout=40)
        handle.process.wait(timeout=5)
        assert handle.returncode == 0 and not [row for row in events if row.get("errorCode")], events[-10:]
        claimed = receipts(store)
        assert len(claimed) == len(server.requests) == 3
        judge = [row for row in claimed if row["requestPurpose"] == "goal_judge"]
        assert len(judge) == 1 and judge[0]["measuredTokens"] == (None if reject else 14)
        assert all(token == "Bearer fixture-a" and body["model"] == "controlled-model" for token, body in server.requests)
        database = SessionDB(db_path=Path(context.space_root) / "goals.db")
        try: actual = json.loads(database.get_meta("goal:" + context.session_id))
        finally: database.close()
        assert actual["status"] == ("paused" if reject else "done")
        assert not ComputeAdmission._owners
    finally:
        if handle: handle.terminate(grace_seconds=0, hard_seconds=2)
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


@pytest.mark.parametrize("stage", ["fixed_claim", "started"])
def test_fixed_actual_revoke_before_dispatch_blocks_http(tmp_path, stage):
    server = AuxiliaryServer()
    store = manager = broker = handle = None
    revoked = []
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server)
        def gateway(captured, method, payload):
            if not revoked and (method == stage or stage == "started" and method == "fixed_usage" and payload.get("state") == "started"):
                current = store.get_permission_state(context.scope)
                revoked.append(store.revoke_permissions(context.scope, expected_revision=current["revision"]))
            return broker(captured, method, payload)
        handle = NativeChatHost(context, python_executable=isolated_python()).start(*fixed_turn(context))
        events = drain_rpc(handle, context, gateway, timeout=30)
        handle.process.wait(timeout=5)
        assert revoked and not server.requests
        assert any(row.get("kind") == "rpc_denied" for row in events)
        assert not ComputeAdmission._owners
    finally:
        if handle: handle.terminate(grace_seconds=0, hard_seconds=2)
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


def test_fixed_foreign_claim_and_capture_change_fail_before_compute(tmp_path):
    server = AuxiliaryServer()
    store = manager = broker = None
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server)
        with pytest.raises(PolicyDenied, match="claim_unknown"):
            broker(context, "compute_acquire", {"claimId": new_id()})
        with pytest.raises(PolicyDenied, match="decision_unknown"):
            broker(context, "fixed_validate", {"decision": new_id()})
        altered = context.model_copy(update={"provider_capture": context.provider_capture.model_copy(
            update={"provider": context.provider_capture.provider.model_copy(update={"model": "foreign"})})})
        with pytest.raises(PolicyDenied, match="rpc_not_allowed"):
            broker(altered, "fixed_validate", {})
        assert not server.requests and not ComputeAdmission._owners
    finally:
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()

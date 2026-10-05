"""Actual private Goal/child SDK operations share the Parent AUTO receipts."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from runtime.independent.manager import ComputeAdmission
from runtime.independent.native_chat_host import NativeChatHost
from test_independent_profile_isolation import isolated_python
from test_native_chat_auto import setup_auto, drain_rpc
from test_native_chat_process import turn


class AuxiliaryServer:
    def __init__(self, *, children=False, reject_judge=False, reasoning_only_child=False, tail_only_child=False, reject_child=False):
        self.requests, self.active, self.max_active = [], 0, 0
        self.lock = threading.Lock()
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_GET(self):
                self.send_response(400); self.end_headers()
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                with owner.lock:
                    owner.requests.append((self.headers.get("Authorization"), body))
                    owner.active += 1
                    owner.max_active = max(owner.active, owner.max_active)
                try:
                    if body.get("stream") is not True:
                        owner.judge(self, body, reject_judge)
                        return
                    result = next((row for row in body["messages"] if row.get("role") == "tool"), None)
                    last = str(body["messages"][-1].get("content"))
                    if children and reject_child and "CHILD-" in last and not result:
                        owner.judge(self, body, True)
                        return
                    self.send_response(200); self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Connection", "close"); self.end_headers()
                    def chunk(delta, finish=None):
                        row = {"id": "aux-fixture", "object": "chat.completion.chunk", "created": int(time.time()),
                            "model": body["model"], "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
                        self.wfile.write(("data: " + json.dumps(row) + "\n\n").encode()); self.wfile.flush()
                    if children and "CHILD-" in last and not result:
                        time.sleep(.2)
                        text = "<think>controlled internal reasoning</think>" if reasoning_only_child and "CHILD-B" in last else "actual-child-" + ("A" if "CHILD-A" in last else "B")
                        if tail_only_child and "CHILD-B" in last:
                            text = "<"
                        chunk({"role": "assistant", "content": text})
                        chunk({}, "stop")
                    elif result:
                        chunk({"role": "assistant", "content": "controlled-complete-evidence:" + str(result["content"])})
                        chunk({}, "stop")
                    else:
                        name = "delegate_task" if children else "read_file"
                        arguments = {"tasks": [{"goal": "CHILD-A"}, {"goal": "CHILD-B"}], "max_iterations": 2} if children else {"path": "controlled.txt"}
                        chunk({"role": "assistant", "tool_calls": [{"index": 0, "id": "aux-tool", "type": "function",
                            "function": {"name": name, "arguments": json.dumps(arguments)}}]})
                        chunk({}, "tool_calls")
                    self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
                finally:
                    with owner.lock: owner.active -= 1
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def judge(self, handler, body, reject):
        handler.send_response(429 if reject else 200)
        handler.send_header("Content-Type", "application/json")
        if reject: handler.send_header("retry-after", "60")
        handler.end_headers()
        if reject:
            reply = {"error": {"message": "Controlled cooldown", "type": "rate_limit_error", "code": "rate_limit_exceeded"}}
        else:
            reply = {"id": "actual-judge", "object": "chat.completion", "created": int(time.time()), "model": body["model"],
                "choices": [{"index": 0, "message": {"role": "assistant", "content": json.dumps({"done": True, "reason": "Controlled own-file evidence received"})}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14}}
        handler.wfile.write(json.dumps(reply).encode())

    @property
    def port(self): return self.server.server_port
    def close(self): self.server.shutdown(); self.server.server_close()


@pytest.mark.parametrize("reject_judge", [False, True])
def test_actual_native_auto_goal_judge_has_own_claim_without_auxiliary_account(tmp_path, reject_judge):
    from cli.goals import GoalState, persist_goal_state
    from runtime._compat.shim_state import SessionDB
    server = AuxiliaryServer(reject_judge=reject_judge)
    manager = store = broker = handle = None
    try:
        context, store, manager, broker = setup_auto(tmp_path, server)
        home, slug = Path(context.profile_home), Path(context.space_root).name
        goal_path = Path(context.space_root) / "goals.db"
        database = SessionDB(db_path=goal_path)
        try:
            persist_goal_state(database, context.session_id,
                GoalState(goal="Read own controlled file and report its content"), expected_revision=0)
        finally: database.close()
        auth_before = (home / "auth.json").read_bytes()
        args, kwargs = turn(context)
        kwargs["goal_related"] = True
        handle = NativeChatHost(context, python_executable=isolated_python()).start(args, kwargs)
        events = drain_rpc(handle, context, broker, timeout=40)
        errors = [(row.get("kind"), row.get("stage"), row.get("event"), row.get("errorCode")) for row in events if row.get("errorCode")]
        assert not errors, {"errors": errors, "requests": len(server.requests)}
        handle.process.wait(timeout=5)
        assert handle.returncode == 0, events[-4:]
        receipts = [json.loads(row[0]) for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
        assert len(server.requests) == 3 and len(receipts) == 3, {"purposes": [row["requestPurpose"] for row in receipts], "requests": len(server.requests)}
        judged = [row for row in receipts if row["requestPurpose"] == "goal_judge"]
        assert len(judged) == 1
        assert judged[0]["measuredTokens"] == (None if reject_judge else 14)
        assert all(row["inputBoundSource"] == "serialized_text_bytes" for row in receipts)
        assert len({row["decisionId"] for row in receipts}) == 1
        assert all(token == "Bearer fixture-a" and body["model"] == "controlled-model" for token, body in server.requests)
        database = SessionDB(db_path=goal_path)
        try: current = json.loads(database.get_meta("goal:" + context.session_id))
        finally: database.close()
        assert current["status"] == ("paused" if reject_judge else "done"), current
        assert (home / "auth.json").read_bytes() == auth_before and not ComputeAdmission._owners
        journal = "".join(row[0] for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='provider_claim'"))
        assert "controlled-complete-evidence" not in journal and "fixture-a" not in journal
    finally:
        if handle: handle.terminate(grace_seconds=0, hard_seconds=2)
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


@pytest.mark.parametrize("child_output", ["text", "reasoning", "tail"])
def test_actual_native_auto_two_children_use_fresh_clients_and_serial_shared_admission(tmp_path, child_output):
    reasoning_only_child = child_output == "reasoning"
    server = AuxiliaryServer(children=True, reasoning_only_child=reasoning_only_child, tail_only_child=child_output == "tail")
    manager = store = broker = handle = None
    try:
        context, store, manager, broker = setup_auto(tmp_path, server, toolsets=["file", "delegation"])
        path = Path(context.sessions_dir) / (context.session_id + ".json")
        raw = json.loads(path.read_text("utf-8"))
        raw["enabled_toolsets"] = ["file", "delegation"]
        # Real Session.save writes compact metadata before messages; native
        # metadata-only reads intentionally stop before transcript contents.
        raw = {"enabled_toolsets": raw.pop("enabled_toolsets"), **raw}
        path.write_text(json.dumps(raw), "utf-8")
        handle = NativeChatHost(context, python_executable=isolated_python()).start(*turn(context, mode="boost"))
        events = drain_rpc(handle, context, broker, timeout=45)
        errors = [(row.get("kind"), row.get("errorCode")) for row in events if row.get("errorCode")]
        assert not errors, errors
        handle.process.wait(timeout=5)
        assert handle.returncode == 0
        receipts = [json.loads(row[0]) for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
        assert len(server.requests) == 4 and len(receipts) == 4, {"requests": len(server.requests), "purposes": [row["requestPurpose"] for row in receipts],
            "toolResults": [str(row.get("content"))[:1200] for _, body in server.requests for row in body.get("messages", []) if row.get("role") == "tool"]}
        assert sum(row["requestPurpose"] == "child" for row in receipts) == 2
        assert len({row["decisionId"] for row in receipts}) == 1
        assert all(row["state"] == "completed" for row in receipts)
        assert all(token == "Bearer fixture-a" and body["model"] == "controlled-model" for token, body in server.requests)
        # Max one active SDK request per immutable Space, even when Boost
        # prepares two children. The Parent request released before delegation.
        assert server.max_active == 1 and not ComputeAdmission._owners
        child_text = [row.get("data", {}).get("childEvent", {}) for row in events
            if row.get("event") == "subagent_event" and row.get("data", {}).get("event_type") == "subagent.answer_delta"]
        assert child_text and "actual-child-A" in str(child_text)
        if child_output == "tail":
            tails = [row for row in child_text if row.get("payload", {}).get("delta") == "<"]
            assert len(tails) == 1, child_text
            completed = [row.get("data", {}).get("childEvent", {}) for row in events
                if row.get("event") == "subagent_event" and row.get("data", {}).get("event_type") == "subagent.complete"]
            assert any(row.get("subagentId") == tails[0]["subagentId"] and row["sequence"] > tails[0]["sequence"]
                for row in completed), completed
        else:
            assert ("actual-child-B" in str(child_text)) is not reasoning_only_child
        assert "controlled internal reasoning" not in str(child_text)
        assert sum(row["deliveredDelta"] is True for row in receipts if row["requestPurpose"] == "child") == (1 if child_output == "reasoning" else 2)
    finally:
        if handle: handle.terminate(grace_seconds=0, hard_seconds=2)
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


@pytest.mark.parametrize("deny_reason", ["revocation", "rate_limit"])
def test_actual_native_auto_child_denial_prevents_other_child_sdk_and_parent_retry(tmp_path, deny_reason):
    server = AuxiliaryServer(children=True, reject_child=deny_reason == "rate_limit")
    manager = store = broker = handle = None
    revoked = []
    try:
        context, store, manager, broker = setup_auto(tmp_path, server, toolsets=["file", "delegation"])
        path = Path(context.sessions_dir) / (context.session_id + ".json")
        raw = json.loads(path.read_text("utf-8"))
        raw = {"enabled_toolsets": ["file", "delegation"], **{key: value for key, value in raw.items() if key != "enabled_toolsets"}}
        path.write_text(json.dumps(raw), "utf-8")
        auth_before = (Path(context.profile_home) / "auth.json").read_bytes()
        def actual_parent_gate(captured, method, payload):
            if deny_reason == "revocation" and method == "auto_claim" and payload.get("requestPurpose") == "child" and not revoked:
                current = store.get_permission_state(context.scope)
                revoked.append(store.revoke_permissions(context.scope, expected_revision=current["revision"]))
            return broker(captured, method, payload)
        handle = NativeChatHost(context, python_executable=isolated_python()).start(*turn(context, mode="boost"))
        events = drain_rpc(handle, context, actual_parent_gate, timeout=40)
        handle.process.wait(timeout=5)
        assert bool(revoked) is (deny_reason == "revocation")
        assert len(server.requests) == (1 if deny_reason == "revocation" else 2)
        assert any(row.get("kind") == "rpc_denied" for row in events)
        receipts = [json.loads(row[0]) for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
        assert len(receipts) == (1 if deny_reason == "revocation" else 2)
        assert receipts[0]["requestPurpose"] == "conversation" and receipts[0]["state"] == "completed"
        if deny_reason == "rate_limit":
            assert receipts[1]["requestPurpose"] == "child" and receipts[1]["deliveredDelta"] is False
            assert any(row["retryAt"] for row in broker.service.admission.limits("custom:pipeline"))
        assert (Path(context.profile_home) / "auth.json").read_bytes() == auth_before
        assert not ComputeAdmission._owners
    finally:
        if handle: handle.terminate(grace_seconds=0, hard_seconds=2)
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()

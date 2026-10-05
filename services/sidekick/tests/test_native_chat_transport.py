"""Exact-entry controls, bounded metadata RPC and native dispatcher fences."""
import threading
from pathlib import Path
from types import SimpleNamespace
import pytest
from runtime.independent import native_chat_policy as policy
from runtime.independent.native_chat_worker import ExactPendingBridge, NativeRPC, validate_rpc_payload
from runtime.independent.worker_host import WorkerError


def test_exact_clarify_reply_never_resolves_oldest_or_foreign_request():
    from web.api import clarify
    session = "native_transport_test"
    context = SimpleNamespace(session_id=session)
    try:
        first = clarify.submit_pending(session, {"question":"first", "choices_offered":[]})
        second = clarify.submit_pending(session, {"question":"second", "choices_offered":[]})
        bridge = ExactPendingBridge(context)
        one, two = bridge.bind("clarify", first.data), bridge.bind("clarify", second.data)
        assert one["requestId"] != two["requestId"]
        assert not bridge.resolve("clarify", "foreign", "wrong")
        assert not bridge.resolve("approval", two["requestId"], "once")
        assert bridge.resolve("clarify", two["requestId"], "actual second answer")
        assert second.event.is_set() and second.result == "actual second answer"
        assert not first.event.is_set()
        assert not bridge.resolve("clarify", two["requestId"], "duplicate")
        assert bridge.resolve("clarify", one["requestId"], "actual first answer")
    finally: clarify.clear_pending(session)


def test_exact_approval_response_binds_actual_entry_without_fifo_fallback():
    from tools import approval
    session = "native_approval_test"
    entries = [approval._ApprovalEntry({"command":name}) for name in ("first", "second")]
    with approval._lock: approval._gateway_queues[session] = entries[:]
    try:
        bridge = ExactPendingBridge(SimpleNamespace(session_id=session))
        second = bridge.bind("approval", entries[1].data)
        assert not bridge.resolve("approval", second["requestId"], "invalid")
        assert bridge.resolve("approval", second["requestId"], "deny")
        assert entries[1].event.is_set() and not entries[0].event.is_set()
        assert entries[1].result == "deny"
    finally: approval.unregister_gateway_notify(session)


def test_native_policy_missing_binding_and_foreign_file_paths_fail_closed(tmp_path, monkeypatch, request):
    monkeypatch.setenv("LASTBROWSER_NATIVE_CHAT_WORKER", "1")
    monkeypatch.setattr(policy, "_context", None)
    assert policy.native_tool_denial("read_file", {"path":"own.txt"}) == "native_chat_context_missing"
    from test_native_chat_process import fixture_context
    context, store = fixture_context(tmp_path, "a")
    request.addfinalizer(store.close)
    tmp_path = Path(context.workspace)
    monkeypatch.setattr(policy, "_context", context)
    for key,value in {"SIDEKICK_HOME":context.profile_home,"LASTBROWSER_NATIVE_GENERATION":context.writer_generation,
        "LASTBROWSER_BACKEND_PROFILE_ID":context.scope.backend_profile_id,"LASTBROWSER_BROWSER_PROFILE_ID":context.scope.browser_profile_id,
        "LASTBROWSER_SPACE_ID":context.scope.space_id,"LASTBROWSER_PARTITION_KEY":context.partition_key}.items():
        monkeypatch.setenv(key,value)
    assert policy.native_tool_denial("read_file", {"path":"own.txt"}) is None
    assert policy.native_tool_denial("read_file", {"path":"../foreign.txt"}) == "native_chat_file_scope_denied"
    for name in ("terminal", "browser_navigate", "execute_code", "mcp_foreign", "independent_browser_read"):
        assert policy.native_tool_denial(name, {}) == "native_chat_tool_requires_bound_broker"
    assert policy.native_tool_denial("patch", {"mode":"patch", "patch":"*** Delete File: ../foreign"})
    outside = tmp_path.parent / (tmp_path.name + "-foreign")
    outside.mkdir(exist_ok=True)
    try:
        (tmp_path / "escape").symlink_to(outside, target_is_directory=True)
    except OSError:
        pass  # Windows without developer-mode symlinks still tests '..' above.
    else:
        assert policy.native_tool_denial("read_file", {"path":"escape/foreign.txt"}) == "native_chat_file_scope_denied"
    monkeypatch.setenv("SIDEKICK_HOME",str(tmp_path.parent))
    assert policy.native_tool_denial("read_file",{"path":"own.txt"})=="native_chat_context_missing"


def test_rpc_allows_only_bounded_quota_metadata_without_prompt_or_credentials():
    validate_rpc_payload("auto_usage", {"usage":{"input_tokens":5,"output_tokens":2},"claimId":"actual"})
    for method in ("fixed_validate", "fixed_claim", "fixed_observe", "fixed_usage"):
        validate_rpc_payload(method, {"decision":"captured", "outputTokens":16,
            "inputTokensUpperBound":128,"inputBoundSource":"serialized_text_bytes","requestPurpose":"child"})
    for method, payload in [("tool",{}), ("auto_usage",{"messages":[]}),
                            ("auto_observe",{"headers":{"Authorization":"fixture"}}),
                            ("auto_usage",{"usage":{"secret":"fixture"}}),
                            ("auto_observe",{"headers":{"set-cookie":"fixture"}})]:
        with pytest.raises(WorkerError): validate_rpc_payload(method,payload)


def test_rpc_request_reply_and_cancel_without_pending_lock_wait():
    sent, stop = [], threading.Event()
    context = SimpleNamespace(envelope=lambda kind,**kw:{"kind":kind,**kw})
    rpc = NativeRPC(context, sent.append, stop)
    result = []
    def call(): result.append(rpc.call("compute_acquire", {"claimId":"actual"}))
    worker = threading.Thread(target=call); worker.start()
    deadline = threading.Event()
    import time
    until=time.monotonic()+1
    while not sent and time.monotonic()<until: deadline.wait(.01)
    assert sent
    assert not rpc.resolve({"requestId":"foreign","ok":True,"result":True})
    assert rpc.resolve({"requestId":sent[0]["requestId"],"ok":True,"result":True})
    worker.join(timeout=1)
    assert result == [True] and not rpc._pending
    stop.set()
    with pytest.raises(WorkerError, match="interrupted"):
        rpc.call("compute_release", {"claimId":"actual"})
    assert not rpc._pending

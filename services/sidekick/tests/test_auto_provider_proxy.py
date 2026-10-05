"""Installed OpenAI SDK, real localhost HTTP and durable AUTO receipts."""
import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from openai import OpenAI

from runtime.independent.auto_provider_proxy import AutoProviderProxy
from runtime.independent.contracts import new_id
from runtime.independent.model_selection import ModelRequirements
from runtime.independent.policy import PolicyDenied
from runtime.independent.store import ResourceBusy
from test_model_selection_policy import auto_fixture, draft


@contextmanager
def actual_provider(*, stream_failure=False, stream_text=None, status=200):
    requests = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append(body)
            self.send_response(status)
            self.send_header("Content-Type", "text/event-stream" if stream_failure or stream_text is not None else "application/json")
            self.send_header("x-ratelimit-limit-requests", "10")
            self.send_header("x-ratelimit-remaining-requests", "9")
            self.send_header("x-ratelimit-remaining-tokens", "100000")
            if status == 429:
                self.send_header("Retry-After", "120")
            self.end_headers()
            if status != 200:
                self.wfile.write(json.dumps({"error": {"message": "Controlled rejection", "type": "rate_limit_error", "code": "rate_limit_exceeded"}}).encode())
            elif stream_failure:
                self.wfile.write(b'data: {"id":"controlled","object":"chat.completion.chunk","created":1,"model":"small","choices":[{"index":0,"delta":{"content":"actual partial"},"finish_reason":null}]}\n\n')
                self.wfile.write(b'data: invalid-fixture-json\n\n')
            elif stream_text is not None:
                row = {"id": "controlled", "object": "chat.completion.chunk", "created": 1, "model": "small",
                    "choices": [{"index": 0, "delta": {"content": stream_text}, "finish_reason": None}]}
                self.wfile.write(("data: " + json.dumps(row) + "\n\n").encode())
                row = {**row, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}}
                self.wfile.write(("data: " + json.dumps(row) + "\n\ndata: [DONE]\n\n").encode())
            else:
                self.wfile.write(json.dumps({"id": "controlled", "object": "chat.completion", "created": 1, "model": "small", "choices": [{"index": 0, "message": {"role": "assistant", "content": "actual local response"}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}}).encode())
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield "http://127.0.0.1:" + str(server.server_port) + "/v1", requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join(2)


def make_proxy(service, scope, sid, url):
    decision = service.select_turn(scope, sid, new_id(), ModelRequirements())
    client = OpenAI(api_key="controlled-local-fixture", base_url=url, max_retries=2)
    # The fixture builder owns this exact client, credential and loopback
    # transport. Production uses the immutable native worker builder proof.
    validator = lambda actual, context: actual is client and str(actual.base_url).rstrip("/") == url and context == decision.context
    return AutoProviderProxy(client, service, decision, client_binding_validator=validator), decision


def claims(store):
    return [json.loads(row[0]) for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]


def test_actual_sdk_route_headers_usage_and_output_cap_are_visible_without_prompt_logs(tmp_path, monkeypatch):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        service.set_policy(scope, sid, draft(budget={"maxOutputTokens": 2}), expected_revision=0, client_request_id=new_id())
        with actual_provider() as (url, requests):
            proxy, decision = make_proxy(service, scope, sid, url)
            try:
                response = proxy.chat.completions.create(model="small", messages=[{"role": "user", "content": "private controlled prompt marker"}], max_tokens=200)
                assert response.choices[0].message.content == "actual local response"
                assert requests[0]["model"] == "small" and requests[0]["max_tokens"] == 2
                assert len(requests) == 1 and proxy.max_retries == 0
                receipt = claims(store)[0]
                assert receipt["state"] == "completed" and receipt["measuredTokens"] == 7
                proxy.mark_visible_delta()  # Real response rendered after SDK completion.
                delivered = claims(store)[0]
                assert delivered["deliveredDelta"] is True and delivered["state"] == "completed"
                assert delivered["measuredTokens"] == 7 and delivered["reservedInputTokens"] == receipt["reservedInputTokens"]
                with pytest.raises(PolicyDenied, match="claim_terminal"):
                    service.admission.update(scope, receipt["claimId"], delivered_delta=True, measured_tokens=8)
                limits = service.admission.limits("local-a")
                assert limits[0]["source"] == "response_headers" and limits[0]["buckets"][0]["remaining"] == 9
                service.status(scope)
                assert len(requests) == 1
                journal = "".join(row[0] for row in store._many("SELECT result_json FROM ia_request_results"))
                assert "private controlled prompt marker" not in journal and "controlled-local-fixture" not in journal
            finally:
                proxy.close()
    finally:
        manager.shutdown()
        store.close()


def test_actual_429_is_one_request_no_sdk_retry_and_shared_durable_cooldown(tmp_path, monkeypatch):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=new_id())
        with actual_provider(status=429) as (url, requests):
            proxy, decision = make_proxy(service, scope, sid, url)
            try:
                with pytest.raises(Exception) as failure:
                    proxy.chat.completions.create(model="small", messages=[])
                assert type(failure.value).__name__ == "RateLimitError"
                assert len(requests) == 1
                with pytest.raises(ResourceBusy, match="resource admission"):
                    service.select_turn(scope, sid, new_id(), ModelRequirements())
                assert len(requests) == 1
                assert service.admission.limits("local-a")[0]["retryAt"] is not None
            finally:
                proxy.close()
    finally:
        manager.shutdown()
        store.close()


def test_missing_bound_client_proof_and_child_compute_host_adapter_fail_before_http(tmp_path, monkeypatch):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=new_id())
        with actual_provider() as (url, requests):
            decision = service.select_turn(scope, sid, new_id(), ModelRequirements())
            client = OpenAI(api_key="controlled-local-fixture", base_url=url)
            proxy = AutoProviderProxy(client, service, decision)
            try:
                with pytest.raises(PolicyDenied, match="bound_sdk_client"):
                    proxy.chat.completions.create(model="small", messages=[])
                assert requests == [] and claims(store) == []
                monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
                proxy._state["binding_validator"] = lambda actual, context: actual is client and context == decision.context
                with pytest.raises(PolicyDenied, match="host_compute_adapter"):
                    proxy.chat.completions.create(model="small", messages=[])
                assert requests == [] and claims(store)[0]["state"] == "cancelled"
            finally:
                proxy.close()
    finally:
        manager.shutdown()
        store.close()


def test_partial_stream_failure_keeps_one_actual_model_and_separate_retry_identity(tmp_path, monkeypatch):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=new_id())
        with actual_provider(stream_failure=True) as (url, requests):
            proxy, decision = make_proxy(service, scope, sid, url)
            visible = []
            try:
                with pytest.raises(json.JSONDecodeError):
                    for chunk in proxy.chat.completions.create(model="small", messages=[], stream=True):
                        text = chunk.choices[0].delta.content
                        if text:
                            visible.append(text)
                            proxy.mark_visible_delta()
                assert visible == ["actual partial"] and len(requests) == 1
                receipt = claims(store)[0]
                assert receipt["deliveredDelta"] and receipt["errorCode"] == "provider_stream_interrupted"
                assert receipt["measuredTokens"] is None and receipt["reservedInputTokens"] == 4096
                retry = service.select_turn(scope, sid, new_id(), ModelRequirements())
                assert retry.turn_id != decision.turn_id and retry.selected_model == decision.selected_model
                assert len(requests) == 1
            finally:
                proxy.close()
    finally:
        manager.shutdown()
        store.close()


@pytest.mark.parametrize("text,throws,expected", [
    ("<", False, "<"), ("<", True, ""),
    ("<think>hidden text</think>", False, ""),
    ("<think>unterminated hidden text", False, ""),
])
def test_actual_sdk_flushes_owned_native_filter_before_claim_settlement(tmp_path, monkeypatch, text, throws, expected):
    from run_agent import AIAgent
    from runtime.think_scrubber import StreamingThinkScrubber
    from runtime.memory_manager import StreamingContextScrubber
    from types import SimpleNamespace
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    monkeypatch.setenv("LASTBROWSER_NATIVE_CHAT_WORKER", "1")
    try:
        service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=new_id())
        with actual_provider(stream_text=text) as (url, requests):
            proxy, _ = make_proxy(service, scope, sid, url)
            agent = AIAgent.__new__(AIAgent)
            agent._stream_think_scrubber = StreamingThinkScrubber()
            agent._stream_context_scrubber = StreamingContextScrubber()
            agent._current_streamed_assistant_text = ""
            agent._stream_callback = None
            observed, visible = [], []
            def display(value):
                # Observe the actual durable receipt during callback execution,
                # before SDK completion and shared compute release.
                receipt = claims(store)[0]
                observed.append(receipt["state"])
                if throws:
                    raise RuntimeError("Controlled display failure")
                visible.append(value)
            agent.stream_delta_callback = display
            def delivered(*, agent):
                assert agent is owned_agent
                proxy.mark_visible_delta()
            owned_agent = agent
            agent._native_auto_bridge = SimpleNamespace(mark_visible_delta=delivered)
            proxy._state["stream_complete"] = agent._flush_stream_delivery_tails
            try:
                for chunk in proxy.chat.completions.create(model="small", messages=[], stream=True):
                    if chunk.choices and chunk.choices[0].delta.content:
                        agent._fire_stream_delta(chunk.choices[0].delta.content)
                receipt = claims(store)[0]
                assert "".join(visible) == expected
                assert agent._current_streamed_assistant_text == expected
                assert observed == (["started"] if text == "<" else [])
                assert receipt["state"] == "completed" and receipt["measuredTokens"] == 7
                assert receipt["deliveredDelta"] is bool(expected) and len(requests) == 1
            finally:
                proxy.close()
    finally:
        manager.shutdown()
        store.close()


@pytest.mark.parametrize("override", [{"model": "other"}, {"extra_headers": {"OpenAI-Project": "different"}}, {"extra_body": {"model": "other"}}, {"n": 2}])
def test_model_account_and_budget_override_denied_before_real_http(tmp_path, monkeypatch, override):
    _, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    try:
        service.set_policy(scope, sid, draft(), expected_revision=0, client_request_id=new_id())
        with actual_provider() as (url, requests):
            proxy, _ = make_proxy(service, scope, sid, url)
            try:
                with pytest.raises(PolicyDenied):
                    proxy.chat.completions.create(**{"model": "small", "messages": [], **override})
                assert requests == [] and claims(store) == []
            finally:
                proxy.close()
    finally:
        manager.shutdown()
        store.close()

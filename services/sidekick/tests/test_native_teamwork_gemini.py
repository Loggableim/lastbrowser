"""Google native REST fixtures through the Parent-owned Teamwork proxy."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
import yaml

from runtime.gemini_native_adapter import DEFAULT_GEMINI_BASE_URL, GeminiNativeClient
from runtime.independent.contracts import new_id, utc_now
from runtime.independent.model_selection import ModelPair, SelectionPolicy
from runtime.independent.native_chat_auto import _trusted_gemini_native_endpoint
from runtime.independent.native_teamwork import _NativeTeamworkProviderBridge
from runtime.independent.provider_admission import AdmissionBudget, ProviderClaim
from runtime.independent.policy import PolicyDenied
from runtime.independent.runner import provider_configuration_digest
from test_native_chat_process import fixture_context


class _ParentRpc:
    """Small Parent protocol fixture; never receives prompt or credentials."""

    def __init__(self, context, decision, model):
        self.context, self.decision, self.model = context, decision, model
        self.calls = []
        self.claims = {}

    def call(self, method, payload):
        self.calls.append((method, dict(payload)))
        if method == "teamwork_validate":
            return {"validated": True, "managed": False}
        if method == "teamwork_claim":
            now = utc_now()
            claim = ProviderClaim(claim_id=new_id(), decision_id=self.decision.decision_id,
                turn_id=new_id(), scope=self.context.scope, session_id=self.context.session_id,
                provider=self.model.provider, model=self.model.model, group_key="google-fixture",
                owner_generation=new_id(), permission_revision=1, control_epoch=0,
                policy_revision=0, request_purpose=payload["requestPurpose"],
                input_bound_source=payload["inputBoundSource"], created_at=now, updated_at=now,
                reserved_input_tokens=payload["inputTokensUpperBound"],
                reserved_output_tokens=payload["outputTokens"])
            self.claims[claim.claim_id] = claim
            return claim.model_dump(mode="json", by_alias=True)
        if method == "teamwork_compute_acquire":
            return {"acquired": True, "authorized": True}
        if method == "teamwork_compute_release":
            return {"released": True}
        if method == "teamwork_usage":
            return {"updated": True}
        if method == "teamwork_observe":
            return {"observed": True}
        raise AssertionError(f"unexpected Parent RPC {method}")


def _build_proxy(tmp_path, monkeypatch, transport, *, provider="gemini"):
    context, store = fixture_context(tmp_path, "google-native")
    home = Path(context.profile_home)
    config = yaml.safe_load((home / "config.yaml").read_text("utf-8"))
    config["model"].update(provider=provider, base_url=DEFAULT_GEMINI_BASE_URL)
    (home / "config.yaml").write_text(yaml.safe_dump(config), "utf-8")
    for name, value in (("LASTBROWSER_NATIVE_CHAT_WORKER", "1"),
                        ("LASTBROWSER_INDEPENDENT_WORKER", "1"),
                        ("SIDEKICK_HOME", str(home))):
        monkeypatch.setenv(name, value)
    model = ModelPair(provider=provider, model="gemini-2.5-flash")
    decision = SimpleNamespace(decision_id=new_id(), selected_model=model,
        scope=context.scope, session_id=context.session_id,
        context=SimpleNamespace(provider_config_ref=provider_configuration_digest(home)))
    policy = SelectionPolicy(scope=context.scope, session_id=context.session_id,
        mode="fixed", budget=AdmissionBudget(tokens_per_minute=100_000,
            max_output_tokens=256, max_concurrent=1))
    rpc = _ParentRpc(context, decision, model)
    parent_bridge = _NativeTeamworkProviderBridge(context, rpc, decision, policy,
        "teamwork:worker")
    # The test isolates adapter transport/proxy ownership; production binds
    # this validation to the captured provider configuration and Parent RPC.
    parent_bridge.bridge.validate_selection = lambda *_args, **_kwargs: True
    client = GeminiNativeClient(api_key="fixture-google-key", http_client=httpx.Client(
        transport=transport, timeout=10))
    return context, store, parent_bridge, client, rpc


def test_gemini_native_stream_uses_google_protocol_and_parent_lifecycle(tmp_path, monkeypatch):
    requests = []

    def respond(request):
        requests.append(request)
        assert request.url.host == "generativelanguage.googleapis.com"
        assert request.url.path == "/v1beta/models/gemini-2.5-flash:streamGenerateContent"
        assert request.url.query == b"alt=sse"
        assert request.headers["x-goog-api-key"] == "fixture-google-key"
        assert request.headers["accept"] == "text/event-stream"
        body = json.loads(request.content)
        assert body["contents"][0]["parts"][0]["text"] == "say hello"
        assert body["generationConfig"]["maxOutputTokens"] == 256
        sse = (
            'data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}\n\n'
            'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":'
            '{"promptTokenCount":7,"candidatesTokenCount":2,"totalTokenCount":9}}\n\n'
        )
        # These deliberately present limits are not surfaced by GeminiNativeClient
        # on success today; the Parent must retain unknown quota/status metadata.
        return httpx.Response(200, headers={"x-ratelimit-remaining": "99"}, text=sse)

    context, store, bridge, client, rpc = _build_proxy(tmp_path, monkeypatch,
        httpx.MockTransport(respond))
    try:
        wrapped = bridge.wrap_client(client, provider="gemini", model="gemini-2.5-flash")
        stream = wrapped.chat.completions.create(model="gemini-2.5-flash",
            messages=[{"role": "user", "content": "say hello"}], max_tokens=4096, stream=True)
        chunks = list(stream)
        assert chunks[0].choices[0].delta.content == "hello"
        assert chunks[-1].usage.total_tokens == 9
        assert len(requests) == 1
        assert [method for method, _ in rpc.calls].count("teamwork_claim") == 1
        assert any(method == "teamwork_compute_acquire" for method, _ in rpc.calls)
        assert any(method == "teamwork_compute_release" for method, _ in rpc.calls)
        usage = [payload for method, payload in rpc.calls if method == "teamwork_usage"]
        assert any(payload.get("state") == "started" for payload in usage)
        assert any(payload.get("state") == "completed" and payload.get("usage") == 9
            for payload in usage)
        # No raw response is exposed by the Gemini sync adapter, so don't
        # fabricate a successful status or quota-header observation.
        assert not any(method == "teamwork_observe" for method, _ in rpc.calls)
        bridge.mark_visible_delta()
        assert any(payload.get("deliveredDelta") is True for method, payload in rpc.calls
            if method == "teamwork_usage")
        assert all("fixture-google-key" not in json.dumps(payload)
            for _, payload in rpc.calls)
        wrapped.close()
    finally:
        bridge.close()
        store.close()


def test_gemini_native_stream_stop_releases_parent_compute_and_cancels_claim(tmp_path, monkeypatch):
    closed = []

    class _ClosingStream(httpx.SyncByteStream):
        def __iter__(self):
            yield (b'data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}\n\n'
                   b'data: {"candidates":[{"content":{"parts":[{"text":"never-read"}]}}]}\n\n')

        def close(self):
            closed.append(True)

    context, store, bridge, client, rpc = _build_proxy(tmp_path, monkeypatch,
        httpx.MockTransport(lambda request: httpx.Response(200, stream=_ClosingStream())))
    try:
        wrapped = bridge.wrap_client(client, provider="gemini", model="gemini-2.5-flash")
        result = wrapped.chat.completions.create(model="gemini-2.5-flash",
            messages=[{"role": "user", "content": "say hello"}], max_tokens=64, stream=True)
        iterator = iter(result)
        assert next(iterator).choices[0].delta.content == "partial"
        result.close()
        claims = [payload for method, payload in rpc.calls if method == "teamwork_claim"]
        assert len(claims) == 1
        states = [payload for method, payload in rpc.calls if method == "teamwork_usage"]
        assert any(payload.get("state") == "started" for payload in states)
        assert any(payload.get("state") == "completed"
            and payload.get("errorCode") == "provider_stream_closed" for payload in states)
        assert sum(method == "teamwork_compute_release" for method, _ in rpc.calls) == 1
        assert closed
        wrapped.close()
    finally:
        bridge.close()
        store.close()


def test_gemini_native_google_error_preserves_known_status_without_fake_quota_data(tmp_path, monkeypatch):
    response_headers = {"x-goog-request-id": "fixture-request", "retry-after": "3"}

    def respond(_request):
        return httpx.Response(503, headers=response_headers,
            json={"error": {"status": "UNAVAILABLE", "message": "fixture unavailable"}})

    context, store, bridge, client, rpc = _build_proxy(tmp_path, monkeypatch,
        httpx.MockTransport(respond))
    try:
        wrapped = bridge.wrap_client(client, provider="gemini", model="gemini-2.5-flash")
        with pytest.raises(Exception, match="Gemini HTTP 503"):
            list(wrapped.chat.completions.create(model="gemini-2.5-flash",
                messages=[{"role": "user", "content": "say hello"}], max_tokens=64, stream=True))
        observations = [payload for method, payload in rpc.calls if method == "teamwork_observe"]
        # The concrete API error retains its genuine HTTP status and only the
        # proxy's approved retry/quota headers are reportable.
        assert len(observations) == 1
        assert observations[0]["status"] == 503
        assert observations[0]["headers"] == {"retry-after": "3"}
        assert all("fixture-request" not in json.dumps(payload)
            for _, payload in rpc.calls)
        assert any(payload.get("errorCode") == "provider_request_failed"
            for method, payload in rpc.calls if method == "teamwork_usage")
        assert sum(method == "teamwork_compute_release" for method, _ in rpc.calls) == 1
        wrapped.close()
    finally:
        bridge.close()
        store.close()


def test_gemini_oauth_cli_and_non_google_clients_are_not_admitted():
    from runtime.independent.native_chat_auto import native_sdk_supported

    assert native_sdk_supported("gemini")
    for provider in ("gemini-oauth", "gemini-cli", "google-gemini-cli"):
        assert not native_sdk_supported(provider)
    assert not native_sdk_supported("gemini", api_mode="acp")


@pytest.mark.parametrize("url", [
    "https://generativelanguage.googleapis.com/v1beta",
    "https://generativelanguage.googleapis.com/v1alpha",
    "https://generativelanguage.googleapis.com:443/v1",
])
def test_gemini_native_endpoint_accepts_only_google_api_versions(url):
    assert _trusted_gemini_native_endpoint(url)


@pytest.mark.parametrize("url", [
    "http://generativelanguage.googleapis.com/v1beta",
    "https://generativelanguage.googleapis.com.evil.test/v1beta",
    "https://user@generativelanguage.googleapis.com/v1beta",
    "https://generativelanguage.googleapis.com:444/v1beta",
    "https://generativelanguage.googleapis.com/v1beta?key=spoof",
    "https://generativelanguage.googleapis.com/v1beta#fragment",
    "https://generativelanguage.googleapis.com/v1beta/openai",
    "https://generativelanguage.googleapis.com/openai",
])
def test_gemini_native_endpoint_rejects_spoofed_or_non_native_urls(url):
    assert not _trusted_gemini_native_endpoint(url)


def test_gemini_native_proxy_rejects_mutable_google_api_key_header(tmp_path, monkeypatch):
    context, store, bridge, client, _rpc = _build_proxy(tmp_path, monkeypatch,
        httpx.MockTransport(lambda _request: httpx.Response(200, text="{}")))
    try:
        client._default_headers["X-Goog-Api-Key"] = "override-fixture-key"
        with pytest.raises(PolicyDenied, match="credential_mismatch"):
            bridge.wrap_client(client, provider="gemini", model="gemini-2.5-flash")
    finally:
        bridge.close()
        store.close()


def test_gemini_native_proxy_detects_header_mutation_after_binding(tmp_path, monkeypatch):
    context, store, bridge, client, rpc = _build_proxy(tmp_path, monkeypatch,
        httpx.MockTransport(lambda _request: httpx.Response(200, text="{}")))
    try:
        wrapped = bridge.wrap_client(client, provider="gemini", model="gemini-2.5-flash")
        client._default_headers["x-goog-api-key"] = "late-override-fixture"
        with pytest.raises(PolicyDenied, match="auto_bound_sdk_client_required"):
            wrapped.chat.completions.create(model="gemini-2.5-flash",
                messages=[{"role": "user", "content": "say hello"}], max_tokens=16)
        assert not any(method == "teamwork_claim" for method, _ in rpc.calls)
        wrapped.close()
    finally:
        bridge.close()
        store.close()

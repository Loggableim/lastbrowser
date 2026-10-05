# Gemini native bridge review

Stand: 2026-10-05. Read-only review for enabling the explicit Gemini/GPT/Ollama Teamwork combination. No credentials, network calls, or product changes were used.

## Finding and smallest safe implementation seam

The exclusion is real and occurs before transport construction. `runtime/independent/native_chat_auto.py:28–32` makes `native_sdk_supported("gemini")` false. That helper gates AUTO discovery in `manager.py:207`, fixed native capture in `native_sdk_broker.py:38`, and Teamwork admission/role setup in `native_teamwork.py:96,120,187,200`. Removing only this deny entry is insufficient: `NativeAutoBridge._wrap_proven` at `native_chat_auto.py:397–410` then rejects every client except exact `openai.OpenAI` and `anthropic.Anthropic` types.

The existing primary client is concrete: `run_agent.py:6570–6590` constructs `GeminiNativeClient` for provider `gemini` when the configured URL is the native Google endpoint. It exposes `chat.completions.create`, `api_key`, `base_url`, `close`, and accepts the bridge's chat-completion request shape (`gemini_native_adapter.py:812–865,874–944`). Therefore the narrow integration is:

1. Permit only provider ID `gemini` with its expected `chat_completions` mode in `native_sdk_supported`; retain denials for `google-gemini-cli`, `gemini-cli`, and `gemini-oauth` (OAuth/CloudCode transport is a different adapter). Keep other excluded providers unchanged.
2. In `_wrap_proven`, add an explicit exact-type branch for `GeminiNativeClient`, limited to provider `gemini` and native Gemini endpoint recognition. Compare a deliberately normalized configured endpoint to the adapter's normalized `base_url`; bind the exact client object, endpoint, API key and immutable decision as today. Do not admit duck-typed or arbitrary OpenAI-compatible clients.
3. Audit Gemini's identity headers before enabling it. `GeminiNativeClient._headers()` sets `x-goog-api-key`, then overlays mutable `_default_headers` (`gemini_native_adapter.py:857–865`); an override can replace the credential. The bridge's request-header denylist at `auto_provider_proxy.py:129–131` currently does not name `x-goog-api-key`. Reject that key in call headers and reject/filter it from captured default headers; preserve only the already-bound API key. Endpoint equality must not be weakened to host-only matching.

The exact client comparison and bound-client validator can otherwise be reused: `GeminiNativeClient` supplies the same base URL and `api_key` properties which the proof captures. The adapter's normal response is a `SimpleNamespace` with OpenAI-shaped choices and `usage.total_tokens` (`gemini_native_adapter.py:481–547`), which `_usage` already understands (`auto_provider_proxy.py:18–26`). Its stream is a real iterator and emits final `usage.total_tokens` when Google supplies `usageMetadata` (`gemini_native_adapter.py:625–704`), so the existing `_StreamResult` iteration/claim settlement path is compatible in shape.

## Material differences to preserve in the implementation

- Successful Gemini responses discard the underlying HTTP response: the translated response/chunks do not expose status, headers, or a `.response` object. Consequently the proxy cannot observe successful quota/rate-limit headers, unlike its OpenAI route. `gemini_http_error` does retain the `httpx.Response` for failures (`gemini_native_adapter.py:707–783`), so failure status/headers can be observed, though `_error_code` does not recognize Gemini's `gemini_rate_limited` code. Keep missing successful quota headers explicitly unknown; do not synthesize quota facts. A small adapter extension can attach safe response metadata if exact header names and status handling are defined.
- `AsyncGeminiNativeClient` is documented and used as an auxiliary-only wrapper (`gemini_native_adapter.py:947–979`, `auxiliary_client.py:2436–2455`). The native Worker bridge expects the sync Agent client. Do not add the async facade to the accepted client types as part of this fix.
- `GeminiNativeClient.close()` closes its shared `httpx.Client`; the bridge proxy uses that for shutdown, while `_StreamResult.close()` closes the stream iterator (`auto_provider_proxy.py:84–96,265–318`). Add a real local-HTTP stream-cancel test to show generator/response close and exactly-once claim plus compute release. Do not infer timely transport cancellation from `close()` alone.
- The native provider's `default_headers` are copied into the adapter and overlaid after its API-key header. Ensure the bridge proof covers the effective immutable header set (or rejects credentials/identity overrides), including after client construction; checking only object identity, `base_url`, and `api_key` leaves this mutable header surface outside the captured proof.

## Existing tests to extend

There are no in-tree `test_gemini*` files or references to `GeminiNativeClient` in the current test tree. Existing focused scaffolding is useful but presently tests other transports:

- `services/sidekick/tests/test_native_chat_auto.py::test_actual_native_auto_sdk_tool_turn_has_exact_model_claims_and_own_home` exercises the real native AUTO worker/builder and exact claims; add a Gemini-native controlled HTTP sibling and assert discovery/selection plus the same scope/claim contract.
- `services/sidekick/tests/test_native_teamwork_broker.py::test_native_auto_teamwork_uses_parent_plan_and_streams_real_worker_output` exercises Teamwork planning and streamed worker output; parameterize/add only the Gemini role in the explicit Gemini/GPT/Ollama combination, keeping provider IDs and endpoint bound.
- `services/sidekick/tests/test_auto_provider_proxy.py` uses a loopback OpenAI-shaped server to verify request count, output caps, `usage`, rate-limit headers, failure and stream settlement. Add adapter-specific loopback tests for translated Gemini request/response, usage, missing-success-quota metadata, malicious `x-goog-api-key` defaults, and stream closure.

No separate product defect is established beyond the explicit unsupported-adapter gates and the identity-header caveat for any attempted enablement. No tests were run in this read-only review.

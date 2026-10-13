# Chat latency investigation and mini benchmark — 2026-10-11

Investigated patched development 0.1.55 source at bfc39d88 using existing VM credentials. No product source changed in this investigation. Measurements are diagnostic, not installer acceptance. Existing test profile and credentials were retained; no secrets recorded.

## Fresh controlled provider probe

Same prompt: `Coding smoke test: what does Python print(2+3) output? Reply only 5.` Requests streamed directly through the application's validated OpenCode Go connection resolver, with LastBrowser User-Agent and a stable session header. This bypasses the UI, governance/worker startup and large standard-agent prompt. Small token limits; no Ollama or Teamwork calls.

| OpenCode Go model | Valid samples | First visible text (seconds) | Complete (seconds) | Correct |
|---|---:|---|---|---|
| MiMo v2.6 Flash | 2 | 6.493 / 4.631 | 6.650 / 4.632 | 5 in both |
| GPT-5.6-Luna | 1 | 1.262 | 1.401 | 5 |
| Claude Haiku 5.5 | 2 | 1.441 / 1.304 | 1.450 / 1.314 | 5 in both |

Connection resolution per request: 2–3 ms. One initial GPT harness request used the wrong endpoint because its mode is named codex_responses; it returned HTTP 400 in 0.491 seconds. Corrected to Responses before the valid GPT measurement; this harness error is excluded from successful timings. These few samples are not percentiles, an SLA, or a ranking of separate MiMo/GPT subscriptions.

## Confirmed local bottlenecks

1. Renderer submission calls readCapturedSpaceModelSelection with includeCatalog=true before starting chat. PR #71 makes the user's own message visible earlier, but retains this catalog work.
2. Backend capture_fixed_provider independently invokes probe_catalog with include_capabilities=true before returning chat-start headers. The actual 20:48 request thread stack shows capture_native_chat_context -> capture_fixed_provider -> probe_catalog -> manager.run_interactive -> WorkerHandle.read_event. This proves a catalog-worker wait rather than an inference wait in that phase.
3. WorkerHost.start creates a fresh Python process for catalog discovery. get_available_models uses a process-local cache. A fresh diagnostic process on the same runtime profile measured cold catalog 2.436 seconds versus warm 0.004 seconds. The profiled cold call included three URL fetches (~0.686 seconds cumulative), imports and 39 auth-status checks. Fresh workers cannot reuse that warm cache.
4. Actual 20:48 chat-start route completed in 7.890 seconds: stream_registration (including provider capture/catalog validation) 5.171 seconds, save_pending_state 1.344 seconds, resolve_workspace 0.765 seconds, resolve_model_provider 0.407 seconds. The label save_pending_state also covers writer reservation, policy and orchestration setup; its full duration must not be attributed to disk writes alone. Across historical recorded requests, stream_registration was about 4.7–10.9 seconds and save_pending_state about 0.9–4.2 seconds.
5. Another 16.130 seconds elapsed between the 20:48 route completion and the logged engine conversation start. Native worker initialization and preparation occur there; available phase logs do not isolate the whole gap. Cold-process probes: runner ~0.48–0.56 seconds; config ~0.56–0.76; native worker module ~0.62–0.68; streaming import 2.38; run_agent import 1.82. These imports overlap and cannot be added to claim an explanation of all 16 seconds.
6. Standardchat sends ~4,800–4,900 input tokens for these short exchanges, including system/tool context and history. The recorded `hi` call used 4,898 input / 28 output tokens and took 39.7 seconds in the logged API interval. Previous OpenCode/MiMo intervals were 50.6, 39.6 and 15.6 seconds. Direct minimal-prompt probes are faster, but cannot prove exactly how much of the difference is prompt cost versus gateway/model variability or application-side SDK preparation.

## Priority recommendations

- Reuse a profile/configuration-digest-bound model catalog between renderer preflight and backend provider capture; retain scope, generation, model-policy and credential-change checks. Avoid replacing those checks with an unvalidated global cache.
- Preserve safe catalog caching across worker lifetimes or use a dedicated read-only discovery worker; do not reuse mutable chat workers across profiles.
- Add monotonic timing for catalog admission/start/result, native-worker ready, agent construction, credential resolution, HTTP request dispatch, first text and completion. Existing API latency alone is not a pure server inference measurement.
- Measure and reduce prompt/tool inventory for ordinary short chat, preserving required policy/tool semantics.
- Profile writer reservation/orchestration and the remaining worker-start gap before changing SQLite or filesystem behavior.

No additional bug fix or new product PR was made here. PR #71 fixes visible send feedback, not actual time to first model answer. No GUI timing acceptance was claimed; this investigation used execution tools, structured logs, source and actual tiny provider requests.

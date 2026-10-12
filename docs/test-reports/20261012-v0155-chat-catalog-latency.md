# v0.1.55 chat catalog latency: source integration

## Scope and cause

This report belongs to PR70 after PR65, PR67, PR68, and PR71. The VM owner's
mini-benchmark reported a 2.436 s fresh catalog discovery and a 0.004 s warm
process discovery. The renderer's send preflight and the backend's
`capture_fixed_provider` independently requested that full catalog. The
backend worker did not inherit a previous worker's process cache. The reported
chat start was 7.890 s, including 5.171 s stream registration/provider capture
and 1.344 s pending setup. The later 16.130 s before Engine remains unattributed
by that report. These are the VM owner's earlier observations, not new VM
measurements on this PR.

## Change

`probe_catalog` now keeps only a five-second discovery receipt on the owning
profile manager. The key includes runner generation, exact Scope, partition and
binding revision, capability mode, provider configuration digest, native Space
configuration, stable auth identity, and exact credential-file digest. A cache
hit resolves the Scope again and checks its current binding, Space policy,
configuration, and credential state. Concurrent callers share one in-flight discovery. A
failed or invalid response is not cached; scope, account, token, provider
configuration, binding, or generation changes force a new discovery. The
existing fixed-provider policy, configured-model check, independent support,
context-length check, provider capture, and final configuration check still run.
This reuse does not accept an old model choice or bypass qualification.

The native chat parent records monotonic elapsed milliseconds for broker ready,
worker spawn send, worker ready, first worker event, first text, and worker
finish. Logs contain a random stream ID and fixed stage names; they contain no
prompt, token, credential, URL, model, or response body. These markers split
local startup from provider first-text wait on the next authorized VM run.
They cannot yet establish which part of the previously observed 16.130 s
belongs to agent construction, prompt assembly, request dispatch, or provider
TTFT. No system/tool prompt was removed without that evidence.

## Controlled source measurement and tests

A delayed catalog fixture (150 ms injected in discovery) ran the same model
selection `get` operation twice: cold 371.0 ms, immediate warm 28.5 ms on this
host. This proves the second operation avoided a second worker discovery in
that fixture; it is not a predicted VM or provider latency. The focused suite
passed 24 tests, with one packaged-worker test excluded because this host's
isolated Python 3.14 child lacks `pydantic`. New cases cover provider-config
change, browser/Space scope change, credential change and token rotation,
OpenCode device/CLI credentials, runner generation, expiry, stale resolved binding, Space policy change,
concurrent singleflight, and failed discovery retry.

The broader `test_native_chat_parent.py` invocation gave 3 pass and 5 timeout
failures in isolated child processes. This host's Python 3.14 isolated child
cannot import the packaged `pydantic` dependency; these failures are not
treated as a product pass or a proven regression. No VM or provider request was
run for this latency change.

## OpenCode Go note

The [official Go documentation](https://opencode.ai/docs/go/) asks compatible clients for their own User-Agent
and a stable `x-opencode-session` per conversation. The current integrated
device path already derives that header from the saved chat session and profile
home, uses `LastBrowser/0.1.55`, and carries the header through chat,
Responses, Anthropic, and auxiliary SDK clients. Existing offline tests assert
same-conversation stability, cross-conversation separation, and auxiliary
header forwarding. The OpenCode device and inference tests passed 43/43 with
`PYTHONPATH=services/sidekick` for the subprocess import path. Provider-side prompt-cache hits and cached-token usage have
not been measured here; the local model catalog cache is a different mechanism.

## Evidence boundary

The source change and synthetic delay do not establish VM startup, live
inference, prompt-cache hit rate, reduced real input tokens, or release
acceptance. The existing VM owner must compare the same short prompt and
profile before and after this exact package, separating local startup and
provider TTFT. The startup blackout must be recorded before inferring a cause.

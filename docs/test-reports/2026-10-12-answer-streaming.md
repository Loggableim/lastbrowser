# Answer streaming — 2026-10-12

## Scope and candidate

User requested that the first answer text be shown without waiting for completion. Tested the running source build at `37c975cc0e145cf03eed5e0c890f0b67b4d6e3b7` (`C:\work\lastbrowser-chat-debug`), not a newly installed/pinned release. Native Windows UI operated with the computer-use skill and `@oai/sky`. No authentication interaction, credentials, product edits, or model/tool side effects. Two bounded text-only calls use the existing OpenCode Go connection and small GPT 5.6 Luna model; no additional baseline call.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| First one-character SSE delta delivered while connection remains open | PASS, controlled transport/state test | `stream-first-character-probe.mjs` |
| Fragmented SSE frame does not produce invalid/early content | PASS | Same probe |
| Following delta appends before terminal event | PASS | Same probe |
| Standardchat displays growing partial answer before completion | PASS, live | Screenshots 16/17, timestamps below |
| Quickchat displays growing partial answer before completion | PASS, live | Screenshots 18/19, timestamps below |
| Exact first backend delta to first screen paint latency | NOT MEASURED | Screenshots are samples, not continuous frame instrumentation |

Controlled probe bundles actual `chat-stream.ts` and `chat-live-stream.ts`. It holds the SSE body open, sends an incomplete `H` frame, completes that frame, checks visible-message state is `H` with pending false before any subsequent delta/terminal, sends `i`, checks `Hi`, then sends terminal. It does not claim to measure DOM paint. Run: `node docs/test-reports/stream-first-character-probe.mjs C:/work/lastbrowser-chat-debug` (requires that checkout's esbuild dependency). Exit 0: PASS.

## Standardchat live probe

Prompt `STREAM-CHECK-1`: 35 short numbered sentences about trees, no tools. Session `2d0123969472`, stream `5728c3fbf6ec47a19b6fd22b13e554d8`.

- Enter: **07:23:35.505 UTC**.
- Backend first text: **07:25:15.430 UTC**, approximately **99.9 s after Enter**.
- Screenshot at +109.2 s: first six lines visible; stop control still active.
- Screenshot at +115.9 s: eleven lines visible; stop still active.
- Screenshot at +131.3 s: seventeen complete lines and `18.` visible; stop still active.
- Backend text response completed **07:26:23.779 UTC**; worker finished **07:26:25.659 UTC**. UI subsequently shows all 35 lines and send control restored.

Evidence: [partial](evidence/p004-1a37f9d1/16-standard-gpt-streaming-partial.png), [growth](evidence/p004-1a37f9d1/17-standard-gpt-streaming-growth.png).

The sampled first-text-to-visible upper bound is about **9.3 s**, not a measured 9.3 s UI delay. This proves text appeared well before completion; it does **not** prove sub-100 ms first paint. The long initial wait is before the host's first-text event. Chat-start route took 16.031 s (registration 9.859 s, save pending 2.719 s); worker/agent initialization and provider wait follow. Provider call lasted 100.5 s including roughly 68 s of streamed output. These durations must not be confused with whole-answer buffering.

## Source review

Backend `on_token` calls `put('token', ...)` immediately. Its 100 ms throttle applies to metering, not answer tokens. Host forwards worker events; Electron reader dispatches each complete SSE frame without waiting for EOF; Standardchat and Quickchat apply text deltas to React state. No intentional answer batching timer found on these paths. Think/memory scrubbers intentionally retain incomplete tag prefixes and hide internal content; ordinary prose is forwarded. Reasoning is separate from visible answer text.

No new streaming bug established by these checks; no product fix or new PR claimed. Existing cancellation/composer PR is separate.

## Quickchat live probe

Prompt `STREAM-QC-2`: 25 short numbered sentences about rivers, no tools. Existing connection, GPT 5.6 Luna (Quickchat adopted the globally active model), session `2ba18438b93a4acea7de67b8ac8c6015`, stream `58ac79b317fe4ba7a04532f1153a7154`.

- Enter: **07:27:22.861 UTC**.
- Backend first text: **07:28:33.812 UTC**, approximately **71.0 s after Enter**.
- At +77.2 s: three complete lines and `4.` visible, stop active.
- At +102.6 s: fourteen complete lines and a partial fifteenth visible, stop active.
- Backend completed **07:29:28.244 UTC**, worker finished **07:29:30.078 UTC**. At +139.0 s all 25 lines were visible and Send restored. Provider call 75.5 s, including about 54 s after first host text.

Evidence: [partial](evidence/p004-1a37f9d1/18-quickchat-gpt-streaming-partial.png), [growth](evidence/p004-1a37f9d1/19-quickchat-gpt-streaming-growth.png). Sampled upper bound from host first text to observed partial is about 6.2 s; actual first paint was not recorded. A lightweight focused test run occurred after the first partial screenshot, so later throughput is not a controlled benchmark.

Additional regression verification: `vitest run tests/chat-stream.test.ts tests/chat-live-stream-error.test.ts --maxWorkers=1 --testTimeout=60000`: **22 tests PASS**, 2 files. Controlled first-character probe PASS. No newly established failures or access blockers; exact first-paint latency remains unverified. Results apply to this source build/model/connection, not every model or packaged release.

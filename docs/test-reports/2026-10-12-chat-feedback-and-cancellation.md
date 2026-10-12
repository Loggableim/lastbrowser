# Chat feedback and cancellation investigation

Base initially: 0.1.55 source `1a37f9d12121be0ced83097e2d0ffb5543e7c162`; subsequently integrated upstream `0c653d2e`. Fix head `37c975cc0e145cf03eed5e0c890f0b67b4d6e3b7`, [PR #74](https://github.com/Loggableim/lastbrowser/pull/74), branch `codex/chat-cancellation-terminal-fixes`. This source-build investigation does not replace acceptance of the pinned installed package.

## Send to visible history

The Standardchat submission boundary already echoes the user message and clears the composer synchronously, before scope/catalog IPC. In the live source build, `CHAT-ECHO-DEV: Reply only 5. Do not use tools.` was sent with Enter at UTC 2026-10-12 05:34:43.190. The first capture completed 1,084 ms later and showed the user message in history and an empty composer. This is an upper bound including input/capture overhead, not an exact paint latency.

Quickchat still appended its user message only after awaiting `readCapturedSpaceModelSelection` (resolveScope and modelSelection/includeCatalog). Thus slow discovery delayed the visible send acknowledgement even though the composer had cleared. The patch echoes before that await, reserves against duplicate sends, and rolls back only that exact optimistic message on a definite preflight failure. A captured-scope rollback preserves other history and restores the previous transcript binding. Ambiguous outcomes after start remain visible rather than encouraging duplicate sends.

Regression tests execute the actual App submission functions with deliberately stalled preflight promises; no provider call is needed to establish this ordering.

**Live source-build PASS for immediate echo:** after restarting with merged head `37c975cc`, Quickchat MiMo Go sent `QC-ECHO-MERGED: Reply only 5. Do not use tools.` with Enter at UTC 05:49:46.914. The first screenshot completed 1,542 ms later and showed the user message in history and an empty composer, before an assistant placeholder/model response. [Immediate Quickchat echo](evidence/p004-1a37f9d1/11-quickchat-immediate-echo-source.jpg). This is a capture-inclusive upper bound, not an exact paint measurement or provider-success result.

**Live reply PASS:** the same request subsequently returned exactly `5`, confirmed visually and by the backend (`mimo-v2.6-flash`, `opencode-go`, one API call). [Completed source-build reply](evidence/p004-1a37f9d1/12-quickchat-mimo-reply-source.jpg). First text logged at local 22:50:53.141 (about 66.2 s after UI Enter), API latency 26.9 s; broker-ready 22:50:04.514, worker-ready 22:50:07.978, first worker event 22:50:10.117, conversation turn 22:50:26.667. These separate local startup from provider waiting. The optimistic echo succeeded while the response itself remained slow.

Standardchat GPT 5.6 Luna Go on the merged source echoed `STANDARD-GPT-MERGED` and cleared the composer in the first capture, completed 1,175 ms after Enter at UTC 05:52:39.567. [Standardchat immediate echo](evidence/p004-1a37f9d1/14-standard-gpt-immediate-echo-source.jpg). Its response is checked separately from this send-feedback observation.

**Standardchat GPT reply PASS:** returned exactly `5`; backend confirmed `gpt-5.6-luna`, `opencode-go`, one API call and normal completion. [Completed GPT source-build reply](evidence/p004-1a37f9d1/15-standard-gpt-reply-source.jpg). First text at local 22:54:14.540, approximately 95.0 s after UI Enter; API reported 28.0 s. `/api/chat/start` reported 16,266 ms, including save_pending_state 4,000 ms and stream_registration 10,063 ms. Broker-ready 22:53:16.127; worker-ready 22:53:24.242; agent-ready 22:53:40.859; conversation-start 22:53:42.587; provider conversation-turn 22:53:47.310; worker-finished 22:54:17.600. Worker-local and host-local elapsed origins differ, so they are not summed. Startup/persistence/registration and agent setup contribute materially beyond the API duration; their internal root causes require separate profiling. The immediate send-echo fix does not solve these delays.

## Model response delay is separate

The preceding pinned-package acceptance already measured substantial local startup work before inference, in addition to API latency. See [exact-candidate acceptance](2026-10-11-p004-1a37f9d1-vm-acceptance.md). No claim that an optimistic echo makes inference faster.

Additional pinned-package Quickchat MiMo Go request: `P004-MATRIX-MIMO: Python print(2+3) outputs what? Reply only 5.` returned exactly `5`. Host trace: first text 46,921 ms, worker finished 48,343 ms; API reported 15.2 s. [MiMo Quickchat result](evidence/p004-1a37f9d1/10-quickchat-mimo-five.jpg). Together with the preceding report, short replies have been observed for MiMo V2.6 Flash and GPT 5.6 Luna via OpenCode Go on both Standardchat and Quickchat. This is not qualification of all routes/models.

The source-build echo request was stopped before response delivery; backend logged `native_chat_rpc_interrupted`, `interrupted_during_api_call`, and `worker_finished`. It is not a successful short-reply test. Concurrent build/test activity makes subsequent source-build timings unsuitable for an idle-host benchmark. This VM has about 6 GiB visible RAM; a sample during those checks had about 975 MiB free. Memory pressure is a possible confounder, not a proven sole root cause.

## Cancellation fixes

- Standardchat records Stop while the start acknowledgement has not yet supplied a stream ID. Once accepted, cancellation targets that exact scoped stream. Ownership is retained until the original waiter observes termination; a dispatch acknowledgement is not treated as completion.
- Cancelling before inference admission avoids starting the request and does not restore a cancelled draft.
- Quickchat removes a stopped empty assistant placeholder while retaining user messages, prior responses, and any partial answer/reasoning.
- Standardchat terminal cleanup also removes a placeholder whose pending/streaming flags were already cleared by terminal processing.

**Live Quickchat Stop PASS on merged source:** subsequent `QC-STOP-MERGED` was stopped using its visible red Stop button. The placeholder disappeared; the user message and preceding `5` answer remained. Backend stream `833161c719ab413480b3cd9acfea9279` logged `native_chat_rpc_interrupted` and `worker_finished` at local 22:51:52.156; no numbered answer was delivered. [Clean terminal UI](evidence/p004-1a37f9d1/13-quickchat-stop-clean-source.jpg). Reasoning/partial-answer retention is covered by unit tests; this live run cancelled before text.

## Validation and limits

On merged head: **65 tests / 10 files pass**, covering chat submission, cancellation, ownership, stream presentation, transcript recovery and actual rendered chat. Production build/typecheck passed. Full store preflight reported 39 passed, 2 warnings, 0 failures. Python compileall passed.

The broad desktop suite is not green: an earlier full run had 235 passing / 7 failing files (2,167 passing / 14 failing tests), including locale expectation failures and worker/test timeouts. A later `npm test` run was interrupted under heavy VM load and is not a pass. Some timed-out cases pass when rerun serially, including rendered chat, secret fixtures and sidebar geometry. These results do not establish a fully green repository baseline.

Upstream concurrently implemented its own Standardchat Stop/prelaunch cancellation and writer-release fixes. Those were retained; the PR's final diff adds only Quickchat echo/rollback and stopped partial-output preservation plus tests (4 files). Upstream also replaces repeated child-history Refresh controls with a single action; this single action is visible after restarting the merged source build.

PR #74 is ready for review, with successful live Quickchat echo/reply/Stop and Standardchat GPT echo/reply checks. Outstanding: exact packaged-head acceptance, latest Standardchat early-cancel VM retest, clean latency baseline/local-startup profiling, and pinned-package startup black-window failure. No release-wide success or blanket beta graduation is claimed. No extra login is required for these successful Go requests.

# v0.1.55 chat Stop follow-up after P004 VM acceptance

## Trigger and scope

The installed, unsigned `1a37f9d1` VM candidate was **NOT ACCEPTED** in
`60b4a75e585b66f086e389b8bdb1ceaf271ccbd0` at
`docs/test-reports/2026-10-11-p004-1a37f9d1-vm-acceptance.md`. Its package and
provider checks passed, but first startup showed a black client area. Standard
chat ignored an early Stop while start acceptance was pending, and Quickchat
retained a completed `Working on it...` bubble after a live-worker Stop.
Repeated child-history recovery controls remained visible after the standard
chat stopped. The first-paint issue belongs to the separate Main-process
startup investigation; this change does not touch `apps/desktop/src/main/`.

## Source changes in this follow-up

- Standard chat records Stop against the active UI turn while start acceptance
  has no stream ID. The Stop control appears while model preflight is pending
  and binds to that submitted draft. A Stop before backend acceptance removes
  the optimistic echo and keeps the explicitly cleared composer empty. It
  avoids the transport call if Stop precedes it. If the
  backend accepted the turn already, the renderer sends a scoped cancel as soon
  as it receives the stream ID and waits for the terminal stream event.
- The native backend settles a cancelled, registered turn before worker launch,
  preserving its accepted user message and sending `cancel` and `stream_end`
  without spawning a child. For the Root path, terminal events wait for verified
  writer-lease release. If pending-state cleanup fails, it reports a bounded
  `native_chat_cleanup_unconfirmed` error after lease release instead of a
  successful cancel. The existing worker path handles a later cancellation.
- Terminal cancellation removes an empty assistant placeholder while retaining
  partial answer text. Quickchat applies this on explicit Stop and native
  cancel events. Child-history recovery now offers one action for multiple
  missing turns instead of a button per turn.
- Worker phase logs identify agent setup, agent readiness, and conversation
  entry, all using one worker-local monotonic origin. They make the VM report's
  unexplained 41.8-second pre-conversation interval measurable on a future
  authorized run. They do not establish its cause or reduce measured latency.

## Verification and remaining acceptance

The source regression test forbids worker spawn on prelaunch cancellation and
confirms the terminal events and saved transcript. Renderer tests cover
stopped-placeholder cleanup, scoped chat start wiring, Quickchat Stop, and the
single child-history recovery action. Final local gates before commit:

| Gate | Result |
|---|---|
| `npm test` | 241/241 suites, 2182/2182 tests passed |
| `npm run verify:store` | 39 PASS, 2 WARN, 0 FAIL; no final signed package supplied |
| `npm --workspace apps/desktop run build` | Passed, 0 TypeScript/Vite errors |
| `python -m compileall -q services/sidekick` | Passed |
| Scoped Python prelaunch cancellation and cleanup | 3 passed |

This change has **source-only** verification. The private draft package still
contains `1a37f9d1`; it must not be described as this follow-up's package.
No new VM run, live provider call, signing, merge, or publication was made for
this follow-up. VM acceptance remains **NOT ACCEPTED** until a new exact-head
package and authorized VM retest prove first paint, early Stop, Quickchat
terminal UI, and the complete chat flow. The prior baseline lacks first-text
timing, so it cannot support an end-to-end latency improvement claim.

## PR #74 integration and release decision (2026-10-12)

PR #74 (`37c975cc`) was added after the source-only follow-up above. It echoes
Quickchat's submitted message before model discovery and preserves actual
partial text and reasoning when Stop ends a stream. The independent review
found two source issues in that head: Stop was hidden during discovery, and a
provider response whose literal text was `Working on it...` could be removed
as if it were the UI placeholder. The integration follow-up makes Quickchat
busy during discovery, exposes Stop for the captured scope, rolls back the
unsent echo on preflight Stop, and clears placeholder text only while the
assistant message is pending. A literal streamed response is retained.

Combined local gates after these fixes: `npm test` passed 243/243 files and
2190/2190 tests; `npm run verify:store` passed 39 checks with 2 warnings and
0 failures; the desktop build and Python compileall both passed. These are
source results, pending independent review of the exact integration head.

The user's v0.1.55 release decision defers the first-paint black client area
to a known issue. The installed unsigned `1a37f9d1` VM candidate remains
**NOT ACCEPTED**; this decision does not turn its first-paint result into a
pass. A roughly 105-second first-text observation on that candidate has no
comparable earlier baseline, and PR #74's later source-build observation of
about 66 seconds to first text does not prove an improvement. The precise
pre-conversation delay and live release behavior remain unverified. Newly
found bugs after release are tracked for v0.1.56.

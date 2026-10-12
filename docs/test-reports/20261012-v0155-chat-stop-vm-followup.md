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

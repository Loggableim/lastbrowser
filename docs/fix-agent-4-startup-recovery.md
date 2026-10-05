# FIX AGENT 4 — Space Assistant startup/recovery

## Finding

The cold-start race is confirmed by both the call order and the recorded
stderr. In [`main.ts`](../apps/desktop/src/main/main.ts#L1339),
`services.start()` is followed immediately by `independentController.start()`
([line 1347](../apps/desktop/src/main/main.ts#L1347)).
[`SidecarServices.start()`](../apps/desktop/src/main/services.ts#L589) returns
`getStatus()` after spawning the Python process ([line
696](../apps/desktop/src/main/services.ts#L696)); at that point the child has
only reached `sidekick: ready, webuiHealth: checking` ([lines
662–664](../apps/desktop/src/main/services.ts#L662)). This is process-spawn
readiness, not HTTP/Uvicorn readiness.

The manual launch log records connection refusals to `127.0.0.1:8788` on
lines 10, 25, and 40, before Uvicorn's `Application startup complete` and
listening messages on lines 51–52. The old `IndependentController.start()`
sent one browser handshake and disconnected/rethrew on failure. The shared
`main.ts` callsite only logged that failure; it did not retry. Main's
work-admission path could reconnect before a later assistant turn, but
read-only `assistantSnapshot`/observer polls did not.

There was a separate recovery-state bug: a transport error was retained in
the renderer store by `markUnavailable()`
([`useSpaceAssistantStore.ts:101`](../apps/desktop/src/renderer/stores/useSpaceAssistantStore.ts#L101)).
Successful empty `events` plus `activity` polling did not request a fresh
assistant snapshot, and only accepting a snapshot clears that error
([`acceptSnapshot`](../apps/desktop/src/renderer/stores/useSpaceAssistantStore.ts#L57)).
So a startup read failure could remain visible after the backend recovered.

## Change

- `sidekick-api.ts` now maps only nested `ECONNREFUSED` from the local
  independent API to retryable `sidekick_not_ready`. Resets, timeouts, HTTP
  failures, scope errors, and permission errors are not reclassified.
- Main's independent controller retries only that explicit readiness error
  during `browser.handshake`: the initial attempt plus at most five retries
  with 250/500/1000/2000/4000 ms delays. It uses the same gateway and retries
  only a refused connection, which means the server did not accept the
  handshake. Superseded/shutdown starts abort the delay; exhausted retries
  still fail closed and disconnect. No assistant turn, dispatch, approval, or
  permission action is replayed.
- On a later successful observer poll after `sidekick_not_ready`, the renderer
  requests a read-only `assistantSnapshot` even when no event arrived. A valid
  scope/revision snapshot clears the transient request error and rehydrates
  the first Space without requiring a Space switch. A failed snapshot keeps
  the error; a current activity error is retained. If the recovered snapshot
  itself says live activity is unavailable, that separate truthful status
  remains visible.
- `main.ts`, scope binding, profile selection, bridge authorization, and
  permissions were not changed.

## Verification

Passed targeted checks:

- `npm --workspace apps/desktop run test:run -- tests/independent-controller.test.ts tests/independent-assistant.test.ts tests/sidekick-api.test.ts` — 3 files, 131 tests passed. This includes a real loopback HTTP listener delayed until after the first refusal; Main startup completed after it became ready, and no assistant action was sent during handshake retries.
- `npm --workspace apps/desktop exec -- tsc --noEmit -p tsconfig.main.json` — passed.
- `npm --workspace apps/desktop run typecheck:renderer` — passed.

The existing independent-controller tests continue to exercise scope/profile,
sender, and lease boundaries. No permission relaxation was made.

## Remaining proof boundary

The delayed-loopback test exercises actual fetch/TCP refusal, readiness
classification, the bounded handshake retry, and a single accepted handshake;
the renderer test exercises transient-error recovery through read-only
rehydration without a Space switch or user-action replay. It is not a fresh
Sidekick/Uvicorn cold-start on the packaged application. No desktop build,
package, installer, or live app relaunch was performed for this fix, as
requested. Therefore the updated source still needs a coordinated cold-start
test with an isolated test profile and a deliberately delayed bundled backend.
Do not touch the user's live browser process (PID 106072). No full test suite,
commit, push, or publication was performed.

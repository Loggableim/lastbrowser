# Stability audit, 2026-10-02

This is a source follow-up to the published v0.1.43 release. These changes are
not present in that installer. A passing isolated check is not a claim that
every provider, installed profile, or browser workflow works.

## Changes

- Preserve a local streaming response when the matching session snapshot has
  not persisted that turn yet. Other session/stream snapshots remain isolated.
- Recover an orphaned pending chat after reload instead of leaving its composer
  permanently busy. Show an actionable, localized interruption notice.
- Resolve the Space/model/provider selection consistently in native Chat and
  Copilot. Keep the model picker and catalog retry available on catalog failure.
- Normalize raw and qualified catalog entries, preserve colon-bearing named
  provider/model IDs, honor the active provider for duplicate bare model IDs,
  and reject entries qualified for a different provider than their group.
- Avoid rendering a second pending user bubble for the same in-flight turn;
  repeated prompts in separate completed turns remain visible.
- Bound main-process generic API requests to 30 seconds, including auth refresh
  and body reading. Abort late work and avoid reflecting private request URLs.
- Wake model-cache waiters when a builder fails without producing a cache.
- Run synchronous onboarding status/setup/complete/probe helpers outside the
  ASGI event loop while preserving the selected request profile. Keep the
  catalog warm across unrelated settings edits; free/paid changes still
  invalidate it, as do config and credentials changes.
- Pause a persistent goal after bounded judge-provider retries, retain bounded
  response evidence, and rejudge it on explicit resume before another generation.
  An unavailable judge does not imply either completion or continuation.
- Carry the selected profile and filesystem Space path through desktop session
  list/detail and mutations. Keep native storage ownership separate from the
  goal namespace, including migration of legacy `lbws-*` session metadata.
- Send the turn's profile explicitly when starting native Chat; verify the
  non-default profile in both the JSON body and profile cookie. Seed a real
  legacy goal during migration tests, and reject untrusted workspace filters.
- Scope implicit session creation for the first Chat prompt as well as explicit
  creation. The compatibility chat API carries the same scope through creation,
  detail reads and polling instead of silently falling back to the default.
- Discard stale session-list responses after a Space/profile change. Release
  the old UI busy state without cancelling its backend turn; an older turn
  cannot release a newer turn's composer lock.
- Retry transient empty loupe captures up to three times at the existing
  throttle, including when the pointer stays still. Reset the retry window
  when it moves, then retain the existing text fallback after exhaustion.
- Let bridge SSE readers wait on an async event rather than occupying one
  default-executor worker per idle connection. Keep the producer queue thread
  safe, batch buffered writes, and wake consumers on write, finish and close.
  Twelve idle streams with a four-worker executor no longer prevent ordinary
  executor work. Cross-thread ordered writes and cancellation are covered.
- Report a fixed, sanitized transport error if SSE closes without a terminal
  event; a bare EOF is no longer silently treated as a healthy subscription.
- Retain terminal frames independently of the offline backlog, including
  `apperror`, so a new subscriber can finish after an older subscriber received
  the last event. The server also closes its SSE loop on `apperror`.

## Executed verification

- Desktop source gates after implicit session creation, renderer stream ownership
  and final chat color changes: 138 suites / 1,223 tests passed. Two source-contract assertions were
  updated for the current shared selection call and whitespace-independent checks.
- Store: 27/27; Main/Renderer build and Python compileall passed.
- Full Python suite including transport diagnostics and loopback heartbeat:
  2,523 passed / 105 skipped, zero failures, two uvicorn/websockets deprecation
  warnings in 417.96 seconds (`full-python-window-stream-final.log`). This run
  does not cover externally added Windows UIA files/tests arriving after its
  collection. Local GoalManager resume
  and completion evaluation check the
  persisted snapshot after judging, preventing another manager's newer state
  from being overwritten. Same-loop gateway/CLI command handling is serialized;
  the completion guard additionally protects against independent/shared-store
  writers. Two-manager pause, clear and replacement regressions passed.
- Source-built isolated Ollama smoke: 21/21. Catalog: 17 models; model:
  `deepseek-v4.1-flash`. First answer delta: 29,584 ms. Answer and thinking deltas
  arrived before completion; final answer persisted; cancellation completed.
  Planner, worker, critic and synthesizer used the pinned Ollama model. A goal
  completed in two separate assistant turns after renderer restart.
- Separate native Chat UI smoke: 8/8 in `source-native-120s.log`; first answer
  text appeared 2.4 ms after its first answer delta while the request was active.
  The expanded thinking section displayed reasoning while generation was
  running; the stream delivered 1,458 reasoning characters. Answer assertions
  exclude metadata and thinking text. This older run stopped after partial
  answer text; it does not prove a completed native UI response. The current
  combined smoke requires a terminal event and an idle composer.
- Appearance matrix against signed, unpacked v0.1.43: 16/16, including backend
  persistence and reload hydration. This validates the existing release, not
  a new signed package for this follow-up.
- Comprehensive source IPC smoke (`source-ollama-scoped-final.log`):
  23/23, including a completed real Ollama answer, reasoning, cancellation,
  four-role Teamwork and a two-turn persistent goal after renderer restart.
  Its fixture is listed and selected in the owning profile/Space before reload.
  First content arrived after 6,032 ms. The separate goal run passed 18/18.
- Latest comprehensive source IPC smoke after window ownership and contrast
  fixes (`source-ollama-window-stream-final.log`): 23/23, zero failures or skips.
  First content arrived after 6,051 ms; real streaming, reasoning, cancellation,
  four-role Teamwork and the selected two-turn goal after reload pass again.

## Runtime investigation and verification

Earlier combined browser-plus-chat source smokes failed. One run reached
69/71 checks with an empty chat after a same-task synthetic input/submit;
the harness now waits for the controlled input to commit. A later run passed
the browser workflows but timed out loading `/api/models` after 30 seconds.
The composer was initially responsive; a subsequent direct health probe also
timed out. A diagnostic rerun captures Python stacks without locals or tokens.
Python stack dumps subsequently established the cause: the asynchronous
onboarding-status handler calls the synchronous catalog builder directly on
the ASGI event loop. A cold OpenRouter catalog response read then blocks that
loop, including health requests. The remediation and its concurrent health
regression require a final runtime rerun before a broad acceptance claim.
The first rerun after remediation returned the catalog in 5,626 ms and its
direct health probe returned HTTP 200. It then stopped at a harness frame wait:
the detached window had put the original shell in the background, where
`requestAnimationFrame` pauses. Remaining actions now reactivate the original
shell and use a next-task wait for controlled input. The snap-flyout check also
waits up to two seconds for the actual layout cards instead of sampling after
a fixed 150 ms. Neither correction substitutes a fake drag or provider result.

The latest combined run (`source-full-120s.log`) finished 68/72 with one skip:
three chat checks failed because only two heartbeat events arrived before the
120-second deadline, with no answer/reasoning/error. This failure is retained;
its cause is not proven by the later successful isolated 8/8 UI run or 10/10
IPC run (first content 6,260 ms). The remaining failure was loupe capture while
the OS pointer was outside the test window. CDP mouse movement does not move
the native pointer used by the loupe; the harness now explicitly skips that
unsupported capture condition instead of claiming capture succeeded.

The comprehensive rerun (`source-ollama-comprehensive-closure.log`) reached
19/21: provider streaming, cancellation and four-role Teamwork passed, but
the goal stayed active after one turn following reload. Fixture investigation
found that the API-created goal was never selected in the renderer. Explicit
selection then revealed a scope-contract gap: creation carries profile and
workspace, whereas the session list is unscoped and omits the new session after
reload (`source-goal-fixture-diagnostic.log`, `source-goal-scoped-fixture.log`).
Backend and renderer scope fixes now pass the full gates and the scoped goal
and comprehensive live runs above. The latest combined browser-plus-chat run
(`source-full-scoped-final.log`) still fails 4 checks: loupe capture returned
no image with the OS pointer reported inside the window, and the chat received
only one heartbeat before its 120-second deadline. It finished 68/72 with one
skip. This combined-path failure remains under investigation; the successful
23/23 isolated IPC run does not establish its cause or resolve it.
No new release is accepted on these failed combined live runs.
The executor-isolation fix passes 48 focused bridge tests; it addresses a
deterministic resource-starvation case. A combined runtime rerun is required
before attributing the particular live failure to this mechanism.
The instrumented pre-bridge-fix run (`source-full-transport-diagnostic.log`)
finished 69/72 with one skip: loupe captured real 90x90 pixels, but the three
chat checks still failed. After its deadline, stream status was reachable and
reported inactive, and direct health returned HTTP 200. This proves neither
provider quota exhaustion nor renderer ownership loss; the stream delivered
only one heartbeat. These observations remain diagnostic history.
The subsequent `source-full-terminal-final.log` still finished 69/72 with one
skip and the same three chat failures after the async-writer fix. Therefore
executor starvation is not established as this particular failure's cause.
The implicit-scope rerun (`source-full-implicit-scope-final.log`) finished
68/71 with two skips. The real answer now appears through the scoped status
poll, but no answer, reasoning or completion event reaches the UI stream.
It receives one heartbeat, then a later poll observes the completed persisted
turn. Therefore the three strict streaming checks still fail. Bounded lifecycle
traces establish that the renderer retains stream ownership during this turn.
The counter diagnostic (`source-full-transport-counters.log`) established the
cause: a second renderer replaces the main renderer's subscription in the
main-process map keyed only by stream ID. Trace 1 receives one heartbeat and
an explicit close; trace 2 receives 517 frames, including reasoning, tokens and
stream_end. Read-only CDP inspection of both renderer targets confirms that the
main window completes via polling while the detached window receives stream_end
and completes via its event listener. Subscriptions and unsubscriptions must
therefore be scoped to the sending renderer, preserving concurrent subscribers
to one backend stream. The sender-scoped registry correction passes its focused
regressions. The ordinary-path rerun (`source-full-window-stream-final.log`,
main/backend transport diagnostics disabled) now passes 73/73 with one skip.
The original and detached renderers both receive owned stream_end and complete
via their event listeners. Real answer text is visible 3 ms after the first
answer delta, before completion; thinking text is visible during generation.
The final screenshot succeeds after bringing the original compositor forward.

The screenshot supplied during this run exposed dark message text on dark
bubbles: plain rich-text containers inherited a dark foreground while only
paragraph descendants had an explicit readable color. Chat surfaces now use
theme-specific foreground/background variables, including structured headings,
chips and cards. The later bubbles-layout user-background override also consumes
the theme token; the light user bubble is opaque pale blue. Four CSS regressions
pass. The built-renderer contrast smoke passes 21/21 across dark/light/OLED,
with a minimum measured contrast of 11.83:1 and xlarge text remaining 18px.
This uses a test-owned fixture matching production classes, not a generated
assistant transcript. The harness false negative (3/7) and pre-surface-fix
run (20/21) are retained separately. The real two-window model run also passes,
and its screenshot confirms readable user and assistant message text.

The expanded chat color matrix additionally checks default fenced code/header,
activity/tool details, usage metadata, tab citation pills, links and Copilot
surfaces. It passes 58/58 across dark, light, OLED and System resolving both
light and dark, each with bubbles, compact and expanded layouts. The minimum
measured contrast is 4.68:1; xlarge transcript text remains 18px. It exercises
real appearance settings in the built renderer, with a test-owned fixture
matching production classes. Failed harness attempts and the 52/58 code-header
contrast failure are retained. The latest final-code source gates pass 138/1,223,
Store 27/27, Main/Renderer build and compileall. The genuine transcript rerun
(`source-full-theme-colors-final.log`) confirms readable rendered messages,
answer and thinking visible before completion, owned stream_end in both windows,
and first answer DOM 8 ms after the first answer delta. The full run is 72/73
with one skip and one failed quad mouse-resize check: the left column ends at
33.33% instead of the expected 66.67%, while the right rows remain independent
at 50%. This failure is preserved for separate geometry/drag investigation;
the successful chat/font checks do not make the complete browser smoke green.

The focused
onboarding regression uses one persistent ASGI event loop and checks health
before releasing the deliberately blocked status helper. Its control case
demonstrates that the old inline synchronous shape blocks the same health
request. Both tests pass; the selected profile is observed in the worker.

Browser checks passed in those runs include exact local download bytes, live
Appearance persistence, Space creation/selection, the same unmuted audio WebView
guest across Spaces, snap/resize/detach/history and adding a third real tab to an
existing dual split (three distinct occupied panes, no empty pane).

Installation over the user's existing profile and live Alibaba use from the
packaged app remain unverified. No new version/tag/package is created by this
audit alone; published v0.1.43 and its checksums remain unchanged.

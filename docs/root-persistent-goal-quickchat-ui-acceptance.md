# Persistent Goal and Quickchat UI Handoff

## Verified in the controlled probe

The Source-App probe `persistent-goal-quickchat-ui` (run `e12cd0b8-df5e-4ab7-aa1a-185cb367830c`) restored and focused its owned Electron window before sending a trusted Enter event. The textarea had focus and the window was not minimized. `/goal resume` was consumed from the input but produced no Main IPC; the visible GoalControls Resume button then dispatched the expected revision-bound resume. The recorded page events show trusted keydown/keyup, `defaultPrevented` after keydown, and an empty textarea. This disproves the earlier minimized-window-only explanation.

The same run switched to the current modern Research UI and reached Main IPC `lastbrowser:quickchat:start`. Quickchat returned HTTP 500 because `services/sidekick/web/api/quickchat.py:173` passed `confirmed_space_profile_prompt` to `_start_chat_stream_for_session`, whose current signature did not accept it. FIX1 owns that backend mismatch. Summary completion and Quickchat Reset did not run; they remain unverified until the fixed source is probed again. The report is `output/e3-e9-ui-e12cd0b8-df5e-4ab7-aa1a-185cb367830c.json`; its overall `passed` value is false. The Electron child exited with code 0 after the harness captured the failed acceptance.

## Current UI change

`GoalControls` now renders an existing goal as a compact title/status/action row. Description, revision, budget, status reasons, refresh, edit, and clear live under an initially collapsed Details disclosure. A goal-free view still appears only when the explicit `/goal` editor view is requested. The existing revision, owner, pending, availability, and migration checks remain in place. The component is keyed by the current `modeViewKey` so disclosure and editor state do not carry across sessions or Space/profile changes. Details and Revision labels are supplied for all eight supported locales.

The `/goal resume` rejection stays fail-closed while a goal stream is still held by the UI. The busy-control allowlist was not expanded: Resume can start another native stream and must wait for the current owner to finish. When the Goal handler rejects a command under that lock, it now returns a rejection signal; `ChatComposer` keeps the command text and `NativeChatMain` displays the existing localized `command_in_progress` message. Re-entering after the active lock clears follows the regular context, revision, and Main IPC path. This avoids a second stream and avoids silently losing the command.

## Focused verification

Command:

```powershell
npm --workspace apps/desktop run test:run -- tests/chat-command-registry.test.ts tests/native-goal-panel-visibility.test.ts tests/persistent-goal-command.test.ts tests/chat-reasoning-effort.test.ts
```

Result: 4 test files passed, 36 tests passed. The first sandboxed invocation failed before Vitest startup with `spawn EPERM` in esbuild; the same bounded test command succeeded when run with the approved child-process execution permission. No full suite, application build, or packaging ran.

The focused tests now assert compact/collapsed goal rendering, explicit no-goal setup, disabled empty goal submission, and nonblank Details/Revision labels across all eight locales. Busy Resume remains excluded by `persistent-goal-command.test.ts`.

## Remaining evidence boundary

The localized command-retention behavior has focused source-level test coverage for adjacent Goal contracts but has not yet been replayed in the compiled Source-App probe. Quickchat Summary, Reset isolation, and late-result behavior after Reset/Space change also remain unverified in that real UI run. Rerun the existing controlled probe once FIX1's Quickchat signature fix is present in source; do not treat the HTTP 500 as a renderer Summary defect.

## Follow-up after FIX1 backend repair

The controlled source-app run `5516e4bd-b5c8-46b2-9541-f7f82e88111d` was executed after FIX1 reported the captured-profile/stream-recapture repair. Goal Start and Pause reached real Main IPC; a trusted, focused Enter on `/goal resume` was prevented by the renderer but the input became empty and no Main goal IPC was recorded (`goalSlashResume.mainIpcDispatched=false`, `dispatchCount=0`). The separate GoalControls Resume button did reach Main IPC and advanced the revision. This isolates the command-loss path to the synchronous renderer/App callback contract, not to the trusted keyboard event or Goal backend.

The source confirmed the gap: `NativeChatMain.handleCommandAction` returned `true` immediately after forwarding to `App.handleNativeCommandAction`, while the App handler can subsequently reject Resume under its `sidekickBusy || starting || streaming` gate and return `void`. `ChatComposer` therefore cleared the text before learning about the rejection. The renderer now pre-gates Goal commands using the existing safe-while-busy policy. While `busy || running`, Resume/start reports localized `command_in_progress` and returns `false` synchronously so the composer retains `/goal resume`; existing status/pause/clear/stop/done controls remain allowed. No Resume busy allowance or concurrency guard was weakened. A focused pure-policy regression covers the sync acceptance boundary; it is not a substitute for replaying the real compiled UI once the final batch is frozen.

The same run did not actually exercise Quickchat Summary or Reset. The app was German (`browser.actions.summarize` resolves to `Zusammenfassen`), but the probe searched the modern Research flyout only for the English word `summarize` and used optional chaining, so a missing match silently clicked nothing. Evidence: `quickchatIpc=[]`, no `quickchat_summary` in providerKinds, and timeout at “actual page summary appeared in Quickchat”; it is not evidence of a Quickchat product failure. The owned probe now matches the flyout action's accessible label to the visible localized summarize trigger and fails immediately if the action is absent. This harness correction was syntax-checked but deliberately not followed by another broad source-app run before freeze. Summary, Quickchat Reset isolation, stale late-result suppression after Reset/Space change, and post-fix `/goal resume` UI remain unverified in the actual source-app flow.

Focused verification after the renderer gate change:

```powershell
npm --workspace apps/desktop run test:run -- tests/persistent-goal-command.test.ts tests/goal-resume-slash-command.test.ts tests/chat-command-registry.test.ts
node --check apps/desktop/tests/persistent-goal-quickchat-ui-probe.cjs
```

Result: 3 test files / 28 tests passed; probe syntax check passed. The first Vitest invocation was blocked before startup by sandbox `spawn EPERM`; the same bounded command then passed with child-process permission. No source-app rerun, full suite, build, or package was performed.

# FIX AGENT 1 – Main Local-AI hardware scan

## Main/IPC contract

The trusted renderer calls `window.lastbrowser.independent.request` with
`operation: 'localAi'`, the resolved Space scope, and `{ action: 'scan' }`.
`preload.ts` forwards this to `lastbrowser:independent:request`; Main validates
the shell sender and resolves the saved profile binding before dispatching to
`LocalAiController`. Main derives the cache under that app's `userData/local-ai/cache`
directory and derives all hardware facts itself. Renderer-supplied hardware,
cache paths, executable paths, and scan identities are rejected.

The scan reads CPU/memory, asks Electron for basic GPU display metadata, and
reads free disk space. GPU metadata and GPU feature status are not proof that a
model can run on an adapter; dedicated memory and inference budgets remain
unknown. Main binds the immutable scan to the current Space through the local
Sidekick API, reads it back, and rechecks the trusted sender and scope between
asynchronous steps.

## Timeout and cleanup behavior

The individual Electron GPU and filesystem probes have a three-second bound.
The complete Main hardware request now has a 15-second deadline, reports the
stable `local_ai_hardware_timeout` code, clears its deadline timer on success or
failure, and rechecks its deadline after each awaited step. If a probe resolves
after the deadline, Main discards it before starting a hardware-bind/read step.
This scan path starts no helper process and does not download models, install
drivers, or change Windows/GPU settings.

## Handoff to FIX2

Keep the existing renderer request shape and the resolved Space scope. Surface
`local_ai_hardware_timeout` as a recoverable timeout with a clear retry action;
always release the busy state and avoid applying results after Space changes.
Do not infer GPU inference support from Electron display metadata. The IPC/Main
contract requires no renderer payload additions.

## Verification

- `npm --workspace apps/desktop run test:run -- tests/local-ai-hardware.test.ts tests/independent-controller.test.ts`
  — 2 files, 64 tests passed. Coverage includes a held Main probe timing out,
  timer cleanup, and rejection of its late result.
- `npx tsc -p apps/desktop/tsconfig.main.json --noEmit` — passed.
- No live 5950X/Intel Arc hardware scan was run in this task. User APPDATA,
  accounts, GPU settings, and Windows features were not touched.

## Native-chat persistent-goal panel handoff

The normal chat must not mount `GoalControls` when the active session has no
persisted, non-cleared goal and the user has not explicitly opened `/goal`.
The empty editor request is keyed to `modeViewKey` so a goal or editor request
from Chat A cannot open controls in Chat B. Switching chats clears the transient
empty-editor request. Reload starts with no transient request; a real persisted
goal is rehydrated from the current session/status and remains visible with its
existing controls. Cleared goals stay hidden. This visibility gate does not
create, start, pause, resume, or clear a goal; those actions still require the
existing explicit control/editor action and retain the current CAS/retry flow.

Targeted renderer coverage: `apps/desktop/tests/native-goal-panel-visibility.test.ts`
checks no-goal, `/goal`, persisted/reloaded, cleared, and cross-chat visibility.

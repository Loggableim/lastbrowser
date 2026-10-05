# FIX AGENT 4 — Integration acceptance notes

Date: 2026-10-05. Read-only evidence except for the narrow Goal stream receipt
fix in `apps/desktop/src/main/main.ts` and the probe assertions in
`scripts/probe-full-app-entry.cjs`. No commit or packaging was performed.

## Persistent Goal: passed on current source

`node scripts/probe-full-app-entry.cjs --goal` passed with a fresh source build,
actual Electron Main/Renderer and bundled Sidekick in an isolated temporary
profile. Report: `output/full-app-entry-b5d7a86d-20ac-4e5d-9758-f54792ff5257.json`.

- Goal creation opened native stream `7b76ab7a48e2466480ad19dceb95ce27`; the
  controlled loopback provider count rose from 1 to 3. Same-request replay did
  not create a second stream.
- Pause, resume stream `f99c4e2c9cfd457e827825345109d92f`, and second controlled
  provider execution passed. Goal was paused again, then remained paused at
  revision 7 after two Shell reloads, with the same Main-bound Space/profile
  scope.
- Sidecar cleanup passed; no dialogs or hardware helpers; guest authority was
  rejected. This proves the controlled local provider path, not model quality,
  external accounts, packaging, or release readiness.

The probe exposed a real IPC integration defect: the Goal endpoint could start
a backend stream but did not register the Main-owned read receipt, so
`subscribeChatStream` rejected the returned stream. The handler now captures
the bound native request and accepts the returned stream through
`NativeChatStreamController.captureStart` at `main.ts:668`.

Verification: `npm --workspace apps/desktop exec -- tsc --noEmit -p
tsconfig.main.json` passed; `npm --workspace apps/desktop run test:run --
tests/native-chat-stream-controller.test.ts tests/persistent-goal-command.test.ts`
passed (32 tests after the cancellation hardening below).

## Stream cancel authorization

Root's read-only security review found that `cancelStream` previously ignored
the IPC sender and used only the stream ID to select a profile. Main now routes
it through `NativeChatStreamController.cancel`: it validates the trusted
shell/frame, accepted per-shell stream receipt, captured profile/binding, and
rechecks document/receipt ownership after transport. Generic cancellation of
native streams is rejected; they continue using scoped native chat controls.
The regression cases cover foreign shell, subframe, unknown/malformed ID,
destroyed sender, old-profile receipt selection, native-stream rejection, and
navigation during cancel. The controller/Goal tests pass 32/32 and Main
TypeScript check passes. No backend API/profile selection or Goal pause path
was relaxed.

## Backend profile and browser checks

- Focused profile/scope/browser group passed: 65 tests.
- Additional browser/host/permission/QA-contract group: 51 passed, 1 failed
  when run from `services/sidekick`.
- The lone failure was
  `tests/test_native_root_browser_transport.py::test_registered_native_fence_uses_actual_context_owner_and_cleans_registry`.
  Diagnosis: the test's `RunManager` uses the host `sys.executable` (Python
  3.14); its isolated `-I` worker then cannot import `pydantic`, which exists
  only in the host user's site-packages. Child stderr showed
  `ModuleNotFoundError: No module named 'pydantic'`, exit code 1, while
  `model_catalog` was being probed. Re-running just that test with
  `WorkerHost` pointed at the existing bundled Python 3.12 passed (1/1). This
  is test interpreter selection, not evidence of a NativeBrowserFence product
  defect; no product fix was made.

## Scheduler and remaining scope

The system Python initially lacked `croniter`. The scheduler test was then run
without installing anything by putting the existing `croniter`,
`python-dateutil`, and `six` wheel archives directly on `PYTHONPATH`.
`tests/test_independent_scheduling.py`: 8 passed, 1 failed at
`test_queued_schedule_materializes_real_session_before_any_inference` because
the resulting run state was `failed` instead of `queued`. Root's scheduler
subagent now owns scheduler investigation; this agent will not duplicate it.

## Assistant and Quickchat integration

Renderer group passed (56 tests): Quickchat controller, Assistant renderer,
native chat controls, scoped session creation, and session-list scope.
Backend group passed (62 tests) with the existing bundled Python runtime
selected for the test's isolated WorkerHost and NativeFileIOFence children:
assistant, assistant controls/reset, Quickchat, and native AUTO/evidence tests.
The unmodified host-Python run had one failure because its isolated
NativeFileIOFence child used system Python 3.14 and did not inherit user-site
`pydantic`; selecting the in-tree bundled Python 3.12 for that test-only run
made the same test pass. No runtime code change was made for this environment
mismatch.

Security and scheduler test follow-up is delegated by root. Continue only with
Goal/profile/browser/assistant/Quickchat integration cases; do not overlap
their suites or FIX1/FIX3 active source.

## Browser write-approval identity binding (A17)

Implemented the focused A17 fix in the independent-run backend: approvals and
action claims carry and compare lease ID, target ID, Main generation, runner
generation, navigation epoch, scope, action digest, and permission identity.
The live gateway snapshot is rechecked at approval, action claim, and directly
before dispatch. Browser lease identity is durable in the resource lease; its
navigation epoch can only advance, while target/Main/runner identity cannot
change. Stale identity revokes the approval and fails closed.

Regression coverage in `tests/test_root_security_approval_binding.py` covers
mutation of lease ID, target ID, Main generation, and runner generation, plus
an unchanged-target write that is still dispatched and consumes its approval.
Focused result: 6 passed. Approval/action/migration/governance regression group:
10 passed. Existing browser-capability and host-integration group: 6 passed;
`python -m compileall -q runtime/independent` passed.

Broader `tests/test_independent_runs.py` + `tests/test_independent_migrations.py`
run: 47 passed, 5 failed. Four unrelated scope-retirement cases cannot import
the absent `croniter` dependency in this environment (not installed, per task
constraints); the queue-admission assertion also failed in the combined run,
then passed when rerun alone (1/1), indicating a test timing/interference
failure rather than a reproducible A17 regression. No scheduler changes or
dependency installation were made.

## Fresh Assistant/Quickchat runtime integration probe (2026-10-05)

Updated the owned `scripts/probe-full-app-entry.cjs` harness to validate the
current scoped contract instead of the removed `.space-assistant-model` label:
resolve the actual Space scope, read `modelSelection`, then require an
`assistantSnapshot` with the same scope/provider/model and `providerReady`.
The Assistant send now uses an actual composer-button click (the Electron
probe's `requestSubmit()` path submitted no React turn and made zero provider
calls).

`node scripts/probe-full-app-entry.cjs --delegation` passed on a fresh source
build using isolated user data and the loopback-only controlled provider.
Report: `output/full-app-entry-e0bd0826-16ab-407a-8584-94ca1793eac3.json`.
The scoped selection and Assistant snapshot matched; a real Assistant reply
completed; an independent delegated run started while a second Assistant turn
completed; after reload, the delegated result was saved in its original
profile/Space-bound chat, the backlink opened that chat, and it appeared once
in the normal session list. Five controlled provider calls, three shell
reloads, no native dialogs, no denied external requests, guest authority
rejected, and owned children cleaned up. This was a source App run, not a
packaged or model-quality claim.

`node scripts/probe-backend-profile-ui.cjs --backend-profile-switch` now passes
from a fresh source build (latest report
`output/backend-profile-ui-b0bad247-ccd1-4a8a-9a1d-caf75ed04c30.json`). UI-created
Alpha and Beta Spaces each resolve to their requested backend profile and
distinct backendProfileId/spaceId/browser partition. Alpha's controlled
provider response remained held while Beta's completed; Beta's reply appeared
only in Beta, then Alpha resumed and its reply appeared only in Alpha. Exactly
one real loopback provider call per profile carried the corresponding marker
and selected fixture model. Both request prompts required structured
`AssistantReply` output, and each fixture returned the corresponding JSON
message. One shell reload occurred; no native dialogs,
external proxy requests, or surviving owned child processes; temporary test
data was cleaned up. This validates the controlled source-app UI path, not a
packaged executable or real provider/model quality.

The first correctly bound run still failed at Beta with the generic Assistant
error because its profile fixture returned plain text, while production
`AssistantReply` requires structured JSON (`{"message": ...}`). The test
fixture was corrected without relaxing product validation. A 10-second
beta-dispatch/timeout diagnostic gate was added; on timeout it records
assistant snapshot/activity/model selection/profile binding/session state and
fixture calls. Both latest requests record `structuredSchemaRequested: true`.
`expectedSchemaParsed` is diagnostic only and false because the regex looks
for the schema in the system prompt, but the actual backend appends it to a
separate user instruction. The returned JSON shape matches the existing
`AssistantReply` contract.

Quickchat↔Space Assistant now has direct accessible header actions in both
directions, connected only to the existing `quickChatMode` branch toggle.
Quickchat's transient messages and the scope-keyed Assistant controller/store
are not reset or replaced, and no chat/session is created by the switch.
Renderer typecheck passed; focused UI/i18n tests passed (4 files, 32 tests).
The contract test confirms no session creation/reset is wired to the mode
callbacks. The fresh hidden-Electron mount probe
`node apps/desktop/tests/assistant-mode-switch-visual-smoke.cjs` passed: five
real header switches retained Quickchat's message and busy/stop UI, created no
new chat, and a controlled pending Assistant turn resolved after switching
away and back. Stable final bounds passed in DE at 390px and 320px and JA at
320px; at JA/320 the Quickchat panel and header ended at x=320 and the close
button at x=308. The probe explicitly finishes the entrance animation before
measuring. This is controlled renderer evidence, not a live provider stream or
packaged-app check. The initial 20px overrun was the animation's first frame;
the corrected assertion compares against the actual panel bounds.

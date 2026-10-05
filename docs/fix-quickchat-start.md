# Quickchat start failure on Windows

## Root cause

The signed 0.1.45 package created the scoped Quickchat session, but failed before any provider request. The Quickchat route passed the result of `resolve_trusted_workspace()` directly to the shared chat-stream startup path. On Windows that result is a `pathlib.WindowsPath`. Stream setup persists the workspace on the session, whose metadata is JSON encoded; serializing the path raised `TypeError`. Normal chat already converts the resolved workspace to `str` before calling that shared path.

After that serialization issue was fixed, the 0.1.46 preview reached the native-stream guard and failed with `Native streaming requires its accepted worker binding`. Quickchat created a Space-scoped session and called the shared stream starter, but explicitly skipped the normal native writer reservation, accepted-context capture, and worker registration. The stream then failed closed in `_resolve_native_stream_space()` because there was no accepted worker context. The guard was correct and remains unchanged.

## Fix

`services/sidekick/web/api/quickchat.py` now converts the trusted workspace to `str` before calling the shared stream startup path. This matches the normal-chat contract and keeps filesystem resolution in Main/backend.

`services/sidekick/tests/test_quickchat.py` adds a regression that makes workspace resolution return a `Path` and verifies successful dispatch receives a string.

## Evidence and verification

- Controlled loopback reproduction against the signed 0.1.45 app failed with `Quickchat request failed`, made zero provider requests, and captured the `TypeError` at session JSON persistence (`Session.save`). No external provider was used.
- `python -m pytest services/sidekick/tests/test_quickchat.py services/sidekick/tests/test_independent_chat_binding.py -q`: **21 passed** on the current source, including a regression proving a scoped Quickchat without accepted worker context is still rejected.
- Quickchat plus native worker control/process regression set: **55 passed**.
- `npm --workspace apps/desktop run test:run -- tests/quick-chat-controller.test.ts tests/root-assistant-quickchat-contract.test.ts`: **8 passed**; Main TypeScript check (`tsc --noEmit -p tsconfig.main.json`) passed.
- No desktop or package build was run. The signed preview predates this source fix, so a post-fix packaged runtime has not yet been verified.

## Scope

The first source fix addressed the Windows `Path` serialization failure. A follow-up signed 0.1.46 preview exposed a second defect after serialization was fixed: the stream thread reached `_resolve_native_stream_space()` without an accepted native worker context. This occurred because Quickchat bypassed the normal writer reservation and native worker registration while still carrying a scoped session.

The follow-up fix routes scoped Quickchat through the ordinary accepted Native Chat worker lifecycle: reserve the exact session writer, capture/register the context, and pass the normal execution policy to the worker. Quickchat forces the `action` policy regardless of any stale Plan/Boost value on its private transcript, and the streaming path continues to force an empty toolset. It rejects Teamwork/Smart Track models. Reset/stop use the exact accepted native worker context; reset waits for process exit and writer-lease release before deleting the private session. If the binding or exit cannot be verified, reset fails closed and leaves the session intact. A failed start no longer deletes an existing Quickchat transcript.

Added regressions cover native writer/context registration, the Quickchat policy override, failure preservation, exact worker cancellation, reset exit/lease waits, and missing-worker fail-closed behavior. No provider credentials, user account data, or persistent test profile were modified. No commit or build was created.

## Handoff and freeze

Product source freeze is confirmed for this handoff. This review was read-only; only this document was updated. The source evidence recorded above is from the previous focused verification run, not a new run during this review:

- Quickchat and independent binding tests: **21 passed**.
- Quickchat plus Native Worker control/process tests: **55 passed**.
- Desktop Quickchat contract tests: **8 passed**; Main TypeScript no-emit check passed.

Before release, a coordinated post-freeze package acceptance still needs to:

1. Build and run the candidate package from the frozen source, then exercise Quickchat against a controlled loopback provider and verify the provider request, streamed answer, and accepted native worker exit.
2. Exercise stop/reset both during an in-flight response and after completion; verify reset waits for worker exit and lease release, removes only the private Quickchat transcript, and late stream events do not reach the renderer.
3. Verify Quickchat remains absent from ordinary session lists and has no tool or orchestration authority when the profile/Space has saved Plan or Boost defaults.

No live provider or external account is needed for these acceptance checks.

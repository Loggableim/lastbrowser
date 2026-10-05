# Quickchat start failure on Windows

## Root cause

The signed 0.1.45 package created the scoped Quickchat session, but failed before any provider request. The Quickchat route passed the result of `resolve_trusted_workspace()` directly to the shared chat-stream startup path. On Windows that result is a `pathlib.WindowsPath`. Stream setup persists the workspace on the session, whose metadata is JSON encoded; serializing the path raised `TypeError`. The generic API handler then returned `Quickchat request failed`, and rollback encountered the same persistence problem. Normal chat already converts the resolved workspace to `str` before calling that shared path.

## Fix

`services/sidekick/web/api/quickchat.py` now converts the trusted workspace to `str` before calling the shared stream startup path. This matches the normal-chat contract and keeps filesystem resolution in Main/backend.

`services/sidekick/tests/test_quickchat.py` adds a regression that makes workspace resolution return a `Path` and verifies successful dispatch receives a string.

## Evidence and verification

- Controlled loopback reproduction against the signed 0.1.45 app failed with `Quickchat request failed`, made zero provider requests, and captured the `TypeError` at session JSON persistence (`Session.save`). No external provider was used.
- `python -m pytest services/sidekick/tests/test_quickchat.py -q`: **6 passed**.
- `npm --workspace apps/desktop run test:run -- tests/quick-chat-controller.test.ts tests/root-assistant-quickchat-contract.test.ts`: **8 passed**. These cover dispatch scope, event filtering, cancellation/reset, and late-result handling.
- No full desktop build or package build was run. The signed package predates this source fix, so a post-fix packaged runtime has not yet been verified.

## Scope

Only the backend Quickchat route and its focused regression test were changed for this fix. No provider credentials, user account data, or persistent test profile were modified. No commit was created.

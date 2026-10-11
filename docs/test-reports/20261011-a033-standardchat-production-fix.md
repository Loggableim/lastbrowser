# A-033 Standardchat production fix — 2026-10-11

## Scope and provenance

This is a source-only follow-on to PR #51, based on `7d3d52bb58114296b66b7eeef290b67581b226bc` (`release/v0.1.52`). It addresses Standardchat only. Quickchat changes are deferred. PR #51 and other worktrees were not modified.

Coordination: [A-033 Slack thread](https://lastbrowser.slack.com/archives/C0C81VB6AEP/p1791717950664999?thread_ts=1791717950.664999&cid=C0C81VB6AEP). The thread's VM report records the backend-profile hint regression at 1/5 before and 5/5 after omission of the empty hint. It also records successful MiMo first and follow-up responses, Markdown rendering and a stop acknowledgement. The apparent Codex answer was withdrawn because the session remained Xiaomi/MiMo; Codex routing is not verified. Ollama Cloud returned HTTP 403 because the subscription was past due; no retry or billing action was taken.

## Changes

- Standardchat omits `backendProfileName` only when the optional hint is blank. Captured scope checks and Main's binding validation remain in place.
- The isolated model-catalog worker always includes account-configuration evidence. Optional capability inventory remains conditional.
- Scoped model rows resolve missing context from provider-exact models.dev metadata. Codex context is read only from the exact Codex OAuth catalog resolved through the current profile-bound Sidekick provider path, before the shared model-cache builder runs. Unknown model pairs remain without a context limit; no host `HOME`, external Codex credential or public OpenAI context fallback is used.
- Standardchat selection already commits local state only after the backend returns `result.ok`. Its stop flow keeps stream ownership until the worker process exits. Neither path needed a source change; the reported stale “Working on it…” bubble was Quickchat-only and remains deferred.

## Verification

| Check | Result |
| --- | --- |
| Guarded Standardchat send regression | 5/5 passed; the new empty-hint assertion failed on the base source and passed after the fix |
| Scoped model and Codex catalog tests | 31 passed; 1 packaged-worker test excluded from this focused run |
| Packaged-worker test | Environment-blocked: the fallback system Python is launched isolated without the `pydantic` dependency (`ModuleNotFoundError`). This does not establish packaged-worker acceptance. |
| `npm test` | 220 files, 1,995 tests passed |
| `npm run verify:store` | 39 passed, 0 failed, 2 warnings: provisional Store screenshots and no final package supplied |
| Desktop build | Passed; TypeScript and Vite completed. Vite emitted the existing large-chunk advisory. |
| `python -m compileall -q services/sidekick` | Passed |
| `git diff --check` | Passed |

These are local source and test results. No new VM session, account routing, provider inference, package installation, signature, Store or production acceptance is claimed by this change.

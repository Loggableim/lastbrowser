# A-033 Standardchat production fix — 2026-10-11

## Scope and provenance

This is a source-only follow-on to PR #51, based on `7d3d52bb58114296b66b7eeef290b67581b226bc` (`release/v0.1.52`). It addresses Standardchat only. Quickchat changes are deferred. PR #51 and other worktrees were not modified.

Coordination: [A-033 Slack thread](https://lastbrowser.slack.com/archives/C0C81VB6AEP/p1791717950664999?thread_ts=1791717950.664999&cid=C0C81VB6AEP). The initial VM report records the backend-profile hint regression at 1/5 before and 5/5 after omission of the empty hint. The newest follow-up `ffe82dda9426` corrects the earlier Codex claim: the saved test session is actually `openai-codex` / `gpt-6-luna`, with `LUNA READY` saved. Codex inference is verified, but Standardchat E2E still FAILS because the UI receives a start timeout. The MiMo follow-up also times out in the UI while its backend answer `teal` appears after reload. The reported route took 21.360 seconds against the bridge's 20-second header wait, including 12.328 seconds waiting for the session lock. Ollama Cloud GPT-OSS 20B returned HTTP 403, separately from the earlier Deepseek denial. Standardchat Stop has not been tested. No new VM run against PR #56 has occurred.

## Changes

- Standardchat omits `backendProfileName` only when the optional hint is blank. Captured scope checks and Main's binding validation remain in place.
- The isolated model-catalog worker always includes account-configuration evidence. Optional capability inventory remains conditional.
- Scoped model rows resolve missing context from provider-exact models.dev metadata. Codex discovery uses the same current profile-bound credential-pool resolver as inference, and its context comes only from the exact OAuth catalog. Fixed-provider capture now reuses its capability-inclusive model snapshot while preserving scope and evidence-digest revalidation. Unknown model pairs remain without a context limit; no host credentials or public OpenAI context fallback is used.
- Standardchat selection already commits local state only after the backend returns `result.ok`. The source stop flow keeps stream ownership until process exit, but Standardchat Stop has not been live-tested. The reported stale “Working on it…” bubble was Quickchat-only and remains deferred.

The VM follow-up's measured start-timeout and error-disappearance failures remain open; shared-catalog reuse is not represented as a fix for them. No timeout was extended, and no fix was inferred for Standardchat Stop from Quickchat evidence. The Quickchat lock and shared placeholder changes from the experimental patch were not included.

## Verification

| Check | Result |
| --- | --- |
| Guarded Standardchat send regression | 5/5 passed; the new empty-hint assertion failed on the base source and passed after the fix |
| Scoped model and Codex catalog tests | 33 passed; 1 packaged-worker test excluded from this focused run |
| Fixed-provider capture regression | Passed; exactly one capability-inclusive catalog probe was used |
| Packaged-worker tests | Environment-blocked: the fallback system Python is launched isolated without `pydantic` (`python -I -c "import pydantic"` returns `ModuleNotFoundError`). Worker acceptance is not established. |
| `npm test` | 220 files, 1,995 tests passed |
| `npm run verify:store` | 39 passed, 0 failed, 2 warnings: provisional Store screenshots and no final package supplied |
| Desktop build | Passed; TypeScript and Vite completed. Vite emitted the existing large-chunk advisory. |
| `python -m compileall -q services/sidekick` | Passed |
| `git diff --check` | Passed |

These local checks do not establish E2E acceptance. The VM results above are from the tester's separate source candidate, not PR #56's current commit. PR #56 remains open for independent review and combined gates; no candidate, merge, package, signature or release acceptance is claimed.

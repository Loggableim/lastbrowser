# P003: active models rejected by Quick Chat

Date: 2026-10-11
Base: `release/v0.1.52` at `7d3d52bb58114296b66b7eeef290b67581b226bc`
Branch: `codex/p003-active-models-send-20261011`

## Finding and change

The Settings and Copilot model catalogs come from different reads. Quick Chat re-reads the Space-scoped `modelSelection` through `assistantController.resolveScope`, but that call omitted the captured backend profile. The controller can resolve a different profile binding while `chooseActiveModel` checks opt-outs under the captured profile. The resulting candidate list can be empty and produce the misleading “No models are active” message before Quick Chat IPC starts.

The renderer now passes the captured backend profile through scope resolution. Quick Chat reports whether its start was accepted; the composer clears the submitted draft only on acceptance, so model-gate and start failures preserve the text. No backend or provider credentials changed, and no provider request was made.

The regression uses the P003 catalog pairs `ollama-cloud/deepseek-v4.1-flash`, `openai-codex/gpt-6-luna`, and `xiaomi/mimo-v2.6-flash` as active in a non-default backend profile. It checks the active choice and the sender/composer wiring. Focused regressions pass after the change. The baseline source lacks the new captured-profile argument and acceptance handling; a temporary baseline swap was attempted but the shell rejected the operation before it ran, so no red-before execution is claimed.

## Verification

- **PASS** `npm --workspace apps/desktop test -- --run tests/a027-model-selection.test.ts` — 8 tests.
- **PASS** Focused source-contract suite: `provider-model-selection.test.ts`, `browser-layout.test.ts`, and `a027-model-selection.test.ts` — 53 tests.
- **PASS** `npm --workspace apps/desktop run build` — TypeScript and Vite production build completed. Vite reported the existing large-chunk advisory.
- **PASS** `npm run verify:store` — 39 pass, 2 warnings, 0 failures; warnings cover provisional screenshot content and absent final package signature evidence.
- **PASS** `python -m compileall -q services/sidekick` — exit code 0.
- **PARTIAL** `npm test` — 1,976 passed, 19 skipped; two Electron UI suites could not start because `node_modules/electron/dist/electron.exe` is missing (`ENOENT`). The test dependency was not installed or repaired during this task.
- **NOT RUN** packaged app / VM provider-response test. This change has source and test evidence only; the VM tester must repeat the reported send cases against a freshly packaged build.

## Scope

Renderer and regression tests only. No version, release metadata, backend, credentials, signing, publication, installation, or user data changed.

## Gate follow-up (2026-10-11)

- The missing Electron runtime was recovered from the local v0.1.54 integration worktree. Its package metadata is `37.10.3+wvcus`, and `electron.exe` SHA-256 matches the requested `096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1`. The full 76-file `node_modules/electron/dist` tree was copied into ignored dependencies and hash-compared to the donor. No package manifest, lockfile, or tracked dependency was changed.
- After restoration, both previously blocked UI suites passed: 23/23 tests.
- Full `npm test` then passed: 220 suites, 1,995 tests passed, 0 skipped.
- Red-before was run in a separate detached worktree at the exact base SHA, with only the new `a027-model-selection.test.ts` patch and a junction to the PR worktree's ignored dependencies. Result: 1 failed, 7 passed; the new P003 test failed on missing captured-profile/composer behavior. The PR worktree's focused suite passes after the fix.
- Cleanup of that temporary baseline worktree was rejected by the local shell policy. It remains at `C:\Users\logga\.codex\worktrees\p003-active-models-send-baseline-20261011\lastbrowser` with only the regression-test patch and an ignored `node_modules` junction to the PR worktree. The active PR worktree remains unchanged by the baseline test.

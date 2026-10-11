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

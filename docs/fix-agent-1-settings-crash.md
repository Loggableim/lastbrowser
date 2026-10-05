# Settings → Plugins: bounded diagnosis

## Finding

The reported message is `Cannot convert undefined or null to object`. I traced the current Settings → Plugins render path and the extension IPC contract, but could not attribute that exact exception to a callsite from source alone. In particular, `Object.entries(SETTINGS_SECTIONS)` receives a module constant; plugin inventory normalization uses the guarded `arrayFrom`; and the other direct `Object.entries` calls in `SystemPanels.tsx` are outside this section or guarded.

The independently verifiable boundary weakness was in `ExtensionsSettingsSection`: it trusted both extension IPC list results and immediately rendered them with `.map()`. The main-process manager currently promises arrays (`ExtensionManager.list()` returns `Array.from(records.values())`; `getPresets()` returns `EXTENSION_PRESETS`), but a missing/null/malformed bridge response could otherwise turn the panel into a misleading empty state or a render-time exception. The component now normalizes absent/null lists to empty arrays, filters malformed entries, and shows a local retryable error for malformed non-array responses or a missing extension bridge. This does not persist settings or enable plugins.

## Scope and verification

- Added `extension-settings-state.ts` as the renderer IPC boundary used by `ExtensionsSettingsSection`.
- Added focused fixtures for `undefined`, `null`, valid lists with malformed members, and malformed non-array responses.
- Focused Vitest: `tests/extension-settings-state.test.ts` — 4 tests passed.
- A first sandboxed test invocation was blocked by `spawn EPERM`; the same read-only focused test passed when rerun outside the sandbox.
- A controlled Electron DOM mount was added in `apps/desktop/tests/settings-plugins-renderer-smoke.cjs`. It mounts the actual `NativeSettingsMain` with the Plugins section active, a fresh temporary Electron `userData`, and deterministic bridge/API fixtures for null, valid, and malformed plugin responses. All three cases passed; the React ErrorBoundary captured no component error, and the target TypeError did not appear in renderer console errors. No live app or user profile was opened.
- The original user-reported `Object` TypeError is therefore not reproduced or source-attributed in this checkout. The IPC hardening remains a separate, tested robustness improvement; it is not claimed as the fix for that report. The harness captures `componentDidCatch` error and component stacks if a future reproduction occurs.
- No production build, full suite, commit, push, or preview/package run was performed. The focused Vitest and isolated Electron harness were the only executed checks.

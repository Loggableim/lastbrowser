# Local AI hardware inventory scan

## Confirmed cause

The supplied preview shows `Nicht verfügbar` and a disabled `Hardware prüfen` button. In `LocalAiSetupPane`, that text is rendered directly from `!ready`. The current `load()` exits before `resolveScope()` when `ready` is false, so `scope` remains null. `scanHardware()` then exits on either `!ready` or missing `scope`, and the button is disabled by those same conditions. The preview therefore never reached Main's existing hardware probe. This was a renderer readiness/scope gate, not a failed GPU or inference probe.

## Main-side change

Added the typed `localAiHardwareInventory` Independent operation. It is shell-only and accepts an empty payload with no scope or backend profile. Main captures and rechecks the trusted shell frame, reads only the canonical application `userData` directory for a read-only volume measurement, and invokes the existing Electron hardware probe directly. It does not wait for the Sidekick/backend binding, create the model cache, call any API, start an inference runtime, download files, or alter system configuration. Its deadline is 15 seconds; timeout/navigation guards suppress late results.

The scope-free response is `{ schemaVersion, hardware, gpuFeatureStatus, probeIssues }`. It contains no Space scope and cannot be used as recommendation authority. Recommendations and setup still use the existing Space-bound scan → backend bind/read flow.

GPU memory topology is now explicitly unknown (`sharedSystemMemory: null`, `memoryPoolId: unknown-memory-topology`) when Electron's basic adapter info cannot establish it. Dedicated memory, process budget, process usage, and budget owner stay null; absent inference-memory proof does not invalidate the CPU/RAM/GPU inventory. The Sidekick contract now accepts nullable topology and still preserves unknown budget measurements.

## Verification

- Focused renderer/Main tests: `tests/local-ai-hardware.test.ts`, `tests/independent-controller.test.ts`, `tests/local-ai-renderer.test.ts` — 82 passed.
- Sidekick contract/broker tests: `python -m pytest -p no:cacheprovider -q services/sidekick/tests/test_local_ai_broker.py` — 14 passed.
- Main and renderer TypeScript no-emit checks passed.
- Read-only Electron hardware probe via `tests/local-ai-hardware-device-smoke.cjs` passed with a fresh temporary `userData` path. Observed on 2026-10-05: Windows x64, AMD Ryzen 9 5950X, 32 logical cores, 34,274,308,096 bytes total RAM, 4,349,095,936 bytes available RAM, Intel Arc A770 detected. Electron did not provide GPU dedicated/process budget values; they remain unknown. Probe issues: none. The Microsoft Basic Render Driver was also listed as an adapter. The scan started no inference runtime or helper and its temporary directory was removed.

## Renderer integration

FIX2 wired the hardware button to `client.request({ schemaVersion: 1, operation: 'localAiHardwareInventory', payload: {} })` before Sidekick readiness or scope resolution. Recommendation/setup controls remain behind their existing service/scope readiness. The controlled Electron DOM smoke `tests/local-ai-setup-click-smoke.cjs` passed with `ready=false`: initial inventory rendered, the bridge request had no scope, a controlled transient error showed a retry action, and retry rendered the decoded inventory. No full test suite or local preview/package was run by this scan task; FIX4 separately produced the shared unsigned preview.

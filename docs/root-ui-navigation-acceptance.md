# First-run, Settings, and right-panel navigation acceptance

Status: **partial; component interaction verified, application navigation and restart persistence not runtime-verified**.

## Evidence collected

- The existing `local-ai-setup-click-smoke.cjs` was run through the new bounded entry point, `node apps/desktop/tests/root-ui-navigation-smoke.cjs`. In hidden Electron, the real `LocalAiSetupPane` component rendered deterministic CPU/RAM/disk/GPU values while service readiness was false. Unknown GPU budget remained explicitly unknown. Clicking the hardware scan, observing its controlled transient failure, and clicking the retry button updated the mounted DOM successfully. The controlled bridge made no model/download/provider calls.
- `FirstRunSetupPane` mounts `LocalAiSetupPane` with the active browser profile and workspace at `apps/desktop/src/renderer/components/FirstRunSetupPane.tsx:652`.
- `NativeSettingsMain` mounts the same component in the `providers` section at `apps/desktop/src/renderer/panels/SystemPanels.tsx:3914`. The app passes a provider-settings callback from the Space Assistant in `apps/desktop/src/renderer/App.tsx:4695`; it selects the `providers` context and opens the Settings panel. This establishes source-level reachability, but the current fixture does not click through that app-shell callback.
- Local-AI Simple/Advanced display preference is stored in `localStorage` under a key derived from the resolved assistant scope in `apps/desktop/src/renderer/components/local-ai-setup-preference.ts`. `LocalAiSetupPane` reads it after scope resolution and writes it when mode changes. The existing `local-ai-renderer.test.ts` checks separate per-Space values using a storage double; that is not a mounted remount/restart test.
- Quickchat and Space Assistant are separate right-panel render branches in `apps/desktop/src/renderer/App.tsx:4661–4695`. Their headers expose accessible direct switches in both directions, wired only to the existing `quickChatMode` branch state. The hidden-Electron probe `node apps/desktop/tests/assistant-mode-switch-visual-smoke.cjs` mounted both real components and passed five header switches, preserved the Quickchat message and busy/stop affordance without creating a new chat, and held a controlled Assistant turn pending through the mode changes until it was explicitly resolved afterward. Stable layout bounds passed in DE at 390px and 320px and JA at 320px; the close button remained within the actual panel bounds. Renderer typecheck and focused UI/i18n tests pass. This controlled renderer probe does not establish continuity of a real provider/SDK stream or packaged-app behavior.

## Missing acceptance proof

The available Hidden-Electron fixture mounts only `LocalAiSetupPane`; it does not include the app shell or `NativeSettingsMain`. The attempted default-sandbox run was blocked before Electron by esbuild `spawn EPERM`; the single approved controlled retry passed. No FirstRun → Settings → Local Models click path was exercised. No pane unmount/remount or application restart was exercised, and no claim is made that backend model configuration survives an app restart. Settings mode persistence is source- and unit-test-supported only.

The separate FirstRun → Settings → Local Models path and scoped Simple/Advanced preference remount/restart persistence remain unverified. The right-panel test uses a controlled pending Assistant request, not a live provider/SDK stream.

## Repeatable bounded probe

```powershell
node apps/desktop/tests/root-ui-navigation-smoke.cjs
```

This runs the existing isolated component fixture in hidden Electron. It does not run an app build, package, installer, provider, or model download. It deliberately reports the application-shell and restart boundary as untested.

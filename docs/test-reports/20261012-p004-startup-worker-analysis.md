# P004 startup worker: source and evidence status

Date: 2026-10-12 (Europe/Vienna). Source base: `4c6f11eb5772da7a0de545ef75750db970f58ba8` on `codex/p004-v0155-diagnosis-20261012`. This is a source review, not a new VM or packaged-app acceptance run.

## Bound observations

- The existing VM owner observed a black first window on the exact `151df72cc1d8e2c21f3ffcf1d4f422f3d714a58a` unsigned test candidate and an immediate recovery after Ctrl+R. The corresponding VM report is commit `5bf00692733d98f065077bed6a7034424b882018` in the tester branch. It records no renderer or main-frame event sequence, so it does not identify the failed startup stage.
- The later `67bf77c4925e0d0e1e5563cc8880fc89ce8fbc94` candidate adds ordered `[lastbrowser startup-renderer]` events, but its VM event sequence has not been supplied to this worker. The sole VM owner was asked in the P004 Slack thread to provide the redacted sequence from the already authorized run. No second VM driver or blind retry was used.
- A separate local screenshot shows a visible, normally locked browser before password entry. It is not bound to a candidate hash or VM run. It is not evidence of a black renderer or a hanging authentication check.

## Main-process source analysis

`createWindow()` constructs the main `BrowserWindow`, registers renderer lifecycle listeners, then loads `app://bundle/index.html`. The custom protocol returns the installed renderer assets and marks the index response `no-store`. The top-level React error boundary can display a recovery screen once the renderer entry module has executed; it cannot catch an entry-module fetch or evaluation failure before React mounts. These are possible stages to distinguish, not established causes of the VM symptom.

The new trace reports `did-start-loading`, `dom-ready`, `did-finish-load`, `did-stop-loading`, `ready-to-show`, main-frame load failure, renderer exit, and unresponsive/responsive transitions. The next decision depends on which events occurred **before** the black screenshot and which occurred after Ctrl+R. In particular, `did-finish-load` alone does not establish that React painted a usable page. No GPU, cache, timing, profile, or authentication failure is attributed from the current evidence. No speculative startup change was made.

## Windows Search: separate read-only check

The current-user Start Menu shortcut exists; its target and working directory exist, and it has no command-line arguments. The Windows Search service is running. Earlier read-only evidence also found the current-user uninstall entry for LastBrowser 0.1.55. These facts do not establish why typing `las` does not suggest the app. No index, search setting, shortcut, or user profile was changed.

## Next evidence gate

The sole VM owner should report the exact installed `67bf77c4` artifact pin and redacted startup event order relative to first visible state and any Ctrl+R recovery. A missing `did-finish-load`, a main-frame load error, renderer exit, or a complete load sequence with black content point to different repair paths. A main-process code fix and regression require one of these concrete paths; the `151df72c` screenshot alone is insufficient. The existing profile must remain intact.

## Source gates for this documentation branch

- `npm test`: 239 files, 2,170 tests passed on the final full run. The first run in the new worktree lacked the Electron binary because dependencies had been installed without package scripts. After restoring the matching `37.10.3+wvcus` runtime, one full run had a 5-second UI-smoke timeout; its focused rerun passed, followed by the fully passing run.
- `npm run verify:store`: 39 PASS, 2 WARN, 0 FAIL. The warnings concern provisional screenshot content and absence of a final signed package.
- `npm --workspace apps/desktop run build`: PASS with the existing large-chunk advisory.
- `python -m compileall -q services/sidekick`: PASS.

These are source checks on the report branch. No startup repair, installed package, VM retest, or release acceptance is claimed.

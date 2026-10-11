# A-030 Quickchat-only view: test report

Stand: 2026-10-11. Source branch `codex/a-030-quickchat-no-space-assistant-20261011`, based on `release/v0.1.52` at `7d3d52bb58114296b66b7eeef290b67581b226bc`.

## Scope and correction

The Quickchat panel no longer offers a header action to switch into Space Assistant. The topbar button now opens Quickchat directly, including when the panel was already open in the legacy Assistant/empty state. Closing and reopening Quickchat continues to work. Quickchat transcript, busy, error, and status values are selected only for the active profile/space/backend scope. Space Assistant's independent panel, settings, IPC bridge, and backend remain unchanged.

The A-030 source analysis initially misidentified `App.tsx:4775` as the topbar icon. That line is a Quick Action. The actual topbar callback is `onToggleCopilot={toggleCopilot}` at `App.tsx:4881`; the first open previously left `quickChatMode` false and could show the legacy Assistant/empty view. This report and patch cover that confirmed topbar path. `quickChatMode` is in-memory state and is not persisted.

## Regression evidence

The updated `root-assistant-quickchat-contract.test.ts` was run before the product fix and showed the expected rendered-header failure: the Space Assistant switch was present. After the fix, all six contract tests passed. The tests render the real `CopilotSplitView`, exercise the exact scope-selection helpers used by `App.tsx`, and verify the toolbar mode transition and close behavior.

The Electron visual smoke mounted the actual `ModernTitlebar` and `CopilotSplitView` with controlled local fixtures. It verified the toolbar's first click, absence of the Space Assistant switch in English/German/Japanese, close/reopen transcript retention, and isolation/restoration between scope A and scope B. Result: `quickchat-only-visual-smoke:passed`. This is a synthetic mounted-renderer probe, not a packaged, live-provider, or human acceptance test.

## Required repository gates

| Check | Result |
| --- | --- |
| `npm run test:run` | PASS: 220 files, 1,997 tests |
| `npm run build` | PASS: TypeScript and Vite; existing chunk-size warning (>500 kB) |
| `npm run verify:store` | PASS: 39 PASS, 2 WARN, 0 FAIL; screenshot provenance remains provisional and no package was supplied, so binary-signature readiness was not checked |
| `python -m compileall -q services/sidekick` | PASS: no output |

`npm ci` completed with 424 packages installed and reported 33 dependency audit findings (2 low, 6 moderate, 22 high, 3 critical). The Electron executable was absent after installation. It was restored into ignored `node_modules/electron/dist` from the existing local cache only, using `electron-v37.10.3+wvcus-win32-x64.zip`, SHA-256 `CA9EAF74DA06A72E9FAE62B52C0EEA87A5F90456A41FBDD106333ADDBD1DC97D`, matching the package checksum manifest. Electron reported version `37.10.3`. No tracked dependency files were changed.

## Limits

These results establish source-level and controlled renderer behavior. No package build, signed artifact, installed-device/VM run, live provider request, human review, merge, or release is claimed. The separate persistent-goal UI probe was updated but not executed in this run. There are no backend changes.

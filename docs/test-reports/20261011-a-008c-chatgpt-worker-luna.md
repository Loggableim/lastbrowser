# A-008c: Keyboard zoom state and topbar indicator

Date: 2026-10-11 (Europe/Vienna)
Agent: chatgpt-a008c-worker-luna
Branch: codex/a-008c-zoom-20261010
Base: live `origin/release/v0.1.52` at `7d3d52bb58114296b66b7eeef290b67581b226bc`

## Cause and change

The main-process shortcut consumer changed the guest WebView zoom directly,
bypassing React zoom state, per-domain persistence, and the toolbar percentage.
The topbar also received a constant 1. The shortcut path now delegates to the
same step/reset handlers used by the renderer, the topbar receives the active
zoom state from `BrowserMain`, and its reset uses the shared apply path. The
step calculation is shared and covered at the 50% and 300% limits.

Scope: zoom-only changes in `apps/desktop/src/renderer/App.tsx`, zoom tests in
`apps/desktop/tests/appearance-relaunch.test.ts`, and this report. PR #47 was
not cherry-picked; this branch starts from the verified live release SHA.

## Regression evidence

`npm --workspace apps/desktop run test:run -- tests/appearance-relaunch.test.ts`

- Exit 0, 38 tests passed.
- Exercises main shortcut-action dispatch to the shared step/reset callbacks,
  zoom-step boundaries, separate domain overrides/default fallback, topbar
  state/reset wiring, and the production `onShortcut` delegation.
- The App wiring assertion is source-level; no packaged UI interaction was run.

## Gates

- `npm ci`: exit 0, 424 packages. npm reported 33 dependency advisories; no
  dependency or lockfile changes were made.
- The initial full suite could not launch two Electron DOM suites because the
  clean install lacked `electron.exe`. The pre-existing local distribution was
  the same locked Electron version `37.10.3+wvcus`; its executable SHA256 was
  `096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1`.
  Its ignored runtime files were restored into this worktree and `path.txt` was
  set to `electron.exe`; `node_modules` is ignored and no tracked dependency
  files changed.
- `npm run test:run`: rerun exit 0, 220 files / 1,998 tests passed.
- `npm run build`: exit 0; TypeScript and Vite passed. Existing Vite chunk-size
  warning remains.
- `npm run verify:store`: exit 0, 39 PASS, 2 WARN, 0 FAIL. Warnings cover
  provisional screenshots/localization and the absence of a final package for
  signature checks.
- `python -m compileall -q services/sidekick`: exit 0.
- Renderer typecheck: exit 0.
- `git diff --check`: exit 0.

## Not verified

No packaged Windows keyboard/toolbar interaction, signing, VM, deployment, or
release was performed. No merge, version, or CHANGELOG change was made.

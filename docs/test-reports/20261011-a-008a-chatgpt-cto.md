# A-008a: Ctrl+B in Zen

Date: 2026-10-11 (Europe/Vienna)
Agent: chatgpt-cto
Branch: codex/a-008a-zen-ctrlb-20261010
Base: release/v0.1.52 at d39ae7fa572ff8ee5c2ac5443487ebb42761f3e4

## Cause and change

The DOM Ctrl+B path already toggled the Zen overlay. The IPC `toggle-sidebar`
case instead called `cycleSidebarMode` and toggled the context panel even in
hidden/Zen mode. The IPC case now checks the current store mode; in Zen it
only toggles `zenSidebarRevealed`. Normal slim/expanded behavior is preserved.

Scope: App.tsx IPC case, one regression test, this report. Settings-worker
explicitly released App.tsx before this change; no other worker files changed.

## Regression evidence

`npm --workspace apps/desktop run test:run -- tests/zen-sidebar-shortcut.test.ts`

- Before production change: exit 1, two Zen cases failed, two normal modes passed.
- After production change: exit 0, four cases passed.
- Test executes the actual production IPC case with controlled state/effects,
  asserting overlay toggling and absence of sidebar/context changes in Zen.
  It is a branch behavior regression, not a rendered UI or packaged smoke.

## Gates

- `npm ci`: exit 0, 424 packages. Existing audit warnings recorded; no dependency changes.
- `npm run build`: exit 0; existing Vite chunk-size warning.
- `npm run verify:store`: exit 0, 39 PASS, 2 WARN, 0 FAIL. Warnings concern
  provisional screenshots/localization and missing final signed package.
- `python -m compileall -q services/sidekick`: exit 0.
- Full `npm run test:run`, first run: exit 1 solely from missing Electron
  executable in address-autocomplete DOM suite; 215 files / 1954 tests passed,
  17 skipped. npm-ci dependency contained no Windows executable.
- Restored ignored Electron runtime from completed A029b worktree only after
  exact package version match `37.10.3+wvcus`. Executable SHA256:
  `096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1`.
  No tracked package/lockfile changes.
- Full `npm run test:run`, rerun: exit 0, 216 files / 1971 tests passed.
- `git diff --check`: exit 0.

## Not verified

No packaged Windows Ctrl+B interaction, signing, update, VM, deployment or
release performed. Final Windows keyboard/overlay behavior remains a candidate
for vm-tester. No merge, version or CHANGELOG change.

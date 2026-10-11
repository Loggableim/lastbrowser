# A-008b verification report

Date: 2026-10-11
Base: `release/v0.1.52` (`7d3d52bb58114296b66b7eeef290b67581b226bc`)
Branch: `codex/a-008b-ctrl-num-clean-20261011`

## PR basis correction

The first PR (#47) was based on a stale divergent history. Its full diff against the current release head included unrelated release version/download changes, deleted documentation and tests, and other renderer/backend changes. The A-008b commit was cherry-picked onto the current GitHub release head above. This replacement branch contains only `App.tsx`, `tests/shortcuts.test.ts`, and this report; no release metadata, public download, unrelated test, docs, or backend changes are included.

## Decision and change

Ctrl/Cmd+1..8 keeps the browser's standard tab-switch behavior. `src/main/shortcuts.ts` already maps these keys to `jump-tab`, prevents the native default once, and sends the action to the renderer; `src/renderer/App.tsx` consumes that action by activating the indexed tab. Removed the second `App.tsx` keydown path that routed the same digits to Pinned Apps. This leaves a single shortcut owner and removes the Pinned App host comparison, including its inconsistent `www` handling.

Added a regression in `tests/shortcuts.test.ts` covering all eight Ctrl mappings, the real `App.tsx` tab consumer, and absence of the competing Pinned App listener. The test failed before the source change and passed after it.

## Verification

| Check | Result |
| --- | --- |
| `npm ci` | Passed; 424 packages installed. `npm` reported 33 audit findings (2 low, 6 moderate, 22 high, 3 critical). No dependency manifests or lockfiles were changed. |
| Electron runtime | The locked package is `37.10.3+wvcus`. Its `electron.exe` was missing after `npm ci`; restored the existing local binary directory from the primary checkout's same-version install. SHA-256 matched: `096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1`. |
| Focused regression before source change | Failed as expected on the competing Pinned App listener. |
| Focused regression after source change | Passed: `tests/shortcuts.test.ts`, 10/10 tests. |
| Electron DOM suite | Passed after local binary restore: `tests/address-autocomplete-dom.test.ts`, 17/17 tests. |
| `npm run test:run` | Passed on the corrected base: 220/220 files, 1,995/1,995 tests. |
| `npm run build` | Passed; TypeScript and Vite build succeeded. Vite emitted its existing large-chunk advisory. |
| `npm run verify:store` | 39 passed, 0 failures, 2 warnings (screenshots provisional; no final package supplied). This is a preflight, not package certification. |
| `python -m compileall -q services/sidekick` | Passed. |

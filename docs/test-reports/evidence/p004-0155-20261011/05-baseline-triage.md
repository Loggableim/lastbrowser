# P004 full-suite failure triage

Date: 2026-10-11. Read-only source investigation; no Electron/UI tests launched and no product changes.
Baseline commit: `68c2cddf4a0f787f6adc858d181a3e0c8898c867`.
Working checkout: `C:\work\lastbrowser-p004`, branch `codex/p004-chat-opencode-fix` (uncommitted work preserved).

## Confirmed baseline locale failures

Exact baseline files were extracted using `git archive` into `C:\work\p004-tools\baseline-locale-68c` with original package files, Vitest configuration, renderer source and tsconfigs. Its node_modules junction uses the existing shared dependencies; this is source-baseline comparison, not a clean dependency reinstall.

Commands (PATH prepended with `C:\work\a033-tools`):

```powershell
npm.cmd --prefix C:\work\p004-tools\baseline-locale-68c --workspace apps/desktop run test:run -- tests/independent-assistant.test.ts tests/setup-state.test.ts --maxWorkers 1
npm.cmd --prefix C:\work\p004-tools\baseline-locale-68c --workspace apps/desktop run test:run -- tests/independent-message-control.test.ts --maxWorkers 1
```

| Tests | Exact baseline | Current checkout |
| --- | --- | --- |
| independent-assistant + setup-state | 8 failed, 63 passed; 9.54s | 8 failed, 63 passed; 8.80s |
| independent-message-control | 2 failed, 4 passed; 4.97s | 2 failed, 4 passed; 4.16s |

The tests assert German strings while mounting DesktopI18nProvider without an explicit locale. In this environment default locale resolves to English. These ten failures reproduce on the exact baseline; they are not evidence of a new patch regression. Test files and relevant i18n/setup/assistant UI sources are unchanged from baseline. Initial archive run omitted tsconfigs and generated two additional React configuration failures; that invalid attempt was corrected and is excluded from the results above.

Evidence: `baseline-locale-result2.log`, `baseline-message-control-result.log`, `current-message-control-result.log` under this directory.

## Focused timeout reruns

```powershell
npm.cmd --workspace apps/desktop run test:run -- tests/sidekick-api.test.ts -t 'falls back to bundled skills' --maxWorkers 1
npm.cmd --workspace apps/desktop run test:run -- tests/windows-package-signatures.test.ts --maxWorkers 1
```

- Bundled-skills fallback: 1 passed, 48 skipped; test196ms, total1.73s. The full-suite5s failure did not reproduce in isolation.
- Windows package signatures: 7 passed; tests7.25s, total7.80s. Neither reported full-suite timeout reproduced. Evidence: `windows-package-signatures-focused.log`.
- These isolated passes support suite-load sensitivity but do not establish the precise full-suite timeout cause.
- Address autocomplete and nav-smoke run Electron and were deliberately not rerun alongside the parent's live application. Their reported timeout failures remain unresolved; no pass is claimed.
- The original current full-suite log was not available to this subagent. Independent-message-control is the verified seventh-file candidate; exact identification depends on that original log.

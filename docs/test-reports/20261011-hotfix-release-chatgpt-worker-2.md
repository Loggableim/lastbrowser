# v0.1.53 hotfix candidate verification

Date: 2026-10-11 (UTC)
Branch: `codex/hotfix-v0.1.53`
Base: PR #30 head `2497c560a49a0dec3092a7ce5c60699542916c79` (`codex/hotfix-nav-20261010`)
Candidate source tree: `6bae8d70` (the package was built from this exact tracked tree before the report was committed).

## Source checks

- `npm run build`: passed (TypeScript main/preload and renderer checks; Vite production build). Vite reports the existing >500 kB JavaScript chunk warning.
- `npm run test:run`: passed, 215 files / 1967 tests.
- `npm run verify:store -- -Quick`: exit 0, 38 pass / 3 warnings / 0 failures. Quick mode skipped Vitest and package signature checks; the full test suite and package signature check are recorded separately above.
- `npm run package:win`: passed after setting `LASTBROWSER_WHEELHOUSE` to the existing main-checkout wheelhouse and `PSModulePath` to the Windows PowerShell module directories. The first attempt stopped before signing because PowerShell could not auto-load `Microsoft.PowerShell.Security`; no source change was made for this environment issue.

## Candidate package evidence

- EVS/VMP `sign-pkg` and `verify-pkg`: passed for `Lastbrowser.exe`; Castlabs reported a valid streaming signature.
- `scripts/verify-windows-package-signatures.ps1` against `apps/desktop/release/win-unpacked` and the setup installer: passed, 121 files checked, 0 failures, all checked signatures timestamped and valid.
- Setup: `Lastbrowser-0.1.53-x64-setup.exe`, 160,713,120 bytes, SHA-256 `4AB50EA0DCD2B4215A831F2F3D09A707420AA999E9541D377309BB99BB998335`.
- Portable: `Lastbrowser-0.1.53-x64-portable.exe`, 160,349,776 bytes, SHA-256 `9821B152B3AE3248C9E3990D833AE047D711DE5391960D92FED02CC654A27663`.
- Generated `latest.yml` points to the setup installer and records its SHA-512 and size.

## Fresh-profile runtime probe

- Command: `node runtime-candidate-probe.cjs` (temporary probe; not retained in the repository).
- Launched the candidate's signed `Lastbrowser.exe` payload from `apps/desktop/release/win-unpacked` with a new temporary user-data directory, `--headless=new`, and a local CDP endpoint; the profile was removed after the run.
- With the first-run AI-choice dialog visible, `elementFromPoint` at the Settings sidebar button resolved to the real button (`wrap pointer-events: none`, panel `auto`). CDP mouse press/release activated that sidebar item.
- A real mouse click on the top titlebar sidebar toggle changed the browser workspace from `mode-slim` to `mode-expanded` while first-run setup remained visible.
- Real Escape input moved from the AI-choice screen to browser-only first-run setup; a second Escape closed setup. All assertions passed.
- The New Tab button is not rendered in this first-run view; the top titlebar sidebar toggle was the available top-navigation control exercised.
- Startup logs showed transient connection retries while the isolated in-tree Sidekick service came up. The navigation and Escape assertions passed after renderer mount; no user profile or credentials were used.

## Still required before publication

- Website proxy/feed and localized download references still need to match these signed candidate hashes before a public website update.
- This report records a locally built candidate only. No tag, GitHub release, deployment, or public upload was performed.


## Nachtrag, verifiziert am 11. Oktober 2026

Der frühere Abschnitt „Still required before publication“ war ein Zwischenstand vor der Freigabe und ist durch diesen Nachtrag ersetzt:

- Tag `v0.1.53` und öffentliches GitHub-Release sind live: https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.53 (veröffentlicht 2026-10-11 01:42:02 UTC).
- GitHub API meldet alle vier Release-Assets als hochgeladen; Setup- und Portable-Digests sowie Größen stimmen mit den lokal geprüften Paketen überein.
- Public `latest.yml` liefert HTTP 200 und enthält beide v0.1.53-Artefakte. Website-Proxy, lokalisierte Seiten und RSS werden getrennt in PR #32 aktualisiert; kein Website-Deploy wurde ausgeführt.
- `apps/desktop/tests/public-downloads.test.ts` wurde so angepasst, dass beide veröffentlichten, signierten Paare v0.1.52 und v0.1.53 abgedeckt sind, während die bekannten v0.1.45/v0.1.34-Downloadpfade ausgeschlossen bleiben. Gezielter Lauf: 5/5 bestanden.
- Danach vollständiger Lauf `npm run test:run` auf diesem Hotfix-Worktree: 215 Dateien, 1.967 Tests bestanden.

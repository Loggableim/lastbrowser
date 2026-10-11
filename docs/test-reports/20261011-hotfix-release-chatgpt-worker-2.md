# v0.1.53 hotfix candidate verification

Date: 2026-10-11 (UTC)
Branch: `codex/hotfix-v0.1.53`
Base: PR #30 head `2497c560a49a0dec3092a7ce5c60699542916c79` (`codex/hotfix-nav-20261010`)

## Source checks

- `npm run build`: passed (TypeScript main/preload and renderer checks; Vite production build). Vite reports the existing >500 kB JavaScript chunk warning.
- `npm run test:run`: passed, 215 files / 1967 tests.
- `npm run package:win`: passed after setting `LASTBROWSER_WHEELHOUSE` to the existing main-checkout wheelhouse and `PSModulePath` to the Windows PowerShell module directories. The first attempt stopped before signing because PowerShell could not auto-load `Microsoft.PowerShell.Security`; no source change was made for this environment issue.

## Candidate package evidence

- EVS/VMP `sign-pkg` and `verify-pkg`: passed for `Lastbrowser.exe`; Castlabs reported a valid streaming signature.
- `scripts/verify-windows-package-signatures.ps1` against `apps/desktop/release/win-unpacked` and the setup installer: passed, 121 files checked, 0 failures, all checked signatures timestamped and valid.
- Setup: `Lastbrowser-0.1.53-x64-setup.exe`, 160,713,120 bytes, SHA-256 `4AB50EA0DCD2B4215A831F2F3D09A707420AA999E9541D377309BB99BB998335`.
- Portable: `Lastbrowser-0.1.53-x64-portable.exe`, 160,349,776 bytes, SHA-256 `9821B152B3AE3248C9E3990D833AE047D711DE5391960D92FED02CC654A27663`.
- Generated `latest.yml` points to the setup installer and records its SHA-512 and size.

## Still required before publication

- Fresh-profile runtime verification of the setup overlay behavior and actual sidebar/top-navigation clicks has not been performed. Source tests do not establish runtime click behavior.
- Website proxy/feed and localized download references still need to match these signed candidate hashes before website updates are prepared.
- This report records a locally built candidate only. No tag, GitHub release, deployment, or public upload was performed.

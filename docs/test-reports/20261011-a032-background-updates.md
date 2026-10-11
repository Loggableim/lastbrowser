# A-032 automatic background updates

Date: 2026-10-11
Branch: `codex/a-032-background-updates-20261011`
Base: `release/v0.1.52` at `7d3d52bb58114296b66b7eeef290b67581b226bc`

## Delivered

- Automatic update checks use the stable GitHub release channel by default, begin after the existing renderer preference hydration window, repeat every four hours, and retry transient failures after 30 seconds, two minutes, and ten minutes before returning to the regular interval.
- Automatic download and installation-on-normal-app-quit are enabled by default. The app does not force a quit or restart: the user can continue the current session, and electron-updater applies a completed update when the app next exits. Manual checks remain available when automatic updates are disabled.
- Stable and Preview channel preferences persist in `%APPDATA%\\Lastbrowser\\update-preferences.json`. Preview selects the published beta channel; downgrade remains disabled.
- The updater keeps the downloaded state across later no-update or error events, coalesces concurrent checks, prevents duplicate downloads/installs, and permits retry after recoverable download or install errors.
- The updater bridge and System > Notifications settings expose the channel choice. New labels are present in all eight raw locale catalogs, including Japanese.
- Windows update signature verification is explicit in the electron-builder configuration. Release notes include verified v0.1.53 changes and a version-only confirmation for a later target when no target-specific notes are bundled.

## Feed and prior VM evidence

- Public v0.1.53 release metadata exposed `latest.yml` and its setup blockmap. The v0.1.52 `latest.yml` URL returned HTTP 404 at the time of inspection.
- GitHub release metadata reported the v0.1.53 setup asset as 160,713,120 bytes with SHA-256 `4ab50ea0dcd2b4215a831f2f3d09a707420aa999e9541d377309bb99bb998335`; the blockmap was 158,067 bytes with SHA-256 `e140d132dfa9d98ba2c99c5be683cd4179fdf033edc75f2badb7a1d1a8ae4b24`.
- The P-003 VM report’s pending setup hash and size matched that public v0.1.53 setup asset. Its `.53` installed EXE and ASAR hashes were not recorded, so that observation proves package lineage only, not that the installed executable was the exact pinned asset. A later `.54` candidate was reported with matching setup, EXE, and ASAR hashes.
- P-003 reported that the `.52` to `.53` background update completed, but the installed EXE ProductVersion still read `.52.0`; the cause was not established. “What’s new” did not appear after either observed upgrade. The report did not measure download progress or install time. Although a blockmap was available, whether that run transferred a differential payload is unknown.
- The public v0.1.53 notes used here state that first-run setup no longer blocks sidebar/top navigation and Escape can exit AI choice to finish browser-only setup. No unverified changelog content was added.

## Safety and recovery boundary

electron-updater validates the downloaded package SHA-512 and, when the builder-generated publisher metadata is present, verifies the Windows Authenticode publisher before installation. Downgrades are disabled. Failed checks/downloads leave the current app running and can be retried. This implementation does not add a transactional rollback for an installer that fails after it has begun modifying files; post-failure rollback was not tested here. No user data, profile, session, or credentials are part of the updater preference file.

## Verification

- `npm ci`: completed; 424 packages installed. npm reported 33 dependency audit findings; dependency versions and lockfiles were not changed.
- `npm run test:run`: passed, 220 test files and 2,007 tests. This included the Electron browser smoke suites and the tab-session/profile suites. The isolated worktree’s Electron package did not contain its Windows executable after `npm ci`; the matching Electron 37.10.3+wvcus runtime from the root checkout was copied into the worktree’s ignored dependency directory to run those suites. No root-checkout files were changed.
- Focused updater/session/profile check: 60 tests passed.
- `npm run build`: passed TypeScript and Vite build. Vite emitted the existing large-chunk advisory for the 2.44 MB renderer bundle.
- `npm run verify:store`: 39 passes, 0 failures, 2 warnings. Warnings: source-build screenshots remain provisional pending completed-release review; no final package was supplied for binary signature checking.
- `git diff --check`: passed.
- No backend files changed, so Python tests were not applicable.

## Evidence not established

No signed package, clean-install test, real P-003 VM upgrade, install-duration measurement, differential-transfer measurement, or post-install rollback exercise was performed in this work. This report records source and repository-gate evidence; it does not claim device, VM, Store, signing, or release acceptance.

# A-026: retire Antigravity provider

Agent: chatgpt-settings-worker. Date: 2026-10-11 (Europe/Vienna).
Branch: `codex/a-026-remove-antigravity-provider-20261011`.
Base: `origin/release/v0.1.52` at `d39ae7fa572ff8ee5c2ac5443487ebb42761f3e4`.

## Behavior and scope

Antigravity and its legacy aliases are excluded from Settings/Connected providers,
onboarding fallback/live catalogs and chat model pickers, including stale ready catalogs.
Persisted first-run/chat preferences no longer revive the removed identity. Other
providers remain offered. Saved credential files are preserved; no user profile is deleted.
Runtime resolution, provider configuration, quota access and onboarding OAuth reject
the removed provider. Its account GET/POST routes return HTTP 410.

Inventory before the fix: renderer `setup-state.ts:100,305` (fallback),
`panels/SystemPanels.tsx:2566,4323` (Connected providers),
`panels/NativeChatMain.tsx:228,267`, `components/CopilotSplitView.tsx:277,602`
(picker), `components/CommandPalette.tsx:685` (account action),
`i18n/gemini-subscription-translations.ts:9-21` (legacy account copy),
backend `web/api/providers.py:1359,1644` (saved config provider/custom rows),
`web/api/onboarding.py:81,811` (registry/profile), `cli/models.py:329`,
`cli/auth.py:174` (registries), `cli/runtime_provider.py:1000` (runtime),
`web/api/routes.py:5887,9088` (account endpoints).
Legacy account implementations and translations remain available for internal
compatibility tests, but the Settings account component is no longer mounted and
no supported UI/catalog/runtime path exposes the retired provider.

## Regression evidence

Before implementation, the new frontend legacy-profile test failed because
`cloudProviderOptions` returned Antigravity. Three new Python tests failed because
legacy config rows, onboarding defaults and the runtime still exposed the provider.
After implementation, those tests pass, with additional stale-ready model catalog,
cached alias/default, removed OAuth and HTTP 410 route regressions.
Existing provider-selection tests now use the supported Gemini API provider;
legacy account tests verify hidden profiles and denied execution while preserving
stored credentials. Internal quota parsing tests remain on the internal diagnostic helper.

## Checks

- `npm ci`: PASS (424 packages). Existing dependency audit: 33 vulnerabilities;
  no dependency upgrades included in this task.
- `npm run test:run`: PASS, 216 files / 1969 tests, including real omnibox DOM fixture.
- `npm run build`: PASS, main/preload/renderer TypeScript and Vite; existing chunk-size warning.
- `npm run verify:store`: PASS, 39 PASS / 2 WARN / 0 FAIL. Warnings: provisional
  Store screenshot evidence and no supplied signed Windows package.
- Relevant backend suite: PASS, 70 tests across `test_retired_antigravity_provider.py`,
  `test_antigravity_multi_account.py`, `test_provider_oauth_status.py`,
  `test_models_cache_fingerprint.py`, `test_google_multi_account_routing.py`.
- `python -m compileall -q services/sidekick`: PASS.
- `git diff --check`: PASS.

The initial dependency install contained a macOS Electron path without a Windows
binary; the same existing `37.10.3+wvcus` Windows dependency was copied from the
primary checkout into this isolated worktree's ignored node_modules, then the full
frontend suite passed. No tracked dependency or lockfile changed.

No packaged/device/manual Settings UI acceptance or full Python repository suite
was run. No version, CHANGELOG, merge, tag, signing or release changes are included.

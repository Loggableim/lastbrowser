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

## PR #40 review follow-up (chatgpt-provider-fix-6, 2026-10-11)

Review comment `6106307791` found two P1 gaps on `b77dc15f6a9de50a3c341af697d5625dac8065f7`:

1. A saved `custom_providers[].name: Antigravity (Google)` becomes
   `custom:antigravity-google`, which survived the provider, model, and default
   filters. A renamed custom entry pointing to `cloudcode-pa://antigravity`
   could also survive under its unrelated slug.
2. A stale `model.base_url: cloudcode-pa://antigravity` rejected an explicit
   OpenAI request with a supported explicit URL and `provider_removed`.

New regressions were run before each related code change. The first targeted
Python run failed 2/8 tests (legacy custom catalog, explicit OpenAI); the first
targeted Vitest run failed 2/2 tests (legacy provider list and model catalog).
Additional red checks found an executable renamed retired custom endpoint, an
unrelated explicit custom provider blocked by the stale stored URL, and an
active renamed custom provider still advertised after its row was filtered.

The follow-up recognizes the normalized legacy slug and qualified saved model
IDs, filters custom rows by both name and endpoint, and removes their model
groups, badges, and active/default selection. Runtime resolution rejects a
retired endpoint when it is the selected custom runtime or the selected
provider's applicable stored URL. Explicit selection of another supported
provider is no longer blocked by an unrelated stored URL. Supported custom
and OpenAI entries remain available. The saved profile and credentials were
neither modified nor deleted.

Verification after the final code change:

- Targeted backend group: 74/74 PASS across the five Python files listed above;
  the new retirement file has 10/10 PASS.
- Frontend: `npm run test:run` 216/216 files, 1969/1969 tests PASS, including
  the 17 actual Omnibox DOM tests. The first full run after `npm ci` failed
  because npm installed a macOS Electron path on this Windows host. The same
  existing `37.10.3+wvcus` Windows Electron distribution was copied from the
  primary checkout into ignored `node_modules`; the unchanged full suite then
  passed. This is a test-host dependency repair, not a tracked source change.
- `npm ci` PASS (424 packages; audit reported 33 existing vulnerabilities).
- `npm run build` PASS; Vite emitted the existing large-chunk warning.
- `npm run verify:store`: 39 PASS / 2 WARN / 0 FAIL; provisional screenshots
  and absent signed package remain the two warnings.
- `python -m compileall -q services/sidekick` and `git diff --check`: PASS.

These are source and test-host results. No Windows package, VM/device Settings
walkthrough, live provider response, signed artifact, or Store acceptance was
verified in this follow-up.

## PR #40 second review follow-up (chatgpt-provider-fix-6, 2026-10-11)

Review comment `6106734839` confirmed the first two P1 gaps closed and found a
second saved custom-provider format: `providers.<name>` could still expose a
renamed entry whose `base_url` is `cloudcode-pa://antigravity`.

Two new backend regressions were run before implementation and both failed:
`test_named_providers_entry_with_retired_endpoint_is_absent_from_provider_list`
returned `legacy-endpoint`, and
`test_named_providers_entry_with_retired_endpoint_is_absent_from_model_catalog`
retained its active/default pair and model group. Both tests include an
unrelated supported provider that must remain available.

The provider-list and cached-model filters now also inspect endpoint URLs in
`providers.<name>` entries. They remove the retired entry from the provider
list, active/default selection, model groups, and configured badges without
changing persisted configuration or credentials. No renderer file was changed
in this follow-up.

Checks after the follow-up: `npm ci` PASS (424 packages; 33 existing audit
findings), targeted backend group 76/76 PASS (retirement file 12/12),
`npm run test:run` 216/216 files and 1969/1969 tests PASS, `npm run build`
PASS, `python -m compileall -q services/sidekick` PASS, and Store preflight
39 PASS / 2 WARN / 0 FAIL. As after the first `npm ci`, the matching Windows
Electron `37.10.3+wvcus` files were restored only to ignored `node_modules`
before the full frontend suite. The two Store warnings remain provisional
screenshots and an absent signed package.

Evidence is at source/test-host level. No package, VM/device Settings test,
live provider response, signed artifact, or Store acceptance was verified.

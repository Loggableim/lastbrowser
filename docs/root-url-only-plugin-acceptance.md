# A31: URL-only plugin acceptance

## Result

**Implemented in source; targeted checks pass.** A plugin manifest `start_url` now survives parsing only when it is a valid credential-free HTTP(S) URL and the plugin declares no tools or hooks. It is exposed as untrusted `startUrl` metadata on a restricted catalog row. That row still has no supported tasks, no available adapter, and no usable setup/bind action. The Assistant UI says “Browser access, not an API connection” and offers an explicit “Open in browser” button.

The button does not call `openExternal`. App routes it through the current `addTab` path. Before opening, App re-fetches the capabilities for the supplied complete scope, requires the same plugin catalog ID and exact validated URL, and rechecks that the active Assistant selection, browser profile, Space path, backend profile, selection revision, and binding revision are still current. A stale A→B selection or a changed URL is rejected without opening a tab.

## Source contract

- A31 in `independentagent.md:451` requires the UI to show browser access for a plugin that supplies only a start URL, without inventing API integration.
- `services/sidekick/cli/plugins.py` now adds optional `PluginManifest.start_url`; `_validated_start_url` rejects other schemes, malformed hosts/ports, credentials in userinfo/query/fragment, controls, backslashes, and oversized or trimmed input. Invalid values are omitted rather than treated as plugin failures.
- `services/sidekick/runtime/independent/capabilities.py` emits the URL only for a plugin with no declared tools or hooks. Connector rows remain restricted and taskless; MCP rows never receive plugin URL metadata.
- `apps/desktop/src/renderer/independent-contracts.ts` and `independent-assistant-client.ts` carry and validate `startUrl`. The client rejects unsafe URLs from the capability API.
- `apps/desktop/src/renderer/components/IndependentConnections.tsx` renders a positive browser-access card only for a restricted `plugin:` connector with a safe URL and zero supported tasks. It does not expose API bindings or permissions through this branch.
- `apps/desktop/src/renderer/plugin-browser-navigation.ts` owns the shared URL predicate and click-time checks. The capability ID must still resolve to a restricted, taskless connector whose `startUrl` exactly matches; every attached connection must remain adapter-unavailable.
- `apps/desktop/src/renderer/App.tsx` carries the callback through `SpaceAssistantPanel` and rechecks the authoritative current Space scope before using `addTab`. No Main/Preload/general URL-opening bridge was added. The scope-resolution effect also aborts its pending request on cleanup, retaining its existing late-result guard.
- `capabilities.refresh` was already accepted by the backend operation; the TypeScript operation payload now matches it with `{ refresh?: boolean }` so the UI can request fresh manifest metadata.

## Executed evidence

Added `services/sidekick/tests/test_root_url_only_plugin_acceptance.py`. It exercises a real `plugin.yaml` through the plugin scanner and capability catalog, checks tool-bearing plugins do not get the URL-only browser path, and rejects unsafe or credential-bearing URL values.

Backend command (PowerShell, bundled Python 3.12.10, existing isolated pytest overlay, plugin autoload disabled, no cache provider):

```powershell
$py='C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe'
$overlay='C:\projekte\lastbrowser\output\root-python312-pytest-overlay-20261005'
$sidekick='C:\projekte\lastbrowser\services\sidekick'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick',r'$sidekick\tests'];import pytest,croniter,dateutil;raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_root_url_only_plugin_acceptance.py',r'$sidekick\tests\test_independent_capabilities.py::test_inventory_scans_actual_manifests_without_importing_plugin_or_starting_mcp',r'$sidekick\tests\test_independent_capabilities.py::test_catalog_distinguishes_configuration_health_and_unsupported_tools'],plugins=[]))"
```

Result: **17 passed in 1.28s; exit 0**.

Added `apps/desktop/tests/root-url-only-plugin.test.ts`. It renders the actual URL-only access component to markup, checks the translated browser-access label/button and absence of permission controls, tests filtering of non-plugin/API-capable rows, and exercises successful fresh-catalog opening, stale A→B rejection, changed-target rejection, and unsafe-URL rejection. This is a controlled React server render, not a live Electron DOM or packaged-app test.

Renderer command from `C:\projekte\lastbrowser\apps\desktop`:

```powershell
& '..\..\node_modules\.bin\vitest.cmd' run tests/root-url-only-plugin.test.ts tests/independent-assistant.test.ts
```

Result: **2 files passed, 41 tests passed; exit 0 (1.54s)**. Renderer TypeScript command from repository root:

```powershell
& 'C:\projekte\lastbrowser\node_modules\.bin\tsc.cmd' --noEmit -p apps/desktop/tsconfig.renderer.json
```

The renderer typecheck first passed with **exit 0** after the A31 callback and scope-abort changes. It identified that the existing backend accepts `capabilities.refresh` while the TypeScript request payload was typed as empty; the request contract was aligned. A later rerun, after concurrent Local-AI renderer edits, fails in `LocalAiChatQualification.tsx` and `LocalAiSetupPane.tsx` on `LocalAiResponse` union members (`profile`, `artifactId`, `expiresAt`, `plan`). Those files belong to the parallel Local-AI work and were not changed here. The A31 files had no reported type errors in that run.

No live Electron DOM, live app, packaged-app, build, or full suite was run; those states remain unverified.

## Remaining acceptance proof

Run the controlled Electron UI and packaged application with a fixture URL-only plugin in a confirmed test Space. Verify one user click opens exactly one in-app tab under the active Space/profile; confirm stale scope, invalid protocol, credential-bearing URL, and fresh-catalog mismatch open no tab. No user profile or live application was changed for this implementation.

## Root actual source-app follow-up, 2026-10-05

Root ran `node scripts/probe-full-app-entry.cjs --plugin-browser` with the original Main, preload, React App and bundled Python. Its private runtime contained an enabled URL-only plugin manifest pointing to a controlled loopback page. The genuine Assistant connections panel rendered the browser-only label and button without permission fields. One actual button click increased the sidebar tab count by exactly one and mounted one in-app webview for that exact URL.

Exit **0**; raw report `output/full-app-entry-cfa4e74f-a6e6-452a-9395-c1723861c605.json`. Two controlled provider calls, two renderer reloads, no native dialogs, no surviving owned child processes, private profile cleanup confirmed. The probe's first run incorrectly counted mounted webviews as all browser tabs; the app mounts the active webview only. That failed assertion is retained in `output/full-app-entry-f2ccfc22-0557-4ce2-a1fd-dd6ba230a46d.json`; the corrected probe reads the actual sidebar tab count.

This closes the positive A31 source-app navigation check. Stale-scope/changed-catalog denial remains covered by focused contract tests, not a new actual-app scenario. Current packaged, signed and clean-Windows evidence remains open.

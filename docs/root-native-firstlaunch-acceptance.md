# Native First-Launch Home Scope Acceptance

## Result

**Pass for the current source build; packaged/release behavior remains unverified.** A clean private Electron first launch now resolves the default Browser Home scope after Sidekick becomes ready, with no `SIDEKICK_WEBUI_DEFAULT_WORKSPACE` hint and no pre-seeded `config.yaml` or `workspaces.json`.

## Cause and narrow correction

Main starts Sidekick with `SIDEKICK_HOME` at the app runtime directory (`apps/desktop/src/main/services.ts:123–139`). Sidekick's ordinary first-run workspace resolver can place its default in the OS user's `workspace` or `work` directory (`services/sidekick/web/api/config.py:535–547`). `ProfileHub` originally searched only the Sidekick profile and state roots when it captured workspace defaults (`services/sidekick/runtime/independent/scope_binding.py:45–75`), so a Home bind could fail with `scope_mismatch` / `default_workspace_missing`.

`ProfileHub._capture_default_workspace` now considers the existing OS-home `workspace` and `work` directories only for the default backend profile and only when the trusted `SIDEKICK_HOME` or `LASTBROWSER_HOME` resolves to the exact ProfileHub base directory (`scope_binding.py:59–70`). It keeps explicit config, settings, and launch-hint priority, creates no directory, and uses no renderer-provided path. A first-run Home with no captured workspace can recapture only while unbound; an existing Home binding continues to use its persisted `workspace_locator` (`scope_binding.py:211–232`).

## Evidence

Before the correction, the real Main/Preload/Renderer probe produced two HTTP 403 `scope_mismatch` responses with sanitized reason `default_workspace_missing` for null-scope Home resolution. It used a private unconfigured profile, no workspace hint, and no `config.yaml` or `workspaces.json` seed. See [the sanitized before report](/C:/projekte/lastbrowser/output/root-native-firstlaunch-2026-10-05T04-14-54-290Z-3d8d8a89-2eab-488e-afc1-484b8804013d/report.json).

After the correction, `node scripts/probe-root-native-firstlaunch.cjs` exited 0. The private current-source build passed Main TypeScript, Preload esbuild, and Vite Renderer (all exit 0); Electron exited 0. The actual startup made four observed `resolveScope` requests, all HTTP 200 / `resolved`; the initial two had `scopeIsNull=true`, `workspaceSelection=home`, and default browser/backend profiles. The actual first-run dialog appeared, Sidekick reached ready, and the Space Assistant had no renderer alert. `defaultWorkspaceHintSet=false`, both seed-file checks were false, source hashes stayed unchanged during build and probe, and the final cleanup aggregate confirms the build directory and private profile were removed and the Electron child exited. See [the sanitized after report](/C:/projekte/lastbrowser/output/root-native-firstlaunch-2026-10-05T04-22-42-103Z-d38da89a-ae69-4e63-b16c-7e6264703a9d/report.json).

The focused bundled-Python test invocation was:

```powershell
$py='apps/desktop/runtime/python/python.exe'
$overlay='output/root-python312-pytest-overlay-20261005'
$sidekick=(Resolve-Path 'services/sidekick').Path
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick'];import pytest;raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_root_security_home_capture_race.py',r'$sidekick\tests\test_root_security_scope403_repro.py',r'$sidekick\tests\test_independent_scope_binding.py'],plugins=[]))"
```

Result: **19 passed**, exit 0. The new regression in `services/sidekick/tests/test_root_security_home_capture_race.py:50–84` covers the split runtime/OS-home layout and delayed creation of the legitimate OS-home workspace. Additional negative cases prove a named backend profile does not inherit that default and a foreign `SIDEKICK_HOME` does not authorize it. The same run covers late settings discovery and verifies that a previously persisted Home binding remains attached to its original workspace after restart and default changes.

No full suite, broad product build, package, signing, live user profile, or release artifact was tested.

## Empty OS-home follow-up

`node scripts/probe-root-native-firstlaunch.cjs --empty-workspace` also exited 0 against the current source. This variant does not create `ownHome/workspace` before launch. The actual Sidekick first-run resolver creates its legitimate default, and Main's observed Home-scope requests succeed without a configuration file, workspace registry, or launch hint. Main, Preload and Renderer builds exited 0; Electron exited 0, source hashes remained unchanged, and the private profile/build cleanup completed. Report: `output/root-native-firstlaunch-2026-10-05T04-55-43-935Z-bc5f2a73-1db2-490e-b71b-0ec9211468a2/report.json`. This is current source-App evidence, not an installed-package or release claim.

# A40 BrowserHost scope boundaries

## Acceptance result

**Partial, controlled BrowserHost evidence passed.** The probe exercised the current checked-out BrowserHost source in a real Electron 37.10.3+wvcus process. All network targets were loopback HTTP servers; the Electron parent was started with its standard sandbox (no `--no-sandbox`), the browser target used `sandbox: true`, and no remote-debugging port or system protocol registration was used.

| Check | Result | Evidence / limit |
|---|---|---|
| Different HTTP origin | **Passed** | A real anchor click attempted a second loopback origin. The foreign server received **0** requests. BrowserHost emitted `navigation_denied`, paused the affected lease (`pausing`), and retained the same run, scope, target ID, WebContents, partition, and Main/runner generations. |
| Popup | **Passed** | A real click on a `target=_blank` anchor emitted `popup_denied`; the WebContents set did not grow and the original scoped target remained `ready`. |
| Download | **Passed** | A real click requested the local attachment endpoint exactly once; the scoped session emitted `download_denied`, no new WebContents appeared, and the isolated Downloads directory remained empty. |
| Non-web/external protocols | **Passed at the BrowserHost action boundary** | Run-bound navigate actions for `file:` (a harmless file inside the private temp profile) and `mailto:` each rejected with `origin_denied` before Electron `loadURL`; the original scoped target and URL remained `ready` and unchanged. No OS handler was registered or invoked. A DOM-clicked `file:` link in an earlier probe attempt did not emit a BrowserHost event within the bounded wait, so the final check intentionally proves the scoped action gate before dispatch instead of claiming a native protocol-launch test. |
| Cleanup | **Passed** | All three leases reached `closed`, registry size was 0, all target WebContents were gone, the shell window was destroyed, no test windows remained, and no download file was written. The parent removed the temporary profile. |

The fixture creates three distinct test scopes and execution partitions. Every action carries the lease's run ID, exact Scope, target ID, Main/runner generations, navigation/permission epochs, digest, and a one-use permit. The host verifies those fields against its owned lease; no action is submitted without an existing scope.

This is not complete A40 acceptance. No real account login/cookies or account-binding identity was exercised, and this direct BrowserHost fixture does not pass through the production Main→Gateway→RunManager ticket validation. Redirect, dialog, user-visible popup flow, and packaged app behavior remain unverified. The observed code has scope/target checks and fail-closed behavior for the exercised cases; this probe found no concrete product defect. Relevant source is `independent-browser-host.ts:156-167` (HTTP(S) ticket origins), `:238-256` (navigation/popup/download guards), `:311-316` (exact-origin check), and `:318-339` (run/scope/target/generation/epoch action gate).

## Isolated fixture and verification

New probe: [root-browser-navigation-boundaries-probe.cjs](/C:/projekte/lastbrowser/apps/desktop/tests/root-browser-navigation-boundaries-probe.cjs). It builds no application or shared `dist` output. The only generated fixture files are under `output/root-browser-navigation-boundary-fixture/`.

Fixture command (local esbuild **0.27.7**, `platform: node`, `target: node22`, `electron` external):

```powershell
node -e "require('esbuild').buildSync({entryPoints:{'independent-browser-host':'apps/desktop/src/main/independent-browser-host.ts','agent-execution-partition':'apps/desktop/src/main/agent-execution-partition.ts'},outdir:'output/root-browser-navigation-boundary-fixture',bundle:true,platform:'node',format:'esm',target:'node22',external:['electron'],sourcemap:false}); console.log('BOUNDARY_FIXTURE_BUNDLE_OK')"
```

The source hashes recorded before and after fixture compilation/probe were unchanged:

| File | SHA-256 |
|---|---|
| `apps/desktop/src/main/independent-browser-host.ts` | `51A37AEB2083B144C5656483CC878B5425B5FA5123E278F6EC54B3611D5A25FD` |
| `apps/desktop/src/main/agent-execution-partition.ts` | `74DA1603320688F7474FC91445F79B0CEC1B08E081AC19820C8BCFFF2FE5C2F4` |
| `apps/desktop/src/main/browser-lease-owner.ts` | `24BCE06E68337E8C8618CF940A4CFE729FEDD4A766A4B05DE2D351B980D80A00` |
| `output/root-browser-navigation-boundary-fixture/independent-browser-host.js` | `7432DCE0795746CC4F8DCD7ACC1BF2A085EC919F467E20DC4A4BEDD4A8839DCC` |
| `output/root-browser-navigation-boundary-fixture/agent-execution-partition.js` | `A95E38CF1FF1C83909A984FC77C49551C95197CB1803852573461BE9FB9CEAA5` |
| `output/feature-preview-2026-10-04T19-23-32-883Z-64a193fe/win-unpacked/electron.exe` | `096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1` |

`node --check apps/desktop/tests/root-browser-navigation-boundaries-probe.cjs` exited **0**. The exact probe command was:

```powershell
$env:ROOT_BROWSER_BOUNDARIES_HOST_BUNDLE = 'C:\projekte\lastbrowser\output\root-browser-navigation-boundary-fixture\independent-browser-host.js'
$env:ROOT_BROWSER_BOUNDARIES_PARTITION_BUNDLE = 'C:\projekte\lastbrowser\output\root-browser-navigation-boundary-fixture\agent-execution-partition.js'
node apps/desktop/tests/root-browser-navigation-boundaries-probe.cjs
```

The sandboxed Electron spawn returned `EPERM`; that exact command was run with the controlled executable permission and exited **0**, printing `ROOT_BROWSER_BOUNDARIES_PASS`. Final observations: foreign requests **0**, popup WebContents added **0**, download requests **1**, download files **0**, non-web action errors `origin_denied`, leases closed **3/3**, host registry **0**, remaining target WebContents **0**, remaining windows **0**. No product or existing test files were edited; no build/package/full suite or user profile was used.

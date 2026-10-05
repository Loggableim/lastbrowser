# Controlled BrowserHost stop and renderer-reload probe

## Result

| Criterion | Status | Evidence / boundary |
|---|---|---|
| A14: real progress while minimized | **Partial (host evidence passed)** | The real local target page advanced its timer from `ticks=2` to `ticks=5` while the shell window was minimized. A real authorized BrowserHost click also mutated the page. This does not run a persisted Independent `RunManager` task to completion. |
| A16: acknowledged stop during work | **Partial (BrowserHost gate passed)** | During a local navigation deliberately held in flight by the test server, `host.cancel()` returned after 7 ms; the pending action rejected as `action_interrupted` with `inFlight=true`; a post-ack action using a fresh permit was synchronously rejected and the registry had zero leases. The test does not connect this acknowledgement to the persisted RunManager state or test a late worker/result callback against it, so “late response cannot reactivate the run” remains unverified. |
| A20: renderer reload and reconnect | **Partial (host continuity passed)** | After a real shell renderer reload, the same target ID, WebContents ID, partition, and navigation epoch remained. The target timer continued from `ticks=5` to `ticks=8`; click count persisted and a second real click changed it from 1 to 2. The production renderer bridge, SSE reconnect, status hydration, and duplicate-free result UI were not exercised. |

The missing acceptance seam is an integrated fixture that creates/starts a persisted run through the independent manager, routes its browser actions and stop through `IndependentBrowserGateway`, accepts the stop acknowledgement, then delivers a deliberately late worker/result completion and verifies the run stays terminal without another browser dispatch. This probe tests BrowserHost behavior directly; it does not claim that broader integration.

## Reproduction and artifact identity

Probe: [root-browser-stop-reload-probe.cjs](/C:/projekte/lastbrowser/apps/desktop/tests/root-browser-stop-reload-probe.cjs). It owns one private Electron test window, one isolated BrowserHost partition, a temporary user-data directory, and a local-only HTTP server. It uses only scoped lease/permit/action APIs and does not enable remote debugging or contact an external site.

The host fixture was compiled from current checked-out source into the unique `output/root-browser-stop-fixture/` directory; no shared `dist` file or product file was changed. Command:

```powershell
node -e "require('esbuild').buildSync({entryPoints:['apps/desktop/src/main/independent-browser-host.ts'],outfile:'output/root-browser-stop-fixture/independent-browser-host.js',bundle:true,platform:'node',format:'esm',target:'node22',external:['electron'],sourcemap:false}); console.log('HOST_FIXTURE_BUNDLE_OK')"
```

It used local esbuild **0.27.7**. The controlled Electron runtime is **37.10.3+wvcus**. SHA-256 values recorded after the run:

| Input / output | SHA-256 |
|---|---|
| `apps/desktop/src/main/independent-browser-host.ts` | `51A37AEB2083B144C5656483CC878B5425B5FA5123E278F6EC54B3611D5A25FD` |
| `apps/desktop/src/main/agent-execution-partition.ts` | `74DA1603320688F7474FC91445F79B0CEC1B08E081AC19820C8BCFFF2FE5C2F4` |
| `apps/desktop/src/main/browser-lease-owner.ts` | `24BCE06E68337E8C8618CF940A4CFE729FEDD4A766A4B05DE2D351B980D80A00` |
| `output/root-browser-stop-fixture/independent-browser-host.js` | `7432DCE0795746CC4F8DCD7ACC1BF2A085EC919F467E20DC4A4BEDD4A8839DCC` |
| `output/feature-preview-2026-10-04T19-23-32-883Z-64a193fe/win-unpacked/electron.exe` | `096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1` |

## Verification

`node --check apps/desktop/tests/root-browser-stop-reload-probe.cjs` exited **0**.

```powershell
$env:ROOT_BROWSER_STOP_HOST_BUNDLE = 'C:\projekte\lastbrowser\output\root-browser-stop-fixture\independent-browser-host.js'
node apps/desktop/tests/root-browser-stop-reload-probe.cjs
```

The sandboxed Electron spawn first returned Windows `EPERM`; the exact probe was rerun with the controlled executable permission and exited **0**, printing `ROOT_BROWSER_STOP_RELOAD_PASS`. Observed values: minimized timer `2 → 5`; after reload `5 → 8`; mutation count `1 → 2`; stop acknowledgement **7 ms**; late navigation rejected `action_interrupted` / `inFlight=true`; post-ack action rejected; registry size **0**; target WebContents gone; no test windows remained. The probe's private temporary profile was removed. No full build, package, broad suite, or product edit was performed.

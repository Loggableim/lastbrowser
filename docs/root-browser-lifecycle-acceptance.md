# Controlled Electron browser lifecycle probe

This probe exercises the real `IndependentBrowserHostRegistry` with a real Electron 37.10.3+wvcus process and a private local HTTP page. It owns a temporary user-data directory, creates one isolated test shell window and one Main-owned browser lease, and interacts only through BrowserHost lease/permit/action methods. It does not enable remote debugging, use a user's profile, contact external sites, invoke a model, or make product changes.

## Results

| Criterion | Status | Evidence and limit |
|---|---|---|
| A13, switch between Spaces while a task runs | **Unverified** | The probe owns one synthetic shell and one scope; it does not create or switch to a second Space. |
| A14, progress while the app is minimized | **Passed for controlled host** | A real BrowserHost `read` returned `ticks=2; clicks=0`, then after minimizing the shell and waiting, returned `ticks=6; clicks=0`. The page runs a real local timer and is read over the BrowserHost DOM projection. |
| A20, renderer reload and reconnect | **Partial** | The shell's local route was requested twice, with `did-finish-load` observed after calling `shell.webContents.reload()`. Before/after snapshots had the same target ID, WebContents ID, dedicated partition, and navigation epoch. A real click had already set `clicks=1`; after reload a BrowserHost read still returned `clicks=1`, and a second actual click/read returned `clicks=2`. This verifies host continuity through a shell renderer reload, not production SSE reconnect, UI status rehydration, or duplicate-free result presentation. |
| A36, close a shell window or work tab | **Partial** | Explicit terminal `host.closeAll()` emitted `closed`, produced lease state `closed`, removed the target WebContents, and left zero BrowserWindows. The probe closes the BrowserHost lease before destroying its synthetic shell, so it does not establish whether closing one production shell window should preserve or release the lease. |

The test code is [root-browser-lifecycle-probe.cjs](/C:/projekte/lastbrowser/apps/desktop/tests/root-browser-lifecycle-probe.cjs). It loads the existing compiled BrowserHost module from `apps/desktop/dist/main/independent-browser-host.js` (last modified 2026-10-05 00:19 UTC) and `agent-execution-partition.js`. The Electron executable is the existing extracted 37.10.3+wvcus runtime at `output/feature-preview-2026-10-04T19-23-32-883Z-64a193fe/win-unpacked/electron.exe`; only that runtime executable/resources were used, not the incomplete preview's application bundle. The checked-in TypeScript host source was inspected read-only. No build, package, broad test suite, or product edit was performed.

## Exact verification

`node --check apps/desktop/tests/root-browser-lifecycle-probe.cjs` exited 0.

`node apps/desktop/tests/root-browser-lifecycle-probe.cjs` first exited 1 at Electron process creation with Windows `spawn EPERM` under the sandbox. The same exact command was rerun with the controlled executable permission and exited 0. Its output recorded:

```text
ROOT_BROWSER_LIFECYCLE_PASS
minimize: ticks=2; clicks=0 -> ticks=6; clicks=0, shellMinimized=true
reload: same targetId, WebContents ID 2 and dedicated partition; clicks=1 before/after
post-reload click/read: clicks=2; shellRendererLoads=2
cleanup: registrySize=0, leaseState=closed, targetWebContentsGone=true, windowsRemaining=0
```

The probe created and removed a uniquely named temporary user-data directory. The only remaining practical acceptance gaps in this bounded lifecycle probe are a real A/B Space switch, production SSE/result rehydration after reload, and closing a shell window while separately observing the intended lease policy.

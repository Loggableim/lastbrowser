# Electron upgrade for LastBrowser 0.1.57

## Chromium 155+ target (2026-10-13)

The release owner requested Chromium 155 or newer for LastBrowser `0.1.57-beta.1`. The target is now **Castlabs Electron `45.0.0-alpha.14+wvcus`**, commit `059d79860d288044df48e8839d9c621dee4a17e1`, with **Chromium `156.0.8077.0`**. This supersedes the Electron 44 preparation below.

The official Castlabs release is explicitly a prerelease and includes the Windows x64 Widevine archive. No Castlabs Electron 45 beta build is published in the inspected release list; the upstream Electron beta is not substituted because LastBrowser retains the Castlabs Widevine/VMP runtime. This alpha runtime is for the LastBrowser beta channel, not a stable release claim.

Sources: [Castlabs release](https://github.com/castlabs/electron-releases/releases/tag/v45.0.0-alpha.14%2Bwvcus), [upstream Electron release](https://github.com/electron/electron/releases/tag/v45.0.0-alpha.14), [official version mapping](https://releases.electronjs.org/releases.json).

### Provisioned Chromium 156 runtime

- App dependency pins the immutable commit `github:castlabs/electron-releases#059d79860d288044df48e8839d9c621dee4a17e1`; both electron-builder configurations name `45.0.0-alpha.14+wvcus`. npm reused Electron 44 for the changed tag specification, so the explicit commit is required.
- Fresh workspace runtime: `E:\lastbrowser-v0157-dependencies-20261013\apps\desktop\node_modules\electron`; `dist/version` confirms `45.0.0-alpha.14+wvcus`.
- The actual executable contains Chromium version string `156.0.8077.0` at ASCII byte offset `199722959`; no browser or user profile was launched.
- Windows x64 archive SHA256 `7571a88781f9f26d7e145ee0251ac6b46e6c9a040a55bab0623bb9038015ae7b` matches the official Castlabs checksum list.
- npm retains a separate root Electron 44 package to satisfy Ghostery's stable-semver peer range `>11`. The application's Electron 45 package is nested in the desktop workspace. The source worktree therefore needs its `apps/desktop/node_modules` junction pointed at the fresh desktop workspace dependency directory; the root dependency junction alone still resolves Electron 44.
- Release channel remains `beta`, application version `0.1.57-beta.1`, release type `prerelease`. A future stable release must explicitly select an appropriate stable runtime and rebuild.

Current status: Chromium 156 dependency and runtime provisioned; integration compilation against the workspace Electron 45 types and signed beta packaging remain with the release owner. No tests or runtime launch performed.

## Initial Electron 44 preparation (superseded)

- Previous runtime: Castlabs Electron `37.10.3+wvcus`.
- Target: Castlabs Electron `44.5.1+wvcus`, stable release, Git commit `9b90904e4fe174122b99eca5b7b967aa79681cc6`.
- Dependency pin, npm lockfile and electron-builder `electronVersion` use the same target.
- Node.js `>=22.12.0` is required by the new Electron installer dependencies. The preparation host uses Node.js `24.16.0`.
- The lockfile was resolved using npm with `--package-lock-only --ignore-scripts`; no Electron binary was installed or launched and the shared 0.1.56 dependencies were not updated.
- npm can still rewrite its hidden `node_modules/.package-lock.json` metadata in lockfile-only mode. A later non-elevated refresh encountered EPERM on that shared metadata path; do not repeat npm operations through the shared dependency junction. The tracked lockfile already contains the resolved Electron 44 graph and matching root Node.js requirement.
- The application version remains 0.1.56 in this preparation branch until the release owner performs the coordinated 0.1.57 version update.

## Official release evidence

- [Castlabs stable release](https://github.com/castlabs/electron-releases/releases/tag/v44.5.1%2Bwvcus): `prerelease: false`; Windows x64 archive `electron-v44.5.1+wvcus-win32-x64.zip` is available (158,299,258 bytes).
- [Immutable package metadata](https://github.com/castlabs/electron-releases/blob/9b90904e4fe174122b99eca5b7b967aa79681cc6/package.json).
- [Castlabs Widevine/VMP documentation](https://github.com/castlabs/electron-releases/wiki).

The newest publication date in the releases list can belong to a maintenance branch. The selected target is the highest stable major available in the official release list; Electron 45 alpha is excluded. Upstream Electron releases without the matching Castlabs build are not substituted.

## Runtime and packaging handoff

Use a fresh dependency directory rather than the shared/frozen 0.1.56 `node_modules`. Run `npm ci` with Node.js 22.12 or newer, then explicitly provision the Electron binary with `npx --no install-electron`. Electron 44 no longer declares an npm postinstall script and can otherwise download the binary on first require. Provision and cache the exact archive before offline packaging.

The existing Castlabs download mirror and `afterSign` EVS/VMP hook are retained. Every new Windows package still needs Authenticode signing followed by production EVS/VMP signing and verification of that exact package. An upstream development VMP signature is not release acceptance.

This is a major runtime upgrade. Native `node-pty` compatibility, BrowserView/webview behavior, the custom app protocol and media/DRM must be assessed on the actual 0.1.57 package. The packaging configuration currently disables npm native rebuilding; retain that only if the shipped native prebuild works with the new runtime.

Castlabs 44 no longer supports Windows 32-bit x86. Windows x64 remains available. Persistent Widevine licenses are no longer supported; offline persistent DRM licenses must not be advertised. Linux release integration remains Vesper's responsibility.

## Fresh runtime provisioning

Provisioned separately at `E:\lastbrowser-v0157-dependencies-20261013` using the same tracked workspace manifests and lockfile:

- `npm ci --ignore-scripts --no-audit --no-fund --cache E:\npm-cache`: exit 0, 423 packages installed.
- `node node_modules\electron\install.js`: exit 0; cache directed to `E:\electron-cache`.
- `node_modules/electron/package.json` and `dist/version`: `44.5.1+wvcus`.
- Windows executable: 246,392,320 bytes, product version `44.5.1`.
- Download archive SHA256: `c7d51e4bf80de9ef18b3306b0d140059bb203510d3dfc88f3404049a12c90f89`, identical to the official Castlabs `SHASUMS256.txt` entry.
- Electron 44 typings, esbuild Windows x64 executable and node-pty Windows x64 prebuild are present. Presence does not prove native runtime compatibility.

The integration owner can point the 0.1.57 worktree's dependency junction to this fresh directory. The old 0.1.56 dependency tree is retained.

The worktree dependency junction now points to this fresh directory. Main
compilation against Electron 44 exposed nullable `hostWebContents` and the
removed `websql` cleanup category; both contracts were corrected and Main built
with Exit 0. Renderer typecheck and production build also passed against these
dependencies, including locally bundled Mermaid/KaTeX.

Status: Electron 44 installed and compiled against; signed package and runtime
acceptance remain pending. No runtime launch or full tests were performed.

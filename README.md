<div align="center">
  <img src="brand/assets/lastbrowser-logo.png" alt="Lastbrowser" width="560">

  <h1>Lastbrowser</h1>
  <p><strong>A Windows browser with Sidekick built into the browser workspace.</strong></p>
  <p>Browse the web, organize work in Spaces and profiles, and bring Sidekick alongside your tabs.</p>
  <p>
    <a href="https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.53">Download the published Windows release</a>
    · <a href="docs/release.md">Release and installation notes</a>
    · <a href="apps/desktop/README.md">Desktop architecture</a>
  </p>
</div>

---

## See the browser

These existing product images show the browser shell and integrated Sidekick interface.

| Browser workspace | Sidekick alongside a page |
|---|---|
| ![Lastbrowser browser workspace with sidebar and tabs](assets/store/store-screen-1-zen-sidebar.png) | ![Lastbrowser page with Sidekick chat in a split view](assets/store/store-screen-2-copilot-splitview.png) |

## What it includes

- **A desktop browser shell:** Electron tabs and web pages, with browser work grouped into Spaces and switchable browser profiles.
- **Sidekick in the workspace:** Open Sidekick beside the page for chat and browser-aware assistance.
- **Provider choice:** Configure supported AI providers and select models for Sidekick. Provider access may require a separately configured account or API key.
- **Local-first components:** The browser shell and Sidekick service run on the computer. Sidekick can use configured local model engines as well as remote providers; remote provider requests still go to those providers.

Feature availability depends on the selected mode, provider setup and current release. Read the release notes for the published build before installing.

## Install on Windows

1. Open the [published v0.1.53 release](https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.53).
2. Under **Assets**, download `Lastbrowser-0.1.53-x64-setup.exe` to install, or `Lastbrowser-0.1.53-x64-portable.exe` to run the portable build.
3. Review the release notes and asset details on that page. Newer test candidates may be drafts and are not public releases.

This links to the latest verified public stable release as of **11 October 2026**. Check [all releases](https://github.com/Loggableim/lastbrowser/releases) for later published versions.

## Getting started

- [Desktop app overview](apps/desktop/README.md)
- [Release flow and Windows artifacts](docs/release.md)
- [Developer guide: MCP and browser architecture](docs/MCP_DEVELOPER_GUIDE.md)
- [Built-in Sidekick service](services/sidekick/README.md)
- [Repository structure and contributor rules](AGENTS.md)

## Build from source

Requirements: Windows, Node.js 22, and Python 3.12 for the bundled Sidekick engine.

```powershell
git clone https://github.com/Loggableim/lastbrowser.git
cd lastbrowser
npm ci
npm run build
```

To launch the renderer and Electron app during UI development:

```powershell
npm run dev
npm --workspace apps/desktop run start:dev
```

For full source test and release checks, see the commands in [AGENTS.md](AGENTS.md). No historical test totals are pinned here.

## Project layout

- `apps/desktop` — Electron desktop browser shell and React renderer.
- `services/sidekick` — in-tree Python service, API, CLI and runtime.
- `brand` — Lastbrowser logos and interface assets.
- `docs` — architecture, development and release documentation.

## Licensing and attribution

The repository includes components with their own license and provenance records. Preserve those records when using or redistributing the source. Review the [Sidekick license](services/sidekick/LICENSE) and [xterm provenance](apps/desktop/src/renderer/vendor/xterm/PROVENANCE.md), along with any other component notices. This README makes no claim about ownership or relicensing of third-party components.

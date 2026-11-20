# Third-party inventory (A-022 draft)

**Status: preliminary metadata overview. Not complete, not legally reviewed, and not approved as a final product inventory.**

This overview references the version-pinned snapshot in [`docs/legal/drafts/third-party-inventory-20261011.json`](docs/legal/drafts/third-party-inventory-20261011.json). It was generated with `scripts/generate-third-party-license-inventory.py` from `package-lock.json`, `apps/desktop/scripts/requirements-runtime.txt`, and the hashed Python interpreter recorded in that snapshot.

The snapshot lists 488 npm third-party lockfile entries, 51 pinned desktop Python runtime packages, and two additional installed distributions: `pip==25.0.1` and the in-tree package `sidekick==0.8.84`. Sidekick’s distribution metadata has no license field in that snapshot; npm license fields come from lockfile metadata only.

The [Windows protected Spaces runtime inventory](docs/legal/windows-protected-spaces-runtime.md) records the additional binary dependencies staged for Windows x64, the notices retained with them, and the open corresponding-source and licensing work.

## Hermes Web UI provenance

The initial LastBrowser commit [`fe3a6f9a6d4e`](https://github.com/Loggableim/lastbrowser/commit/fe3a6f9a6d4e84911eac4c7663e79206a7289ffc) contained a [Hermes Web UI Contributors MIT license](https://github.com/Loggableim/lastbrowser/blob/fe3a6f9a6d4e84911eac4c7663e79206a7289ffc/LICENSE). The [verbatim license](docs/legal/notices/hermes-webui-mit.txt) has Git blob ID `b1beedc34d88c427425f732a3669e5b2ee6ee8b9`, identical to the checked license in the Hermes Web UI fork and public upstream.

The current `services/sidekick/web/` tree retains byte-identical copies of `api/background.py`, `api/command_stream.py`, `api/system_health.py`, `static/discord-panel.css`, `static/vendor/smd.min.js`, and `static/xterm.css` from the initial LastBrowser tree. All six also match Git blobs in the Hermes Web UI fork. `api/background.py` and `static/vendor/smd.min.js` match public upstream at the time of review. Vendored components retain their own notices. [Public Hermes Web UI upstream](https://github.com/nesquena/hermes-webui)

Hermes Portable's initial commit references a separate Web UI submodule. Its original gitlink `64dc5608abf58828daa7582f35afa6d860e1d05f` was unavailable through the remote content API. The exact upstream revision of the snapshot and the complete record of later modifications remain open.

## Sidekick audio and MCP in Windows MSIX 1.1.61.0

- The QA MSIX with SHA-256 `36123e87e13a810972582ca4fa40d7bba03023ce9cae85cdd38530cf876f9974` includes `services/sidekick/tools/neutts_samples/jo.wav` and `jo.txt`. The 575,990-byte audio file (SHA-256 `f789bc3799e64675a6324a978a3fffb0dd7850739d232cbe3d4bbbbc9973a314`) matches the sample at both the [historical Neuphonic commit](https://github.com/neuphonic/neutts/tree/27c2cf4f757a8c9d7a95713534848d9b30ab2d35/samples) and the [Hermes Agent import](https://github.com/NousResearch/hermes-agent/commit/d50e0711c25cbf95b74a1c41250615ace4603295). The transcript differs only in its line endings. LastBrowser retains the [exact Apache 2.0 repository license from that Neuphonic revision](docs/legal/notices/neutts-jo-apache-2.0.txt). This identifies the historical distribution of the reference files. The review did not find a sample-specific speaker release, and the current NeuTTS model terms have a separate scope. [Later Neuphonic license change](https://github.com/neuphonic/neutts/commit/0d57852b9513628761a4e26cbe73fb8502ba2a67)
- The same MSIX contains the Python package `mcp==1.26.0`, also pinned in the desktop runtime requirements and Sidekick project metadata. Its embedded `mcp-1.26.0.dist-info/licenses/LICENSE` is byte-identical to the [MIT text in the SDK's version tag](https://github.com/modelcontextprotocol/python-sdk/blob/v1.26.0/LICENSE).

Each dependency still requires verification of origin and license text. This document does not assert GPL compatibility or commercial sublicensing rights. See [`docs/legal/license-audit.md`](docs/legal/license-audit.md).

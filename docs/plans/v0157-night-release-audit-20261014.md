# Night release acceptance — 2026-10-14

User objective: Windows 0.1.57 debugged, tested and ready for release; Linux 0.1.56 published and integrated on the website. Public Windows 0.1.57 publication is not part of this authorization.

## Current source and ownership

Integration: `codex/v0157-simplify-ai-20261013`, base `1b4057c71a2ce1d8b0f86a6c079ed154bf9c2824` plus the preserved working-tree changes. Next private version: `0.1.57-beta.3`. Snapshot `output/v0157-final-candidate-r2-20261014` contains 4245 files, manifest SHA256 `b152c83c873cc838544ace0a66560818156fc8139431b4f813b37a254d630d48`. Actual per-file reconciliation confirmed no snapshot changes. A subsequent Windows-only password-login deadline fix and its seven regression tests require a renewed candidate; the backend runtime is unchanged. The Windows race fixture and this audit document are also post-snapshot changes. No final commit or signed beta.3 exists yet.

- Nord: release coordination, Main/App integration, website and Linux release verification.
- Anker: isolated Windows packaging, signing and read-only VM share handoff.
- Argus: VM interaction exclusively through Slack, no direct host control by Nord.
- Backend QA agent: in-tree Python source/tests.
- Renderer QA agent: renderer features, Dock-Raster and renderer tests.
- Startup/runtime QA agent: startup lifecycle and real local Electron smoke tests.
- Pixel website rework: separate preview scope; must preserve the released Linux integration.
- External repository/skill proposals: read-only except a separately authorized, narrowly reviewed optional workflow addition. No wholesale imports or runtime replacement.

## Windows acceptance matrix

| Requirement | Current proof / missing proof |
| --- | --- |
| Source version and updater channel | root/app/lock aligned to beta.3; stable default and explicit beta opt-in implemented; final metadata/package verification pending |
| Electron/Chromium | current dependency target Castlabs45 Alpha/Chromium156; signed beta.2 exists, final beta.3 runtime proof pending |
| First-run pages | search, optional migration, browser import, dock, AI choice/provider, first Space implemented; state and flow tests passed; installed-app proof pending |
| First Space and companion | Space always, personality only with AI; scoped save and imported-tab retention; periodic-refresh race corrected; VM persistence proof pending |
| Startup | three rounded Rainbow styles, five audio themes, song clocks, one-time8%Welcome;51 targeted tests passed; audible/visual package proof pending |
| Dock-Raster home | implemented with real content, persisted ordering/size/dock per profile+Space; pure layout tests and typecheck passed; DOM/visual probe pending |
| Chat controls | hover/focus actions, inline confirmation, multi-selection and scoped APIs implemented; VM deletion/Updatesmissing regression still pending |
| Quickchat | dedicated short prompt, steering, editable composer, fastest defaults/favorite, no emoji, ResetChat; offline contracts pass; real provider latency/streaming acceptance pending |
| Models and settings | tested/beta provider split, OllamaCloud deployment classification, persona persistence and multi-page controls implemented; targeted renderer tests pass |
| Extension Hub and optional tools | redesigned; Gmail/Discord/Tasks/Kanban/Terminal default-off with beta labels where appropriate; focused contracts pass |
| Memory and Insights | consent/default-off policies, actual provider ledger and source provenance tested; missing/stale profile projection bug fixed; full Python run pending |
| Browser fixes | import, default-browser detection, Gmail main-frame navigation, research sidebar and topbar fixes implemented; final package/VM acceptance pending |
| Adblock | filter freshness and session binding covered by unit tests; YouTube and turtlecute checks assigned to Argus |
| Tray icon | packaged brand-path resolution and non-empty fallback fixed; path regression test passed; final Windows visual proof pending |
| What's New | beta.3 notes added in8UIlanguages; final target-version/package proof pending |
| Full desktop tests | b152 complete run:263files,2365tests PASS,0FAIL,0SKIP; actual secret gate read2939textfiles with0offenders. Later login fix: entire sidekick-api suite56PASS, Main buildPASS. Renewed final candidate full run pending |
| Full Python tests |403testfiles/4014cases; r3:3900PASS/113SKIP/1FAIL solely Windows race fixture accepting safe explicit rejection; corrected group17PASS/8platformSKIP. Product source unchanged; complete r4 currently running. Separate real local MCP SDK handshake/discovery/echo group14PASS,noSKIP. Optional external/platform skips are not provider/package proof |
| Store/source preflight | final full preflight39passed/0failed/2warnings, no Quick flag; screenshot-content warning and no final package supplied; not Store certification or package signature proof |
| Final build/signature | b152 Main/Preload/Renderer buildPASS; ASAR91bf5d5d0e8399a067b84e7105e1d929949243ea1827d49fd663076346da63b7; all272distfiles and179native-sidecar paths/hashes verified. Actual ASAR node-pty1.1.0 on Electron45/ABI150 spawned cmd.exe, received expected marker and exit0. Bundled Python3.12.10 compiled all1120staged Python sources and imported MCP1.26.0. Signing held before it began for login fix; renewed build/ASAR/signatures required |
| VM acceptance | Argus beta.2 installation completed; shortcuts currently show no window, cause not established. Follow-up Slack1791936950.790729 asks actual EXE/process/log diagnosis. Final beta.3 acceptance required. VM exclusively Argus through Slack |
| Local model store installation | NOT DELIVERED: curated40-model catalogue, details, hardware scan and conservative filtering exist, but Main/backend hardcoded denial blocks install/inference. Curated entries have no qualified artifact/license digest, no llama.cpp runtime is packaged. Existing CPU prototype is not a usable catalogue-wide workflow. Do not claim the requested install-and-run feature complete or bypass its qualification guards |

## Linux 0.1.56 completed distribution work

Exact original artifacts downloaded from Vesper and locally verified, then added to existing public GitHub release `v0.1.56` without replacing Windows assets:

- tar.gz214261159bytes, SHA256`fe34e0d6ccf03d889c7eb2f55cd56ff7b52d1653f21ba7c82b6bc9234606d54e`.
- AppImage214706176bytes, SHA256`9fc61042398ee80c28046978824377716c712ff597cdad4fb22e9bca95847d8a`.
- Original SHA256SUMS197bytes, SHA256`2a6a2255787c581b6a63487833ae09ce376e2371e1cd87b9c210c0b52a10b921`.
- Detached signature228bytes, SHA256`3f7389290fc85c78eef8633a89653f2bbd1204dfa7b1f4dc310e3d25dae09d88`.
- Public key839bytes, SHA256`4e12d0419c123904e26f37a7ee276b6abb3cd3e94e891359e102544122b0211b`.
- Independent local GPG verify exit0, signing subkey`676481D83532BBC76F3E82F83FE43AD08D08AEE7`, primary`0546B4B0840C0A86D62B54A79DC2502686684B33`.

Production website: `https://470cc5cc.lastbrowser-website.pages.dev`, project`lastbrowser-website`, branch`main`; seven localized Linux preview download sections, explicit signature/key/fingerprint links, FUSE host requirements and current0.1.56 changelog entries. Preserved counter and roadmap voting functions; final live HTTP/JSON verification receipt is `output/linux-v0156-signing-20261014/live-website-final-verification.json`. All14 download/changelog pages returned HTTP200 with the expected release content. Counter returned ready120; votesGET succeeded without writing a vote. Versioned live public-key bytes were hash-verified. The live German Linux card was also visually checked in the in-app browser; AppImage/archive and all three verification links are visible.

Stage: `output/linux-site-release-20261014`; deploy working directory/config: `output/linux-website-controller-20261014`. Base is the previous actual production stage `E:/lastbrowser-v0156-site-current-20261013/deploy-stage-20261013`, not the dirty primary checkout. An initial deploy omitted function discovery from the new CWD; live content-type checks caught this and the corrected deploy compiled/uploaded the original Functions bundle. Final endpoints return JSON.

Vesper subsequently tested the published tar.gz and AppImage on Ubuntu24.04.5 as uid1000, fresh profiles, without `--no-sandbox`. Both reached ready-to-show, React committed and example.com HTTP200; Zygote children had Seccomp2. AppImage initially failed without host `libfuse.so.2` and `fusermount`; after installing the host packages it mounted and started. GPU initialization aborted on that host. No actual chat or DRM playback was performed; Preview remains appropriate. These are Vesper's package-runtime receipts, not an independent Windows-host Linux execution.

Cid explicitly confirmed Vesper may establish signing himself. The signing ownership and protected backup/recovery follow-up were communicated in Slack at `1791931791.594039`; no private-key or credential transfer is needed. Vesper reports a second protected copy and revocation certificate outside Git, directories700/files600; disposable-keyring restore imported successfully, exit0. Both copies still reside on the same host, so protection against host loss is not achieved and remains a future custody follow-up.

## Local Electron smoke receipt

All five requested serial smoke suites passed outside the sandbox against actual Castlabs45: boot1, Zen geometry1, omnibox17, settings1, chatux1 (21 tests total). Receipt: `output/renderer-smoke-validation-20261014/accepted-smoke-results.json`. Three harness files were corrected without changing production behavior or assertions. This is local renderer proof, not final signed-package or VM acceptance.

## Completion rule

Do not call Windows ready based on the targeted tests or beta.2 signature. Gather final source freeze, production build, full test outcomes, signed final artifacts with hashes, and Argus result for those exact bytes. Findings require fixes and a new versioned candidate where appropriate. Keep the user goal active until the original objective is proven.

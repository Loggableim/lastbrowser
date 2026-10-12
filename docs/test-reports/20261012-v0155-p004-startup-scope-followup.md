# v0.1.55 P004 startup and scope follow-up

Date: 2026-10-12. This report follows the targeted VM report `5bf00692733d98f065077bed6a7034424b882018` for the `151df72c` candidate. The existing VM owner remains the only VM operator. No profile reset, provider inference request, signing, or release publication was performed.

## Prior VM evidence

The exact `151df72c` setup and extracted ASAR pins passed. The existing VM owner reported that the first window remained entirely black until Ctrl+R, followed by three saved-Space scope rejections after reload. Two same-Space picker open/close cycles retained the loaded catalog and MiMo selection. Those point-in-time captures do not prove the absence of sub-frame flicker. No new MiMo request was sent; the visible READY/no-response exchange belonged to the older `ca564a91` conversation. Overall targeted result remains FAIL because of first-start rendering and scope-rejection symptoms. See report commit `5bf00692733d98f065077bed6a7034424b882018`.

## Source change

Build/source commit: `67bf77c4925e0d0e1e5563cc8880fc89ce8fbc94`, branch `codex/p004-v0155-diagnosis-20261012`.

- `NativeChatMain` performed an additional `GET /api/models` without `scopeSelection` while loading the native chat panel. It now binds that request to the active browser profile, Space path, and resolved backend profile when available. The earlier startup caller in `App.tsx` was already scoped in `151df72c`.
- The main window now records ordered, elapsed-time renderer lifecycle events: `did-start-loading`, `dom-ready`, `did-finish-load`, `did-stop-loading`, `ready-to-show`, main-frame load failure, renderer exit, and unresponsive/responsive transitions. Records contain no page URL, request body, session, or user data. This is diagnostic instrumentation for the next authorized start; it does not claim the black first-render cause is fixed.
- No MiMo streaming/provider code or renderer boot sequence was changed because the VM evidence does not correlate the MiMo symptom or black window to a specific source failure.

Self-review checked that native chat uses the same profile/Space scope shape as startup discovery, the null-path default Space remains representable, and renderer diagnostics omit URLs/content. No independent human review was obtained.

## Local read-only evidence

- Before the controlled start probe, the installed entry reported app version `0.1.55`; installed `resources/app.asar` matched the prior `151df72c` candidate SHA-256 `f515411f8034f270b91a17d9303cdf611481f4a1253e89d29659e708e9593f3a`. The installed executable was present. No Lastbrowser process/window was present at that snapshot.
- No matching Windows Application Error/WER, AppLocker, Code Integrity, or Defender event, Lastbrowser crash dump, or post-install app log was found. Existing profile/runtime timestamps predated the install. No private file content was copied or posted.
- One launch of that already-installed executable with a new temporary `--user-data-dir` created a responsive main process with a `Lastbrowser` window handle/title and a bundled Python child. The existing profile was not used. The local Computer Use interface exposed no native app windows for screenshot capture, so this proves process/window creation only, not visible rendering. The user-reported ordinary-profile start failure remains uncorrelated to a crash cause.

## User screenshot follow-up

The user clarified that the screenshot shows the normal locked-browser gate before they entered their password; session protection was not hanging. This captured instance has a visible renderer and an expected password prompt, but the screenshot is not bound to a candidate hash or profile and does not prove unlock success. No password was entered. Separately, the user reported that typing `las` in Windows Search no longer suggests Lastbrowser. Read-only checks found `C:\Users\logga\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\LastBrowser.lnk`, whose target `C:\Users\logga\AppData\Local\Programs\Lastbrowser\Lastbrowser.exe` exists, and the current-user uninstall registration `LastBrowser 0.1.55`. These confirm shortcut and uninstall registration presence but do not explain why Windows Search is not showing the app suggestion.

## Gates

- Focused scope checks: 16 tests passed.
- `npm test`: 239 files, 2,170 tests passed.
- `npm run verify:store`: 39 PASS, 2 WARN, 0 FAIL. Warnings remain provisional screenshot content/localization and no final signed package.
- `npm --workspace apps/desktop run build`: PASS; existing large-renderer-chunk advisory.
- `python -m compileall -q services/sidekick`: PASS.
- `git diff --check`: PASS.

## New unsigned private test candidate

Built from `67bf77c4925e0d0e1e5563cc8880fc89ce8fbc94`, version `0.1.55`, using the offline preview packager. The preview receipt reports 10,235 resources, `blocked: []`, `unsigned: true`, `published: false`, and `fullAcceptanceVerified: false`. The receipt does not bind outer executable digests. Both executables are `NotSigned` by design and only uploaded to the existing private draft; the draft is still unpublished.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Setup | 167,157,117 | `6bc3d5a66ea9681aeae9b3e9b70d7e4c2fb66fe4e68a70baba1eeb2a6e08217a` |
| Portable | 166,802,961 | `1128ffbbbd964091b60c0a855f4dd5bf8e5a481626acc097b3f2ffdc14041b04` |
| `resources/app.asar` | 73,126,279 | `03ae9df5daea4cb408dd4da46bb226a038b881e97c6a48f29cbd1338a82b67df` |
| Resource manifest | 1,452,591 | `d4d3700de50f48b4293444e06281b8a47cf220f98849319eaedbf01962b3ea17` |
| Preview receipt | 184 | `bedd7af35bcfaa78de5d39cf561c594f3c1b8d7eff0158e882579066978c5686` |

The remote GitHub draft digest and size match all four uploaded artifacts. The existing VM owner received the exact setup/portable links, hashes, and a limited start/scope check in the P004 thread. No installation or VM run of this `67bf77c4` candidate is verified yet.

## Open results

- The scope change is source/gate verified; the next VM run must check whether the three rejections stop and identify any remaining caller from sanitized logs.
- The prior VM's black first-start symptom remains a separate report; the newer user screenshot shows a visible, locked startup gate but is not bound to that VM candidate. No source-level black-renderer cause is established. New lifecycle traces are intended to distinguish load failure, renderer exit/unresponsiveness, and first-frame completion in the next run.
- Password unlock success and the screenshot's exact installed build/profile are not verified. The Windows Search suggestion issue remains unresolved despite the valid Start Menu shortcut and uninstall registration; no Windows indexing or settings changes were made.
- MiMo inference/no-response, full QuickChat and Standardchat acceptance, Stop, OpenCode live login/inference, and the rest of P004 remain not verified. No public release or VM PASS is claimed.

# v0.1.56 private preview: wallpaper and VM handoff (12 October 2026)

## Exact candidate

- PR: https://github.com/Loggableim/lastbrowser/pull/72
- Package source commit: `d14cf6705dcdeb4a2c65c6acba9af0f321205538` (includes current v0.1.55 integration commit `04593080169462375cfa6209bcb70e148ad242d8` and v0.1.56 start page/chat changes). This source commit is immutable; later documentation commits do not alter the packaged bytes.
- Windows x64 Portable: `Lastbrowser-0.1.56-UNSIGNED-VMTEST-d14cf670-x64-portable.exe`, 170,691,368 bytes, SHA-256 `ac5f50d00c44d866b1b756ffb437dbc0b9a298fd0831d2445993024252c5f8a1`.
- Packaged `app.asar`: 75,234,230 bytes, SHA-256 `b24b721a1f04616d096e73fcbae63b971dd86308ba87ffa09b0fe7b92e8be8ca`. Its 7,339-path manifest and package.json fingerprint are in [the receipt](20261012-v0156-d14cf670-package-receipt.json).
- Variant: `offline-test`, version `0.1.56`; Authenticode `NotSigned`. The candidate is a private, unsigned VM test artifact. There is no v0.1.56 public release or Store acceptance.

## Source and local package evidence

- `npm test`: 243 files / 2,193 tests passed.
- `npm run verify:store`: 39 PASS / 2 WARN / 0 FAIL. Warnings are provisional screenshot content and absent signed final package.
- `npm --workspace apps/desktop run build`: passed.
- `python -m compileall -q services/sidekick`: passed.
- Visible Portable launch in a new isolated profile (`--lastbrowser-isolated-profile`, CDP port 9430) reached the start page. Six bundled gallery images loaded from `app://bundle`, with no network source for those assets. Selecting Nebelwald persisted by profile/workspace key. Keyboard adjustment changed dimming from 62 to 63 percent; Escape closed the overlay. [Gallery screenshot](assets/v0156-wallpaper-gallery-d14cf670.png), [selected screenshot](assets/v0156-wallpaper-selected-d14cf670.png).
- This is local packaged evidence. It does not establish VM, human visual, account/provider, signed, release, or Store acceptance.
- The five imported reference wallpaper JPEGs have no confirmed redistribution rights in the reference inventory. Keep this candidate private and resolve image provenance before any public release.

## ARGUS VM handoff matrix

Use only the downloadable private Draft assets whose filename contains `d14cf670`; check the Portable byte length and SHA-256 above before launching. Start in a fresh VM user profile. Preserve the v0.1.55 baseline and any prior P004 findings as separate evidence.

| Area | VM check | Evidence to return |
| --- | --- | --- |
| Normal/Zen and window sizes | Start page and gallery at default, compact, and maximized window sizes; switch Zen mode; verify left dock stays below top menu and gallery fits. | Screenshots and package hash. |
| Wallpaper | Preview all six local images; select one; adjust dim/blur; close and reopen the overlay; restart the app and confirm the same profile retains selection. | Visible image, persisted choice, errors if any. |
| Chatbox and draft/model | Enter normal and Quickchat surfaces; exercise draft preservation, model selection and no-model state; verify disabled actions explain unavailable model. | Screenshots and exact account/provider state. |
| Settings and keyboard | Open provider settings from no-model hint; test keyboard navigation, More, Reasoning, theme changes. | Steps and observed result. |
| Send/Stop/error | In an authorized configured test account, exercise Send, Stop, and a controlled error; verify the 0.1.55 chat-stop baseline from `04593080` and the v0.1.56 chat UX. | Exact provider/account, action, result, and logs. No live claim without execution. |

Do not infer a VM pass from this handoff. No second VM controller, signing, merge, Store submission, or public release is requested by this report.

## VM intake status (12 October 2026, 13:49 CEST)

ARGUS reported that Edge stopped the unsigned Draft Portable download because of low download reputation. The executable was not saved, hashed, or started on the VM; the matrix above has no v0.1.56 VM runtime result. The file identity and authenticated Draft receipt retrieval above were checked on the build host only. The same exact Portable remains available in the private Draft and in the build-host worktree under `output/dist-preview-2026-10-12T11-28-09-017Z-5e17cdb9/Lastbrowser-0.1.56-x64-portable.exe`; this local path is not a VM download. The pending action is an approved transfer/security review for that exact 170,691,368-byte file with SHA-256 `ac5f50d00c44d866b1b756ffb437dbc0b9a298fd0831d2445993024252c5f8a1`, followed by ARGUS's own hash and launch checks. No reputation warning or policy should be bypassed.

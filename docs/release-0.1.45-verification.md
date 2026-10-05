# Lastbrowser 0.1.45 release verification

Published 2026-10-05 08:57:03 UTC: https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.45

The packaged product source is `efe98a1f3414c717fc45e29b94f21eb727c102d3`, including integration commit `0f06e1226e2c0ff66f7cc56d2a2fdd04b2f2a9ae`. The release branch preserves the independently advanced shared branch without a force-push.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Lastbrowser-0.1.45-x64-setup.exe | 175963336 | ccf1435947a415fe5a97bb5d908edb79a519106877128c3e4d5f1b210236bc96 |
| Lastbrowser-0.1.45-x64-portable.exe | 175601280 | 8078cf5481cf9fa371fdb6da79d39b85741fe97fc15ed30d4fe30b7d37b6a577 |

Both artifacts have valid SHA-256 Authenticode signatures and RFC3161 timestamps. GitHub's uploaded asset digests match the local files. Castlabs Widevine VMP signing and package verification succeeded after Authenticode signing. All 152 native files checked in the payload plus installer passed the signature verifier.

Package release gate: 1,727 desktop tests passed; desktop Main/Renderer build and Python syntax check exited zero; Store preflight had zero failures and two warnings. The subsequent final website/probe test snapshot passed 1,728 desktop tests, including published download consistency. Five targeted native-bundle tests passed after regenerating signed-runtime pins. Signed runtime staging preserved the original Microsoft CRT signatures and bytes. The user confirmed Visual Studio Community use as an individual developer; see `root-local-ai-runtime-licensing-followup.md` for the evidence boundary.

Actual signed application start passed in an isolated temporary profile (`output/direct-exe-4ea9b15a-6b61-48fe-bce8-b23a987eb06a.json`). Actual signed portable start passed with isolated TEMP/APPDATA, live app:// renderer, shell, Sidekick and WebUI ready, exit zero and cleanup (`output/portable-exe-3d4dc81b-473d-4279-9b69-044c1d07009e.json`). Portable exposed its renderer after 113.6 seconds on this host. An earlier 90-second test interrupted its incomplete extraction/copy phase and is retained as a failed historical report.

Update metadata and blockmap were refreshed from the final signed artifacts. The publicly downloaded `latest.yml` matches the local metadata exactly.

Open acceptance remains explicit: clean-Windows installation/update/uninstallation, Store certification, paid-provider Teamwork quality, and the experimental small router's failed independent quality holdout. Start/help and app-local CRT loading do not prove model inference or clean-Windows dependency closure. This release does not mark the full browser goal complete.

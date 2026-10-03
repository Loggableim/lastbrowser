# Verified Windows release 0.1.44

Published on 2026-10-03: https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.44

Built source: `86d7090b43f4f08baa1678074d9a98c1be8e66c1`, merged by PR #7 (`3fa86073e212e25287b71f110cf68654dcffebac`). The release did not incorporate uncommitted work from the shared checkout or the separate local-AI onboarding project.

## Signing and bytes

The unpacked browser, setup, and portable each passed Windows SignTool `/pa` verification and `Get-AuthenticodeSignature` with status `Valid`, certificate `1AD3C19A7338BBC3FFE4D62853411AD73E139857`, and an RFC3161 timestamp. Castlabs `verify-pkg` independently accepted the browser's streaming VMP signature. Metadata was regenerated after signing, and all four assets were downloaded from the GitHub release and compared to the original SHA-256 values.

| Asset | SHA-256 |
|---|---|
| Lastbrowser-0.1.44-x64-setup.exe | `5E58174C72ED7AAEC7FE8D1ACA4FE85228C1606E7B56A70883227D700E18A5F0` |
| Lastbrowser-0.1.44-x64-portable.exe | `9D1F45C0CFF9A3E9118A98E3B6E14CED4831D4FFD59A1724D32777C39B761DF3` |
| Lastbrowser-0.1.44-x64-setup.exe.blockmap | `870A26CB53E8154DA9971D2BFB3F584EAF2CC4C7CBEE1BF8EBC6B8A176BCB127` |
| latest.yml | `0670C64509220C950F0084603FD4E71332865CB3F1B4C2422629A2CA96DFE46D` |

## Runtime and update verification

- Desktop release checks: 146 suites / 1279 tests; Store source preflight: 27 checks; TypeScript/Vite build and Python compileall passed.
- Backend suite: 2640 passed / 107 skipped / one Windows UIA controlled-fixture postcondition failed. The exact failed test passed on targeted rerun (1 passed). No Windows executor code was changed for this release.
- Python 3.12 runtime was rebuilt offline from 66 exact dependency pins and verified local wheel hashes, including MCP 1.26.0. The cache uses schema 8 and the lock digest.
- The fully packaged application started with an isolated profile and its actual bundled backend returned healthy status.
- Real encrypted playback of the official Shaka Sintel Widevine asset used `com.widevine.alpha`; the recorded playback reached 3.060273 seconds and 78 video frames.
- The real `NsisUpdater`, with Lastbrowser's Node HTTP adaptation and update controller, automatically downloaded the final signed 0.1.44 setup. A tampered copy with an otherwise matching feed SHA-512 was rejected with `ERR_UPDATER_INVALID_SIGNATURE`.
- The same updater retrieved the public GitHub feed and automatically downloaded the published signed setup; downloaded bytes matched the local setup hash. No production installer was executed by that download test.
- The production NSIS options had already passed isolated one-click install, automatic EXE launch, silent upgrade relaunch with `--updated`, and profile-marker preservation using unsigned miniature fixture versions. This fixture is not proof of a full installed production upgrade with restored tabs.

These checks establish signing, public update downloads and Widevine test playback. They do not establish Microsoft Store certification, every commercial streaming provider, or a full production installation upgrade. Store-packaged builds use Store updates; portable builds require replacement with the newer portable file.

## Website

The website update preserves historical release hashes, updates current download links and hashes in all seven locales, adds seven translated changelog entries and an RSS item, and points the download proxy to the published 0.1.44 assets. Website-branch checks passed: 71 suites / 627 tests, 27 Store preflight checks, desktop build and Python compileall. Local desktop and Japanese mobile views were inspected in a real browser.

# P004/0.1.56 cb69bb92 official download attempt

**Result: BLOCKED before receipt; no VM runtime test performed.**

- Checked at: 2026-10-12 16:30 UTC
- Candidate: private PR #72 portable, source `cb69bb928414751c0b3892f7e50daff9a231b853`
- Official asset attempted once in the existing Edge/GitHub session: [Lastbrowser-0.1.56-UNSIGNED-VMTEST-cb69bb92-x64-portable.exe](https://github.com/Loggableim/lastbrowser/releases/download/untagged-db01e8964de38692c212/Lastbrowser-0.1.56-UNSIGNED-VMTEST-cb69bb92-x64-portable.exe)
- Expected package: 170,691,960 bytes; SHA-256 `847937799fbcefd51f8aa8bc289c736139dc007a20a5ecb1301431ef0f35ae3b`.
- Browser result: `net::ERR_BLOCKED_BY_CLIENT`.
- Expected file is not present in `C:\Users\lbr-eval\Downloads`; no local bytes were available to hash. Therefore package identity, Authenticode state, embedded ASAR hash, application version, and VM runtime behavior remain **not verified**.
- No warning was suppressed, no alternate download/source was used, and no VM/security configuration was changed. No VM was started or modified.

The assigned P004 matrix remains pending: start/first screen; standard chat and Quickchat with already-connected GPT/MiMo models; follow-up, model/space switching, stop/resend and history after restart; chatbox/header; boot/fallback; wallpaper and browser smoke checks.

**Required next action:** provide an authorized regular transfer route and exact target path on the existing Argus tester host/guest, or resolve the official download block through the normal security process. After receipt, record actual bytes, SHA-256, version, ASAR hash and signature status before running the matrix.

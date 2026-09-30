# Installer Performance Audit — 2026-09-30

## Evidence collected

- Existing setup binaries: v0.1.35 **278.3 MB**, v0.1.36 **278.9 MB**, v0.1.37 **157.8 MB**, v0.1.38 **157.7 MB**.
- Fresh local v0.1.39 preview: setup **157,738,715 bytes** (~150.5 MiB), portable **157,384,498 bytes** (~150.1 MiB).
- The unpacked v0.1.39 package contains **543.9 MiB / 9,481 files**. Largest measured parts: `Lastbrowser.exe` 195.6 MiB; Python runtime 104.6 MiB / 7,450 files; `app.asar` 57.9 MiB; Sidekick resources 36.9 MiB; Chromium locales 42.5 MiB.
- Packaging ran electron-builder with 7-Zip maximum compression (`-mx=9 -md=1m -ms=off`). A five-second sample showed 11.23 CPU-seconds and 15.7 MiB archive growth. This is evidence of CPU-heavy packaging, not slow installation.
- Castlabs VMP signing uploaded 195.6 MB in **89.1 seconds** at an average **2.2 MB/s**. The VMP signature was successfully verified.
- The full local packaging run took **4 minutes 49 seconds** from electron-builder start to completion (18:28:45–18:33:34 local time). After packaging, the setup and portable artifacts were signed with the available Certum certificate and each passed `signtool verify /pa /v` with a DigiCert timestamp. The packaged `Lastbrowser.exe` passed Castlabs VMP verification; signed artifact hashes and the differential blockmap were regenerated and validated.
- Current `extraResources` excludes bytecode, caches, test site-packages, and Sidekick build output, but the packaged Sidekick tree still includes about **2.5 MiB of tests (243 files)** and **1.7 MiB of docs**.

## Interpretation

The older 278 MB installer size regression was reduced in v0.1.37 and is not present in the current preview. A large expanded Python runtime and thousands of files are plausible contributors to a long install, potentially compounded by endpoint protection. Those causes remain hypotheses: no timed, clean installer run or Defender A/B measurement was performed.

The build duration also includes a measured 89-second Castlabs upload. This can explain part of the time spent creating a package, but does not explain how long the installed wizard takes on a user's machine.

## Safe follow-up

1. Measure an install from process start to completion without changing the payload; record CPU, disk activity, and installed directory size.
2. Compare 7-Zip compression levels for packaging time and artifact size. Do not assume a smaller level makes installation faster.
3. Check whether Sidekick tests/docs can be excluded from the shipped resources, then run packaged-runtime import, doctor, and provider tests before keeping that change.
4. Keep the self-contained Python runtime and Castlabs/WVCUS binaries unless equivalent offline runtime and security behavior is verified.

Do not interpret this report as proof of a slow installation root cause; only packaging measurements and payload size are measured here.

The fresh signed preview is in `apps/desktop/release/release-preview-0.1.39-20260930`. No installer was launched, so user-visible install duration and post-install browser behavior remain unverified.

# Actual Main restart acceptance, 2026-10-05

Root ran `node scripts/probe-full-app-entry.cjs --main-crash` against a private source build using the real Electron Main, preload, renderer and bundled Python backend. The controlled provider and browser page were loopback fixtures; all homes and state were independent temporary test directories. No ordinary user profile or external provider was used.

Final run: exit **0**. Raw report: `output/full-app-entry-c0e0c0ab-9e85-42a7-94e9-33ed176f940e.json`.

- The first genuine Main was terminated while its independent task was active.
- No captured owned children remained after the crash observation.
- A new genuine Main reopened the same test state. The original run became `interrupted` with the same target session and exactly one dispatch.
- The controlled delegated request count remained **one** after restart and renderer reload: no automatic SDK replay.
- Five total controlled provider calls, no native dialogs, no hardware-helper subprocess, one renderer reload, zero remaining owned children after normal exit, and successful temporary-profile cleanup.

Earlier attempts are retained as failures. One exposed a new Teamwork Japanese catalog initialization error; its owner corrected the merge. Another captured unfinished concurrent JSX and did not reach runtime. The harness now retains the first process's terminal report and renderer exception stack instead of reducing these failures to a missing-handoff message.

This is actual source-app evidence for Main restart/recovery, not a signed package, installer, update, clean-Windows or arbitrary external-provider acceptance. The raw report contains source hashes and exact run/scope/session identity.

# P004 first-frame fallback after the 1a37f9d1 VM failure

Date: 2026-10-12 (Europe/Vienna). VM evidence/build: PR #70 head `1a37f9d12121be0ced83097e2d0ffb5543e7c162`. The source branch is rebased onto the subsequent PR #70 head `95ae28e066ebebad54e8fbeb72894842b60c8d68`, which contains separate chat Stop fixes. This change addresses the empty first-window presentation; it does not claim a measured improvement in backend or React startup time.

## VM evidence and diagnosis boundary

The sole VM owner verified the private unsigned 0.1.55 package, installed ASAR, and all 10,237 resources for `1a37f9d1`. The first captured 1440×920 client area is entirely near `#121212` before Ctrl+R. The Main trace recorded `did-start-loading` at 19 ms, `dom-ready` at 992 ms, `did-finish-load` at 993 ms, and `did-stop-loading` at 994 ms. The process and backend remained responsive. `ready-to-show` was recorded at 48,598 ms; the exact ordering of that event against the screenshot and Ctrl+R is not in the report. Ctrl+R recovered the actual chat UI. The package remains **NOT ACCEPTED**. Source: VM report commit `60b4a75e585b66f086e389b8bdb1ceaf271ccbd0`, `docs/test-reports/2026-10-11-p004-1a37f9d1-vm-acceptance.md` in the tester branch.

The prior `index.html` had an empty `#root` and no visible content until the external module loaded and React committed. Thus a delayed or failed module/React startup could leave a loaded Main document with no product UI. The VM events establish that the main document loaded, but do **not** establish whether its JS/CSS subresources loaded, when React committed, or whether Chromium presented an already built frame. No GPU, cache, auth, or provider cause is asserted.

## Source change

- `index.html` now contains a small inline, accessible startup fallback before the module script. It needs no backend or renderer JavaScript. The fallback has its own inline background and remains visible if the module never executes.
- The renderer removes the fallback on the frame after the React root commits. A single fixed console marker lets Main log `react-root-committed` in the existing `[lastbrowser startup-renderer]` sequence, without URLs, prompts, profiles, or console payloads.
- There is no automatic reload, profile mutation, authentication bypass, provider request, or change to chat/Stop/catalog behavior. The fallback cannot prove or correct the underlying 48-second delay. It prevents an empty HTML shell from being the only visible state while renderer startup is incomplete.

## Verification

The targeted real-Electron smoke first loads the actual source `index.html` with its module deliberately unavailable. It verifies the fallback covers the window, has a status role, and paints visible text in a captured frame while `#root` is empty. It then loads a small React fixture using the actual `BootCommitted` component, and verifies the fallback disappears and the commit marker is emitted once. This is controlled source/runtime evidence; the new source has not been packaged or retested on the VM.

Final source gates on the rebased branch: `npm test` 242/242 files and 2,181/2,181 tests PASS; desktop build PASS; Python compileall PASS; Store preflight 39 PASS / 2 WARN / 0 FAIL; `git diff --check` PASS. The targeted real-Electron fallback smoke also passed within the full suite.

An earlier isolated-worktree run failed only in the existing ChatUX Electron smoke harness. Its temporary file load/renderer crashed while the local Electron package directory was incomplete. Copying the full matching `37.10.3+wvcus` test runtime from the clean integration worktree into this worktree's ignored `node_modules` made the focused harness and subsequent full suite pass. No ChatUX test or product source was changed for that recovery.

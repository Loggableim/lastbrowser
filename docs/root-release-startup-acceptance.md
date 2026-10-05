# Windows First-Start Release Acceptance

## Evidence reviewed

The preview at `output/feature-preview-2026-10-04T22-41-38-741Z-27485e87` is a local unsigned `win-unpacked` directory build, not an installer. Its receipt says `unsigned: true`, `published: false`, and `fullAcceptanceVerified: false`.

The controlled direct-EXE report `output/direct-exe-15b3f46e-b95e-44a2-8d73-c5c40e1d4d68.json` records a passing run with a private temporary profile. The real app shell and setup view rendered; Sidekick and WebUI health reported ready, and the bundled runtime directory was inside that private profile. The process exited with code 0 and the private test profile was cleaned. This smoke does not establish first launch through an installer or an ordinary non-elevated user token. The probe starts the app with `--remote-debugging-port` and `--remote-debugging-address=127.0.0.1` for its controlled renderer inspection.

The first visible-start stderr contains two access-denied events:

- Chromium stopped at `mojo\public\cpp\platform\platform_channel.cc:89` with Win32 `0x5` (Access Denied), producing the recorded `0x80000003` application exception.
- Its DevTools HTTP server could not bind a socket (`0x271D`).

The DevTools bind failure is consistent with the diagnostic probe environment: the packaged EXE smoke intentionally requests a loopback debugging port. The product enables CDP only when explicitly opted in or when a port is explicitly supplied; the default is off (`apps/desktop/src/main/cdp.ts`, `apps/desktop/src/main/main.ts`). The visible retry log contains no matching Mojo fatal or DevTools-bind error and the documented window responded with the Sidekick health endpoint ready.

This separates a concrete diagnostic-launch restriction from the consumer launch path, but it does not fully explain the Mojo `0x5`. The launch command and Windows token for both visible attempts were not recorded. “Elevated retry” in the handoff therefore cannot be interpreted as proof that Windows Administrator rights are needed—or proof that the successful process had a standard user token. No product defect has been reproduced in a normal installed launch, and no release-level normal-user acceptance is established.

## Safe final release check

Run this once against the final installer or installed package after the source/build is frozen:

1. Use a disposable standard Windows test account or an already available non-admin test account, with a fresh private profile and no real user data. Record the EXE/package SHA-256, account class, process elevation state, command line, and profile root. Launch from the normal per-user shortcut without `Run as administrator`.
2. Confirm the process has a non-elevated token, and that neither command line nor environment enables `--no-sandbox`, `LASTBROWSER_ENABLE_CDP`, `LASTBROWSER_CDP_PORT`, or `CDP_PORT`. Do not attach a DevTools port for this acceptance run.
3. On first launch, verify the visible Lastbrowser shell/setup UI, bundled Sidekick/WebUI health, and runtime location inside the disposable account's profile. Close normally, relaunch from the same shortcut, and confirm the UI and service recover without a privilege prompt.
4. Keep the first-launch logs and report the exact failing operation if anything fails. If the Mojo channel denial reproduces with the standard token and no debug switches, investigate the exact IPC/resource access under that account and fix the app/package ACL or launch path that owns it. Do not disable Windows security globally, relax the browser sandbox, or make Administrator launch a product requirement.

## Acceptance status

| Claim | Status | Evidence boundary |
| --- | --- | --- |
| Unsigned preview package contents copied offline | **Passed for preview packaging** | `preview-result.json`: 10,243 resources, no blocked copies, unsigned, unpublished. Not an installer. |
| Packaged EXE plus bundled backend works in an isolated profile | **Passed for controlled smoke** | Direct-EXE report: shell/setup visible, Sidekick/WebUI ready, bundled runtime under the test profile, exit 0. It used explicit loopback CDP. |
| First visible attempt works under a normal non-admin token | **Unverified** | The first attempt failed with Mojo `0x5`; the token and exact launch command are absent. |
| Retry works without an application sandbox bypass | **Partial** | Visible retry succeeded without `--no-sandbox` or a debug port. The Windows token was not captured. |
| Installer first-run/relaunch acceptance | **Unverified** | No installer was built or installed in this preview run. |

Until the standard-token installer check passes, the appropriate release disposition is **first-start acceptance pending**, not a code change that elevates privileges and not a claim that the exception is harmless.

# Release authorization and execution boundary

The user authorized publication of the updated website and the latest Setup/Portable release on 2026-10-05, including SimplySign authentication and the existing DRM/VMP signing pipeline. This supersedes the earlier publication prohibition for these artifacts. Microsoft Store submission is still a separate operation.

Root coordinates the source freeze, index, final verification, version, signing and publication. Current candidate is 0.1.44; no new release or signature is claimed by this document. Existing 0.1.43 website downloads remain valid until replacement artifacts are verified.

Execution order:

1. Finish the owned product changes and capture source/runtime freeze. Preserve all parallel and user changes.
2. Run the required desktop tests, build, Store preflight and Python syntax check, plus the applicable backend and real-app acceptance checks. Resolve failures before release.
3. Align root/desktop/lock versions and release notes. Commit reviewed coherent changes after the gates; do not indiscriminately stage the shared checkout.
4. Build a fresh common payload and Setup/Portable. Use the installed Certum certificate and timestamping; keep authentication material transient and out of logs.
5. Perform Authenticode signing before the Castlabs afterSign VMP hook. Require successful VMP signing and verification with EVS_REQUIRED=1. Do not modify the application PE signature after VMP.
6. Verify exact final signatures, hashes, private-file exclusions, installation, restart and update behavior. Host execution does not establish clean-Windows dependency closure. Keep licensing and clean-Windows gates honest.
7. Publish the verified artifacts and matching update metadata; update website links and hashes only from those exact artifacts. Mark future features as planned and incomplete features accurately.

Observed preflight: the installed Certum certificate is present and unexpired. ADB currently reports no connected device; this does not establish whether the existing SimplySign session can sign. No token has been retrieved or printed. Website deployment configuration still needs a verified production target; the repository has no site deployment workflow.

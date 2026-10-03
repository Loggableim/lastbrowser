# Bundled-runtime signing change

The user authorized this change on 2026-10-03. It is implemented in the release workflow; successful Azure signing still requires verification in CI.

The current release workflow already invokes `Azure/trusted-signing-action@v0.5.1` with Azure tenant/client credentials, signing account, and certificate profile to sign the installers. Add a second invocation of that **same action/version and same existing secrets**, immediately after the desktop build and before `electron-builder` packages the installers.

The additional signing targets are exactly:

```text
apps/desktop/vendor/local-ai/cpu/llama-server.exe
apps/desktop/vendor/local-ai/cpu/*.dll
apps/desktop/vendor/local-ai/vulkan/llama-server.exe
apps/desktop/vendor/local-ai/vulkan/*.dll
```

Use the existing SHA256 file/timestamp digest and existing Azure timestamp service settings. Do not add another signing service or credential. Tracked official runtime archives remain untouched; only their verified extracted build artifacts receive signatures.

After this step, verify each target with `signtool.exe verify /pa`. The new read-only `afterPack` hook verifies the actual copied resources before release. Keep the existing installer Authenticode, checksum/blockmap refresh, and Widevine VMP workflow intact.

The action receives signing credentials as it already does in the installer-signing step. The additional invocation changes when those credentials are used and expands the set of files signed. Automatic approval review initially rejected the change; the user subsequently explicitly authorized it. No account provisioning or Store submission is performed by this change.

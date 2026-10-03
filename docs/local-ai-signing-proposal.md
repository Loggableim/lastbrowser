# Proposed bundled-runtime signing change

This is a reviewable proposal, not an active workflow change.

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

The action receives signing credentials as it already does in the installer-signing step. The requested additional invocation changes when those credentials are used and expands the set of files signed. Automatic approval review rejected this exact change because broad packaging authorization did not cover the additional secret-bearing invocation. Explicit user authorization is required before applying it.

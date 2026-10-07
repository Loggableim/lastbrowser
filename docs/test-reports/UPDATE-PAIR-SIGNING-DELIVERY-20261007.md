# Synthetic update pair: signing and Guest delivery

Status: preparation complete, **execution requires separate Human approval**. This does not authorize signing, repacking, public upload, feed start, or VM access. The public unsigned cec9 design candidate and previously signed public 0.1.47 are separate artifacts.

## Frozen inputs and destination

Both synthetic versions use source `d6b61f3d9b26990f9dbce165a666166c6179bc1a` and frozen stage `C:\projekte\lastbrowser\output\update-acceptance-prep\2026-10-07T11-22-42.312Z-9f0be888-d9de-42e3-b6a9-e51a63adbf9a`.

- Baseline Setup: 0.1.47, SHA-256 `01544386f0f1f9c5932c9749aebb2f1cb75d1bbaaa6abe560f9aba464bcb72ba`.
- Target Setup: 0.1.48, SHA-256 `92b718879d97b267ed8399f92cf5ba3527a9d7834f0e9bc4e959691a55d2fc3e`.
- Final signed output directories, which must not already exist: `C:\projekte\lastbrowser\output\update-signed-pair-20261007-9f0be888\baseline` and `...\target`.
- Detailed input/receipt/config hashes: `output/update-pair-signing-delivery-plan-20261007.json`. Derived configs and their hashes: `output/update-pair-signing-derived-config-review-20261007/receipt.json`.

Keep original unsigned directories immutable. Copy each qualified unpacked payload and the frozen project into the new stage. All 66 Local-AI native files already have valid timestamped signatures; preserve them and their manifests byte-for-byte. Unexpected runtime byte changes stop execution and require a separately reviewed provenance transformation.

## Authorized execution sequence

1. After Human approval, independently check frozen input, helper, config and tool hashes, actual certificate identity, new destination paths and absence of competing writers. SimplySign must make the private key available; an associated private key in the certificate store is not proof that signing will succeed.
2. Preserve every valid timestamped existing signature. Sign only the inventoried `NotSigned` inner PE files in the copied payload using the existing Certum identity, SHA-256 and RFC3161 timestamp. Reject invalid or untimestamped signatures. Explicitly cover Python extraResources; electron-builder does not automatically cover that entire tree.
3. On the copied payload, explicitly run `python -m castlabs_evs.vmp -n sign-pkg <payload>` followed by `verify-pkg`. Verify Authenticode remains valid. Never Authenticode-sign the main EXE again after VMP.
4. From the copied frozen project, use the reviewed per-version derived config and `electron-builder --prepackaged <sealed payload> --win nsis --x64 --publish never --config <config>`. Installed electron-builder skips `doPack`/automatic app `afterSign` with `--prepackaged`: the explicit preceding inner-signature/VMP steps are mandatory. NSIS signs its newly generated uninstaller before embedding and signs the final Setup wrapper. Repacking may execute the builder's temporary uninstaller-generation stub; this is part of the proposed packaging operation, not a normal app installation test.
5. Verify the extracted final Setup payload, uninstaller signature, all native signatures and timestamps, app/Setup publisher and exact preserved Local-AI hashes. After all final byte changes, use the NSIS-only helper below to replace the expected builder blockmap and update final SHA-512/size metadata. The existing Setup-plus-Portable helper is incompatible with this pair.
6. Re-read final Setup, blockmap, latest.yml and helper receipt; record final SHA-256 values. Preserve all build/sign/VMP/payload checks and errors. Do not claim actual update installation from these preparation checks.

Pinned signing identity: thumbprint `1AD3C19A7338BBC3FFE4D62853411AD73E139857`, publisher `Open Source Developer, Dominik Rainer`, exact subject `CN="Open Source Developer, Dominik Rainer", O=Open Source Developer, L=Innsbruck, S=Tyrol, C=AT`.

The manual signing command template is `signtool.exe sign /sha1 <pinned-thumbprint> /s My /fd sha256 /tr http://timestamp.digicert.com /td sha256 <exact-new-stage-unsigned-PE>`. Do not execute it against original artifacts or export credentials/private keys.

## Final metadata commands — not yet executed

Run only after the exact final signed Setup exists and all preceding gates pass. For baseline:

```powershell
node scripts/test-tools/update-pair-metadata.mjs `
  --stage 'C:\projekte\lastbrowser\output\update-signed-pair-20261007-9f0be888\baseline' `
  --version 0.1.47 `
  --publisher 'Open Source Developer, Dominik Rainer' `
  --subject 'CN="Open Source Developer, Dominik Rainer", O=Open Source Developer, L=Innsbruck, S=Tyrol, C=AT' `
  --thumbprint 1AD3C19A7338BBC3FFE4D62853411AD73E139857 `
  --app-builder 'C:\projekte\lastbrowser\node_modules\app-builder-bin\win\x64\app-builder.exe'
```

For target, use the direct `target` directory and version `0.1.48`. A nested `baseline/dist` or `target/dist` directory is intentionally rejected. The CLI has no signature-bypass option. It accepts only the exact pinned identity/version and one expected Setup, replaces only the expected regular blockmap, and verifies final three-file receipt/readback. Tested rename failures restore both the original latest.yml and blockmap.

Helper SHA-256: `2e5aaef9168ccad99b5034d3267a309455a5dafeb12c63c9728601321866e36c`; tests SHA-256: `dccf6c5cf0d8477d82ec7ecf7506ddb4cefe752f7dca262bd46d8e9ee57d9daa`. Independent review: `output/update-pair-metadata-independent-review-20261007.json`, SHA-256 `e03d543a875145ea30f759ed63fff63f76a2362f9a935b6a4295426dccf5b3d1`. Syntax checks and 11 synthetic tests passed; real Windows signature, blockmap-tool, NSIS/VMP and Guest execution remain untested. Junction fixtures and process termination during multi-file rename were not tested; atomic filesystem rename is not a guarantee of power-loss recovery.

## Network, delivery and practical acceptance

SimplySign/private-key access, DigiCert timestamp service and authenticated Castlabs VMP use network. Account costs/quotas are not verified. No new provider/model calls or credential transfer are required. Public upload is not implied by signing approval.

After a separate transport decision, the Human transfers both final signed Setup packages and exact target metadata/blockmaps/receipts into the isolated Guest. Root does not operate the VM or start its feed. The Guest owner serves target files on its own `127.0.0.1:18789/feed/`, preserving signature/publisher verification.

Actual acceptance must separately demonstrate: baseline installation and identity; target download; normal quit silently installs without relaunch; restart installs and relaunches exactly once; version changes and harmless profile data survive; failed/incomplete downloads do not install. Stable feed, Store submission and public design candidate stay separate.

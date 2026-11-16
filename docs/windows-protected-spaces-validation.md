# Windows protected Spaces hardware validation

Test on a dedicated Windows x64 machine with a physical TPM 2.0, WinFsp, and a Windows account with the TPM authorization required by setup. Use two disposable Spaces with distinct browser profiles, distinct named Sidekick profiles, and synthetic data. Keep other LastBrowser profiles and work files out of this test.

Record the tested commit, installer SHA-256, Windows version, and WinFsp version. Validate Authenticode signatures on the installer and native payload. Run `space-tpm-nv.exe probe-setup` from the installed `resources/protected-spaces` directory. Exit code 0 means the prerequisite check passed.

1. In LastBrowser settings, select the synthetic primary Space and decoy Space. Assign each a different password and bookmark. Add a different browsing and Sidekick marker to each Space. Start migration and confirm LastBrowser reopens to the unlock dialog.
2. Enter a wrong password and verify the dialog stays locked. Enter the primary password and verify the primary bookmark, browsing marker, and Sidekick marker. Lock and close LastBrowser so its encrypted volume is dismounted before taking the image.
3. Capture a Windows disk image before revocation. Keep that image separate from any TPM backup. Save a second, independent copy of the pair's pre-revocation application files. Record the two test passwords separately so restoring the disk cannot affect the test inputs.
4. On the same Windows installation, enter the emergency password. The decoy should open with its own markers and the ordinary unlock flow should show no revocation message. Close LastBrowser again. Confirm the primary password is now rejected and the primary vault directory has been removed from the active pair.
5. Restore the pre-revocation disk image to the same physical machine while preserving its TPM state. Open LastBrowser and enter the exact primary password from step 2. The primary Space must remain unavailable. Verify the emergency password still opens the decoy with its original markers.
6. With LastBrowser closed, repeat step 5 using just the saved pre-revocation application files. Confirm the same result for both passwords.

The short native check can be run from a built checkout with Node 24 or later. Pass the absolute path to the built TPM helper.

```powershell
node apps/desktop/scripts/smoke-windows-space-key-replay.cjs <absolute-path-to-space-tpm-nv.exe>
```

The short check replays LastBrowser key files. The disk-restore result comes from step 5. Record the outputs separately and keep passwords, test keys, and disk images out of the PR.

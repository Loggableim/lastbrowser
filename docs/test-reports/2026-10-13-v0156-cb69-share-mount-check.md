# 0.1.56 cb69bb92 VM share mount check

- Checked: 2026-10-13 07:46 UTC (tester VM)
- Candidate: `Lastbrowser-0.1.56-UNSIGNED-VMTEST-cb69bb92-x64-portable.exe`
- Expected size: 170,691,960 bytes
- Expected SHA-256: `847937799fbcefd51f8aa8bc289c736139dc007a20a5ecb1301431ef0f35ae3b`
- Expected ASAR SHA-256: `a1f34062799ef9f18d38271b5f177e450d15f9001d44bb771d3bc2d279acd391`

## Result: BLOCKED before receipt/hash gate

The requested read-only path `\\VBOXSVR\LastBrowserCb69\Lastbrowser-0.1.56-UNSIGNED-VMTEST-cb69bb92-x64-portable.exe` was not visible in the existing Windows VM. `VBoxControl.exe sharedfolder list` reported `Shared Folder mappings (0): No Shared Folders available.` PowerShell `Test-Path` also returned false for the candidate path, and `Get-Item` reported that `\\VBOXSVR\LastBrowserCb69` does not exist.

No file was copied or launched. Received bytes, local size, SHA-256, Authenticode status, and embedded ASAR hash remain unverified. No runtime test was started and no PASS is claimed. The exact mount failure was reported in the existing P004 Slack thread; the next step is for the VM owner to make the already-authorized read-only share visible in this same VM. After receipt, verify the pinned size and hashes before continuing the assigned matrix.

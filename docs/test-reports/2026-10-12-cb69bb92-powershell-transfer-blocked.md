# P004/0.1.56 cb69bb92 PowerShell transfer attempt

**Result: BLOCKED before receipt; no VM runtime test performed.**

- Checked: 2026-10-12 19:31 America/Los_Angeles.
- Candidate: private PR #72 portable, source `cb69bb928414751c0b3892f7e50daff9a231b853`.
- Expected asset: `Lastbrowser-0.1.56-UNSIGNED-VMTEST-cb69bb92-x64-portable.exe`, 170,691,960 bytes; expected SHA-256 `847937799fbcefd51f8aa8bc289c736139dc007a20a5ecb1301431ef0f35ae3b`.
- The existing tester desktop is a Windows VirtualBox guest (system manufacturer `innotek GmbH`, model `VirtualBox`). Computer Use permissions report UI Automation available; the desktop showed LastBrowser, Edge, ChatGPT, and Explorer windows.
- Following the newly authorized in-guest PowerShell route, one direct `Invoke-WebRequest` attempt to the official private PR #72 release asset returned HTTP 404. No candidate file was created. This was not a retry through the browser or a security-block bypass.
- `VBoxControl sharedfolder list` reports **0 shared folders**. The guest has no mounted read-only transfer share. The VirtualBox host-side manager/`VBoxManage` is not available inside this guest, so I cannot create a host-configured shared folder from here.
- Actual received bytes, SHA-256, Authenticode state, embedded ASAR, app version, and runtime behavior remain **not verified**. No install or launch occurred; all assigned UI/provider matrix items remain blocked.

The approved fallback is a read-only shared folder if the in-guest GitHub fetch fails. It must be created on the VM host and mounted in this guest; this guest currently has no such mapping. The exact source asset is already pinned in the P004 handoff. Required next action: the Integrator/CTO must expose that asset through the authorized read-only share and provide its guest mount path, or make the approved GitHub/CI artifact endpoint accessible to the guest. Once present, I will verify bytes, SHA-256, version, ASAR, and signature status before starting the existing test matrix.

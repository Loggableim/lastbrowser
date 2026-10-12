# v0.1.55 P004 repair candidate

Date: 2026-10-12 (Europe/Vienna). Candidate source commit:
`151df72cc1d8e2c21f3ffcf1d4f422f3d714a58a`, branch
`codex/p004-v0155-diagnosis-20261012`. This is a child of the reviewed
v0.1.55 integration branch; it does not change the already-tested
`ca564a91d453623c96740c629cd00320c0455034` candidate or its result.

## Findings and source changes

The P004 intake report at commit
`63365108b0f0f4097e604547b12515b6018c0824` records an initial black renderer
that recovered after Ctrl+R, a MiMo V2.6 Flash request that ended with “No
response from provider,” and an intermittent empty model picker. The captured
report does not bind the renderer symptom to a console error or the MiMo
failure to a request/session/profile/Space record. No MiMo inference was
repeated and no profile was reset.

One cause is confirmed from the exact candidate source: startup discovery in
`App.tsx` requested `/api/models` without a saved Space selection, while Main's
`requestScopedWebui` rejects that endpoint without a scope. The renderer had
been catching the rejection, so it did not prove that this was the MiMo or
black-renderer cause. The fix now sends the current saved browser-profile,
Space path, and resolved backend-profile binding through the request.

A second source-level issue matches the intermittent catalog symptom: opening
or closing the model picker retriggered discovery, cleared the current list,
and removed the loaded-scope marker before the response arrived. A cache is now
retained only when its key matches the active profile/Space scope. The loaded
marker is cleared during refresh so chat sends remain gated until that scope's
refresh succeeds; a scope change still clears the prior list.

No MiMo stream/provider code or first-renderer boot code was changed because the
P004 report does not distinguish their causes. No provider credentials,
authentication dialogs, runtime logs, or user profile data were read or
changed. No VM retry or reset was performed. The existing VM tester remains
the only VM operator.

## Review and source gates

Self-review checked that startup captures the latest scope through a ref
without restarting the startup lifecycle; cached catalog data is reused only
for an identical serialized scope; sends remain blocked while a refresh is
pending; and stale responses remain rejected. Regression coverage was added
for startup scope wiring and same-scope versus cross-scope cache eligibility.
No independent human PR approval is claimed.

Final gates on this source tree:

- `npm test`: 238 files, 2,168 tests passed. A smoke reported port 5173 busy
  and used the test's fallback port.
- `npm run verify:store`: 39 PASS, 2 WARN, 0 FAIL. Warnings are provisional
  Store screenshot content/localization and no final signed Store package.
- `npm --workspace apps/desktop run build`: passed; existing large-chunk
  advisory remains (about 2.50 MB).
- `python -m compileall -q services/sidekick`: passed.
- Focused startup, scoped-request, and provider-model-selection tests:
  50 passed.
- `git diff --check`: passed.

These are source and local package-preparation results, not VM, inference, or
release acceptance.

## Unsigned package and provenance

Offline preview directory:
`output/feature-preview-2026-10-12T01-25-16-547Z-4567e941`.

`preview-result.json` records 10,235 resource files, `blocked: []`,
`unsigned: true`, `published: false`, and `fullAcceptanceVerified: false`.
Its `artifacts` array is empty; it does not itself bind the installer files.
`resource-hashes.json` contains the individual resource hashes and is 1,452,591
bytes, SHA-256
`d4d3700de50f48b4293444e06281b8a47cf220f98849319eaedbf01962b3ea17`.
The receipt is 184 bytes, SHA-256
`e61fd7c2fd9344aa154222229ad59ceb92c7b75ed85cdae9ed75b37d070b558d`.

The unpacked `resources/app.asar` is 73,124,784 bytes, SHA-256
`f515411f8034f270b91a17d9303cdf611481f4a1253e89d29659e708e9593f3a`.
The bundle marker is schema 1, `offline-test`, version `0.1.55`. Direct preview
and portable local launch probes passed with temporary isolated profiles and
cleanup. These host probes did not perform provider inference or VM acceptance.

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `Lastbrowser-0.1.55-UNSIGNED-VMTEST-151df72c-x64-setup.exe` | 167,160,957 | `7365bb859cd63074eec6298dfebc24bb6e85cc2e5e8da49c20be71bcb4e59b1e` | NotSigned |
| `Lastbrowser-0.1.55-UNSIGNED-VMTEST-151df72c-x64-portable.exe` | 166,806,799 | `d5aab1a8a191470f35b4cfd6a039a57a8ecaaca159d4551c1767fe2b8ce564ab` | NotSigned |

The private VM-test draft is the handoff target; it must remain unpublished.
The new files are for targeted validation of startup Space binding and
same-Space catalog refresh. Do not repeat the prior MiMo inference or interpret
its prior failure as fixed by these changes. Preserve the earlier candidate's
P004 FAIL as bound to `ca564a91`; no full P004 PASS is claimed for this build.

The four named assets were uploaded to the existing private draft
[v0.1.54 + v0.1.55 VM-Testkandidaten (NICHT VEROEFFENTLICHEN)](https://github.com/Loggableim/lastbrowser/releases/tag/untagged-db01e8964de38692c212).
GitHub confirmed `isDraft: true`; its byte sizes and SHA-256 values match the
local files above. The artifacts remain unsigned and are not published.

- [Setup download](https://github.com/Loggableim/lastbrowser/releases/download/untagged-db01e8964de38692c212/Lastbrowser-0.1.55-UNSIGNED-VMTEST-151df72c-x64-setup.exe)
- [Portable download](https://github.com/Loggableim/lastbrowser/releases/download/untagged-db01e8964de38692c212/Lastbrowser-0.1.55-UNSIGNED-VMTEST-151df72c-x64-portable.exe)
- [Resource hash manifest](https://github.com/Loggableim/lastbrowser/releases/download/untagged-db01e8964de38692c212/Lastbrowser-0.1.55-UNSIGNED-VMTEST-151df72c-resource-hashes.json)
- [Offline preview receipt](https://github.com/Loggableim/lastbrowser/releases/download/untagged-db01e8964de38692c212/Lastbrowser-0.1.55-UNSIGNED-VMTEST-151df72c-preview-result.json)

# Unsigned release pipeline (Beta / Tagesbeta and Stable channels)

`.github/workflows/release-pipeline.yml` builds the Windows installers for the
**Beta** (Tagesbeta) and **Stable** update channels and uploads them as GitHub
Actions **artifacts**. It uses **no repository secrets** and performs **no code
signing**. Authenticode (Certum / SimplySign) and Castlabs VMP signing stay
local at Cid: Cid downloads the unsigned artifacts, signs them, and publishes
them. The pipeline creates no tag and no GitHub Release.

Stable releases that are actually published by CI stay on the signed tag
workflow in [release.md](release.md).

## Channels and feeds

`scripts/resolve-release-channel.mjs` maps the package version to a channel and
its electron-updater feed file:

| Channel | Settings value | Version example | Updater feed | Signing |
| --- | --- | --- | --- | --- |
| Stable / Public | `stable` | `0.1.44` | `latest.yml` | Signed locally by Cid before release |
| Beta / Tagesbeta | `beta` | `0.1.58-beta.1` | `beta.yml` | Optional; this pipeline ships **unsigned** artifacts |

Run it locally to inspect the mapping:

```bash
node scripts/resolve-release-channel.mjs 0.1.58-beta.1
node scripts/resolve-release-channel.mjs v0.1.44 0.1.44
```

## Version scheme

- A release version is `X.Y.Z` (Stable) or `X.Y.Z-beta.N` (Tagesbeta).
- Tagesbetas count up one `beta.N` per day, for example `0.1.57`, `0.1.58`.
- A big release jumps the minor tens digit (for example `0.1.62` → `0.1.70`),
  then the daily betas continue (`0.1.71`, `0.1.72`).
- Root `package.json` and `apps/desktop/package.json` must always agree; the
  pipeline refuses to build when they differ.
- No Stable tag is created until Cid names the beta.

## Triggers

- **`workflow_dispatch`** — a manual run. The optional `version` input must match
  `apps/desktop/package.json`; leave it empty to use the package version. The
  channel is derived from that version, so a `-beta.N` version produces a Beta
  build and a plain `X.Y.Z` version produces a Stable build.
- **`schedule`** — `0 18 * * *` builds the daily Tagesbeta from the package
  version. 18:00 UTC is 20:00 Europe/Vienna during CEST; the local time shifts
  by one hour when CET returns. Scheduled workflows only run from the repository
  default branch.

## What the pipeline does

1. Resolves the channel, version, and feed file from the package version.
2. Runs the backend gates (`python -m compileall`, `pytest`), the release
   workflow tests, and the Microsoft Store preflight (`verify:store`).
3. Prepares the Python runtime and builds the desktop application.
4. Packages NSIS and portable installers with `--publish never` and signing
   disabled (`signAndEditExecutable=false`, `verifyUpdateCodeSignature=false`,
   `CSC_IDENTITY_AUTO_DISCOVERY=false`). The `afterSign` VMP hook runs in its
   documented "unsigned local build" mode and only warns.
5. Collects both installers, the setup blockmap, and the channel feed
   (`beta.yml` or `latest.yml`) and uploads them as one artifact.

## After the run (Cid)

1. Download the `lastbrowser-unsigned-<channel>-<version>-*` artifact.
2. Sign `Lastbrowser-<version>-x64-setup.exe`, the portable launcher, and
   `win-unpacked/Lastbrowser.exe` locally, then refresh the signed metadata.
3. Publish the signed installers together with the channel feed.

Signing must stay local. Never add signing credentials or secrets to this
workflow, and never attach it to a tag.

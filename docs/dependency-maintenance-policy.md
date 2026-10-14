# Dependency maintenance policy

Cid's default is the latest compatible **stable** release of each dependency.
An old pin is not a reason to leave browser engines or security fixes behind.

## Priorities

1. Browser engine, Chromium and security-sensitive dependencies first.
2. Keep Electron, Castlabs DRM/VMP, native modules, Node tooling, Python runtime
   and packaging mutually compatible. Upgrade the actual runtime, not just a
   displayed version string.
3. Use stable dependency releases by default. A prerelease requires an explicit
   Beta exception; it must not silently become the default for Public builds.

## Current explicit Beta exception

The `0.1.57-beta.1` preparation targets Castlabs
`45.0.0-alpha.14+wvcus` with Chromium **156**, because the required Chromium
minimum is **155**. Castlabs 44.5.1 / Chromium 152 was an intermediate upgrade
and does not meet that minimum. The Electron 45 prerelease is an explicit Beta
choice, not a claim of Store certification or final runtime acceptance.

When a compatible stable Castlabs release meets the engine requirement, prefer
that stable release. Any Public promotion retaining a prerelease runtime needs
an explicit release decision; promoting browser features does not grant that
exception automatically.

## Provenance for each release

- Record the exact source commit, direct dependency pins and matching lockfile.
- Record actual installed and packaged Electron/Chromium versions, runtime
  download source and the chosen stable/prerelease status.
- Rebuild native modules and package from the matching dependency tree.
- Report compilation, focused verification, package execution, VMP, signing,
  VM acceptance and Store acceptance separately. A successful build proves none
  of the later stages by itself.
- Update checksums and updater metadata after the final signature. Never
  substitute unsigned bytes or a differently versioned runtime afterward.

## Beta and Public cadence

Public remains the default update channel; Beta is an explicit opt-in. After
Public 0.1.57, development proceeds with Beta 0.1.58. Publishing the next Beta
line 0.1.59 promotes the accepted previous Beta source to Public 0.1.58; Beta
0.1.60 similarly accompanies Public 0.1.59. Public stays one version behind Beta.

Each promotion requires a new stable-version build and signature from the
accepted source. Do not rename or retag a signed Beta binary as Public. Existing
published tags are immutable. See [Beta/Public release procedure](v0157-beta-public-channels.md).

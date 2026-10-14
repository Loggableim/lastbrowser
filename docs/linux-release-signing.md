# LastBrowser Linux release signing

Authorized by Cid on 2026-10-13. Release owner: Nord; Linux packaging: Vesper.

## Published Linux 0.1.56 — 2026-10-14

Cid authorized Vesper to set up his own signing, then authorized Linux publication.
The published package identity is distinct from the owner-host key below:

- UID: `LastBrowser Linux Package Signing <linux-packages@lastbrowser>`.
- Primary Ed25519 certification key: `0546B4B0840C0A86D62B54A79DC2502686684B33`.
- Ed25519 signing subkey: `676481D83532BBC76F3E82F83FE43AD08D08AEE7`.
- Both keys have no expiry in the provided public export.
- Versioned public key: `https://lastbrowser.com/assets/keys/lastbrowser-linux-0.1.56-signing.pub.asc`.
- Public manifest/signature and both packages: `https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.56`.

Nord downloaded both original packages, verified every checksum and the exact
197-byte manifest, independently imported only the public key and obtained GPG
`VALIDSIG` for both the expected signing subkey and primary fingerprint, exit 0.
GitHub's uploaded asset digests and the live versioned website public-key bytes
match the local originals. The website offers Linux as Preview in seven languages.

Vesper's follow-up package test used the exact published bytes as normal user
`ubuntu` (uid1000) on Ubuntu24.04.5. Both tar and AppImage started without
`--no-sandbox`; Zygote children reported Seccomp2, React committed and a fresh
example.com navigation returned HTTP200. AppImage required host `libfuse.so.2`
and `fusermount` (Ubuntu packages `libfuse2t64` and `fuse` on this test host).
GPU initialization aborted; chat and DRM playback remain unverified.

The signer reports a protected second copy and revocation certificate outside
the repository (directories700/files600), with a successful disposable-keyring
restore import, exit0. Both copies remain on the same host. This is a tested
local recovery copy, not protection against losing that host. No private key
or passphrase has been transferred through Slack or committed.

The generic website key now points to this release identity. The earlier export
is retained as `lastbrowser-linux-release-20261013-owner.asc`; it was not used
to sign Linux 0.1.56. No owner-host private key was exported. Vesper reports
passphrase-protected recovery material outside his repository, but durable
custody beyond that host is not verified and needs a separate follow-up.

## Owner-host key (historical setup; not the Linux 0.1.56 signer)

Public identity: LastBrowser Linux Release Signing <rainer@dominik.in>.

- Primary certification key, Ed25519:
  `BD10C633483A9B1159964F11762E4029184C95F4`.
- Release signing subkey, Ed25519:
  `9103068B3CD4943A6B9B0D1AE7BDEC7F5CB67F48`.
- Primary validity: three years from creation; signing subkey: one year.
- Public key: `lastbrowser.com/assets/keys/lastbrowser-linux-release.asc`.

The private key is on the Windows release-owner machine in a dedicated GnuPG
home outside Git. Directory ACL restricts access to the current Windows user
and SYSTEM. Key material is passphrase-protected; the generated passphrase is
stored encrypted by Windows DPAPI CurrentUser. It is not printed, committed,
sent through Slack, or imported into Cursor Cloud. GnuPG generated a local
revocation certificate in its protected home. Offline recovery backup remains
an owner-controlled operational task; DPAPI recovery requires the Windows user.

## Release handoff

1. Vesper provides exact SHA256SUMS bytes and the corresponding Linux files.
2. Release owner downloads/stages the original files, checks provenance and
   hashes, then runs `scripts/sign-linux-checksums.ps1 -ManifestPath ...`.
3. The script checks every manifest checksum against regular local files,
   signs with the exact signing subkey, and verifies the resulting signature.
4. Only SHA256SUMS.asc, the public key and fingerprint return to Vesper.
   No private-key transfer is needed to remove this packaging blocker.
5. Signature setup alone does not authorize publishing Linux binaries, a tag,
   a website download, an apt repository, or a new release.

Consumers compare the full primary fingerprint with the separately published
website fingerprint, import the public key, run `gpg --verify SHA256SUMS.asc
SHA256SUMS`, then `sha256sum -c SHA256SUMS`. An imported public key alone is not
independent proof of the publisher's identity.

## Current evidence

The owner-host key was generated and exported with GnuPG 2.4.8. Its local
signing script remains pinned to that identity and must not be described as
producing the separately signed Linux 0.1.56 release. Current distribution
evidence is recorded above and in `plans/v0157-night-release-audit-20261014.md`.

# LastBrowser Linux release signing

Authorized by Cid on 2026-10-13. Release owner: Nord; Linux packaging: Vesper.

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

Key generation and public export completed with GnuPG 2.4.8. No Linux checksum
manifest has yet been signed; exact artifact transfer is pending Vesper's reply.
No release package or website deployment is claimed by this document.

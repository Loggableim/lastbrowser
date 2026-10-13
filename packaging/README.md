# Package manager manifest templates

These manifests are preparation templates for LastBrowser 0.1.56. They are not installable release packages and must not be submitted to WinGet, Chocolatey, Scoop, or any other package source in their current form.

The following values are deliberate placeholders in all three package definitions:

- Installer URLs under `REPLACE-AFTER-SIGNED-RELEASE.invalid`.
- The all-zero SHA-256 values.
- The 0.1.56 installer filename, until it is confirmed against the final release artifact.

Replace these values only with the URL and SHA-256 calculated from the exact, verified, signed private test candidate. Keep the three package definitions aligned to that same artifact and version. Do not publish the package-manager manifests or installer as part of this preparation work.

Local validation checks manifest syntax and package construction only. A passing validator does not confirm that an installer exists at the placeholder URL, that the hash matches a signed build, or that a package is ready for submission.

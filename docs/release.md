# Lastbrowser Release Flow

Lastbrowser Windows releases are published through GitHub Releases from version tags.

## Release Steps

1. Update the version in the root `package.json` and `apps/desktop/package.json`.
2. Run `npm run test:run`.
3. Create a tag that matches the app version, for example:

   ```powershell
   git tag v0.1.4
   git push origin v0.1.4
   ```

4. GitHub Actions runs `.github/workflows/release.yml`.
5. electron-builder Authenticode-signs the Windows payload before the existing Castlabs VMP hook and signs the NSIS uninstaller, setup and portable launcher during packaging. The workflow verifies signatures and the generated updater configuration before handing the artifacts to `softprops/action-gh-release`.

## Auto-Update Artifacts

The release workflow uploads these Windows release assets to GitHub Releases after signing:

- `Lastbrowser-<version>-x64-setup.exe`
- `Lastbrowser-<version>-x64-setup.exe.blockmap`
- `Lastbrowser-<version>-x64-portable.exe`
- `latest.yml`

The release gate requires exactly one version-matched setup executable and one portable executable. It verifies all executable payloads and the installer, and checks the configured publisher on LastBrowser and both distributions. `latest.yml` records both artifacts with their signed-file SHA-512 checksums and sizes, keeps the setup executable first, and points its auto-update path at the setup executable. The portable EXE remains available for manual download; the installer is the supported auto-update path.

The Windows Portable launcher extracts application files into Windows Temp and uses the same profile as the installer. New profiles use `%APPDATA%\Lastbrowser`. Existing profiles created under the earlier package-name path, `%APPDATA%\@lastbrowser\desktop`, continue to use that directory. Profiles stay on the host computer across launches. When the system tray is available, closing the window hides the app. Use **Quit Lastbrowser** in the tray menu for a full exit.

LastBrowser opens the browser window while Castlabs checks for Widevine. On a fresh profile Chromium can contact Google's component update service at `update.googleapis.com`. To suppress Chromium component updates, fully quit LastBrowser, then launch the executable with `--disable-component-update`. This also disables Widevine downloads and can prevent protected-media playback. App updates and ad blocker filter downloads have separate controls.

For local Ollama, start Ollama and install a local model before configuring the provider in LastBrowser. Enable the provider beta catalog if the Ollama card is hidden. The beta catalog resets when you reload the app. In first-run setup, **Reload models** queries the local server entered in the form. In Settings, **Test connection** also queries the specified local server. The general settings refresh can reuse a cached model catalog. Select the local Ollama model explicitly for chat, since automatic model selection can choose an enabled cloud provider.

## Requirements

- The GitHub Release must not remain a draft, because draft releases are invisible to `electron-updater`.
- The build/signing job runs with `contents: read`; only the separate publisher job receives `contents: write` and `${{ secrets.GITHUB_TOKEN }}`, after the signed artifacts have been verified and transferred as a workflow artifact.
- GitHub Actions requires the five Artifact Signing secrets `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_TRUSTED_SIGNING_ACCOUNT` and `AZURE_CERTIFICATE_PROFILE` and the Castlabs credentials `EVS_ACCOUNT_NAME` and `EVS_PASSWD`. Set the repository variable `WINDOWS_SIGNING_PUBLISHER_SUBJECT` to the exact full `SignerCertificate.Subject` observed on a verified binary from the authorized Artifact Signing profile. That public certificate identity is checked on the resulting executables and embedded in the signed updater configuration. Signed builds require a signed update from this publisher. Obtain unsigned daily betas through the manual download path. [Microsoft Artifact Signing integrations](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations)
- The signing hook retains valid timestamped vendor signatures and checks pinned local-engine bytes against the repository registry before leaving them intact. Optional engines do not need to exist in the clean build checkout. If a staged native dependency lacks a trusted signature, package validation fails.
- Signed Windows builds verify Authenticode for fresh downloads and installers recovered from the update cache. A publisher mismatch or unavailable Windows verification blocks installation. The updater accepts standalone NSIS installers.
- The workflow runs the Sidekick Python syntax check and full Python tests, desktop tests, and Store preflight before packaging. It downloads the pinned Python wheels in a separate provisioning step, then assembles the runtime using the offline wheelhouse. A Windows package assembled without live signing is a QA build.
- The `publish` config in `apps/desktop/package.json` points to `Loggableim/lastbrowser`.

## Manual Build

`npm run release:win` builds the Windows artifacts locally without publishing them. Use a version tag and the GitHub Actions workflow for the supported signed release path.

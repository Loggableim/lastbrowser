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
5. The workflow builds the Windows artifacts without uploading them, signs the artifacts, verifies Authenticode and the packaged VMP signature, then publishes the final files through `softprops/action-gh-release`.

## Auto-Update Artifacts

The release workflow uploads these Windows release assets to GitHub Releases after signing:

- `Lastbrowser-<version>-x64-setup.exe`
- `Lastbrowser-<version>-x64-setup.exe.blockmap`
- `Lastbrowser-<version>-x64-portable.exe`
- `latest.yml`

The release gate requires exactly one version-matched setup executable and one portable executable, and verifies the Authenticode signature on both. `latest.yml` records both artifacts with their signed-file SHA-512 checksums and sizes, keeps the setup executable first, and points its auto-update path at the setup executable. The portable EXE remains available for manual download; the installer is the supported auto-update path.

The Windows Portable launcher extracts application files into Windows Temp and uses the same profile as the installer. New profiles use `%APPDATA%\Lastbrowser`. Existing profiles created under the earlier package-name path, `%APPDATA%\@lastbrowser\desktop`, continue to use that directory. Profiles stay on the host computer across launches. When the system tray is available, closing the window hides the app. Use **Quit Lastbrowser** in the tray menu for a full exit.

For local Ollama, start Ollama and install a local model before configuring the provider in LastBrowser. Enable the provider beta catalog if the Ollama card is hidden. The beta catalog resets when you reload the app. In the Ollama configuration dialog, **Test connection** checks the specified localhost server's model list. The general settings refresh can reuse a cached model catalog. Select the local Ollama model explicitly for chat, since automatic model selection can choose an enabled cloud provider.

## Requirements

- The GitHub Release must not remain a draft, because draft releases are invisible to `electron-updater`.
- The build/signing job runs with `contents: read`; only the separate publisher job receives `contents: write` and `${{ secrets.GITHUB_TOKEN }}`, after the signed artifacts have been verified and transferred as a workflow artifact.
- GitHub Actions must have all five Azure Trusted Signing secrets configured: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_TRUSTED_SIGNING_ACCOUNT`, and `AZURE_CERTIFICATE_PROFILE`, plus the Castlabs EVS credentials `EVS_ACCOUNT_NAME` and `EVS_PASSWD`. The workflow stops before building if any are missing, requires exactly the expected setup and portable executables, and publishes only after Authenticode verification succeeds for both and the packaged VMP signature verifies.
- The workflow runs the Sidekick Python syntax check and full Python tests, desktop tests, and Store preflight before packaging. A local installer build does not establish that either Authenticode or VMP signing succeeded.
- The `publish` config in `apps/desktop/package.json` points to `Loggableim/lastbrowser`.

## Manual Build

`npm run release:win` builds the Windows artifacts locally without publishing them. Use a version tag and the GitHub Actions workflow for the supported signed release path.

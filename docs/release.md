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
5. The workflow runs `npm --workspace apps/desktop run package:win:publish`.

## Auto-Update Artifacts

`electron-builder` publishes these Windows release assets to GitHub Releases:

- `Lastbrowser-<version>-x64-setup.exe`
- `Lastbrowser-<version>-x64-setup.exe.blockmap`
- `Lastbrowser-<version>-x64-portable.exe`
- `latest.yml`

The installed NSIS build uses `latest.yml` to discover and download updates. The portable EXE is still published for manual download, but the installer build is the supported auto-update path.

## Requirements

- The GitHub Release must not remain a draft, because draft releases are invisible to `electron-updater`.
- The workflow needs `contents: write` permission and `GH_TOKEN` from `${{ secrets.GITHUB_TOKEN }}`.
- The `publish` config in `apps/desktop/package.json` points to `Loggableim/lastbrowser`.

## Manual Publish

To publish from a trusted local machine instead of GitHub Actions:

```powershell
$env:GH_TOKEN = "<token with repo/content release permission>"
npm run release:win
```

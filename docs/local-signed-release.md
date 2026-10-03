# Local Windows release with Certum / SimplySign

This route uses the installed Windows certificate, not Azure Trusted Signing. It was reconstructed from the installed electron-builder implementation on 2026-10-01; the commands below have not been executed as a new release. The final v0.1.41 setup has a valid Authenticode signature with certificate thumbprint `1AD3C19A7338BBC3FFE4D62853411AD73E139857` and a DigiCert timestamp. The same certificate is currently present in `Cert:\CurrentUser\My` with a private-key association. This does not prove that SimplySign will authorize a new signature without interaction.

## Preconditions and gates

Use a dedicated PowerShell session. Finish and review source changes first, including the approved version and changelog updates. Root and desktop package versions must agree and must not duplicate an existing public release. Do not overwrite the existing preview folders. SimplySign must be authenticated with the certificate available. Castlabs needs either its existing local account session or credentials supplied securely outside these commands; never put credentials into source, command history, or this document.

Run required verification from the repository root and stop on any failure:

```powershell
Set-Location C:\projekte\lastbrowser
$ErrorActionPreference = 'Stop'
function Assert-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed: $LASTEXITCODE" }
}
npm run test:run
Assert-Exit 'Desktop tests'
npm run verify:store
Assert-Exit 'Store preflight'
npm --workspace apps/desktop run build
Assert-Exit 'Desktop build'
python -m compileall -q services/sidekick
Assert-Exit 'Python syntax'
Push-Location services/sidekick
try {
    python -m pytest
    Assert-Exit 'Python suite'
} finally { Pop-Location }
```

The signing service and timestamp server require network access; local packaging does not require cloning another Sidekick repository.

## Configure and build

The supported option is **`win.signtoolOptions.certificateSha1`**, not a top-level `win.certificateSha1`. `win.azureSignOptions` must be absent. `forceCodeSigning` makes missing Authenticode signing fatal. A unique output folder avoids stale assets. This configuration copies the current package configuration, preserving resources, installer design, and the `afterSign` hook.

```powershell
$releaseRoot = (Get-Location).Path
$desktopManifest = Get-Content apps/desktop/package.json -Raw | ConvertFrom-Json
$rootManifest = Get-Content package.json -Raw | ConvertFrom-Json
$releaseVersion = $desktopManifest.version
if ($rootManifest.version -ne $releaseVersion) { throw 'Version mismatch' }
$signingThumbprint = '1AD3C19A7338BBC3FFE4D62853411AD73E139857'
$signingCertificate = Get-Item "Cert:\CurrentUser\My\$signingThumbprint"
if (-not $signingCertificate.HasPrivateKey -or $signingCertificate.NotAfter -le (Get-Date)) {
    throw 'Certum certificate is unavailable or expired'
}
$signTool = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe'
if (-not (Test-Path -LiteralPath $signTool)) { throw 'SignTool missing' }
$releaseOutput = Join-Path $releaseRoot "apps/desktop/release-local-$releaseVersion-$(Get-Date -Format yyyyMMdd-HHmmss)"
if (Test-Path -LiteralPath $releaseOutput) { throw 'Output already exists' }
$releaseConfigPath = Join-Path $env:TEMP "lastbrowser-release-$([guid]::NewGuid()).json"
$releaseConfig = $desktopManifest.build
$releaseConfig.directories.output = $releaseOutput
$releaseConfig | Add-Member -NotePropertyName forceCodeSigning -NotePropertyValue $true -Force
$releaseConfig.win.PSObject.Properties.Remove('azureSignOptions')
$releaseConfig.win | Add-Member -NotePropertyName signtoolOptions -NotePropertyValue ([pscustomobject]@{
    certificateSha1 = $signingThumbprint
    signingHashAlgorithms = @('sha256')
    rfc3161TimeStampServer = 'http://timestamp.digicert.com'
}) -Force
$releaseConfig | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $releaseConfigPath -Encoding utf8

# EVS_REQUIRED makes VMP signing and verification failures abort packaging.
# Explicit credentials are optional here: the hook uses the cached Castlabs
# session when EVS_ACCOUNT_NAME / EVS_PASSWD are absent. Set
# EVS_REQUIRE_EXPLICIT_CREDENTIALS=1 only when a CI policy requires them.
$env:EVS_REQUIRED = '1'
$env:EVS_NO_ASK = '1'
Remove-Item Env:EVS_REQUIRE_EXPLICIT_CREDENTIALS -ErrorAction SilentlyContinue
Remove-Item Env:ELECTRON_BUILDER_OFFLINE -ErrorAction SilentlyContinue
npm --workspace apps/desktop run prepare:python
Assert-Exit 'Python runtime preparation'
Push-Location apps/desktop
try {
    & "$releaseRoot/node_modules/.bin/electron-builder.cmd" --win nsis portable --x64 --publish never --config $releaseConfigPath
    Assert-Exit 'Signed package build'
} finally { Pop-Location }
```

electron-builder signs `win-unpacked/Lastbrowser.exe` before emitting `afterSign`; the hook then calls `castlabs_evs.vmp -n sign-pkg` and `verify-pkg`. `EVS_REQUIRED=1` makes either failure abort packaging while still allowing Castlabs’ cached local session. Explicit credentials are a separate opt-in policy (`EVS_REQUIRE_EXPLICIT_CREDENTIALS=1`) and are normally supplied by CI. Its NSIS target subsequently signs the setup, portable launcher, and uninstaller through the same signing configuration. Do not apply another Authenticode signature to the unpacked application after VMP signing: changing its PE header can invalidate VMP. Do not accept an EVS warning as a release success.

## Validate the exact final files

```powershell
$expectedExecutables = @("Lastbrowser-$releaseVersion-x64-setup.exe", "Lastbrowser-$releaseVersion-x64-portable.exe")
$actualExecutables = @(Get-ChildItem -LiteralPath $releaseOutput -File -Filter '*.exe')
if ($actualExecutables.Count -ne 2 -or (Compare-Object ($expectedExecutables | Sort-Object) ($actualExecutables.Name | Sort-Object))) {
    throw 'Unexpected release executable set'
}
$packageDirectory = Join-Path $releaseOutput 'win-unpacked'
$filesToVerify = @((Join-Path $packageDirectory 'Lastbrowser.exe')) + @($actualExecutables.FullName)
foreach ($releaseFile in $filesToVerify) {
    & $signTool verify /pa /v $releaseFile
    Assert-Exit "Authenticode verification: $releaseFile"
    $signature = Get-AuthenticodeSignature -LiteralPath $releaseFile
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $signingThumbprint -or -not $signature.TimeStamperCertificate) {
        throw "Missing expected valid timestamped signature: $releaseFile"
    }
}
python -m castlabs_evs.vmp -n verify-pkg $packageDirectory
Assert-Exit 'Final VMP verification'
node scripts/refresh-signed-release-metadata.mjs $releaseOutput node_modules/app-builder-bin/win/x64/app-builder.exe
Assert-Exit 'Final signed checksums and blockmap'
Get-FileHash -Algorithm SHA256 -LiteralPath $actualExecutables.FullName
```

The metadata script regenerates the setup blockmap, calculates SHA-512 and byte sizes from both signed executables, and rereads `latest.yml` to verify both entries and the setup update path. Nothing may modify either executable after this step. Preserve the hashes and verification output in release evidence. Test the packaged runtime and its critical provider/goal flows before approving publication; a signed artifact alone does not prove correct runtime behavior.

## Publication boundary

Publish only the verified setup, setup blockmap, portable, and `latest.yml` from this unique folder. Confirm the approved version is absent on GitHub and the version/tag points to the exact source used for this build. The existing tag-triggered GitHub workflow uses Azure and requires its own signing secrets; a local Certum signature does not satisfy those CI credentials. Coordinate the chosen local upload versus CI route before pushing a tag so two release producers cannot compete. After upload, download the published artifacts and compare their hashes; update the website to that verified version and verify its download URLs. Never replace assets of an existing public version with a different build.

## Website deployment

Update the localized download pages, release history, RSS feed, and `lastbrowser.com/functions/downloads/[file].js` with the verified public version and hashes. Preserve historical release entries. Commit the website changes before deployment.

Run Wrangler from the website directory so it compiles the adjacent `functions/` directory. Deploying `lastbrowser.com` from the repository root uploads static assets but does not include this function; `/downloads/latest.yml` can then return the HTML fallback with HTTP 200.

```powershell
Push-Location lastbrowser.com
try {
    wrangler pages deploy . --project-name lastbrowser-website --branch main
    Assert-Exit 'Website production deployment'
} finally { Pop-Location }
```

Require `Compiled Worker successfully` and `Uploading Functions bundle` in the deployment output. Verify each localized download page, the setup and portable proxy response filenames, and the bytes of `/downloads/latest.yml` against the signed release metadata. HTTP 200 alone is insufficient.

## Local implementation references

- `node_modules/app-builder-lib/out/options/winOptions.d.ts`: nested signtool options, SHA-256 algorithms and timestamp URL.
- `node_modules/app-builder-lib/out/codeSign/windowsSignToolManager.js`: Windows store certificate selection and `/sha1`/`/s` arguments.
- `node_modules/app-builder-lib/out/platformPackager.js`: `signApp` precedes `emitAfterSign`.
- `node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js`: `signIf` for installer and uninstaller.
- `apps/desktop/scripts/evs-sign.cjs`: cached Castlabs account support and VMP hook.
- `scripts/refresh-signed-release-metadata.mjs`: signed artifact metadata regeneration and verification.

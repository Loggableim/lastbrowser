[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$ElectronArchive,
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ElectronArchiveSha256,
    [switch]$VmpSign
)

$ErrorActionPreference = 'Stop'
$appDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$repoDirectory = (Resolve-Path -LiteralPath (Join-Path $appDirectory '../..')).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Use a new Windows payload output directory' }
$builder = Join-Path $repoDirectory 'node_modules/.bin/electron-builder.cmd'
if (-not (Test-Path -LiteralPath $builder -PathType Leaf)) { throw 'Install the repository npm dependencies first' }

$config = (Get-Content -LiteralPath (Join-Path $appDirectory 'package.json') -Raw | ConvertFrom-Json).build
if ($ElectronArchive) {
    $archive = Get-Item -LiteralPath $ElectronArchive
    if ($archive.PSIsContainer -or $archive.Name -cne "electron-v$($config.electronVersion)-win32-x64.zip") {
        throw 'Supply the verified Windows x64 Electron archive for the pinned version.'
    }
    if (-not $ElectronArchiveSha256 -or (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash -ine $ElectronArchiveSha256) {
        throw 'The Electron archive must match the official release SHA-256.'
    }
    $config | Add-Member -NotePropertyName electronDist -NotePropertyValue $archive.FullName
}
$config.directories.output = $output
# Electron Builder normalizes the top-level allowlist separately. A Windows list
# containing only exclusions would become a second matcher that includes everything.
$config.files = @($config.files) + @($config.win.files)
$config.win.PSObject.Properties.Remove('files')
$config | Add-Member -NotePropertyName forceCodeSigning -NotePropertyValue $false -Force
$config.win.signAndEditExecutable = $false
$config.win.PSObject.Properties.Remove('azureSignOptions')
$config.afterPack = Join-Path $appDirectory $config.afterPack
$config.afterSign = $null
$configPath = Join-Path ([IO.Path]::GetTempPath()) ("lastbrowser-store-payload-" + [guid]::NewGuid() + '.json')
$config | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $configPath -Encoding utf8

$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
Push-Location $appDirectory
try {
    & node scripts/prepare-local-model-engines.mjs --verify $repoDirectory
    if ($LASTEXITCODE -ne 0) { throw 'The staged Local AI engine inventory is incomplete or invalid.' }
    foreach ($step in @('prepare:python', 'prepare:space-runtime', 'build')) {
        & npm.cmd run $step
        if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" }
    }
    & $builder --dir --win --x64 --publish never --config $configPath
    if ($LASTEXITCODE -ne 0) { throw "Windows payload build failed with exit code $LASTEXITCODE" }
    & node scripts/prepare-local-model-engines.mjs --verify (Join-Path $output 'win-unpacked/resources')
    if ($LASTEXITCODE -ne 0) { throw 'The packaged Local AI engine inventory is incomplete or invalid.' }
    if ($VmpSign) {
        # Electron Builder skips afterSign for this unsigned Windows payload.
        $env:EVS_REQUIRED = '1'
        $env:EVS_NO_ASK = '1'
        & node (Join-Path $PSScriptRoot 'evs-sign.cjs') (Join-Path $output 'win-unpacked')
        if ($LASTEXITCODE -ne 0) { throw "Widevine VMP signing failed with exit code $LASTEXITCODE" }
    }
} finally {
    Pop-Location
    Remove-Item -LiteralPath $configPath -ErrorAction Stop
}

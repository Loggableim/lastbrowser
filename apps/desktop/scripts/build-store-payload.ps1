[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutputDirectory,
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
$config.directories.output = $output
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
    foreach ($step in @('prepare:python', 'prepare:space-runtime', 'build')) {
        & npm.cmd run $step
        if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" }
    }
    & $builder --dir --win --x64 --publish never --config $configPath
    if ($LASTEXITCODE -ne 0) { throw "Windows payload build failed with exit code $LASTEXITCODE" }
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

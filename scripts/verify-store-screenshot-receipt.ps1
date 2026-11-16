[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PackageDirectory,
    [Parameter(Mandatory = $true)]
    [string]$ScreenshotReportPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Read-Sha256([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
    } finally {
        $sha.Dispose()
        $stream.Dispose()
    }
}

$packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path
$reportFile = (Resolve-Path -LiteralPath $ScreenshotReportPath).Path
$imageRoot = Split-Path -Parent $reportFile
$receipt = Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json
$started = [DateTimeOffset]::MinValue
$finished = [DateTimeOffset]::MinValue
if ($receipt.schemaVersion -ne 1 -or $receipt.complete -ne $true -or $null -eq $receipt.exitCode -or $receipt.exitCode -ne 0 -or
    -not [DateTimeOffset]::TryParse([string]$receipt.startedAtUtc, [ref]$started) -or
    -not [DateTimeOffset]::TryParse([string]$receipt.finishedAtUtc, [ref]$finished) -or
    $finished -lt $started -or $finished -gt [DateTimeOffset]::UtcNow) {
    throw 'Screenshot receipt must describe a completed capture with valid start and finish times.'
}
if ((Read-Sha256 (Join-Path $packageRoot 'Lastbrowser.exe')) -ne $receipt.executableSha256) {
    throw 'Lastbrowser.exe differs from the captured Windows build.'
}
if ((Read-Sha256 (Join-Path $packageRoot 'resources/app.asar')) -ne $receipt.asarSha256) {
    throw 'app.asar differs from the captured Windows build.'
}

$locales = @('en', 'de', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja')
$captureKeys = @{}
$imageHashes = @{}
$counts = @{}
foreach ($capture in $receipt.captures) {
    if ($capture.locale -cnotin $locales -or $capture.view -cnotmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
        throw 'Unexpected screenshot locale or view.'
    }
    $key = "$($capture.locale)/$($capture.view).png"
    if ($capture.file -cne $key -or $captureKeys.ContainsKey($key)) { throw "Unexpected or duplicate screenshot path: $key" }
    $captureKeys[$key] = $true
    $filePath = Join-Path $imageRoot $key
    if ((Get-Item -LiteralPath $filePath).Length -ge 50MB) { throw "Screenshot exceeds the Store size limit: $key" }
    $hash = Read-Sha256 $filePath
    if ($hash -ne $capture.sha256) { throw "Screenshot hash differs: $key" }
    $imageKey = "$($capture.locale)/$hash"
    if ($imageHashes.ContainsKey($imageKey)) { throw "Duplicate screenshot image: $key" }
    $imageHashes[$imageKey] = $true
    $counts[$capture.locale] += 1
    $image = [System.Drawing.Image]::FromFile($filePath)
    try {
        if ($image.RawFormat.Guid -ne [System.Drawing.Imaging.ImageFormat]::Png.Guid -or
            $image.Width -ne 1920 -or $image.Height -ne 1080) {
            throw "Screenshot must be a true 1920x1080 PNG: $key"
        }
    } finally {
        $image.Dispose()
    }
}
foreach ($locale in $locales) {
    if (-not $counts[$locale] -or $counts[$locale] -gt 10) {
        throw "Provide between one and ten screenshots for $locale."
    }
}
"$($captureKeys.Count) PNGs across $($locales.Count) locales match the packaged EXE and app.asar."

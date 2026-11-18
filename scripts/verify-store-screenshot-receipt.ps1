[CmdletBinding()]
param(
    [string]$PackageDirectory,
    [Parameter(Mandatory = $true)]
    [string]$ScreenshotReportPath,
    [string]$MsixPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not $PackageDirectory -and -not $MsixPath) {
    throw 'Provide the captured PackageDirectory or MsixPath.'
}

function Read-StreamSha256([IO.Stream]$Stream) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        [BitConverter]::ToString($sha.ComputeHash($Stream)).Replace('-', '')
    } finally {
        $sha.Dispose()
    }
}

function Read-Sha256([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    try {
        Read-StreamSha256 $stream
    } finally {
        $stream.Dispose()
    }
}

function Get-UniqueMsixEntry($Archive, [string]$EntryPath) {
    $entries = @($Archive.Entries | Where-Object FullName -ieq $EntryPath)
    if ($entries.Count -ne 1) { throw "MSIX must contain exactly one $EntryPath." }
    $entries[0]
}

function Read-MsixExecutablePath($Archive) {
    $entry = Get-UniqueMsixEntry $Archive 'AppxManifest.xml'
    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.CloseInput = $true
    $reader = [System.Xml.XmlReader]::Create($entry.Open(), $settings)
    try {
        $manifest = [System.Xml.XmlDocument]::new()
        $manifest.Load($reader)
    } finally {
        $reader.Dispose()
    }
    $application = $manifest.DocumentElement.SelectSingleNode("*[local-name()='Applications']/*[local-name()='Application']")
    if (-not $application) { throw 'The MSIX manifest must declare the LastBrowser application.' }
    $executablePath = $application.GetAttribute('Executable').Replace('\', '/')
    if ($executablePath -notmatch 'Lastbrowser\.exe$') { throw 'The MSIX manifest must declare the LastBrowser executable.' }
    $executablePath
}

function Assert-MsixEntryHash($Archive, [string]$EntryPath, [string]$ExpectedHash) {
    $entry = Get-UniqueMsixEntry $Archive $EntryPath
    $stream = $entry.Open()
    try {
        if ((Read-StreamSha256 $stream) -ne $ExpectedHash) {
            throw "MSIX entry $EntryPath differs from the captured Windows build."
        }
    } finally {
        $stream.Dispose()
    }
}

$reportFile = (Resolve-Path -LiteralPath $ScreenshotReportPath).Path
$imageRoot = Split-Path -Parent $reportFile
$receipt = Get-Content -LiteralPath $reportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$started = [DateTimeOffset]::MinValue
$finished = [DateTimeOffset]::MinValue
if ($receipt.schemaVersion -ne 1 -or $receipt.complete -ne $true -or $null -eq $receipt.exitCode -or $receipt.exitCode -ne 0 -or
    -not [DateTimeOffset]::TryParse([string]$receipt.startedAtUtc, [ref]$started) -or
    -not [DateTimeOffset]::TryParse([string]$receipt.finishedAtUtc, [ref]$finished) -or
    $finished -lt $started -or $finished -gt [DateTimeOffset]::UtcNow) {
    throw 'Screenshot receipt must describe a completed capture with valid start and finish times.'
}
if ($MsixPath) {
    $expectedArchiveHash = [string]$receipt.msixSha256
    if ([string]$receipt.captureMethod -cne 'registered-msix' -or $expectedArchiveHash -cnotmatch '\A[0-9a-fA-F]{64}\z') {
        throw 'The receipt must describe a registered-msix capture and give its MSIX SHA-256.'
    }
    Add-Type -AssemblyName System.IO.Compression
    $archiveStream = [IO.File]::OpenRead((Resolve-Path -LiteralPath $MsixPath).Path)
    try {
        if ((Read-StreamSha256 $archiveStream) -ne $expectedArchiveHash) {
            throw 'The MSIX SHA-256 differs from the package used for the screenshot capture.'
        }
        $archiveStream.Position = 0
        $archive = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Read, $true)
        try {
            $executablePath = Read-MsixExecutablePath $archive
            $appDirectory = $executablePath.Substring(0, $executablePath.LastIndexOf('/') + 1)
            Assert-MsixEntryHash $archive $executablePath $receipt.executableSha256
            Assert-MsixEntryHash $archive "${appDirectory}resources/app.asar" $receipt.asarSha256
        } finally {
            $archive.Dispose()
        }
    } finally {
        $archiveStream.Dispose()
    }
}

if ($PackageDirectory) {
    $packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path
    if ((Read-Sha256 (Join-Path $packageRoot 'Lastbrowser.exe')) -ne $receipt.executableSha256) {
        throw 'Lastbrowser.exe differs from the captured Windows build.'
    }
    if ((Read-Sha256 (Join-Path $packageRoot 'resources/app.asar')) -ne $receipt.asarSha256) {
        throw 'app.asar differs from the captured Windows build.'
    }
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
$verifiedTarget = if ($MsixPath) { 'the exact MSIX and its packaged EXE and app.asar' } else { 'the packaged EXE and app.asar' }
"$($captureKeys.Count) PNGs across $($locales.Count) locales match $verifiedTarget."

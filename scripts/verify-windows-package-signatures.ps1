# Verifies the unpacked Windows payload and optional final NSIS installer.
# Read-only: this script never signs or changes a release binary.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PackageDirectory,
    [string]$InstallerPath,
    [string]$ReportPath
)

$ErrorActionPreference = 'Stop'
$packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path
if (-not (Test-Path -LiteralPath $packageRoot -PathType Container)) {
    throw "Windows package directory does not exist: $PackageDirectory"
}
if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'Lastbrowser.exe') -PathType Leaf)) {
    throw "Lastbrowser.exe is missing from the Windows package: $packageRoot"
}

function Test-PortableExecutable([string]$FilePath) {
    $stream = [System.IO.File]::OpenRead($FilePath)
    $reader = [System.IO.BinaryReader]::new($stream)
    try {
        if ($stream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5A4D) { return $false }
        $stream.Position = 0x3C
        $peOffset = $reader.ReadUInt32()
        if ($peOffset -lt 64 -or $peOffset -gt ($stream.Length - 4)) { return $false }
        $stream.Position = $peOffset
        return $reader.ReadUInt32() -eq 0x00004550
    } finally {
        $reader.Dispose()
    }
}

$nativeFiles = @(Get-ChildItem -LiteralPath $packageRoot -Recurse -File |
    Where-Object { $_.Extension -in '.exe', '.dll', '.pyd', '.node' } |
    Sort-Object FullName)
if ($InstallerPath) {
    $installerFile = Get-Item -LiteralPath (Resolve-Path -LiteralPath $InstallerPath).Path
    if ($installerFile.PSIsContainer -or $installerFile.Extension -notin '.exe', '.msi') {
        throw 'The final installer must be an existing EXE or MSI file.'
    }
    $nativeFiles += $installerFile
}

$results = @(
    foreach ($nativeFile in $nativeFiles) {
        $relativePath = $nativeFile.FullName
        if ($relativePath.StartsWith($packageRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
            $relativePath = $relativePath.Substring($packageRoot.Length + 1)
        } else {
            $relativePath = 'installer/' + $nativeFile.Name
        }
        $isInstaller = $InstallerPath -and $nativeFile.FullName -eq $installerFile.FullName
        $isPe = Test-PortableExecutable $nativeFile.FullName
        if (-not $isPe -and -not ($isInstaller -and $nativeFile.Extension -eq '.msi')) {
            [pscustomobject]@{
                File = $relativePath; Status = 'UnsupportedNativeFormat'
                Timestamped = $false; Thumbprint = $null
            }
            continue
        }
        $signature = Get-AuthenticodeSignature -LiteralPath $nativeFile.FullName
        [pscustomobject]@{
            File = $relativePath
            Status = [string]$signature.Status
            Timestamped = $null -ne $signature.TimeStamperCertificate
            Thumbprint = $signature.SignerCertificate.Thumbprint
        }
    }
)
$failures = @($results | Where-Object { $_.Status -ne 'Valid' -or -not $_.Timestamped })
$report = [pscustomobject]@{
    SchemaVersion = 1
    VerifiedAtUtc = [DateTime]::UtcNow.ToString('o')
    InstallerIncluded = [bool]$InstallerPath
    CheckedFiles = $results.Count
    FailedFiles = $failures.Count
    Files = $results
}
if ($ReportPath) {
    $resolvedReportPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReportPath)
    [System.IO.File]::WriteAllText($resolvedReportPath, ($report | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
}
foreach ($failure in $failures) {
    Write-Host "[FAIL] $($failure.File): $($failure.Status), timestamp=$($failure.Timestamped)"
}
Write-Host "Windows package signatures: $($results.Count) checked, $($failures.Count) failed."
if ($failures.Count -gt 0) {
    throw 'Windows package signature verification failed. Do not submit this package.'
}
if (-not $InstallerPath) {
    Write-Warning 'Payload verified; the final installer was not supplied and still needs verification.'
}

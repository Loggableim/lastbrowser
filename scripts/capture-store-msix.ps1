#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$MsixPath,
    [Parameter(Mandatory)][ValidatePattern('\A[0-9a-fA-F]{64}\z')][string]$ExpectedSha256,
    [Parameter(Mandatory)][string]$PackageRoot,
    [Parameter(Mandatory)][string]$FixtureRoot,
    [Parameter(Mandatory)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSEdition -ne 'Desktop') {
    throw 'Use Windows PowerShell 5.1 for the local MSIX capture.'
}
$node = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
$archivePath = (Resolve-Path -LiteralPath $MsixPath).Path
if ([IO.Path]::GetExtension($archivePath) -ine '.msix') { throw 'Pass the exact .msix archive.' }
$packageItem = Get-Item -LiteralPath $PackageRoot
if (-not $packageItem.PSIsContainer -or ($packageItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Use a real, unpacked package directory.'
}
$packagePath = $packageItem.FullName.TrimEnd('\')
$packagePrefix = "$packagePath\"
$fixturePath = $PSCmdlet.GetUnresolvedProviderPathFromPSPath($FixtureRoot)
$outputPath = $PSCmdlet.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
foreach ($target in $fixturePath, $outputPath) {
    $parent = Get-Item -LiteralPath (Split-Path -Parent $target)
    if ((Test-Path -LiteralPath $target) -or $target.StartsWith($packagePrefix, [StringComparison]::OrdinalIgnoreCase) -or
        -not $parent.PSIsContainer -or ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Use fresh paths with existing parent directories outside the package.'
    }
}
if ($fixturePath -ieq $outputPath -or $fixturePath.StartsWith("$outputPath\", [StringComparison]::OrdinalIgnoreCase) -or
    $outputPath.StartsWith("$fixturePath\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The fixture and capture must use separate directories.'
}

$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
if ($archiveHash -ine $ExpectedSha256) { throw 'The archive differs from the expected MSIX SHA-256.' }
$devMode = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -ErrorAction SilentlyContinue
if ($devMode.AllowDevelopmentWithoutDevLicense -ne 1) { throw 'Developer registration must already be enabled on this test system.' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

[ComImport, Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IStoreCaptureActivationManager {
    [PreserveSig]
    int ActivateApplication(
        [MarshalAs(UnmanagedType.LPWStr)] string modelId,
        [MarshalAs(UnmanagedType.LPWStr)] string arguments,
        int options, out uint processId);
}

public static class LastBrowserStoreCapture {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern int GetPackageFullName(IntPtr process, ref uint length, StringBuilder value);
    [DllImport("iphlpapi.dll")]
    static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool sort, int family, int tableClass, uint reserved);

    public static uint Activate(string modelId, string arguments) {
        var type = Type.GetTypeFromCLSID(new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C"));
        var manager = (IStoreCaptureActivationManager)Activator.CreateInstance(type);
        try {
            uint pid;
            Marshal.ThrowExceptionForHR(manager.ActivateApplication(modelId, arguments, 0, out pid));
            return pid;
        } finally { Marshal.ReleaseComObject(manager); }
    }

    public static string PackageName(IntPtr process) {
        uint length = 0;
        int result = GetPackageFullName(process, ref length, null);
        if (result != 122) throw new Win32Exception(result);
        var name = new StringBuilder((int)length);
        result = GetPackageFullName(process, ref length, name);
        if (result != 0) throw new Win32Exception(result);
        return name.ToString();
    }

    public static int LoopbackListenerOwner(int port) {
        const int ipv4 = 2, listenersWithOwner = 3;
        int size = 0;
        if (GetExtendedTcpTable(IntPtr.Zero, ref size, false, ipv4, listenersWithOwner, 0) != 122)
            throw new IOException("Could not size the listener table");
        var table = Marshal.AllocHGlobal(size);
        try {
            if (GetExtendedTcpTable(table, ref size, false, ipv4, listenersWithOwner, 0) != 0)
                throw new IOException("Could not read the listener table");
            int count = Marshal.ReadInt32(table);
            for (int i = 0; i < count; i++) {
                int offset = 4 + i * 24;
                int networkPort = Marshal.ReadInt32(table, offset + 8);
                int localPort = ((networkPort & 255) << 8) | ((networkPort >> 8) & 255);
                if (localPort == port) return Marshal.ReadInt32(table, offset + 4) == 0x0100007F
                    ? Marshal.ReadInt32(table, offset + 20) : -1;
            }
            return 0;
        } finally { Marshal.FreeHGlobal(table); }
    }

    static readonly byte[] Buffer = new byte[65536];
    static readonly SHA256 Hasher = SHA256.Create();

    public static bool VerifyBlocks(string path, long size, string[] blocks) {
        using (var stream = File.OpenRead(path)) {
            if (stream.Length != size) return false;
            foreach (string expected in blocks) {
                int count = (int)Math.Min(Buffer.Length, stream.Length - stream.Position);
                int position = 0;
                while (position < count) {
                    int read = stream.Read(Buffer, position, count - position);
                    if (read <= 0) return false;
                    position += read;
                }
                if (Convert.ToBase64String(Hasher.ComputeHash(Buffer, 0, count)) != expected) return false;
            }
            return stream.Position == stream.Length;
        }
    }
}
'@

function Read-PackageXml([string]$Path) {
    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $reader = [System.Xml.XmlReader]::Create($Path, $settings)
    try {
        $document = [System.Xml.XmlDocument]::new()
        $document.Load($reader)
        $document
    } finally { $reader.Dispose() }
}

$blockMapName = 'AppxBlockMap.xml'
$contentTypesName = '[Content_Types].xml'
$blockMapPath = Join-Path $packagePath $blockMapName
$allowed = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$archiveMembers = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
[void]$allowed.Add($blockMapName)
[void]$allowed.Add($contentTypesName)
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    if ($archive.GetEntry('AppxSignature.p7x')) { throw 'Use the unsigned Store archive for this developer-registration capture.' }
    foreach ($entry in $archive.Entries) {
        if (-not $entry.Name) { continue }
        $archiveName = [Uri]::UnescapeDataString($entry.FullName).Replace('/', '\')
        if (-not $archiveMembers.Add($archiveName)) { throw 'The archive contains duplicate package paths.' }
    }
    foreach ($name in $blockMapName, $contentTypesName) {
        $entry = $archive.GetEntry($name)
        if (-not $entry) { throw "The archive is missing $name." }
        $member = Get-Item -LiteralPath (Join-Path $packagePath $name)
        if ($member.PSIsContainer -or ($member.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Unexpected extracted metadata file $name."
        }
        $stream = $entry.Open()
        try {
            if ((Get-FileHash -InputStream $stream).Hash -cne (Get-FileHash -LiteralPath $member.FullName).Hash) {
                throw "Extracted metadata differs from the archive ($name)."
            }
        } finally { $stream.Dispose() }
    }
} finally { $archive.Dispose() }

$packageItems = @(Get-ChildItem -LiteralPath $packagePath -Recurse -Force)
if ($packageItems | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1) {
    throw 'The extracted package contains a redirected file or directory.'
}
$blockMap = Read-PackageXml $blockMapPath
if ($blockMap.DocumentElement.GetAttribute('HashMethod') -cne 'http://www.w3.org/2001/04/xmlenc#sha256') {
    throw 'The package block map must use SHA-256.'
}
$blockFiles = $blockMap.DocumentElement.SelectNodes("*[local-name()='File']")
foreach ($file in $blockFiles) {
    $name = $file.GetAttribute('Name')
    $fullPath = [IO.Path]::GetFullPath((Join-Path $packagePath $name))
    if (-not $fullPath.StartsWith($packagePrefix, [StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.Substring($packagePrefix.Length) -ine $name -or -not $allowed.Add($name)) {
        throw 'The package block map has an escaped, noncanonical or duplicate path.'
    }
    [string[]]$hashes = @($file.SelectNodes("*[local-name()='Block']") | ForEach-Object { $_.GetAttribute('Hash') })
    if (-not [LastBrowserStoreCapture]::VerifyBlocks($fullPath, [long]$file.GetAttribute('Size'), $hashes)) {
        throw "Extracted data differs from the archive ($name)."
    }
}
foreach ($file in $packageItems) {
    if (-not $file.PSIsContainer -and -not $allowed.Contains($file.FullName.Substring($packagePrefix.Length))) {
        throw "Unexpected file in the extracted package: $($file.FullName.Substring($packagePrefix.Length))."
    }
}
if (-not $allowed.SetEquals($archiveMembers)) { throw 'The archive entries differ from its block map.' }
if (-not $allowed.Contains('AppxManifest.xml')) { throw 'The archive block map must cover the manifest.' }

$manifestPath = Join-Path $packagePath 'AppxManifest.xml'
$manifest = Read-PackageXml $manifestPath
$identity = $manifest.DocumentElement.SelectSingleNode("*[local-name()='Identity']")
$application = $manifest.DocumentElement.SelectSingleNode("*[local-name()='Applications']/*[local-name()='Application']")
if (-not $identity -or -not $application -or $application.GetAttribute('Id') -cne 'LastBrowser' -or
    $application.GetAttribute('EntryPoint') -cne 'Windows.FullTrustApplication') { throw 'Expected the desktop LastBrowser manifest application.' }
$identityName = $identity.GetAttribute('Name')
if ($identityName -notmatch '\A[0-9a-zA-Z.-]{3,50}\z') { throw 'Unexpected MSIX identity name.' }
$relativeExe = $application.GetAttribute('Executable').Replace('/', '\')
if (-not $allowed.Contains($relativeExe) -or [IO.Path]::GetFileName($relativeExe) -ine 'Lastbrowser.exe') {
    throw 'The archive block map must cover the manifest executable.'
}
$executable = Join-Path $packagePath $relativeExe
$relativeAppDirectory = $relativeExe.Substring(0, $relativeExe.LastIndexOf('\') + 1)
$relativeAsar = "${relativeAppDirectory}resources\app.asar"
if (-not $allowed.Contains($relativeAsar)) { throw 'The archive block map must cover app.asar.' }
$asar = Join-Path $packagePath $relativeAsar

function New-LoopbackReservation {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $listener
}

function Get-BrowserDefaults {
    foreach ($kind in 'http', 'https', '.html', '.htm', '.shtml', '.xhtml') {
        $key = if ($kind.StartsWith('.')) {
            "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$kind\UserChoice"
        } else {
            "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\$kind\UserChoice"
        }
        $choice = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
        "$kind|$($choice.ProgId)|$($choice.Hash)"
    }
}

function Get-PackageProcesses {
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -and $_.Path.StartsWith($packagePrefix, [StringComparison]::OrdinalIgnoreCase) }
        catch { $false }
    }
}

$captureDriver = Join-Path $PSScriptRoot 'capture-store-package.cjs'
$closeDriver = Join-Path $PSScriptRoot 'close-store-capture.mjs'
$receiptPath = Join-Path $outputPath 'capture-report.json'
$expectedViews = foreach ($locale in 'en', 'de', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja') {
    foreach ($view in 'browser', 'downloads', 'appearance', 'preferences') { "$locale/$view" }
}
$defaultsBefore = @(Get-BrowserDefaults)
if ((Get-AppxPackage -Name $identityName) -or (Get-Process -Name Lastbrowser -ErrorAction SilentlyContinue) -or (Get-PackageProcesses)) {
    throw 'Use a Windows test session without a LastBrowser process or this package registration.'
}
New-Item -ItemType Directory -Path $fixturePath | Out-Null
$profile = Join-Path $fixturePath 'profile'
$registrationAttempted = $false
$process = $null
$proxy = $debug = $inspector = $null
$receipt = $null
try {
    $proxy = New-LoopbackReservation
    $debug = New-LoopbackReservation
    $inspector = New-LoopbackReservation
    $debugPort = $debug.LocalEndpoint.Port
    $inspectorPort = $inspector.LocalEndpoint.Port
    $proxyPort = $proxy.LocalEndpoint.Port
    $debug.Stop()
    $inspector.Stop()

    $registrationAttempted = $true
    Add-AppxPackage -Path $manifestPath -Register -ErrorAction Stop
    $registered = Get-AppxPackage -Name $identityName
    if (-not $registered -or $registered.InstallLocation -ine $packagePath -or $registered.Publisher -cne $identity.GetAttribute('Publisher')) {
        throw 'The registered package differs from the verified extraction.'
    }
    if (Get-Process -Name Lastbrowser -ErrorAction SilentlyContinue) { throw 'LastBrowser is already running.' }
    $modelId = "$($registered.PackageFamilyName)!$($application.GetAttribute('Id'))"
    $launchArgs = '--user-data-dir="' + $profile + '" --remote-debugging-address=127.0.0.1 --remote-debugging-port=' + $debugPort +
        ' --inspect=127.0.0.1:' + $inspectorPort + ' --disable-background-networking --disable-component-update' +
        ' --proxy-server=http://127.0.0.1:' + $proxyPort
    $activatedPid = [LastBrowserStoreCapture]::Activate($modelId, $launchArgs)
    $candidate = Get-Process -Id $activatedPid
    $activationDeadline = [DateTime]::UtcNow.AddSeconds(8)
    do {
        $candidate.Refresh()
        if ($candidate.HasExited) { throw 'The activated process exited before Windows exposed its identity.' }
        $pathMatches = $candidate.Path -ieq $executable
        $packageMatches = $false
        if ($pathMatches) {
            try { $packageMatches = [LastBrowserStoreCapture]::PackageName($candidate.Handle) -ceq $registered.PackageFullName }
            catch { $packageMatches = $false }
        }
        if (-not ($pathMatches -and $packageMatches)) { Start-Sleep -Milliseconds 200 }
    } until (($pathMatches -and $packageMatches) -or [DateTime]::UtcNow -ge $activationDeadline)
    if (-not ($pathMatches -and $packageMatches)) {
        throw "Activation did not identify the expected capture process ($($candidate.ProcessName), executable match: $pathMatches, package match: $packageMatches)."
    }
    $process = $candidate
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        $process.Refresh()
        if ($process.HasExited) { throw 'The registered process exited before its capture window opened.' }
        $debugOwner = [LastBrowserStoreCapture]::LoopbackListenerOwner($debugPort)
        $inspectorOwner = [LastBrowserStoreCapture]::LoopbackListenerOwner($inspectorPort)
        if ($debugOwner -notin @(0, $process.Id) -or $inspectorOwner -notin @(0, $process.Id)) {
            throw 'A capture port belongs to another process or is not bound to loopback.'
        }
        $ready = $debugOwner -eq $process.Id -and $inspectorOwner -eq $process.Id -and $process.MainWindowHandle -ne 0 -and
            (Test-Path -LiteralPath (Join-Path $profile 'Local State') -PathType Leaf)
        if (-not $ready) { Start-Sleep -Milliseconds 200 }
    } until ($ready -or [DateTime]::UtcNow -ge $deadline)
    if (-not $ready) { throw 'The verified window and debugging listeners were not ready.' }

    & $node $captureDriver $executable $outputPath --attached-port "$debugPort"
    if ($LASTEXITCODE -ne 0) { throw 'The registered MSIX capture failed.' }
    $receiptItem = Get-Item -LiteralPath $receiptPath
    if ($receiptItem.PSIsContainer -or (($receiptItem.Attributes -bor (Get-Item -LiteralPath $outputPath).Attributes) -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'The pending receipt or its directory is redirected.'
    }
    $pendingHash = (Get-FileHash -LiteralPath $receiptPath).Hash
    $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $actualViews = @($receipt.captures | ForEach-Object { "$($_.locale)/$($_.view)" })
    if ($receipt.schemaVersion -ne 1 -or $receipt.captureComplete -isnot [bool] -or -not $receipt.captureComplete -or
        $receipt.complete -isnot [bool] -or $receipt.complete -or
        (($actualViews | Sort-Object) -join '|') -cne (($expectedViews | Sort-Object) -join '|') -or
        $receipt.executableSha256 -ine (Get-FileHash -LiteralPath $executable).Hash -or
        $receipt.asarSha256 -ine (Get-FileHash -LiteralPath $asar).Hash) {
        throw 'Capture did not produce a complete set of images and a pending receipt for the verified payload.'
    }
    if ([LastBrowserStoreCapture]::LoopbackListenerOwner($inspectorPort) -ne $process.Id) {
        throw 'The original process no longer owns the loopback inspector.'
    }
    & $node $closeDriver "$inspectorPort" "$($process.Id)" $executable $profile
    if ($LASTEXITCODE -ne 0 -or -not $process.WaitForExit(30000) -or $process.ExitCode -ne 0) {
        throw 'The verified process did not exit normally after app.quit().'
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        $closed = -not (Get-PackageProcesses) -and [LastBrowserStoreCapture]::LoopbackListenerOwner($debugPort) -eq 0 -and
            [LastBrowserStoreCapture]::LoopbackListenerOwner($inspectorPort) -eq 0
        if (-not $closed) { Start-Sleep -Milliseconds 200 }
    } until ($closed -or [DateTime]::UtcNow -ge $deadline)
    if (-not $closed) { throw 'Package processes or capture listeners still remain.' }
} finally {
    try {
        if ($process -and -not $process.HasExited) {
            try {
                if ([LastBrowserStoreCapture]::LoopbackListenerOwner($inspectorPort) -eq $process.Id) {
                    & $node $closeDriver "$inspectorPort" "$($process.Id)" $executable $profile
                    if ($LASTEXITCODE -eq 0) { [void]$process.WaitForExit(10000) }
                }
            } finally {
                if (-not $process.HasExited) {
                    $process.Kill()
                    [void]$process.WaitForExit(10000)
                }
            }
        }
    } finally {
        foreach ($listener in $debug, $inspector, $proxy) { if ($listener) { $listener.Stop() } }
        if ($registrationAttempted) {
            $ours = Get-AppxPackage -Name $identityName | Where-Object InstallLocation -ieq $packagePath
            if ($ours) { Remove-AppxPackage -Package $ours.PackageFullName -ErrorAction Stop }
            if (Get-AppxPackage -Name $identityName | Where-Object InstallLocation -ieq $packagePath) {
                throw 'The developer registration was not removed.'
            }
        }
        if (($process -and -not $process.HasExited) -or (Get-PackageProcesses)) { throw 'A capture process survived cleanup.' }
        if ((@(Get-BrowserDefaults) -join "`n") -cne ($defaultsBefore -join "`n")) { throw 'Windows browser associations changed during capture.' }
    }
}

$receipt.complete = $true
$receipt | Add-Member -NotePropertyName exitCode -NotePropertyValue 0 -Force
$receipt | Add-Member -NotePropertyName finishedAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$receipt | Add-Member -NotePropertyName captureMethod -NotePropertyValue 'registered-msix' -Force
$receipt | Add-Member -NotePropertyName msixSha256 -NotePropertyValue $archiveHash.ToLowerInvariant() -Force
$stagedReceipt = Join-Path $outputPath ('capture-report-' + [guid]::NewGuid().ToString('N') + '.tmp')
try {
    [IO.File]::WriteAllText($stagedReceipt, ($receipt | ConvertTo-Json -Depth 10) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    $evidence = & (Join-Path $PSScriptRoot 'verify-store-screenshot-receipt.ps1') -MsixPath $archivePath -ScreenshotReportPath $stagedReceipt
    if ((Get-FileHash -LiteralPath $receiptPath).Hash -cne $pendingHash) { throw 'The pending receipt changed before verification completed.' }
    [IO.File]::Replace($stagedReceipt, $receiptPath, [System.Management.Automation.Language.NullString]::Value)
    Write-Output $evidence
} finally {
    if (Test-Path -LiteralPath $stagedReceipt) { Remove-Item -LiteralPath $stagedReceipt }
}

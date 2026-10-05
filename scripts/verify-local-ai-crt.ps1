<#
.SYNOPSIS
    Lastbrowser - Verification Suite for Local-AI MSVC CRT Bundling & Runtime Startability.
.DESCRIPTION
    Validates runtime build manifest, file sizes, SHA-256 checksums, and PE x64 architecture.
    Assesses presence and resolution of MSVC CRT dependencies (msvcp140.dll, vcruntime140.dll, vcruntime140_1.dll).
    Executes controlled --version and --help invocations with strict timeouts.
    Inspects loaded process modules to distinguish app-local DLL loading from System32 fallback.
    Outputs a structured JSON report distinguishing host launch capability, app-local CRT bundling,
    and clean-Windows acceptance.
#>

[CmdletBinding()]
param(
    [string]$RuntimeDir,
    [string]$ManifestPath,
    [string]$ReportPath,
    [int]$TimeoutSeconds = 10,
    [switch]$RequireClosure = $false,
    [switch]$SkipModuleProbe = $false
)

$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not $RuntimeDir) {
    $RuntimeDir = Join-Path $rootDir "apps\desktop\runtime\local-ai\b11377-cpu"
}
if (-not $ManifestPath) {
    $ManifestPath = Join-Path $RuntimeDir "runtime-build-manifest.json"
}
if (-not $ReportPath) {
    $outputDir = Join-Path $rootDir "output"
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }
    $timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
    $ReportPath = Join-Path $outputDir "local-ai-crt-report-$timestamp.json"
}

$passCount = 0
$failCount = 0
$warnCount = 0
$infoCount = 0

function Write-SectionHeader([string]$title) {
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 72) -ForegroundColor Cyan
}

function Report-Pass([string]$name, [string]$detail = "") {
    $script:passCount++
    if ($detail) {
        Write-Host "  [PASS] $name - $detail" -ForegroundColor Green
    } else {
        Write-Host "  [PASS] $name" -ForegroundColor Green
    }
}

function Report-Fail([string]$name, [string]$reason) {
    $script:failCount++
    Write-Host "  [FAIL] $name - $reason" -ForegroundColor Red
}

function Report-Warn([string]$name, [string]$detail) {
    $script:warnCount++
    Write-Host "  [WARN] $name - $detail" -ForegroundColor Yellow
}

function Report-Info([string]$name, [string]$detail) {
    $script:infoCount++
    Write-Host "  [INFO] $name - $detail" -ForegroundColor Gray
}

function Test-PEArchitectureX64([string]$filePath) {
    if (-not (Test-Path $filePath)) { return $false }
    try {
        $fs = [System.IO.File]::OpenRead($filePath)
        $br = New-Object System.IO.BinaryReader($fs)
        try {
            if ($fs.Length -lt 0x40) { return $false }
            $fs.Seek(0x3C, [System.IO.SeekOrigin]::Begin) | Out-Null
            $peOffset = $br.ReadInt32()
            if ($peOffset -lt 0 -or $peOffset -gt ($fs.Length - 0x20)) { return $false }
            $fs.Seek($peOffset, [System.IO.SeekOrigin]::Begin) | Out-Null
            $peSig = $br.ReadUInt32() # 0x00004550 = "PE\0\0"
            if ($peSig -ne 0x00004550) { return $false }
            $machine = $br.ReadUInt16() # 0x8664 = IMAGE_FILE_MACHINE_AMD64
            $fs.Seek($peOffset + 24, [System.IO.SeekOrigin]::Begin) | Out-Null
            $magic = $br.ReadUInt16() # 0x020B = PE32+ (64-bit)
            return ($machine -eq 0x8664 -and $magic -eq 0x020B)
        } finally {
            $br.Close()
            $fs.Close()
        }
    } catch {
        return $false
    }
}

function Get-FreeLoopbackPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ($listener.LocalEndpoint).Port
    $listener.Stop()
    return $port
}

function Invoke-BinaryWithTimeout {
    param(
        [string]$BinaryPath,
        [string]$Arguments,
        [int]$TimeoutSec = 10
    )
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $BinaryPath
    $psi.Arguments = $Arguments
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $proc = [System.Diagnostics.Process]::Start($psi)
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()

    $finished = $proc.WaitForExit($TimeoutSec * 1000)
    $sw.Stop()

    if (-not $finished) {
        try { $proc.Kill() } catch {}
        return [PSCustomObject]@{
            TimedOut = $true
            ExitCode = -1
            Stdout = ""
            Stderr = "Execution timed out after $TimeoutSec seconds"
            DurationMs = $sw.ElapsedMilliseconds
        }
    }

    [System.Threading.Tasks.Task]::WaitAll(@($outTask, $errTask), 1000) | Out-Null

    $stdout = $outTask.Result
    $stderr = $errTask.Result

    return [PSCustomObject]@{
        TimedOut = $false
        ExitCode = $proc.ExitCode
        Stdout = if ($stdout) { $stdout.Trim() } else { "" }
        Stderr = if ($stderr) { $stderr.Trim() } else { "" }
        DurationMs = $sw.ElapsedMilliseconds
    }
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "  Lastbrowser Local-AI MSVC CRT & Runtime Verification Suite" -ForegroundColor Magenta
Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "  Runtime Dir  : $RuntimeDir"
Write-Host "  Manifest Path: $ManifestPath"
Write-Host "  Report Path  : $ReportPath"

# ------------------------------------------------------------------------------
# 1. Manifest Validation & Dynamic Bundle File Check
# ------------------------------------------------------------------------------
Write-SectionHeader "1. Manifest & File Integrity Check (Dynamic File Count)"

if (-not (Test-Path $ManifestPath)) {
    Report-Fail "Manifest Exists" "Manifest file not found at '$ManifestPath'"
    exit 1
}

$manifestRaw = Get-Content -Path $ManifestPath -Raw
$manifest = $manifestRaw | ConvertFrom-Json

$expectedFileCount = $manifest.files.Count
Report-Pass "Manifest Parse" "Loaded manifest for '$($manifest.buildRef)' ($($manifest.arch)/$($manifest.os)) - dynamic count: $expectedFileCount files"

$fileCheckResults = @()
$allFilesValid = $true

foreach ($entry in $manifest.files) {
    $fullPath = Join-Path $RuntimeDir $entry.relativePath
    $exists = Test-Path $fullPath
    $sizeMatch = $false
    $hashMatch = $false
    $isX64 = $null
    $actualBytes = 0
    $actualHash = ""

    if ($exists) {
        $item = Get-Item $fullPath
        $actualBytes = $item.Length
        $sizeMatch = ($actualBytes -eq $entry.bytes)
        $actualHash = (Get-FileHash -Path $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $hashMatch = ($actualHash -eq $entry.sha256.ToLowerInvariant())

        if ($entry.kind -in @("binary", "library")) {
            $isX64 = Test-PEArchitectureX64 $fullPath
        }
    }

    $entryValid = $exists -and $sizeMatch -and $hashMatch -and ($isX64 -ne $false)
    if (-not $entryValid) {
        $allFilesValid = $false
    }

    $fileCheckResults += [PSCustomObject]@{
        relativePath = $entry.relativePath
        kind = $entry.kind
        exists = $exists
        expectedBytes = $entry.bytes
        actualBytes = $actualBytes
        sizeMatch = $sizeMatch
        expectedSha256 = $entry.sha256
        actualSha256 = $actualHash
        hashMatch = $hashMatch
        isX64 = $isX64
        valid = $entryValid
    }
}

if ($allFilesValid) {
    Report-Pass "Manifest Files" "All $expectedFileCount manifest-defined files exist, match SHA-256 and byte sizes, and PE binaries are x64"
} else {
    $failedItems = $fileCheckResults | Where-Object { -not $_.valid }
    Report-Fail "Manifest Files" "$($failedItems.Count) of $expectedFileCount files failed integrity or architecture check"
}

# ------------------------------------------------------------------------------
# 2. MSVC CRT Dependencies Assessment (App-Local vs System32)
# ------------------------------------------------------------------------------
Write-SectionHeader "2. MSVC CRT Dependencies Assessment"

$crtDllNames = @("msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll")
$appLocalCrtAudit = @()
$system32Dir = [System.IO.Path]::Combine($env:SystemRoot, "System32")

$appLocalCount = 0
$system32Count = 0

foreach ($dll in $crtDllNames) {
    $localPath = Join-Path $RuntimeDir $dll
    $localExists = Test-Path $localPath
    $localHash = ""
    $localBytes = 0
    $localX64 = $false

    if ($localExists) {
        $appLocalCount++
        $item = Get-Item $localPath
        $localBytes = $item.Length
        $localHash = (Get-FileHash -Path $localPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $localX64 = Test-PEArchitectureX64 $localPath
    }

    $sysPath = Join-Path $system32Dir $dll
    $sysExists = Test-Path $sysPath
    $sysHash = ""
    $sysBytes = 0

    if ($sysExists) {
        $system32Count++
        $sysItem = Get-Item $sysPath
        $sysBytes = $sysItem.Length
        $sysHash = (Get-FileHash -Path $sysPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }

    $appLocalCrtAudit += [PSCustomObject]@{
        dllName = $dll
        appLocalExists = $localExists
        appLocalPath = if ($localExists) { $localPath } else { $null }
        appLocalBytes = $localBytes
        appLocalSha256 = $localHash
        appLocalX64 = $localX64
        system32Exists = $sysExists
        system32Path = if ($sysExists) { $sysPath } else { $null }
        system32Bytes = $sysBytes
        system32Sha256 = $sysHash
    }
}

if ($appLocalCount -eq 3) {
    Report-Pass "App-Local CRT" "All 3 required MSVC CRT DLLs are present in runtime directory"
} else {
    Report-Warn "App-Local CRT" "$appLocalCount of 3 MSVC CRT DLLs present app-locally in '$RuntimeDir' (packaging pending)"
}

if ($system32Count -eq 3) {
    Report-Info "Host System32 CRT" "Host machine has all 3 MSVC CRT DLLs in C:\Windows\System32 (enables host execution, but masks missing bundle closure)"
} else {
    Report-Info "Host System32 CRT" "$system32Count of 3 MSVC CRT DLLs found in C:\Windows\System32"
}

# ------------------------------------------------------------------------------
# 3. Controlled Runtime Execution (--version and --help)
# ------------------------------------------------------------------------------
Write-SectionHeader "3. Controlled Runtime Execution (--version & --help)"

$serverExe = Join-Path $RuntimeDir "llama-server.exe"
if (-not (Test-Path $serverExe)) {
    Report-Fail "llama-server.exe" "Executable not found at '$serverExe'"
    exit 1
}

$versionRes = Invoke-BinaryWithTimeout -BinaryPath $serverExe -Arguments "--version" -TimeoutSec $TimeoutSeconds
$versionMarker = if ($manifest.versionOutputMarker) { $manifest.versionOutputMarker } else { "11377" }
$versionMarkerFound = ($versionRes.Stdout -like "*$versionMarker*" -or $versionRes.Stderr -like "*$versionMarker*")

if ($versionRes.ExitCode -eq 0 -and $versionMarkerFound) {
    Report-Pass "llama-server --version" "Exit 0 in $($versionRes.DurationMs)ms; found marker '$versionMarker'"
} else {
    Report-Fail "llama-server --version" "Exit $($versionRes.ExitCode), marker '$versionMarker' found: $versionMarkerFound. Stderr: $($versionRes.Stderr)"
}

$helpRes = Invoke-BinaryWithTimeout -BinaryPath $serverExe -Arguments "--help" -TimeoutSec $TimeoutSeconds
$helpMarker = if ($manifest.helpOutputMarker) { $manifest.helpOutputMarker } else { "--ctx-size" }
$helpMarkerFound = ($helpRes.Stdout -like "*$helpMarker*" -or $helpRes.Stderr -like "*$helpMarker*")

if ($helpRes.ExitCode -eq 0 -and $helpMarkerFound) {
    Report-Pass "llama-server --help" "Exit 0 in $($helpRes.DurationMs)ms; help output length $($helpRes.Stdout.Length) chars; found marker '$helpMarker'"
} else {
    Report-Fail "llama-server --help" "Exit $($helpRes.ExitCode), marker '$helpMarker' found: $helpMarkerFound"
}

# ------------------------------------------------------------------------------
# 4. Loaded Module Path Inspection
# ------------------------------------------------------------------------------
Write-SectionHeader "4. Loaded Module Path Inspection"

$loadedCrtModules = @()
$probeSuccess = $false

if (-not $SkipModuleProbe -and $versionRes.ExitCode -eq 0) {
    $probePort = Get-FreeLoopbackPort
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $serverExe
    $psi.Arguments = "--port $probePort --host 127.0.0.1"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $probeProc = $null
    try {
        $probeProc = [System.Diagnostics.Process]::Start($psi)
        Start-Sleep -Milliseconds 350
        $probeProc.Refresh()

        if (-not $probeProc.HasExited) {
            $modules = $probeProc.Modules
            foreach ($mod in $modules) {
                $modName = $mod.ModuleName
                $modPath = $mod.FileName

                if ($modName -in @("msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll", "llama.dll", "llama-server-impl.dll", "msvcp_win.dll")) {
                    $origin = if ($modPath.StartsWith($RuntimeDir, [System.StringComparison]::OrdinalIgnoreCase)) {
                        "AppLocal"
                    } elseif ($modPath.StartsWith($system32Dir, [System.StringComparison]::OrdinalIgnoreCase)) {
                        "System32Fallback"
                    } else {
                        "Other"
                    }

                    $loadedCrtModules += [PSCustomObject]@{
                        moduleName = $modName
                        loadedPath = $modPath
                        origin = $origin
                    }
                }
            }
            $probeSuccess = $true
        }
    } catch {
        Report-Warn "Module Probe" "Failed to inspect process modules: $($_.Exception.Message)"
    } finally {
        if ($probeProc -and -not $probeProc.HasExited) {
            try {
                $probeProc.Kill()
                $probeProc.WaitForExit(1000) | Out-Null
            } catch {}
        }
        if ($probeProc) { $probeProc.Dispose() }
    }
}

if ($loadedCrtModules.Count -gt 0) {
    foreach ($m in $loadedCrtModules) {
        if ($m.origin -eq "AppLocal") {
            Report-Pass "Module $($m.moduleName)" "Loaded app-locally from $($m.loadedPath)"
        } elseif ($m.origin -eq "System32Fallback") {
            Report-Warn "Module $($m.moduleName)" "Loaded from host System32: $($m.loadedPath)"
        } else {
            Report-Info "Module $($m.moduleName)" "Loaded from $($m.loadedPath)"
        }
    }
} else {
    Report-Info "Module Probe" "No process module paths logged (skipped or unavailable)"
}

# ------------------------------------------------------------------------------
# 5. Three-Tier Verdict & JSON Report Generation
# ------------------------------------------------------------------------------
Write-SectionHeader "5. Verification Verdict & Three-Tier Evaluation"

$hostLaunchVerified = ($versionRes.ExitCode -eq 0 -and $versionMarkerFound -and $helpRes.ExitCode -eq 0 -and $helpMarkerFound)
$appLocalCrtVerified = ($appLocalCount -eq 3)
# Clean Windows acceptance requires execution in an isolated clean environment lacking System32 CRT.
# It CANNOT be verified on the development host because the host provides System32 fallback.
$cleanWindowsAcceptanceVerified = $false
$cleanWindowsAcceptanceReason = "Host machine contains preinstalled C:\Windows\System32\msvcp140.dll. Verification of full offline closure on clean Windows requires execution inside an isolated VM or Windows Sandbox lacking host System32 CRT."

if ($hostLaunchVerified) {
    Report-Pass "Tier 1: Host Launch" "llama-server.exe starts and executes --version and --help successfully on host"
} else {
    Report-Fail "Tier 1: Host Launch" "Runtime failed to execute on host"
}

if ($appLocalCrtVerified) {
    Report-Pass "Tier 2: App-Local CRT Bundling" "All 3 MSVC CRT DLLs are present in runtime directory"
} else {
    Report-Warn "Tier 2: App-Local CRT Bundling" "MSVC CRT DLLs not yet bundled in runtime directory ($appLocalCount/3 present)"
}

Report-Info "Tier 3: Clean Windows Acceptance" "Status: OPEN / UNVERIFIED - $cleanWindowsAcceptanceReason"

$overallVerdict = if (-not $hostLaunchVerified) {
    "FAIL"
} elseif ($appLocalCrtVerified -and $cleanWindowsAcceptanceVerified) {
    "PASS"
} else {
    "WARN"
}

$report = [PSCustomObject]@{
    timestampUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    buildRef = $manifest.buildRef
    arch = $manifest.arch
    os = $manifest.os
    runtimeDir = $RuntimeDir
    manifestPath = $ManifestPath
    dynamicManifestFileCount = $expectedFileCount
    manifestSummary = [PSCustomObject]@{
        totalFiles = $expectedFileCount
        allFilesValid = $allFilesValid
        failedCount = ($fileCheckResults | Where-Object { -not $_.valid }).Count
    }
    fileChecks = $fileCheckResults
    crtAssessment = [PSCustomObject]@{
        appLocalCount = $appLocalCount
        appLocalComplete = ($appLocalCount -eq 3)
        system32Count = $system32Count
        system32Available = ($system32Count -eq 3)
        dlls = $appLocalCrtAudit
    }
    runtimeExecution = [PSCustomObject]@{
        version = [PSCustomObject]@{
            exitCode = $versionRes.ExitCode
            durationMs = $versionRes.DurationMs
            markerFound = $versionMarkerFound
            stderrExcerpt = $versionRes.Stderr.Substring(0, [Math]::Min(120, $versionRes.Stderr.Length))
        }
        help = [PSCustomObject]@{
            exitCode = $helpRes.ExitCode
            durationMs = $helpRes.DurationMs
            markerFound = $helpMarkerFound
            outputChars = $helpRes.Stdout.Length
        }
    }
    loadedModules = $loadedCrtModules
    verdict = [PSCustomObject]@{
        status = $overallVerdict
        host_launch_verified = $hostLaunchVerified
        app_local_crt_verified = $appLocalCrtVerified
        clean_windows_acceptance_verified = $cleanWindowsAcceptanceVerified
        clean_windows_acceptance_reason = $cleanWindowsAcceptanceReason
        notes = "Host execution proves host launch capability only. App-local CRT bundling and clean-machine closure require standalone files and isolated VM/Sandbox certification."
    }
}

$reportJson = $report | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($ReportPath, $reportJson, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "Verification Report saved to: $ReportPath" -ForegroundColor Cyan
Write-Host "Overall Status: $overallVerdict (Pass: $passCount, Warn: $warnCount, Fail: $failCount, Info: $infoCount)" -ForegroundColor $(if ($overallVerdict -eq "FAIL") { "Red" } elseif ($overallVerdict -eq "WARN") { "Yellow" } else { "Green" })
Write-Host ""

if ($RequireClosure) {
    if ($overallVerdict -ne "PASS") {
        exit 1
    }
} else {
    if ($failCount -gt 0) {
        exit 1
    }
}

exit 0

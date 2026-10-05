<#
.SYNOPSIS
    Lastbrowser - Guest Verification Script for Windows Sandbox / Clean VM.
.DESCRIPTION
    Validates MSVC CRT dependency closure in an isolated Windows environment.
    First inventories guest System32 to determine whether VC++ CRT is preinstalled.
    Executes a negative control run (without app-local CRT) and certifies it ONLY if
    the guest System32 genuinely lacks the CRT and failure is observed.
    Executes a positive run (with app-local CRT) to certify standalone offline execution.
    Outputs a structured JSON report.
#>

[CmdletBinding()]
param(
    [string]$SourceRuntimeDir = "C:\lastbrowser\apps\desktop\runtime\local-ai\b11377-cpu",
    [string]$ReportPath
)

$ErrorActionPreference = "Stop"

if (-not $ReportPath) {
    $desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
    if ($desktopPath -and (Test-Path $desktopPath)) {
        $ReportPath = Join-Path $desktopPath "guest-crt-closure-report.json"
    } else {
        $ReportPath = Join-Path ([System.IO.Path]::GetTempPath()) "guest-crt-closure-report.json"
    }
}

function Write-SectionHeader([string]$title) {
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 72) -ForegroundColor Cyan
}

function Report-Pass([string]$name, [string]$detail = "") {
    if ($detail) {
        Write-Host "  [PASS] $name - $detail" -ForegroundColor Green
    } else {
        Write-Host "  [PASS] $name" -ForegroundColor Green
    }
}

function Report-Fail([string]$name, [string]$reason) {
    Write-Host "  [FAIL] $name - $reason" -ForegroundColor Red
}

function Report-Warn([string]$name, [string]$detail) {
    Write-Host "  [WARN] $name - $detail" -ForegroundColor Yellow
}

function Report-Info([string]$name, [string]$detail) {
    Write-Host "  [INFO] $name - $detail" -ForegroundColor Gray
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
    $proc = $null
    try {
        $proc = [System.Diagnostics.Process]::Start($psi)
    } catch {
        $sw.Stop()
        return [PSCustomObject]@{
            Started = $false
            TimedOut = $false
            ExitCode = -1
            Stdout = ""
            Stderr = $_.Exception.Message
            DurationMs = $sw.ElapsedMilliseconds
        }
    }

    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()

    $finished = $proc.WaitForExit($TimeoutSec * 1000)
    $sw.Stop()

    if (-not $finished) {
        try { $proc.Kill() } catch {}
        return [PSCustomObject]@{
            Started = $true
            TimedOut = $true
            ExitCode = -1
            Stdout = ""
            Stderr = "Execution timed out after $TimeoutSec seconds"
            DurationMs = $sw.ElapsedMilliseconds
        }
    }

    [System.Threading.Tasks.Task]::WaitAll(@($outTask, $errTask), 1000) | Out-Null

    return [PSCustomObject]@{
        Started = $true
        TimedOut = $false
        ExitCode = $proc.ExitCode
        Stdout = if ($outTask.Result) { $outTask.Result.Trim() } else { "" }
        Stderr = if ($errTask.Result) { $errTask.Result.Trim() } else { "" }
        DurationMs = $sw.ElapsedMilliseconds
    }
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "  Lastbrowser Local-AI Clean-Windows CRT Acceptance (Guest Runner)" -ForegroundColor Magenta
Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "  Source Runtime: $SourceRuntimeDir"
Write-Host "  Report Path   : $ReportPath"

# ------------------------------------------------------------------------------
# 1. Guest System32 Environment Audit
# ------------------------------------------------------------------------------
Write-SectionHeader "1. Guest System32 Environment Audit"

$crtDllNames = @("msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll")
$guestSystem32Dir = [System.IO.Path]::Combine($env:SystemRoot, "System32")
$guestSystem32Audit = @()
$guestSystem32CrtCount = 0

foreach ($dll in $crtDllNames) {
    $p = Join-Path $guestSystem32Dir $dll
    $exists = Test-Path $p
    $bytes = 0
    if ($exists) {
        $guestSystem32CrtCount++
        $bytes = (Get-Item $p).Length
    }
    $guestSystem32Audit += [PSCustomObject]@{
        dllName = $dll
        exists = $exists
        bytes = $bytes
    }
}

$guestIsCleanWindows = ($guestSystem32CrtCount -eq 0)

if ($guestIsCleanWindows) {
    Report-Pass "Guest Environment" "CLEAN WINDOWS CONFIRMED: No MSVC CRT DLLs found in C:\Windows\System32"
} else {
    Report-Warn "Guest Environment" "BASE OS CONTAMINATED: $guestSystem32CrtCount of 3 MSVC CRT DLLs already exist in C:\Windows\System32!"
    Report-Warn "Guest Environment" "A negative test cannot serve as valid negative proof on this base image because System32 satisfies CRT imports."
}

# ------------------------------------------------------------------------------
# 2. Phase 1: Negative Control Run (Without App-Local CRT)
# ------------------------------------------------------------------------------
Write-SectionHeader "2. Phase 1: Negative Control Run (Without App-Local CRT)"

$scratchRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lb-guest-test-" + [System.Guid]::NewGuid().ToString("N"))
$negativeDir = Join-Path $scratchRoot "negative-no-crt"
$positiveDir = Join-Path $scratchRoot "positive-app-local-crt"

New-Item -ItemType Directory -Path $negativeDir -Force | Out-Null
New-Item -ItemType Directory -Path $positiveDir -Force | Out-Null

$negativeControlProofValid = $false
$negativeControlExecution = $null

try {
    # Copy all runtime files EXCLUDING CRT DLLs into negative test dir
    Get-ChildItem -Path $SourceRuntimeDir | Where-Object {
        $_.Name -notin $crtDllNames
    } | Copy-Item -Destination $negativeDir -Recurse -Force

    $negExe = Join-Path $negativeDir "llama-server.exe"
    $negRes = Invoke-BinaryWithTimeout -BinaryPath $negExe -Arguments "--version" -TimeoutSec 5
    $negativeControlExecution = $negRes

    # On clean Windows without CRT, process creation fails or exits with STATUS_DLL_NOT_FOUND (0xC0000135 / -1073741515)
    $dllMissingExit = ($negRes.ExitCode -eq -1073741515 -or $negRes.ExitCode -eq 3221225781 -or -not $negRes.Started)

    if ($guestIsCleanWindows -and ($negRes.ExitCode -ne 0 -or $dllMissingExit)) {
        $negativeControlProofValid = $true
        Report-Pass "Negative Control" "Runtime correctly failed to start without CRT (ExitCode: $($negRes.ExitCode)). Proven missing dependency!"
    } elseif (-not $guestIsCleanWindows) {
        Report-Warn "Negative Control" "Negative test result (ExitCode: $($negRes.ExitCode)) is INVALID as negative proof because System32 already has CRT."
    } else {
        Report-Fail "Negative Control" "Runtime unexpectedly started without CRT on clean Windows! (ExitCode: $($negRes.ExitCode))"
    }

    # ------------------------------------------------------------------------------
    # 3. Phase 2: Positive Test (With App-Local CRT)
    # ------------------------------------------------------------------------------
    Write-SectionHeader "3. Phase 2: Positive Test (With App-Local CRT)"

    # Copy all source files
    Copy-Item -Path "$SourceRuntimeDir\*" -Destination $positiveDir -Recurse -Force

    # Check if app-local CRT DLLs are present in source or need staged placement
    $posCrtFound = 0
    foreach ($dll in $crtDllNames) {
        if (Test-Path (Join-Path $positiveDir $dll)) {
            $posCrtFound++
        }
    }

    $posExe = Join-Path $positiveDir "llama-server.exe"
    $positiveResVersion = $null
    $positiveResHelp = $null
    $positiveLoadedModules = @()

    if ($posCrtFound -eq 3) {
        Report-Pass "App-Local CRT" "All 3 MSVC CRT DLLs present in positive test bundle"

        $positiveResVersion = Invoke-BinaryWithTimeout -BinaryPath $posExe -Arguments "--version" -TimeoutSec 10
        $positiveResHelp = Invoke-BinaryWithTimeout -BinaryPath $posExe -Arguments "--help" -TimeoutSec 10

        if ($positiveResVersion.ExitCode -eq 0 -and $positiveResHelp.ExitCode -eq 0) {
            Report-Pass "Positive Run" "llama-server executed --version (Exit 0) and --help (Exit 0) successfully"
        } else {
            Report-Fail "Positive Run" "llama-server failed with app-local CRT. Version exit: $($positiveResVersion.ExitCode), Help exit: $($positiveResHelp.ExitCode)"
        }

        # Inspect module paths using loopback probe
        $probePort = 59199
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $posExe
        $psi.Arguments = "--port $probePort --host 127.0.0.1"
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true

        $probeProc = $null
        try {
            $probeProc = [System.Diagnostics.Process]::Start($psi)
            Start-Sleep -Milliseconds 400
            $probeProc.Refresh()

            if (-not $probeProc.HasExited) {
                foreach ($mod in $probeProc.Modules) {
                    if ($mod.ModuleName -in @("msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll")) {
                        $isAppLocal = $mod.FileName.StartsWith($positiveDir, [System.StringComparison]::OrdinalIgnoreCase)
                        $positiveLoadedModules += [PSCustomObject]@{
                            moduleName = $mod.ModuleName
                            loadedPath = $mod.FileName
                            isAppLocal = $isAppLocal
                        }
                    }
                }
            }
        } catch {
            Report-Warn "Module Probe" "Could not probe loaded modules: $($_.Exception.Message)"
        } finally {
            if ($probeProc -and -not $probeProc.HasExited) {
                try { $probeProc.Kill(); $probeProc.WaitForExit(1000) | Out-Null } catch {}
            }
            if ($probeProc) { $probeProc.Dispose() }
        }

        $allCrtAppLocal = ($positiveLoadedModules.Count -eq 3 -and ($positiveLoadedModules | Where-Object { -not $_.isAppLocal }).Count -eq 0)
        if ($allCrtAppLocal) {
            Report-Pass "App-Local Resolution" "Verified: All 3 CRT DLLs were loaded strictly from application directory"
        } else {
            Report-Warn "App-Local Resolution" "Not all CRT modules confirmed loaded app-locally"
        }
    } else {
        Report-Warn "App-Local CRT" "Positive run skipped: only $posCrtFound of 3 MSVC CRT DLLs found in source '$SourceRuntimeDir'"
    }

    # ------------------------------------------------------------------------------
    # 4. Final Verdict & Report Generation
    # ------------------------------------------------------------------------------
    Write-SectionHeader "4. Final Verdict & Report Generation"

    $cleanWindowsAccepted = ($guestIsCleanWindows -and $negativeControlProofValid -and ($posCrtFound -eq 3) -and ($positiveResVersion.ExitCode -eq 0))

    $report = [PSCustomObject]@{
        timestampUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        guestEnvironment = [PSCustomObject]@{
            isCleanWindows = $guestIsCleanWindows
            system32Audit = $guestSystem32Audit
        }
        negativeControl = [PSCustomObject]@{
            proofValid = $negativeControlProofValid
            execution = $negativeControlExecution
        }
        positiveControl = [PSCustomObject]@{
            crtFilesFound = $posCrtFound
            versionExecution = $positiveResVersion
            helpExecution = $positiveResHelp
            loadedModules = $positiveLoadedModules
        }
        verdict = [PSCustomObject]@{
            clean_windows_acceptance_verified = $cleanWindowsAccepted
            status = if ($cleanWindowsAccepted) { "CERTIFIED" } else { "PENDING_OR_INCONCLUSIVE" }
        }
    }

    $reportJson = $report | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($ReportPath, $reportJson, [System.Text.Encoding]::UTF8)

    Write-Host ""
    Write-Host "Guest Acceptance Report saved to: $ReportPath" -ForegroundColor Cyan
    Write-Host "Verdict: $(if ($cleanWindowsAccepted) { 'CERTIFIED' } else { 'PENDING_OR_INCONCLUSIVE' })" -ForegroundColor $(if ($cleanWindowsAccepted) { 'Green' } else { 'Yellow' })
    Write-Host ""

} finally {
    Remove-Item -Path $scratchRoot -Recurse -Force -ErrorAction SilentlyContinue
}

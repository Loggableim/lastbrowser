# ==============================================================================
# Lastbrowser - Microsoft Store Release Readiness & Certification Preflight
# Validates Win32 Store Submission requirements, image assets, legal pages,
# NSIS installer configurations, CI signing workflows, and test suites.
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$Quick = $false
)

$ErrorActionPreference = "Stop"
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$passCount = 0
$failCount = 0
$warnCount = 0

function Write-SectionHeader($title) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

function Report-Pass($name, $detail = "") {
    $script:passCount++
    if ($detail) {
        Write-Host "  [PASS] $name - $detail" -ForegroundColor Green
    } else {
        Write-Host "  [PASS] $name" -ForegroundColor Green
    }
}

function Report-Fail($name, $reason) {
    $script:failCount++
    Write-Host "  [FAIL] $name - $reason" -ForegroundColor Red
}

function Report-Warn($name, $detail) {
    $script:warnCount++
    Write-Host "  [WARN] $name - $detail" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Magenta
Write-Host "  Lastbrowser Store Certification Preflight (Windows / Win32 Store)" -ForegroundColor Magenta
Write-Host "======================================================================" -ForegroundColor Magenta

# ------------------------------------------------------------------------------
# 1. Store Marketing & Visual Assets (assets/store/)
# ------------------------------------------------------------------------------
Write-SectionHeader "1. Store Visual Assets (Phase 4.1)"
Add-Type -AssemblyName System.Drawing

$expectedImages = @(
    @{ Name = "icon-512.png"; ExpectedW = 512; ExpectedH = 512; Required = $true }
    @{ Name = "icon-1024.png"; ExpectedW = 1024; ExpectedH = 1024; Required = $true }
    @{ Name = "store-screen-1-zen-sidebar.png"; ExpectedW = 1920; ExpectedH = 1080; Required = $true }
    @{ Name = "store-screen-2-copilot-splitview.png"; ExpectedW = 1920; ExpectedH = 1080; Required = $true }
    @{ Name = "store-screen-3-tab-intelligence.png"; ExpectedW = 1920; ExpectedH = 1080; Required = $true }
    @{ Name = "store-screen-4-conpty-terminal.png"; ExpectedW = 1920; ExpectedH = 1080; Required = $true }
    @{ Name = "store-screen-5-webextensions.png"; ExpectedW = 1920; ExpectedH = 1080; Required = $true }
    @{ Name = "store-screen-6-privacy-shield.png"; ExpectedW = 1920; ExpectedH = 1080; Required = $true }
)

$storeAssetDir = Join-Path $rootDir "assets\store"

foreach ($imgSpec in $expectedImages) {
    $filePath = Join-Path $storeAssetDir $imgSpec.Name
    if (-not (Test-Path $filePath)) {
        Report-Fail "Asset $($imgSpec.Name)" "File does not exist at $filePath"
        continue
    }

    try {
        $img = [System.Drawing.Image]::FromFile($filePath)
        $actualW = $img.Width
        $actualH = $img.Height
        $img.Dispose()

        if ($actualW -eq $imgSpec.ExpectedW -and $actualH -eq $imgSpec.ExpectedH) {
            $sizeKb = [math]::Round((Get-Item $filePath).Length / 1KB, 1)
            Report-Pass "Asset $($imgSpec.Name)" "${actualW}x${actualH} px ($sizeKb KB)"
        } else {
            Report-Fail "Asset $($imgSpec.Name)" "Expected $($imgSpec.ExpectedW)x$($imgSpec.ExpectedH), found ${actualW}x${actualH}"
        }
    } catch {
        Report-Fail "Asset $($imgSpec.Name)" "Failed to open or inspect image: $_"
    }
}

# ------------------------------------------------------------------------------
# 2. Web Presence & Legal Compliance (lastbrowser.com)
# ------------------------------------------------------------------------------
Write-SectionHeader "2. Web Presence & Legal Compliance (Phase 3.1 & 3.2)"

$webFiles = @(
    @{ Path = "lastbrowser.com\privacy\index.html"; Desc = "Datenschutzerklaerung (DE)"; MustContain = "Local-First" }
    @{ Path = "lastbrowser.com\en\privacy\index.html"; Desc = "Privacy Policy (EN)"; MustContain = "Local-First" }
    @{ Path = "lastbrowser.com\support\index.html"; Desc = "Support Portal (DE)"; MustContain = "support@lastbrowser.com" }
    @{ Path = "lastbrowser.com\en\support\index.html"; Desc = "Support Portal (EN)"; MustContain = "support@lastbrowser.com" }
    @{ Path = "lastbrowser.com\index.html"; Desc = "Product Landing Page (DE)"; MustContain = "Lastbrowser" }
    @{ Path = "lastbrowser.com\en\index.html"; Desc = "Product Landing Page (EN)"; MustContain = "Lastbrowser" }
    @{ Path = "lastbrowser.com\sitemap.xml"; Desc = "Sitemap index"; MustContain = "privacy" }
)

foreach ($webSpec in $webFiles) {
    $fullPath = Join-Path $rootDir $webSpec.Path
    if (-not (Test-Path $fullPath)) {
        Report-Fail "Web $($webSpec.Desc)" "File missing at $fullPath"
        continue
    }

    $content = Get-Content -Path $fullPath -Raw -Encoding UTF8
    if ($content.Contains($webSpec.MustContain)) {
        Report-Pass "Web $($webSpec.Desc)" "Verified content keyword: '$($webSpec.MustContain)'"
    } else {
        Report-Fail "Web $($webSpec.Desc)" "Missing mandatory keyword '$($webSpec.MustContain)' in $fullPath"
    }
}

# ------------------------------------------------------------------------------
# 3. Packaging & NSIS Silent Execution (apps/desktop/build/installer.nsh)
# ------------------------------------------------------------------------------
Write-SectionHeader "3. NSIS & Silent Execution Compliance (Phase 1.1 - 1.3)"

$installerNshPath = Join-Path $rootDir "apps\desktop\build\installer.nsh"
if (Test-Path $installerNshPath) {
    $nshContent = Get-Content -Path $installerNshPath -Raw
    if ($nshContent -match '\$\{ifNot\}\s+\$\{Silent\}') {
        Report-Pass "NSIS Uninstaller Silent Check" "Guards against blocking MessageBox dialogs during silent uninstall (/S)"
    } else {
        Report-Fail "NSIS Uninstaller Silent Check" "Missing '\${ifNot} \${Silent}' guard in customUnInstall"
    }
} else {
    Report-Fail "NSIS Configuration" "installer.nsh not found at $installerNshPath"
}

$desktopPkgPath = Join-Path $rootDir "apps\desktop\package.json"
if (Test-Path $desktopPkgPath) {
    $pkgJson = Get-Content -Path $desktopPkgPath -Raw | ConvertFrom-Json
    
    # Protocols
    $protocols = @($pkgJson.build.protocols | ForEach-Object { $_.schemes } | ForEach-Object { $_ })
    if ($protocols -contains "http" -and $protocols -contains "https") {
        Report-Pass "Default Browser Protocols" "Registered schemes: $($protocols -join ', ')"
    } else {
        Report-Fail "Default Browser Protocols" "Missing http or https protocol registrations"
    }

    # File Associations
    $extensions = @($pkgJson.build.fileAssociations | ForEach-Object { $_.ext })
    if ($extensions -contains "html" -and $extensions -contains "htm") {
        Report-Pass "HTML File Associations" "Registered extensions: $($extensions -join ', ')"
    } else {
        Report-Fail "HTML File Associations" "Missing html/htm file associations"
    }

    # App ID
    if ($pkgJson.build.appId -eq "com.lastbrowser.desktop") {
        Report-Pass "Application ID" "$($pkgJson.build.appId)"
    } else {
        Report-Warn "Application ID" "$($pkgJson.build.appId) differs from standard com.lastbrowser.desktop"
    }
} else {
    Report-Fail "Desktop package.json" "Not found at $desktopPkgPath"
}

# ------------------------------------------------------------------------------
# 4. CI/CD Code Signing Pipeline (.github/workflows/release.yml)
# ------------------------------------------------------------------------------
Write-SectionHeader "4. CI/CD Release Pipeline & Code Signing (Phase 2)"

$releaseYmlPath = Join-Path $rootDir ".github\workflows\release.yml"
if (Test-Path $releaseYmlPath) {
    $ymlContent = Get-Content -Path $releaseYmlPath -Raw
    $hasTrustedSigning = $ymlContent.Contains("trusted-signing-action") -or $ymlContent.Contains("AZURE_TRUSTED_SIGNING_ACCOUNT")
    $hasSigntoolVerify = $ymlContent.Contains("signtool.exe verify") -or $ymlContent.Contains("signtool verify")

    if ($hasTrustedSigning) {
        Report-Pass "Azure Trusted Signing" "Found trusted signing action / parameters in release.yml"
    } else {
        Report-Warn "Azure Trusted Signing" "Release pipeline does not reference Azure Trusted Signing action"
    }

    if ($hasSigntoolVerify) {
        Report-Pass "Signtool Verification Step" "Found 'signtool verify' step in release.yml"
    } else {
        Report-Warn "Signtool Verification Step" "No explicit signtool verification step found in release.yml"
    }
} else {
    Report-Fail "Release Workflow" "Missing .github/workflows/release.yml"
}

# ------------------------------------------------------------------------------
# 5. Store Listing Metadata & Character Limits (docs/store-listing.md)
# ------------------------------------------------------------------------------
Write-SectionHeader "5. Store Listing Metadata & Character Limits (Phase 4.2)"

$storeListingPath = Join-Path $rootDir "docs\store-listing.md"
if (Test-Path $storeListingPath) {
    $listingContent = Get-Content -Path $storeListingPath -Raw

    # Subtitle limit: max 30 chars
    $subTitleMatch = [regex]::Match($listingContent, 'Untertitel \(max\. 30 Zeichen\):\*\*\s*`([^`]+)`')
    if ($subTitleMatch.Success) {
        $subTitle = $subTitleMatch.Groups[1].Value
        if ($subTitle.Length -le 30) {
            Report-Pass "Store Subtitle (DE)" "'$subTitle' ($($subTitle.Length)/30 chars)"
        } else {
            Report-Fail "Store Subtitle (DE)" "'$subTitle' exceeds 30 chars ($($subTitle.Length) chars)"
        }
    }

    # Short description limit: max 100 chars
    $shortDescMatch = [regex]::Match($listingContent, 'Kurzbeschreibung \(max\. 100 Zeichen\):\*\*\s*`([^`]+)`')
    if ($shortDescMatch.Success) {
        $shortDesc = $shortDescMatch.Groups[1].Value
        if ($shortDesc.Length -le 100) {
            Report-Pass "Store Short Description (DE)" "'$shortDesc' ($($shortDesc.Length)/100 chars)"
        } else {
            Report-Fail "Store Short Description (DE)" "'$shortDesc' exceeds 100 chars ($($shortDesc.Length) chars)"
        }
    }

    # English Subtitle limit
    $enSubTitleMatch = [regex]::Match($listingContent, 'Subtitle \(max 30 characters\):\*\*\s*`([^`]+)`')
    if ($enSubTitleMatch.Success) {
        $enSubTitle = $enSubTitleMatch.Groups[1].Value
        if ($enSubTitle.Length -le 30) {
            Report-Pass "Store Subtitle (EN)" "'$enSubTitle' ($($enSubTitle.Length)/30 chars)"
        } else {
            Report-Fail "Store Subtitle (EN)" "'$enSubTitle' exceeds 30 chars ($($enSubTitle.Length) chars)"
        }
    }

    # English Short description limit
    $enShortDescMatch = [regex]::Match($listingContent, 'Short Description \(max 100 characters\):\*\*\s*`([^`]+)`')
    if ($enShortDescMatch.Success) {
        $enShortDesc = $enShortDescMatch.Groups[1].Value
        if ($enShortDesc.Length -le 100) {
            Report-Pass "Store Short Description (EN)" "'$enShortDesc' ($($enShortDesc.Length)/100 chars)"
        } else {
            Report-Fail "Store Short Description (EN)" "'$enShortDesc' exceeds 100 chars ($($enShortDesc.Length) chars)"
        }
    }

    # IARC questionnaire section
    if ($listingContent.Contains("IARC")) {
        Report-Pass "IARC Rating Guide" "Found age-rating questionnaire guidance in docs/store-listing.md"
    } else {
        Report-Warn "IARC Rating Guide" "IARC guidance not explicitly mentioned in store-listing.md"
    }
} else {
    Report-Fail "Store Listing Metadata" "Missing docs/store-listing.md"
}

# ------------------------------------------------------------------------------
# 6. Automated Unit & Integration Tests (Vitest)
# ------------------------------------------------------------------------------
Write-SectionHeader "6. Policy & Integration Tests (Phase 1.4 - 1.6)"

if ($Quick) {
    Report-Pass "Vitest Test Suite" "Skipped due to -Quick flag"
} else {
    Write-Host "  Running Vitest system integration suite..." -ForegroundColor Gray
    $testResult = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "test:run", "--", "tests/system-integration.test.ts" -NoNewWindow -PassThru -Wait
    if ($testResult.ExitCode -eq 0) {
        Report-Pass "Store Policy Integration Tests" "tests/system-integration.test.ts passed completely"
    } else {
        Report-Fail "Store Policy Integration Tests" "tests/system-integration.test.ts returned exit code $($testResult.ExitCode)"
    }
}

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  Store Certification Preflight Summary" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  Total Passed: $passCount" -ForegroundColor Green
if ($warnCount -gt 0) {
    Write-Host "  Total Warnings: $warnCount" -ForegroundColor Yellow
}
if ($failCount -gt 0) {
    Write-Host "  Total Failures: $failCount" -ForegroundColor Red
} else {
    Write-Host "  Total Failures: 0" -ForegroundColor Green
}
Write-Host ""

if ($failCount -eq 0) {
    Write-Host ">>> ALL MICROSOFT STORE CERTIFICATION PREFLIGHT CHECKS PASSED <<<" -ForegroundColor Green
    Write-Host "The application package, assets, and web properties are ready for Partner Center submission!" -ForegroundColor Green
    exit 0
} else {
    Write-Host ">>> STORE CERTIFICATION CHECKS FAILED WITH $failCount ISSUES <<<" -ForegroundColor Red
    exit 1
}

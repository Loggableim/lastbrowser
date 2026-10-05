# ==============================================================================
# Lastbrowser - Microsoft Store Release Readiness & Certification Preflight
# Validates Win32 Store Submission requirements, image assets, legal pages,
# NSIS installer configurations, CI signing workflows, and test suites.
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$Quick = $false,
    [string]$PackageDirectory,
    [string]$InstallerPath,
    [string]$SignatureReportPath
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

# Current EXE/MSI listing form requires 1080 or 2160 square main box art.
# The older 512/1024 icons above remain useful app assets, not Store box art.
$validStoreMainLogos = @()
foreach ($candidate in (Get-ChildItem -LiteralPath $storeAssetDir -Filter '*.png' -File)) {
    $logoImage = $null
    try {
        $logoImage = [System.Drawing.Image]::FromFile($candidate.FullName)
        if ($logoImage.Width -eq $logoImage.Height -and $logoImage.Width -in @(1080, 2160) -and $candidate.Length -lt 50MB) {
            $validStoreMainLogos += $candidate.Name
        }
    } catch {
        # Image readability is reported by the existing asset checks above.
    } finally {
        if ($null -ne $logoImage) { $logoImage.Dispose() }
    }
}
if ($validStoreMainLogos.Count -gt 0) {
    Report-Pass "Store main box art" ($validStoreMainLogos -join ', ')
} elseif ($PackageDirectory) {
    Report-Fail "Store main box art" "Final submission needs a PNG main logo at 1080x1080 or 2160x2160, below 50 MB"
} else {
    Report-Warn "Store main box art" "Prepared 512/1024 icons do not meet the current 1080/2160 square listing requirement"
}
$captureReportPath = Join-Path $storeAssetDir 'screenshots\capture-report.json'
if (Test-Path -LiteralPath $captureReportPath) {
    try {
        $captureReport = Get-Content -LiteralPath $captureReportPath -Raw | ConvertFrom-Json
        if ($captureReport.failures.Count -gt 0) { throw 'Screenshot navigation failures are present' }
        $captureRoot = [IO.Path]::GetFullPath((Join-Path $storeAssetDir 'screenshots')) + [IO.Path]::DirectorySeparatorChar
        $captureKeys = @{}
        foreach ($capture in $captureReport.captures) {
            $capturePath = [IO.Path]::GetFullPath((Join-Path $rootDir $capture.file))
            if (-not $capturePath.StartsWith($captureRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Screenshot path leaves its asset directory' }
            if ($capture.lang -ne $capture.locale) { throw "UI locale mismatch in $($capture.file)" }
            $captureKey = "$($capture.locale)/$($capture.area)"
            if ($captureKeys.ContainsKey($captureKey)) { throw "Duplicate capture entry: $captureKey" }
            $captureKeys[$captureKey] = $true
            $captureImage = [System.Drawing.Image]::FromFile($capturePath)
            try {
                if ($captureImage.Width -ne 1920 -or $captureImage.Height -ne 1080 -or (Get-Item -LiteralPath $capturePath).Length -ge 50MB) { throw "Invalid screenshot dimensions or size: $($capture.file)" }
            } finally { $captureImage.Dispose() }
        }
        foreach ($locale in $captureReport.locales) {
            if (@($captureReport.captures | Where-Object locale -eq $locale).Count -lt 29) { throw "Incomplete screenshot coverage: $locale" }
        }
        Report-Pass "Real app screenshot inventory" "$($captureReport.captures.Count) PNGs, $($captureReport.locales.Count) UI locales, 1920x1080, no navigation failures"
        Report-Warn "Store screenshot content" "Real source-build captures remain provisional until the completed release is checked; visible localization gaps are documented"
    } catch { Report-Fail "Real app screenshot inventory" $_.Exception.Message }
} else {
    Report-Warn "Store screenshot content" "Legacy generated mockups must be replaced with genuine screenshots of the completed app"
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

    $nativeSigningExtensions = @($pkgJson.build.win.signExts)
    $missingNativeSigningExtensions = @('.dll', '.pyd', '.node' | Where-Object { $_ -notin $nativeSigningExtensions })
    if ($missingNativeSigningExtensions.Count -eq 0) {
        Report-Pass "Native payload signing configuration" "DLL, Python and Node native modules are included in Authenticode signing"
    } else {
        Report-Fail "Native payload signing configuration" "Missing extensions: $($missingNativeSigningExtensions -join ', ')"
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

$listingDraftPath = Join-Path $storeAssetDir 'listing-drafts.json'
if (Test-Path -LiteralPath $listingDraftPath) {
    try {
        $listingDraft = Get-Content -LiteralPath $listingDraftPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $appLocaleSource = Get-Content -LiteralPath (Join-Path $rootDir 'apps/desktop/src/renderer/i18n/keys.ts') -Raw -Encoding UTF8
        $appLocaleMatch = [regex]::Match($appLocaleSource, 'export const desktopLocaleIds[^=]*=\s*\[([^\]]+)\]')
        if (-not $appLocaleMatch.Success) { throw 'Cannot read the desktop locale inventory' }
        $appLocales = @([regex]::Matches($appLocaleMatch.Groups[1].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })
        $expectedStoreLocales = @()
        $missingLocaleMappings = @()
        foreach ($appLocale in $appLocales) {
            $storeLocale = $listingDraft.appLocaleMapping.$appLocale
            if ([string]::IsNullOrWhiteSpace($storeLocale) -or $null -eq $listingDraft.listings.$storeLocale) {
                $missingLocaleMappings += $appLocale
            } else {
                $expectedStoreLocales += $storeLocale
            }
        }
        if ($appLocales.Count -eq 0 -or $missingLocaleMappings.Count -gt 0) {
            Report-Fail 'Store language coverage' "Missing drafts or mappings for app locales: $($missingLocaleMappings -join ', ')"
        } else {
            Report-Pass 'Store language coverage' "All $($appLocales.Count) desktop languages have mapped Store text drafts"
        }
        foreach ($locale in $expectedStoreLocales) {
            $localeDraft = $listingDraft.listings.$locale
            $draftIssues = @()
            if ($null -eq $localeDraft -or [string]::IsNullOrWhiteSpace($localeDraft.description) -or $localeDraft.description.Length -gt 10000) {
                $draftIssues += 'Description missing or longer than 10000 characters'
            }
            if ([string]::IsNullOrWhiteSpace($localeDraft.shortDescription) -or $localeDraft.shortDescription.Length -gt 270) {
                $draftIssues += 'Short description missing or longer than the recommended 270 characters'
            }
            if ([string]::IsNullOrWhiteSpace($localeDraft.additionalLicenseTerms) -or $localeDraft.additionalLicenseTerms.Length -gt 10000) {
                $draftIssues += 'License text missing or longer than 10000 characters'
            }
            $searchTerms = @($localeDraft.searchTerms)
            $searchWords = @((($searchTerms -join ' ').Trim() -split '\s+') | Where-Object { $_ })
            if ($searchTerms.Count -gt 7 -or $searchWords.Count -gt 21 -or @($searchTerms | Where-Object { $_.Length -gt 40 }).Count -gt 0) {
                $draftIssues += 'Search terms exceed 7 terms, 21 words, or 40 characters per term'
            }
            if (@($localeDraft.productFeatures).Count -gt 20 -or @($localeDraft.productFeatures | Where-Object { $_.Length -gt 200 }).Count -gt 0) {
                $draftIssues += 'Features exceed 20 entries or 200 characters per entry'
            }
            if ([string]::IsNullOrWhiteSpace($localeDraft.productName) -or [string]::IsNullOrWhiteSpace($localeDraft.whatsNew) -or $localeDraft.whatsNew.Length -gt 1500) {
                $draftIssues += 'Product name or initial release note missing, or release note longer than 1500 characters'
            }
            if ($draftIssues.Count -gt 0) {
                Report-Fail "Current Store text draft ($locale)" ($draftIssues -join '; ')
            } else {
                Report-Pass "Current Store text draft ($locale)" "Description, license text and search terms present; short description $($localeDraft.shortDescription.Length)/270 characters"
            }
        }
    } catch {
        Report-Fail 'Current Store text drafts' $_.Exception.Message
    }
} else {
    Report-Fail 'Current Store text drafts' 'Missing assets/store/listing-drafts.json'
}

# ------------------------------------------------------------------------------
# 6. Automated Unit & Integration Tests (Vitest)
# ------------------------------------------------------------------------------
Write-SectionHeader "6. Policy & Integration Tests (Phase 1.4 - 1.6)"

if ($Quick) {
    Report-Warn "Vitest Test Suite" "Not executed due to -Quick flag"
} else {
    Write-Host "  Running Vitest system integration suite..." -ForegroundColor Gray
    $testResult = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "test:run", "--", "tests/system-integration.test.ts" -NoNewWindow -PassThru -Wait
    if ($testResult.ExitCode -eq 0) {
        Report-Pass "Store Policy Integration Tests" "tests/system-integration.test.ts passed completely"
    } else {
        Report-Fail "Store Policy Integration Tests" "tests/system-integration.test.ts returned exit code $($testResult.ExitCode)"
    }
}

# Package checks are separate from source/configuration checks. A green source
# preflight must not hide unsigned binaries inside an otherwise signed installer.
Write-SectionHeader "7. Final Windows Package Signatures"
if ($PackageDirectory) {
    try {
        & (Join-Path $PSScriptRoot 'verify-windows-package-signatures.ps1') -PackageDirectory $PackageDirectory -InstallerPath $InstallerPath -ReportPath $SignatureReportPath
        if ($InstallerPath) {
            Report-Pass "Final installer and native payload signatures" "All checked files have valid timestamped signatures"
        } else {
            Report-Warn "Final installer signature" "Native payload checked; no installer supplied"
        }
    } catch {
        Report-Fail "Final installer and native payload signatures" $_.Exception.Message
    }
} elseif ($InstallerPath) {
    Report-Fail "Final Windows package" "InstallerPath requires PackageDirectory so the native payload is checked as well"
} else {
    Report-Warn "Final Windows package" "No package supplied; binary signature readiness was not checked"
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
    Write-Host ">>> EXECUTED PREFLIGHT CHECKS PASSED <<<" -ForegroundColor Green
    Write-Host "Review all warnings. This is not a Store certification result: final app behavior, listing content, published legal URLs, signed package and checksums still need validation." -ForegroundColor Yellow
    exit 0
} else {
    Write-Host ">>> STORE CERTIFICATION CHECKS FAILED WITH $failCount ISSUES <<<" -ForegroundColor Red
    exit 1
}

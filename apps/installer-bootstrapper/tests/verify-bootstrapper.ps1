param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [string]$Dumpbin = 'C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.51.36231\bin\Hostx64\x64\dumpbin.exe',
  [string]$BootstrapperExePath = (Join-Path $PSScriptRoot '..\build\LastbrowserBootstrapper.exe')
)
$ErrorActionPreference = 'Stop'
$bootstrapperRoot = Join-Path $RepositoryRoot 'apps\installer-bootstrapper'
$receiptRoot = Join-Path $RepositoryRoot 'output\signed-test-0.1.47-2026-10-07T08-56-01-111Z'
$payloadHeader = Get-Content (Join-Path $bootstrapperRoot 'payload.h') -Raw
$checksumLine = Get-Content (Join-Path $receiptRoot 'SHA256SUMS.txt') | Where-Object { $_ -match 'Lastbrowser-0\.1\.47-x64-setup\.exe$' }
$receiptSha = ($checksumLine -split '\s+')[0]
$signedPayload = (Get-Content (Join-Path $receiptRoot 'final-signatures.json') -Raw | ConvertFrom-Json).files |
  Where-Object { $_.path -eq 'Lastbrowser-0.1.47-x64-setup.exe' -and $_.expectedPublisher -and $_.passed } |
  Select-Object -First 1
if (-not $signedPayload) { throw 'No passing signed setup record found in the pinned receipt.' }
if ($payloadHeader -notmatch [regex]::Escape($receiptSha) -or $payloadHeader -notmatch [regex]::Escape($signedPayload.signerThumbprint)) {
  throw 'Payload hash or publisher pin diverges from the signed receipt.'
}
if ($signedPayload.sha256 -ne $receiptSha -or $signedPayload.bytes -ne 174778024) { throw 'Receipt hash/size are inconsistent.' }
$payloadPath = Join-Path $receiptRoot 'Lastbrowser-0.1.47-x64-setup.exe'
if ((Get-Item $payloadPath).Length -ne 174778024 -or (Get-FileHash $payloadPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receiptSha) {
  throw 'Local signed payload bytes no longer match the receipt.'
}
$signature = Get-AuthenticodeSignature $payloadPath
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $signedPayload.signerThumbprint) {
  throw 'Local signed payload Authenticode signer differs from the receipt.'
}

$source = (Get-Content (Join-Path $bootstrapperRoot 'bootstrapper.cpp') -Raw) +
  (Get-Content (Join-Path $bootstrapperRoot 'bootstrapper_core.cpp') -Raw) +
  (Get-Content (Join-Path $bootstrapperRoot 'bootstrapper_core.h') -Raw) +
  (Get-Content (Join-Path $bootstrapperRoot 'tests\core_tests.cpp') -Raw)
foreach ($required in @('WINHTTP_OPTION_REDIRECT_POLICY_NEVER', 'BCryptHashData', 'WinVerifyTrust',
    'CERT_SHA1_HASH_PROP_ID', 'WTD_UI_NONE', '/currentuser', 'GetFileVersionInfoW', 'SPI_GETCLIENTAREAANIMATION',
    'e01786d4-bdcb-5140-a133-efc73f0357d3', 'WINHTTP_QUERY_CONTENT_LENGTH',
    'validatePinnedPayload', 'validateHttpResponse', 'resolveAllowedHttpsRedirect',
    'canStartDownloadAttempt', 'canStartInstallerAttempt', 'deliverWorkerMessage',
    'PostMessageW', 'queueWorkerFallbackSink', 'workerFallbackEvent', 'takeFallbackWorkerMessage',
    'MsgWaitForMultipleObjects',
    'wrong payload SHA-256 fails closed', 'invalid Authenticode trust result fails closed',
    'trusted signature from the wrong pinned publisher fails closed', 'foreign absolute redirect response is rejected',
    'failed terminal post is delivered through the shared completion fallback')) {
  if ($source -notmatch [regex]::Escape($required)) { throw "Missing required bootstrapper gate: $required" }
}
if ($source -match 'Range:|If-Range') { throw 'Unexpected resume path found.' }

$png = [System.IO.File]::ReadAllBytes((Join-Path $bootstrapperRoot 'assets\lastbrowser-logo.png'))
if ([System.BitConverter]::ToUInt32([byte[]]@($png[16], $png[17], $png[18], $png[19])) -ne 0x78050000 -or
    [System.BitConverter]::ToUInt32([byte[]]@($png[20], $png[21], $png[22], $png[23])) -ne 0x68010000 -or $png[25] -ne 6) {
  throw 'Logo must remain the 1400x360 RGBA transparent asset.'
}

$exe = [System.IO.Path]::GetFullPath($BootstrapperExePath)
if (-not (Test-Path $exe)) { throw 'Build the x64 bootstrapper before running this focused verification.' }
$imports = (& $Dumpbin /dependents $exe | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'dumpbin could not read the built executable.' }
if ($imports -match 'VCRUNTIME|MSVCP|node\.dll|electron') { throw 'Executable unexpectedly depends on a C++ runtime or Electron.' }
foreach ($dll in @('WINHTTP.dll', 'bcrypt.dll', 'WINTRUST.dll', 'gdiplus.dll')) {
  if ($imports -notmatch [regex]::Escape($dll)) { throw "Expected native system import missing: $dll" }
}
Write-Output 'PASS: signed payload pin, publisher pin, transparent logo, security gates, and native /MT dependencies.'

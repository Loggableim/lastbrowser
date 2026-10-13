param(
    [Parameter(Mandatory=$true)][string]$ManifestPath,
    [string]$SigningDirectory = "$env:LOCALAPPDATA\LastBrowser\ReleaseSigning\linux-20261013-02"
)
$ErrorActionPreference = 'Stop'
$expectedPrimary = 'BD10C633483A9B1159964F11762E4029184C95F4'
$expectedSigning = '9103068B3CD4943A6B9B0D1AE7BDEC7F5CB67F48'
$manifest = (Resolve-Path -LiteralPath $ManifestPath).Path
if ((Split-Path $manifest -Leaf) -ne 'SHA256SUMS') { throw 'Expected the original SHA256SUMS file.' }
$artifactRoot = Split-Path $manifest -Parent
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($line in [IO.File]::ReadAllLines($manifest)) {
    if (-not $line.Trim()) { continue }
    if ($line -notmatch '^([a-fA-F0-9]{64}) [ *]([A-Za-z0-9][A-Za-z0-9._-]*)$') { throw 'Invalid checksum line or unsafe filename.' }
    $expectedHash = $Matches[1]; $name = $Matches[2]
    if (-not $seen.Add($name)) { throw 'Duplicate artifact name.' }
    $artifact = Join-Path $artifactRoot $name
    $item = Get-Item -LiteralPath $artifact
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Artifact must be a regular local file.' }
    if ((Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash -ne $expectedHash) { throw "Artifact checksum mismatch: $name" }
}
if ($seen.Count -eq 0) { throw 'Empty checksum manifest.' }
$signature = "$manifest.asc"
if (Test-Path -LiteralPath $signature) { throw 'Signature already exists; do not overwrite an existing release signature.' }
function Convert-GpgPath([string]$Path) {
    $portable = [IO.Path]::GetFullPath($Path).Replace('\','/')
    if ($portable -notmatch '^[A-Za-z]:/') { throw 'Use a local drive.' }
    return '/' + $portable.Substring(0,1).ToLowerInvariant() + $portable.Substring(2)
}
$gpgHome = Convert-GpgPath (Join-Path $SigningDirectory 'gnupg')
$metadata = Get-Content -Raw -LiteralPath (Join-Path $SigningDirectory 'public-metadata.json') | ConvertFrom-Json
if ($metadata.primaryFingerprint -ne $expectedPrimary -or $metadata.signingFingerprint -ne $expectedSigning) { throw 'Wrong release key.' }
$protected = [IO.File]::ReadAllBytes((Join-Path $SigningDirectory 'passphrase.dpapi'))
$plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$passphrase = [Text.Encoding]::UTF8.GetString($plainBytes)
try {
    $info = [Diagnostics.ProcessStartInfo]::new('C:\Program Files\Git\usr\bin\gpg.exe')
    $info.UseShellExecute = $false; $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    foreach ($argument in @('--homedir',$gpgHome,'--batch','--pinentry-mode','loopback','--passphrase-fd','0',
        '--local-user',"$expectedSigning!",'--digest-algo','SHA256','--armor','--detach-sign','--output',
        (Convert-GpgPath $signature),(Convert-GpgPath $manifest))) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new(); $process.StartInfo = $info
    if (-not $process.Start()) { throw 'Could not start GnuPG.' }
    $outTask = $process.StandardOutput.ReadToEndAsync(); $errTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.WriteLine($passphrase); $process.StandardInput.Close(); $process.WaitForExit()
    $null = $outTask.GetAwaiter().GetResult(); $errorText = $errTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw "Signing failed: $errorText" }
    $status = & 'C:\Program Files\Git\usr\bin\gpg.exe' --homedir $gpgHome --batch --status-fd 1 --verify (Convert-GpgPath $signature) (Convert-GpgPath $manifest) 2>$null
    if ($LASTEXITCODE -ne 0 -or -not ($status -match "\[GNUPG:\] VALIDSIG $expectedSigning ")) { throw 'Signature verification failed.' }
    [ordered]@{ manifest=$manifest; signature=$signature; artifactCount=$seen.Count;
        primaryFingerprint=$expectedPrimary; signingFingerprint=$expectedSigning;
        signatureSha256=(Get-FileHash -LiteralPath $signature -Algorithm SHA256).Hash } | ConvertTo-Json
} finally {
    $passphrase = $null
    [Array]::Clear($plainBytes,0,$plainBytes.Length)
}

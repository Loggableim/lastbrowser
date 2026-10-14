param(
    [string]$SigningDirectory = "$env:LOCALAPPDATA\LastBrowser\ReleaseSigning\linux-20261013",
    [string]$PublicKeyPath = "$PSScriptRoot\..\lastbrowser.com\assets\keys\lastbrowser-linux-release.asc"
)
$ErrorActionPreference = 'Stop'
$gpgPath = 'C:\Program Files\Git\usr\bin\gpg.exe'
if (-not (Test-Path -LiteralPath $gpgPath)) { throw 'GnuPG is not installed.' }
if (Test-Path -LiteralPath $SigningDirectory) { throw 'Signing directory already exists. Inspect it; never replace an existing release identity.' }
$signingRoot = [IO.Path]::GetFullPath($SigningDirectory)
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($signingRoot.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Private signing data must stay outside the repository.' }
New-Item -ItemType Directory -Path $signingRoot | Out-Null
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($currentSid, $systemSid)) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
}
Set-Acl -LiteralPath $signingRoot -AclObject $acl
$gpgHomeWindows = Join-Path $signingRoot 'gnupg'
New-Item -ItemType Directory -Path $gpgHomeWindows | Out-Null
# Git's bundled GnuPG is an MSYS executable: ProcessStartInfo does not perform
# the path conversion that Git Bash normally supplies.
$portableHome = $gpgHomeWindows.Replace('\', '/')
if ($portableHome -notmatch '^[A-Za-z]:/') { throw 'Use a local drive for the signing directory.' }
$gpgHome = '/' + $portableHome.Substring(0, 1).ToLowerInvariant() + $portableHome.Substring(2)
$secretBytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
$passphrase = [Convert]::ToBase64String($secretBytes)
$protected = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($passphrase), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes((Join-Path $signingRoot 'passphrase.dpapi'), $protected)
function Invoke-ReleaseGpg([string[]]$GpgArguments, [bool]$UsePassphrase = $false) {
    $info = [Diagnostics.ProcessStartInfo]::new($gpgPath)
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in @('--homedir', $gpgHome, '--batch') + $GpgArguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    if (-not $process.Start()) { throw 'Could not start GnuPG.' }
    $outTask = $process.StandardOutput.ReadToEndAsync()
    $errTask = $process.StandardError.ReadToEndAsync()
    if ($UsePassphrase) { $process.StandardInput.WriteLine($passphrase) }
    $process.StandardInput.Close()
    $process.WaitForExit()
    $output = $outTask.GetAwaiter().GetResult()
    $errorText = $errTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw "GnuPG failed ($($process.ExitCode)): $errorText" }
    return $output
}
try {
    Invoke-ReleaseGpg @('--pinentry-mode','loopback','--passphrase-fd','0','--quick-generate-key','LastBrowser Linux Release Signing <rainer@dominik.in>','ed25519','cert','3y') $true | Out-Null
    $listing = Invoke-ReleaseGpg @('--with-colons','--list-secret-keys')
    $fingerprint = (($listing -split "`n" | Where-Object { $_.StartsWith('fpr:') } | Select-Object -First 1) -split ':')[9]
    if ($fingerprint -notmatch '^[A-F0-9]{40}$') { throw 'Primary fingerprint missing.' }
    Invoke-ReleaseGpg @('--pinentry-mode','loopback','--passphrase-fd','0','--quick-add-key',$fingerprint,'ed25519','sign','1y') $true | Out-Null
    $listing = Invoke-ReleaseGpg @('--with-colons','--list-secret-keys',$fingerprint)
    $fingerprints = @($listing -split "`n" | Where-Object { $_.StartsWith('fpr:') } | ForEach-Object { ($_ -split ':')[9] })
    if ($fingerprints.Count -ne 2) { throw 'Expected one primary and one signing subkey.' }
    $publicPath = [IO.Path]::GetFullPath($PublicKeyPath)
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($publicPath)) -Force | Out-Null
    $publicKey = Invoke-ReleaseGpg @('--armor','--export',$fingerprint)
    if (-not $publicKey.StartsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----')) { throw 'Public key export missing.' }
    [IO.File]::WriteAllText($publicPath, $publicKey, [Text.UTF8Encoding]::new($false))
    $metadata = [ordered]@{ identity='LastBrowser Linux Release Signing <rainer@dominik.in>'; primaryFingerprint=$fingerprint;
        signingFingerprint=$fingerprints[1]; algorithm='Ed25519'; primaryValidity='3 years'; signingValidity='1 year';
        createdAtUtc=[DateTime]::UtcNow.ToString('o'); publicKeyPath=$publicPath }
    $metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $signingRoot 'public-metadata.json') -Encoding utf8
    $metadata | ConvertTo-Json
} finally {
    $passphrase = $null
    [Array]::Clear($secretBytes, 0, $secretBytes.Length)
}

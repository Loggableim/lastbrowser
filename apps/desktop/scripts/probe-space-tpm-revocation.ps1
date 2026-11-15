# Checks the Windows platform provider using a fresh synthetic key. No
# production key names or profile paths are accepted by this script.
# This probe replays an app-owned ciphertext, not a full Windows snapshot.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$keyName = 'Lastbrowser-Synthetic-Revocation-' + [Guid]::NewGuid().ToString('N')
$provider = [System.Security.Cryptography.CngProvider]::MicrosoftPlatformCryptoProvider
$parameters = [System.Security.Cryptography.CngKeyCreationParameters]::new()
$parameters.Provider = $provider
$parameters.KeyUsage = [System.Security.Cryptography.CngKeyUsages]::Decryption
$parameters.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::None
$length = [System.Security.Cryptography.CngProperty]::new(
    'Length', [BitConverter]::GetBytes(2048), [System.Security.Cryptography.CngPropertyOptions]::None
)
$parameters.Parameters.Add($length)
$padding = [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256
$algorithm = [System.Security.Cryptography.CngAlgorithm]::Rsa
$key = $null
$owned = $false
$revoked = $false
$marker = [byte[]]::new(32)
$recovered = $null
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($marker)
    $key = [System.Security.Cryptography.CngKey]::Create($algorithm, $keyName, $parameters)
    $owned = $true
    if ($key.ExportPolicy -ne [System.Security.Cryptography.CngExportPolicies]::None) {
        throw 'The platform provider allowed private-key export'
    }
    $rsa = [System.Security.Cryptography.RSACng]::new($key)
    try {
        $oldEnvelope = $rsa.Encrypt($marker, $padding)
    } finally {
        $rsa.Dispose()
    }

    $key.Dispose()
    $key = $null
    $key = [System.Security.Cryptography.CngKey]::Open($keyName, $provider)
    $rsa = [System.Security.Cryptography.RSACng]::new($key)
    try {
        $recovered = $rsa.Decrypt($oldEnvelope, $padding)
        if (-not [System.Linq.Enumerable]::SequenceEqual[byte]($recovered, $marker)) {
            throw 'The provider failed the pre-revocation round trip'
        }
    } finally {
        $rsa.Dispose()
    }

    $key.Delete()
    $revoked = $true
    $key = $null
    if ([System.Security.Cryptography.CngKey]::Exists($keyName, $provider)) {
        throw 'The platform provider can still open the key for the old envelope'
    }
    Write-Output '{"provider":"Microsoft Platform Crypto Provider","preRevocationRoundTrip":true,"oldEnvelopeHasNoNamedKey":true}'
} finally {
    try {
        if ($owned -and -not $revoked) {
            if ($null -eq $key) {
                $key = [System.Security.Cryptography.CngKey]::Open($keyName, $provider)
            }
            $key.Delete()
        }
    } finally {
        if ($null -ne $key) { $key.Dispose() }
        $rng.Dispose()
        [Array]::Clear($marker, 0, $marker.Length)
        if ($null -ne $recovered) { [Array]::Clear($recovered, 0, $recovered.Length) }
    }
}

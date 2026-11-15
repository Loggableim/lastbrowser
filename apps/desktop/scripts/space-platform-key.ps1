# Invoked by the trusted browser broker. Requests arrive as JSON on stdin.
# Successful secret reads write exactly 32 raw bytes to stdout.
$ErrorActionPreference = 'Stop'
$key = $null
$rsa = $null
$secret = $null
$created = $false
$complete = $false
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($request.id -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') {
        throw 'Invalid vault identity'
    }
    $name = 'Lastbrowser-ProtectedSpace-v1-' + $request.id
    $provider = [System.Security.Cryptography.CngProvider]::MicrosoftPlatformCryptoProvider
    $padding = [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256
    if ($request.operation -ceq 'create') {
        $params = [System.Security.Cryptography.CngKeyCreationParameters]::new()
        $params.Provider = $provider
        $params.KeyUsage = [System.Security.Cryptography.CngKeyUsages]::Decryption
        $params.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::None
        $length = [System.Security.Cryptography.CngProperty]::new(
            'Length', [BitConverter]::GetBytes(2048), [System.Security.Cryptography.CngPropertyOptions]::None
        )
        $params.Parameters.Add($length)
        $key = [System.Security.Cryptography.CngKey]::Create(
            [System.Security.Cryptography.CngAlgorithm]::Rsa, $name, $params
        )
        $created = $true
        if ($key.ExportPolicy -ne [System.Security.Cryptography.CngExportPolicies]::None) {
            throw 'The platform key permits export'
        }
        $secret = [byte[]]::new(32)
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($secret) } finally { $rng.Dispose() }
        $rsa = [System.Security.Cryptography.RSACng]::new($key)
        $wrapped = $rsa.Encrypt($secret, $padding)
        [Console]::OpenStandardOutput().Write($wrapped, 0, $wrapped.Length)
        $complete = $true
    } elseif ($request.operation -ceq 'read' -or $request.operation -ceq 'revoke') {
        if (-not [System.Security.Cryptography.CngKey]::Exists($name, $provider)) { exit 3 }
        $key = [System.Security.Cryptography.CngKey]::Open($name, $provider)
        if ($request.operation -ceq 'revoke') {
            $key.Delete()
            $key = $null
        } else {
            $wrapped = [Convert]::FromBase64String($request.wrapped)
            if ($wrapped.Length -ne 256) { throw 'Invalid wrapped platform secret' }
            $rsa = [System.Security.Cryptography.RSACng]::new($key)
            $secret = $rsa.Decrypt($wrapped, $padding)
            if ($secret.Length -ne 32) { throw 'Invalid platform secret' }
            [Console]::OpenStandardOutput().Write($secret, 0, $secret.Length)
        }
    } else {
        throw 'Invalid platform key operation'
    }
} catch {
    [Console]::Error.WriteLine('The Windows platform key operation failed.')
    exit 1
} finally {
    if ($null -ne $secret) { [Array]::Clear($secret, 0, $secret.Length) }
    if ($null -ne $rsa) { $rsa.Dispose() }
    if ($null -ne $key) {
        if ($created -and -not $complete) { $key.Delete() }
        $key.Dispose()
    }
}

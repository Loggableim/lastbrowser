$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Import-Module TrustedSigning -RequiredVersion '0.5.3'
$target = $env:LASTBROWSER_SIGNING_TARGET
$signingOptions = @{
    Endpoint = $env:AZURE_TRUSTED_SIGNING_ENDPOINT
    CodeSigningAccountName = $env:AZURE_TRUSTED_SIGNING_ACCOUNT
    CertificateProfileName = $env:AZURE_CERTIFICATE_PROFILE
    Files = $target
    FileDigest = 'SHA256'
    TimestampRfc3161 = 'http://timestamp.acs.microsoft.com'
    TimestampDigest = 'SHA256'
    ExcludeWorkloadIdentityCredential = $true
    ExcludeManagedIdentityCredential = $true
    ExcludeSharedTokenCacheCredential = $true
    ExcludeVisualStudioCredential = $true
    ExcludeVisualStudioCodeCredential = $true
    ExcludeAzureCliCredential = $true
    ExcludeAzurePowerShellCredential = $true
    ExcludeAzureDeveloperCliCredential = $true
    ExcludeInteractiveBrowserCredential = $true
}
Invoke-TrustedSigning @signingOptions
$signature = Get-AuthenticodeSignature -LiteralPath $target
if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate -or
    $signature.SignerCertificate.Subject -cne $env:WINDOWS_SIGNING_PUBLISHER_SUBJECT) {
    throw 'The new Authenticode signature is invalid, has no timestamp, or belongs to another publisher.'
}

$ErrorActionPreference = 'Stop'

$packageArgs = @{
    packageName    = 'lastbrowser'
    fileType       = 'exe'
    url            = 'https://REPLACE-AFTER-SIGNED-RELEASE.invalid/Lastbrowser-0.1.56-x64-setup.exe'
    softwareName   = 'LastBrowser*'
    checksum       = '0000000000000000000000000000000000000000000000000000000000000000'
    checksumType   = 'sha256'
    silentArgs     = '/S'
    validExitCodes = @(0)
}

Install-ChocolateyPackage @packageArgs

#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$AppDirectory,
    [Parameter(Mandatory)][string]$OutputPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9.-]{3,50}$')][string]$IdentityName,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Publisher,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$PublisherDisplayName,
    [string]$MakeAppxPath,
    [ValidateNotNullOrEmpty()][string]$ProductDisplayName = 'LastBrowser'
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'The Store MSIX must be packaged on Windows.' }
if ([string]::IsNullOrWhiteSpace($PublisherDisplayName)) { throw 'Supply the Partner Center publisher display name.' }
if ([string]::IsNullOrWhiteSpace($ProductDisplayName)) { throw 'Supply the reserved Partner Center product display name.' }
$null = [Security.Cryptography.X509Certificates.X500DistinguishedName]::new($Publisher)
if ($Publisher -match 'OID\.2\.25\.311729368913984317654407730594956997722\s*=') {
    throw 'Use the Partner Center publisher without the unsigned sideloading marker.'
}

if (-not $MakeAppxPath) {
    $makeAppx = Get-Command MakeAppx.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($makeAppx) {
        $MakeAppxPath = $makeAppx.Source
    } else {
        $sdkBin = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Windows Kits\10\bin'
        if (Test-Path -LiteralPath $sdkBin -PathType Container) {
            $MakeAppxPath = Get-ChildItem -LiteralPath $sdkBin -Directory |
                Where-Object Name -Match '^\d+\.\d+\.\d+\.\d+$' |
                Sort-Object { [version]$_.Name } -Descending |
                ForEach-Object { Join-Path $_.FullName 'x64\MakeAppx.exe' } |
                Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
                Select-Object -First 1
        }
    }
}
if (-not $MakeAppxPath) { throw 'Install the Windows SDK or pass -MakeAppxPath.' }
$makeAppxFile = Get-Item -LiteralPath $MakeAppxPath
if ($makeAppxFile.PSIsContainer -or $makeAppxFile.Name -ine 'MakeAppx.exe') {
    throw 'MakeAppxPath must point to the Windows SDK MakeAppx.exe.'
}

$source = Get-Item -LiteralPath $AppDirectory
if (-not $source.PSIsContainer -or ($source.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'AppDirectory must be a real win-unpacked directory.'
}
$sourcePrefix = $source.FullName.TrimEnd('\') + '\'
$output = $PSCmdlet.GetUnresolvedProviderPathFromPSPath($OutputPath)
if ([IO.Path]::GetExtension($output) -ine '.msix' -or (Test-Path -LiteralPath $output)) {
    throw 'OutputPath must name a new .msix file.'
}
if ($output.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Place the .msix outside AppDirectory.'
}

$desktop = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent (Split-Path -Parent $desktop)
$app = Get-Content -LiteralPath (Join-Path $desktop 'package.json') -Raw | ConvertFrom-Json
$appVersion = [version]$app.version
if ($appVersion.Build -lt 0 -or $appVersion.Revision -ge 0 -or $appVersion.Major -ge 65535 -or
    $appVersion.Minor -gt 65535 -or $appVersion.Build -gt 65535) {
    throw 'The app needs a three-part version that fits in the Store package version.'
}
# The Store requires a nonzero major and reserves the fourth component.
$version = '{0}.{1}.{2}.0' -f ($appVersion.Major + 1), $appVersion.Minor, $appVersion.Build

$required = @(
    'Lastbrowser.exe',
    'resources\app.asar',
    'resources\runtime\python\python.exe',
    'resources\services\sidekick\pyproject.toml',
    'resources\protected-spaces\space-tpm-nv.exe',
    'resources\protected-spaces\jdk\bin\java.exe',
    'resources\licenses\LICENSE',
    'resources\licenses\LICENSE-SCOPE.md',
    'resources\licenses\NOTICE',
    'resources\licenses\THIRD-PARTY-LICENSES.md'
)
foreach ($relative in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $source.FullName $relative) -PathType Leaf)) {
        throw "The app payload is incomplete. Missing $relative"
    }
}

$readArchiveManifest = @'
const { createRequire } = require('node:module');
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
const { extractFile } = builderRequire('@electron/asar');
process.stdout.write(extractFile(process.argv[1], 'package.json'));
'@
Push-Location $desktop
try {
    $archivedManifest = & node -e $readArchiveManifest (Join-Path $source.FullName 'resources\app.asar')
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the packaged application manifest.' }
    $archivedApp = ($archivedManifest -join [Environment]::NewLine) | ConvertFrom-Json
} finally {
    Pop-Location
}
if ($archivedApp.name -cne $app.name -or $archivedApp.version -cne $app.version) {
    throw 'The packaged app name or version differs from the release source.'
}

$executable = [IO.File]::OpenRead((Join-Path $source.FullName 'Lastbrowser.exe'))
$pe = [IO.BinaryReader]::new($executable)
try {
    if ($pe.ReadUInt16() -ne 0x5a4d) { throw 'Lastbrowser.exe is not a Windows executable.' }
    $executable.Position = 0x3c
    $executable.Position = $pe.ReadInt32()
    if ($pe.ReadUInt32() -ne 0x4550 -or $pe.ReadUInt16() -ne 0x8664) {
        throw 'Supply an x64 Windows app payload.'
    }
} finally {
    $pe.Dispose()
}

$extensions = @(
    foreach ($protocol in $app.build.protocols) {
        foreach ($scheme in $protocol.schemes) {
            $name = [Security.SecurityElement]::Escape($scheme)
            "        <uap3:Extension Category=""windows.protocol""><uap3:Protocol Name=""$name"" Parameters=""&quot;%1&quot;"" /></uap3:Extension>"
        }
    }
    foreach ($association in $app.build.fileAssociations) {
        $ext = [Security.SecurityElement]::Escape($association.ext)
        $name = [Security.SecurityElement]::Escape($association.name)
        @"
        <uap3:Extension Category="windows.fileTypeAssociation">
          <uap3:FileTypeAssociation Name="$ext">
            <uap:DisplayName>$name</uap:DisplayName>
            <uap:SupportedFileTypes><uap:FileType>.$ext</uap:FileType></uap:SupportedFileTypes>
            <uap2:SupportedVerbs><uap3:Verb Id="open" Parameters="&quot;%1&quot;">Open</uap3:Verb></uap2:SupportedVerbs>
          </uap3:FileTypeAssociation>
        </uap3:Extension>
"@
    }
) -join [Environment]::NewLine

$displayName = [Security.SecurityElement]::Escape($ProductDisplayName)
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:uap2="http://schemas.microsoft.com/appx/manifest/uap/windows10/2"
         xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap uap2 uap3 rescap">
  <Identity Name="$IdentityName" Publisher="$([Security.SecurityElement]::Escape($Publisher))" Version="$version" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>$displayName</DisplayName>
    <PublisherDisplayName>$([Security.SecurityElement]::Escape($PublisherDisplayName))</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Resources>
    <Resource Language="en-US" />
    <Resource Language="de-DE" />
    <Resource Language="es-ES" />
    <Resource Language="fr-FR" />
    <Resource Language="it-IT" />
    <Resource Language="ja-JP" />
    <Resource Language="pt-BR" />
    <Resource Language="ru-RU" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19045.0" MaxVersionTested="10.0.19045.0" />
  </Dependencies>
  <Applications>
    <Application Id="LastBrowser" Executable="app\Lastbrowser.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="$displayName" Description="$displayName"
                          Square150x150Logo="Assets\Square150x150Logo.png"
                          Square44x44Logo="Assets\Square44x44Logo.png" BackgroundColor="transparent" />
      <Extensions>
$extensions
      </Extensions>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@

$outputParent = Split-Path -Parent $output
$null = New-Item -ItemType Directory -Path $outputParent -Force
$temporary = Join-Path $outputParent ('.lastbrowser-msix-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temporary
try {
    $manifestPath = Join-Path $temporary 'AppxManifest.xml'
    $mappingPath = Join-Path $temporary 'mapping.txt'
    $archive = Join-Path $temporary 'Lastbrowser.msix'
    [IO.File]::WriteAllText($manifestPath, $manifest, [Text.UTF8Encoding]::new($false))

    Add-Type -AssemblyName System.Drawing
    $logo = [Drawing.Image]::FromFile((Join-Path $repo 'assets\store\store-logo-1080.png'))
    try {
        $logos = [ordered]@{ 'StoreLogo.png' = 50; 'Square150x150Logo.png' = 150; 'Square44x44Logo.png' = 44 }
        foreach ($name in $logos.Keys) {
            $size = $logos[$name]
            $bitmap = [Drawing.Bitmap]::new($size, $size)
            try {
                $graphics = [Drawing.Graphics]::FromImage($bitmap)
                try {
                    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $graphics.DrawImage($logo, 0, 0, $size, $size)
                } finally {
                    $graphics.Dispose()
                }
                $bitmap.Save((Join-Path $temporary $name), [Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $bitmap.Dispose()
            }
        }
    } finally {
        $logo.Dispose()
    }

    $mapping = @(
        '[Files]'
        '"{0}" "AppxManifest.xml"' -f $manifestPath
        foreach ($name in $logos.Keys) { '"{0}" "Assets\{1}"' -f (Join-Path $temporary $name), $name }
        foreach ($item in (Get-ChildItem -LiteralPath $source.FullName -Recurse -Force | Sort-Object FullName)) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unexpected link in package: $($item.FullName)" }
            if ($item.PSIsContainer) { continue }
            $relative = $item.FullName.Substring($sourcePrefix.Length)
            if ($item.Extension -ieq '.sys') { throw "Drivers cannot be shipped in the MSIX: $relative" }
            # Windows manages updates for the Store package.
            if ($relative -ieq 'resources\app-update.yml') { continue }
            '"{0}" "app\{1}"' -f $item.FullName, $relative
        }
    )
    [IO.File]::WriteAllLines($mappingPath, [string[]]$mapping, [Text.Encoding]::Unicode)

    & $makeAppxFile.FullName pack /f $mappingPath /p $archive /h SHA256 | Select-Object -Last 15
    if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed with exit code $LASTEXITCODE." }
    [IO.File]::Move($archive, $output)
    Write-Output "Unsigned Store MSIX $version created at $output"
} finally {
    foreach ($name in @('AppxManifest.xml', 'mapping.txt', 'Lastbrowser.msix', 'StoreLogo.png', 'Square150x150Logo.png', 'Square44x44Logo.png')) {
        $temporaryFile = Join-Path $temporary $name
        if (Test-Path -LiteralPath $temporaryFile -PathType Leaf) { Remove-Item -LiteralPath $temporaryFile }
    }
    if (-not (Get-ChildItem -LiteralPath $temporary -Force)) { Remove-Item -LiteralPath $temporary }
}

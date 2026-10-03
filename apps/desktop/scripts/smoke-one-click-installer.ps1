param([switch]$KeepInstalled)
$ErrorActionPreference = 'Stop'
$desktopRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$smokeRoot = Join-Path $desktopRoot 'output\installer-smoke'
$installRoot = Join-Path $smokeRoot 'installed'
if (-not ([IO.Path]::GetFullPath($installRoot)).StartsWith($desktopRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Smoke installation must stay inside the desktop workspace.'
}
New-Item -ItemType Directory -Force -Path $smokeRoot | Out-Null
$profileRoot = Join-Path $smokeRoot 'profile'
New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null
$profileMarker = Join-Path $profileRoot 'user-data-marker.txt'
Set-Content -LiteralPath $profileMarker -Value 'preserve'
$previousUninstaller = Join-Path $installRoot 'Uninstall LastbrowserUpdateSmoke.exe'
if (Test-Path -LiteralPath $previousUninstaller) {
    $previous = Start-Process -FilePath $previousUninstaller -ArgumentList '/S',"_?=$installRoot" -WindowStyle Hidden -PassThru
    if (-not $previous.WaitForExit(30000)) { $previous.Kill(); throw 'Previous smoke uninstall timed out.' }
    if ($previous.ExitCode -ne 0) { throw 'Previous smoke uninstall failed.' }
}
$sourcePath = Join-Path $smokeRoot 'smoke-app.cs'
$exePath = Join-Path $smokeRoot 'LastbrowserUpdateSmoke.exe'
@'
using System;
using System.IO;
using System.Reflection;
public static class SmokeApp {
    [STAThread] public static void Main(string[] args) {
        string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        File.WriteAllText(Path.Combine(root, "launched-version.txt"), File.ReadAllText(Path.Combine(root, "version.txt")) + " " + String.Join(" ", args));
    }
}
'@ | Set-Content -LiteralPath $sourcePath -Encoding UTF8
# Framework csc produces a standalone Windows executable with no package downloads.
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe "/out:$exePath" $sourcePath
if ($LASTEXITCODE -ne 0) { throw 'Smoke application compilation failed.' }

$build = (Get-Content -LiteralPath (Join-Path $desktopRoot 'package.json') -Raw | ConvertFrom-Json).build
# Use production NSIS options, but isolate identity, paths, protocols and signing.
$build.appId = 'com.lastbrowser.update-smoke'
$build.productName = 'LastbrowserUpdateSmoke'
$build.directories.output = Join-Path $smokeRoot 'packages'
$build.PSObject.Properties.Remove('afterSign')
$build.PSObject.Properties.Remove('protocols')
$build.PSObject.Properties.Remove('fileAssociations')
$build.PSObject.Properties.Remove('extraResources')
$build.PSObject.Properties.Remove('publish')
$build.win | Add-Member -NotePropertyName signAndEditExecutable -NotePropertyValue $false -Force
$build.nsis.shortcutName = 'LastbrowserUpdateSmoke'
$build.nsis.artifactName = 'Smoke-${version}-setup.${ext}'
$build.nsis.createDesktopShortcut = $false
$configPath = Join-Path $smokeRoot 'builder.json'
$build | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $configPath -Encoding UTF8
$builder = Join-Path $desktopRoot '..\..\node_modules\electron-builder\cli.js'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
Push-Location $desktopRoot
try {
    foreach ($version in @('0.0.1', '0.0.2')) {
        $payload = Join-Path $smokeRoot "payload-$version"
        New-Item -ItemType Directory -Force -Path $payload | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $payload 'resources') | Out-Null
        Copy-Item -LiteralPath $exePath -Destination $payload
        Set-Content -LiteralPath (Join-Path $payload 'version.txt') -Value $version -NoNewline
        & node $builder --win nsis --x64 --prepackaged $payload --config $configPath "--config.extraMetadata.version=$version" --publish never
        if ($LASTEXITCODE -ne 0) { throw "NSIS build failed for $version." }
        $installer = Join-Path $build.directories.output "Smoke-$version-setup.exe"
        if ($version -eq '0.0.1') {
            # Fresh interactive mode must finish and launch without any clicks.
            $installArgs = @("/D=$installRoot")
        } else {
            # electron-updater's silent upgrade must preserve data and force relaunch.
            $installArgs = @('/S', '--updated', '--force-run', "/D=$installRoot")
        }
        $process = Start-Process -FilePath $installer -ArgumentList $installArgs -WindowStyle Hidden -PassThru
        if (-not $process.WaitForExit(60000)) { $process.Kill(); throw "Installer timed out for $version." }
        if ($process.ExitCode -ne 0) { throw "Installer returned $($process.ExitCode)." }
        $markerPath = Join-Path $installRoot 'launched-version.txt'
        $deadline = [DateTime]::UtcNow.AddSeconds(15)
        do {
            $marker = if (Test-Path -LiteralPath $markerPath) { Get-Content -LiteralPath $markerPath -Raw } else { '' }
            if ($marker.StartsWith($version)) { break }
            Start-Sleep -Milliseconds 100
        } while ([DateTime]::UtcNow -lt $deadline)
        if (-not $marker.StartsWith($version)) { throw "Automatic launch was not observed for $version." }
        if ((Get-Content -LiteralPath $profileMarker -Raw).Trim() -ne 'preserve') { throw 'Upgrade changed the separate profile marker.' }
        if ($version -eq '0.0.2' -and $marker -notmatch '--updated') { throw 'Update relaunch did not receive --updated.' }
        Write-Host "[PASS] $version installed and launched automatically: $marker"
    }
} finally {
    Pop-Location
    $uninstaller = Join-Path $installRoot 'Uninstall LastbrowserUpdateSmoke.exe'
    if (-not $KeepInstalled -and (Test-Path -LiteralPath $uninstaller)) {
        $process = Start-Process -FilePath $uninstaller -ArgumentList '/S',"_?=$installRoot" -WindowStyle Hidden -PassThru
        if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'Smoke uninstall timed out.' }
        if ($process.ExitCode -ne 0) { throw "Smoke uninstall returned $($process.ExitCode)." }
    }
}
Write-Host '[PASS] Isolated unsigned NSIS smoke complete. Production signature/feed validation remains a release check.'

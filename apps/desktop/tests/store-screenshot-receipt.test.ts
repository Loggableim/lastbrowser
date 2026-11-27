import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const verifier = path.resolve(__dirname, '../../../scripts/verify-store-screenshot-receipt.ps1');

const fixtureScript = `
  $ErrorActionPreference = 'Stop'
  Add-Type -AssemblyName System.Drawing
  $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $root = Join-Path $temporaryRoot ('lastbrowser-store-captures-' + [guid]::NewGuid())
  $package = Join-Path $root 'package'
  $report = Join-Path $root 'capture-report.json'
  $locales = @('en', 'de', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja')
  $fixture = $env:LASTBROWSER_CAPTURE_CASE
  $isMsix = $fixture -like 'msix-*'
  $views = if ($fixture -eq 'minimum' -or $isMsix) { @('browser') } else { @('browser', 'extensions', 'appearance', 'preferences') }
  $started = [DateTimeOffset]::UtcNow.ToString('o')
  function Read-Sha256($Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path))).Replace('-', '') }
    finally { $sha.Dispose() }
  }
  function New-MsixFixture($Path, $Executable, $Asar, $Manifest, $Prefix, $DecoyExecutable) {
    $archive = [IO.Compression.ZipFile]::Open($Path, [IO.Compression.ZipArchiveMode]::Create)
    try {
      $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $Manifest, 'AppxManifest.xml')
      $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $Executable, "$Prefix/Lastbrowser.exe")
      $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $Asar, "$Prefix/resources/app.asar")
      if ($DecoyExecutable) {
        $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $DecoyExecutable, 'app/Lastbrowser.exe')
        $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $Asar, 'app/resources/app.asar')
      }
    } finally { $archive.Dispose() }
  }
  try {
    New-Item -Path (Join-Path $package 'resources') -ItemType Directory -Force | Out-Null
    $exe = Join-Path $package 'Lastbrowser.exe'
    $asar = Join-Path $package 'resources/app.asar'
    [IO.File]::WriteAllText($exe, 'fixture executable')
    [IO.File]::WriteAllText($asar, 'fixture application resources')
    $images = @(
      $index = 0
      foreach ($locale in $locales) {
        New-Item -Path (Join-Path $root $locale) -ItemType Directory -Force | Out-Null
        foreach ($view in $views) {
          $file = "$locale/$view.png"
          $imagePath = Join-Path $root $file
          $png = [System.Drawing.Bitmap]::new(1920, 1080)
          try {
            $png.SetPixel(0, 0, [System.Drawing.Color]::FromArgb(255, 0, 0, $index++))
            $png.Save($imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
          } finally { $png.Dispose() }
          [pscustomobject]@{locale=$locale; view=$view; file=$file; sha256=Read-Sha256 $imagePath}
        }
      }
    )
    $receipt = @{
      schemaVersion=1; complete=$true; executableSha256=Read-Sha256 $exe
      asarSha256=Read-Sha256 $asar; startedAtUtc=$started
      finishedAtUtc=[DateTimeOffset]::UtcNow.ToString('o'); exitCode=0; captures=$images
    }
    if ($isMsix) {
      Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
      $manifest = Join-Path $root 'AppxManifest.xml'
      $prefix = if ($fixture -like 'msix-manifest-*') { 'browser' } else { 'app' }
      [IO.File]::WriteAllText($manifest, ('<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"><Applications><Application Id="LastBrowser" Executable="{0}\\Lastbrowser.exe" /></Applications></Package>' -f $prefix))
      $msix = Join-Path $root 'capture.msix'
      if ($fixture -eq 'msix-wrong-asar') { Add-Content -LiteralPath $asar 'different bytes' }
      if ($fixture -eq 'msix-wrong-exe') { Add-Content -LiteralPath $exe 'different bytes' }
      $declaredExecutable = $exe
      $decoyExecutable = $null
      if ($fixture -eq 'msix-manifest-decoy') {
        $declaredExecutable = Join-Path $root 'different.exe'
        [IO.File]::WriteAllText($declaredExecutable, 'different bytes at the declared path')
        $decoyExecutable = $exe
      }
      New-MsixFixture $msix $declaredExecutable $asar $manifest $prefix $decoyExecutable
      $receipt.msixSha256 = Read-Sha256 $msix
      $receipt.captureMethod = if ($fixture -eq 'msix-nonregistered') { 'standalone-exe' } else { 'registered-msix' }
      if ($fixture -eq 'msix-stale') {
        Add-Content -LiteralPath $asar 'different bytes'
        $msix = Join-Path $root 'other.msix'
        New-MsixFixture $msix $exe $asar $manifest $prefix
      }
    }
    [pscustomobject]$receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $report -Encoding UTF8
    if ($isMsix) {
      & $env:LASTBROWSER_CAPTURE_VERIFIER -MsixPath $msix -ScreenshotReportPath $report
    } else {
      if ($fixture -eq 'wrong-package') { Add-Content -LiteralPath $asar 'different bytes' }
      if ($fixture -eq 'wrong-image') { Add-Content -LiteralPath (Join-Path $root 'en/browser.png') 'different bytes' }
      & $env:LASTBROWSER_CAPTURE_VERIFIER -PackageDirectory $package -ScreenshotReportPath $report
    }
  } finally {
    if ((Split-Path -Parent ([IO.Path]::GetFullPath($root))) -eq $temporaryRoot -and
        (Split-Path -Leaf $root).StartsWith('lastbrowser-store-captures-')) {
      Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
`;

function validate(fixture: string) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', fixtureScript], {
    env: { ...process.env, LASTBROWSER_CAPTURE_VERIFIER: verifier, LASTBROWSER_CAPTURE_CASE: fixture },
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return { code: result.status, output: result.stdout + result.stderr };
}

describe.skipIf(process.platform !== 'win32')('Store screenshot receipt verification', () => {
  it.each([['full', '32 PNGs'], ['minimum', '8 PNGs']])('accepts the %s set bound to the supplied package and all listed languages', (fixture, count) => {
    const result = validate(fixture);
    expect(result.output).toContain(count);
    expect(result.code).toBe(0);
  }, 40_000);

  it.each([
    ['wrong-package', 'app.asar differs'],
    ['wrong-image', 'Screenshot hash differs'],
  ])('rejects %s', (fixture, error) => {
    const result = validate(fixture);
    expect(result.output).toContain(error);
    expect(result.code).not.toBe(0);
  }, 40_000);

  it.each(['msix-exact', 'msix-manifest-prefix'])('accepts %s without an extracted package directory', (fixture) => {
    const result = validate(fixture);
    expect(result.output).toContain('8 PNGs');
    expect(result.code).toBe(0);
  }, 40_000);

  it.each([
    ['msix-stale', /(?:MSIX|archive).*(?:SHA-?256|hash)/i],
    ['msix-wrong-asar', /app\.asar.*(?:differs|hash|match)/i],
    ['msix-wrong-exe', /Lastbrowser\.exe.*(?:differs|hash|match)/i],
    ['msix-nonregistered', /registered-msix|registered MSIX/i],
    ['msix-manifest-decoy', /browser[\\/]Lastbrowser\.exe.*(?:differs|hash|match)/i],
  ])('rejects %s', (fixture, error) => {
    const result = validate(fixture);
    expect(result.output).toMatch(error);
    expect(result.code).not.toBe(0);
  }, 40_000);
});

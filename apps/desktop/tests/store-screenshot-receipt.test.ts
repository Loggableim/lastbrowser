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
  $views = if ($env:LASTBROWSER_CAPTURE_CASE -eq 'minimum') { @('browser') } else { @('browser', 'extensions', 'appearance', 'preferences') }
  $started = [DateTimeOffset]::UtcNow.ToString('o')
  function Read-Sha256($Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path))).Replace('-', '') }
    finally { $sha.Dispose() }
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
    [pscustomobject]@{
      schemaVersion=1; complete=$true; executableSha256=Read-Sha256 $exe
      asarSha256=Read-Sha256 $asar; startedAtUtc=$started
      finishedAtUtc=[DateTimeOffset]::UtcNow.ToString('o'); exitCode=0; captures=$images
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $report -Encoding UTF8
    if ($env:LASTBROWSER_CAPTURE_CASE -eq 'wrong-package') { Add-Content -LiteralPath $asar 'different bytes' }
    if ($env:LASTBROWSER_CAPTURE_CASE -eq 'wrong-image') { Add-Content -LiteralPath (Join-Path $root 'en/browser.png') 'different bytes' }
    & $env:LASTBROWSER_CAPTURE_VERIFIER -PackageDirectory $package -ScreenshotReportPath $report
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
});

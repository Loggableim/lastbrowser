const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Read-only release gate. This hook has no access to signing credentials.
// Release builds must sign bundled PE files before packaging. Local unsigned
// development builds are intentionally available for functional verification.
module.exports = async function verifyLocalAiSignatures(context) {
  if (context.electronPlatformName !== 'win32') return;
  const root = path.join(context.appOutDir, 'resources', 'local-ai');
  const backends = ['cpu', 'vulkan'].filter((backend) => fs.existsSync(path.join(root, backend)));
  if (!backends.length) {
    if (process.env.EVS_REQUIRED === '1') {
      throw new Error('Local AI engines are not bundled. A release needs signed on-demand archives before this gate can pass.');
    }
    console.warn('[local-ai] No bundled engines. The pinned archives are verified by SHA-256 when downloaded.');
    return;
  }
  if (process.env.EVS_REQUIRED !== '1') return;
  const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
  const list = backends.map((backend) => quote(backend)).join(',');
  const script = `$ErrorActionPreference='Stop'; $root=${quote(root)}; foreach ($backend in @(${list})) { $dir=Join-Path $root $backend; $files=@(Get-Item -LiteralPath (Join-Path $dir 'llama-server.exe')) + @(Get-ChildItem -LiteralPath $dir -File -Filter '*.dll'); foreach ($file in $files) { $signature=Get-AuthenticodeSignature -LiteralPath $file.FullName; if ($signature.Status -ne 'Valid') { throw ('Unsigned local AI runtime: ' + $file.Name) } } }`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: 'inherit' });
};

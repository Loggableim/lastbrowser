const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BACKENDS = ['cpu', 'vulkan'];

// Read-only release gate. This hook has no access to signing credentials.
// Release builds must sign bundled PE files before packaging. Local unsigned
// development builds are intentionally available for functional verification.
// On-demand builds ship no engines; those archives are pinned by SHA-256 in
// runtime-lock.json and verified when the application downloads them, so the
// gate must skip instead of failing the Windows package build.
function createVerifyLocalAiSignaturesHook(overrides = {}) {
  const deps = {
    existsSync: fs.existsSync,
    env: process.env,
    warn: console.warn,
    execFileSync,
    ...overrides
  };

  return async function verifyLocalAiSignatures(context) {
    if (context.electronPlatformName !== 'win32') return;
    const root = path.join(context.appOutDir, 'resources', 'local-ai');
    const backends = BACKENDS.filter((backend) => deps.existsSync(path.join(root, backend)));
    if (!backends.length) {
      deps.warn('[local-ai] No bundled engines. The pinned archives are verified by SHA-256 when downloaded.');
      return;
    }
    if (deps.env.EVS_REQUIRED !== '1') return;
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const list = backends.map((backend) => quote(backend)).join(',');
    const script = `$ErrorActionPreference='Stop'; $root=${quote(root)}; foreach ($backend in @(${list})) { $dir=Join-Path $root $backend; $files=@(Get-Item -LiteralPath (Join-Path $dir 'llama-server.exe')) + @(Get-ChildItem -LiteralPath $dir -File -Filter '*.dll'); foreach ($file in $files) { $signature=Get-AuthenticodeSignature -LiteralPath $file.FullName; if ($signature.Status -ne 'Valid') { throw ('Unsigned local AI runtime: ' + $file.Name) } } }`;
    deps.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: 'inherit' });
  };
}

exports.createVerifyLocalAiSignaturesHook = createVerifyLocalAiSignaturesHook;
exports.default = createVerifyLocalAiSignaturesHook();

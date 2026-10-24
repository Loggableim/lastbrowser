const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Read-only release gate. This hook has no access to signing credentials.
// Release builds must sign bundled PE files before packaging. Local unsigned
// development builds are intentionally available for functional verification.
module.exports = async function verifyLocalAiSignatures(context) {
  if (context.electronPlatformName !== 'win32') return;

  // Fail before NSIS truncates the app archive at its 32-bit file-size limit.
  const { NSIS_PAYLOAD_LIMIT_BYTES, auditPackagedPayload } = await import('../../../scripts/verify-packaged-payload.mjs');
  const payload = auditPackagedPayload(context.appOutDir);
  console.log(
    `[afterPack] payload ${payload.totalBytes} bytes across ${payload.fileCount} files `
    + `(NSIS limit ${NSIS_PAYLOAD_LIMIT_BYTES} bytes)`
  );

  if (process.env.EVS_REQUIRED !== '1') return;
  const root = path.join(context.appOutDir, 'resources', 'local-ai');
  const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
  const script = `$ErrorActionPreference='Stop'; $root=${quote(root)}; foreach ($backend in @('cpu','vulkan')) { $dir=Join-Path $root $backend; $files=@(Get-Item -LiteralPath (Join-Path $dir 'llama-server.exe')) + @(Get-ChildItem -LiteralPath $dir -File -Filter '*.dll'); foreach ($file in $files) { $signature=Get-AuthenticodeSignature -LiteralPath $file.FullName; if ($signature.Status -ne 'Valid') { throw ('Unsigned local AI runtime: ' + $file.Name) } } }`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: 'inherit' });
};

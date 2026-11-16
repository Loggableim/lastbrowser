import { execFile } from 'node:child_process';
import { win32 } from 'node:path';

const authenticodeCommand = [
  '$ErrorActionPreference = "Stop"',
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
  '$signature = Get-AuthenticodeSignature -LiteralPath $env:LASTBROWSER_UPDATE_FILE',
  '[pscustomobject]@{ path = $signature.Path; status = [string]$signature.Status; subject = $signature.SignerCertificate.Subject } | ConvertTo-Json -Compress',
].join('\n');

const checkFailed = 'Windows could not verify the installer signature.';

export function verifyWindowsUpdateSignature(publishers: string[], installer: string): Promise<string | null> {
  const expected = publishers.filter(name => typeof name === 'string' && name.trim())
    .map(name => name.trim().toLowerCase());
  if (!expected.length || !win32.isAbsolute(installer)) return Promise.resolve(checkFailed);

  const powershell = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const env: NodeJS.ProcessEnv = { ...process.env, LASTBROWSER_UPDATE_FILE: installer };
  delete env.PSModulePath;
  const expectedPath = win32.normalize(installer).toLowerCase();

  return new Promise(resolve => {
    execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', authenticodeCommand], {
      env, windowsHide: true, encoding: 'utf8', timeout: 20_000,
    }, (error, stdout, stderr) => {
      if (error || stderr.trim()) {
        resolve(checkFailed);
        return;
      }
      try {
        const signature = JSON.parse(stdout);
        const matches = signature?.status === 'Valid'
          && typeof signature.path === 'string' && win32.normalize(signature.path).toLowerCase() === expectedPath
          && typeof signature.subject === 'string' && expected.includes(signature.subject.trim().toLowerCase());
        resolve(matches ? null : 'Windows did not find a valid signature from the expected publisher.');
      } catch {
        resolve(checkFailed);
      }
    });
  });
}

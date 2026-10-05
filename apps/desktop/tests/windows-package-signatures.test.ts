import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const verifier = path.resolve(__dirname, '../../../scripts/verify-windows-package-signatures.ps1');
const temporaryDirectories: string[] = [];
const psLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

function runVerification(options: { dependencyStatus?: string; timestamp?: boolean; foreignNode?: boolean; installerStatus?: string } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-store-verifier-'));
  temporaryDirectories.push(directory);
  const payload = path.join(directory, 'win-unpacked');
  const nativeDirectory = path.join(payload, 'resources/runtime/python');
  mkdirSync(nativeDirectory, { recursive: true });
  // Minimal DOS/PE headers let the scanner exercise file discovery without
  // shipping secret-shaped credentials or depending on a signing certificate.
  const pe = Buffer.alloc(128);
  pe.writeUInt16LE(0x5a4d, 0);
  pe.writeUInt32LE(64, 0x3c);
  pe.writeUInt32LE(0x4550, 64);
  writeFileSync(path.join(payload, 'Lastbrowser.exe'), pe);
  writeFileSync(path.join(nativeDirectory, 'dependency.pyd'), pe);
  if (options.foreignNode) writeFileSync(path.join(nativeDirectory, 'foreign.node'), Buffer.from('Mach-O fixture'));
  const installer = path.join(directory, 'setup.exe');
  if (options.installerStatus) writeFileSync(installer, pe);
  const report = path.join(directory, 'report.json');
  const wrapper = path.join(directory, 'run.ps1');
  writeFileSync(wrapper, `
function Get-AuthenticodeSignature {
  param([string]$LiteralPath)
  $status = 'Valid'
  if ([System.IO.Path]::GetFileName($LiteralPath) -eq 'dependency.pyd') { $status = ${psLiteral(options.dependencyStatus ?? 'Valid')} }
  if ([System.IO.Path]::GetFileName($LiteralPath) -eq 'setup.exe') { $status = ${psLiteral(options.installerStatus ?? 'Valid')} }
  $timestamp = ${options.timestamp === false ? '$null' : '[pscustomobject]@{ Subject = "test-timestamp" }'}
  [pscustomobject]@{ Status = $status; TimeStamperCertificate = $timestamp; SignerCertificate = [pscustomobject]@{ Thumbprint = 'test-certificate' } }
}
& ${psLiteral(verifier)} -PackageDirectory ${psLiteral(payload)} -ReportPath ${psLiteral(report)} ${options.installerStatus ? `-InstallerPath ${psLiteral(installer)}` : ''}
`, 'utf8');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapper], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
  if (result.error) throw result.error;
  return { exitCode: result.status, report: JSON.parse(readFileSync(report, 'utf8')), output: result.stdout + result.stderr };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('lastbrowser-store-verifier-')) {
      throw new Error('Refusing cleanup outside the verifier test directory');
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== 'win32')('Windows package signature gate', () => {
  it('checks nested Python modules as well as the main executable', () => {
    const result = runVerification();
    expect(result.exitCode).toBe(0);
    expect(result.report.CheckedFiles).toBe(2);
    expect(result.report.FailedFiles).toBe(0);
    expect(result.report.InstallerIncluded).toBe(false);
  });

  it.each(['NotSigned', 'HashMismatch', 'UnknownError'])('rejects a nested dependency with status %s', dependencyStatus => {
    const result = runVerification({ dependencyStatus });
    expect(result.exitCode).not.toBe(0);
    expect(result.report.FailedFiles).toBe(1);
    expect(result.output).toContain('dependency.pyd');
  });

  it('rejects otherwise valid signatures without timestamps', () => {
    const result = runVerification({ timestamp: false });
    expect(result.exitCode).not.toBe(0);
    expect(result.report.FailedFiles).toBe(2);
  });

  it('rejects non-Windows native modules instead of silently skipping them', () => {
    const result = runVerification({ foreignNode: true });
    expect(result.exitCode).not.toBe(0);
    expect(result.report.Files).toContainEqual(expect.objectContaining({ Status: 'UnsupportedNativeFormat' }));
  });

  it('also rejects an unsigned final installer with a valid payload', () => {
    const result = runVerification({ installerStatus: 'NotSigned' });
    expect(result.exitCode).not.toBe(0);
    expect(result.report.InstallerIncluded).toBe(true);
    expect(result.report.CheckedFiles).toBe(3);
    expect(result.report.FailedFiles).toBe(1);
  });
});

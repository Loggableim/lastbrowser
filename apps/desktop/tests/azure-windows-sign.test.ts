import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createAzureWindowsSigner } = require('../scripts/azure-windows-sign.cjs');
const { resolveFunction } = require('../../../node_modules/app-builder-lib/out/util/resolve.js');
const { WinPackager, PlatformPackager } = require('app-builder-lib');
const { WindowsSignToolManager } = require('../../../node_modules/app-builder-lib/out/codeSign/windowsSignToolManager.js');
const configuredEnv = {
  AZURE_CLIENT_ID: 'client-fixture',
  AZURE_CLIENT_SECRET: 'secret-fixture',
  AZURE_TENANT_ID: 'tenant-fixture',
  AZURE_TRUSTED_SIGNING_ACCOUNT: 'account-fixture',
  AZURE_CERTIFICATE_PROFILE: 'profile-fixture',
  AZURE_TRUSTED_SIGNING_ENDPOINT: 'https://weu.codesigning.azure.net/',
  WINDOWS_SIGNING_PUBLISHER_SUBJECT: 'CN=Fixture Publisher, C=US',
};
const target = { path: path.join('an output directory', 'dependency.pyd'), hash: 'sha256', isNest: false };

function runBuilderSigning(sign?: (configuration: typeof target) => unknown) {
  const emitAfterSign = vi.fn();
  const options = { signtoolOptions: { sign, signingHashAlgorithms: ['sha256'], publisherName: configuredEnv.WINDOWS_SIGNING_PUBLISHER_SUBJECT } };
  const packager = {
    platformSpecificBuildOptions: options,
    appInfo: { type: 'module', productName: 'LastBrowser', computePackageUrl: () => null },
    forceCodeSigning: true,
    getCscLink: () => null,
    computeAsarOptions: () => ({}),
    info: { emitAfterSign },
    signApp: () => WinPackager.prototype._sign.call(packager, target.path)
  };
  const manager = new WindowsSignToolManager(packager);
  Object.assign(packager, { signingManager: { value: Promise.resolve(manager) } });
  return {
    emitAfterSign,
    publisherName: manager.computedPublisherName.value,
    sign: () => PlatformPackager.prototype.doSignAfterPack.call(packager, 'release', 'win-unpacked', 'win32', 1, options, [])
  };
}

describe('Windows Artifact Signing hook', () => {
  it('resolves the exact configuration through the installed electron-builder', async () => {
    const resolved = await resolveFunction('module', 'scripts/azure-windows-sign.cjs', 'sign');
    expect(resolved).toBe(require('../scripts/azure-windows-sign.cjs'));
  });

  it('leaves valid timestamped upstream signatures untouched', async () => {
    const spawn = vi.fn();
    const inspect = vi.fn(() => ({ status: 'Valid', timestampPresent: true }));
    await createAzureWindowsSigner({ env: configuredEnv, spawn, inspect })(target);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('runs the configured signing hash before the installed packager emits afterSign', async () => {
    const sign = vi.fn();
    const result = runBuilderSigning(sign);
    await result.sign();
    expect(sign).toHaveBeenCalledWith(expect.objectContaining(target), expect.any(Object));
    expect(sign.mock.invocationCallOrder[0]).toBeLessThan(result.emitAfterSign.mock.invocationCallOrder[0]);
    await expect(result.publisherName).resolves.toEqual([configuredEnv.WINDOWS_SIGNING_PUBLISHER_SUBJECT]);
  });

  it('fails the build before afterSign when the installed manager has no signer', async () => {
    const result = runBuilderSigning();
    await expect(result.sign()).rejects.toThrow('forceCodeSigning');
    expect(result.emitAfterSign).not.toHaveBeenCalled();
  });

  it('passes the file to a single non-interactive signing command through its environment', async () => {
    const spawn = vi.fn((_tool: string, _args: string[], _options: { env: Record<string, string | undefined> }) => ({ status: 0 }));
    const inspect = vi.fn(() => ({ status: 'NotSigned', timestampPresent: false }));
    const env = { ...configuredEnv, EVS_PASSWD: 'evs-fixture', EVS_ACCOUNT_NAME: 'evs-fixture' };
    await createAzureWindowsSigner({ env, spawn, inspect })(target);
    const [tool, args, options] = spawn.mock.calls[0]!;
    expect(tool).toBe('pwsh.exe');
    expect(args).toContain('-NonInteractive');
    expect(args).not.toContain(configuredEnv.AZURE_CLIENT_SECRET);
    expect(options.env.LASTBROWSER_SIGNING_TARGET).toBe(path.resolve(target.path));
    expect(options.env.EVS_PASSWD).toBeUndefined();
  });

  it('fails closed without authorized signing inputs or a SHA-256 signing request', async () => {
    const spawn = vi.fn();
    const inspect = vi.fn(() => ({ status: 'NotSigned', timestampPresent: false }));
    await expect(createAzureWindowsSigner({ env: {}, spawn, inspect })(target)).rejects.toThrow('WINDOWS_SIGNING_PUBLISHER_SUBJECT');
    await expect(createAzureWindowsSigner({ env: configuredEnv, spawn, inspect })({ ...target, hash: 'sha1' })).rejects.toThrow('SHA-256');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('does not report success if the signer failed or include signer output in an error', async () => {
    const spawn = vi.fn(() => ({ status: 1, stderr: configuredEnv.AZURE_CLIENT_SECRET }));
    const inspect = vi.fn(() => ({ status: 'NotSigned', timestampPresent: false }));
    await expect(createAzureWindowsSigner({ env: configuredEnv, spawn, inspect })(target))
      .rejects.toThrow(/^Azure signing failed for dependency\.pyd \(exit 1\)\.$/);
  });
});

describe.skipIf(process.platform !== 'win32')('Artifact Signing PowerShell verification', () => {
  it.each([
    ['Valid', 'CN=Fixture Publisher, C=US', 'present', 0],
    ['Valid', 'CN=Another Publisher, C=US', 'present', 1],
    ['Valid', 'CN=Fixture Publisher, C=US', '', 1],
    ['NotSigned', 'CN=Fixture Publisher, C=US', 'present', 1]
  ])('checks signing result %s from %s with timestamp %s', (status, subject, timestamp, code) => {
    const wrapper = `
      function Import-Module {
        param($Name, $RequiredVersion)
        if ($Name -ne 'TrustedSigning' -or $RequiredVersion -ne '0.5.3') { throw 'Incorrect signing module' }
      }
      function Invoke-TrustedSigning {
        param($Files, $FileDigest, $TimestampDigest)
        if ($Files -ne $env:LASTBROWSER_SIGNING_TARGET -or $FileDigest -ne 'SHA256' -or $TimestampDigest -ne 'SHA256') {
          throw 'Incorrect signing request'
        }
      }
      function Get-AuthenticodeSignature {
        param($LiteralPath)
        if ($LiteralPath -ne $env:LASTBROWSER_SIGNING_TARGET) { throw 'Incorrect verification target' }
        [pscustomobject]@{
          Status = $env:TEST_SIGNATURE_STATUS
          SignerCertificate = [pscustomobject]@{ Subject = $env:TEST_SIGNATURE_SUBJECT }
          TimeStamperCertificate = $env:TEST_SIGNATURE_TIMESTAMP
        }
      }
      & $env:TEST_SIGNING_SCRIPT
    `;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrapper], {
      env: {
        ...process.env,
        ...configuredEnv,
        LASTBROWSER_SIGNING_TARGET: target.path,
        TEST_SIGNING_SCRIPT: path.resolve(__dirname, '../scripts/azure-windows-sign.ps1'),
        TEST_SIGNATURE_STATUS: status,
        TEST_SIGNATURE_SUBJECT: subject,
        TEST_SIGNATURE_TIMESTAMP: timestamp
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000
    });
    if (result.error) throw result.error;
    if (code !== 0) expect(result.stderr).toContain('The new Authenticode signature is invalid');
    expect(result.status).toBe(code);
  }, 20_000);
});

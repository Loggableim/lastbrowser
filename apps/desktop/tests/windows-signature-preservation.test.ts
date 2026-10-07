import { describe, expect, it, vi } from 'vitest';

const { createWindowsSignaturePreserver } = require('../scripts/preserve-valid-windows-signatures.cjs') as {
  createWindowsSignaturePreserver: (dependencies?: {
    inspectAuthenticode?: (filePath: string) => Promise<{ status: string; timestampPresent: boolean }> | { status: string; timestampPresent: boolean };
    delegateToBuilder?: (configuration: Record<string, unknown>, packager: unknown) => Promise<unknown> | unknown;
  }) => (configuration: Record<string, unknown>, packager?: unknown) => Promise<void>;
};
const path = require('node:path') as typeof import('node:path');
const fs = require('node:fs') as typeof import('node:fs');
const os = require('node:os') as typeof import('node:os');
const packageConfig = require('../package.json') as {
  build: { appId: string; win: { signtoolOptions: { sign: string } } };
};
const { resolveFunction } = require('../../../node_modules/app-builder-lib/out/util/resolve.js') as {
  resolveFunction: (type: string, executor: string, name: string) => Promise<(...args: unknown[]) => unknown>;
};

function signingConfiguration(filePath: string, hash: 'sha1' | 'sha256', isNest: boolean) {
  return {
    path: filePath,
    hash,
    isNest,
    resultOutputPath: undefined,
    computeSignToolArgs: vi.fn((_isWin: boolean) => ['/fd', hash, ...(isNest ? ['/as'] : []), filePath])
  };
}

describe('electron-builder Windows signature preservation hook', () => {
  it('is resolved through the installed electron-builder custom sign hook contract', async () => {
    const packageRoot = path.dirname(require.resolve('../package.json'));
    const hookPath = packageConfig.build.win.signtoolOptions.sign;
    expect(path.resolve(process.cwd(), hookPath)).toBe(path.resolve(packageRoot, hookPath));
    const resolved = await resolveFunction(packageConfig.build.appId, hookPath, 'sign');

    expect(resolved).toBe(require('../scripts/preserve-valid-windows-signatures.cjs'));
  });

  it('preserves a valid timestamped vendor fixture byte-for-byte without invoking the configured signer', async () => {
    const inspectAuthenticode = vi.fn(() => ({ status: 'Valid', timestampPresent: true }));
    const delegateToBuilder = vi.fn();
    const preserve = createWindowsSignaturePreserver({ inspectAuthenticode, delegateToBuilder });
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-signhook-'));
    const filePath = path.join(tempDirectory, 'vendor.dll');
    const originalBytes = Buffer.from([0x4d, 0x5a, 0x10, 0x20, 0x30, 0x40]);
    fs.writeFileSync(filePath, originalBytes);

    try {
      await preserve(signingConfiguration(filePath, 'sha1', false));
      await preserve(signingConfiguration(filePath, 'sha256', true));

      expect(inspectAuthenticode).toHaveBeenCalledTimes(2);
      expect(delegateToBuilder).not.toHaveBeenCalled();
      expect(fs.readFileSync(filePath)).toEqual(originalBytes);
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it('delegates every distinct builder hash stage for an initially unsigned file and suppresses duplicate stages', async () => {
    const inspectAuthenticode = vi.fn()
      .mockReturnValueOnce({ status: 'NotSigned', timestampPresent: false })
      .mockReturnValueOnce({ status: 'Valid', timestampPresent: true });
    const delegateToBuilder = vi.fn(async (configuration: Record<string, unknown>) => {
      const computeSignToolArgs = configuration.computeSignToolArgs as (isWin: boolean) => string[];
      computeSignToolArgs(true);
    });
    const preserve = createWindowsSignaturePreserver({ inspectAuthenticode, delegateToBuilder });
    const packager = { signingManager: { value: { doSign: vi.fn() } } };
    const filePath = 'C:/packed/resources/app.asar.unpacked/node-pty/build/Release/pty.node';
    const sha1 = signingConfiguration(filePath, 'sha1', false);
    const sha256 = signingConfiguration(filePath, 'sha256', true);
    sha256.resultOutputPath = 'C:/packed/resources/app.asar.unpacked/node-pty/build/Release/pty-signed-sha256.node';

    await preserve(sha1, packager);
    await preserve(sha256, packager);
    await preserve(signingConfiguration(filePath, 'sha1', false), packager);

    expect(delegateToBuilder.mock.calls.map(([configuration]) => [configuration.hash, configuration.isNest])).toEqual([
      ['sha1', false],
      ['sha256', true]
    ]);
    expect(delegateToBuilder.mock.calls[0][0]).toBe(sha1);
    expect(delegateToBuilder.mock.calls[1][0]).toBe(sha256);
    expect(sha256.computeSignToolArgs(true)).toEqual(['/fd', 'sha256', '/as', filePath]);
    expect(sha256.resultOutputPath).toBe('C:/packed/resources/app.asar.unpacked/node-pty/build/Release/pty-signed-sha256.node');
    expect(inspectAuthenticode).toHaveBeenCalledTimes(2);
  });

  it.each(['.exe', '.dll', '.pyd', '.node'])('delegates an unsigned %s to the existing builder signer', async (extension) => {
    const delegateToBuilder = vi.fn(async () => undefined);
    const preserve = createWindowsSignaturePreserver({
      inspectAuthenticode: () => ({ status: 'NotSigned', timestampPresent: false }),
      delegateToBuilder
    });

    await preserve(signingConfiguration(`C:/packed/native${extension}`, 'sha256', false));

    expect(delegateToBuilder).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['HashMismatch', false],
    ['NotTrusted', false],
    ['UnknownError', false],
    ['Valid', false]
  ])('fails closed for %s (builderMainExeException=%s)', async (status, timestampPresent) => {
    const delegateToBuilder = vi.fn();
    const preserve = createWindowsSignaturePreserver({
      inspectAuthenticode: () => ({ status, timestampPresent }),
      delegateToBuilder
    });

    await expect(preserve(signingConfiguration('C:/packed/vendor.dll', 'sha256', false))).rejects.toThrow();
    expect(delegateToBuilder).not.toHaveBeenCalled();
  });

  it('blocks HashMismatch for Lastbrowser.exe even beside resources/app.asar', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-mainexe-'));
    const resources = path.join(tempDirectory, 'resources');
    const filePath = path.join(tempDirectory, 'Lastbrowser.exe');
    fs.mkdirSync(resources);
    fs.writeFileSync(path.join(resources, 'app.asar'), Buffer.from('fixture archive'));
    fs.writeFileSync(filePath, Buffer.from('fixture executable'));
    const delegateToBuilder = vi.fn();
    const preserve = createWindowsSignaturePreserver({
      inspectAuthenticode: () => ({ status: 'HashMismatch', timestampPresent: false }),
      delegateToBuilder
    });

    try {
      await expect(preserve(signingConfiguration(filePath, 'sha1', false))).rejects.toThrow('HashMismatch');
      expect(delegateToBuilder).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it('blocks HashMismatch for a same-named vendor Lastbrowser.exe with app.asar marker files', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-vendor-exe-'));
    const vendorDirectory = path.join(tempDirectory, 'vendor');
    const resources = path.join(vendorDirectory, 'resources');
    const filePath = path.join(vendorDirectory, 'Lastbrowser.exe');
    fs.mkdirSync(resources, { recursive: true });
    fs.writeFileSync(path.join(resources, 'app.asar'), Buffer.from('fixture archive'));
    fs.writeFileSync(filePath, Buffer.from('vendor fixture executable'));
    const delegateToBuilder = vi.fn();
    const preserve = createWindowsSignaturePreserver({
      inspectAuthenticode: () => ({ status: 'HashMismatch', timestampPresent: false }),
      delegateToBuilder
    });

    try {
      await expect(preserve(signingConfiguration(filePath, 'sha256', false))).rejects.toThrow('HashMismatch');
      expect(delegateToBuilder).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it('fails with an explicit missing-cscInfo error before attempting the installed builder signer', async () => {
    const doSign = vi.fn();
    const preserve = createWindowsSignaturePreserver({
      inspectAuthenticode: () => ({ status: 'NotSigned', timestampPresent: false })
    });
    const configuration = { ...signingConfiguration('C:/packed/unsigned.exe', 'sha256', false), cscInfo: null };

    await expect(preserve(configuration, { signingManager: { value: { doSign } } })).rejects.toThrow(/missing.*cscInfo/i);
    expect(doSign).not.toHaveBeenCalled();
  });

  it('rejects a builder signer failure and does not silently retry through another signer', async () => {
    const failure = new Error('configured signing failed');
    const delegateToBuilder = vi.fn(async () => { throw failure; });
    const preserve = createWindowsSignaturePreserver({
      inspectAuthenticode: () => ({ status: 'NotSigned', timestampPresent: false }),
      delegateToBuilder
    });

    await expect(preserve(signingConfiguration('C:/packed/new-wrapper.exe', 'sha256', false))).rejects.toBe(failure);
    expect(delegateToBuilder).toHaveBeenCalledTimes(1);
  });

  it('fails closed if a previously signed path is no longer valid on a repeated hash call', async () => {
    const inspectAuthenticode = vi.fn()
      .mockReturnValueOnce({ status: 'NotSigned', timestampPresent: false })
      .mockReturnValueOnce({ status: 'HashMismatch', timestampPresent: false });
    const delegateToBuilder = vi.fn(async () => undefined);
    const preserve = createWindowsSignaturePreserver({ inspectAuthenticode, delegateToBuilder });
    const configuration = signingConfiguration('C:/packed/new-wrapper.exe', 'sha256', false);

    await preserve(configuration);
    await expect(preserve(configuration)).rejects.toThrow('no longer valid');
    expect(delegateToBuilder).toHaveBeenCalledTimes(1);
  });

  it('fails closed if Authenticode status cannot be obtained', async () => {
    const delegateToBuilder = vi.fn();
    const preserve = createWindowsSignaturePreserver({
      inspectAuthenticode: () => { throw new Error('PowerShell inspection failed'); },
      delegateToBuilder
    });

    await expect(preserve(signingConfiguration('C:/packed/vendor.dll', 'sha1', false))).rejects.toThrow('PowerShell inspection failed');
    expect(delegateToBuilder).not.toHaveBeenCalled();
  });
});

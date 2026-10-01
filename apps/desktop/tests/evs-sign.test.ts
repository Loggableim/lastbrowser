import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

interface EvsHookDependencies {
  spawnSync: (command: string, args: string[], options: { stdio: 'inherit'; shell: true }) => {
    status: number | null;
    error?: Error;
  };
  existsSync: (filePath: string) => boolean;
  env: Record<string, string | undefined>;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

interface EvsHookModule {
  createEvsSigningHook: (overrides?: Partial<EvsHookDependencies>) =>
    (context: { electronPlatformName: string; appOutDir: string }) => Promise<void>;
}

const require = createRequire(import.meta.url);
const { createEvsSigningHook } = require('../scripts/evs-sign.cjs') as EvsHookModule;
const appOutDir = path.join('release', 'win-unpacked');
const context = { electronPlatformName: 'win32', appOutDir };

function createRequiredHook(results = [{ status: 0 }, { status: 0 }]) {
  const spawnSync = vi.fn(() => results.shift() ?? { status: 0 });
  const log = vi.fn();
  const warn = vi.fn();
  const hook = createEvsSigningHook({
    spawnSync,
    existsSync: vi.fn(() => true),
    env: {
      EVS_REQUIRED: '1',
      EVS_NO_ASK: '1',
      EVS_ACCOUNT_NAME: 'account-fixture',
      EVS_PASSWD: 'password-fixture'
    },
    log,
    warn
  });

  return { hook, spawnSync, log, warn };
}

describe('Castlabs EVS Windows afterSign hook', () => {
  it('VMP-signs the packaged app, then verifies it non-interactively', async () => {
    const { hook, spawnSync, log } = createRequiredHook();

    await hook(context);

    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      'python',
      ['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', appOutDir],
      { stdio: 'inherit', shell: true }
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'python',
      ['-m', 'castlabs_evs.vmp', '-n', 'verify-pkg', appOutDir],
      { stdio: 'inherit', shell: true }
    );
    expect(log).toHaveBeenCalledWith('[EVS/VMP] Widevine VMP package signing and verification succeeded.');
  });

  it('requires explicit credentials only when that separate policy is enabled', async () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    const hook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => true),
      env: { EVS_REQUIRE_EXPLICIT_CREDENTIALS: '1', EVS_NO_ASK: '1' },
      log: vi.fn(),
      warn: vi.fn()
    });

    await expect(hook(context)).rejects.toThrow('Required EVS account credentials are missing');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('fails closed when the Windows package executable is missing', async () => {
    const { spawnSync } = createRequiredHook();
    const hook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => false),
      env: {
        EVS_REQUIRED: '1',
        EVS_ACCOUNT_NAME: 'account-fixture',
        EVS_PASSWD: 'password-fixture'
      },
      log: vi.fn(),
      warn: vi.fn()
    });

    await expect(hook(context)).rejects.toThrow('Required package executable not found');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('fails closed when EVS signing fails and skips verification', async () => {
    const { hook, spawnSync } = createRequiredHook([{ status: 12 }]);

    await expect(hook(context)).rejects.toThrow('VMP signing failed');
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the EVS executable cannot be started', async () => {
    const { hook, spawnSync } = createRequiredHook([
      { status: null, error: new Error('python process could not start') }
    ]);

    await expect(hook(context)).rejects.toThrow('VMP signing failed');
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('fails closed when EVS package verification fails', async () => {
    const { hook, spawnSync } = createRequiredHook([{ status: 0 }, { status: 8 }]);

    await expect(hook(context)).rejects.toThrow('VMP package verification failed');
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the VMP command throws unexpectedly', async () => {
    const spawnSync = vi.fn(() => {
      throw new Error('process launch failed');
    });
    const hook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => true),
      env: {
        EVS_REQUIRED: '1',
        EVS_ACCOUNT_NAME: 'account-fixture',
        EVS_PASSWD: 'password-fixture'
      },
      log: vi.fn(),
      warn: vi.fn()
    });

    await expect(hook(context)).rejects.toThrow('VMP signing step failed (process launch failed)');
  });

  it('allows release-mode VMP signing through the cached Castlabs session without explicit credentials', async () => {
    const spawnSync = vi.fn().mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 0 });
    const warn = vi.fn();
    const log = vi.fn();
    const hook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => true),
      env: { EVS_REQUIRED: '1', EVS_NO_ASK: '1' },
      log,
      warn
    });

    await expect(hook(context)).resolves.toBeUndefined();
    expect(spawnSync).toHaveBeenNthCalledWith(1, 'python', ['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', appOutDir], { stdio: 'inherit', shell: true });
    expect(spawnSync).toHaveBeenNthCalledWith(2, 'python', ['-m', 'castlabs_evs.vmp', '-n', 'verify-pkg', appOutDir], { stdio: 'inherit', shell: true });
    expect(log).toHaveBeenCalledWith('[EVS/VMP] Widevine VMP package signing and verification succeeded.');
    expect(warn).not.toHaveBeenCalled();
  });

  it('allows a local test build when the package executable is missing but warns', async () => {
    const { hook, spawnSync, warn } = createRequiredHook([{ status: 0 }, { status: 0 }]);
    const localHook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => false),
      env: { EVS_ACCOUNT_NAME: 'account-fixture', EVS_PASSWD: 'password-fixture' },
      log: vi.fn(),
      warn
    });

    await expect(localHook(context)).resolves.toBeUndefined();
    expect(spawnSync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('local test build without a verified VMP signature; do not release'));
  });

  it('allows a local test build after a VMP signing failure but warns and skips verification', async () => {
    const spawnSync = vi.fn(() => ({ status: 12 }));
    const warn = vi.fn();
    const hook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => true),
      env: { EVS_ACCOUNT_NAME: 'account-fixture', EVS_PASSWD: 'password-fixture' },
      log: vi.fn(),
      warn
    });

    await expect(hook(context)).resolves.toBeUndefined();
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VMP signing failed (exit code 12)'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('local test build without a verified VMP signature; do not release'));
  });

  it('fails release mode when cached-session VMP signing fails without explicit credentials', async () => {
    const spawnSync = vi.fn(() => ({ status: 12 }));
    const hook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => true),
      env: { EVS_REQUIRED: '1', EVS_NO_ASK: '1' },
      log: vi.fn(),
      warn: vi.fn()
    });

    await expect(hook(context)).rejects.toThrow('VMP signing failed (exit code 12)');
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('allows a local test build when VMP verification fails but warns', async () => {
    const spawnSync = vi.fn().mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 8 });
    const warn = vi.fn();
    const hook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => true),
      env: { EVS_ACCOUNT_NAME: 'account-fixture', EVS_PASSWD: 'password-fixture' },
      log: vi.fn(),
      warn
    });

    await expect(hook(context)).resolves.toBeUndefined();
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VMP package verification failed (exit code 8)'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('local test build without a verified VMP signature; do not release'));
  });

  it('allows a local test build if the VMP command cannot launch but warns', async () => {
    const spawnSync = vi.fn(() => ({ status: null, error: new Error('process launch failed') }));
    const warn = vi.fn();
    const hook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => true),
      env: { EVS_ACCOUNT_NAME: 'account-fixture', EVS_PASSWD: 'password-fixture' },
      log: vi.fn(),
      warn
    });

    await expect(hook(context)).resolves.toBeUndefined();
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VMP signing failed (process launch failed)'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('local test build without a verified VMP signature; do not release'));
  });

  it('does not invoke Windows EVS signing for other platforms', async () => {
    const { hook, spawnSync } = createRequiredHook();

    await hook({ ...context, electronPlatformName: 'darwin' });

    expect(spawnSync).not.toHaveBeenCalled();
  });
});

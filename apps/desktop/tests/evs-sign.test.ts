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

  it('fails closed when required EVS credentials are missing', async () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    const hook = createEvsSigningHook({
      spawnSync,
      existsSync: vi.fn(() => true),
      env: { EVS_REQUIRED: '1', EVS_NO_ASK: '1' },
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

  it('does not invoke Windows EVS signing for other platforms', async () => {
    const { hook, spawnSync } = createRequiredHook();

    await hook({ ...context, electronPlatformName: 'darwin' });

    expect(spawnSync).not.toHaveBeenCalled();
  });
});

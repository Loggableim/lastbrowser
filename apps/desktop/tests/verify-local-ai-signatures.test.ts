import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

interface HookDependencies {
  existsSync: (filePath: string) => boolean;
  env: Record<string, string | undefined>;
  warn: (...args: unknown[]) => void;
  execFileSync: (...args: unknown[]) => void;
}

interface HookModule {
  createVerifyLocalAiSignaturesHook: (overrides?: Partial<HookDependencies>) =>
    (context: { electronPlatformName: string; appOutDir: string }) => Promise<void>;
}

const require = createRequire(import.meta.url);
const { createVerifyLocalAiSignaturesHook } = require('../scripts/verify-local-ai-signatures.cjs') as HookModule;
const context = { electronPlatformName: 'win32', appOutDir: path.join('release', 'win-unpacked') };
const runtimeRoot = path.join(context.appOutDir, 'resources', 'local-ai');

function createHook(overrides: Partial<HookDependencies> = {}) {
  const execFileSync = vi.fn();
  const warn = vi.fn();
  const hook = createVerifyLocalAiSignaturesHook({
    existsSync: vi.fn(() => false),
    env: {},
    warn,
    execFileSync,
    ...overrides
  });

  return { hook, execFileSync, warn };
}

describe('Local AI afterPack signature gate', () => {
  it('ignores non-Windows packages without touching the resources', async () => {
    const existsSync = vi.fn(() => false);
    const { hook, execFileSync } = createHook({ existsSync });

    await hook({ ...context, electronPlatformName: 'linux' });

    expect(existsSync).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('skips on-demand packages even when EVS_REQUIRED is set', async () => {
    const { hook, execFileSync, warn } = createHook({ env: { EVS_REQUIRED: '1' } });

    await expect(hook(context)).resolves.toBeUndefined();

    expect(execFileSync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[local-ai] No bundled engines. The pinned archives are verified by SHA-256 when downloaded.'
    );
  });

  it('skips unsigned development builds when no engines are bundled and EVS is optional', async () => {
    const { hook, execFileSync } = createHook();

    await hook(context);

    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('does not invoke Authenticode verification for bundled engines without EVS_REQUIRED', async () => {
    const { hook, execFileSync } = createHook({
      existsSync: vi.fn((filePath) => String(filePath).startsWith(path.join(runtimeRoot, 'cpu'))),
      env: {}
    });

    await hook(context);

    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('verifies only the bundled backends when EVS_REQUIRED is set', async () => {
    const { hook, execFileSync } = createHook({
      existsSync: vi.fn((filePath) => String(filePath) === path.join(runtimeRoot, 'vulkan')),
      env: { EVS_REQUIRED: '1' }
    });

    await hook(context);

    expect(execFileSync).toHaveBeenCalledTimes(1);
    const [command, args, options] = execFileSync.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(command).toBe('powershell.exe');
    expect(options).toEqual({ windowsHide: true, stdio: 'inherit' });
    expect(args).toContain('-Command');
    const script = args.join(' ');
    expect(script).toContain("'vulkan'");
    expect(script).not.toContain("'cpu'");
    expect(script).toContain('Unsigned local AI runtime');
  });

  it('verifies both backends for release builds with bundled engines', async () => {
    const { hook, execFileSync } = createHook({
      existsSync: vi.fn(() => true),
      env: { EVS_REQUIRED: '1' }
    });

    await hook(context);

    const script = (execFileSync.mock.calls[0] as [string, string[]])[1].join(' ');
    expect(script).toContain("'cpu','vulkan'");
  });
});

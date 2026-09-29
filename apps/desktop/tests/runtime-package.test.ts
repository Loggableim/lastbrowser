import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { replaceRuntimeTreeIfUnused } from '../scripts/prepare-python-runtime.mjs';

describe('desktop runtime packaging', () => {
  it('runs the Python runtime preparation before Windows packaging', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['prepare:python']).toBe('node scripts/prepare-python-runtime.mjs');
    expect(packageJson.scripts['package:win']).toContain('npm run prepare:python');
  });

  it('ships the prepared Python runtime as an Electron resource', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.build.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'runtime/python',
          to: 'runtime/python',
          filter: expect.arrayContaining(['!**/__pycache__/**', '!**/*.pyc', '!**/site-packages/tests/**'])
        })
      ])
    );
  });

  it('keeps Sidekick in-tree and has no external sync or patch scripts', () => {
    const desktopRoot = process.cwd();
    const repoRoot = path.resolve(desktopRoot, '..', '..');
    const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'services', 'sidekick-source.json'), 'utf8')) as {
      source?: string;
    };
    const packageJson = JSON.parse(readFileSync(path.join(desktopRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(manifest.source).toBe('in-tree');
    expect(packageJson.scripts?.['sync:sidekick']).toContain('integrated directly in-tree');
    expect(existsSync(path.join(desktopRoot, 'scripts', 'sync-sidekick.mjs'))).toBe(false);
    expect(existsSync(path.join(desktopRoot, 'scripts', 'sidekick-patches.mjs'))).toBe(false);
    const mainSource = readFileSync(path.join(desktopRoot, 'src', 'main', 'main.ts'), 'utf8');
    expect(mainSource).toContain('const sidekickUpdater = createSidekickUpdater();');
    expect(mainSource).not.toContain('onInstalled: async');
  });

  it('invalidates pre-OpenAI bundled runtimes when preparing the Python runtime', () => {
    const prepareScript = readFileSync(path.resolve(process.cwd(), 'scripts/prepare-python-runtime.mjs'), 'utf8');
    expect(prepareScript).toContain("'openai>=1.0,<3'");
    expect(prepareScript).toContain("'anthropic>=0.39.0'");
    expect(prepareScript).toContain('import anthropic');
    expect(prepareScript).toContain("'--no-compile'");
    expect(prepareScript).toContain('runtimeSchema: 6');
    const sidekickPyproject = readFileSync(path.resolve(process.cwd(), '..', '..', 'services', 'sidekick', 'pyproject.toml'), 'utf8');
    expect(sidekickPyproject).toContain('exclude = ["tests", "tests.*"]');
  });

  it('runs browser smoke against the local source Electron and requires an explicit opt-in for installed builds', () => {
    const smokeScript = readFileSync(path.resolve(process.cwd(), 'scripts/smoke-browser.mjs'), 'utf8');
    expect(smokeScript).toContain("'node_modules',\n  'electron',\n  'dist'");
    expect(smokeScript).toContain('LASTBROWSER_SMOKE_ALLOW_INSTALLED');
    expect(smokeScript).toContain('LASTBROWSER_DOWNLOADS_DIR: SMOKE_DOWNLOAD_DIR');
    const mainStart = smokeScript.indexOf('async function main()');
    const installedGuard = smokeScript.indexOf('LASTBROWSER_SMOKE_ALLOW_INSTALLED !==');
    const profileCreation = smokeScript.indexOf('mkdirSync(SMOKE_PROFILE_DIR, { recursive: true })');
    expect(installedGuard).toBeGreaterThan(mainStart);
    expect(installedGuard).toBeLessThan(profileCreation);
    expect(smokeScript).toContain(".modern-titlebar .profile-switcher, .browser-titlebar .profile-switcher");
  });

  it('does not remove the runtime when a Windows process is using its executable tree', () => {
    const remove = vi.fn(() => true);

    expect(() => replaceRuntimeTreeIfUnused('C:\\Lastbrowser\\runtime\\python', {
      platform: 'win32',
      inspect: () => [{
        name: 'python.exe',
        pid: 4321,
        executablePath: 'c:\\lastbrowser\\runtime\\python\\python.exe',
        commandLine: '"c:\\lastbrowser\\runtime\\python\\python.exe" -m sidekick'
      }],
      remove
    })).toThrow(/in use by python\.exe \(PID 4321\)/);

    expect(remove).not.toHaveBeenCalled();
  });

  it('fails closed and does not remove the runtime when process inspection fails', () => {
    const remove = vi.fn(() => true);

    expect(() => replaceRuntimeTreeIfUnused('C:\\Lastbrowser\\runtime\\python', {
      platform: 'win32',
      inspect: () => { throw new Error('Access denied'); },
      remove
    })).toThrow(/process inspection failed \(Access denied\)/);

    expect(remove).not.toHaveBeenCalled();
  });

  it('fails closed when a Python process has no inspectable executable path', () => {
    const remove = vi.fn(() => true);

    expect(() => replaceRuntimeTreeIfUnused('C:\\Lastbrowser\\runtime\\python', {
      platform: 'win32',
      inspect: () => [{ name: 'python.exe', pid: 4322, executablePath: '', commandLine: '' }],
      remove
    })).toThrow(/cannot determine the executable path/);

    expect(remove).not.toHaveBeenCalled();
  });

  it('uses branded NSIS resources for the assisted installer', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.build.nsis).toMatchObject({
      installerHeader: 'build/installerHeader.bmp',
      installerSidebar: 'build/installerSidebar.bmp',
      uninstallerSidebar: 'build/installerSidebar.bmp',
      include: 'build/installer.nsh'
    });
  });
});

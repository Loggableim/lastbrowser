import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertRelocatableCPython,
  isPreparedRuntimeCompatible,
  linuxStandalonePython,
  runtimeDependencyDigest,
  posixPythonLauncherScript,
  pythonRuntimeExecutableName,
  replaceRuntimeTreeIfUnused,
  resolveLinuxWheelhouseDir,
  resolveWheelhouseDir,
  verifyLinuxWheelhouse,
  verifyWheelhouse,
  writeLinuxWheelhouseManifest
} from '../scripts/prepare-python-runtime.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { patchAppRunText } = require('../scripts/patch-linux-apprun.cjs') as {
  patchAppRunText: (text: string) => string;
};

describe('desktop runtime packaging', () => {
  it('runs the Python runtime preparation before Windows packaging', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.main).toBe('dist/main/boot.js');
    expect(packageJson.scripts['build:main']).toContain('node scripts/stage-packaged-ms.mjs');
    expect(packageJson.scripts['prepare:python']).toBe('node scripts/prepare-python-runtime.mjs');
    expect(packageJson.scripts['package:win']).toContain('npm run prepare:python');
    expect(packageJson.scripts['package:win']).toContain('--win nsis portable');
    expect(packageJson.scripts['package:linux']).toContain('node scripts/stage-opencode-client.mjs');
    expect(packageJson.scripts['package:linux']).toContain('electron-builder --linux tar.gz AppImage --config.electronVersion=37.10.3+wvcus');
    expect(packageJson.scripts['package:linux']).toContain('--config.electronDownload.mirror=https://github.com/castlabs/electron-releases/releases/download/');
    expect(packageJson.build.electronVersion).toBe('45.0.0-alpha.14+wvcus');
    expect(packageJson.build.electronDownload.mirror).toBe('https://github.com/castlabs/electron-releases/releases/download/v');
    expect(packageJson.build.linux.target).toContain('AppImage');
    expect(packageJson.scripts['package:linux']).toContain('node scripts/write-linux-checksums.mjs');
    expect(packageJson.scripts['smoke:linux:fresh-profile']).toBe('node scripts/smoke-linux-fresh-profile.mjs');
    expect(packageJson.build.linux.target).toEqual(['tar.gz', 'AppImage']);
    expect(packageJson.build.linux.icon).toBe('../../brand/assets/app-icon-256.png');
    expect(packageJson.build.linux.artifactName).toBe('Lastbrowser-${version}-${arch}.${ext}');
    expect(packageJson.build.files).toContain('!node_modules/node-pty/prebuilds/darwin-*/**/*');
    expect(packageJson.build.win.files).toContain('!node_modules/node-pty/prebuilds/linux-*/**/*');
    expect(packageJson.build.linux.files).toContain('!node_modules/node-pty/prebuilds/win32-*/**/*');
    // debug (via electron-updater) requires `ms`. npm workspaces mark the hoisted
    // copy extraneous, so electron-builder omits it and the packaged main process
    // throws before a window exists. Keep it a direct production dependency.
    expect(packageJson.dependencies.ms).toBe('2.1.3');
  });

  it('ships the prepared Python runtime as an Electron resource', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.build.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'runtime/python',
          to: 'runtime/python',
          filter: expect.arrayContaining(['!**/*.cpython-3[!1]*.pyc', '!**/*.cpython-31[!2]*.pyc', '!**/__pycache__/**', '!**/*.pyc', '!**/site-packages/tests/**'])
        }),
        expect.objectContaining({
          from: '../../services',
          filter: expect.arrayContaining(['!sidekick/tests/**', '!**/__pycache__/**', '!**/*.pyc'])
        })
      ])
    );
  });

  it('excludes model weights from packaged resources and Python build inputs from app.asar', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    const localAiResource = packageJson.build.extraResources.find((resource: { from: string }) => resource.from === 'runtime/local-ai');

    expect(localAiResource.to).toBe('apps/desktop/runtime/local-ai');
    expect(localAiResource.filter).toEqual(expect.arrayContaining(['!**/*.gguf', '!**/*.safetensors', '!**/models/**']));
    expect(packageJson.build.files).toEqual(
      expect.arrayContaining([
        '!runtime/python/**',
        '!castlabs-venv/**',
        '!installer-asset-tools/**',
        '!wheelhouse/**',
        '!src/**'
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
    expect(prepareScript).toContain('runtimeSchema: 9');
    expect(prepareScript).toContain('python-build-standalone');
    expect(prepareScript).toContain(linuxStandalonePython.sha256);
    expect(prepareScript).toContain('prepareLinuxStandalonePython');
    const linuxPrepare = prepareScript.slice(
      prepareScript.indexOf('function prepareLinuxStandalonePython'),
      prepareScript.indexOf('export function verifyLinuxWheelhouse')
    );
    expect(linuxPrepare).toContain('python-build-standalone');
    expect(linuxPrepare).not.toContain('venv');
    expect(prepareScript).toContain("'--no-index', '--find-links', wheelhouseDir");
    expect(prepareScript).toContain("import anthropic, requests, uvicorn, yaml");
    expect(prepareScript).toContain('yaml, PIL, psutil');
    const requirements = readFileSync(path.resolve(process.cwd(), 'scripts/requirements-runtime.txt'), 'utf8');
    expect(requirements).toContain('Pillow==12.3.0');
    expect(requirements).toContain('psutil==7.2.2');
    expect(prepareScript).toContain("--no-build-isolation");
    expect(prepareScript).not.toContain('marker.packageVersion === desired.packageVersion');
    const sidekickPyproject = readFileSync(path.resolve(process.cwd(), '..', '..', 'services', 'sidekick', 'pyproject.toml'), 'utf8');
    expect(sidekickPyproject).toContain('exclude = ["tests", "tests.*"]');
  });

  it('rejects a venv and a host CPython for the Linux Sidekick runtime', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-pyvenv-'));
    try {
      writeFileSync(path.join(directory, 'pyvenv.cfg'), 'home = /usr/bin\nversion = 3.12.3\n');
      expect(() => assertRelocatableCPython(path.join(directory, 'python3'), directory)).toThrow(/pyvenv\.cfg/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    if (existsSync('/usr/bin/python3')) {
      expect(() => assertRelocatableCPython('/usr/bin/python3', os.tmpdir())).toThrow(/host/);
    }
  });

  it('patches extracted AppRun so APPDIR does not collapse to /', () => {
    const broken = `if [ -z "$APPDIR" ] ; then
  path="$(dirname "$(readlink -f "\${THIS}")")"
  while [[ "$path" != "" && ! -e "$path/$1" ]]; do
    path=\${path%/*}
  done
  APPDIR="$path"
fi
BIN="$APPDIR/Lastbrowser"
`;
    const patched = patchAppRunText(broken);
    expect(patched).toContain('APPDIR="$(dirname "$(readlink -f "${THIS}")")"');
    expect(patched).not.toContain('"$path/$1"');
    expect(patched).toContain('BIN="$APPDIR/Lastbrowser"');
    expect(patchAppRunText(patched)).toBe(patched);
  });

  it('selects python.exe on Windows and python3 on Linux', () => {
    expect(pythonRuntimeExecutableName('win32')).toBe('python.exe');
    expect(pythonRuntimeExecutableName('linux')).toBe('python3');
    expect(posixPythonLauncherScript()).toBe('#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nexec ./bin/python3 "$@"\n');
  });

  it('uses a separate Linux x64 wheelhouse unless an explicit Linux path is supplied', () => {
    expect(resolveLinuxWheelhouseDir({})).toBe(path.resolve('runtime/wheelhouse-linux-x64'));
    expect(resolveLinuxWheelhouseDir({ LASTBROWSER_LINUX_WHEELHOUSE: 'C:/wheelhouse/linux-x64' }))
      .toBe(path.resolve('C:/wheelhouse/linux-x64'));
  });

  it('verifies Linux wheelhouse hashes before using offline wheels', () => {
    const wheelhouse = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-linux-wheelhouse-'));
    const wheelFile = path.join(wheelhouse, 'uvicorn-0.54.0-py3-none-any.whl');
    writeFileSync(wheelFile, 'fixture wheel bytes');
    try {
      writeLinuxWheelhouseManifest(wheelhouse);
      expect(verifyLinuxWheelhouse(wheelhouse)).toEqual(['uvicorn-0.54.0-py3-none-any.whl']);
      writeFileSync(wheelFile, 'changed wheel bytes');
      expect(() => verifyLinuxWheelhouse(wheelhouse)).toThrow(/checksum mismatch/);
    } finally {
      rmSync(wheelhouse, { recursive: true, force: true });
    }
  });

  it('reuses an unchanged Python runtime across app version bumps', () => {
    const marker = {
      sourcePythonHome: 'C:\\Python312',
      sourceVersion: '3.12.10',
      packageVersion: '0.1.40',
      dependencyDigest: 'a'.repeat(64),
      runtimeSchema: 6
    };
    const desired = {
      sourcePythonHome: 'C:\\Python312',
      sourceVersion: '3.12.10',
      packageVersion: '0.1.41',
      dependencyDigest: 'a'.repeat(64),
      runtimeSchema: 6
    };

    expect(isPreparedRuntimeCompatible(marker, desired, true)).toBe(true);
    expect(isPreparedRuntimeCompatible(marker, { ...desired, runtimeSchema: 7 }, true)).toBe(false);
    expect(isPreparedRuntimeCompatible(marker, desired, false)).toBe(false);
    expect(isPreparedRuntimeCompatible(marker, desired, true, false)).toBe(false);
    expect(isPreparedRuntimeCompatible({ ...marker, dependencyDigest: undefined }, desired, true)).toBe(false);
    expect(isPreparedRuntimeCompatible(marker, { ...desired, dependencyDigest: 'b'.repeat(64) }, true)).toBe(false);
    expect(isPreparedRuntimeCompatible(marker, { ...desired, dependencyDigest: undefined }, true)).toBe(false);
  });

  it('changes the runtime dependency digest when requirements or package metadata changes', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-runtime-digest-'));
    const requirements = path.join(directory, 'requirements.txt');
    const metadata = path.join(directory, 'pyproject.toml');
    try {
      writeFileSync(requirements, 'Pillow==12.3.0\n');
      writeFileSync(metadata, '[project]\n');
      const initial = runtimeDependencyDigest([requirements, metadata]);
      expect(initial).toMatch(/^[a-f0-9]{64}$/);
      expect(runtimeDependencyDigest([requirements, metadata])).toBe(initial);
      writeFileSync(requirements, 'Pillow==12.3.1\n');
      expect(runtimeDependencyDigest([requirements, metadata])).not.toBe(initial);
      writeFileSync(requirements, 'Pillow==12.3.0\n');
      writeFileSync(metadata, '[project]\nname="changed"\n');
      expect(runtimeDependencyDigest([requirements, metadata])).not.toBe(initial);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('runs browser smoke against the local source Electron and requires an explicit opt-in for installed builds', () => {
    const smokeScript = readFileSync(path.resolve(process.cwd(), 'scripts/smoke-browser.mjs'), 'utf8').replace(/\r\n/g, '\n');
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

  it('has a reproducible packaged Linux fresh-profile Sidekick smoke', () => {
    const smoke = readFileSync(path.resolve(process.cwd(), 'scripts/smoke-linux-fresh-profile.mjs'), 'utf8').replace(/\r\n/g, '\n');
    expect(smoke).toContain("`--user-data-dir=${profileDir}`");
    expect(smoke).toContain("import fastapi, uvicorn");
    expect(smoke).toContain('http://127.0.0.1:8788/health');
    expect(smoke).toContain("env.LASTBROWSER_WEBUI_PYTHON = '/usr/bin/python3'");
    expect(smoke).toContain("env.HERMES_WEBUI_PYTHON = '/usr/bin/python3'");
    const requirements = readFileSync(path.resolve(process.cwd(), 'scripts/requirements-runtime.txt'), 'utf8');
    expect(requirements).toContain('uvicorn[standard]==');
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

  it('exposes an online preparation script alongside offline packaging', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['prepare:python:online']).toBe('node scripts/prepare-python-runtime.mjs --online');
    expect(packageJson.scripts['package:win']).toContain('npm run prepare:python');
  });

  it('fails with a clear error when offline wheelhouse is missing or empty', () => {
    const missingDir = path.resolve(process.cwd(), 'runtime', 'missing-wheelhouse-dir');
    expect(() => verifyWheelhouse(missingDir)).toThrow(/Offline Python runtime wheelhouse is missing/);
    expect(() => verifyWheelhouse(missingDir)).toThrow(/npm run prepare:python:online/);
    expect(() => verifyWheelhouse(missingDir)).toThrow(/LASTBROWSER_WHEELHOUSE/);

    const tempEmptyDir = path.join(os.tmpdir(), `test-empty-wheelhouse-${Date.now()}`);
    mkdirSync(tempEmptyDir, { recursive: true });
    try {
      expect(() => verifyWheelhouse(tempEmptyDir)).toThrow(/contains no \.whl files/);
      expect(() => verifyWheelhouse(tempEmptyDir)).toThrow(/npm run prepare:python:online/);
    } finally {
      rmSync(tempEmptyDir, { recursive: true, force: true });
    }
  });

  it('resolves the wheelhouse from LASTBROWSER_WHEELHOUSE override or default runtime path', () => {
    const custom = 'C:\\custom\\wheelhouse\\dir';
    expect(resolveWheelhouseDir({ LASTBROWSER_WHEELHOUSE: custom })).toBe(path.resolve(custom));
    expect(resolveWheelhouseDir({})).toBe(path.resolve(process.cwd(), 'runtime', 'wheelhouse'));
  });

  it('packages services/sidekick directly into Electron extraResources', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.build.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: '../../services',
          to: 'services'
        })
      ])
    );
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

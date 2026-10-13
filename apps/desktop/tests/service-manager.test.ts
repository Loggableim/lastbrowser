import { EventEmitter } from 'node:events';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  SidecarServices,
  buildSidecarEnvironment,
  findAvailablePort,
  findDevelopmentResourcesDir,
  resolveServiceLayout,
  resolveExistingRuntimeDirectory,
  sidecarPythonExecutableName
} from '../src/main/services.js';

describe('sidecar service layout', () => {
  it('resolves an existing runtime alias but never adopts a foreign store parent', () => {
    const root = mkdtempResourceRoot();
    const home = path.join(root, 'home');
    const foreign = path.join(root, 'foreign');
    const alias = path.join(root, 'alias');
    mkdirSync(home, { recursive: true }); mkdirSync(foreign, { recursive: true });
    writeFileSync(path.join(foreign, 'state.db'), 'fixture');
    const nativeRealpath = realpathSync.native;
    const probe = vi.spyOn(realpathSync, 'native').mockImplementation((file, options) =>
      String(file) === path.join(home, 'state.db')
        ? path.join(foreign, 'state.db')
        : nativeRealpath(file, options as any));
    try {
      expect(resolveExistingRuntimeDirectory(home)).toBe(home);
      probe.mockRestore();
      symlinkSync(foreign, alias, 'junction');
      expect(resolveExistingRuntimeDirectory(alias)).toBe(foreign);
      expect(resolveExistingRuntimeDirectory(path.join(root, 'new'))).toBe(path.join(root, 'new'));
    } finally { probe.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });
  it('uses Lastbrowser public environment variables while preserving Hermes compatibility aliases', () => {
    const layout = resolveServiceLayout('C:/Apps/Lastbrowser/resources');
    const env = buildSidecarEnvironment(layout, 8787);
    const stateDirectory = path.join(layout.runtimeDir, 'webui');

    expect(env.LASTBROWSER_HOME).toMatch(/Lastbrowser[\\/]runtime$/);
    expect(env.SIDEKICK_HOME).toBe(env.LASTBROWSER_HOME);
    expect(env.HERMES_HOME).toBe(env.LASTBROWSER_HOME);
    expect(env.LASTBROWSER_WEBUI_PORT).toBe('8787');
    expect(env.HERMES_WEBUI_PORT).toBe('8787');
    expect(env.LASTBROWSER_WEBUI_AGENT_DIR).toContain('services');
    expect(env.LASTBROWSER_WEBUI_STATE_DIR).toBe(stateDirectory);
    expect(env.SIDEKICK_WEBUI_STATE_DIR).toBe(stateDirectory);
    expect(env.SIDEKICK_STATE_DIR).toBe(stateDirectory);
    expect(env.HERMES_WEBUI_STATE_DIR).toBe(stateDirectory);
    expect(env.HERMES_WEBUI_AGENT_DIR).toBe(env.LASTBROWSER_WEBUI_AGENT_DIR);
    expect(env.LASTBROWSER_INTEGRATED).toBe('1');
    expect(env.PYTHONPATH).toContain('services');
  });

  it('keeps services inside the packaged resources directory', () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources', undefined, {}, 'win32');

    expect(layout.sidekickDir).toBe('D:\\Lastbrowser\\resources\\services\\sidekick');
    expect(layout.webuiDir).toBe('D:\\Lastbrowser\\resources\\services\\sidekick');
    expect(layout.webuiServer).toBe('D:\\Lastbrowser\\resources\\services\\sidekick\\cli\\web_server.py');
    expect(layout.pythonExe).toBe('D:\\Lastbrowser\\resources\\runtime\\python\\python.exe');
  });

  it('ignores a legacy runtime Sidekick overlay and always uses the in-tree bundle', () => {
    const resourcesRoot = mkdtempResourceRoot();
    const legacyRuntimeRoot = path.join(resourcesRoot, 'user-data');
    const bundledEntry = path.join(resourcesRoot, 'services', 'sidekick', 'cli', 'web_server.py');
    const legacyEntry = path.join(legacyRuntimeRoot, 'runtime', 'sidekick', 'cli', 'web_server.py');
    mkdirSync(path.dirname(bundledEntry), { recursive: true });
    mkdirSync(path.dirname(legacyEntry), { recursive: true });
    writeFileSync(bundledEntry, '# bundled source\n');
    writeFileSync(legacyEntry, '# legacy downloaded overlay\n');

    try {
      const layout = resolveServiceLayout(resourcesRoot, legacyRuntimeRoot, {});
      expect(layout.sidekickDir).toBe(path.join(resourcesRoot, 'services', 'sidekick'));
      expect(layout.webuiServer).toBe(bundledEntry);
      expect(layout.sidekickDir).not.toContain(path.join('runtime', 'sidekick'));
    } finally {
      rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it('uses python3 on Linux and keeps the Windows python.exe path', () => {
    expect(sidecarPythonExecutableName('win32')).toBe('python.exe');
    expect(sidecarPythonExecutableName('linux')).toBe('python3');

    const resourcesRoot = mkdtempResourceRoot();
    const python3 = path.join(resourcesRoot, 'runtime', 'python', 'python3');
    mkdirSync(path.dirname(python3), { recursive: true });
    writeFileSync(python3, '');
    try {
      expect(resolveServiceLayout(resourcesRoot, undefined, {}, 'linux').pythonExe).toBe(python3);
      const absent = path.join(resourcesRoot, 'absent');
      expect(resolveServiceLayout(absent, undefined, {}, 'linux').pythonExe)
        .toBe(path.join(absent, 'runtime', 'python', 'python3'));
      expect(resolveServiceLayout(absent, undefined, {}, 'win32').pythonExe)
        .toBe(path.join(absent, 'runtime', 'python', 'python.exe'));
    } finally {
      rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it('starts a fresh Linux profile through the bundled launcher, not system python3', () => {
    const resourcesRoot = mkdtempResourceRoot();
    const profileRoot = path.join(resourcesRoot, 'fresh-profile');
    const runtimePython = path.join(resourcesRoot, 'runtime', 'python');
    const launcher = path.join(runtimePython, 'python3');
    const venvPython = path.join(runtimePython, 'bin', 'python3');
    const marker = path.join(runtimePython, 'spawned.txt');
    mkdirSync(path.dirname(venvPython), { recursive: true });
    mkdirSync(profileRoot, { recursive: true });
    writeFileSync(launcher, '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nexec ./bin/python3 "$@"\n');
    writeFileSync(
      venvPython,
      '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nprintf "%s\\n" "$(pwd)/python3" > ../spawned.txt\ncase "$(pwd)/python3" in\n  /usr/bin/python3|/usr/bin/python) exit 3 ;;\nesac\nexit 0\n'
    );
    chmodSync(launcher, 0o755);
    chmodSync(venvPython, 0o755);

    try {
      const layout = resolveServiceLayout(resourcesRoot, profileRoot, {}, 'linux');
      expect(existsSync(path.join(profileRoot, 'runtime', 'state.db'))).toBe(false);
      expect(layout.runtimeDir).toBe(path.join(profileRoot, 'runtime'));
      expect(layout.pythonExe).toBe(launcher);
      expect(path.isAbsolute(layout.pythonExe)).toBe(true);

      const started = spawnSync(layout.pythonExe, ['-m', 'uvicorn', 'cli.web_server:app', '--host', '127.0.0.1', '--port', '8787'], {
        encoding: 'utf8'
      });
      expect(started.status).toBe(0);
      expect(readFileSync(marker, 'utf8').trim()).toBe(venvPython);
    } finally {
      rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it('respects an explicit public Python override for development and portable installs', () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources', undefined, {
      LASTBROWSER_WEBUI_PYTHON: 'D:/Portable/Python/python.exe'
    });

    expect(layout.pythonExe).toBe('D:/Portable/Python/python.exe');
  });

  it('uses the workspace desktop Python runtime during local Electron development', () => {
    const resourcesRoot = mkdtempResourceRoot();
    const pythonExe = path.join(resourcesRoot, 'apps', 'desktop', 'runtime', 'python', 'python.exe');
    mkdirSync(path.dirname(pythonExe), { recursive: true });
    writeFileSync(pythonExe, '');

    try {
      const layout = resolveServiceLayout(resourcesRoot, undefined, {}, 'win32');
      expect(layout.pythonExe).toBe(pythonExe);
    } finally {
      rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it('resolves the repo resource root from the built desktop main path', () => {
    const resourcesRoot = mkdtempResourceRoot();
    const serverPath = path.join(resourcesRoot, 'services', 'sidekick', 'cli', 'web_server.py');
    const builtMainPath = path.join(resourcesRoot, 'apps', 'desktop', 'dist', 'main');
    mkdirSync(path.dirname(serverPath), { recursive: true });
    mkdirSync(builtMainPath, { recursive: true });
    writeFileSync(serverPath, '');

    try {
      expect(findDevelopmentResourcesDir(builtMainPath, path.join(resourcesRoot, 'apps', 'desktop'))).toBe(resourcesRoot);
    } finally {
      rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it('refuses to launch a missing in-tree Sidekick entrypoint', async () => {
    const layout = resolveServiceLayout('D:/missing/Lastbrowser/resources', undefined, {});
    const service = new SidecarServices(layout, 8787, (() => {
      throw new Error('must not spawn when source is absent');
    }) as never);
    const status = await service.start();
    expect(status.sidekick).toBe('missing');
    expect(status.lastError).toContain('services');
  });

  it('uses the next available WebUI port when the preferred port is already occupied', async () => {
    const resourcesRoot = mkdtempResourceRoot();
    const sidekickEntry = path.join(resourcesRoot, 'services', 'sidekick', 'cli', 'web_server.py');
    mkdirSync(path.dirname(sidekickEntry), { recursive: true });
    writeFileSync(sidekickEntry, '');
    const layout = resolveServiceLayout(resourcesRoot);
    const spawned: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
    const fakeProcess = new EventEmitter() as EventEmitter & { kill: () => void };
    fakeProcess.kill = () => undefined;

    const service = new SidecarServices(
      layout,
      8787,
      ((command, args, options) => {
        spawned.push({ command, args: args as string[], env: options?.env });
        queueMicrotask(() => fakeProcess.emit('spawn'));
        return fakeProcess as never;
      }) as never,
      async () => 8788
    );

    try {
      const started = await service.start();

      expect(service.getStatus().webuiUrl).toBe('http://127.0.0.1:8788');
      expect(started.runtimeGeneration).toBeTruthy();
      expect(spawned[0].env?.LASTBROWSER_RUNTIME_GENERATION).toBe(started.runtimeGeneration);
      expect(spawned[0].env?.LASTBROWSER_WEBUI_PORT).toBe('8788');
      expect(spawned[0].env?.HERMES_WEBUI_PORT).toBe('8788');
    } finally {
      service.stop();
      expect(service.getStatus().runtimeGeneration).toBeNull();
      rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it('can probe past an occupied local port', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address.');

    const available = await findAvailablePort(address.port, '127.0.0.1', 10);
    server.close();

    expect(available).toBeGreaterThanOrEqual(address.port + 1);
  });
});

function mkdtempResourceRoot(): string {
  return path.join(tmpdir(), `lastbrowser-resources-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

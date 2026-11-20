import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: vi.fn(() => ({ status: 0 }))
}));
import {
  SidecarServices,
  buildSidecarEnvironment,
  findAvailablePort,
  findDevelopmentResourcesDir,
  resolveServiceLayout,
  resolveExistingRuntimeDirectory,
  resolveOpenCodeClientPath,
  sidecarPythonExecutableName
} from '../src/main/services.js';

describe('sidecar service layout', () => {
  it('records the Electron pid and a bundled OpenCode client for free chat', () => {
    const root = mkdtempResourceRoot();
    const sidekickDir = path.join(root, 'services', 'sidekick');
    const binary = path.join(sidekickDir, 'vendor', 'opencode', 'opencode');
    mkdirSync(path.dirname(binary), { recursive: true });
    writeFileSync(binary, '');
    try {
      expect(resolveOpenCodeClientPath({ sidekickDir }, 'linux')).toBe(binary);
      const layout = resolveServiceLayout(root, path.join(root, 'user-data'), {}, 'linux');
      const env = buildSidecarEnvironment(layout, 8791);
      expect(env.LASTBROWSER_ELECTRON_PID).toBe(String(process.pid));
      expect(env.LASTBROWSER_OPENCODE_BIN).toBe(binary);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

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
      expect(resolveServiceLayout(path.join(resourcesRoot, 'absent'), undefined, {}, 'linux').pythonExe).toBe('python3');
      expect(resolveServiceLayout(path.join(resourcesRoot, 'absent'), undefined, {}, 'win32').pythonExe)
        .toBe(path.join(resourcesRoot, 'absent', 'runtime', 'python', 'python.exe'));
    } finally {
      rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it('uses the packaged Linux venv even if the launching shell exports system Python', () => {
    const resourcesRoot = mkdtempResourceRoot();
    const python3 = path.join(resourcesRoot, 'runtime', 'python', 'python3');
    mkdirSync(path.dirname(python3), { recursive: true });
    writeFileSync(python3, '#!/bin/sh\n');
    try {
      const layout = resolveServiceLayout(resourcesRoot, undefined, {
        LASTBROWSER_WEBUI_PYTHON: '/usr/bin/python3'
      }, 'linux', true);
      expect(layout.pythonExe).toBe(python3);
      expect(() => resolveServiceLayout(path.join(resourcesRoot, 'missing'), undefined, {
        LASTBROWSER_WEBUI_PYTHON: '/usr/bin/python3'
      }, 'linux', true)).toThrow(/Packaged Linux Sidekick runtime is missing/);
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
    const spawned: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv; detached?: boolean }> = [];
    const fakeProcess = new EventEmitter() as EventEmitter & { kill: () => void };
    fakeProcess.kill = () => undefined;

    const service = new SidecarServices(
      layout,
      8787,
      ((command, args, options) => {
        spawned.push({ command, args: args as string[], env: options?.env, detached: options?.detached });
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
      expect(spawned[0].env?.LASTBROWSER_ELECTRON_PID).toBe(String(process.pid));
      expect(spawned[0].detached ?? false).toBe(process.platform === 'win32');
    } finally {
      service.stop();
      expect(service.getStatus().runtimeGeneration).toBeNull();
      rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')('stops the owned Windows Python supervisor and its children together', async () => {
    const root = mkdtempResourceRoot();
    const entry = path.join(root, 'services', 'sidekick', 'cli', 'web_server.py');
    mkdirSync(path.dirname(entry), { recursive: true });
    writeFileSync(entry, '');
    const child = Object.assign(new EventEmitter(), { pid: 43210, exitCode: null, signalCode: null, kill: vi.fn() });
    const service = new SidecarServices(resolveServiceLayout(root), 8787, (() => child) as never, async () => 8787);

    try {
      await service.start();
      service.stop();
      expect(spawnSync).toHaveBeenCalledWith(
        expect.stringMatching(/System32[\\/]taskkill\.exe$/i),
        ['/F', '/T', '/PID', '43210'],
        expect.objectContaining({ windowsHide: true })
      );
      expect(child.kill).not.toHaveBeenCalled();
    } finally {
      service.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('waits for both backend writers to close and prevents restarts during profile migration', async () => {
    const root = mkdtempResourceRoot();
    const entry = path.join(root, 'services', 'sidekick', 'cli', 'web_server.py');
    mkdirSync(path.dirname(entry), { recursive: true });
    writeFileSync(entry, '');
    const fakeChild = (pid: number) =>
      Object.assign(new EventEmitter(), { pid, exitCode: null, signalCode: null, kill: vi.fn(() => true) });
    const webui = fakeChild(43210);
    const gateway = fakeChild(43211);
    const spawn = vi.fn().mockReturnValueOnce(webui).mockReturnValueOnce(gateway);
    const service = new SidecarServices(resolveServiceLayout(root), 8787, spawn as never, async () => 8787,
      async () => ({ ok: true }), async () => ({ status: 'not-needed' }) as never);
    try {
      await service.start();
      await service.startGateway();
      let finished = false;
      const shutdown = service.stopForProfileMigration().then(() => { finished = true; });
      await service.start();
      await service.startGateway();
      expect(spawn).toHaveBeenCalledTimes(2);
      webui.emit('close', 0, null);
      await Promise.resolve();
      expect(finished).toBe(false);
      gateway.emit('close', 0, null);
      await shutdown;
      expect(finished).toBe(true);
      expect(service.getStatus().sidekick).toBe('stopped');
      expect(service.getGatewayStatus().running).toBe(false);
      await service.start();
      expect(spawn).toHaveBeenCalledTimes(2);
    } finally {
      service.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('cancels a starting Sidekick before it can open a database during migration', async () => {
    const root = mkdtempResourceRoot();
    const entry = path.join(root, 'services', 'sidekick', 'cli', 'web_server.py');
    mkdirSync(path.dirname(entry), { recursive: true });
    writeFileSync(entry, '');
    let releasePort!: (port: number) => void;
    const port = new Promise<number>(resolve => { releasePort = resolve; });
    const spawn = vi.fn();
    const service = new SidecarServices(resolveServiceLayout(root), 8787, spawn as never, () => port,
      async () => ({ ok: true }), async () => ({ status: 'not-needed' }) as never);
    try {
      const starting = service.start();
      const stopping = service.stopForProfileMigration();
      releasePort(8787);
      await Promise.all([starting, stopping]);
      expect(spawn).not.toHaveBeenCalled();
      expect(service.getStatus().sidekick).toBe('stopped');
    } finally {
      service.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')('aborts profile migration when Windows cannot confirm the backend process tree was stopped', async () => {
    const root = mkdtempResourceRoot();
    const entry = path.join(root, 'services', 'sidekick', 'cli', 'web_server.py');
    mkdirSync(path.dirname(entry), { recursive: true });
    writeFileSync(entry, '');
    const child = Object.assign(new EventEmitter(), { pid: 43210, exitCode: null, signalCode: null, kill: vi.fn() });
    const service = new SidecarServices(resolveServiceLayout(root), 8787, (() => child) as never, async () => 8787,
      async () => ({ ok: true }), async () => ({ status: 'not-needed' }) as never);
    try {
      await service.start();
      vi.mocked(spawnSync).mockReturnValueOnce({ status: 1 } as never);
      await expect(service.stopForProfileMigration()).rejects.toThrow(/did not confirm/);
      expect(child.kill).not.toHaveBeenCalled();
    } finally {
      service.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores an old health probe after Sidekick restarts on the same port', async () => {
    const root = mkdtempResourceRoot();
    const entry = path.join(root, 'services', 'sidekick', 'cli', 'web_server.py');
    mkdirSync(path.dirname(entry), { recursive: true });
    writeFileSync(entry, '');
    const probes: Array<(result: { ok: boolean }) => void> = [];
    const service = new SidecarServices(
      resolveServiceLayout(root),
      8787,
      (() => {
        const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
        queueMicrotask(() => child.emit('spawn'));
        return child;
      }) as never,
      async () => 8787,
      () => new Promise(resolve => probes.push(resolve))
    );
    const ready = vi.fn();
    service.onRuntimeReady(ready);

    try {
      const first = await service.start();
      service.stop();
      const second = await service.start();
      expect(first.runtimeGeneration).not.toBe(second.runtimeGeneration);

      probes[0]({ ok: true });
      await Promise.resolve();
      expect(service.getStatus().webuiHealth).toBe('checking');
      expect(ready).not.toHaveBeenCalled();

      expect(probes).toHaveLength(2);
      probes[1]({ ok: true });
      await Promise.resolve();
      expect(ready).toHaveBeenCalledExactlyOnceWith(second.runtimeGeneration);
      expect(service.getStatus().webuiHealth).toBe('ready');

      const obsoleteRestart = service.restartIfUnresponsive();
      service.stop();
      const third = await service.start();
      probes[2]({ ok: false });
      expect(await obsoleteRestart).toBe(false);
      expect(service.getStatus().runtimeGeneration).toBe(third.runtimeGeneration);
    } finally {
      service.stop();
      rmSync(root, { recursive: true, force: true });
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

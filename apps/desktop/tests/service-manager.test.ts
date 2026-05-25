import { EventEmitter } from 'node:events';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  SidecarServices,
  buildSidecarEnvironment,
  findAvailablePort,
  findDevelopmentResourcesDir,
  resolveServiceLayout
} from '../src/main/services.js';

describe('sidecar service layout', () => {
  it('uses Lastbrowser public environment variables while preserving Hermes compatibility aliases', () => {
    const layout = resolveServiceLayout('C:/Apps/Lastbrowser/resources');
    const env = buildSidecarEnvironment(layout, 8787);

    expect(env.LASTBROWSER_HOME).toMatch(/Lastbrowser[\\/]runtime$/);
    expect(env.SIDEKICK_HOME).toBe(env.LASTBROWSER_HOME);
    expect(env.HERMES_HOME).toBe(env.LASTBROWSER_HOME);
    expect(env.LASTBROWSER_WEBUI_PORT).toBe('8787');
    expect(env.HERMES_WEBUI_PORT).toBe('8787');
    expect(env.LASTBROWSER_WEBUI_AGENT_DIR).toContain('services');
    expect(env.HERMES_WEBUI_AGENT_DIR).toBe(env.LASTBROWSER_WEBUI_AGENT_DIR);
  });

  it('keeps services inside the packaged resources directory', () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources');

    expect(layout.sidekickDir).toBe('D:\\Lastbrowser\\resources\\services\\sidekick');
    expect(layout.webuiDir).toBe('D:\\Lastbrowser\\resources\\services\\webui');
    expect(layout.webuiServer).toBe('D:\\Lastbrowser\\resources\\services\\webui\\server.py');
    expect(layout.pythonExe).toBe('D:\\Lastbrowser\\resources\\runtime\\python\\python.exe');
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
      const layout = resolveServiceLayout(resourcesRoot);
      expect(layout.pythonExe).toBe(pythonExe);
    } finally {
      rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it('resolves the repo resource root from the built desktop main path', () => {
    const resourcesRoot = mkdtempResourceRoot();
    const serverPath = path.join(resourcesRoot, 'services', 'webui', 'server.py');
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

  it('uses the next available WebUI port when the preferred port is already occupied', async () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources');
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

    await service.start();

    expect(service.getStatus().webuiUrl).toBe('http://127.0.0.1:8788');
    expect(spawned[0].env?.LASTBROWSER_WEBUI_PORT).toBe('8788');
    expect(spawned[0].env?.HERMES_WEBUI_PORT).toBe('8788');
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

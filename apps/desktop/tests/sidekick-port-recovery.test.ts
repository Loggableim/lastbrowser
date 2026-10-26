import { describe, expect, it, vi } from 'vitest';
import {
  isSidekickBackendCommandLine,
  parseListenerPid,
  recoverHungSidekickPort,
  type PortRecoveryDeps
} from '../src/main/sidekick-port-recovery.js';

const WINDOWS_NETSTAT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    127.0.0.1:8787         0.0.0.0:0              LISTENING       4242
  TCP    127.0.0.1:8788         0.0.0.0:0              ABHÖREN         5150
  TCP    127.0.0.1:8787         127.0.0.1:51000        ESTABLISHED     9999
  TCP    [::]:8787              [::]:0                 LISTENING       4343
`;

const LINUX_SS = `LISTEN 0 128 127.0.0.1:8787 0.0.0.0:* users:(("python3",pid=7001,fd=3))
LISTEN 0 128 127.0.0.1:8788 0.0.0.0:* users:(("node",pid=7002,fd=9))
`;

describe('Sidekick port recovery parsing', () => {
  it('finds the Windows listener PID independent of the localized state column', () => {
    expect(parseListenerPid(WINDOWS_NETSTAT, 8787, 'win32')).toBe(4242);
    expect(parseListenerPid(WINDOWS_NETSTAT, 8788, 'win32')).toBe(5150);
    expect(parseListenerPid(WINDOWS_NETSTAT, 9999, 'win32')).toBeNull();
  });

  it('finds the Linux listener PID from ss output', () => {
    expect(parseListenerPid(LINUX_SS, 8787, 'linux')).toBe(7001);
    expect(parseListenerPid(LINUX_SS, 8790, 'linux')).toBeNull();
  });

  it('only recognizes the bundled Sidekick backend command lines', () => {
    expect(isSidekickBackendCommandLine('C:\\\\Lastbrowser\\\\python.exe -m cli.supervised_web --host 127.0.0.1 --port 8787')).toBe(true);
    expect(isSidekickBackendCommandLine('python -m uvicorn cli.web_server:app --host 127.0.0.1 --port 8787')).toBe(true);
    expect(isSidekickBackendCommandLine('node electron.js')).toBe(false);
    expect(isSidekickBackendCommandLine('python -m http.server 8787')).toBe(false);
    expect(isSidekickBackendCommandLine('')).toBe(false);
    expect(isSidekickBackendCommandLine(null)).toBe(false);
  });
});

function makeDeps(overrides: Partial<PortRecoveryDeps> = {}): PortRecoveryDeps & {
  terminate: ReturnType<typeof vi.fn>;
} {
  const terminate = vi.fn(async () => undefined);
  return {
    platform: 'linux',
    isPortAvailable: vi.fn(async () => false),
    checkHealth: vi.fn(async () => ({ ok: false, error: 'Local service request timed out.' })),
    findListenerPid: vi.fn(async () => 4242),
    readCommandLine: vi.fn(async () => 'python -m cli.supervised_web --host 127.0.0.1 --port 8787'),
    terminate,
    waitForPortFree: vi.fn(async () => true),
    ...overrides
  } as PortRecoveryDeps & { terminate: ReturnType<typeof vi.fn> };
}

describe('recoverHungSidekickPort', () => {
  it('uses the port when nothing listens there', async () => {
    const deps = makeDeps({ isPortAvailable: vi.fn(async () => true) });
    await expect(recoverHungSidekickPort(8787, deps)).resolves.toBe('free');
    expect(deps.terminate).not.toHaveBeenCalled();
  });

  it('never touches a healthy Sidekick backend', async () => {
    const deps = makeDeps({ checkHealth: vi.fn(async () => ({ ok: true })) });
    await expect(recoverHungSidekickPort(8787, deps)).resolves.toBe('healthy');
    expect(deps.terminate).not.toHaveBeenCalled();
  });

  it('terminates a hung Sidekick backend and reuses the port', async () => {
    const deps = makeDeps();
    await expect(recoverHungSidekickPort(8787, deps)).resolves.toBe('recovered');
    expect(deps.terminate).toHaveBeenCalledWith(4242);
  });

  it('leaves a hung process alone when it is not a Sidekick backend', async () => {
    const deps = makeDeps({ readCommandLine: vi.fn(async () => 'python -m http.server 8787') });
    await expect(recoverHungSidekickPort(8787, deps)).resolves.toBe('foreign');
    expect(deps.terminate).not.toHaveBeenCalled();
  });

  it('does not guess when the listener owner cannot be identified', async () => {
    const deps = makeDeps({ findListenerPid: vi.fn(async () => null) });
    await expect(recoverHungSidekickPort(8787, deps)).resolves.toBe('unidentified');
    expect(deps.terminate).not.toHaveBeenCalled();
  });

  it('reports failure instead of throwing when probing fails', async () => {
    const deps = makeDeps({ isPortAvailable: vi.fn(async () => { throw new Error('boom'); }) });
    await expect(recoverHungSidekickPort(8787, deps)).resolves.toBe('failed');
  });
});

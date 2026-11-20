import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { app } from 'electron';
import { startWindowsProtectedSpace } from '../src/main/windows-protected-space-startup.js';

const fixture = vi.hoisted(() => ({
  broker: vi.fn(),
  focus: vi.fn(),
  show: vi.fn(),
  quit: vi.fn(),
  handler: vi.fn(),
  sender: {},
}));

vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    app: Object.assign(new Emitter(), {
      isPackaged: true,
      commandLine: { hasSwitch: () => false },
      setName() {},
      setPath() {},
      whenReady: async () => {},
      requestSingleInstanceLock: () => true,
      getLocale: () => 'en',
      quit: fixture.quit,
    }),
    BrowserWindow: class extends Emitter {
      private visible = false;
      webContents = Object.assign(new Emitter(), { setWindowOpenHandler() {} });
      constructor() { super(); fixture.sender = this.webContents; }
      removeMenu() {}
      isDestroyed() { return false; }
      isVisible() { return this.visible; }
      show() { this.visible = true; fixture.show(); }
      hide() { this.visible = false; }
      focus = fixture.focus;
      async loadURL() { this.emit('ready-to-show'); }
    },
    ipcMain: { handle: fixture.handler },
    dialog: { showErrorBox: vi.fn() },
  };
});
vi.mock('../src/main/active-space-config.js', () => ({
  loadActiveSpaceConfiguration: async (root: string) => ({ root }),
}));
vi.mock('../src/main/windows-space-runtime.js', () => ({
  resolveWindowsSpaceRuntime: () => ({ drive: 'Q:\\' }),
}));
vi.mock('../src/main/windows-protected-space-broker.js', () => ({
  createWindowsProtectedSpaceBroker: fixture.broker.mockReturnValue(async () => true),
}));

it('queues cold and locked HTTPS activations and forwards live links in order to the mounted browser', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-space-links-'));
  const pair = path.join(root, 'pair');
  const launch = [process.execPath, 'https://example.invalid/cold'];
  const args = process.argv;
  const input = new PassThrough();
  const acknowledgements = new PassThrough();
  const failedInput = new PassThrough();
  const failedAcknowledgements = new PassThrough();
  const urls: string[] = [];
  input.on('data', chunk => urls.push(...chunk.toString().trimEnd().split('\n').map(line => JSON.parse(line))));
  try {
    await mkdir(pair);
    process.argv = launch;
    await startWindowsProtectedSpace(pair);
    await new Promise(resolve => setImmediate(resolve));
    const broker = fixture.broker.mock.calls[0][0];
    const events = app as unknown as EventEmitter;
    events.emit('second-instance', {}, [process.execPath, 'https://example.invalid/locked']);
    expect(fixture.focus).toHaveBeenCalledOnce();
    expect(urls).toEqual([]);
    expect(broker.browserArgs).toEqual([]);

    broker.onMounted();
    broker.onBrowserStarted(failedInput, failedAcknowledgements);
    failedInput.destroy();
    await new Promise(resolve => setImmediate(resolve));
    broker.onBrowserStarted(input, acknowledgements);
    events.emit('second-instance', {}, [process.execPath, 'https://example.invalid/unlocked']);
    events.emit('second-instance', {}, [process.execPath, '--remote-debugging-port=9222', 'javascript:bad']);
    expect(urls).toEqual(['https://example.invalid/cold']);
    acknowledgements.write('LASTBROWSER-LINK-ACK\n');
    acknowledgements.write('LASTBROWSER-LINK-ACK\n');
    expect(urls).toEqual([
      'https://example.invalid/cold',
      'https://example.invalid/locked',
      'https://example.invalid/unlocked',
    ]);
    acknowledgements.write('LASTBROWSER-LINK-ACK\n');
    input.destroy();
    acknowledgements.end();
    events.emit('second-instance', {}, [process.execPath, 'https://example.invalid/during-close']);
    const unlock = fixture.handler.mock.calls[0][1];
    await unlock({ sender: fixture.sender, senderFrame: undefined }, new Uint8Array([1]));
    expect(fixture.quit).not.toHaveBeenCalled();
    expect(fixture.show).toHaveBeenCalledTimes(2);
  } finally {
    process.argv = args;
    input.destroy();
    acknowledgements.destroy();
    failedAcknowledgements.destroy();
    (app as unknown as EventEmitter).removeAllListeners('second-instance');
    await rm(root, { recursive: true, force: true });
  }
});

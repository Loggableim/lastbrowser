import { describe, expect, it, vi } from 'vitest';
import { registerBrowserDataCleanupIpc, type BrowserDataSession } from '../src/main/browser-data-cleanup.js';

describe('browser data cleanup IPC', () => {
  function register(sessions: BrowserDataSession[]) {
    let handler: ((_event: unknown, options?: unknown) => unknown) | undefined;
    const ipcMain = {
      handle: vi.fn((_channel: string, callback: typeof handler) => { handler = callback; })
    };
    registerBrowserDataCleanupIpc(ipcMain, () => sessions);
    expect(ipcMain.handle).toHaveBeenCalledWith('lastbrowser:browser:clearData', expect.any(Function));
    return { handler: handler! };
  }

  it('reports full success after clearing cache, cookies and storage for every session', async () => {
    const sessions = Array.from({ length: 2 }, () => ({
      clearCache: vi.fn(async () => undefined),
      clearStorageData: vi.fn(async () => undefined)
    }));
    const { handler } = register(sessions);

    await expect(handler({})).resolves.toEqual({ ok: true, clearedSessions: 2, failedSessions: 0 });
    for (const session of sessions) {
      expect(session.clearCache).toHaveBeenCalledOnce();
      expect(session.clearStorageData).toHaveBeenCalledWith({
        storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb', 'websql', 'serviceworkers']
      });
    }
  });

  it('reports partial failure and still attempts every requested operation in every session', async () => {
    const cacheFailure = {
      clearCache: vi.fn(async () => { throw new Error('cache denied'); }),
      clearStorageData: vi.fn(async () => undefined)
    };
    const storageFailure = {
      clearCache: vi.fn(async () => undefined),
      clearStorageData: vi.fn(async () => { throw new Error('storage denied'); })
    };
    const success = {
      clearCache: vi.fn(async () => undefined),
      clearStorageData: vi.fn(async () => undefined)
    };
    const { handler } = register([cacheFailure, storageFailure, success]);

    await expect(handler({})).resolves.toEqual({
      ok: false,
      clearedSessions: 1,
      failedSessions: 2,
      error: 'Could not clear browser data in 2 of 3 browser session(s).'
    });
    expect(cacheFailure.clearStorageData).toHaveBeenCalledOnce();
    expect(storageFailure.clearCache).toHaveBeenCalledOnce();
    expect(success.clearCache).toHaveBeenCalledOnce();
    expect(success.clearStorageData).toHaveBeenCalledOnce();
  });

  it('reports full failure instead of success when all sessions reject cleanup', async () => {
    const sessions = Array.from({ length: 2 }, () => ({
      clearCache: vi.fn(async () => { throw new Error('cache denied'); }),
      clearStorageData: vi.fn(async () => { throw new Error('storage denied'); })
    }));
    const { handler } = register(sessions);

    await expect(handler({}, { cache: true, cookies: true, storage: true })).resolves.toMatchObject({
      ok: false,
      clearedSessions: 0,
      failedSessions: 2
    });
  });

  it('preserves zero-operation success when every data category is disabled', async () => {
    const session = { clearCache: vi.fn(async () => undefined), clearStorageData: vi.fn(async () => undefined) };
    const { handler } = register([session]);

    await expect(handler({}, { cache: false, cookies: false, storage: false })).resolves.toEqual({
      ok: true,
      clearedSessions: 0,
      failedSessions: 0
    });
    expect(session.clearCache).not.toHaveBeenCalled();
    expect(session.clearStorageData).not.toHaveBeenCalled();
  });
});

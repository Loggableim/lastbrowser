import { afterEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());

vi.mock('../src/renderer/independent-assistant-client.js', () => ({
  IndependentAssistantClient: class {
    request = request;
  }
}));

import {
  chatModelCatalogViewKey, clearModelCatalog, prefetchModelCatalog, publishModelCatalog,
  publishQuickchatCatalog, readModelCatalogGroups, readQuickchatCatalog
} from '../src/renderer/model-catalog-prefetch.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; } };
}

function stubWindow(storage: Storage) {
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { localStorage: storage, dispatchEvent, lastbrowser: { independent: {} } });
  return dispatchEvent;
}

afterEach(() => { vi.unstubAllGlobals(); request.mockReset(); });

const selectionResult = {
  schemaVersion: 1,
  scope: { browserProfileId: 'browser-a', backendProfileId: '', spaceId: 'space-a' },
  groups: [{ provider_id: 'opencode-go', provider: 'OpenCode Go', configured: true,
    models: [{ id: 'deepseek-v4.1-flash', label: 'DeepSeek', supportsIndependent: true, reasoning_efforts: ['high'] }] }]
};

describe('standard chat model catalog cache', () => {
  it('derives one canonical view key for the same profile, Space, and backend profile', () => {
    const key = chatModelCatalogViewKey({ browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A', backendProfileName: 'work' });
    expect(key).toBe(chatModelCatalogViewKey({ browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A', backendProfileName: 'work' }));
    expect(chatModelCatalogViewKey({ browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A', backendProfileName: null }))
      .toBe(chatModelCatalogViewKey({ browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A' }));
    expect(key).not.toBe(chatModelCatalogViewKey({ browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A', backendProfileName: 'default' }));
    expect(chatModelCatalogViewKey({ browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A', backendProfileName: 'work' }))
      .not.toBe(chatModelCatalogViewKey({ browserProfileId: 'browser-b', workspacePath: 'C:/Spaces/A', backendProfileName: 'work' }));
  });

  it('writes and reads the standard catalog under lastbrowser.chatModelCatalog.v1', () => {
    const storage = memoryStorage(); const dispatchEvent = stubWindow(storage);
    const viewKey = chatModelCatalogViewKey({ browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A', backendProfileName: 'work' });
    publishModelCatalog(viewKey, selectionResult.groups as never);
    expect(JSON.parse(storage.getItem('lastbrowser.chatModelCatalog.v1') || '{}').viewKey).toBe(viewKey);
    expect(readModelCatalogGroups(viewKey)).toHaveLength(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(readModelCatalogGroups('other-view')).toEqual([]);
    clearModelCatalog();
    expect(readModelCatalogGroups(viewKey)).toEqual([]);
  });

  it('keeps Quickchat and standard caches separate', () => {
    const storage = memoryStorage(); stubWindow(storage);
    publishQuickchatCatalog('["browser-a","C:/Spaces/A","work"]', [{ id: 'quick-model' }]);
    expect(readQuickchatCatalog('["browser-a","C:/Spaces/A","work"]')).toEqual([{ id: 'quick-model' }]);
    expect(storage.getItem('lastbrowser.chatModelCatalog.v1')).toBeNull();
  });

  it('seeds the standard cache from a resolved scope and model selection', async () => {
    const storage = memoryStorage(); const dispatchEvent = stubWindow(storage);
    request.mockResolvedValueOnce({ ok: true, value: { scope: selectionResult.scope } });
    request.mockResolvedValueOnce({ ok: true, value: selectionResult });
    const viewKey = chatModelCatalogViewKey({ browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A', backendProfileName: 'work' });
    await prefetchModelCatalog({ viewKey, browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A', backendProfileName: 'work' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toMatchObject({ operation: 'modelSelection', payload: { action: 'get', includeCatalog: true } });
    expect(readModelCatalogGroups(viewKey)[0]).toMatchObject({ providerId: 'opencode-go' });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('leaves the cache untouched when a prefetch cannot resolve a scope', async () => {
    const storage = memoryStorage(); stubWindow(storage);
    request.mockResolvedValueOnce({ ok: false, error: { message: 'scope unavailable' } });
    const viewKey = chatModelCatalogViewKey({ browserProfileId: 'browser-a', workspacePath: 'C:/Spaces/A' });
    await prefetchModelCatalog({ viewKey, browserProfileId: 'browser-a', workspacePath: null });
    expect(storage.getItem('lastbrowser.chatModelCatalog.v1')).toBeNull();
  });
});

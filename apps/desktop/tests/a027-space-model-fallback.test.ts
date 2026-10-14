import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { readQuickchatFavoriteState, setQuickchatFavorite } from '../src/renderer/quickchat-preferences.js';
import { loadSpaceModelSelection, saveSpaceModel } from '../src/renderer/space-models.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; } };
}
afterEach(() => vi.unstubAllGlobals());

describe('Quickchat selection isolated from normal Space models', () => {
  it('persists only the explicit favorite while keeping the normal Space selection unchanged', () => {
    const storage = memoryStorage(), dispatchEvent = vi.fn();
    vi.stubGlobal('window', { localStorage: storage, dispatchEvent });
    const scope = { browserProfileId: 'browser-a', workspacePath: 'space-a', backendProfileName: 'personal' };
    saveSpaceModel('space-a', 'main-model', storage, 'main-provider');
    setQuickchatFavorite(scope, { model: 'quick-model', provider: 'quick-provider' });
    expect(readQuickchatFavoriteState(scope)).toEqual({ favorite: { model: 'quick-model', provider: 'quick-provider' }, invalid: false });
    expect(loadSpaceModelSelection('space-a', storage)).toEqual({ model: 'main-model', provider: 'main-provider' });
    expect(readQuickchatFavoriteState({ ...scope, workspacePath: 'space-b' }).favorite).toBeNull();
    expect(readQuickchatFavoriteState({ ...scope, browserProfileId: 'browser-b' }).favorite).toBeNull();
    expect(readQuickchatFavoriteState({ ...scope, backendProfileName: 'other' }).favorite).toBeNull();
    setQuickchatFavorite(scope, null);
    expect(readQuickchatFavoriteState(scope)).toEqual({ favorite: null, invalid: false });
    expect(loadSpaceModelSelection('space-a', storage)).toEqual({ model: 'main-model', provider: 'main-provider' });
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
  });
  it('treats a malformed present favorite as invalid until the user explicitly chooses Auto', () => {
    const storage = memoryStorage();
    vi.stubGlobal('window', { localStorage: storage, dispatchEvent: vi.fn() });
    const scope = { browserProfileId: 'browser-a', workspacePath: '', backendProfileName: 'personal' };
    const key = 'lastbrowser.quickchat.favorite.v1:' + JSON.stringify(['browser-a', '', 'personal']);
    storage.setItem(key, '{broken-json');
    expect(readQuickchatFavoriteState(scope)).toEqual({ favorite: null, invalid: true });
    setQuickchatFavorite(scope, null);
    expect(readQuickchatFavoriteState(scope)).toEqual({ favorite: null, invalid: false });
    expect(() => setQuickchatFavorite(scope, { provider: 'auto', model: 'auto' })).toThrow();
  });
  it('routes actual choices only through the scoped favorite callback and allows editing during a response', () => {
    const copilot = readFileSync(new URL('../src/renderer/components/CopilotSplitView.tsx', import.meta.url), 'utf8');
    expect(copilot).toContain('setQuickchatFavorite(favoriteScope, { provider: identity.provider, model: identity.model })');
    expect(copilot).toContain('setQuickchatFavorite(favoriteScope, null)');
    expect(copilot).not.toContain('setSelectedModel(');
    expect(copilot).not.toContain('setSelectedModelProvider(');
    expect(copilot).toContain('onSelectModel?.(identity.model, identity.provider)');
    expect(copilot).toContain('(!busy && modelGateReason !== null)');
  });
});

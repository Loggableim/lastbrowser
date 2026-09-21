/**
 * Tests for usePinnedAppStore (Pinned Apps Revamp)
 *
 * Covers:
 *  - Store initialisation with default presets
 *  - addApp / updateApp / removeApp CRUD
 *  - setActiveAppId
 *  - findMatchingApp domain matching (exact, subdomain, no-match)
 *  - isAppRunning
 *  - pinTabAsApp (de-duplicates, creates from tab)
 *  - Preset validation (all presets have required fields)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal electron mock so the store can load
// ---------------------------------------------------------------------------
vi.mock('electron', () => ({
  ipcRenderer: { on: vi.fn(), send: vi.fn(), invoke: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
  app: { getVersion: () => '0.0.0-test', isPackaged: false, getPath: () => '/tmp' },
}));

// ---------------------------------------------------------------------------
// localStorage shim for Node environment
// ---------------------------------------------------------------------------
const _ls: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => _ls[k] ?? null,
  setItem: (k: string, v: string) => { _ls[k] = v; },
  removeItem: (k: string) => { delete _ls[k]; },
  clear: () => { Object.keys(_ls).forEach(k => delete _ls[k]); },
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Store = Awaited<ReturnType<typeof import('../src/renderer/stores/usePinnedAppStore.js')>['usePinnedAppStore']>;
let store: typeof import('../src/renderer/stores/usePinnedAppStore.js')['usePinnedAppStore'];

beforeEach(async () => {
  // Clear localStorage so tests are isolated
  _ls['lastbrowser.pinnedApps.v2'] = '';
  _ls['lastbrowser.pinnedApps.v1'] = '';

  // Re-import the module fresh for each test suite but share within a describe
  vi.resetModules();
  const mod = await import('../src/renderer/stores/usePinnedAppStore.js');
  store = mod.usePinnedAppStore;
  // Reset to defaults
  store.getState().resetToDefaults();
});

// Helper: add a simple app
function addSimple(name: string, url: string) {
  return store.getState().addApp({
    name,
    url,
    color: '#ff0000',
    bg: 'rgba(255,0,0,0.15)',
    domain: new URL(url).hostname.replace(/^www\./, '')
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('usePinnedAppStore – initialisation', () => {
  it('starts with a non-empty apps list (default presets)', () => {
    expect(store.getState().apps.length).toBeGreaterThan(0);
  });

  it('every preset has id, name, color, and bg', () => {
    store.getState().apps.forEach((app) => {
      expect(typeof app.id).toBe('string');
      expect(app.id.length).toBeGreaterThan(0);
      expect(typeof app.name).toBe('string');
      expect(app.name.length).toBeGreaterThan(0);
      expect(typeof app.color).toBe('string');
      expect(typeof app.bg).toBe('string');
    });
  });
});

describe('usePinnedAppStore – CRUD', () => {
  it('addApp increases the count by one', () => {
    const before = store.getState().apps.length;
    addSimple('TestApp', 'https://example.com');
    expect(store.getState().apps.length).toBe(before + 1);
  });

  it('addApp creates unique ids for each app', () => {
    addSimple('A', 'https://a.example.com');
    addSimple('B', 'https://b.example.com');
    const ids = store.getState().apps.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('updateApp modifies an existing app by id, preserving unchanged fields', () => {
    addSimple('Old', 'https://old.com');
    const app = store.getState().apps.find(a => a.name === 'Old')!;
    store.getState().updateApp(app.id, { name: 'New', url: 'https://new.com' });
    const updated = store.getState().apps.find(a => a.id === app.id)!;
    expect(updated.name).toBe('New');
    expect(updated.url).toBe('https://new.com');
    expect(updated.color).toBe('#ff0000'); // preserved
  });

  it('removeApp removes the correct app by id', () => {
    addSimple('ToRemove', 'https://remove.me');
    const app = store.getState().apps.find(a => a.name === 'ToRemove')!;
    expect(app).toBeDefined();
    store.getState().removeApp(app.id);
    expect(store.getState().apps.find(a => a.id === app.id)).toBeUndefined();
  });

  it('setActiveAppId sets activeAppId correctly', () => {
    const first = store.getState().apps[0];
    store.getState().setActiveAppId(first.id);
    expect(store.getState().activeAppId).toBe(first.id);
  });

  it('setActiveAppId can be cleared to null', () => {
    const first = store.getState().apps[0];
    store.getState().setActiveAppId(first.id);
    store.getState().setActiveAppId(null);
    expect(store.getState().activeAppId).toBeNull();
  });

  it('reorderApps moves an app from one position to another', () => {
    const before = [...store.getState().apps];
    if (before.length < 2) return; // skip if only one app
    store.getState().reorderApps(0, 1);
    const after = store.getState().apps;
    expect(after[0].id).toBe(before[1].id);
    expect(after[1].id).toBe(before[0].id);
  });
});

describe('usePinnedAppStore – findMatchingApp', () => {
  it('finds an exact URL prefix match', () => {
    addSimple('GitHub', 'https://github.com');
    const match = store.getState().findMatchingApp('https://github.com/user/repo');
    expect(match).toBeDefined();
    expect(match?.name).toBe('GitHub');
  });

  it('finds a subdomain match via domain field', () => {
    addSimple('Google', 'https://google.com');
    const match = store.getState().findMatchingApp('https://mail.google.com/mail/u/0');
    expect(match).toBeDefined();
    expect(match?.name).toBe('Google');
  });

  it('returns undefined when no app matches', () => {
    addSimple('GitHub', 'https://github.com');
    const match = store.getState().findMatchingApp('https://totally-different.io/page');
    expect(match).toBeUndefined();
  });

  it('returns undefined for an empty URL', () => {
    const match = store.getState().findMatchingApp('');
    expect(match).toBeUndefined();
  });
});

describe('usePinnedAppStore – isAppRunning', () => {
  it('returns true when a matching open URL exists', () => {
    const app = addSimple('GitHub', 'https://github.com');
    const running = store.getState().isAppRunning(app, [
      'https://github.com/explore',
      'https://example.com'
    ]);
    expect(running).toBe(true);
  });

  it('returns false when no open URL matches', () => {
    const app = addSimple('GitHub', 'https://github.com');
    const running = store.getState().isAppRunning(app, [
      'https://example.com',
      'https://bing.com'
    ]);
    expect(running).toBe(false);
  });

  it('returns false for an app with no url/domain and empty open URLs', () => {
    const app = store.getState().addApp({
      name: 'Settings',
      panel: 'settings' as any,
      color: '#888',
      bg: 'rgba(0,0,0,0)',
    });
    const running = store.getState().isAppRunning(app, []);
    expect(running).toBe(false);
  });
});

describe('usePinnedAppStore – pinTabAsApp', () => {
  it('adds a new pinned app from a browser tab', () => {
    const before = store.getState().apps.length;
    // Use a URL not in DEFAULT_PINNED_APPS
    store.getState().pinTabAsApp({ url: 'https://miro-clone-test-x.example.com/board', title: 'My Board App' });
    expect(store.getState().apps.length).toBe(before + 1);
    const added = store.getState().apps.find(a => a.domain === 'miro-clone-test-x.example.com');
    expect(added).toBeDefined();
  });

  it('does not add a duplicate when the domain already exists', () => {
    store.getState().pinTabAsApp({ url: 'https://duplicate-test-xyz.com/page1', title: 'Dup' });
    const beforeCount = store.getState().apps.length;
    const result = store.getState().pinTabAsApp({ url: 'https://duplicate-test-xyz.com/page2', title: 'Dup2' });
    // Count should not increase
    expect(store.getState().apps.length).toBe(beforeCount);
    // Should return the existing app
    expect(result.domain).toBe('duplicate-test-xyz.com');
  });

  it('strips trailing title after dash for cleaner names', () => {
    store.getState().pinTabAsApp({
      url: 'https://example-site-test-abc.com',
      title: 'Dashboard - Site'  // Short enough to not get truncated at 20 chars
    });
    const added = store.getState().apps.find(a => a.domain === 'example-site-test-abc.com');
    expect(added?.name).toBe('Dashboard');
  });
});

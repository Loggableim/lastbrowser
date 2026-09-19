import { describe, expect, it } from 'vitest';
import {
  emptyTabState,
  loadProfileTabs,
  removeProfileTabs,
  saveProfileTabs,
  tabSessionsStorageKey
} from '../src/renderer/tab-sessions.js';
import type { BrowserTab } from '../src/renderer/tabs.js';

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    dump: () => Object.fromEntries(store)
  };
}

const tab = (id: string, url = 'https://example.com'): BrowserTab => ({
  id,
  url,
  title: `Tab ${id}`,
  pinned: false
});

describe('per-profile tab persistence', () => {
  it('returns an empty state when nothing is stored', () => {
    const state = loadProfileTabs('default', memoryStorage());
    expect(state).toEqual(emptyTabState());
  });

  it('round-trips tabs and the active tab id', () => {
    const storage = memoryStorage();
    saveProfileTabs('default', { tabs: [tab('a'), tab('b')], activeTabId: 'b' }, storage);

    const loaded = loadProfileTabs('default', storage);
    expect(loaded.tabs).toHaveLength(2);
    expect(loaded.tabs[1].id).toBe('b');
    expect(loaded.activeTabId).toBe('b');
  });

  it('keeps two profiles separate', () => {
    const storage = memoryStorage();
    saveProfileTabs('default', { tabs: [tab('a')], activeTabId: 'a' }, storage);
    saveProfileTabs('work', { tabs: [tab('x'), tab('y')], activeTabId: 'y' }, storage);

    expect(loadProfileTabs('default', storage).tabs.map((t) => t.id)).toEqual(['a']);
    expect(loadProfileTabs('work', storage).tabs.map((t) => t.id)).toEqual(['x', 'y']);
  });

  it('uses a single storage key for all profiles', () => {
    const storage = memoryStorage();
    saveProfileTabs('default', { tabs: [tab('a')], activeTabId: 'a' }, storage);
    saveProfileTabs('work', { tabs: [tab('x')], activeTabId: 'x' }, storage);

    const keys = Object.keys(storage.dump());
    expect(keys).toEqual([tabSessionsStorageKey]);
  });

  it('returns an empty state for corrupt JSON', () => {
    const storage = memoryStorage({ [tabSessionsStorageKey]: '{not json' });
    expect(loadProfileTabs('default', storage)).toEqual(emptyTabState());
  });

  it('returns an empty state when the stored value is an array', () => {
    const storage = memoryStorage({ [tabSessionsStorageKey]: '[1,2,3]' });
    expect(loadProfileTabs('default', storage)).toEqual(emptyTabState());
  });

  it('drops invalid tab entries', () => {
    const storage = memoryStorage({
      [tabSessionsStorageKey]: JSON.stringify({
        default: {
          tabs: [tab('good'), { id: '', url: 'https://x.test' }, { id: 'no-url' }, null, 'nope'],
          activeTabId: 'good'
        }
      })
    });

    const loaded = loadProfileTabs('default', storage);
    expect(loaded.tabs).toHaveLength(1);
    expect(loaded.tabs[0].id).toBe('good');
  });

  it('falls back to the first tab when the active id is unknown', () => {
    const storage = memoryStorage({
      [tabSessionsStorageKey]: JSON.stringify({
        default: { tabs: [tab('a'), tab('b')], activeTabId: 'ghost' }
      })
    });

    expect(loadProfileTabs('default', storage).activeTabId).toBe('a');
  });

  it('removes only the target profile', () => {
    const storage = memoryStorage();
    saveProfileTabs('default', { tabs: [tab('a')], activeTabId: 'a' }, storage);
    saveProfileTabs('work', { tabs: [tab('x')], activeTabId: 'x' }, storage);

    removeProfileTabs('work', storage);

    expect(loadProfileTabs('work', storage)).toEqual(emptyTabState());
    expect(loadProfileTabs('default', storage).tabs).toHaveLength(1);
  });

  it('is a no-op when removing an unknown profile', () => {
    const storage = memoryStorage();
    saveProfileTabs('default', { tabs: [tab('a')], activeTabId: 'a' }, storage);
    removeProfileTabs('missing', storage);
    expect(loadProfileTabs('default', storage).tabs).toHaveLength(1);
  });

  it('normalizes a missing title to a default', () => {
    const storage = memoryStorage({
      [tabSessionsStorageKey]: JSON.stringify({
        default: { tabs: [{ id: 'a', url: 'https://example.com' }], activeTabId: 'a' }
      })
    });

    expect(loadProfileTabs('default', storage).tabs[0].title).toBe('New tab');
  });
});

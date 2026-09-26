import { describe, expect, it } from 'vitest';
import {
  clearSessionSnapshot,
  emptyTabState,
  hasRecoverableSession,
  loadProfileTabs,
  loadSessionSnapshot,
  removeProfileTabs,
  saveProfileTabs,
  loadSpaceSnapGroup,
  saveSpaceSnapGroup,
  snapGroupsStorageKey,
  saveSessionSnapshot,
  sessionSnapshotStorageKey,
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

  it('saves, loads, and clears session snapshots', () => {
    const storage = memoryStorage();
    const state = { tabs: [tab('1', 'https://example.com'), tab('2', 'https://github.com')], activeTabId: '2' };

    saveSessionSnapshot('default', state, storage);

    const snapshot = loadSessionSnapshot('default', storage);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.profileId).toBe('default');
    expect(snapshot?.state.tabs).toHaveLength(2);
    expect(snapshot?.state.activeTabId).toBe('2');
    expect(snapshot?.timestamp).toBeGreaterThan(0);

    // Filtering by wrong profile returns null
    expect(loadSessionSnapshot('other-profile', storage)).toBeNull();

    clearSessionSnapshot(storage as unknown as Storage);
    expect(loadSessionSnapshot('default', storage)).toBeNull();
  });

  it('detects recoverable session when current tabs differ from snapshot', () => {
    const storage = memoryStorage();
    const state = { tabs: [tab('1', 'https://example.com'), tab('2', 'https://github.com')], activeTabId: '2' };
    saveSessionSnapshot('default', state, storage);

    // Only start page open -> recoverable
    const initialTabs = [tab('start', 'lastbrowser://ai-browser')];
    expect(hasRecoverableSession('default', initialTabs, storage)).toBe(true);

    // Already restored / same tabs open -> not recoverable
    expect(hasRecoverableSession('default', state.tabs, storage)).toBe(false);
  });

  it('excludes incognito tabs from saveProfileTabs and saveSessionSnapshot', () => {
    const storage = memoryStorage();
    const incognitoTab: BrowserTab = {
      id: 'incognito-1',
      url: 'https://secret.example.com',
      title: 'Secret Page',
      pinned: false,
      incognito: true
    };
    const normalTab = tab('normal-1', 'https://example.com');
    const state = { tabs: [normalTab, incognitoTab], activeTabId: 'incognito-1' };

    saveProfileTabs('default', state, storage);
    const loaded = loadProfileTabs('default', storage);
    expect(loaded.tabs).toHaveLength(1);
    expect(loaded.tabs[0].id).toBe('normal-1');
    expect(loaded.activeTabId).toBe('normal-1');

    saveSessionSnapshot('default', state, storage);
    const snapshot = loadSessionSnapshot('default', storage);
    expect(snapshot?.state.tabs).toHaveLength(1);
    expect(snapshot?.state.tabs[0].id).toBe('normal-1');
    expect(snapshot?.state.activeTabId).toBe('normal-1');
  });
});

describe('per-Space Snap group persistence', () => {
  it('round-trips occupied tabs and slot indexes independently per profile and Space', () => {
    const storage = memoryStorage();
    const group = { layout: 'quad-grid' as const, tabIds: ['a', 'c'], slotIndexes: [0, 3] };
    saveSpaceSnapGroup('default', 'space-one', group, ['a', 'b', 'c'], storage);
    saveSpaceSnapGroup('work', 'space-one', { ...group, layout: 'dual-50-50', slotIndexes: [0, 1] }, ['a', 'c'], storage);

    expect(loadSpaceSnapGroup('default', 'space-one', ['a', 'b', 'c'], storage)).toEqual({
      ...group, ratios: { x: [50], y: [50] }
    });
    expect(loadSpaceSnapGroup('default', 'space-two', ['a', 'c'], storage)).toBeNull();
    expect(loadSpaceSnapGroup('work', 'space-one', ['a', 'c'], storage)?.layout).toBe('dual-50-50');
    expect(Object.keys(storage.dump())).toContain(snapGroupsStorageKey);
  });

  it('drops stale ids, duplicate ids and duplicate or invalid slots', () => {
    const storage = memoryStorage({
      [snapGroupsStorageKey]: JSON.stringify({
        'default::home': {
          layout: 'quad-grid',
          tabIds: ['a', 'gone', 'a', 'b', 'c', 'd'],
          slotIndexes: [0, 1, 2, 0, 8, -1]
        }
      })
    });
    expect(loadSpaceSnapGroup('default', null, ['a', 'b', 'c', 'd'], storage)).toEqual({
      layout: 'quad-grid', tabIds: ['a'], slotIndexes: [0], ratios: { x: [50], y: [50] }
    });
  });

  it('persists resize ratios, clamps extreme values, and defaults old/malformed ratios safely', () => {
    const storage = memoryStorage();
    saveSpaceSnapGroup('default', null, {
      layout: 'quad-grid', tabIds: ['a', 'b'], slotIndexes: [0, 3],
      ratios: { x: [120], y: [-20] }
    }, ['a', 'b'], storage);
    expect(loadSpaceSnapGroup('default', null, ['a', 'b'], storage)?.ratios).toEqual({ x: [95], y: [5] });

    saveSpaceSnapGroup('work', null, {
      layout: 'trio-columns', tabIds: ['a', 'b', 'c'], slotIndexes: [0, 1, 2],
      ratios: { x: [70, 20], y: [] }
    }, ['a', 'b', 'c'], storage);
    expect(loadSpaceSnapGroup('work', null, ['a', 'b', 'c'], storage)?.ratios).toEqual({ x: [33.33, 66.67], y: [] });

    const legacy = memoryStorage({
      [snapGroupsStorageKey]: JSON.stringify({
        'legacy::home': { layout: 'dual-66-33', tabIds: ['x', 'y'], slotIndexes: [0, 1] }
      })
    });
    expect(loadSpaceSnapGroup('legacy', null, ['x', 'y'], legacy)?.ratios).toEqual({ x: [66.67], y: [] });
  });

  it('rejects malformed and single-view groups and removes an emptied group', () => {
    const storage = memoryStorage({
      [snapGroupsStorageKey]: JSON.stringify({
        'default::home': { layout: 'single', tabIds: ['a'], slotIndexes: [0] },
        'work::home': { layout: 'dual-50-50', tabIds: ['old'], slotIndexes: [0] }
      })
    });
    expect(loadSpaceSnapGroup('default', null, ['a'], storage)).toBeNull();
    expect(loadSpaceSnapGroup('work', null, ['new'], storage)).toBeNull();
    saveSpaceSnapGroup('default', null, null, [], storage);
    expect(JSON.parse(storage.dump()[snapGroupsStorageKey])).not.toHaveProperty('default::home');
    expect(JSON.parse(storage.dump()[snapGroupsStorageKey])).toHaveProperty('work::home');
  });

  it('ignores inherited object property names in malformed stored layouts', () => {
    const storage = memoryStorage({
      [snapGroupsStorageKey]: JSON.stringify({
        'default::home': { layout: 'toString', tabIds: ['a', 'b'], slotIndexes: [0, 1] }
      })
    });
    expect(loadSpaceSnapGroup('default', null, ['a', 'b'], storage)).toBeNull();
  });
});

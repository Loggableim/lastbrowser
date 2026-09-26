import { describe, expect, it } from 'vitest';
import {
  DETACHED_WINDOW_SESSION_KEY,
  loadDetachedWindowSession,
  saveDetachedWindowSession,
  type DetachedWindowSessionStorage
} from '../src/renderer/detached-window-session.js';

function memoryStorage(initial: Record<string, string> = {}): DetachedWindowSessionStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }
  };
}

const movedTab = { id: 'moved-tab', title: 'Example Domain', url: 'https://example.com/', pinned: false };
const destinationState = {
  profileId: 'default',
  spacePath: 'spaces/research',
  tabs: [movedTab],
  activeTabId: movedTab.id,
  splitLayout: 'single' as const,
  splitTabIds: [],
  splitSlotIndexes: [],
  snapRatios: { x: [50], y: [] }
};

describe('Detached window tab recovery', () => {
  it('restores the moved tab from this window session storage after a reload', () => {
    const destinationSessionStorage = memoryStorage();

    expect(saveDetachedWindowSession(destinationSessionStorage, destinationState)).toBe(true);
    // A reload creates a new renderer but retains the same BrowserWindow sessionStorage.
    expect(loadDetachedWindowSession(destinationSessionStorage)).toEqual(destinationState);
  });

  it('does not fall back to source profile tabs when the detached window has no private recovery state', () => {
    const sourceLocalStorage = memoryStorage({
      'lastbrowser.profileTabs.default.v1': JSON.stringify({
        tabs: [{ id: 'source-tab', title: 'Source only', url: 'https://source.example/' }],
        activeTabId: 'source-tab'
      })
    });
    const destinationSessionStorage = memoryStorage();

    expect(sourceLocalStorage.getItem('lastbrowser.profileTabs.default.v1')).toContain('source-tab');
    expect(loadDetachedWindowSession(destinationSessionStorage)).toBeNull();
  });

  it('rejects duplicated tab identities and malformed recovery data', () => {
    const storage = memoryStorage();
    expect(saveDetachedWindowSession(storage, { ...destinationState, tabs: [movedTab, movedTab] })).toBe(false);
    expect(storage.getItem(DETACHED_WINDOW_SESSION_KEY)).toBeNull();

    const malformed = memoryStorage({ [DETACHED_WINDOW_SESSION_KEY]: '{broken json' });
    expect(loadDetachedWindowSession(malformed)).toBeNull();
  });
});

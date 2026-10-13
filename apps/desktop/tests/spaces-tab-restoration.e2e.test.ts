import { describe, expect, it, vi } from 'vitest';
import { submitSpaceSetup, type SpaceSetupData } from '../src/renderer/components/SpaceSetupModal.js';
import {
  computeSpacePartition,
  loadSessionSnapshot,
  loadSpaceTabs,
  saveSessionSnapshot,
  saveSpaceTabs,
  type ProfileTabState
} from '../src/renderer/tab-sessions.js';
import type { BrowserTab } from '../src/renderer/tabs.js';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

function tab(id: string, url: string): BrowserTab {
  return { id, url, title: id, pinned: false };
}

const spaceSetup: SpaceSetupData = {
  path: 'C:/work/Research Space',
  name: 'Research',
  color: '#123456',
  model: 'smart-track',
  pinnedApps: [{ name: 'Docs', url: 'https://docs.example.test/' }],
  startUrl: 'https://research.example.test/'
};

describe('Spaces and tab restore journey', () => {
  it('creates a Space, switches between isolated tab sets, and restores its active tab after reload', async () => {
    const storage = createStorage();
    const closeSetup = vi.fn();
    let selectedSpacePath = '';
    const createSpace = vi.fn(async (data: SpaceSetupData) => {
      selectedSpacePath = data.path;
      return true;
    });

    const setupError = await submitSpaceSetup(spaceSetup, createSpace, closeSetup);
    expect(setupError).toBeNull();
    expect(createSpace).toHaveBeenCalledWith(spaceSetup);
    expect(closeSetup).toHaveBeenCalledOnce();
    expect(selectedSpacePath).toBe(spaceSetup.path);

    const homeState: ProfileTabState = {
      tabs: [tab('home-1', 'https://home.example.test/'), tab('home-2', 'https://news.example.test/')],
      activeTabId: 'home-2'
    };
    saveSpaceTabs('default', '', homeState, storage);

    const researchTabs: ProfileTabState = {
      tabs: [tab('research-1', 'https://research.example.test/'), tab('research-2', 'https://docs.example.test/')],
      activeTabId: 'research-2'
    };
    saveSpaceTabs('default', selectedSpacePath, researchTabs, storage);
    saveSessionSnapshot('default', researchTabs, storage, selectedSpacePath);

    expect(computeSpacePartition('default', '')).not.toBe(computeSpacePartition('default', selectedSpacePath));
    expect(loadSpaceTabs('default', '', storage)).toEqual(homeState);
    expect(loadSpaceTabs('default', selectedSpacePath, storage)).toEqual(researchTabs);

    // A reload starts with no in-memory tabs; persisted Space state and the
    // crash-recovery snapshot should restore only the matching profile + Space.
    const restoredResearch = loadSpaceTabs('default', selectedSpacePath, storage);
    expect(restoredResearch.tabs.map((item) => item.url)).toEqual([
      'https://research.example.test/',
      'https://docs.example.test/'
    ]);
    expect(restoredResearch.activeTabId).toBe('research-2');
    expect(loadSessionSnapshot('default', storage, selectedSpacePath)?.state.activeTabId).toBe('research-2');
    expect(loadSessionSnapshot('default', storage, '')).toBeNull();
    expect(loadSessionSnapshot('other-profile', storage, selectedSpacePath)).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  computeSpaceSessionKey,
  computeSpacePartition,
  loadSpaceTabs,
  saveSpaceTabs,
  getSpaceTabCount,
  emptyTabState
} from '../src/renderer/tab-sessions.js';
import type { BrowserTab } from '../src/renderer/tabs.js';
import fs from 'node:fs';
import path from 'node:path';

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

describe('Space Session & Partition Isolation', () => {
  describe('computeSpaceSessionKey', () => {
    it('normalizes empty, null and undefined spacePath to home', () => {
      expect(computeSpaceSessionKey('default')).toBe('default::home');
      expect(computeSpaceSessionKey('default', '')).toBe('default::home');
      expect(computeSpaceSessionKey('default', null)).toBe('default::home');
      expect(computeSpaceSessionKey('default', undefined)).toBe('default::home');
    });

    it('normalizes space slugs with special characters, slashes, and uppercase', () => {
      expect(computeSpaceSessionKey('default', 'workspaces/work')).toBe('default::workspaces_work');
      expect(computeSpaceSessionKey('user1', 'My Space! #1')).toBe('user1::my_space___1');
      expect(computeSpaceSessionKey('work', 'RECHERCHE')).toBe('work::recherche');
    });
  });

  describe('computeSpacePartition', () => {
    it('returns in-memory-incognito when incognito is true', () => {
      expect(computeSpacePartition('default', 'work', true)).toBe('in-memory-incognito');
      expect(computeSpacePartition('user1', '', true)).toBe('in-memory-incognito');
    });

    it('generates distinct persist partitions for distinct spaces', () => {
      const partSpaceA = computeSpacePartition('default', 'workspaces/work');
      const partSpaceB = computeSpacePartition('default', 'workspaces/personal');
      const partHome = computeSpacePartition('default', '');

      expect(partSpaceA).toBe('persist:space_workspaces_work_default');
      expect(partSpaceB).toBe('persist:space_workspaces_personal_default');
      expect(partHome).toBe('persist:space_home_default');

      // Crucial: No two spaces can ever share the same session partition
      expect(partSpaceA).not.toBe(partSpaceB);
      expect(partSpaceA).not.toBe(partHome);
      expect(partSpaceB).not.toBe(partHome);
    });

    it('isolates different profiles within the same space', () => {
      const partProfile1 = computeSpacePartition('profile-1', 'work');
      const partProfile2 = computeSpacePartition('profile-2', 'work');
      expect(partProfile1).toBe('persist:space_work_profile-1');
      expect(partProfile2).toBe('persist:space_work_profile-2');
      expect(partProfile1).not.toBe(partProfile2);
    });
  });

  describe('loadSpaceTabs & saveSpaceTabs', () => {
    it('returns empty state for unvisited spaces', () => {
      const storage = memoryStorage();
      const state = loadSpaceTabs('default', 'workspaces/new-space', storage);
      expect(state).toEqual(emptyTabState());
      expect(getSpaceTabCount('default', 'workspaces/new-space', storage)).toBe(0);
    });

    it('maintains strict isolation between Space A and Space B tabs', () => {
      const storage = memoryStorage();

      // Space A has 2 tabs (e.g. Work: Gmail, Jira)
      const tabsSpaceA = [
        tab('tab-a1', 'https://mail.google.com'),
        tab('tab-a2', 'https://jira.company.com')
      ];
      saveSpaceTabs('default', 'workspaces/work', { tabs: tabsSpaceA, activeTabId: 'tab-a1' }, storage);

      // Space B has 1 tab (e.g. Personal: Netflix)
      const tabsSpaceB = [
        tab('tab-b1', 'https://netflix.com')
      ];
      saveSpaceTabs('default', 'workspaces/personal', { tabs: tabsSpaceB, activeTabId: 'tab-b1' }, storage);

      // Verify Space A tabs
      const loadedA = loadSpaceTabs('default', 'workspaces/work', storage);
      expect(loadedA.tabs).toHaveLength(2);
      expect(loadedA.tabs.map((t) => t.url)).toEqual(['https://mail.google.com', 'https://jira.company.com']);
      expect(loadedA.activeTabId).toBe('tab-a1');
      expect(getSpaceTabCount('default', 'workspaces/work', storage)).toBe(2);

      // Verify Space B tabs
      const loadedB = loadSpaceTabs('default', 'workspaces/personal', storage);
      expect(loadedB.tabs).toHaveLength(1);
      expect(loadedB.tabs.map((t) => t.url)).toEqual(['https://netflix.com']);
      expect(loadedB.activeTabId).toBe('tab-b1');
      expect(getSpaceTabCount('default', 'workspaces/personal', storage)).toBe(1);

      // Mutating Space A does NOT affect Space B
      saveSpaceTabs('default', 'workspaces/work', { tabs: [tabsSpaceA[0]], activeTabId: 'tab-a1' }, storage);
      expect(loadSpaceTabs('default', 'workspaces/work', storage).tabs).toHaveLength(1);
      expect(loadSpaceTabs('default', 'workspaces/personal', storage).tabs).toHaveLength(1);
    });

    it('falls back to legacy profile entry when spacePath is empty or home', () => {
      const storage = memoryStorage();
      // Legacy data stored directly under profile ID "default"
      storage.setItem('lastbrowser.tabSessions.v1', JSON.stringify({
        default: {
          tabs: [tab('legacy-tab', 'https://example.com')],
          activeTabId: 'legacy-tab'
        }
      }));

      // When loading home/default space, it recovers the legacy tabs seamlessly
      const loadedHome = loadSpaceTabs('default', '', storage);
      expect(loadedHome.tabs).toHaveLength(1);
      expect(loadedHome.tabs[0].id).toBe('legacy-tab');

      // But a specific space like "work" still returns empty
      const loadedWork = loadSpaceTabs('default', 'work', storage);
      expect(loadedWork.tabs).toHaveLength(0);
    });
  });

  describe('Webview Session Mounting & React Key Integrity', () => {
    it('ensures webview keys incorporate activeSpace to force partition remounting', () => {
      const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');

      // Verify that webview keys include safeSpace
      expect(appTsx).toContain('key={`${activeProfile.id}:${safeSpace}:${tab.id}:${webviewMountKey}`}');
    });

    it('verifies StartPage receives space props and renders the Space Hub section', () => {
      const startPageTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/panels/NativeBrowserStartPage.tsx'), 'utf8');

      expect(startPageTsx).toContain('data-testid="browser-start-spaces-hub"');
      expect(startPageTsx).toContain('spaces = []');
      expect(startPageTsx).toContain('activeSpacePath');
      expect(startPageTsx).toContain('onSelectSpace');
      expect(startPageTsx).toContain('onAddSpace');
      expect(startPageTsx).toContain('Neuer Space');
    });

    it('verifies handleSpaceSelect mutes background audio on space switch', () => {
      const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');

      expect(appTsx).toContain('const handleSpaceSelect = useCallback');
      expect(appTsx).toContain('setAudioMuted(true)');
      expect(appTsx).toContain('clearSplitTabs()');
    });
  });
});

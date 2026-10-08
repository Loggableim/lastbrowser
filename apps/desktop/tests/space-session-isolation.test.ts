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
  it('starts chat requests in the active profile and Space scope', () => {
    const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    const startContract = fs.readFileSync(path.resolve(__dirname, '../src/renderer/guarded-native-chat-start.ts'), 'utf8');

    expect(appTsx).toContain('(payload) => window.lastbrowser.sidekick.startChat(payload)');
    expect(startContract).toContain('profile: input.captured.profileId');
    expect(startContract).toContain('workspace: input.captured.spacePath');
    expect(startContract).toContain('backendProfileName: input.captured.backendProfileName');
  });

  it('refreshes the session list in the active profile and Space scope', () => {
    const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');

    expect(appTsx).toContain('const requestedScope: SessionListScope = { profile: activeProfileId, workspacePath: activeSpacePath, backendProfileName: activeBackendProfileName };');
    expect(appTsx).toContain('sidekick.listSessions(requestedScope)');
    expect(appTsx).toContain('}, [activeProfileId, activeSpacePath, activeBackendProfileName, sidekickApiReady]);');
    expect(appTsx).toContain('!sessionId || activeSessionIdRef.current !== sessionId');
    expect(appTsx).toMatch(/sidekick\.getSession\(\{[\s\S]*?profile:\s*activeProfileIdRef\.current,[\s\S]*?workspacePath:\s*activeSpacePathRef\.current\s*\}\)/);
    expect(appTsx).toContain('const sessionScope: SessionListScope = { profile: activeProfileId, workspacePath: activeSpacePath, backendProfileName: activeBackendProfileName };');
    expect(appTsx).toContain('workspacePath: turnContext.spacePath');
    expect(appTsx).toContain('window.lastbrowser.sidekick.renameSession({');
    expect(appTsx).toContain('const isRequestScopeCurrent = (): boolean => sessionListResponseMatchesScope(requestedScope, {');
    expect(appTsx).toContain('mergeSessionListSnapshot(');
    expect(appTsx).toContain('activeSessionListScopeRef.current = nextScope;');
    expect(appTsx).toContain('chatUiOwnershipRef.current.releaseUiOwner();');
    expect(appTsx).toContain('chatUiOwnershipRef.current.ownerForStream(restored.streamId)');
    expect(appTsx).toContain('chatUiOwnershipRef.current.reactivate(localOwnerId, restored.sessionId)');
  });

  it('resolves and loads a new chat in its backend profile before selecting it', () => {
    const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    const createBlock = appTsx.slice(appTsx.indexOf('async function createNativeSession()'), appTsx.indexOf('function handleNewChat()'));
    expect(createBlock.indexOf('assistantController.resolveScope')).toBeGreaterThanOrEqual(0);
    expect(createBlock.indexOf('assistantController.resolveScope')).toBeLessThan(createBlock.indexOf('createAndLoadScopedSession'));
    expect(createBlock).toContain('backendProfileName: resolved.value.backendProfileName');
    expect(createBlock).toContain('activeSessionIdRef.current = session.session_id');
    expect(createBlock.indexOf('createAndLoadScopedSession')).toBeLessThan(createBlock.indexOf('activeSessionIdRef.current = session.session_id'));
    expect(createBlock).toContain('sameAssistantScope(session.space_scope, resolved.value.scope)');
  });

  it('guards active session loads against stale backend-profile responses', () => {
    const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    const loadBlock = appTsx.slice(appTsx.indexOf('const loadActiveSession = useCallback'), appTsx.indexOf('const independentSessionRun ='));
    expect(loadBlock).toContain('backendProfileName: activeBackendProfileNameRef.current');
    expect(loadBlock).toContain('const isSessionScopeCurrent');
    expect(loadBlock).toContain('backendProfileName: activeBackendProfileNameRef.current');
    expect(appTsx).toContain('[activeSessionId, activeBackendProfileName, loadActiveSession]');
  });

  describe('computeSpaceSessionKey', () => {
    it('normalizes empty, null and undefined spacePath to home', () => {
      expect(computeSpaceSessionKey('default')).toBe('default::home');
      expect(computeSpaceSessionKey('default', '')).toBe('default::home');
      expect(computeSpaceSessionKey('default', null)).toBe('default::home');
      expect(computeSpaceSessionKey('default', undefined)).toBe('default::home');
    });

    it('normalizes space slugs with special characters, slashes, and uppercase', () => {
      expect(computeSpaceSessionKey('default', 'workspaces/work')).toBe('default::workspaces_work~776f726b7370616365732f776f726b');
      expect(computeSpaceSessionKey('user1', 'My Space! #1')).toBe('user1::my_space___1~6d7920737061636521202331');
      expect(computeSpaceSessionKey('work', 'RECHERCHE')).toBe('work::recherche');
    });

    it('keeps lossy legacy slugs distinct without changing existing safe keys', () => {
      const paths = ['work/a', 'work_a'];
      expect(computeSpaceSessionKey('profile', 'work/a', paths)).not.toBe(computeSpaceSessionKey('profile', 'work_a', paths));
      expect(computeSpaceSessionKey('profile', 'Work')).toBe('profile::work');
      expect(computeSpaceSessionKey('profile', 'work/a', ['work/a'])).toBe('profile::work_a');
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

      expect(partSpaceA).toBe('persist:space_workspaces_work~776f726b7370616365732f776f726b_default');
      expect(partSpaceB).toBe('persist:space_workspaces_personal~776f726b7370616365732f706572736f6e616c_default');
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

    it('separates paths that previously collided and preserves legacy-safe partitions', () => {
      const paths = ['work/a', 'work_a'];
      expect(computeSpacePartition('profile', 'work/a', false, paths)).not.toBe(computeSpacePartition('profile', 'work_a', false, paths));
      expect(computeSpacePartition('profile', 'work_a')).toBe('persist:space_work_a_profile');
      expect(computeSpacePartition('profile', 'work/a', false, ['work/a'])).toBe('persist:space_work_a_profile');
      expect(computeSpacePartition('profile', 'home')).toBe('persist:space_home_profile');
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

    it('does not mix saved tabs for paths that normalize to the same legacy slug', () => {
      const storage = memoryStorage();
      const paths = ['work/a', 'work_a'];
      saveSpaceTabs('profile', 'work/a', { tabs: [tab('slash')], activeTabId: 'slash' }, storage, paths);
      saveSpaceTabs('profile', 'work_a', { tabs: [tab('underscore')], activeTabId: 'underscore' }, storage, paths);

      expect(loadSpaceTabs('profile', 'work/a', storage, paths).tabs.map((item) => item.id)).toEqual(['slash']);
      expect(loadSpaceTabs('profile', 'work_a', storage, paths).tabs.map((item) => item.id)).toEqual(['underscore']);
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

      // Verify that webview keys include partition/space calculation to isolate sessions
      expect(appTsx).toContain('key={`${computeSpacePartition(');
      expect(appTsx).toContain('activeSpacePath');
      expect(appTsx).toContain('tab.id');
      expect(appTsx).toContain('webviewMountKey');
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

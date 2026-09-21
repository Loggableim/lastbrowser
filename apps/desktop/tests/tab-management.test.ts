import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeTabsToRight,
  closeUnpinnedTabs,
  createInitialTab,
  deduplicateTabs,
  normalizeUrlForDeduplication,
  sortTabsByDomain,
  type BrowserTab
} from '../src/renderer/tabs.js';
import { useTabStore } from '../src/renderer/stores/useTabStore.js';

describe('tab management tools (Phase 10.4)', () => {
  describe('normalizeUrlForDeduplication', () => {
    it('normalizes host casing and removes trailing slash', () => {
      expect(normalizeUrlForDeduplication('https://EXAMPLE.com/path/')).toBe('https://example.com/path');
      expect(normalizeUrlForDeduplication('https://example.com/path')).toBe('https://example.com/path');
    });

    it('preserves query parameters while removing trailing slash before query', () => {
      expect(normalizeUrlForDeduplication('https://example.com/path/?q=test')).toBe('https://example.com/path?q=test');
    });

    it('handles empty or malformed strings gracefully', () => {
      expect(normalizeUrlForDeduplication('')).toBe('');
      expect(normalizeUrlForDeduplication('about:blank/')).toBe('about:blank');
    });
  });

  describe('deduplicateTabs', () => {
    it('removes duplicate tabs and preserves distinct tabs', () => {
      const tabs: BrowserTab[] = [
        { ...createInitialTab('https://example.com/page1'), id: 't1', title: 'Page 1' },
        { ...createInitialTab('https://example.com/page2'), id: 't2', title: 'Page 2' },
        { ...createInitialTab('https://example.com/page1/'), id: 't3', title: 'Page 1 duplicate' }
      ];

      const { deduplicated, removed } = deduplicateTabs(tabs);
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated.map((t) => t.id)).toEqual(['t1', 't2']);
      expect(removed).toHaveLength(1);
      expect(removed[0].id).toBe('t3');
    });

    it('prioritizes pinned tabs over unpinned tabs even if pinned tab appears later', () => {
      const tabs: BrowserTab[] = [
        { ...createInitialTab('https://example.com/docs'), id: 't1', title: 'Docs Unpinned', pinned: false },
        { ...createInitialTab('https://example.com/other'), id: 't2', title: 'Other', pinned: false },
        { ...createInitialTab('https://example.com/docs/'), id: 't3', title: 'Docs Pinned', pinned: true }
      ];

      const { deduplicated, removed } = deduplicateTabs(tabs);
      expect(deduplicated).toHaveLength(2);
      // Pinned tab t3 is preserved first
      expect(deduplicated.some((t) => t.id === 't3')).toBe(true);
      expect(removed.some((t) => t.id === 't1')).toBe(true);
    });

    it('returns empty removed list if no duplicates exist', () => {
      const tabs: BrowserTab[] = [
        { ...createInitialTab('https://alpha.com'), id: 't1', title: 'Alpha' },
        { ...createInitialTab('https://beta.com'), id: 't2', title: 'Beta' }
      ];

      const { deduplicated, removed } = deduplicateTabs(tabs);
      expect(deduplicated).toHaveLength(2);
      expect(removed).toHaveLength(0);
    });
  });

  describe('sortTabsByDomain', () => {
    it('sorts unpinned tabs alphabetically by hostname while keeping pinned tabs at the front', () => {
      const tabs: BrowserTab[] = [
        { ...createInitialTab('https://zebra.org'), id: 't1', title: 'Zebra', pinned: true },
        { ...createInitialTab('https://yahoo.com'), id: 't2', title: 'Yahoo', pinned: false },
        { ...createInitialTab('https://apple.com'), id: 't3', title: 'Apple', pinned: false },
        { ...createInitialTab('https://github.com'), id: 't4', title: 'GitHub', pinned: false }
      ];

      const sorted = sortTabsByDomain(tabs);
      expect(sorted.map((t) => t.id)).toEqual(['t1', 't3', 't4', 't2']);
    });

    it('strips www prefix when comparing domains', () => {
      const tabs: BrowserTab[] = [
        { ...createInitialTab('https://www.beta.com'), id: 't1', title: 'Beta', pinned: false },
        { ...createInitialTab('https://alpha.com'), id: 't2', title: 'Alpha', pinned: false }
      ];

      const sorted = sortTabsByDomain(tabs);
      expect(sorted.map((t) => t.id)).toEqual(['t2', 't1']);
    });
  });

  describe('closeUnpinnedTabs', () => {
    it('closes all unpinned tabs and preserves pinned tabs', () => {
      const tabs: BrowserTab[] = [
        { ...createInitialTab('https://pinned.com'), id: 't1', title: 'Pinned', pinned: true },
        { ...createInitialTab('https://temp1.com'), id: 't2', title: 'Temp 1', pinned: false },
        { ...createInitialTab('https://temp2.com'), id: 't3', title: 'Temp 2', pinned: false }
      ];

      const { remaining, removed } = closeUnpinnedTabs(tabs);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('t1');
      expect(removed).toHaveLength(2);
    });

    it('creates a fresh start tab if all tabs were unpinned', () => {
      const tabs: BrowserTab[] = [
        { ...createInitialTab('https://temp1.com'), id: 't1', title: 'Temp 1', pinned: false },
        { ...createInitialTab('https://temp2.com'), id: 't2', title: 'Temp 2', pinned: false }
      ];

      const { remaining, removed } = closeUnpinnedTabs(tabs);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).not.toBe('t1');
      expect(remaining[0].id).not.toBe('t2');
      expect(removed).toHaveLength(2);
    });
  });

  describe('closeTabsToRight', () => {
    it('closes tabs to the right of specified tab id', () => {
      const tabs: BrowserTab[] = [
        { ...createInitialTab('https://one.com'), id: 't1', title: 'One' },
        { ...createInitialTab('https://two.com'), id: 't2', title: 'Two' },
        { ...createInitialTab('https://three.com'), id: 't3', title: 'Three' },
        { ...createInitialTab('https://four.com'), id: 't4', title: 'Four' }
      ];

      const { remaining, removed } = closeTabsToRight(tabs, 't2');
      expect(remaining.map((t) => t.id)).toEqual(['t1', 't2']);
      expect(removed.map((t) => t.id)).toEqual(['t3', 't4']);
    });

    it('returns original tabs if target tab is the rightmost tab or not found', () => {
      const tabs: BrowserTab[] = [
        { ...createInitialTab('https://one.com'), id: 't1', title: 'One' },
        { ...createInitialTab('https://two.com'), id: 't2', title: 'Two' }
      ];

      const resLast = closeTabsToRight(tabs, 't2');
      expect(resLast.remaining).toHaveLength(2);
      expect(resLast.removed).toHaveLength(0);

      const resNotFound = closeTabsToRight(tabs, 'unknown');
      expect(resNotFound.remaining).toHaveLength(2);
      expect(resNotFound.removed).toHaveLength(0);
    });
  });

  describe('useTabStore tab management actions', () => {
    beforeEach(() => {
      useTabStore.setState({
        tabs: [
          { ...createInitialTab('https://google.com'), id: 't1', title: 'Google' },
          { ...createInitialTab('https://apple.com'), id: 't2', title: 'Apple' },
          { ...createInitialTab('https://google.com/'), id: 't3', title: 'Google Duplicate' }
        ],
        activeTabId: 't3',
        closedTabs: []
      });
    });

    it('closeDuplicateTabs closes duplicates, updates active tab if necessary, and remembers in closedTabs', () => {
      const removedCount = useTabStore.getState().closeDuplicateTabs();
      expect(removedCount).toBe(1);

      const state = useTabStore.getState();
      expect(state.tabs).toHaveLength(2);
      expect(state.tabs.map((t) => t.id)).toEqual(['t1', 't2']);
      expect(state.activeTabId).toBe('t1'); // switched from closed t3 to t1
      expect(state.closedTabs).toHaveLength(1);
      expect(state.closedTabs[0].url).toBe('https://google.com/');
    });

    it('sortTabsByDomain sorts open tabs alphabetically', () => {
      useTabStore.getState().sortTabsByDomain();
      const state = useTabStore.getState();
      expect(state.tabs[0].title).toBe('Apple');
      expect(state.tabs[1].title).toBe('Google');
    });

    it('closeUnpinnedTabs removes unpinned tabs and preserves active pinned tab', () => {
      useTabStore.setState({
        tabs: [
          { ...createInitialTab('https://pinned.com'), id: 'p1', title: 'Pinned', pinned: true },
          { ...createInitialTab('https://other.com'), id: 'o1', title: 'Other', pinned: false }
        ],
        activeTabId: 'o1',
        closedTabs: []
      });

      const removed = useTabStore.getState().closeUnpinnedTabs();
      expect(removed).toBe(1);

      const state = useTabStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].id).toBe('p1');
      expect(state.activeTabId).toBe('p1');
    });

    it('closeTabsToTheRight removes tabs located to the right', () => {
      useTabStore.setState({
        tabs: [
          { ...createInitialTab('https://one.com'), id: 't1', title: 'One' },
          { ...createInitialTab('https://two.com'), id: 't2', title: 'Two' },
          { ...createInitialTab('https://three.com'), id: 't3', title: 'Three' }
        ],
        activeTabId: 't3',
        closedTabs: []
      });

      const removed = useTabStore.getState().closeTabsToTheRight('t1');
      expect(removed).toBe(2);

      const state = useTabStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].id).toBe('t1');
      expect(state.activeTabId).toBe('t1');
    });
  });
});

import { create } from 'zustand';
import {
  type BrowserTab,
  type ClosedTab,
  browserStartUrl,
  createInitialTab,
  isAiBrowserHomeUrl,
  loadSearchEngineId,
  rememberClosedTab,
  reorderTabs,
  saveSearchEngineId,
  searchEngines,
  takeLastClosedTab,
  normalizeNavigationInput,
  updateTabTitle,
  updateTabUrl,
  togglePinnedTab,
  deduplicateTabs,
  sortTabsByDomain,
  closeUnpinnedTabs,
  closeTabsToRight,
  discardTabById,
  wakeTabById,
  discardInactiveTabs as discardInactiveTabsPure,
  getSavedMemoryEstimateMb as getSavedMemoryEstimateMbPure
} from '../tabs.js';
import {
  loadProfileTabs,
  removeProfileTabs,
  saveProfileTabs
} from '../tab-sessions.js';

export type BrowserMode = 'home' | 'search' | 'web';

export interface TabState {
  tabs: BrowserTab[];
  activeTabId: string;
  closedTabs: ClosedTab[];
  searchEngineId: string;
  draggedTabId: string | null;
  addressValue: string;
  browserMode: BrowserMode;
  browserLoadError: string;

  // Setters
  setTabs(tabs: BrowserTab[] | ((prev: BrowserTab[]) => BrowserTab[])): void;
  setActiveTabId(id: string | ((prev: string) => string)): void;
  setClosedTabs(tabs: ClosedTab[] | ((prev: ClosedTab[]) => ClosedTab[])): void;
  setSearchEngineId(id: string): void;
  setDraggedTabId(id: string | null): void;
  setAddressValue(value: string | ((prev: string) => string)): void;
  setBrowserMode(mode: BrowserMode | ((prev: BrowserMode) => BrowserMode)): void;
  setBrowserLoadError(error: string | ((prev: string) => string)): void;

  // Compound actions
  addTab(url?: string, options?: { incognito?: boolean }): void;
  closeTab(id: string): void;
  reopenClosedTab(): void;
  closeDuplicateTabs(): number;
  sortTabsByDomain(): void;
  closeUnpinnedTabs(): number;
  closeTabsToTheRight(id: string): number;
  /** Marks a tab as discarded (sleeping) to free memory. */
  discardTab(id: string): void;
  /** Wakes a discarded tab and restores its URL for reload. */
  wakeTab(id: string): void;
  /** Discards all tabs idle longer than maxIdleMs. Returns the count discarded. */
  discardInactiveTabs(maxIdleMs?: number): number;
  /** Returns estimated MB of RAM saved by currently discarded tabs. */
  getSavedMemoryEstimateMb(): number;
}

function resolveInitialTabs(): { tabs: BrowserTab[]; activeTabId: string } {
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (storage) {
      const profileId = storage.getItem('lastbrowser.activeProfile') ?? 'default';
      const stored = loadProfileTabs(profileId, storage);
      const cleanTabs = stored.tabs.filter((t) => !t.incognito);
      if (cleanTabs.length) {
        return {
          tabs: cleanTabs,
          activeTabId: cleanTabs.some((t) => t.id === stored.activeTabId)
            ? (stored.activeTabId as string)
            : cleanTabs[0].id
        };
      }
    }
  } catch {
    // Fall through to default.
  }
  const initial = createInitialTab(browserStartUrl);
  return { tabs: [initial], activeTabId: initial.id };
}

export const useTabStore = create<TabState>((set, get) => {
  const { tabs: initialTabs, activeTabId: initialActiveTabId } = resolveInitialTabs();
  const firstTab = initialTabs[0];

  return {
    tabs: initialTabs,
    activeTabId: initialActiveTabId,
    closedTabs: [],
    searchEngineId: typeof window !== 'undefined' ? loadSearchEngineId(window.localStorage) : 'duckduckgo',
    draggedTabId: null,
    addressValue: isAiBrowserHomeUrl(firstTab.url) ? '' : firstTab.url,
    browserMode: isAiBrowserHomeUrl(firstTab.url) ? 'home' : 'web',
    browserLoadError: '',

    setTabs: (tabs) =>
      set((state) => ({
        tabs: typeof tabs === 'function' ? tabs(state.tabs) : tabs
      })),
    setActiveTabId: (id) =>
      set((state) => ({
        activeTabId: typeof id === 'function' ? id(state.activeTabId) : id
      })),
    setClosedTabs: (closedTabs) =>
      set((state) => ({
        closedTabs: typeof closedTabs === 'function' ? closedTabs(state.closedTabs) : closedTabs
      })),
    setSearchEngineId: (searchEngineId) => {
      if (typeof window !== 'undefined') {
        saveSearchEngineId(window.localStorage, searchEngineId);
      }
      set({ searchEngineId });
    },
    setDraggedTabId: (draggedTabId) => set({ draggedTabId }),
    setAddressValue: (addressValue) =>
      set((state) => ({
        addressValue: typeof addressValue === 'function' ? addressValue(state.addressValue) : addressValue
      })),
    setBrowserMode: (browserMode) =>
      set((state) => ({
        browserMode: typeof browserMode === 'function' ? browserMode(state.browserMode) : browserMode
      })),
    setBrowserLoadError: (browserLoadError) =>
      set((state) => ({
        browserLoadError: typeof browserLoadError === 'function' ? browserLoadError(state.browserLoadError) : browserLoadError
      })),

    addTab: (url, options) => {
      const newTab = createInitialTab(url || browserStartUrl, options);
      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
        addressValue: isAiBrowserHomeUrl(newTab.url) ? '' : newTab.url,
        browserMode: isAiBrowserHomeUrl(newTab.url) ? 'home' : 'web'
      }));
    },

    closeTab: (id) => {
      const { tabs, activeTabId, closedTabs } = get();
      const tabToClose = tabs.find((t) => t.id === id);
      const remaining = tabs.filter((t) => t.id !== id);

      // Always keep at least one tab open.
      const nextTabs = remaining.length ? remaining : [createInitialTab(browserStartUrl)];

      let nextActiveTabId = activeTabId;
      if (activeTabId === id) {
        const closedIndex = tabs.findIndex((t) => t.id === id);
        const fallback =
          remaining[closedIndex] ?? remaining[closedIndex - 1] ?? remaining[0] ?? nextTabs[0];
        nextActiveTabId = fallback.id;
      }

      const nextClosed = tabToClose && !tabToClose.incognito
        ? rememberClosedTab(closedTabs, tabToClose)
        : closedTabs;

      set({
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
        closedTabs: nextClosed
      });
    },

    reopenClosedTab: () => {
      const { closedTabs } = get();
      const { tab, rest } = takeLastClosedTab(closedTabs);
      if (!tab) return;
      const newTab = createInitialTab(tab.url);
      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
        closedTabs: rest,
        addressValue: isAiBrowserHomeUrl(newTab.url) ? '' : newTab.url,
        browserMode: isAiBrowserHomeUrl(newTab.url) ? 'home' : 'web'
      }));
    },

    closeDuplicateTabs: () => {
      const { tabs, activeTabId, closedTabs } = get();
      const { deduplicated, removed } = deduplicateTabs(tabs);
      if (!removed.length) return 0;

      let nextClosed = closedTabs;
      for (const tab of removed) {
        if (!tab.incognito) nextClosed = rememberClosedTab(nextClosed, tab);
      }

      const nextActiveId = deduplicated.some((t) => t.id === activeTabId)
        ? activeTabId
        : deduplicated[0]?.id ?? '';

      set({
        tabs: deduplicated,
        activeTabId: nextActiveId,
        closedTabs: nextClosed
      });
      return removed.length;
    },

    sortTabsByDomain: () => {
      const { tabs } = get();
      const sorted = sortTabsByDomain(tabs);
      set({ tabs: sorted });
    },

    closeUnpinnedTabs: () => {
      const { tabs, activeTabId, closedTabs } = get();
      const { remaining, removed } = closeUnpinnedTabs(tabs);
      if (!removed.length) return 0;

      let nextClosed = closedTabs;
      for (const tab of removed) {
        if (!tab.incognito) nextClosed = rememberClosedTab(nextClosed, tab);
      }

      const nextActiveId = remaining.some((t) => t.id === activeTabId)
        ? activeTabId
        : remaining[0]?.id ?? '';

      set({
        tabs: remaining,
        activeTabId: nextActiveId,
        closedTabs: nextClosed
      });
      return removed.length;
    },

    closeTabsToTheRight: (id: string) => {
      const { tabs, activeTabId, closedTabs } = get();
      const { remaining, removed } = closeTabsToRight(tabs, id);
      if (!removed.length) return 0;

      let nextClosed = closedTabs;
      for (const tab of removed) {
        if (!tab.incognito) nextClosed = rememberClosedTab(nextClosed, tab);
      }

      const nextActiveId = remaining.some((t) => t.id === activeTabId)
        ? activeTabId
        : remaining[remaining.length - 1]?.id ?? remaining[0]?.id ?? '';

      set({
        tabs: remaining,
        activeTabId: nextActiveId,
        closedTabs: nextClosed
      });
      return removed.length;
    },

    discardTab: (id: string) => {
      const { tabs, activeTabId } = get();
      const updated = discardTabById(tabs, id, activeTabId);
      set({ tabs: updated });
    },

    wakeTab: (id: string) => {
      const { tabs } = get();
      const updated = wakeTabById(tabs, id);
      set({ tabs: updated });
    },

    discardInactiveTabs: (maxIdleMs?: number) => {
      const { tabs, activeTabId } = get();
      const { tabs: updated, count } = discardInactiveTabsPure(tabs, activeTabId, maxIdleMs);
      set({ tabs: updated });
      return count;
    },

    getSavedMemoryEstimateMb: () => {
      return getSavedMemoryEstimateMbPure(get().tabs);
    }
  };
});

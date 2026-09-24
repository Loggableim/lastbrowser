export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  pinned?: boolean;
  favicon?: string;
  isLoading?: boolean;
  isPlayingAudio?: boolean;
  isMuted?: boolean;
  incognito?: boolean;
  /** Whether the tab has been discarded (sleeping) to save memory. */
  isDiscarded?: boolean;
  /** Unix timestamp (ms) of the last time this tab was the active tab. */
  lastActiveAt?: number;
  /** Original URL preserved when the tab is discarded so it can be reloaded. */
  discardedUrl?: string;
};

export const browserStartUrl = 'lastbrowser://start';
export const aiBrowserHomeUrl = browserStartUrl;

/**
 * Search engines offered in Settings.
 *
 * The query placeholder is `%s` (the OpenSearch convention) so a custom engine
 * can be described by a single template string.
 */
export type SearchEngine = {
  id: string;
  label: string;
  /** URL template with `%s` where the encoded query goes. */
  template: string;
};

export const searchEngines: SearchEngine[] = [
  { id: 'google', label: 'Google', template: 'https://www.google.com/search?q=%s' },
  { id: 'duckduckgo', label: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  { id: 'bing', label: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  { id: 'brave', label: 'Brave Search', template: 'https://search.brave.com/search?q=%s' },
  { id: 'startpage', label: 'Startpage', template: 'https://www.startpage.com/sp/search?query=%s' },
  { id: 'ecosia', label: 'Ecosia', template: 'https://www.ecosia.org/search?q=%s' },
  { id: 'wikipedia', label: 'Wikipedia', template: 'https://en.wikipedia.org/w/index.php?search=%s' }
];

export const defaultSearchEngineId = 'google';
export const searchEngineStorageKey = 'lastbrowser.searchEngine.v1';

export function searchEngineById(id: string): SearchEngine {
  return searchEngines.find((engine) => engine.id === id) ?? searchEngines[0];
}

export function loadSearchEngineId(storage: Pick<Storage, 'getItem'> = window.localStorage): string {
  try {
    const stored = storage.getItem(searchEngineStorageKey);
    return stored && searchEngines.some((engine) => engine.id === stored)
      ? stored
      : defaultSearchEngineId;
  } catch {
    return defaultSearchEngineId;
  }
}

export function saveSearchEngineId(
  storage: Pick<Storage, 'setItem'>,
  id: string
): void {
  try {
    storage.setItem(searchEngineStorageKey, id);
  } catch {
    // Ignore storage failures in restricted renderer contexts.
  }
}

/** Build the search URL for a query using the given engine. */
export function searchUrlFor(query: string, engineId = defaultSearchEngineId): string {
  const engine = searchEngineById(engineId);
  return engine.template.replace('%s', encodeURIComponent(query));
}

let tabCounter = 0;

export function normalizeNavigationInput(raw: string, engineId = defaultSearchEngineId): string {
  const value = raw.trim();
  if (!value) return 'about:blank';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('about:')) return value;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value)) return `https://${value}`;
  return searchUrlFor(value, engineId);
}

export function isAiBrowserHomeUrl(url: string): boolean {
  return url === browserStartUrl;
}

export function isBrowserStartUrl(url: string): boolean {
  return url === browserStartUrl;
}

export function createInitialTab(
  url = aiBrowserHomeUrl,
  options?: { incognito?: boolean; pinned?: boolean }
): BrowserTab {
  tabCounter += 1;
  return {
    id: `tab-${Date.now()}-${tabCounter}`,
    title: options?.incognito ? 'New private tab' : 'New tab',
    url,
    pinned: Boolean(options?.pinned),
    ...(options?.incognito ? { incognito: true } : {})
  };
}

export function renameTab(tab: BrowserTab, title: string): BrowserTab {
  return {
    ...tab,
    title: title.trim() || 'New tab'
  };
}

export function updateTabUrl(tabs: BrowserTab[], tabId: string, url: string): BrowserTab[] {
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, url } : tab));
}

export function updateTabTitle(tabs: BrowserTab[], tabId: string, title: string): BrowserTab[] {
  return tabs.map((tab) => (tab.id === tabId ? renameTab(tab, title) : tab));
}

export function updateTabFavicon(tabs: BrowserTab[], tabId: string, favicon: string): BrowserTab[] {
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, favicon } : tab));
}

export function updateTabLoading(tabs: BrowserTab[], tabId: string, isLoading: boolean): BrowserTab[] {
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, isLoading } : tab));
}

export function updateTabMediaPlaying(tabs: BrowserTab[], tabId: string, isPlayingAudio: boolean): BrowserTab[] {
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, isPlayingAudio } : tab));
}

export function updateTabMuted(tabs: BrowserTab[], tabId: string, isMuted?: boolean): BrowserTab[] {
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, isMuted: isMuted ?? !tab.isMuted } : tab));
}

export function togglePinnedTab(tabs: BrowserTab[], tabId: string): BrowserTab[] {
  const next = tabs.map((tab) => (
    tab.id === tabId ? { ...tab, pinned: !tab.pinned } : tab
  ));
  return sortTabsByPinned(next);
}

export function reorderTabs(tabs: BrowserTab[], fromTabId: string, toTabId: string): BrowserTab[] {
  const fromIndex = tabs.findIndex((tab) => tab.id === fromTabId);
  const toIndex = tabs.findIndex((tab) => tab.id === toTabId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return tabs;
  const next = [...tabs];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return sortTabsByPinned(next);
}

export function sortTabsByPinned(tabs: BrowserTab[]): BrowserTab[] {
  return [...tabs].sort((left, right) => {
    const leftPinned = Boolean(left.pinned);
    const rightPinned = Boolean(right.pinned);
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
    return 0;
  });
}

/**
 * Recently closed tabs, newest last.
 *
 * Ctrl+Shift+T is muscle memory — closing a tab by accident and having no way
 * back is one of the most jarring things a browser can do. Only the URL and
 * title are kept: the guest webContents is gone, so the tab is recreated and
 * navigated fresh.
 */
export type ClosedTab = {
  url: string;
  title: string;
  closedAt: number;
};

export const closedTabLimit = 25;

export function rememberClosedTab(
  closed: ClosedTab[],
  tab: Pick<BrowserTab, 'url' | 'title'>
): ClosedTab[] {
  // The start page is not worth restoring — reopening it is what a new tab does.
  if (!tab.url || isBrowserStartUrl(tab.url)) return closed;
  const entry: ClosedTab = { url: tab.url, title: tab.title, closedAt: Date.now() };
  return [...closed, entry].slice(-closedTabLimit);
}

/** Pop the most recently closed tab, returning it with the remaining list. */
export function takeLastClosedTab(
  closed: ClosedTab[]
): { tab: ClosedTab | null; rest: ClosedTab[] } {
  if (!closed.length) return { tab: null, rest: closed };
  const tab = closed[closed.length - 1];
  return { tab, rest: closed.slice(0, -1) };
}

/**
 * Normalizes a URL for duplicate detection (stripping trailing slash and lowercasing domain).
 */
export function normalizeUrlForDeduplication(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) {
      return `${parsed.protocol}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
    }
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Finds and filters out duplicate tabs based on normalized URLs.
 * Pinned tabs are preserved preferentially.
 */
export function deduplicateTabs(tabs: BrowserTab[]): { deduplicated: BrowserTab[]; removed: BrowserTab[] } {
  const seenUrls = new Set<string>();
  const deduplicated: BrowserTab[] = [];
  const removed: BrowserTab[] = [];

  // First pass: register all pinned tabs to protect them
  for (const tab of tabs) {
    if (tab.pinned) {
      const key = normalizeUrlForDeduplication(tab.url);
      seenUrls.add(key);
      deduplicated.push(tab);
    }
  }

  // Second pass: add unpinned tabs only if URL hasn't been seen
  for (const tab of tabs) {
    if (tab.pinned) continue;
    const key = normalizeUrlForDeduplication(tab.url);
    if (seenUrls.has(key)) {
      removed.push(tab);
    } else {
      seenUrls.add(key);
      deduplicated.push(tab);
    }
  }

  return { deduplicated, removed };
}

/**
 * Sorts unpinned tabs alphabetically by their hostname / domain.
 * Pinned tabs remain at the very front of the strip.
 */
export function sortTabsByDomain(tabs: BrowserTab[]): BrowserTab[] {
  const pinned = tabs.filter((t) => t.pinned);
  const unpinned = tabs.filter((t) => !t.pinned);

  const getDomain = (tab: BrowserTab): string => {
    try {
      return new URL(tab.url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return tab.title.toLowerCase();
    }
  };

  const sortedUnpinned = [...unpinned].sort((a, b) => {
    const domainA = getDomain(a);
    const domainB = getDomain(b);
    const domainCmp = domainA.localeCompare(domainB);
    if (domainCmp !== 0) return domainCmp;
    return a.title.localeCompare(b.title);
  });

  return [...pinned, ...sortedUnpinned];
}

/**
 * Separates pinned tabs from unpinned tabs to allow closing all unpinned tabs.
 */
export function closeUnpinnedTabs(tabs: BrowserTab[]): { remaining: BrowserTab[]; removed: BrowserTab[] } {
  const remaining = tabs.filter((t) => t.pinned);
  const removed = tabs.filter((t) => !t.pinned);

  if (!remaining.length) {
    return { remaining: [createInitialTab(browserStartUrl)], removed };
  }

  return { remaining, removed };
}

/**
 * Closes all tabs located to the right of the given tab ID.
 */
export function closeTabsToRight(tabs: BrowserTab[], fromId: string): { remaining: BrowserTab[]; removed: BrowserTab[] } {
  const index = tabs.findIndex((t) => t.id === fromId);
  if (index === -1 || index === tabs.length - 1) {
    return { remaining: [...tabs], removed: [] };
  }

  const remaining = tabs.slice(0, index + 1);
  const removed = tabs.slice(index + 1);
  return { remaining, removed };
}

// ─── Phase 11.1: Tab-Discarding / Memory Saver ────────────────────────────────

/** Estimated RAM freed per discarded tab (MB). */
export const DISCARD_MEMORY_ESTIMATE_MB = 50;

/**
 * How long a tab must be idle before it is eligible for discarding (30 min).
 * Consumer code may pass a different value to `discardInactiveTabs`.
 */
export const DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Marks a single tab as discarded (sleeping).
 * Guards: never discards the active tab, pinned tabs, or audio-playing tabs.
 */
export function discardTabById(
  tabs: BrowserTab[],
  id: string,
  activeTabId: string
): BrowserTab[] {
  return tabs.map((tab) => {
    if (tab.id !== id) return tab;
    // Safety guards — never discard protected tabs.
    if (tab.id === activeTabId || tab.pinned || tab.isPlayingAudio) return tab;
    return {
      ...tab,
      isDiscarded: true,
      discardedUrl: tab.url,
      favicon: undefined,
      isLoading: false
    };
  });
}

/**
 * Wakes a discarded tab, restoring its URL so the renderer can reload it.
 */
export function wakeTabById(tabs: BrowserTab[], id: string): BrowserTab[] {
  return tabs.map((tab) => {
    if (tab.id !== id || !tab.isDiscarded) return tab;
    return {
      ...tab,
      isDiscarded: false,
      url: tab.discardedUrl ?? tab.url,
      discardedUrl: undefined,
      lastActiveAt: Date.now()
    };
  });
}

/**
 * Discards all tabs that have been idle for longer than `maxIdleMs`.
 * Never discards the active tab, pinned tabs, or audio-playing tabs.
 *
 * @returns An object with the updated tab array and the number of tabs discarded.
 */
export function discardInactiveTabs(
  tabs: BrowserTab[],
  activeTabId: string,
  maxIdleMs: number = DEFAULT_IDLE_THRESHOLD_MS
): { tabs: BrowserTab[]; count: number } {
  const now = Date.now();
  let count = 0;
  const updated = tabs.map((tab) => {
    if (tab.isDiscarded) return tab;
    if (tab.id === activeTabId || tab.pinned || tab.isPlayingAudio) return tab;
    const idle = now - (tab.lastActiveAt ?? 0);
    if (idle < maxIdleMs) return tab;
    count++;
    return {
      ...tab,
      isDiscarded: true,
      discardedUrl: tab.url,
      favicon: undefined,
      isLoading: false
    };
  });
  return { tabs: updated, count };
}

/**
 * Returns an estimate of how many MB of RAM have been saved by discarded tabs.
 * Each discarded tab is assumed to free ~50 MB.
 */
export function getSavedMemoryEstimateMb(tabs: BrowserTab[]): number {
  return tabs.filter((t) => t.isDiscarded).length * DISCARD_MEMORY_ESTIMATE_MB;
}

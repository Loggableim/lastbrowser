export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  pinned?: boolean;
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

export function createInitialTab(url = aiBrowserHomeUrl): BrowserTab {
  tabCounter += 1;
  return {
    id: `tab-${Date.now()}-${tabCounter}`,
    title: 'New tab',
    url,
    pinned: false
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

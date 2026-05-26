export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  pinned?: boolean;
};

export const browserStartUrl = 'lastbrowser://start';
export const aiBrowserHomeUrl = browserStartUrl;

let tabCounter = 0;

export function normalizeNavigationInput(raw: string): string {
  const value = raw.trim();
  if (!value) return 'about:blank';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('about:')) return value;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
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

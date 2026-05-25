export type BrowserTab = {
  id: string;
  title: string;
  url: string;
};

export const aiBrowserHomeUrl = 'lastbrowser://ai-browser';

let tabCounter = 0;

export function normalizeNavigationInput(raw: string): string {
  const value = raw.trim();
  if (!value) return 'about:blank';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('about:')) return value;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

export function isAiBrowserHomeUrl(url: string): boolean {
  return url === aiBrowserHomeUrl;
}

export function createInitialTab(url = aiBrowserHomeUrl): BrowserTab {
  tabCounter += 1;
  return {
    id: `tab-${Date.now()}-${tabCounter}`,
    title: 'New tab',
    url
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

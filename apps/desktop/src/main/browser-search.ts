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


import searchEngineConfig from './search-engines.json' with { type: 'json' };

export type SearchEngine = {
  id: string;
  label: string;
  /** URL template with `%s` where the encoded query goes. */
  template: string;
};

type SearchEngineConfig = {
  recommended: SearchEngine[];
  more: SearchEngine[];
};

const config = searchEngineConfig as SearchEngineConfig;
export const recommendedSearchEngines: SearchEngine[] = config.recommended;
export const moreSearchEngines: SearchEngine[] = config.more;
export const searchEngines: SearchEngine[] = [...recommendedSearchEngines, ...moreSearchEngines];
export const defaultSearchEngineId = 'google';
export const searchEngineStorageKey = 'lastbrowser.searchEngine.v1';

export function searchEngineById(id: string): SearchEngine {
  return searchEngines.find((engine) => engine.id === id) ?? searchEngines[0];
}

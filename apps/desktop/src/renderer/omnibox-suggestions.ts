import type { BrowserBookmark } from './bookmarks.js';
import type { BrowserVisit } from './history.js';
import { normalizeNavigationInput, searchUrlFor } from './tabs.js';
import { searchEngines } from '../main/browser-search.js';

export type OmniboxSuggestion = {
  id: string;
  type: 'search' | 'url' | 'bookmark' | 'history' | 'query';
  title: string;
  url: string;
  /** Completed search text, never interpreted as a website address. */
  query?: string;
  autoSelect: boolean;
};

export type OmniboxPrivacyContext = { profileId?: string; allowLegacyHistory?: boolean; incognito?: boolean };

export function scopedOmniboxVisits(visits: BrowserVisit[], context: OmniboxPrivacyContext): BrowserVisit[] {
  if (context.incognito) return [];
  if (!context.profileId) return visits.filter(visit => !visit.profileId);
  return visits.filter(visit => visit.profileId === context.profileId || (!visit.profileId && context.allowLegacyHistory === true));
}

/** Extract queries only from the search engines already configured in this app. */
export function queryFromSearchVisit(url: string): string | undefined {
  try {
    const actual = new URL(url);
    for (const engine of searchEngines) {
      const template = new URL(engine.template.replace('%s', '__lastbrowser_query__'));
      if (actual.origin !== template.origin || actual.pathname !== template.pathname) continue;
      for (const [key, value] of template.searchParams) {
        if (value !== '__lastbrowser_query__') continue;
        const query = actual.searchParams.get(key)?.trim();
        if (query) return query;
      }
    }
  } catch { /* Invalid history URLs have no search-query provenance. */ }
  return undefined;
}

export function buildOmniboxSuggestions(raw: string, bookmarks: BrowserBookmark[], visits: BrowserVisit[], engineId: string, context: OmniboxPrivacyContext = {}): OmniboxSuggestion[] {
  const input = raw.trim(), needle = input.toLowerCase();
  if (!input || input.startsWith('lastbrowser://')) return [];
  const search: OmniboxSuggestion = { id: `search-${input}`, type: 'search', title: input, query: input, url: searchUrlFor(input, engineId), autoSelect: false };
  const normalized = normalizeNavigationInput(input, engineId);
  const explicitUrl = normalized !== search.url;
  const ranked: Array<OmniboxSuggestion & { rank: number; count: number; recency: number }> = [];
  const prefixRank = (url: string, title: string): number => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return 0;
      const domain = parsed.hostname.replace(/^www\./, '').toLowerCase();
      const address = `${domain}${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (domain === needle || address.replace(/\/$/, '') === needle) return 700;
      if (!needle.includes(' ') && domain.startsWith(needle)) return 600;
      if (url.toLowerCase().startsWith(needle) || address.startsWith(needle)) return 550;
      if (title.toLowerCase().startsWith(needle)) return 400;
      if (title.toLowerCase().includes(needle) || address.includes(needle)) return 100;
    } catch { /* Never suggest invalid or executable stored destinations. */ }
    return 0;
  };
  const addSite = (url: string, title: string, type: 'history' | 'bookmark', count: number, recency: number, id: string) => {
    const rank = prefixRank(url, title);
    if (rank) ranked.push({ id, type, title: title || url, url, autoSelect: rank >= 550, rank, count, recency });
  };
  // Private windows do not draw persisted bookmarks or visits into completions.
  if (!context.incognito) {
    for (const bookmark of bookmarks) addSite(bookmark.url, bookmark.title, 'bookmark', 0, 0, `bm-${bookmark.id}`);
  }
  for (const visit of scopedOmniboxVisits(visits, context)) {
    const previousQuery = queryFromSearchVisit(visit.url);
    if (previousQuery) {
      const lower = previousQuery.toLowerCase();
      const rank = lower === needle ? 700 : lower.startsWith(needle) ? 500 : lower.includes(needle) ? 100 : 0;
      if (rank) ranked.push({ id: `query-${lower}`, type: 'query', title: previousQuery, query: previousQuery, url: searchUrlFor(previousQuery, engineId), autoSelect: rank >= 500, rank, count: visit.count, recency: visit.lastVisited });
      // A provider's visited search page proves a visited domain; a domain
      // completion goes to its home rather than replaying an unrelated query.
      const origin = new URL(visit.url).origin;
      addSite(origin, new URL(origin).hostname.replace(/^www\./, ''), 'history', visit.count, visit.lastVisited, `hist-domain-${origin}`);
    } else addSite(visit.url, visit.title, 'history', visit.count, visit.lastVisited, `hist-${visit.url}`);
  }
  ranked.sort((a, b) => b.rank - a.rank || b.count - a.count || b.recency - a.recency || a.url.localeCompare(b.url));
  const seen = new Set<string>();
  const candidates = ranked.filter(item => { const key = item.type === 'query' ? `query:${item.query?.toLowerCase()}` : item.url.replace(/\/$/, ''); if (seen.has(key)) return false; seen.add(key); return true; });
  const strong = candidates.filter(item => item.autoSelect).slice(0, 5);
  const secondary = candidates.filter(item => !item.autoSelect);
  const direct: OmniboxSuggestion[] = explicitUrl ? [{ id: `url-${input}`, type: 'url', title: normalized, url: normalized, autoSelect: true }] : [];
  return [...direct, ...strong.filter(item => item.url !== normalized || !explicitUrl), search, ...secondary].slice(0, 7).map(({ id, type, title, url, query, autoSelect }) => ({ id, type, title, url, query, autoSelect }));
}

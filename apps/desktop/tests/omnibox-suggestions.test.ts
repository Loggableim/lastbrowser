import { describe, expect, it } from 'vitest';
import { buildOmniboxSuggestions, queryFromSearchVisit, scopedOmniboxVisits } from '../src/renderer/omnibox-suggestions.js';
import { loadVisitedSites, recordVisit, saveVisitedSites, type BrowserVisit } from '../src/renderer/history.js';

const visit = (url: string, title: string, count = 1, lastVisited = 100): BrowserVisit => ({ url, title, count, lastVisited, profileId: 'profile-a' });
const context = { profileId: 'profile-a' };
describe('local omnibox suggestions', () => {
  it('selects a visited domain prefix before the explicit raw search action', () => {
    const result = buildOmniboxSuggestions('go', [], [visit('https://www.google.com/', 'Google', 10)], 'google', context);
    expect(result[0]).toMatchObject({ type: 'history', url: 'https://www.google.com/', autoSelect: true });
    expect(result[1]).toMatchObject({ type: 'search', query: 'go', url: 'https://www.google.com/search?q=go' });
  });
  it('searches normally without a strong match and never auto-selects loose title/URL matches', () => {
    expect(buildOmniboxSuggestions('go', [], [], 'google', context)[0].type).toBe('search');
    const result = buildOmniboxSuggestions('og', [], [visit('https://www.google.com/', 'Google')], 'google', context);
    expect(result[0]).toMatchObject({ type: 'search', autoSelect: false });
    expect(result.find(item => item.type === 'history')?.autoSelect).toBe(false);
  });
  it('ranks match quality, frequency and recency and always prioritizes explicit URLs', () => {
    const visits = [visit('https://goats.example/', 'Goats', 2, 300), visit('https://google.com/', 'Google', 10, 100), visit('https://gopher.example/', 'Gopher', 2, 400)];
    expect(buildOmniboxSuggestions('go', [], visits, 'google', context).slice(0, 3).map(item => item.title)).toEqual(['Google', 'Gopher', 'Goats']);
    expect(buildOmniboxSuggestions('https://goats.example/new', [], visits, 'google', context)[0]).toMatchObject({ type: 'url', url: 'https://goats.example/new', autoSelect: true });
  });
  it('completes recognized prior searches as query text using the currently selected engine', () => {
    const result = buildOmniboxSuggestions('gard', [], [visit('https://www.google.com/search?q=gardening+tips', 'Search')], 'duckduckgo', context);
    expect(result[0]).toMatchObject({ type: 'query', query: 'gardening tips', url: 'https://duckduckgo.com/?q=gardening%20tips', autoSelect: true });
    expect(queryFromSearchVisit('https://untrusted.example/search?q=secret')).toBeUndefined();
    expect(queryFromSearchVisit('https://www.google.com/maps?q=secret')).toBeUndefined();
    expect(buildOmniboxSuggestions('go', [], [visit('https://www.google.com/search?q=unrelated', 'Search')], 'google', context)[0].url).toBe('https://www.google.com');
  });
  it('deduplicates repeated queries and history/bookmark destinations', () => {
    const visits = [visit('https://google.com/', 'Google'), visit('https://www.google.com/search?q=garden', 'Search'), visit('https://www.google.com/search?q=garden&source=extra', 'Search')];
    const result = buildOmniboxSuggestions('gard', [], visits, 'google', context);
    expect(result.filter(item => item.type === 'query')).toHaveLength(1);
    expect(buildOmniboxSuggestions('go', [{ id: 'bm', title: 'Google', url: 'https://google.com/', createdAt: 1 }], visits, 'google', context).filter(item => item.url === 'https://google.com/')).toHaveLength(1);
  });
  it('excludes private, other-profile and ambiguous legacy history', () => {
    const visits = [visit('https://google.com/', 'Google'), { ...visit('https://goats.example/', 'Goats'), profileId: 'profile-b' }, { url: 'https://gopher.example/', title: 'Legacy', count: 1, lastVisited: 1 }];
    expect(scopedOmniboxVisits(visits, context)).toHaveLength(1);
    expect(scopedOmniboxVisits(visits, { ...context, allowLegacyHistory: true })).toHaveLength(2);
    expect(buildOmniboxSuggestions('go', [], visits, 'google', { ...context, incognito: true })).toHaveLength(1);
    expect(buildOmniboxSuggestions('go', [{ id: 'private-bm', title: 'Google', url: 'https://google.com', createdAt: 1 }], visits, 'google', { ...context, incognito: true })[0].type).toBe('search');
  });
  it('preserves profile provenance across persistence and keeps same-URL counts separate', () => {
    let visits = recordVisit([], 'https://google.com/', 'Google', { profileId: 'profile-a' });
    visits = recordVisit(visits, 'https://google.com/', 'Google B', { profileId: 'profile-b' });
    visits = recordVisit(visits, 'https://google.com/', 'Google A', { profileId: 'profile-a' });
    expect(visits.find(item => item.profileId === 'profile-a')?.count).toBe(2);
    expect(visits.find(item => item.profileId === 'profile-b')?.count).toBe(1);
    let serialized = '';
    const storage = { setItem: (_key: string, value: string) => { serialized = value; }, getItem: () => serialized };
    saveVisitedSites(storage, visits);
    expect(loadVisitedSites(storage).map(item => item.profileId).sort()).toEqual(['profile-a', 'profile-b']);
  });
});

import { describe, expect, it } from 'vitest';
import { chromeWebStoreSearchUrl, EXTENSION_RECOMMENDATION_PAGE_SIZE, filterExtensionRecommendations, loadExtensionSettingsData, paginateExtensionRecommendations, USER_APPROVED_EXTENSION_CANDIDATES } from '../src/renderer/extension-settings-state.js';

const entries = Array.from({ length: 26 }, (_, index) => ({
  id: `item-${index}`,
  name: `Extension ${index}`,
  category: index % 2 ? 'Privacy' : 'Security',
  description: `Description ${index}`,
  author: 'Publisher'
}));

describe('extension settings catalog helpers', () => {
  it('filters by approved IDs, category, and search term', () => {
    const allowed = new Set(['item-1', 'item-2', 'item-11']);
    expect(filterExtensionRecommendations(entries, 'extension 1', 'Privacy', allowed).map((entry) => entry.id))
      .toEqual(['item-1', 'item-11']);
  });

  it('uses bounded pages and clamps page selection', () => {
    expect(EXTENSION_RECOMMENDATION_PAGE_SIZE).toBe(12);
    expect(paginateExtensionRecommendations(entries, 0)).toHaveLength(12);
    expect(paginateExtensionRecommendations(entries, 1)).toHaveLength(12);
    expect(paginateExtensionRecommendations(entries, 2)).toHaveLength(2);
    expect(paginateExtensionRecommendations(entries, 999)).toEqual(entries.slice(24));
  });

  it('keeps the user-approved 20 candidates discoverable while the UI gates installation', () => {
    expect(USER_APPROVED_EXTENSION_CANDIDATES).toHaveLength(20);
    expect(new Set(USER_APPROVED_EXTENSION_CANDIDATES.map((entry) => entry.category)))
      .toEqual(new Set(['privacy', 'passwords', 'email']));
    expect(paginateExtensionRecommendations(USER_APPROVED_EXTENSION_CANDIDATES, 0)).toHaveLength(12);
    expect(paginateExtensionRecommendations(USER_APPROVED_EXTENSION_CANDIDATES, 1)).toHaveLength(8);
  });

  it('opens a real Chrome Web Store search URL and ignores blank input', () => {
    expect(chromeWebStoreSearchUrl('Privacy Badger'))
      .toBe('https://chromewebstore.google.com/search/Privacy%20Badger');
    expect(chromeWebStoreSearchUrl('   ')).toBeNull();
  });

  it('loads installed extensions even if optional legacy presets are unavailable', async () => {
    await expect(loadExtensionSettingsData({
      list: async () => [{ id: 'installed-one' }],
      presets: async () => { throw new Error('presets endpoint unavailable'); }
    })).resolves.toEqual({ extensions: [{ id: 'installed-one' }], presets: [] });
  });
});

import { describe, expect, it } from 'vitest';
import { isProviderModelQualified } from '../src/renderer/provider-chat-evidence.js';
import { filterQualifiedModelGroups, isProviderQualifiedByModels } from '../src/renderer/provider-beta-preferences.js';
import { isStableProvider } from '../src/renderer/provider-verification.js';
import { isVerifiedCatalogModel } from '../src/renderer/verified-catalog-models.js';

const storage = { getItem: () => null, setItem: () => undefined };

describe('verified OpenCode Go catalog', () => {
  it('keeps the provider off the untested-beta gate and qualifies only pinged ids', () => {
    expect(isStableProvider('opencode-go')).toBe(true);
    expect(isStableProvider('go')).toBe(true);
    expect(isVerifiedCatalogModel('opencode-go', 'deepseek-v4-flash')).toBe(true);
    expect(isVerifiedCatalogModel('opencode-go', 'glm-5.3-flash')).toBe(false);
    expect(isVerifiedCatalogModel('opencode-go-free', 'cat-jam-free')).toBe(false);
    expect(isProviderModelQualified('opencode-go', 'deepseek-v4-flash', 'profile', 'default', storage)).toBe(true);
    expect(isProviderModelQualified('opencode-go', 'muse-spark-1.3-contributor', 'profile', 'default', storage)).toBe(false);
    expect(isProviderModelQualified('opencode-go-free', 'big-pickle', 'profile', 'default', storage)).toBe(false);
  });

  it('shows verified OpenCode Go models without the beta toggle and keeps failed ids behind it', () => {
    const catalog = [{ providerId: 'opencode-go', models: [{ id: 'space-bunny' }, { id: 'longcat-2.0' }] }];
    const qualified = (providerId: string, modelId: string) =>
      isProviderModelQualified(providerId, modelId, 'profile', 'default', storage);
    expect(filterQualifiedModelGroups(catalog, 'profile', false, qualified)).toEqual([
      { providerId: 'opencode-go', models: [{ id: 'space-bunny' }] },
    ]);
    expect(filterQualifiedModelGroups(catalog, 'profile', true, qualified)).toEqual(catalog);
    expect(isProviderQualifiedByModels('opencode-go', catalog, 'profile', qualified)).toBe(true);
  });
});

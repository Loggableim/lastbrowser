import { afterEach, describe, expect, it } from 'vitest';
import { filterQualifiedModelGroups, isProviderQualifiedByModels, readShowUntestedProviderBetas, setShowUntestedProviderBetas } from '../src/renderer/provider-beta-preferences.js';

describe('provider beta catalog preferences', () => {
  afterEach(() => setShowUntestedProviderBetas(false));

  it('starts with beta access disabled and keeps the switch session-only', () => {
    expect(readShowUntestedProviderBetas()).toBe(false);
    setShowUntestedProviderBetas(true);
    expect(readShowUntestedProviderBetas()).toBe(true);
    setShowUntestedProviderBetas(false);
    expect(readShowUntestedProviderBetas()).toBe(false);
  });

  it('hides unqualified model entries and providers until beta access is enabled', () => {
    const catalog = [
      { providerId: 'tested-provider', models: [{ id: 'tested-model' }, { id: 'catalog-only-model' }] },
      { providerId: 'beta-provider', models: [{ id: 'beta-model' }] },
    ];
    const qualified = (provider: string, model: string, profile: string) =>
      provider === 'tested-provider' && model === 'tested-model' && profile === 'profile-a';
    expect(filterQualifiedModelGroups(catalog, 'profile-a', false, qualified)).toEqual([
      { providerId: 'tested-provider', models: [{ id: 'tested-model' }] },
    ]);
    expect(isProviderQualifiedByModels('beta-provider', catalog, 'profile-a', qualified)).toBe(false);
    expect(filterQualifiedModelGroups(catalog, 'profile-a', true, qualified)).toEqual(catalog);
    expect(isProviderQualifiedByModels('tested-provider', catalog, 'profile-a', qualified)).toBe(true);
  });
});

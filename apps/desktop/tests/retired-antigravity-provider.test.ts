import { describe, expect, it } from 'vitest';
import { cloudProviderOptions, modelsForProvider, normalizeSetupState } from '../src/renderer/setup-state.js';
import { mapScopedModelPickerOptions } from '../src/renderer/model-picker-options.js';
import { resolvePreferredChatModelSelection, resolveCatalogModelSelection } from '../src/renderer/provider-model-selection.js';

describe('retired provider in legacy profile', () => {
  const status: any = { setup: { current: { provider: 'antigravity', model: 'legacy-model' }, providers: [
    { id: 'antigravity', label: 'Antigravity (Google)', models: ['legacy-model'] },
    { id: 'agy', label: 'Antigravity', models: ['legacy-model'] },
    { id: 'custom:antigravity-google', label: 'Antigravity (Google)', models: ['legacy-model'] },
    { id: 'openai', label: 'OpenAI', models: ['gpt-5.5'] }
  ] } };
  it('never offers the removed provider from stored settings or fallback catalog', () => {
    expect(cloudProviderOptions(status).map(p => p.id)).not.toContain('antigravity');
    expect(cloudProviderOptions(status).map(p => p.id)).not.toContain('agy');
    expect(cloudProviderOptions(status).map(p => p.id)).not.toContain('custom:antigravity-google');
    expect(cloudProviderOptions(null).map(p => p.id)).not.toContain('antigravity');
    expect(cloudProviderOptions(status).map(p => p.id)).toContain('openai');
    expect(modelsForProvider(status, 'antigravity')).toEqual([]);
    expect(modelsForProvider(status, 'custom:antigravity-google')).toEqual([]);
    expect(normalizeSetupState({ provider: 'antigravity', model: 'legacy-model', cloudSetupComplete: true })).toMatchObject({ provider: '', model: '' });
  });
  it('filters a stale ready catalog as well as unavailable catalogs', () => {
    const catalog: any = { scope: { backendProfileId: 'p', spaceId: 's', browserProfileId: 'b' }, revision: 1, catalog_status: { antigravity: 'ready' }, groups: [
      { provider_id: 'antigravity', provider: 'Antigravity', configured: true, models: [{ id: 'legacy-model', label: 'Legacy' }] },
      { provider_id: 'custom:antigravity-google', provider: 'Antigravity (Google)', configured: true, models: [{ id: 'legacy-model', label: 'Legacy' }] },
      { provider_id: 'openai', provider: 'OpenAI', configured: true, models: [{ id: 'gpt-5.5', label: 'GPT' }] }
    ] };
    expect(mapScopedModelPickerOptions(catalog).map(g => g.providerId)).toEqual(['openai']);
    expect(resolveCatalogModelSelection('@custom:antigravity-google:legacy-model', [])).toEqual({ model: '' });
    expect(resolvePreferredChatModelSelection({ selectedModel: '@custom:antigravity-google:legacy-model',
      setupProvider: 'openai', setupModel: 'gpt-5.5' })).toEqual({ provider: 'openai', model: 'gpt-5.5' });
    expect(resolveCatalogModelSelection('@antigravity:legacy-model', [])).toEqual({ model: '' });
    expect(resolvePreferredChatModelSelection({ spaceSelection: { provider: 'antigravity', model: 'legacy-model' },
      setupProvider: 'openai', setupModel: 'gpt-5.5' })).toEqual({ provider: 'openai', model: 'gpt-5.5' });
  });
});

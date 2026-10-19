import { describe, expect, it } from 'vitest';
import {
  modelGroupKey,
  modelOptionKey,
  parseModelCatalogGroups,
} from '../src/renderer/model-catalog.js';
import {
  qualifyModelForProvider,
  resolveCatalogModelSelection,
} from '../src/renderer/provider-model-selection.js';

const catalogPayload = [
  {
    id: 'opencode-go',
    provider: 'OpenCode Go',
    provider_id: 'opencode-go',
    models: [{ id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }],
  },
  {
    id: 'opencode-go-free',
    provider: 'OpenCode Go Free',
    provider_id: 'opencode-go',
    models: [
      { id: 'beam-free', label: 'Beam Free' },
      { id: 'longcat-2.5-preview-free', label: 'LongCat 2.5 Preview Free' },
    ],
  },
];

describe('chat model picker groups (Go / Go Free)', () => {
  it('parses the catalog into two groups that share provider_id but keep distinct group ids', () => {
    const groups = parseModelCatalogGroups(catalogPayload);

    expect(groups.map((group) => group.id)).toEqual(['opencode-go', 'opencode-go-free']);
    expect(groups.map((group) => group.providerId)).toEqual(['opencode-go', 'opencode-go']);
    expect(groups.map((group) => group.provider)).toEqual(['OpenCode Go', 'OpenCode Go Free']);
    expect(groups[1].models.map((model) => model.id)).toEqual([
      'beam-free',
      'longcat-2.5-preview-free',
    ]);
  });

  it('keys optgroups by the group id and options uniquely inside each group', () => {
    const [paid, free] = parseModelCatalogGroups(catalogPayload);

    expect(modelGroupKey(paid)).toBe('opencode-go');
    expect(modelGroupKey(free)).toBe('opencode-go-free');
    expect(modelOptionKey(paid, 'shared-free')).not.toBe(modelOptionKey(free, 'shared-free'));
  });

  it('falls back from group id to provider id to provider label for keys', () => {
    expect(modelGroupKey({ id: 'group-id', providerId: 'provider-id', provider: 'Label' })).toBe('group-id');
    expect(modelGroupKey({ providerId: 'provider-id', provider: 'Label' })).toBe('provider-id');
    expect(modelGroupKey({ provider: 'Label' })).toBe('Label');
  });

  it('resolves a free-group selection back to the routing provider id', () => {
    const groups = parseModelCatalogGroups(catalogPayload);
    const free = groups[1];
    const selected = qualifyModelForProvider(free.models[0].id, free.providerId);

    expect(selected).toBe('@opencode-go:beam-free');
    expect(resolveCatalogModelSelection(selected, groups)).toEqual({
      provider: 'opencode-go',
      model: 'beam-free',
    });
  });

  it('drops empty groups and model rows without an id', () => {
    const groups = parseModelCatalogGroups([
      { provider_id: 'openrouter', models: [] },
      { provider_id: 'empty-models' },
      {
        provider_id: 'opencode',
        models: [{ id: 'space-bunny-free', name: 'Space Bunny' }, {}],
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].providerId).toBe('opencode');
    expect(groups[0].id).toBe('opencode');
    expect(groups[0].models).toEqual([
      { id: 'space-bunny-free', label: 'Space Bunny', reasoningEfforts: [] },
    ]);
  });

  it('normalizes reasoning effort metadata from the catalog payload', () => {
    const [group] = parseModelCatalogGroups([{
      provider_id: 'opencode',
      models: [{ id: 'deepseek-v4.1-flash-free', reasoning_efforts: ['HIGH', 'nope'] }],
    }]);

    expect(group.models[0].reasoningEfforts).toEqual(['high']);
  });
});

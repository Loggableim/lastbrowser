import { describe, expect, it } from 'vitest';
import { chooseQuickchatModel } from '../src/renderer/quickchat-automatic.js';
import type { ScopedModelSelection } from '../src/renderer/independent-contracts.js';

const scope = { browserProfileId: 'browser', backendProfileName: 'default', workspacePath: 'C:/space' };
const nativeScope = { browserProfileId: 'browser', backendProfileId: 'backend', spaceId: 'space' };
const storage = { getItem: () => null } as unknown as Storage;
function selection(provider: string, models: string[]): ScopedModelSelection {
  return { schemaVersion: 1, scope: nativeScope, revision: 1, model: models[0], provider,
    configured: true, supportsIndependent: true,
    groups: [{ provider, provider_id: provider, configured: true, models: models.map(id => ({
      id, label: id, supportsIndependent: true, nativeAvailability: {
        schemaVersion: 1, supported: true, available: true, reasonCode: null,
        provider, model: id, scope: nativeScope, selectionRevision: 1
      }
    })) }] };
}

describe('direct Quickchat automatic model selection', () => {
  it('requires the beta switch for Groq even if a catalog claims a local deployment', () => {
    const catalog = selection('groq', ['fixture-model']);
    const local: ScopedModelSelection = { ...catalog, groups: [{ ...catalog.groups[0], deployment: 'local' }] };
    const favorite = { provider: 'groq', model: 'fixture-model' };
    expect(chooseQuickchatModel(local, scope, favorite, storage, false)).toBeNull();
    expect(chooseQuickchatModel(local, scope, favorite, storage, true)).toEqual({ ...favorite, basis: 'favorite' });
  });
  it('does not choose an unconfigured provider when no model is selected', () => {
    const unconfigured = selection('openrouter', ['openrouter/free']);
    const catalog: ScopedModelSelection = { ...unconfigured, model: '', provider: '', configured: false,
      groups: unconfigured.groups?.map(group => ({ ...group, configured: false })) };
    expect(chooseQuickchatModel(catalog, scope, null, storage, true)).toBeNull();
  });
  it.each(['xiaomi', 'mimo'])('prefers the requested MiMo Flash under catalog provider %s', provider => {
    const catalog = selection(provider, ['mimo-instant', 'mimo-v2.6-flash']);
    expect(chooseQuickchatModel(catalog, scope, null, storage, true)).toEqual({
      provider, model: 'mimo-v2.6-flash', basis: 'estimated'
    });
  });

  it('honors an explicit favorite before the automatic Flash preference', () => {
    expect(chooseQuickchatModel(selection('xiaomi', ['mimo-instant', 'mimo-v2.6-flash']), scope,
      { provider: 'xiaomi', model: 'mimo-instant' }, storage, true)).toEqual({
      provider: 'xiaomi', model: 'mimo-instant', basis: 'favorite'
    });
  });

  it('does not route an unavailable favorite to a different model', () => {
    expect(chooseQuickchatModel(selection('xiaomi', ['mimo-v2.6-flash']), scope,
      { provider: 'xiaomi', model: 'missing' }, storage, true)).toBeNull();
  });

  it('keeps automatic Quickchat local when the selected local provider has no usable model', () => {
    const local = selection('ollama', ['local-model']);
    const remote = selection('openrouter', ['cloud-model']);
    const catalog: ScopedModelSelection = {
      ...local,
      groups: [{ ...local.groups[0], configured: false }, remote.groups[0]],
    };
    expect(chooseQuickchatModel(catalog, scope, null, storage, true)).toBeNull();
    expect(chooseQuickchatModel(catalog, scope, { provider: 'openrouter', model: 'cloud-model' }, storage, true))
      .toEqual({ provider: 'openrouter', model: 'cloud-model', basis: 'favorite' });
  });

  it('does not treat an Ollama cloud-suffixed model as a local fallback', () => {
    const catalog = selection('ollama', ['gpt-oss:20b-cloud']);
    expect(chooseQuickchatModel(catalog, scope, null, storage, true)).toBeNull();
  });

  it('still selects an available local model in automatic mode', () => {
    expect(chooseQuickchatModel(selection('ollama', ['local-model']), scope, null, storage, true))
      .toEqual({ provider: 'ollama', model: 'local-model', basis: 'estimated' });
  });

  it('does not infer cloud fallback when a custom endpoint has unknown deployment', () => {
    const custom = selection('custom', ['local-model']);
    const cloud = selection('openrouter', ['cloud-model']);
    const catalog: ScopedModelSelection = { ...custom, groups: [{ ...custom.groups[0], configured: false }, cloud.groups[0]] };
    expect(chooseQuickchatModel(catalog, scope, null, storage, true)).toBeNull();
    expect(chooseQuickchatModel(custom, scope, null, storage, true))
      .toEqual({ provider: 'custom', model: 'local-model', basis: 'estimated' });
  });

  it('accepts a verified local Ollama favorite in text-only Quickchat', () => {
    const id = 'smollm2:135m-instruct-q4_0';
    const catalog = selection('custom', [id]);
    const group = catalog.groups[0];
    const entry = group.models[0];
    const favorite = { provider: 'custom', model: id };
    const localCatalog: ScopedModelSelection = {
      ...catalog,
      groups: [{ ...group, deployment: 'local', models: [{
        ...entry, quickchatAvailable: true,
        nativeAvailability: { ...entry.nativeAvailability!, available: false, reasonCode: 'context_missing' },
      }] }],
    };
    expect(chooseQuickchatModel(localCatalog, scope, favorite, storage, false))
      .toEqual({ ...favorite, basis: 'favorite' });
    expect(chooseQuickchatModel({ ...localCatalog, groups: [{ ...localCatalog.groups[0], deployment: 'remote' }] },
      scope, favorite, storage, true)).toBeNull();
  });

  it('keeps an existing automatic choice ahead of the OpenRouter routers', () => {
    const catalog: ScopedModelSelection = {
      schemaVersion: 1, scope: nativeScope, revision: 1, model: 'deepseek-v4.1-flash-free', provider: 'opencode',
      configured: true, supportsIndependent: true,
      groups: [
        selection('opencode', ['deepseek-v4.1-flash-free']).groups[0],
        selection('openrouter', ['openrouter/auto', 'openrouter/free']).groups[0],
      ],
    };
    expect(chooseQuickchatModel(catalog, scope, null, storage, false)).toEqual({
      provider: 'opencode', model: 'deepseek-v4.1-flash-free', basis: 'estimated',
    });
    const withFlash: ScopedModelSelection = {
      ...catalog,
      groups: [selection('xiaomi', ['mimo-v2.6-flash']).groups[0], ...catalog.groups],
    };
    expect(chooseQuickchatModel(withFlash, scope, null, storage, true)).toEqual({
      provider: 'xiaomi', model: 'mimo-v2.6-flash', basis: 'estimated',
    });
    const routersOnly = selection('openrouter', ['openrouter/auto', 'openrouter/free']);
    expect(chooseQuickchatModel(routersOnly, scope, null, storage, false)).toEqual({
      provider: 'openrouter', model: 'openrouter/free', basis: 'estimated',
    });
    expect(chooseQuickchatModel(routersOnly, scope, { provider: 'openrouter', model: 'openrouter/auto' }, storage, false)).toEqual({
      provider: 'openrouter', model: 'openrouter/auto', basis: 'favorite',
    });
  });
});

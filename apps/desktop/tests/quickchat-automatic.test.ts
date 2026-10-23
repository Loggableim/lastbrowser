import { describe, expect, it } from 'vitest';
import { chooseQuickchatModel, supportsDirectQuickchatModel } from '../src/renderer/quickchat-automatic.js';
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

  it('does not auto-select OpenCode Go Gemini models that require the unsupported Google GenAI protocol', () => {
    const catalog: ScopedModelSelection = {
      ...selection('opencode-go', ['gemini-4-argon-contributor', 'deepseek-v4.1-flash']),
      quickchatLatency: { schemaVersion: 1, models: [
        { provider: 'opencode-go', model: 'gemini-4-argon-contributor', samples: 5,
          median_ttft_ms: 1, median_provider_ttft_ms: 1, median_preflight_ms: 0, median_total_ms: 1,
          last_measured_at: Date.now() / 1000 },
      ] },
    };
    expect(supportsDirectQuickchatModel('opencode-go', 'gemini-4-argon-contributor')).toBe(false);
    expect(supportsDirectQuickchatModel('opencode-go', 'deepseek-v4.1-flash')).toBe(true);
    expect(supportsDirectQuickchatModel('openai', 'gemini-4-argon-contributor')).toBe(true);
    expect(chooseQuickchatModel(catalog, scope, null, storage, true)).toEqual({
      provider: 'opencode-go', model: 'deepseek-v4.1-flash', basis: 'estimated',
    });
    expect(chooseQuickchatModel(catalog, scope, { provider: 'opencode-go', model: 'gemini-4-argon-contributor' }, storage, true)).toBeNull();
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

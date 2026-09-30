import { describe, expect, it } from 'vitest';
import { resolveConfiguredModel, resolveConfiguredModelSelection } from '../src/renderer/bridge.js';

function bridge(payload: unknown) {
  return async () => payload;
}

describe('resolveConfiguredModel', () => {
  it('prefers the configured default model', async () => {
    const model = await resolveConfiguredModel(
      bridge({
        default_model: 'inclusionai/ling-3.0-flash-vl:free',
        groups: [{ provider: 'OpenRouter', models: [{ id: 'other/model' }] }]
      })
    );
    expect(model).toBe('inclusionai/ling-3.0-flash-vl:free');
  });

  it('falls back to the first model of the first provider', async () => {
    const model = await resolveConfiguredModel(
      bridge({
        default_model: null,
        groups: [
          { provider: 'OpenRouter', models: [{ id: 'first/model' }, { id: 'second/model' }] }
        ]
      })
    );
    expect(model).toBe('first/model');
  });

  it('uses the active provider group instead of an earlier unrelated provider', async () => {
    const model = await resolveConfiguredModel(
      bridge({
        active_provider: 'ollama-cloud',
        groups: [
          { provider: 'OpenRouter', provider_id: 'openrouter', models: [{ id: 'openrouter/free-model' }] },
          { provider: 'Ollama Cloud', provider_id: 'ollama-cloud', models: [{ id: 'deepseek-v4.1-flash' }] }
        ]
      })
    );
    expect(model).toBe('deepseek-v4.1-flash');
  });

  it('returns no model when the active provider has no matching model group', async () => {
    const model = await resolveConfiguredModel(
      bridge({
        active_provider: 'ollama-cloud',
        groups: [{ provider: 'OpenRouter', provider_id: 'openrouter', models: [{ id: 'openrouter/free-model' }] }]
      })
    );
    expect(model).toBe('');
  });

  it('skips providers without usable models', async () => {
    const model = await resolveConfiguredModel(
      bridge({
        groups: [
          { provider: 'Empty', models: [] },
          { provider: 'OpenRouter', models: [{ id: 'usable/model' }] }
        ]
      })
    );
    expect(model).toBe('usable/model');
  });

  it('ignores blank model ids', async () => {
    const model = await resolveConfiguredModel(
      bridge({ groups: [{ models: [{ id: '   ' }, { id: 'real/model' }] }] })
    );
    expect(model).toBe('real/model');
  });

  it('returns an empty string when nothing is configured', async () => {
    expect(await resolveConfiguredModel(bridge({ groups: [] }))).toBe('');
  });

  it('returns an empty string when the bridge throws', async () => {
    const failing = async () => {
      throw new Error('sidecar down');
    };
    expect(await resolveConfiguredModel(failing)).toBe('');
  });

  it('tolerates a malformed payload', async () => {
    expect(await resolveConfiguredModel(bridge(null))).toBe('');
    expect(await resolveConfiguredModel(bridge({ groups: 'nope' }))).toBe('');
  });

  it('trims the configured default', async () => {
    expect(await resolveConfiguredModel(bridge({ default_model: '  spaced/model  ' }))).toBe('spaced/model');
  });

  it('returns the provider-qualified configured default for chat requests', async () => {
    const selection = await resolveConfiguredModelSelection(bridge({
      default_model: '@ollama-cloud:deepseek-v4.1-flash',
      groups: [{ provider: 'Ollama Cloud', provider_id: 'ollama-cloud', models: [{ id: 'deepseek-v4.1-flash' }] }]
    }));
    expect(selection).toEqual({ model: 'deepseek-v4.1-flash', provider: 'ollama-cloud' });
  });

  it('resolves the provider from the group when the configured model is unqualified', async () => {
    const selection = await resolveConfiguredModelSelection(bridge({
      default_model: 'deepseek-v4.1-flash',
      active_provider: 'openrouter',
      groups: [
        { provider: 'Ollama Cloud', provider_id: 'ollama-cloud', models: [{ id: 'deepseek-v4.1-flash' }] },
        { provider: 'OpenRouter', provider_id: 'openrouter', models: [{ id: 'another/model' }] }
      ]
    }));
    expect(selection).toEqual({ model: 'deepseek-v4.1-flash', provider: 'ollama-cloud' });
  });

  it('returns active provider and model together when no default is configured', async () => {
    const selection = await resolveConfiguredModelSelection(bridge({
      active_provider: 'ollama-cloud',
      groups: [
        { provider: 'OpenRouter', provider_id: 'openrouter', models: [{ id: 'other/model' }] },
        { provider: 'Ollama Cloud', provider_id: 'ollama-cloud', models: [{ id: 'deepseek-v4.1-flash' }] }
      ]
    }));
    expect(selection).toEqual({ model: 'deepseek-v4.1-flash', provider: 'ollama-cloud' });
  });
});

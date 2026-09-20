import { describe, expect, it } from 'vitest';
import { resolveConfiguredModel } from '../src/renderer/bridge.js';

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
});

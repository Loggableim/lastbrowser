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
});

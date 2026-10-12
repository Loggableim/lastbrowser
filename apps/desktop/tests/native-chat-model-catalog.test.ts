import { describe, expect, it } from 'vitest';
import { requestNativeChatModelCatalog } from '../src/renderer/native-chat-model-catalog.js';

describe('requestNativeChatModelCatalog', () => {
  it('binds model discovery to the active browser profile, Space, and backend profile', async () => {
    const requests: unknown[] = [];
    const result = await requestNativeChatModelCatalog(async request => {
      requests.push(request);
      return { groups: [{ provider_id: 'xiaomi' }] };
    }, {
      browserProfileId: 'work-profile',
      workspacePath: 'C:/Spaces/Existing',
      backendProfileName: 'space_profile'
    });

    expect(result).toEqual({ groups: [{ provider_id: 'xiaomi' }] });
    expect(requests).toEqual([{
      method: 'GET',
      path: '/api/models',
      scopeSelection: {
        browserProfileId: 'work-profile',
        workspacePath: 'C:/Spaces/Existing',
        backendProfileName: 'space_profile'
      }
    }]);
  });

  it('preserves an explicitly selected default Space as a null path', async () => {
    const requests: unknown[] = [];
    await requestNativeChatModelCatalog(async request => {
      requests.push(request);
      return null;
    }, { browserProfileId: 'default', workspacePath: null });

    expect(requests).toEqual([{
      method: 'GET',
      path: '/api/models',
      scopeSelection: { browserProfileId: 'default', workspacePath: null }
    }]);
  });
});

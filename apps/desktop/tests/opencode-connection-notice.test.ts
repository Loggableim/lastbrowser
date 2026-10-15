import { describe, expect, it } from 'vitest';
import { classifyConnectionNotice, connectionNoticeCopy } from '../src/renderer/connection-notice.js';
import { quickChatModelGateReason } from '../src/renderer/quick-chat-model-gate.js';

describe('OpenCode connection notices', () => {
  it('says OpenCode is unreachable instead of a raw timeout', () => {
    expect(classifyConnectionNotice({ error: new Error('Sidekick API request timed out after 30000 ms.') })).toBe('opencode-unreachable');
    expect(connectionNoticeCopy.en['opencode-unreachable']).toContain('OpenCode is not reachable');
    expect(connectionNoticeCopy.de['opencode-unreachable']).toContain('OpenCode ist nicht erreichbar');
  });

  it('says sign-in expired instead of an empty catalog', () => {
    expect(classifyConnectionNotice({ authStates: ['reauth_required'] })).toBe('sign-in-expired');
    expect(classifyConnectionNotice({ error: 'HTTP 401 unauthorized' })).toBe('sign-in-expired');
    expect(connectionNoticeCopy.en['sign-in-expired']).toContain('Sign-in expired');
  });

  it('keeps the Quickchat gate on the connection cause', () => {
    expect(quickChatModelGateReason({
      selectedModel: 'deepseek-v4.1-flash', activeScopeKey: 'scope', loadedCatalogScopeKey: null,
      failedCatalogScopeKey: null, availableModels: [], connectionNotice: 'opencode-unreachable'
    })).toBe('opencode-unreachable');
  });
});

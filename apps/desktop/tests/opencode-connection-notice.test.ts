import { describe, expect, it } from 'vitest';
import { classifyConnectionNotice, connectionNoticeCopy, resolveCatalogConnectionNotice } from '../src/renderer/connection-notice.js';
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

  it('treats a slow but reachable catalog as no connection notice', () => {
    expect(resolveCatalogConnectionNotice({ error: new Error('Sidekick API request timed out after 30000 ms.') })).toBeNull();
    expect(resolveCatalogConnectionNotice({ error: 'ETIMEDOUT' })).toBeNull();
    expect(resolveCatalogConnectionNotice({})).toBeNull();
  });

  it('still names a genuine transport failure or an expired sign-in for the catalog', () => {
    expect(resolveCatalogConnectionNotice({ error: new Error('connect ECONNREFUSED 127.0.0.1:1') })).toBe('opencode-unreachable');
    expect(resolveCatalogConnectionNotice({ error: new Error('failed to fetch') })).toBe('opencode-unreachable');
    expect(resolveCatalogConnectionNotice({ error: new Error('HTTP 401 unauthorized') })).toBe('sign-in-expired');
    expect(resolveCatalogConnectionNotice({ authStates: ['expired'] })).toBe('sign-in-expired');
    expect(resolveCatalogConnectionNotice({ authStates: ['reauth_required'], error: new Error('timed out') })).toBe('sign-in-expired');
  });

  it('keeps the Quickchat gate on the connection cause', () => {
    expect(quickChatModelGateReason({
      selectedModel: 'deepseek-v4.1-flash', activeScopeKey: 'scope', loadedCatalogScopeKey: null,
      failedCatalogScopeKey: null, availableModels: [], connectionNotice: 'opencode-unreachable'
    })).toBe('opencode-unreachable');
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyConnectionNotice, connectionNoticeCopy } from '../src/renderer/connection-notice.js';
import { quickChatModelGateReason } from '../src/renderer/quick-chat-model-gate.js';

describe('OpenCode connection notices', () => {
  it('says OpenCode is unreachable only for transport-level failures', () => {
    expect(classifyConnectionNotice({ error: new Error('connect ECONNREFUSED 127.0.0.1:4311') })).toBe('opencode-unreachable');
    expect(classifyConnectionNotice({ error: new Error('getaddrinfo ENOTFOUND localhost') })).toBe('opencode-unreachable');
    expect(classifyConnectionNotice({ error: new Error('Failed to fetch') })).toBe('opencode-unreachable');
    expect(connectionNoticeCopy.en['opencode-unreachable']).toContain('OpenCode is not reachable');
    expect(connectionNoticeCopy.de['opencode-unreachable']).toContain('OpenCode ist nicht erreichbar');
  });

  it('does not read a request timeout or an OpenCode URL as an unreachable service', () => {
    // Earlier regex matched "timeout" and "opencode.ai"; a slow catalog request does not show that OpenCode is down.
    expect(classifyConnectionNotice({ error: new Error('Sidekick API request timed out after 30000 ms.') })).toBeNull();
    expect(classifyConnectionNotice({ error: new Error('Request to https://opencode.ai/zen/v1/models returned 500') })).toBeNull();
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

  it('sets the connection notice only from a classified error, never from the loading timer or a catch fallback', () => {
    for (const file of ['src/renderer/panels/NativeChatMain.tsx', 'src/renderer/components/CopilotSplitView.tsx']) {
      const source = readFileSync(path.resolve(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n');
      expect(source).not.toContain("'opencode-unreachable')");
    }
  });
});

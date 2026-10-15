import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyCatalogNotice, classifyConnectionNotice, connectionNoticeCopy } from '../src/renderer/connection-notice.js';
import { quickChatModelGateReason, slowCatalogHint } from '../src/renderer/quick-chat-model-gate.js';

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
    // A timeout is not a connection notice; it maps to the neutral slow-catalog state instead.
    expect(classifyConnectionNotice({ error: new Error('Sidekick API request timed out after 30000 ms.') })).toBeNull();
    expect(classifyCatalogNotice({ error: new Error('Sidekick API request timed out after 30000 ms.') })).toBe('slow-catalog');
    expect(classifyConnectionNotice({ error: new Error('Request to https://opencode.ai/zen/v1/models returned 500') })).toBeNull();
    // After 12 seconds the catalog shows the neutral slow-catalog state, not a connection notice and not null.
    expect(slowCatalogHint({ activeScopeKey: 'scope', loadedCatalogScopeKey: null, failedCatalogScopeKey: null, slowCatalogScopeKey: 'scope' })).toBe('slow-catalog');
    expect(slowCatalogHint({ activeScopeKey: 'scope', loadedCatalogScopeKey: null, failedCatalogScopeKey: null, slowCatalogScopeKey: null })).toBeNull();
  });

  it('hides the slow-catalog hint once the catalog arrives', () => {
    const slow = { activeScopeKey: 'scope', loadedCatalogScopeKey: null, failedCatalogScopeKey: null, slowCatalogScopeKey: 'scope' } as const;
    expect(slowCatalogHint(slow)).toBe('slow-catalog');
    expect(slowCatalogHint({ ...slow, loadedCatalogScopeKey: 'scope' })).toBeNull();
  });

  it('lets a real catalog failure win over the slow-catalog hint', () => {
    expect(slowCatalogHint({ activeScopeKey: 'scope', loadedCatalogScopeKey: null, failedCatalogScopeKey: 'scope', slowCatalogScopeKey: 'scope' })).toBeNull();
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
      // The 12-second deadline shows the neutral slow-catalog hint with the existing retry action.
      expect(source).toContain('CATALOG_VISIBLE_WAIT_MS');
      expect(source).toContain("t('chat.modelCatalogSlow')");
      expect(source).toContain("t('chat.retryModels')");
    }
    const nativeChat = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/NativeChatMain.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(nativeChat).toContain("phase: 'slow'");
    const copilot = readFileSync(path.resolve(process.cwd(), 'src/renderer/components/CopilotSplitView.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(copilot).toContain('slowCatalogHint(');
  });
});

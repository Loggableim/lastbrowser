import { describe, expect, it } from 'vitest';
import { normalizeNativeChatTurnUsage, shouldShowNativeTurnUsage } from '../src/renderer/chat-usage.js';

describe('native chat turn usage', () => {
  it('normalizes token and throughput fields from the Sidekick done event', () => {
    expect(normalizeNativeChatTurnUsage({ input_tokens: 1250, output_tokens: '84', tps: 21.5 })).toEqual({
      inputTokens: 1250,
      outputTokens: 84,
      tokensPerSecond: 21.5
    });
  });

  it('preserves real zero usage while ignoring malformed values', () => {
    expect(normalizeNativeChatTurnUsage({ input_tokens: 0, output_tokens: -1, tps: 'NaN' })).toEqual({
      inputTokens: 0,
      outputTokens: undefined,
      tokensPerSecond: undefined
    });
  });

  it('rejects empty or non-object payloads', () => {
    expect(normalizeNativeChatTurnUsage(null)).toBeNull();
    expect(normalizeNativeChatTurnUsage([])).toBeNull();
    expect(normalizeNativeChatTurnUsage({ duration_seconds: 2 })).toBeNull();
  });

  it('shows only available metrics for the latest assistant response', () => {
    const usage = normalizeNativeChatTurnUsage({ input_tokens: 4, output_tokens: 7 });
    expect(shouldShowNativeTurnUsage({ isLatestAssistant: true, showTokenUsage: true, showTps: false, usage })).toBe(true);
    expect(shouldShowNativeTurnUsage({ isLatestAssistant: true, showTokenUsage: true, showTps: false, usage: normalizeNativeChatTurnUsage({ input_tokens: 4 }) })).toBe(false);
    expect(shouldShowNativeTurnUsage({ isLatestAssistant: true, showTokenUsage: false, showTps: true, usage: null, persistedTps: 18 })).toBe(true);
    expect(shouldShowNativeTurnUsage({ isLatestAssistant: false, showTokenUsage: true, showTps: true, usage, persistedTps: 18 })).toBe(false);
    expect(shouldShowNativeTurnUsage({ isLatestAssistant: true, showTokenUsage: true, showTps: true, usage: null })).toBe(false);
  });

  it('guarantees BrowserMain in App.tsx declares and receives lastChatTurnUsage to prevent ReferenceError', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf-8');
    expect(appTsx).toContain('lastChatTurnUsage = null');
    expect(appTsx).toContain('lastChatTurnUsage?: { sessionId: string; usage: NativeChatTurnUsage } | null;');
    expect(appTsx).toMatch(/<BrowserMain[\s\S]*?lastChatTurnUsage=\{lastChatTurnUsage\}/);
  });
});

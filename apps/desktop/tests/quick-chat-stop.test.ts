import { describe, expect, it, vi } from 'vitest';
import { resolveQuickChatStopTarget } from '../src/renderer/quick-chat-stop.js';
import { readFileSync } from 'node:fs';

describe('Quickchat early Stop target', () => {
  // Structural integration guard only: the live VM check remains responsible
  // for rendered history and real backend cancellation acknowledgement.
  it('wires App early Stop to the pending turn without resetting identity or transcript', () => {
    const source = readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
    const stop = source.slice(source.indexOf('  async function stopQuickChat()'), source.indexOf('  async function runSidekickAction('));
    expect(stop).toContain('quickChatAwaitingStartRef.current && pendingStart');
    expect(stop).toContain('resolveQuickChatStopTarget(binding, waiting)');
    expect(stop).toContain('window.lastbrowser.quickChat.stop({');
    expect(stop).toContain('quickChatId: binding.quickChatId, streamId: binding.streamId, scope: binding.scope');
    expect(stop).not.toContain('resetQuickChat(');
    expect(stop).not.toContain('setQuickChatId(');
    expect(stop).not.toContain('updateQuickChatMessagesForScope(bindingScopeKey, [])');
    expect(stop).toContain('finishStoppedLiveChatMessage(current)');
  });
  it('waits for the pending follow-up and never stops the preceding stream', async () => {
    let acknowledge!: (value: { streamId: string }) => void;
    const pending = new Promise<{ streamId: string }>(resolve => { acknowledge = resolve; });
    const stop = vi.fn();
    const operation = resolveQuickChatStopTarget({ streamId: 'previous' }, pending).then(stop);
    await Promise.resolve();
    expect(stop).not.toHaveBeenCalled();
    acknowledge({ streamId: 'follow-up' }); await operation;
    expect(stop).toHaveBeenCalledExactlyOnceWith({ streamId: 'follow-up' });
  });
  it('does not fall back to the previous stream when pending start fails', async () => {
    const stop = vi.fn();
    await expect(resolveQuickChatStopTarget({ streamId: 'previous' }, Promise.reject(new Error('start failed'))).then(stop))
      .rejects.toThrow('start failed');
    expect(stop).not.toHaveBeenCalled();
  });
  it('uses the current binding for an already acknowledged response and tolerates no turn', async () => {
    expect(await resolveQuickChatStopTarget({ streamId: 'current' }, null)).toEqual({ streamId: 'current' });
    expect(await resolveQuickChatStopTarget(null, null)).toBeNull();
  });
});

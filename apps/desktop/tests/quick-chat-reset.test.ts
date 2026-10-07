import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  confirmQuickChatReset,
  isCurrentQuickChatGeneration,
  runQuickChatResetOnce
} from '../src/renderer/App.js';
import { isQuickChatScopeVisible, updateScopedQuickChatState } from '../src/renderer/quick-chat-view-state.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

describe('Quickchat UI reset acknowledgement', () => {
  it('retains the old binding and transcript after cancel rejection, then clears only after retry acknowledgement', async () => {
    const binding = { quickChatId: 'a'.repeat(32), streamId: '', scope: { spaceId: 'space-a' } };
    let currentBinding: typeof binding | null = binding;
    let messageCount = 2;
    let quickChatId = binding.quickChatId;
    const failedCancel = vi.fn(async () => { throw new Error('private backend detail'); });
    const commit = () => {
      currentBinding = null;
      messageCount = 0;
      quickChatId = 'b'.repeat(32);
    };
    const rejection = vi.fn();

    await expect(confirmQuickChatReset(binding, failedCancel, commit, rejection)).resolves.toBe(false);
    expect(currentBinding).toBe(binding);
    expect(messageCount).toBe(2);
    expect(quickChatId).toBe(binding.quickChatId);
    expect(rejection).toHaveBeenCalledOnce();

    await expect(confirmQuickChatReset(binding, async () => ({ ok: true }), commit, rejection)).resolves.toBe(true);
    expect(currentBinding).toBeNull();
    expect(messageCount).toBe(0);
    expect(quickChatId).toBe('b'.repeat(32));
  });

  it('does not commit when the cancel response is not an explicit acknowledgement', async () => {
    const binding = { quickChatId: 'c'.repeat(32) };
    const commit = vi.fn();
    const reject = vi.fn();

    await expect(confirmQuickChatReset(binding, async () => ({ ok: false }), commit, reject)).resolves.toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledOnce();
  });

  it('coalesces repeated New Chat clicks into one cleanup request and permits retry after failure', async () => {
    const pending = { current: null as Promise<boolean> | null };
    const gate = deferred<boolean>();
    const run = vi.fn(() => gate.promise);
    const first = runQuickChatResetOnce(pending, run);
    const second = runQuickChatResetOnce(pending, run);

    expect(second).toBe(first);
    await Promise.resolve();
    expect(run).toHaveBeenCalledOnce();
    gate.resolve(false);
    await expect(first).resolves.toBe(false);
    expect(pending.current).toBeNull();

    const retry = runQuickChatResetOnce(pending, async () => true);
    await expect(retry).resolves.toBe(true);
  });

  it('rejects late events from a prior Quickchat generation', () => {
    expect(isCurrentQuickChatGeneration(9, 9)).toBe(true);
    expect(isCurrentQuickChatGeneration(10, 9)).toBe(false);
  });

  it('keeps A content and binding on denied cleanup, isolates B, and applies a delayed A ACK only to A', async () => {
    const scopeA = 'profile::space-a::backend-a';
    const scopeB = 'profile::space-b::backend-b';
    const transcripts = new Map<string, string[]>([[scopeA, ['A user text', 'A assistant token']], [scopeB, []]]);
    const statuses = new Map<string, string>();
    const binding = { quickChatId: 'a'.repeat(32), streamId: 'stream-a', scope: { spaceId: 'space-a' } };
    let retainedBinding: typeof binding | null = binding;

    await expect(confirmQuickChatReset(binding, async () => ({ ok: false }), () => {
      retainedBinding = null;
      transcripts.set(scopeA, []);
    }, () => {})).resolves.toBe(false);
    expect(transcripts.get(scopeA)).toEqual(['A user text', 'A assistant token']);
    expect(retainedBinding).toBe(binding);
    expect(statuses.has(scopeA)).toBe(false);
    expect(isQuickChatScopeVisible(scopeA, scopeB)).toBe(false);
    expect(isQuickChatScopeVisible(scopeA, scopeA)).toBe(true);

    let resolveCancel!: (value: { ok: true }) => void;
    const delayedAck = new Promise<{ ok: true }>(resolve => { resolveCancel = resolve; });
    let bVisibleErrorScope: string | null = scopeA;
    const pending = confirmQuickChatReset(binding, async () => delayedAck, () => {
      retainedBinding = null;
      updateScopedQuickChatState(transcripts, scopeA, current => (current ?? []).concat('A cleanup complete'));
      statuses.set(scopeA, 'Quickchat was safely reset.');
    }, () => {});
    updateScopedQuickChatState(transcripts, scopeB, current => (current ?? []).concat('B transcript'));
    expect(statuses.has(scopeA)).toBe(false);
    expect(isQuickChatScopeVisible(bVisibleErrorScope, scopeB)).toBe(false);
    resolveCancel({ ok: true });
    await expect(pending).resolves.toBe(true);
    bVisibleErrorScope = scopeB;
    expect(transcripts.get(scopeA)).toEqual(['A user text', 'A assistant token', 'A cleanup complete']);
    expect(transcripts.get(scopeB)).toEqual(['B transcript']);
    expect(statuses.get(scopeA)).toBe('Quickchat was safely reset.');
    expect(isQuickChatScopeVisible(bVisibleErrorScope, scopeB)).toBe(true);
  });

  it('wires scoped transcript snapshots and cleanup status into the App reset path', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(source).toContain('quickChatMessagesByScopeRef.current.get(nextKey) ?? []');
    expect(source).toContain('resetQuickChat(false);');
    expect(source).toContain('updateQuickChatMessagesForScope(resetScopeKey, []);');
    expect(source).toContain('if (binding) {\n              quickChatStatusesByScopeRef.current.set(resetScopeKey, quickChatResetSuccessCopy[locale]);');
  });
});

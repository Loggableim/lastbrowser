import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { QuickChatController } from '../src/main/quick-chat-controller.js';
import type { ChatStreamEvent, ChatStreamHandle } from '../src/main/chat-stream.js';
import { IndependentAssistantController } from '../src/renderer/independent-assistant-controller.js';
import { createSpaceAssistantStore } from '../src/renderer/stores/useSpaceAssistantStore.js';
import { assistantScopeKey, type IndependentScope } from '../src/renderer/independent-contracts.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SpaceAssistantPanel } from '../src/renderer/components/SpaceAssistantPanel.js';
import { CopilotSplitView } from '../src/renderer/components/CopilotSplitView.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import {
  createQuickChatScopeKey,
  isQuickChatScopeVisible,
  selectScopedQuickChatValue,
  toggleQuickChatFromToolbar,
  updateScopedQuickChatState
} from '../src/renderer/quick-chat-view-state.js';

vi.mock('../src/main/ipc-sender.js', () => ({
  captureTrustedShellSender: vi.fn((event: any) => () => {
    if (!event.sender || event.sender.isDestroyed()) throw new Error('Untrusted IPC sender');
    return event.sender;
  })
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

describe('Assistant and Quickchat identity boundary', () => {
  it('resetting a delayed Quickchat response drops only its late tokens while Assistant work completes', async () => {
    const scope: IndependentScope = { backendProfileId: randomUUID(), spaceId: randomUUID(), browserProfileId: 'default' };
    const owner = { id: 2, sent: [] as unknown[], isDestroyed: () => false,
      send(_channel: string, payload: unknown) { this.sent.push(payload); },
      once() {}, removeListener() {} };
    let emitQuickchat: ((event: ChatStreamEvent) => void) | undefined;
    const assistantReply = deferred<any>();
    const assistantSnapshot = { schemaVersion: 1, scope, conversationId: randomUUID(), revision: 1, messages: [],
      interview: null, confirmedProfile: null, providerReady: true, provider: 'fixture', model: 'fixture',
      activity: { schemaVersion: 1, scope, observedAt: '2026-10-05T00:00:00Z', watermark: 0, sourceState: 'live',
        lastSuccessfulAt: null, runs: [], dispatches: [], activeChats: [], schedules: [], approvals: [] } };
    const assistantStore = createSpaceAssistantStore();
    const assistant = new IndependentAssistantController({ request: vi.fn(async (request: any) => {
      if (request.operation === 'assistantSnapshot') return { ok: true, value: assistantSnapshot };
      if (request.operation === 'assistantTurn') return assistantReply.promise;
      throw new Error(`Unexpected operation ${request.operation}`);
    }) as any }, assistantStore);
    await assistant.load(scope);
    const markup = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(SpaceAssistantPanel, {
      selection: { schemaVersion: 1, scope, spaceName: 'Controlled app workspace', workspacePath: 'C:\\work', bindingRevision: 1, setupStatus: 'legacy' },
      controller: assistant, onClose: () => {}, onOpenWorkChat: () => {}, onOpenGlobalOverview: () => {}, onEnterSpace: () => {}, onOpenProviderSettings: () => {}
    })));
    expect(markup).toContain('space-assistant-space-name');
    expect(markup).not.toContain('space-assistant-model');
    const assistantTurn = assistant.send(scope, 'What is happening?');

    const quickchat = new QuickChatController({
      isShell: () => true,
      resolveBinding: async () => ({ scope, backendProfileName: 'default' }),
      start: async request => ({ quickChatId: request.quickChatId, sessionId: request.quickChatId,
        streamId: 'b'.repeat(32), scope }),
      stop: async () => ({ cancelled: true }),
      cancel: async () => ({ ok: true, cancelled: true }),
      subscribe: vi.fn((_id, _binding, callback) => {
        emitQuickchat = callback;
        return { close: vi.fn(), done: new Promise<void>(() => {}) } as ChatStreamHandle;
      })
    });
    const event = { sender: owner, senderFrame: {} } as any;
    const quickChatId = 'a'.repeat(32);
    await quickchat.start(event, { quickChatId, browserProfileId: 'default', workspacePath: 'C:\\work',
      backendProfileName: 'default', prompt: 'Summarize this page', context: { pageText: 'bounded fixture content' } });

    await quickchat.cancel(event, { quickChatId, streamId: 'b'.repeat(32), scope });
    emitQuickchat?.({ event: 'delta', data: { delta: 'late quickchat token' }, raw: '' });
    expect(owner.sent).toEqual([]);

    assistantReply.resolve({ ok: true, value: { ...assistantSnapshot, revision: 2,
      messages: [{ id: randomUUID(), role: 'assistant', content: 'The work chat is still running.', at: '2026-10-05T00:00:01Z' }] } });
    const result = await assistantTurn;
    expect(result.ok).toBe(true);
    expect(assistantStore.getState().entries[assistantScopeKey(scope)]?.snapshot?.messages)
      .toEqual([{ id: expect.any(String), role: 'assistant', content: 'The work chat is still running.', at: '2026-10-05T00:00:01Z' }]);
    assistant.dispose();
    await quickchat.close();
  });

  it('renders Quickchat without the Space Assistant switch, including when the legacy switch callback is supplied', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {} } });
    let markup = '';
    try {
      markup = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(CopilotSplitView, {
        isOpen: true,
        onClose: () => {},
        botName: 'Nova',
        modelName: 'Controlled model',
        messages: [{ role: 'user', content: 'Keep this Quickchat message' }],
        busy: false,
        allowWorkflows: false,
        onSwitchToSpaceAssistant: () => {},
        onSendMessage: () => {},
        browserProfileId: 'profile-a',
        workspacePath: 'C:\\work\\space-a',
        backendProfileName: 'default'
      } as any)));
    } finally {
      vi.unstubAllGlobals();
    }

    expect(markup).toContain('Keep this Quickchat message');
    expect(markup).not.toContain('Space Assistant');
    expect(markup).not.toContain('copilot-mode-switch');
  });

  it('keeps Quickchat history visible only in the matching profile, space, and backend scope', () => {
    const scopeA = createQuickChatScopeKey('profile-a', 'C:\\work\\space-a', 'backend-a');
    const scopeB = createQuickChatScopeKey('profile-a', 'C:\\work\\space-b', 'backend-a');
    const scopeOtherProfile = createQuickChatScopeKey('profile-b', 'C:\\work\\space-a', 'backend-a');
    const transcripts = new Map<string, string[]>();
    updateScopedQuickChatState(transcripts, scopeA, () => ['A user message', 'A assistant reply']);
    updateScopedQuickChatState(transcripts, scopeB, () => ['B user message', 'B assistant reply']);

    expect(isQuickChatScopeVisible(scopeA, scopeA)).toBe(true);
    expect(isQuickChatScopeVisible(scopeA, scopeB)).toBe(false);
    expect(isQuickChatScopeVisible(scopeA, scopeOtherProfile)).toBe(false);
    expect(transcripts.get(scopeA)).toEqual(['A user message', 'A assistant reply']);
    expect(transcripts.get(scopeB)).toEqual(['B user message', 'B assistant reply']);
    expect(isQuickChatScopeVisible(null, scopeA)).toBe(false);
    expect(selectScopedQuickChatValue(transcripts.get(scopeA), scopeA, scopeA, [])).toEqual(transcripts.get(scopeA));
    expect(selectScopedQuickChatValue(transcripts.get(scopeA), scopeA, scopeB, [])).toEqual([]);
  });

  it('opens Quickchat from the toolbar despite a legacy Assistant panel and preserves the normal close toggle', () => {
    const setQuickChatMode = vi.fn();
    const toggleCopilot = vi.fn();

    toggleQuickChatFromToolbar({ copilotOpen: true, quickChatMode: false, setQuickChatMode, toggleCopilot });
    expect(setQuickChatMode).toHaveBeenCalledExactlyOnceWith(true);
    expect(toggleCopilot).not.toHaveBeenCalled();

    toggleQuickChatFromToolbar({ copilotOpen: false, quickChatMode: false, setQuickChatMode, toggleCopilot });
    expect(toggleCopilot).toHaveBeenCalledTimes(1);

    toggleQuickChatFromToolbar({ copilotOpen: true, quickChatMode: true, setQuickChatMode, toggleCopilot });
    expect(toggleCopilot).toHaveBeenCalledTimes(2);
  });

  it('wires the real topbar Copilot button through the Quickchat toolbar handler', async () => {
    const source = await import('node:fs/promises');
    const appSource = await source.readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
    expect(appSource).toContain('onToggleCopilot={handleQuickChatToolbarToggle}');
    expect(appSource).toMatch(/const handleQuickChatToolbarToggle = \(\): void => \{\s*setQuickChatMode\(true\);\s*toggleCopilot\(\);\s*\}/);
  });

  it('keeps the Quickchat binding until acknowledged cleanup and prevents cross-scope transcript reuse', async () => {
    const source = await import('node:fs/promises');
    const appSource = await source.readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
    expect(appSource).toContain('return runQuickChatResetOnce(quickChatResetPromiseRef, async () =>');
    expect(appSource).toContain('return await confirmQuickChatReset(');
    expect(appSource).toContain('onNewChat={() => resetQuickChat(true)}');
    expect(appSource).toContain('quickChatResetFailureCopy[locale]');
    expect(appSource).toContain('quickChatBindingScopeKeyRef.current !== activeScopeKey');
    expect(appSource).toContain('quickChatTranscriptScopeKeyRef.current !== activeScopeKey');
  });
});

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
import { DesktopI18nProvider } from '../src/renderer/i18n.js';

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
      cancel: async () => ({ cancelled: true }),
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

  it('keeps the in-flight scoped Assistant turn intact when the panel mode is toggled', async () => {
    const source = await import('node:fs/promises');
    const appSource = await source.readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
    expect(appSource).toContain('onSwitchToSpaceAssistant={() => setQuickChatMode(false)}');
    expect(appSource).toContain('onSwitchToQuickChat={() => setQuickChatMode(true)}');
    const quickchatMessages = appSource.match(/const \[quickChatMessages, setQuickChatMessages\] = useState<DesktopChatMessage\[]>\(\[\]\)/);
    expect(quickchatMessages).not.toBeNull();
    expect(appSource).toContain('messages={quickChatMessages}');
    expect(appSource).toContain('busy={quickChatBusy}');
    expect(appSource).toContain('const [assistantController] = useState(() => new IndependentAssistantController(');
    expect(appSource).toContain('controller={assistantController}');
    expect(appSource).not.toMatch(/onSwitchTo(?:SpaceAssistant|QuickChat)=\{[^\n]*(?:resetQuickChat|assistantController\.(?:reset|send)|createSession)/);
  });
});

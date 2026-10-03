import type { DesktopChatMessage } from './shell-state.js';
import { applyLiveChatDelta, applyLiveChatProgress, finishLiveChatMessage, finishLiveChatMessageWithError, readLiveChatDelta, readNativeChatStreamError } from './chat-live-stream.js';
import { isChatCompletionConfirmed } from './chat-completion.js';
import { isNativeChatProgressEvent, isNativeChatStreamWaitExpired } from './chat-stream-timeout.js';
import { describeOrchestrationProgress } from './orchestration-progress.js';

type QuickChatClient = Pick<Window['lastbrowser']['sidekick'], 'startChat' | 'getSession' | 'onChatStreamEvent' | 'subscribeChatStream' | 'unsubscribeChatStream' | 'getStreamStatus' | 'cancelStream'>;
export type QuickChatScope = { profile: string; workspace: string };
export type QuickChatOptions = { model?: string; modelProvider?: string; reasoningEffort?: string };
export type QuickChatState = {
  sessionId: string | null;
  messages: DesktopChatMessage[];
  busy: boolean;
  error: string;
  draft: string;
};

/** The browser assistant owns its session. It never reads the full chat selection. */
export class QuickChat {
  private state: QuickChatState = { sessionId: null, messages: [], busy: false, error: '', draft: '' };
  private listeners = new Set<() => void>();
  private generation = 0;
  private streamId: string | null = null;
  private detach: (() => void) | null = null;
  private stopRequested = false;

  constructor(private client: QuickChatClient, private scope: QuickChatScope) {}
  getSnapshot = (): QuickChatState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<QuickChatState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  setDraft = (draft: string): void => { this.update({ draft }); };
  reset = (): void => {
    if (this.state.busy) return;
    this.generation++;
    this.update({ sessionId: null, messages: [], error: '', draft: '' });
  };
  stop = async (): Promise<void> => {
    this.stopRequested = this.state.busy;
    if (!this.streamId) return;
    try {
      await this.client.cancelStream(this.streamId);
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : String(error) });
    }
  };
  dispose = (): void => {
    this.generation++;
    this.detach?.();
    this.detach = null;
    if (this.streamId) void this.client.cancelStream(this.streamId).catch(() => {});
    this.streamId = null;
  };

  send = async (message: string, options: QuickChatOptions | (() => Promise<QuickChatOptions>) = {}): Promise<void> => {
    const text = message.trim();
    if (!text || this.state.busy) return;
    const owner = ++this.generation;
    this.stopRequested = false;
    const current = () => this.generation === owner;
    this.update({ busy: true, error: '', draft: '', messages: [
      ...this.state.messages, { role: 'user', content: text }, { role: 'assistant', content: '', pending: true }
    ] });
    let streamId: string | null = null;
    let ended = false;
    let failed = false;
    let cancelled = false;
    const startedAt = Date.now();
    let lastProgressAt = startedAt;
    let lastPollAt = startedAt;
    const earlyEvents: unknown[] = [];
    const handleEvent = (payload: unknown): void => {
      if (!current() || !payload || typeof payload !== 'object') return;
      const event = payload as { streamId?: string; event?: string; data?: unknown };
      if (!streamId) {
        earlyEvents.push(payload);
        if (earlyEvents.length > 1000) earlyEvents.shift();
        return;
      }
      if (event.streamId !== streamId || ended) return;
      if (isNativeChatProgressEvent(event.event)) lastProgressAt = Date.now();
      if (event.event === 'error' || event.event === 'apperror') {
        const error = readNativeChatStreamError(event.data);
        failed = ended = true;
        this.update({ error, messages: finishLiveChatMessageWithError(this.state.messages, error) });
      } else if (event.event === 'stream_end' || event.event === 'cancel') {
        ended = true;
        cancelled = event.event === 'cancel';
        this.update({ messages: finishLiveChatMessage(this.state.messages) });
      } else if (event.event) {
        const delta = readLiveChatDelta(event.event, event.data);
        const progress = describeOrchestrationProgress(event.event, event.data);
        if (delta) this.update({ messages: applyLiveChatDelta(this.state.messages, delta.kind, delta.text) });
        else if (progress) this.update({ messages: applyLiveChatProgress(this.state.messages, progress.message) });
      }
    };
    // Listen before startChat: a fast provider can emit tokens before IPC resolves.
    const detach = this.client.onChatStreamEvent(handleEvent);
    this.detach = detach;
    try {
      const resolvedOptions = typeof options === 'function' ? await options() : options;
      if (!current()) return;
      if (this.stopRequested) return;
      const response = await this.client.startChat({
        sessionId: this.state.sessionId, message: text, ...this.scope, ...resolvedOptions, mode: 'action'
      });
      streamId = response.streamId;
      if (!streamId || !response.sessionId) throw new Error('Sidekick did not return a quick chat session and stream.');
      if (!current()) {
        await this.client.cancelStream(streamId).catch(() => {});
        return;
      }
      this.streamId = streamId;
      this.update({ sessionId: response.sessionId });
      earlyEvents.forEach(handleEvent);
      if (this.stopRequested) await this.client.cancelStream(streamId);
      // Polling below also recovers a failed SSE connection.
      await this.client.subscribeChatStream({ streamId }).catch(() => {});
      while (current() && !ended && !isNativeChatStreamWaitExpired(startedAt, lastProgressAt, Date.now())) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (!current() || ended) break;
        if (Date.now() - lastPollAt < 3000) continue;
        lastPollAt = Date.now();
        const [status, result] = await Promise.all([
          this.client.getStreamStatus(streamId).catch(() => null),
          this.client.getSession({ sessionId: response.sessionId, messages: true, msgLimit: 80,
            profile: this.scope.profile, workspacePath: this.scope.workspace }).catch(() => null)
        ]);
        if (!current()) return;
        if (isChatCompletionConfirmed({ streamActive: status?.active, session: result?.session })) {
          ended = true;
          if (result?.session?.messages?.length) this.update({ messages: result.session.messages });
        }
      }
      if (!current()) return;
      if (!ended) {
        await this.client.cancelStream(streamId).catch(() => {});
        throw new Error('Quick chat timed out. Please try again.');
      }
      if (!failed && !cancelled) {
        const result = await this.client.getSession({ sessionId: response.sessionId, messages: true, msgLimit: 80,
          profile: this.scope.profile, workspacePath: this.scope.workspace }).catch(() => null);
        if (current() && result?.session?.messages?.length) this.update({ messages: result.session.messages });
      }
    } catch (error) {
      if (current()) {
        const message = error instanceof Error ? error.message : String(error);
        this.update({ error: message, messages: finishLiveChatMessageWithError(this.state.messages, message) });
      }
    } finally {
      detach();
      if (streamId) void this.client.unsubscribeChatStream({ streamId }).catch(() => {});
      if (current()) {
        this.detach = null;
        this.streamId = null;
        this.update({ busy: false, messages: finishLiveChatMessage(this.state.messages) });
      }
    }
  };
}

import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { captureTrustedShellSender } from './ipc-sender.js';
import type { ChatStreamEvent, ChatStreamHandle } from './chat-stream.js';
import type { BrowserScope } from './independent-browser-host.js';
import { quickChatBackendFailure, quickChatFailure } from './quick-chat-errors.js';

const ID = /^[a-f0-9]{32}$/;
const MAX_PROMPT = 12_000;
const MAX_CONTEXT = 16_000;

export type QuickChatContext = Readonly<{
  pageUrl?: string;
  pageTitle?: string;
  selectedText?: string;
  pageText?: string;
}>;
export type QuickChatStartRequest = Readonly<{
  quickChatId: string;
  browserProfileId: string;
  workspacePath: string | null;
  backendProfileName?: string;
  prompt: string;
  context?: QuickChatContext;
  model?: string;
  modelProvider?: string | null;
}>;
export type QuickChatCancelRequest = Readonly<{
  quickChatId: string;
  streamId: string;
  scope: BrowserScope;
}>;
export type QuickChatStreamEvent = Readonly<{ quickChatId: string; streamId: string; scope: BrowserScope; event: string; data: unknown }>;
type CapturedBinding = Readonly<{ scope: BrowserScope; backendProfileName: string }>;
type StartResult = Readonly<{ quickChatId: string; streamId: string; sessionId: string; scope: BrowserScope }>;
type RecordEntry = { owner: WebContents; check: () => WebContents; scope: BrowserScope; profile: string; workspacePath: string | null;
  sessionId: string; streamId: string; handle: ChatStreamHandle | null; resetting: boolean; lifecycleBusy: boolean };
type SenderEvent = Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function sameScope(left: unknown, right: unknown): left is BrowserScope {
  const a = object(left), b = object(right);
  return Boolean(a && b && ['spaceId', 'backendProfileId', 'browserProfileId'].every(key =>
    typeof a[key] === 'string' && a[key] === b[key]));
}
function boundedContext(value: unknown): QuickChatContext | undefined {
  if (value === undefined) return undefined;
  const record = object(value);
  if (!record || Object.keys(record).some(key => !['pageUrl', 'pageTitle', 'selectedText', 'pageText'].includes(key)))
    throw new Error('Invalid Quickchat page context');
  const context: Record<string, string> = {};
  let total = 0;
  for (const key of ['pageUrl', 'pageTitle', 'selectedText', 'pageText'] as const) {
    const entry = record[key];
    if (entry === undefined) continue;
    if (typeof entry !== 'string') throw new Error('Invalid Quickchat page context');
    const limit = key === 'pageText' ? 12_000 : key === 'selectedText' ? 8_000 : key === 'pageUrl' ? 2_000 : 500;
    const normalized = entry.slice(0, limit);
    total += normalized.length;
    context[key] = normalized;
  }
  if (total > MAX_CONTEXT) throw new Error('Quickchat page context is too large');
  return context;
}
function validateStart(value: unknown): QuickChatStartRequest {
  const request = object(value);
  if (!request || Object.keys(request).some(key => ![
    'quickChatId', 'browserProfileId', 'workspacePath', 'backendProfileName', 'prompt', 'context', 'model', 'modelProvider'
  ].includes(key))) throw new Error('Invalid Quickchat request');
  if (typeof request.quickChatId !== 'string' || !ID.test(request.quickChatId)
    || typeof request.browserProfileId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(request.browserProfileId)
    || !(request.workspacePath === null || typeof request.workspacePath === 'string' && request.workspacePath.length <= 2048)
    || typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > MAX_PROMPT
    || request.backendProfileName !== undefined && (typeof request.backendProfileName !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(request.backendProfileName))
    || request.model !== undefined && (typeof request.model !== 'string' || request.model.length > 160)
    || request.modelProvider !== undefined && request.modelProvider !== null && (typeof request.modelProvider !== 'string' || request.modelProvider.length > 80))
    throw new Error('Invalid Quickchat request');
  return { quickChatId: request.quickChatId, browserProfileId: request.browserProfileId, workspacePath: request.workspacePath as string | null,
    ...(request.backendProfileName ? { backendProfileName: request.backendProfileName as string } : {}), prompt: request.prompt,
    ...(request.context === undefined ? {} : { context: boundedContext(request.context) }),
    ...(typeof request.model === 'string' ? { model: request.model } : {}),
    ...(typeof request.modelProvider === 'string' || request.modelProvider === null ? { modelProvider: request.modelProvider as string | null } : {}) };
}
function sanitizeEventData(value: unknown, depth = 0): unknown {
  if (depth > 5) return undefined;
  if (typeof value === 'string') return value.slice(0, 24_000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 32).map(item => sanitizeEventData(item, depth + 1));
  const record = object(value);
  if (!record) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record).slice(0, 40)) {
    if (/^(session_id|sessionId|stream_id|streamId|quick_chat_id|quickChatId|space_scope|nativeContext|profile|workspace)$/i.test(key)) continue;
    const safe = sanitizeEventData(entry, depth + 1);
    if (safe !== undefined) result[key] = safe;
  }
  return result;
}

export class QuickChatController {
  private readonly chats = new Map<string, RecordEntry>();
  private readonly ownerListeners = new Map<number, { owner: WebContents; listener: () => void }>();
  private closed = false;
  constructor(private readonly options: {
    isShell: (contents: WebContents) => boolean;
    resolveBinding: (browserProfileId: string, workspacePath: string | null, backendProfileName?: string) => Promise<CapturedBinding | null>;
    start: (request: QuickChatStartRequest & { scope: BrowserScope; profile: string }) => Promise<StartResult>;
    stop: (request: QuickChatCancelRequest & { profile: string; workspacePath: string | null }) => Promise<unknown>;
    cancel: (request: QuickChatCancelRequest & { profile: string; workspacePath: string | null }) => Promise<unknown>;
    subscribe: (streamId: string, binding: { profile: string; workspacePath: string | null; scope: BrowserScope }, onEvent: (event: ChatStreamEvent) => void) => ChatStreamHandle;
  }) {}

  async start(event: SenderEvent, raw: unknown): Promise<{ quickChatId: string; streamId: string; scope: BrowserScope }> {
    if (this.closed) throw new Error('Quickchat is closed');
    const check = captureTrustedShellSender(event, this.options.isShell), owner = check();
    const request = validateStart(raw);
    const binding = await this.options.resolveBinding(request.browserProfileId, request.workspacePath, request.backendProfileName);
    check();
    if (!binding) throw new Error('Quickchat requires a saved browser Space binding');
    const prior = this.chats.get(request.quickChatId);
    if (prior && (prior.owner !== owner || !sameScope(prior.scope, binding.scope) || prior.resetting)) throw new Error('Quickchat identity is already bound elsewhere');
    if (prior?.handle) throw new Error('This Quickchat already has an active response');
    const record: RecordEntry = { owner, check, scope: binding.scope, profile: binding.backendProfileName, workspacePath: request.workspacePath,
      sessionId: prior?.sessionId ?? '', streamId: '', handle: null, resetting: false, lifecycleBusy: false };
    this.chats.set(request.quickChatId, record);
    this.observe(owner);
    let started: StartResult | undefined;
    try {
      started = await this.options.start({ ...request, scope: binding.scope, profile: binding.backendProfileName });
      check();
    } catch (error) {
      if (this.chats.get(request.quickChatId) === record) this.chats.delete(request.quickChatId);
      if (started) {
        try { await this.options.cancel({ quickChatId: request.quickChatId, streamId: started.streamId, scope: binding.scope,
          profile: binding.backendProfileName, workspacePath: request.workspacePath }); } catch { /* sender changed after backend start */ }
      }
      throw error;
    }
    if (!started || started.quickChatId !== request.quickChatId || !ID.test(started.streamId) || !ID.test(started.sessionId)
      || !sameScope(started.scope, binding.scope)) {
      if (started && ID.test(started.streamId)) {
        try { await this.options.cancel({ quickChatId: request.quickChatId, streamId: started.streamId, scope: binding.scope,
          profile: binding.backendProfileName, workspacePath: request.workspacePath }); } catch { /* invalid backend response; best-effort private reset */ }
      }
      throw new Error('Quickchat backend returned a mismatched binding');
    }
    record.sessionId = started.sessionId; record.streamId = started.streamId;
    if (this.chats.get(request.quickChatId) !== record || record.resetting) {
      try { await this.options.cancel({ quickChatId: request.quickChatId, streamId: started.streamId, scope: binding.scope,
        profile: binding.backendProfileName, workspacePath: request.workspacePath }); } catch { /* reset raced start; best effort */ }
      throw new Error('Quickchat was reset while its response was starting');
    }
    const handle = this.options.subscribe(started.streamId, { profile: binding.backendProfileName, workspacePath: request.workspacePath, scope: binding.scope }, streamEvent => {
      try { record.check(); } catch { return; }
      if (this.closed || this.chats.get(request.quickChatId) !== record || record.streamId !== started.streamId || record.resetting) return;
      try { owner.send('lastbrowser:quickchat:event', { quickChatId: request.quickChatId, streamId: started.streamId,
        scope: record.scope, event: streamEvent.event, data: sanitizeEventData(streamEvent.data) }); }
      catch { void this.resetOwner(owner); }
    });
    record.handle = handle;
    void handle.done.finally(() => { if (this.chats.get(request.quickChatId) === record) record.handle = null; });
    return { quickChatId: request.quickChatId, streamId: started.streamId, scope: record.scope };
  }

  async cancel(event: SenderEvent, raw: unknown): Promise<{ ok: true; cancelled: boolean }> {
    let check: () => WebContents;
    let owner: WebContents;
    try {
      check = captureTrustedShellSender(event, this.options.isShell);
      owner = check();
    } catch {
      throw quickChatFailure('cancel', 'quickchat_ipc_sender_rejected');
    }
    const request = object(raw);
    if (!request || Object.keys(request).some(key => !['quickChatId', 'streamId', 'scope'].includes(key))
      || typeof request.quickChatId !== 'string' || !ID.test(request.quickChatId)
      || typeof request.streamId !== 'string' || request.streamId !== '' && !ID.test(request.streamId))
      throw quickChatFailure('cancel', 'quickchat_cancel_request_invalid');
    const record = this.chats.get(request.quickChatId);
    if (!record || record.owner !== owner || (record.streamId ? record.streamId !== request.streamId : request.streamId !== '')
      || !sameScope(record.scope, request.scope))
      throw quickChatFailure('cancel', 'quickchat_cancel_binding_rejected');
    if (record.lifecycleBusy) throw quickChatFailure('cancel', 'quickchat_cancel_failed');
    record.lifecycleBusy = true;
    try {
      record.resetting = true;
      try { record.handle?.close(); } catch { throw quickChatFailure('cancel', 'quickchat_cancel_failed'); }
      record.handle = null;
      if (!record.streamId && !record.sessionId) {
        this.chats.delete(request.quickChatId);
        return { ok: true, cancelled: false };
      }
      let result: unknown;
      try {
        result = await this.options.cancel({ quickChatId: request.quickChatId, streamId: request.streamId, scope: record.scope,
          profile: record.profile, workspacePath: record.workspacePath });
      } catch (error) {
        throw quickChatBackendFailure('cancel', error);
      }
      if (object(result)?.ok !== true) throw quickChatFailure('cancel', 'quickchat_cancel_failed');
      try { check(); } catch { throw quickChatFailure('cancel', 'quickchat_ipc_sender_rejected'); }
      if (this.chats.get(request.quickChatId) === record) this.chats.delete(request.quickChatId);
      return { ok: true, cancelled: Boolean(object(result)?.cancelled) };
    } finally {
      record.lifecycleBusy = false;
    }
  }

  async stop(event: SenderEvent, raw: unknown): Promise<{ ok: true; cancelled: boolean }> {
    let check: () => WebContents;
    let owner: WebContents;
    try {
      check = captureTrustedShellSender(event, this.options.isShell);
      owner = check();
    } catch {
      throw quickChatFailure('stop', 'quickchat_ipc_sender_rejected');
    }
    const request = object(raw);
    if (!request || Object.keys(request).some(key => !['quickChatId', 'streamId', 'scope'].includes(key))
      || typeof request.quickChatId !== 'string' || !ID.test(request.quickChatId)
      || typeof request.streamId !== 'string' || !ID.test(request.streamId))
      throw quickChatFailure('stop', 'quickchat_stop_request_invalid');
    const record = this.chats.get(request.quickChatId);
    if (!record || record.owner !== owner || record.streamId !== request.streamId || !sameScope(record.scope, request.scope))
      throw quickChatFailure('stop', 'quickchat_stop_binding_rejected');
    if (record.lifecycleBusy) throw quickChatFailure('stop', 'quickchat_stop_failed');
    record.lifecycleBusy = true;
    try {
      record.resetting = true;
      try { record.handle?.close(); } catch { throw quickChatFailure('stop', 'quickchat_stop_failed'); }
      record.handle = null;
      let result: unknown;
      try {
        result = await this.options.stop({ quickChatId: request.quickChatId, streamId: request.streamId, scope: record.scope,
          profile: record.profile, workspacePath: record.workspacePath });
      } catch (error) {
        throw quickChatBackendFailure('stop', error);
      }
      if (object(result)?.ok !== true) throw quickChatFailure('stop', 'quickchat_stop_failed');
      try { check(); } catch { throw quickChatFailure('stop', 'quickchat_ipc_sender_rejected'); }
      if (this.chats.get(request.quickChatId) === record) {
        record.streamId = '';
        record.resetting = false;
      }
      return { ok: true, cancelled: Boolean(object(result)?.cancelled) };
    } finally {
      record.lifecycleBusy = false;
    }
  }

  private observe(owner: WebContents): void {
    if (this.ownerListeners.has(owner.id)) return;
    const listener = () => { void this.resetOwner(owner); };
    this.ownerListeners.set(owner.id, { owner, listener }); owner.once('destroyed', listener);
  }
  private async resetOwner(owner: WebContents): Promise<void> {
    for (const [id, record] of this.chats) if (record.owner === owner) {
      this.chats.delete(id); record.resetting = true; record.handle?.close(); record.handle = null;
      if (!record.streamId && !record.sessionId) continue;
      try { await this.options.cancel({ quickChatId: id, streamId: record.streamId, scope: record.scope,
        profile: record.profile, workspacePath: record.workspacePath }); } catch { /* renderer teardown is best-effort */ }
    }
    const observed = this.ownerListeners.get(owner.id);
    if (observed) owner.removeListener('destroyed', observed.listener);
    this.ownerListeners.delete(owner.id);
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const { owner } of this.ownerListeners.values()) await this.resetOwner(owner);
  }
}

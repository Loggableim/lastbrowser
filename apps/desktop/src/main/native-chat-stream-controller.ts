import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { performance } from 'node:perf_hooks';
import { captureTrustedShellSender } from './ipc-sender.js';
import { ChatStreamRegistry } from './chat-stream-registry.js';
import type { ChatStreamEvent, ChatStreamHandle } from './chat-stream.js';
import { sameBrowserScope, type BrowserScope } from './independent-browser-host.js';

type SenderEvent = Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>;
export type NativeStreamReadBinding = Readonly<{
  sessionId: string; streamId: string; profile: string; workspacePath: string | null;
  spaceScope?: BrowserScope; nativeChat: boolean; writerGeneration?: string; profileHome?: string;
}>;
export type NativeStreamReadProof = Readonly<{
  schemaVersion: 1; nativeChat: true; scope: BrowserScope; sessionId: string; streamId: string;
  profileName: string; profileHome?: string; writerGeneration: string; processExited: boolean;
}>;
export type NativeStreamEventContext = Readonly<{
  schemaVersion: 1; scope: BrowserScope; sessionId: string; streamId: string; writerGeneration: string;
}>;
export type MainBoundChatRequest = { sessionId?: string | null; profile?: string; workspace?: string | null;
  workspacePath?: string | null; spaceScope?: BrowserScope };
declare const captureBrand: unique symbol;
export type NativeChatStreamCapture = Readonly<{ [captureBrand]: true }>;
type Captured = { check: () => WebContents; owner: WebContents; frame: WebContents['mainFrame']; navigation: number;
  profile: string; workspacePath: string | null; scope?: BrowserScope; sessionId?: string };
type Receipt = { binding: NativeStreamReadBinding; readers: WeakSet<WebContents>; touchedAt: number };
type Options = {
  isShell: (owner: WebContents) => boolean;
  readContext: (binding: NativeStreamReadBinding) => Promise<NativeStreamReadProof>;
  subscribeTransport: (binding: NativeStreamReadBinding, onEvent: (event: ChatStreamEvent) => void) => ChatStreamHandle;
  statusTransport: (binding: NativeStreamReadBinding) => Promise<Record<string, unknown>>;
  cancelTransport?: (binding: NativeStreamReadBinding) => Promise<Record<string, unknown>>;
  registry?: ChatStreamRegistry; capacity?: number;
};
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const reference = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512 && value === value.trim() && !/[\x00-\x1f]/.test(value);
function scope(value: unknown): BrowserScope {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['backendProfileId', 'spaceId', 'browserProfileId'].includes(key))
    || !Object.values(value).every(id) || Object.keys(value).length !== 3) throw new Error('Invalid Main-owned native stream scope');
  return Object.freeze({ ...(value as BrowserScope) });
}
function streamRequest(value: unknown, stringAllowed = false): string {
  if (stringAllowed && id(value)) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'streamId')
    || !id((value as any).streamId)) throw new Error('Only the accepted stream identity may be requested');
  return (value as any).streamId;
}

/** Owns read receipts, never worker execution. Closing a reader cannot stop a chat. */
export class NativeChatStreamController {
  private readonly captures = new WeakMap<NativeChatStreamCapture, Captured>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly navigation = new Map<WebContents, { epoch: number; navigate: (...args: any[]) => void; destroyed: () => void }>();
  private readonly subscriptions = new Map<WebContents, Map<string, object>>();
  private readonly registry: ChatStreamRegistry;
  private readonly capacity: number;
  private closed = false;
  constructor(private readonly options: Options) {
    this.registry = options.registry ?? new ChatStreamRegistry();
    this.capacity = options.capacity ?? 512;
    if (!Number.isSafeInteger(this.capacity) || this.capacity < 1 || this.capacity > 1024) throw new Error('Invalid stream receipt capacity');
  }
  private observe(owner: WebContents): number {
    let observed = this.navigation.get(owner);
    if (!observed) {
      const navigate = (_event: unknown, _url: string, _inPlace: boolean, mainFrame: boolean) => {
        if (mainFrame) { observed!.epoch++; this.closeOwner(owner); }
      };
      const destroyed = () => { this.closeOwner(owner); owner.removeListener('did-start-navigation', navigate); this.navigation.delete(owner); };
      observed = { epoch: 0, navigate, destroyed }; this.navigation.set(owner, observed);
      owner.on('did-start-navigation', navigate); owner.once('destroyed', destroyed);
    }
    return observed.epoch;
  }
  /** Call only after Main resolved its saved binding, BEFORE the actual HTTP await. */
  beginCapture(event: SenderEvent, request: MainBoundChatRequest): NativeChatStreamCapture {
    if (this.closed) throw new Error('Native stream reader is closed');
    const check = captureTrustedShellSender(event, this.options.isShell), owner = check();
    const profile = request.profile ?? 'default', workspacePath = request.workspacePath ?? request.workspace ?? null;
    const sessionId = request.sessionId == null ? undefined : request.sessionId;
    if (!reference(profile) || workspacePath !== null && (typeof workspacePath !== 'string' || workspacePath.length > 4096 || /[\x00-\x1f]/.test(workspacePath))
      || sessionId !== undefined && !id(sessionId)) throw new Error('Invalid captured native chat binding');
    const selected = request.spaceScope === undefined ? undefined : scope(request.spaceScope);
    const capture = Object.freeze({}) as NativeChatStreamCapture;
    this.captures.set(capture, { check, owner, frame: owner.mainFrame, navigation: this.observe(owner), profile,
      workspacePath, scope: selected, sessionId });
    return capture;
  }
  private captured(capture: NativeChatStreamCapture): Captured {
    if (this.closed) throw new Error('Native stream reader is closed');
    const captured = this.captures.get(capture);
    if (!captured) throw new Error('Native stream capture was not minted by Main');
    const owner = captured.check();
    if (owner !== captured.owner || owner.mainFrame !== captured.frame || this.observe(owner) !== captured.navigation)
      throw new Error('Assistant document changed during native chat capture');
    return captured;
  }
  private proof(binding: NativeStreamReadBinding, value: NativeStreamReadProof): NativeStreamReadBinding {
    if (!value || value.schemaVersion !== 1 || value.nativeChat !== true || !binding.spaceScope
      || !sameBrowserScope(scope(value.scope), binding.spaceScope) || value.sessionId !== binding.sessionId || value.streamId !== binding.streamId
      || value.profileName !== binding.profile || !reference(value.writerGeneration) || typeof value.processExited !== 'boolean'
      || value.profileHome !== undefined && !reference(value.profileHome)
      || binding.writerGeneration !== undefined && value.writerGeneration !== binding.writerGeneration
      || binding.profileHome !== undefined && value.profileHome !== binding.profileHome)
      throw new Error('Native stream read proof belongs to another accepted chat or writer');
    return Object.freeze({ ...binding, writerGeneration: value.writerGeneration,
      ...(value.profileHome === undefined ? {} : { profileHome: value.profileHome }) });
  }
  private async accept(capture: NativeChatStreamCapture, sessionId: string, streamId: string, savedLegacyProof = false): Promise<void> {
    const captured = this.captured(capture);
    if (!id(sessionId) || !id(streamId) || captured.sessionId !== undefined && captured.sessionId !== sessionId)
      throw new Error('Backend returned another accepted session or stream');
    let binding: NativeStreamReadBinding = Object.freeze({ sessionId, streamId, profile: captured.profile, workspacePath: captured.workspacePath,
      ...(captured.scope && !savedLegacyProof ? { spaceScope: captured.scope } : {}), nativeChat: !!captured.scope && !savedLegacyProof });
    if (binding.nativeChat) {
      const proof = await this.options.readContext(binding); this.captured(capture);
      binding = this.proof(binding, proof);
    }
    const previous = this.receipts.get(streamId);
    if (previous && JSON.stringify(previous.binding) !== JSON.stringify(binding)) throw new Error('Stream identity was already bound to another chat');
    while (!previous && this.receipts.size >= this.capacity) {
      const oldest = this.receipts.keys().next().value!;
      this.receipts.delete(oldest);
      for (const [owner, streams] of this.subscriptions) if (streams.has(oldest)) this.unsubscribeOwner(owner, oldest);
    }
    const receipt = previous ?? { binding, readers: new WeakSet<WebContents>(), touchedAt: performance.now() };
    receipt.readers.add(captured.owner); receipt.touchedAt = performance.now();
    this.receipts.set(streamId, receipt); this.captures.delete(capture);
  }
  async captureStart(capture: NativeChatStreamCapture, response: { sessionId: string; streamId: string; spaceScope?: BrowserScope | null }, actualSessionResponse?: any): Promise<void> {
    const captured = this.captured(capture);
    const saved = actualSessionResponse === undefined ? undefined : this.savedSession(captured, actualSessionResponse);
    if (saved && saved.session_id !== response.sessionId) throw new Error('Start response differs from its actual saved session proof');
    const tagged = Object.hasOwn(response, 'spaceScope');
    if (tagged && response.spaceScope !== null && (!captured.scope || !sameBrowserScope(scope(response.spaceScope), captured.scope))
      || tagged && saved && ((saved.space_scope == null) !== (response.spaceScope === null)))
      throw new Error('Actual start response differs from its captured native scope');
    // This tag is the actual Main HTTP response, never a renderer start payload.
    await this.accept(capture, response.sessionId, response.streamId, tagged ? response.spaceScope === null : saved?.space_scope == null && saved !== undefined);
  }
  private savedSession(captured: Captured, response: any): any {
    const session = response?.session;
    if (!session || !id(session.session_id) || captured.sessionId !== undefined && session.session_id !== captured.sessionId
      || session.profile != null && session.profile !== captured.profile
      || session.space_scope != null && (!captured.scope || !sameBrowserScope(scope(session.space_scope), captured.scope))
      || session.space_scope == null && (session.native_controls != null || session.independent != null))
      throw new Error('Saved session belongs to another captured profile or Space');
    const controls = session.native_controls;
    if (controls && (controls.schemaVersion !== 1 || !captured.scope || !sameBrowserScope(scope(controls.scope), captured.scope)
      || controls.sessionId !== session.session_id || !id(controls.streamId) || session.active_stream_id !== controls.streamId))
      throw new Error('Saved native controls do not match the actual session');
    return session;
  }
  async captureSession(capture: NativeChatStreamCapture, response: any): Promise<void> {
    const captured = this.captured(capture), session = this.savedSession(captured, response);
    if (!session.active_stream_id) { this.captures.delete(capture); return; }
    await this.accept(capture, session.session_id, session.active_stream_id, session.space_scope == null);
  }
  private receipt(event: SenderEvent, streamId: string): { receipt: Receipt; check: () => WebContents; owner: WebContents } {
    if (this.closed) throw new Error('Native stream reader is closed');
    const check = captureTrustedShellSender(event, this.options.isShell), owner = check(), receipt = this.receipts.get(streamId);
    this.observe(owner);
    if (!receipt || !receipt.readers.has(owner)) throw new Error('Open the accepted session before reading this stream');
    receipt.touchedAt = performance.now();
    return { receipt, check, owner };
  }
  private async authorize(event: SenderEvent, streamId: string): Promise<{ binding: NativeStreamReadBinding; check: () => WebContents; owner: WebContents; receipt: Receipt }> {
    const captured = this.receipt(event, streamId), navigation = this.observe(captured.owner);
    const check = () => {
      const owner = captured.check();
      if (this.closed || owner !== captured.owner || this.observe(owner) !== navigation || this.receipts.get(streamId) !== captured.receipt)
        throw new Error('Native stream reader changed while authorizing');
      return owner;
    };
    check();
    if (captured.receipt.binding.nativeChat) {
      const proof = await this.options.readContext(captured.receipt.binding); check(); this.proof(captured.receipt.binding, proof);
    }
    return { ...captured, check, binding: captured.receipt.binding };
  }
  async status(event: SenderEvent, request: unknown): Promise<Record<string, unknown>> {
    const streamId = streamRequest(request, true), authorized = await this.authorize(event, streamId); authorized.check();
    const result = await this.options.statusTransport(authorized.binding); authorized.check();
    return result;
  }
  async cancel(event: SenderEvent, request: unknown): Promise<Record<string, unknown>> {
    const streamId = streamRequest(request, true), authorized = await this.authorize(event, streamId);
    authorized.check();
    if (authorized.binding.nativeChat) throw new Error('Use the scoped native chat control');
    if (!this.options.cancelTransport) throw new Error('Native stream cancellation is unavailable');
    const result = await this.options.cancelTransport(authorized.binding);
    authorized.check();
    return result;
  }
  async subscribe(event: SenderEvent, request: unknown): Promise<{ ok: true; streamId: string }> {
    const streamId = streamRequest(request), authorized = await this.authorize(event, streamId); authorized.check();
    const result = this.registry.subscribe(authorized.owner, streamId, onEvent => {
      const handle = this.options.subscribeTransport(authorized.binding, event => {
        try {
          authorized.check();
          // Envelope provenance comes from the private read proof, never the
          // model's SSE payload or the renderer's first observed generation.
          const forwarded: ChatStreamEvent & { nativeContext?: NativeStreamEventContext } =
            { event: event.event, data: event.data, raw: event.raw };
          if (authorized.binding.nativeChat) forwarded.nativeContext = Object.freeze({ schemaVersion: 1,
            scope: authorized.binding.spaceScope!, sessionId: authorized.binding.sessionId,
            streamId: authorized.binding.streamId, writerGeneration: authorized.binding.writerGeneration! });
          onEvent(forwarded);
        } catch { this.unsubscribeOwner(authorized.owner, streamId); }
      });
      let streams = this.subscriptions.get(authorized.owner);
      if (!streams) { streams = new Map(); this.subscriptions.set(authorized.owner, streams); }
      const registration = {}; streams.set(streamId, registration);
      const remove = () => { const active = this.subscriptions.get(authorized.owner); if (active?.get(streamId) !== registration) return;
        active.delete(streamId); if (!active.size) this.subscriptions.delete(authorized.owner); };
      void handle.done.then(remove, remove);
      return handle;
    });
    authorized.check(); return result;
  }
  unsubscribe(event: SenderEvent, request: unknown): { ok: true; streamId: string } {
    const owner = captureTrustedShellSender(event, this.options.isShell)(), streamId = streamRequest(request);
    this.unsubscribeOwner(owner, streamId); return { ok: true, streamId };
  }
  private unsubscribeOwner(owner: WebContents, streamId: string): void {
    this.registry.unsubscribe(owner, streamId);
    const streams = this.subscriptions.get(owner); streams?.delete(streamId); if (!streams?.size) this.subscriptions.delete(owner);
  }
  private closeOwner(owner: WebContents): void {
    for (const streamId of this.subscriptions.get(owner)?.keys() ?? []) this.registry.unsubscribe(owner, streamId);
    this.subscriptions.delete(owner);
  }
  getProfile(streamId: string): string | undefined {
    return this.receipts.get(streamId)?.binding.profile;
  }
  close(): void {
    this.closed = true;
    for (const owner of this.subscriptions.keys()) this.closeOwner(owner);
    for (const [owner, observed] of this.navigation) {
      owner.removeListener('did-start-navigation', observed.navigate); owner.removeListener('destroyed', observed.destroyed);
    }
    this.navigation.clear();
    this.receipts.clear();
  }
}

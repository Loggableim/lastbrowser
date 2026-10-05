import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { session, webContents, type IpcMainInvokeEvent, type Session, type WebContents } from 'electron';
import { IndependentBrowserHostRegistry, sameBrowserScope, BrowserHostError } from './independent-browser-host.js';
import type { BrowserScope, BrowserHostEvent, BrowserLeaseSnapshot } from './independent-browser-host.js';
import { IndependentBrowserGateway } from './independent-browser-gateway.js';
import { captureTrustedShellSender } from './ipc-sender.js';
import { computeSpacePartition } from './space-partition.js';
import { isGuestOwnedByRenderer } from './window-tab-transfer.js';
import { computeAgentExecutionPartition } from './agent-execution-partition.js';
import { IndependentBrowserConnections } from './independent-browser-connections.js';
import { LocalAiController } from './local-ai-controller.js';
import type { scanLocalAiHardware, scanLocalAiHardwareInventory } from './local-ai-hardware.js';
import { browserOwnerFields, isNativeBrowserOwner, sameBrowserOwner, type BrowserOwnerFields, type NativeBrowserOwner } from './browser-lease-owner.js';

const publicOperations = new Set(['assistantSnapshot', 'assistantTurn', 'cancelAssistantTurn', 'assistantReset', 'assistantControl', 'interviewStart', 'interviewAnswer',
  'interviewReview', 'interviewContinue', 'interviewConfirm', 'interviewSkip', 'activity', 'dispatch', 'runControl',
  'permissions', 'approve', 'capabilities', 'bindings', 'events', 'globalActivity', 'modelSelection',
  'definitions', 'connectionSetup', 'connectionConfigure']);
const startupHandshakeRetryDelaysMs = [250, 500, 1000, 2000, 4000] as const;
function isRetryableSidekickStartup(error: unknown): boolean {
  return Boolean(error && typeof error === 'object'
    && (error as { code?: unknown }).code === 'sidekick_not_ready'
    && (error as { retryable?: unknown }).retryable === true);
}
const wait = (delay: number) => new Promise<void>(resolve => setTimeout(resolve, delay));
export type IndependentApiRequest = (operation: string, scope: BrowserScope | null, payload: Record<string, unknown>,
  backendProfileName: string) => Promise<any>;
export type NativeBrowserView = Readonly<{ schemaVersion: 1; scope: BrowserScope;
  owner: BrowserOwnerFields & NativeBrowserOwner; controlRevision: number; permissionRevision: number;
  controlEpoch: number; navigationEpoch: number; state: 'ready' | 'pausing' | 'paused'; automationPaused: boolean;
  writerAvailable: true; observedAt: string; visible: boolean;
  partitionKind: 'dedicated_agent'; accountSource: 'explicit_agent_login' }>;
type NativeBrowserRef = NativeBrowserView & { leaseId: string; targetId: string; mainGeneration: string; runnerGeneration: string };
const nativeUuid = (value: unknown): value is string => typeof value === 'string'
  && /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value);
const nativeId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** The typed renderer bridge consumes an explicit result, never a raw body or
 * Electron's lossy serialized rejection. Keep the private error payload bounded.
 */
export async function independentIpcRequest(controller: IndependentController | null | undefined,
  event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>, request: unknown): Promise<unknown> {
  try {
    if (!controller) throw new Error('Independent broker unavailable');
    return { ok: true, value: await controller.request(event, request) };
  } catch (error: unknown) {
    const fault = error as { code?: unknown; message?: unknown; retryable?: unknown; currentRevision?: unknown };
    const code = typeof fault?.code === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(fault.code)
      ? fault.code : 'independent_request_failed';
    return { ok: false, error: { schemaVersion: 1, code,
      message: code !== 'independent_request_failed' && typeof fault.message === 'string' && fault.message.length <= 1024
        ? fault.message : 'The independent request could not be completed. Check the selected Space and current permissions.',
      retryable: fault?.retryable === true,
      ...(Number.isSafeInteger(fault?.currentRevision) ? { currentRevision: fault.currentRevision } : {}) } };
  }
}
export type IndependentControllerOptions = {
  userDataDir: string; isShell: (contents: WebContents) => boolean; apiRequest: IndependentApiRequest;
  attachSession: (session: Session) => void;
  hardwareProbe?: typeof scanLocalAiHardware;
  hardwareInventoryProbe?: typeof scanLocalAiHardwareInventory;
};
type MainBinding = {
  schemaVersion: 1; scope: BrowserScope; partitionKey: string; backendProfileName: string;
  workspacePath: string | null; spaceName: string; bindingRevision: number;
};
type SelectedCapture = {
  guest: WebContents; renderer: WebContents; rendererFrame: IpcMainInvokeEvent['senderFrame'];
  scope: BrowserScope; partitionKey: string; backendProfileName: string;
  navigationEpoch: number; url: string; expiresAt: number;
};
const scopeKey = (s: BrowserScope) => JSON.stringify([s.backendProfileId, s.spaceId, s.browserProfileId]);
const workspaceKey = (value: string | null | undefined): string | null => value == null ? null
  : path.win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid independent request');
  return value as Record<string, any>;
}
function validateScope(value: unknown): BrowserScope {
  const s = object(value);
  if (Object.keys(s).some(k => !['spaceId', 'backendProfileId', 'browserProfileId'].includes(k))) throw new Error('Unexpected scope field');
  for (const key of ['spaceId', 'backendProfileId', 'browserProfileId'])
    if (typeof s[key] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(s[key])) throw new Error('Invalid scope identity');
  return { spaceId: s.spaceId, backendProfileId: s.backendProfileId, browserProfileId: s.browserProfileId };
}

/** Composition adapter, not a runner. Backend owns state; Main owns validated partitions and live targets. */
export class IndependentController {
  private bindings = new Map<string, MainBinding>();
  private loadPromise: Promise<void>;
  private persistQueue = Promise.resolve();
  private host?: IndependentBrowserHostRegistry;
  private gateway?: IndependentBrowserGateway;
  private generation?: string;
  private starting?: Promise<void>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private heartbeating = false;
  private closing = false;
  private connectionEpoch = 0;
  private readonly pageEpochs = new WeakMap<WebContents, { value: number }>();
  private readonly selectedCaptures = new Map<string, SelectedCapture>();
  private captureExpiryTimer?: ReturnType<typeof setTimeout>;
  private readonly executionSessions = new WeakSet<Session>();
  private readonly quarantinedExecutionSessions = new WeakSet<Session>();
  private readonly accounts: IndependentBrowserConnections;
  private readonly localAi: LocalAiController;
  constructor(private readonly options: IndependentControllerOptions) {
    this.loadPromise = this.load();
    this.accounts = new IndependentBrowserConnections({ userDataDir: options.userDataDir,
      apiRequest: (operation, scope, payload, profile) => this.limited(options.apiRequest(operation, scope, payload, profile)),
      runtime: () => { if (!this.host || !this.generation || this.closing) throw new BrowserHostError('generation_stale', 'Browser broker is disconnected');
        return { host: this.host, generation: this.generation }; }, quarantine: target => this.quarantinedExecutionSessions.add(target) });
    this.localAi = new LocalAiController({ userDataDir: options.userDataDir, scan: options.hardwareProbe, inventory: options.hardwareInventoryProbe,
      apiRequest: (operation, scope, payload, profile) => this.limited(options.apiRequest(operation, scope, payload, profile)) });
  }
  private file(): string { return path.join(this.options.userDataDir, 'independent-browser-bindings.json'); }
  private async load(): Promise<void> {
    try {
      const raw = object(JSON.parse(await readFile(this.file(), 'utf8')));
      if (raw.schemaVersion !== 1 || !Array.isArray(raw.bindings)) throw new Error('Unsupported Main browser-binding cache');
      for (const item of raw.bindings) {
        const candidate = object(item), s = validateScope(candidate.scope);
        if (typeof candidate.partitionKey !== 'string' || !candidate.partitionKey.startsWith('persist:space_')
          || typeof candidate.backendProfileName !== 'string' || !Number.isSafeInteger(candidate.bindingRevision))
          throw new Error('Invalid Main browser binding');
        this.bindings.set(scopeKey(s), { ...candidate, scope: s } as MainBinding);
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error; // corrupt mappings never silently become new accounts
    }
  }
  private persist(): Promise<void> {
    this.persistQueue = this.persistQueue.then(async () => {
      await mkdir(this.options.userDataDir, { recursive: true });
      const temporary = `${this.file()}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ schemaVersion: 1, bindings: [...this.bindings.values()] }, null, 2), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.file());
    });
    return this.persistQueue;
  }
  ownsWebContents(id: number): boolean { return this.host?.ownsWebContents(id) ?? false; }
  browserTargets(): string[] { return this.host?.list().map(lease => lease.targetId) ?? []; }
  private clearCaptures(): void {
    if (this.captureExpiryTimer) clearTimeout(this.captureExpiryTimer);
    this.captureExpiryTimer = undefined; this.selectedCaptures.clear();
  }
  private pruneCaptures(): void {
    if (this.captureExpiryTimer) clearTimeout(this.captureExpiryTimer);
    this.captureExpiryTimer = undefined;
    const now = performance.now();
    for (const [ref, capture] of this.selectedCaptures) {
      if (capture.expiresAt <= now || capture.guest.isDestroyed() || capture.renderer.isDestroyed()) this.selectedCaptures.delete(ref);
    }
    if (this.selectedCaptures.size) {
      const next = Math.min(...[...this.selectedCaptures.values()].map(capture => capture.expiresAt));
      this.captureExpiryTimer = setTimeout(() => this.pruneCaptures(), Math.max(1, next - now));
      this.captureExpiryTimer.unref();
    }
  }
  private assertCapture(capture: SelectedCapture, binding: MainBinding, renderer: WebContents,
    rendererFrame: IpcMainInvokeEvent['senderFrame']): void {
    if (this.closing || capture.expiresAt <= performance.now() || !sameBrowserScope(capture.scope, binding.scope)
      || capture.renderer !== renderer || capture.rendererFrame !== rendererFrame || renderer.isDestroyed()
      || !capture.rendererFrame || capture.rendererFrame.isDestroyed()
      || capture.backendProfileName !== binding.backendProfileName || capture.partitionKey !== binding.partitionKey
      || capture.guest.isDestroyed() || webContents.fromId(capture.guest.id) !== capture.guest
      || !isGuestOwnedByRenderer(capture.guest, renderer.id)
      || capture.guest.session !== session.fromPartition(binding.partitionKey)
      || capture.guest.getURL() !== capture.url || this.pageEpochs.get(capture.guest)?.value !== capture.navigationEpoch)
      throw new Error('Selected page reference is no longer valid for this Space and document');
  }
  private validateSelectedRefs(payload: Record<string, any>, binding: MainBinding, renderer: WebContents,
    rendererFrame: IpcMainInvokeEvent['senderFrame']): void {
    if ('selectedContext' in payload) throw new Error('Renderer cannot supply captured page contents');
    if (!('selectedContextRefs' in payload)) return;
    const refs = payload.selectedContextRefs;
    if (!Array.isArray(refs) || refs.length > 4 || new Set(refs).size !== refs.length
      || refs.some(ref => typeof ref !== 'string' || !/^[a-f0-9]{32}$/.test(ref))) throw new Error('Invalid selected page references');
    this.pruneCaptures();
    for (const ref of refs) {
      const capture = this.selectedCaptures.get(ref);
      if (!capture) throw new Error('Selected page reference is unknown or expired');
      try { this.assertCapture(capture, binding, renderer, rendererFrame); }
      catch (error) { this.selectedCaptures.delete(ref); this.pruneCaptures(); throw error; }
    }
  }
  async lookupBinding(browserProfileId: string, workspacePath: string | null | undefined, backendProfileName?: string): Promise<{
    scope: BrowserScope; backendProfileName: string;
  } | null> {
    await this.loadPromise;
    if (typeof browserProfileId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(browserProfileId))
      throw new Error('Invalid browser profile for chat binding');
    if (backendProfileName !== undefined && (typeof backendProfileName !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(backendProfileName)))
      throw new Error('Invalid backend profile for chat binding');
    const selected = workspacePath ?? null;
    const rows = [...this.bindings.values()].filter(binding => binding.scope.browserProfileId === browserProfileId
      && workspaceKey(binding.workspacePath) === workspaceKey(selected)
      && (!backendProfileName || binding.backendProfileName === backendProfileName));
    if (!backendProfileName && rows.length > 1) throw new Error('Choose the backend profile for this browser Space');
    return rows[0] ? { scope: { ...rows[0].scope }, backendProfileName: rows[0].backendProfileName } : null;
  }
  async bindSpaceRemoval(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>, raw: unknown): Promise<{
    request: { path: string; profile?: string; spaceScope?: BrowserScope }; recheck: () => void;
  }> {
    const checkSender = captureTrustedShellSender(event, this.options.isShell);
    const input = object(raw);
    if (Object.keys(input).some(key => !['path', 'browserProfileId'].includes(key))
      || typeof input.path !== 'string' || !input.path.trim() || input.path.length > 2048 || /[\x00-\x1f]/.test(input.path)
      || typeof input.browserProfileId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(input.browserProfileId))
      throw new Error('Invalid Space removal request');
    if (!(await this.profiles(checkSender())).includes(input.browserProfileId)) throw new Error('Unknown browser profile');
    checkSender();
    // Deletion must use an existing immutable mapping. It must never mint or
    // migrate a native Space merely to obtain permission to remove its row.
    const binding = await this.lookupBinding(input.browserProfileId, input.path);
    checkSender();
    const recheck = () => {
      checkSender();
      if (binding && this.binding(binding.scope).backendProfileName !== binding.backendProfileName)
        throw new Error('Space removal binding changed');
    };
    recheck();
    const recordedPath = binding ? this.binding(binding.scope).workspacePath : input.path;
    if (recordedPath === null) throw new Error('Home cannot be removed as a registered Space');
    return { request: { path: recordedPath, ...(binding ? { profile: binding.backendProfileName, spaceScope: binding.scope } : {}) }, recheck };
  }
  requestPolicy(details: { url: string; webContentsId?: number }, targetSession?: Session): { owned: boolean; allowed: boolean } {
    if (targetSession && this.executionSessions.has(targetSession)) return { owned: true,
      allowed: Boolean(this.generation && !this.closing && !this.quarantinedExecutionSessions.has(targetSession)
        && this.host?.allowsSessionRequest(targetSession, details.url)) };
    if (!details.webContentsId || !this.host?.ownsWebContents(details.webContentsId)) return { owned: false, allowed: true };
    return { owned: true, allowed: this.host.allowsRequest(details.webContentsId, details.url) };
  }
  private async limited<T>(operation: Promise<T>, timeoutMs = 5000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Independent broker timeout')), timeoutMs); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  private async event(event: BrowserHostEvent): Promise<void> {
    if (this.accounts.handlesEvent(event)) return;
    if (this.closing && !['closed', 'revoked', 'lost'].includes(event.kind)
      || event.lease.mainGeneration !== this.host?.mainGeneration) return;
    const connection = this.connectionEpoch, sourceHost = this.host;
    const binding = this.bindings.get(scopeKey(event.lease.scope));
    if (!binding) { await this.disconnect('mapping_missing'); return; }
    try { await this.limited(this.options.apiRequest('browser.event', binding.scope,
      { event, mainGeneration: event.lease.mainGeneration, runnerGeneration: event.lease.runnerGeneration }, binding.backendProfileName)); }
    catch { if (connection === this.connectionEpoch && sourceHost === this.host) await this.disconnect('event_channel_lost'); }
  }
  private async validateNativeBrowserOwner(owner: BrowserOwnerFields, scope: BrowserScope,
    runnerGeneration: string, host: IndependentBrowserHostRegistry): Promise<void> {
    if (!isNativeBrowserOwner(owner) || !this.generation || runnerGeneration !== this.generation || this.host !== host || this.closing)
      throw new BrowserHostError('generation_stale', 'Native browser has no current Parent owner');
    const binding = this.bindings.get(scopeKey(scope));
    if (!binding) throw new BrowserHostError('scope_mismatch', 'Native browser has no saved Main profile binding');
    const captured = browserOwnerFields(owner), profile = binding.backendProfileName;
    const result = object(await this.limited(this.options.apiRequest('browser.nativeValidate', binding.scope,
      { owner: captured, mainGeneration: host.mainGeneration, runnerGeneration }, profile)));
    if (this.host !== host || this.generation !== runnerGeneration || this.closing
      || this.bindings.get(scopeKey(scope))?.backendProfileName !== profile)
      throw new BrowserHostError('generation_stale', 'Native browser Parent changed during validation');
    if (result.schemaVersion !== 1 || result.validated !== true || !sameBrowserScope(validateScope(result.scope), scope)
      || !sameBrowserOwner(object(result.owner) as BrowserOwnerFields, captured)
      || result.mainGeneration !== host.mainGeneration || result.runnerGeneration !== runnerGeneration)
      throw new BrowserHostError('unauthorized', 'Native browser Parent writer proof changed');
  }
  async start(): Promise<void> {
    if (this.closing) throw new Error('Independent controller is shutting down');
    if (this.generation && this.gateway) return;
    if (this.starting) return this.starting;
    const connection = ++this.connectionEpoch;
    this.starting = (async () => {
      await this.loadPromise;
      const host: IndependentBrowserHostRegistry = new IndependentBrowserHostRegistry({
        validateTicket: async ticket => {
          if (!this.generation || ticket.runnerGeneration !== this.generation || this.host !== host)
            throw new BrowserHostError('generation_stale', 'Browser broker is disconnected');
          const binding = this.bindings.get(scopeKey(ticket.scope));
          if (!binding || computeAgentExecutionPartition(binding.scope) !== ticket.partitionKey)
            throw new BrowserHostError('partition_mismatch', 'Browser ticket has no validated Main execution mapping');
          if (ticket.purpose === 'account_setup') {
            if (!this.accounts.ownsSetupTicket(ticket)) throw new BrowserHostError('unauthorized', 'Setup lease has no explicit Main owner');
          } else {
            await this.accounts.validateTicket(binding, ticket);
            if (isNativeBrowserOwner(ticket)) await this.validateNativeBrowserOwner(ticket, ticket.scope, ticket.runnerGeneration, host);
          }
          if (!this.generation || ticket.runnerGeneration !== this.generation || this.host !== host)
            throw new BrowserHostError('generation_stale', 'Browser admission lost its runtime generation');
        },
        resolvePartition: s => {
          const binding = this.bindings.get(scopeKey(s)); if (!binding) throw new BrowserHostError('scope_mismatch', 'Unknown browser scope');
          return computeAgentExecutionPartition(binding.scope);
        }, attachSession: target => { this.executionSessions.add(target); this.options.attachSession(target); },
        isRunnerGenerationLive: (generation): boolean => generation === this.generation && this.host === host && !this.closing,
        isSessionQuarantined: target => this.quarantinedExecutionSessions.has(target),
        quarantineSession: target => this.quarantinedExecutionSessions.add(target), onEvent: event => {
          void this.event(event).catch(error => console.warn('[independent] Event cleanup not confirmed:', error));
        }
      });
      const gateway = new IndependentBrowserGateway({ host,
        normalizeTicket: ticket => {
          const binding = this.bindings.get(scopeKey(ticket.scope));
          if (!binding || ticket.partitionKey !== binding.partitionKey)
            throw new BrowserHostError('partition_mismatch', 'Browser ticket differs from its original profile binding');
          return { ...ticket, partitionKey: computeAgentExecutionPartition(binding.scope) };
        }, validateNativeOwner: (owner, scope, generation) => this.validateNativeBrowserOwner(owner, scope, generation, host),
        isRunnerGenerationLive: generation => generation === this.generation && this.host === host && !this.closing });
      this.host = host; this.gateway = gateway;
      try {
        const transport = await gateway.start();
        let result: Record<string, any> | undefined;
        for (let attempt = 0; ; attempt++) {
          try {
            result = object(await this.limited(this.options.apiRequest('browser.handshake', null,
              { ...transport, bootstrapSecret: gateway.bootstrapSecret }, '')));
            break;
          } catch (error) {
            const delay = startupHandshakeRetryDelaysMs[attempt];
            if (!isRetryableSidekickStartup(error) || delay === undefined) throw error;
            await wait(delay);
            if (this.closing || connection !== this.connectionEpoch) throw new Error('Independent browser startup was superseded');
          }
        }
        if (this.closing || connection !== this.connectionEpoch || typeof result.runnerGeneration !== 'string' || !result.runnerGeneration)
          throw new Error('Invalid or superseded independent browser handshake');
        this.generation = result.runnerGeneration;
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => { void this.tick().catch(error => console.warn('[independent] Heartbeat cleanup not confirmed:', error)); }, 5000);
        this.heartbeat.unref?.();
        // The historical installation-wide 230M download is not a qualified
        // router or chat model. The scoped wizard now recommends the pinned
        // 350M chat candidate and only enables it after a real bounded proof.
      } catch (error) {
        await this.disconnect('handshake_failed'); throw error;
      }
    })();
    try { await this.starting; } finally { this.starting = undefined; }
  }
  private async tick(): Promise<void> {
    if (this.heartbeating || this.closing || !this.generation || !this.host) return;
    this.heartbeating = true;
    const connection = this.connectionEpoch, generation = this.generation;
    try {
      const response = object(await this.limited(this.options.apiRequest('browser.heartbeat', null,
        { mainGeneration: this.host.mainGeneration, runnerGeneration: generation }, '')));
      if (connection === this.connectionEpoch && response.runnerGeneration !== generation) await this.disconnect('runner_restarted');
    } catch { if (connection === this.connectionEpoch) await this.disconnect('heartbeat_lost'); }
    finally { this.heartbeating = false; }
  }
  async disconnect(reason: string): Promise<void> {
    this.connectionEpoch++; this.generation = undefined;
    this.clearCaptures();
    if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = undefined;
    const host = this.host, gateway = this.gateway; this.host = undefined; this.gateway = undefined;
    const results = await Promise.allSettled([host?.closeAll(reason), gateway?.stop(), this.accounts.disconnect(reason)]);
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
  async shutdown(): Promise<void> {
    this.closing = true;
    const host = this.host, generation = this.generation;
    let failure: unknown;
    try {
      // Target gates close first; retain the private transport for genuine terminal ACKs.
      if (host) await host.closeAll();
      if (host && generation) {
        const acknowledgement = object(await this.limited(this.options.apiRequest('browser.shutdown', null,
          { mainGeneration: host.mainGeneration, runnerGeneration: generation }, ''), 3000));
        if (acknowledgement.closed !== true)
          throw new BrowserHostError('cleanup_unconfirmed', 'Backend browser cleanup was not acknowledged');
      }
    } catch (error) { failure = error; }
    finally {
      const results = await Promise.allSettled([this.disconnect('app_quit'), this.accounts.shutdown()]);
      for (const result of results) if (result.status === 'rejected' && failure === undefined) failure = result.reason;
    }
    if (failure !== undefined) throw failure;
  }
  private nativeTarget(ref: NativeBrowserRef, binding: MainBinding, host: IndependentBrowserHostRegistry,
    recheck: () => WebContents): BrowserLeaseSnapshot {
    recheck();
    if (this.closing || this.host !== host || this.generation !== ref.runnerGeneration
      || this.bindings.get(scopeKey(binding.scope)) !== binding)
      throw new BrowserHostError('generation_stale', 'Native browser changed its saved Main owner');
    const snapshot = host.snapshot(ref.leaseId);
    if (!sameBrowserScope(snapshot.scope, binding.scope) || !sameBrowserOwner(snapshot, ref.owner)
      || snapshot.targetId !== ref.targetId || snapshot.mainGeneration !== ref.mainGeneration
      || snapshot.runnerGeneration !== ref.runnerGeneration || snapshot.navigationEpoch !== ref.navigationEpoch
      || snapshot.permissionEpoch !== ref.controlEpoch || snapshot.expiresAt <= Date.now()
      || !['ready', 'pausing', 'paused'].includes(snapshot.state)
      || snapshot.partitionKind !== 'dedicated_agent' || snapshot.accountSource !== 'explicit_agent_login')
      throw new BrowserHostError('epoch_stale', 'Native browser target or authorization changed');
    return snapshot;
  }
  private async nativeReference(binding: MainBinding, payload: Record<string, unknown>, host: IndependentBrowserHostRegistry,
    recheck: () => WebContents, takeover = false): Promise<NativeBrowserRef> {
    recheck();
    const generation = this.generation;
    if (!generation || this.host !== host || this.closing)
      throw new BrowserHostError('generation_stale', 'Native browser transport is unavailable');
    const result = object(await this.limited(this.options.apiRequest(takeover ? 'browser.nativeTakeover' : 'browser.nativeView', binding.scope,
      { ...payload, mainGeneration: host.mainGeneration, runnerGeneration: generation }, binding.backendProfileName)));
    recheck();
    const owner = object(result.owner) as BrowserOwnerFields & NativeBrowserOwner;
    if (result.schemaVersion !== 1 || !sameBrowserScope(validateScope(result.scope), binding.scope)
      || !isNativeBrowserOwner(owner) || Object.keys(owner).some(key => !['runId', 'ownerKind', 'sessionId', 'streamId', 'writerGeneration', 'writerLeaseId'].includes(key))
      || owner.sessionId !== payload.sessionId || owner.streamId !== payload.streamId
      || result.mainGeneration !== host.mainGeneration || result.runnerGeneration !== generation
      || result.writerAvailable !== true || typeof result.automationPaused !== 'boolean'
      || !['ready', 'pausing', 'paused'].includes(result.state)
      || ['controlRevision', 'permissionRevision'].some(key => !Number.isSafeInteger(result[key]) || result[key] < 1)
      || ['controlEpoch', 'navigationEpoch'].some(key => !Number.isSafeInteger(result[key]) || result[key] < 0)
      || ['leaseId', 'targetId'].some(key => typeof result[key] !== 'string' || !result[key] || result[key].length > 256)
      || typeof result.observedAt !== 'string' || !Number.isFinite(Date.parse(result.observedAt)))
      throw new BrowserHostError('invalid_response', 'Native browser has no exact current Parent writer proof');
    const ref = result as NativeBrowserRef;
    this.nativeTarget(ref, binding, host, recheck);
    return ref;
  }
  private nativeView(ref: NativeBrowserRef, snapshot: BrowserLeaseSnapshot): NativeBrowserView {
    return { schemaVersion: 1, scope: { ...snapshot.scope }, owner: browserOwnerFields(snapshot) as BrowserOwnerFields & NativeBrowserOwner,
      controlRevision: ref.controlRevision, permissionRevision: ref.permissionRevision, controlEpoch: ref.controlEpoch,
      navigationEpoch: snapshot.navigationEpoch, state: snapshot.state as 'ready' | 'pausing' | 'paused',
      automationPaused: ref.automationPaused, writerAvailable: true, observedAt: ref.observedAt, visible: snapshot.visible,
      partitionKind: 'dedicated_agent', accountSource: 'explicit_agent_login' };
  }
  private binding(scopeValue: unknown): MainBinding {
    const s = validateScope(scopeValue), binding = this.bindings.get(scopeKey(s));
    if (!binding) throw new Error('Space scope has not been resolved in this application'); return binding;
  }
  private async runState(binding: MainBinding, runId: string | null, recheck: () => WebContents): Promise<Record<string, any>> {
    if (typeof runId !== 'string') throw new BrowserHostError('operation_denied', 'A native chat browser is controlled by its actual chat owner');
    const activity = object(await this.options.apiRequest('activity', binding.scope, {}, binding.backendProfileName));
    recheck();
    const run = Array.isArray(activity.runs) ? activity.runs.find(value => value?.runId === runId) : undefined;
    if (!run || !sameBrowserScope(validateScope(run.scope), binding.scope)
      || !Number.isSafeInteger(run.stateRevision) || run.stateRevision < 1)
      throw new Error('Live run state is unavailable for this browser target');
    return run;
  }
  private async profiles(sender: WebContents): Promise<string[]> {
    // Fixed data-only read from the trusted shell's existing profile store. No caller script.
    const result = await sender.executeJavaScript(`(() => {
      try { const rows = JSON.parse(localStorage.getItem('lastbrowser.profiles.v1') || '[]');
        return ['default', ...rows.filter(x => x && typeof x.id === 'string').map(x => x.id)]; }
      catch { return ['default']; } })()`);
    return Array.isArray(result) ? result.filter(id => typeof id === 'string') : ['default'];
  }
  async request(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>, raw: unknown): Promise<unknown> {
    const recheck = captureTrustedShellSender(event, this.options.isShell);
    const request = object(raw);
    if (request.schemaVersion !== 1 || Object.keys(request).some(k => !['schemaVersion', 'operation', 'scope', 'payload', 'backendProfileName'].includes(k)))
      throw new Error('Invalid independent request envelope');
    const payload = request.payload === undefined ? {} : object(request.payload);
    if (Object.keys(payload).some(k => ['partitionKey', 'canonicalHome', 'resolvedSpaceRoot', 'runnerGeneration', 'mainGeneration', 'bootstrapSecret', 'bridgeToken'].includes(k)))
      throw new Error('Renderer cannot choose runtime authority');
    if (request.operation === 'localAiHardwareInventory') {
      if (request.scope !== undefined || request.backendProfileName !== undefined)
        throw new BrowserHostError('invalid_request', 'A global hardware inventory cannot be assigned to a Space or backend profile');
      return this.localAi.hardwareInventory(payload, recheck);
    }
    await this.loadPromise; recheck();
    if (request.operation === 'backendProfiles' || request.operation === 'listBackendProfiles') {
      const response = object(await this.options.apiRequest('browser.backendProfiles', null, {}, 'default'));
      recheck();
      const profiles = Array.isArray(response.profiles) ? response.profiles : [{ name: 'default', isDefault: true }];
      return { schemaVersion: 1, profiles };
    }
    if (request.operation === 'profileBindings' || request.operation === 'listProfileBindings') {
      const targetBrowserProfile = payload.browserProfileId;
      if (targetBrowserProfile !== undefined && (typeof targetBrowserProfile !== 'string' || !(await this.profiles(recheck())).includes(targetBrowserProfile)))
        throw new Error('Unknown browser profile');
      recheck();
      const bindings = [...this.bindings.values()]
        .filter(b => targetBrowserProfile === undefined || b.scope.browserProfileId === targetBrowserProfile)
        .map(b => ({
          scope: { ...b.scope },
          browserProfileId: b.scope.browserProfileId,
          backendProfileName: b.backendProfileName,
          workspacePath: b.workspacePath,
          spaceName: b.spaceName,
          partitionKey: b.partitionKey,
          bindingRevision: b.bindingRevision,
        }));
      return { schemaVersion: 1, bindings };
    }
    if (request.operation === 'localAiBootstrap') {
      if (request.scope !== undefined || request.backendProfileName !== undefined)
        throw new BrowserHostError('invalid_request', 'The installation-wide bootstrap cannot be bound to a Space or profile');
      return this.localAi.bootstrap(payload, recheck);
    }
    if (request.operation === 'resolveScope' || request.operation === 'scope.open') {
      const sourceBinding = request.scope === undefined ? undefined : this.binding(request.scope);
      if (sourceBinding && request.backendProfileName && request.backendProfileName !== sourceBinding.backendProfileName)
        throw new Error('Profile differs from the saved source Space binding');
      const browserProfileId = payload.browserProfileId;
      if (typeof browserProfileId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(browserProfileId)
        || !(await this.profiles(recheck())).includes(browserProfileId)) throw new Error('Unknown browser profile');
      recheck();
      if (payload.workspacePath !== null && payload.workspacePath !== undefined && (typeof payload.workspacePath !== 'string' || payload.workspacePath.length > 2048))
        throw new Error('Invalid Space selection');
      const previous = [...this.bindings.values()].filter(binding => binding.scope.browserProfileId === browserProfileId
        && (payload.nativeSpaceId ? binding.scope.spaceId === payload.nativeSpaceId
          : workspaceKey(binding.workspacePath) === workspaceKey(payload.workspacePath)));
      if (!request.backendProfileName && !sourceBinding && previous.length > 1) throw new Error('Choose the backend profile for this browser Space');
      const profile = typeof request.backendProfileName === 'string' ? request.backendProfileName
        : sourceBinding?.backendProfileName ?? previous[0]?.backendProfileName ?? 'default';
      if (typeof profile !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile))
        throw new Error('Unknown backend profile');
      const isExistingBinding = Boolean((sourceBinding && sourceBinding.backendProfileName === profile)
        || (!request.backendProfileName && previous.length === 1 && previous[0].backendProfileName === profile));
      if (profile !== 'default' && !isExistingBinding) {
        const backendProfilesResponse = object(await this.options.apiRequest('browser.backendProfiles', null, {}, 'default'));
        recheck();
        const validBackendProfiles = Array.isArray(backendProfilesResponse.profiles)
          ? backendProfilesResponse.profiles.map((p: any) => typeof p?.name === 'string' ? p.name : '').filter(Boolean)
          : ['default'];
        if (!validBackendProfiles.includes(profile))
          throw new Error('Unknown backend profile');
      }
      const pathsResponse = object(await this.options.apiRequest('browser.spacePaths', null, {}, profile));
      recheck();
      if (!Array.isArray(pathsResponse.knownSpacePaths) || pathsResponse.knownSpacePaths.some((p: unknown) => typeof p !== 'string'))
        throw new Error('Backend workspace catalog is unavailable');
      const knownBeforeWrite: string[] = pathsResponse.knownSpacePaths;
      const catalogMatches = payload.workspacePath == null ? [] : knownBeforeWrite.filter(value => workspaceKey(value) === workspaceKey(payload.workspacePath));
      if (payload.workspacePath != null && catalogMatches.length !== 1) throw new Error('Space is not uniquely registered in the backend profile');
      const partitionWorkspace = catalogMatches[0] ?? null;
      const priorByNativeId = payload.nativeSpaceId ? [...this.bindings.values()].find(b => b.scope.spaceId === payload.nativeSpaceId
        && b.scope.browserProfileId === browserProfileId && b.backendProfileName === profile) : undefined;
      const requestedPartition = priorByNativeId?.partitionKey ?? previous.find(binding => binding.backendProfileName === profile)?.partitionKey
        ?? computeSpacePartition(browserProfileId, partitionWorkspace, false, knownBeforeWrite);
      const knownSpaces = object(await this.options.apiRequest('resolveScope', null,
        { workspacePath: payload.workspacePath ?? null, browserProfileId, nativeSpaceId: payload.nativeSpaceId,
          partitionKey: requestedPartition,
          backendProfileName: profile }, profile));
      recheck();
      const s = validateScope(knownSpaces.scope);
      if (s.browserProfileId !== browserProfileId) throw new Error('Backend returned another browser profile');
      if (knownSpaces.backendProfileName && knownSpaces.backendProfileName !== profile) throw new Error('Backend returned another backend profile');
      const prior = this.bindings.get(scopeKey(s));
      const expected = prior?.partitionKey ?? requestedPartition;
      if (knownSpaces.partitionKey !== expected) throw new Error('Backend partition differs from the existing browser mapping');
      const binding: MainBinding = { schemaVersion: 1, scope: s, partitionKey: expected,
        backendProfileName: String(knownSpaces.backendProfileName || profile), workspacePath: knownSpaces.workspacePath ?? null,
        spaceName: String(knownSpaces.spaceName || 'Space'), bindingRevision: knownSpaces.bindingRevision };
      this.bindings.set(scopeKey(s), binding); await this.persist(); recheck();
      return knownSpaces;
    }
    const binding = this.binding(request.scope);
    if (request.backendProfileName && request.backendProfileName !== binding.backendProfileName) throw new Error('Profile differs from the saved Space binding');
    if (request.operation === 'localAi') return this.localAi.request(binding, payload, recheck);
    if (['openNativeBrowser', 'takeoverNativeBrowser'].includes(request.operation)) {
      const takeover = request.operation === 'takeoverNativeBrowser';
      const allowed = ['sessionId', 'streamId', 'clientRequestId', ...(takeover ? ['writerGeneration', 'writerLeaseId',
        'expectedControlRevision', 'expectedPermissionRevision', 'expectedControlEpoch', 'expectedNavigationEpoch'] : [])];
      if (Object.keys(payload).some(key => !allowed.includes(key)) || !nativeId(payload.sessionId)
        || !nativeId(payload.streamId) || !nativeUuid(payload.clientRequestId))
        throw new BrowserHostError('invalid_request', 'Native browser requires its actual chat and stream');
      if (takeover && (['writerGeneration', 'writerLeaseId'].some(key => typeof payload[key] !== 'string' || !payload[key] || payload[key].length > 128)
        || ['expectedControlRevision', 'expectedPermissionRevision', 'expectedControlEpoch', 'expectedNavigationEpoch'].some(key =>
          !Number.isSafeInteger(payload[key]) || payload[key] < (key.endsWith('Revision') ? 1 : 0))))
        throw new BrowserHostError('invalid_request', 'Native takeover requires the reviewed writer and control revisions');
      const host = this.host;
      if (!host) throw new BrowserHostError('native_browser_target_missing', 'This chat has no live native browser');
      const identity = { sessionId: payload.sessionId, streamId: payload.streamId };
      let ref = await this.nativeReference(binding, identity, host, recheck);
      if (!takeover) {
        const preview = await host.preview(ref.leaseId); recheck();
        const confirmed = await this.nativeReference(binding, identity, host, recheck);
        if (!sameBrowserOwner(confirmed.owner, ref.owner) || confirmed.leaseId !== ref.leaseId
          || confirmed.controlRevision !== ref.controlRevision || confirmed.permissionRevision !== ref.permissionRevision
          || confirmed.controlEpoch !== ref.controlEpoch || confirmed.navigationEpoch !== ref.navigationEpoch
          || preview.navigationEpoch !== ref.navigationEpoch)
          throw new BrowserHostError('epoch_stale', 'Native browser changed while capturing its preview');
        return { ...this.nativeView(confirmed, this.nativeTarget(confirmed, binding, host, recheck)),
          kind: 'native_browser_preview', preview };
      }
      if (ref.owner.writerGeneration !== payload.writerGeneration || ref.owner.writerLeaseId !== payload.writerLeaseId
        || !(ref.controlRevision === payload.expectedControlRevision
          || ref.automationPaused && ref.controlRevision === payload.expectedControlRevision + 1)
        || ref.permissionRevision !== payload.expectedPermissionRevision
        || ref.controlEpoch !== payload.expectedControlEpoch || ref.navigationEpoch !== payload.expectedNavigationEpoch)
        throw new BrowserHostError('epoch_stale', 'Native browser review or writer changed');
      ref = await this.nativeReference(binding, payload, host, recheck, true);
      if (ref.automationPaused !== true || ref.controlRevision !== payload.expectedControlRevision + 1)
        throw new BrowserHostError('invalid_response', 'Native browser automation gate was not closed');
      await host.requestPause(ref.leaseId); recheck();
      const confirmed = await this.nativeReference(binding, identity, host, recheck);
      if (!sameBrowserOwner(confirmed.owner, ref.owner) || confirmed.leaseId !== ref.leaseId
        || confirmed.controlRevision !== ref.controlRevision || confirmed.permissionRevision !== ref.permissionRevision
        || confirmed.controlEpoch !== ref.controlEpoch || confirmed.navigationEpoch !== ref.navigationEpoch
        || confirmed.automationPaused !== true)
        throw new BrowserHostError('epoch_stale', 'Native browser changed before manual control');
      const shown = await host.takeover(ref.leaseId, { owner: confirmed.owner, scope: binding.scope, targetId: confirmed.targetId,
        mainGeneration: confirmed.mainGeneration, runnerGeneration: confirmed.runnerGeneration,
        navigationEpoch: confirmed.navigationEpoch, permissionEpoch: confirmed.controlEpoch });
      recheck(); this.nativeTarget(confirmed, binding, host, recheck);
      if (shown.state !== 'paused' || shown.visible !== true)
        throw new BrowserHostError('gate_closed', 'Native browser was not visibly taken over');
      return { ...this.nativeView(confirmed, shown), kind: 'native_browser_takeover', automationPaused: true };
    }
    if (request.operation === 'browserConnection') {
      await this.start(); recheck();
      return this.accounts.request(binding, payload, recheck);
    }
    if (['openBrowser', 'takeover', 'resumeBrowser', 'browser.preview', 'browser.takeover', 'browser.resume'].includes(request.operation)) {
      const lease = this.host?.list().find(l => l.runId === payload.runId && sameBrowserScope(l.scope, binding.scope));
      if (!lease || !this.host) throw new Error('This run has no live browser target');
      let result: unknown;
      if (request.operation === 'openBrowser' || request.operation === 'browser.preview') {
        result = { schemaVersion: 1, kind: 'preview', runId: lease.runId, leaseId: lease.leaseId,
          permissionEpoch: lease.permissionEpoch, partitionKind: lease.partitionKind, accountSource: lease.accountSource,
          ...await this.host.preview(lease.leaseId) };
      } else if (request.operation === 'takeover' || request.operation === 'browser.takeover') {
        // Close browser dispatch immediately; manual input awaits the real backend checkpoint.
        const host = this.host;
        await host.requestPause(lease.leaseId); recheck();
        let run = await this.runState(binding, lease.runId, recheck);
        if (!['paused', 'pausing'].includes(run.state)) {
          run = object(await this.options.apiRequest('runControl', binding.scope,
            { runId: lease.runId, command: 'pause', expectedRevision: run.stateRevision,
              clientRequestId: payload.clientRequestId ?? randomUUID() }, binding.backendProfileName));
          recheck();
        }
        // A provider call may still be reaching its checkpoint. Keep the target hidden until then.
        result = run.state === 'paused' ? await host.takeover(lease.leaseId) : host.snapshot(lease.leaseId);
      } else {
        const host = this.host, current = host.snapshot(lease.leaseId);
        if (current.state !== 'paused' || current.navigationEpoch !== payload.navigationEpoch
          || current.permissionEpoch !== payload.permissionEpoch)
          throw new BrowserHostError('epoch_stale', 'Manual target or authorization changed; validate before resuming');
        const run = await this.runState(binding, lease.runId, recheck);
        await this.options.apiRequest('runControl', binding.scope,
          { runId: lease.runId, command: 'resume', expectedRevision: run.stateRevision,
            clientRequestId: payload.clientRequestId ?? randomUUID() }, binding.backendProfileName);
        recheck();
        // Backend admission owns the queued -> running transition and resumes the gateway with
        // its durable control sequence. A second local resume would race that acknowledgement.
        result = host.snapshot(lease.leaseId);
      }
      recheck(); return result;
    }
    if (request.operation === 'selectedContext') {
      if (Object.keys(payload).some(key => !['guestWebContentsId', 'includePage', 'maxChars', 'clientRequestId'].includes(key))
        || !Number.isSafeInteger(payload.guestWebContentsId) || payload.guestWebContentsId < 1)
        throw new Error('Invalid selected page capture request');
      const renderer = recheck(), capturedAt = performance.now();
      const guest = webContents.fromId(payload.guestWebContentsId);
      if (!guest || guest.isDestroyed() || !isGuestOwnedByRenderer(guest, recheck().id)
        || guest.session !== session.fromPartition(binding.partitionKey) || typeof payload.includePage !== 'boolean')
        throw new Error('Selected page is not an explicitly authorized target of this Space');
      const max = Math.min(8000, Math.max(1, Number.isSafeInteger(payload.maxChars) ? payload.maxChars : 4000));
      let epoch = this.pageEpochs.get(guest);
      if (!epoch) {
        epoch = { value: 0 }; this.pageEpochs.set(guest, epoch);
        const tracked = epoch;
        guest.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) tracked.value++; });
      }
      const navigationEpoch = epoch.value;
      const observedUrl = guest.getURL();
      const capture: SelectedCapture = { guest, renderer, rendererFrame: event.senderFrame,
        scope: { ...binding.scope }, partitionKey: binding.partitionKey, backendProfileName: binding.backendProfileName,
        navigationEpoch, url: observedUrl, expiresAt: capturedAt + 120000 };
      const content = await guest.executeJavaScript(`({selection: (window.getSelection()?.toString() || '').slice(0,${max}),
        page: ${payload.includePage ? `(document.body?.innerText || '').slice(0,${max})` : "''"}, title: document.title, url: location.href})`);
      recheck();
      try { this.assertCapture(capture, binding, renderer, event.senderFrame); }
      catch { throw new Error('Selected page changed during extraction'); }
      const result = await this.options.apiRequest('selectedContext', binding.scope,
        { content, observedAt: new Date().toISOString(), guestWebContentsId: guest.id, navigationEpoch }, binding.backendProfileName);
      recheck(); this.assertCapture(capture, binding, renderer, event.senderFrame);
      const response = object(result);
      if (typeof response.ref !== 'string' || !/^[a-f0-9]{32}$/.test(response.ref)
        || !sameBrowserScope(validateScope(response.scope), binding.scope)
        || !Number.isSafeInteger(response.expiresInSeconds) || response.expiresInSeconds < 1 || response.expiresInSeconds > 120
        || this.selectedCaptures.has(response.ref)) throw new Error('Invalid selected page capture response');
      capture.expiresAt = Math.min(capture.expiresAt, capturedAt + response.expiresInSeconds * 1000);
      this.pruneCaptures();
      while (this.selectedCaptures.size >= 128) this.selectedCaptures.delete(this.selectedCaptures.keys().next().value!);
      this.selectedCaptures.set(response.ref, capture); this.pruneCaptures();
      return result;
    }
    if (request.operation === 'modelSelection') {
      const action = payload.action ?? 'get';
      if (!['get', 'set'].includes(action) || Object.keys(payload).some(key => !['action', 'model', 'provider', 'expectedRevision', 'clientRequestId', 'includeCatalog'].includes(key))
        || ('includeCatalog' in payload && (action !== 'get' || typeof payload.includeCatalog !== 'boolean')))
        throw new Error('Invalid scoped model selection');
      if (action === 'set' && (typeof payload.model !== 'string' || !payload.model || payload.model.length > 512
        || typeof payload.provider !== 'string' || payload.provider.length > 128
        || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 1
        || typeof payload.clientRequestId !== 'string' || !payload.clientRequestId || payload.clientRequestId.length > 128
        || [payload.model, payload.provider, payload.clientRequestId].some(value => /[\x00-\x1f]/.test(value))))
        throw new Error('Invalid scoped model selection');
      // The bound API probes its live isolated catalog and validates connection
      // digest + CAS at the atomic write. A second Main discovery would race
      // that transaction and invalidate already committed idempotent retries.
      const result = object(await this.options.apiRequest('modelSelection', binding.scope, payload, binding.backendProfileName));
      recheck();
      if (result.schemaVersion !== 1 || !sameBrowserScope(validateScope(result.scope), binding.scope)
        || !Number.isSafeInteger(result.revision) || result.revision < 1 || typeof result.model !== 'string'
        || typeof result.provider !== 'string' || typeof result.configured !== 'boolean' || typeof result.supportsIndependent !== 'boolean')
        throw new Error('Invalid bound model selection response');
      return result;
    }
    if (request.operation === 'assistantControl') {
      const fields = ['humanTurnId', 'sourceMessageId', 'runId', 'expectedRevision', 'controlEpoch', 'requestDigest', 'clientRequestId'];
      const uuid = /^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/;
      if (Object.keys(payload).some(key => !fields.includes(key))
        || ['humanTurnId', 'sourceMessageId', 'runId', 'clientRequestId'].some(key => typeof payload[key] !== 'string' || !uuid.test(payload[key]))
        || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 1
        || !Number.isSafeInteger(payload.controlEpoch) || payload.controlEpoch < 0
        || typeof payload.requestDigest !== 'string' || !/^[a-f0-9]{64}$/.test(payload.requestDigest))
        throw new Error('Invalid human control choice');
      // Backend binds this choice to the persisted original human turn and
      // candidate, then checks live CAS, permission revision and control epoch.
      // The renderer cannot supply a command, actor or provenance claim.
    }
    if (!publicOperations.has(request.operation)) throw new Error('Independent operation is not exposed to the renderer');
    if (request.operation === 'permissions' && payload.action === 'revoke') {
      await this.accounts.closeSetupScope(binding.scope, 'permission_revoked'); recheck();
    }
    if (['assistantTurn', 'dispatch'].includes(request.operation)) this.validateSelectedRefs(payload, binding, recheck(), event.senderFrame);
    // The boot handshake may precede Sidecar readiness or be lost later.
    // Reconnect before accepting work; never replay a dispatched operation.
    if (['assistantTurn', 'dispatch'].includes(request.operation)
      || request.operation === 'definitions' && payload.action === 'start') {
      await this.start(); recheck();
      if (['assistantTurn', 'dispatch'].includes(request.operation)) this.validateSelectedRefs(payload, binding, recheck(), event.senderFrame);
    }
    const result = await this.options.apiRequest(request.operation, binding.scope, payload, binding.backendProfileName);
    recheck();
    if (['definitions', 'connectionSetup', 'connectionConfigure', 'assistantReset', 'assistantControl'].includes(request.operation)) {
      const response = object(result);
      if (response.schemaVersion !== 1 || !sameBrowserScope(validateScope(response.scope), binding.scope))
        throw new Error('Invalid bound independent operation response');
    }
    return result;
  }
}

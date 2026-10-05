import { BaseWindow, WebContentsView, session } from 'electron';
import type { Session, WebContents } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { isAgentExecutionPartition } from './agent-execution-partition.js';
import { browserOwnerFields, sameBrowserOwner, validBrowserOwner, type BrowserOwnerFields } from './browser-lease-owner.js';

export type BrowserScope = Readonly<{
  spaceId: string; backendProfileId: string; browserProfileId: string;
}>;
export type BrowserLeaseState = 'ready' | 'pausing' | 'paused' | 'revoked' | 'lost' | 'closing' | 'closed';
export type BrowserLeaseTicket = BrowserOwnerFields & Readonly<{
  leaseId: string; scope: BrowserScope; partitionKey: string;
  runnerGeneration: string; permissionEpoch: number; allowedOrigins: readonly string[];
  expiresAt: number; title?: string;
  /** Only Main can mint setup leases; the gateway accepts work tickets only. */
  purpose?: 'work' | 'account_setup';
  accountBindings?: readonly { bindingId: string; connectionId: string; connectionRevision: number; revision: number }[];
}>;
export type BrowserLeaseSnapshot = BrowserOwnerFields & Readonly<{
  leaseId: string; scope: BrowserScope; partitionKey: string;
  targetId: string; webContentsId: number; mainGeneration: string; runnerGeneration: string;
  navigationEpoch: number; permissionEpoch: number; state: BrowserLeaseState;
  url: string; observedAt: string; expiresAt: number; visible: boolean;
  partitionKind: 'dedicated_agent' | 'legacy_shared';
  accountSource: 'explicit_agent_login' | 'legacy_profile';
  purpose?: 'work' | 'account_setup';
}>;
export type BrowserAction =
  | { kind: 'navigate'; url: string; effect: 'read' | 'write' }
  | { kind: 'read'; selector?: string; maxChars?: number; effect: 'read' }
  | { kind: 'click'; selector: string; effect: 'read' | 'write' }
  | { kind: 'type'; selector: string; text: string; clear?: boolean; effect: 'write' }
  | { kind: 'screenshot'; effect: 'read' };
export type BrowserActionPermit = BrowserOwnerFields & Readonly<{
  permitId: string; leaseId: string; scope: BrowserScope;
  targetId: string; mainGeneration: string; runnerGeneration: string;
  navigationEpoch: number; permissionEpoch: number; actionDigest: string;
  expiresAt: number; allowMutation: boolean;
}>;
export type BrowserHostEvent = Readonly<{
  kind: 'created' | 'navigation' | 'paused' | 'resumed' | 'revoked' | 'lost' | 'closed'
    | 'popup_denied' | 'navigation_denied' | 'download_denied';
  lease: BrowserLeaseSnapshot; reason?: string;
}>;
export type BrowserHostOptions = {
  /** Must validate the backend ticket, live generation, scope and permission epoch. */
  validateTicket: (ticket: BrowserLeaseTicket) => Promise<void> | void;
  /** Main-owned mapping. Never compute this from caller-controlled paths. */
  resolvePartition: (scope: BrowserScope) => string | Promise<string>;
  attachSession?: (target: Session) => void;
  onEvent?: (event: BrowserHostEvent) => void;
  now?: () => number;
  actionTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  isRunnerGenerationLive?: (generation: string) => boolean;
  isSessionQuarantined?: (target: Session) => boolean;
  quarantineSession?: (target: Session) => void;
};

export class BrowserHostError extends Error {
  constructor(public readonly code: string, message: string, public readonly inFlight = false) {
    super(message); this.name = 'BrowserHostError';
  }
}

/** Sorted JSON also binds effect, selector and URL; no caller-supplied digest is trusted. */
export function browserActionDigest(action: BrowserAction): string {
  const sorted = Object.fromEntries(Object.entries(action).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}
export function sameBrowserScope(a: BrowserScope, b: BrowserScope): boolean {
  return a.spaceId === b.spaceId && a.backendProfileId === b.backendProfileId
    && a.browserProfileId === b.browserProfileId;
}

type OwnedLease = {
  ticket: BrowserLeaseTicket; host: BaseWindow; view: WebContentsView; webContents: WebContents; session: Session;
  targetId: string; navigationEpoch: number; permissionEpoch: number; state: BrowserLeaseState;
  queue: Promise<unknown>; inFlight: boolean; consumed: Set<string>;
  listeners: (() => void)[]; timers: Set<ReturnType<typeof setTimeout>>;
  closedSignal: AbortController;
  cleanup?: Promise<void>; expiresTimer?: ReturnType<typeof setTimeout>;
};

/** Main owns every strong reference. Neither a renderer nor an SSE subscription owns a lease. */
export class IndependentBrowserHostRegistry {
  readonly mainGeneration = randomUUID();
  private readonly leases = new Map<string, OwnedLease>();
  private readonly closing = new Map<string, Promise<void>>();
  private readonly tombstones = new Map<string, BrowserLeaseSnapshot>();
  private readonly creating = new Set<string>();
  private readonly creatingScopes = new Set<string>();
  private readonly creatingPartitions = new Set<string>();
  private readonly quarantinedPartitions = new Set<string>();
  private readonly executionSessions = new WeakSet<Session>();
  private readonly now: () => number;
  private quitting = false;
  constructor(private readonly options: BrowserHostOptions) { this.now = options.now ?? Date.now; }
  get size(): number { return this.leases.size; }
  ownsWebContents(id: number): boolean {
    return [...this.leases.values()].some(l => l.webContents.id === id);
  }
  /** Generic attributed targets. Product leases use exclusive execution Sessions below. */
  allowsRequest(id: number, url: string): boolean {
    const lease = [...this.leases.values()].find(l => l.webContents.id === id);
    return this.networkAllowed(lease, url);
  }
  ownsExecutionSession(target: Session): boolean { return this.executionSessions.has(target); }
  /** Every request in this exclusive Session, including SW/SharedWorker/unknown IDs, has one owner. */
  allowsSessionRequest(target: Session, url: string): boolean {
    if (!this.executionSessions.has(target) || this.options.isSessionQuarantined?.(target)) return false;
    return this.networkAllowed([...this.leases.values()].find(l => l.session === target), url);
  }
  private networkAllowed(lease: OwnedLease | undefined, url: string): boolean {
    let normalized = url;
    try { const parsed = new URL(url); if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
      else if (parsed.protocol === 'wss:') parsed.protocol = 'https:'; normalized = parsed.href; } catch { return false; }
    return Boolean(lease && (lease.state === 'ready' || (lease.state === 'paused' && lease.host.isVisible()))
      && !this.quarantinedPartitions.has(lease.ticket.partitionKey)
      && (!this.options.isRunnerGenerationLive || this.options.isRunnerGenerationLive(lease.ticket.runnerGeneration))
      && this.now() < lease.ticket.expiresAt && this.urlAllowed(lease, normalized));
  }
  list(): BrowserLeaseSnapshot[] { return [...this.leases.keys()].map(id => this.snapshot(id)); }
  snapshot(id: string): BrowserLeaseSnapshot {
    const lease = this.leases.get(id);
    if (!lease) {
      const old = this.tombstones.get(id);
      if (old) return old;
      throw new BrowserHostError('lease_missing', 'Browser lease no longer exists');
    }
    const wc = lease.webContents;
    return Object.freeze({
      leaseId: lease.ticket.leaseId, ...browserOwnerFields(lease.ticket), scope: lease.ticket.scope,
      partitionKey: lease.ticket.partitionKey, targetId: lease.targetId, webContentsId: wc.id,
      mainGeneration: this.mainGeneration, runnerGeneration: lease.ticket.runnerGeneration,
      navigationEpoch: lease.navigationEpoch, permissionEpoch: lease.permissionEpoch, state: lease.state,
      url: wc.isDestroyed() ? '' : wc.getURL(), observedAt: new Date(this.now()).toISOString(),
      expiresAt: lease.ticket.expiresAt, visible: !lease.host.isDestroyed() && lease.host.isVisible(),
      partitionKind: isAgentExecutionPartition(lease.ticket.partitionKey) ? 'dedicated_agent' : 'legacy_shared',
      accountSource: isAgentExecutionPartition(lease.ticket.partitionKey) ? 'explicit_agent_login' : 'legacy_profile',
      purpose: lease.ticket.purpose ?? 'work'
    });
  }
  private emit(id: string, kind: BrowserHostEvent['kind'], reason?: string): void {
    // A UI/event observer must never undo gate closure or skip cleanup.
    try { this.options.onEvent?.({ kind, lease: this.snapshot(id), reason }); } catch { /* observer only */ }
  }
  private owned(id: string): OwnedLease {
    const lease = this.leases.get(id);
    if (!lease || ['lost', 'closing', 'closed'].includes(lease.state))
      throw new BrowserHostError('lease_missing', 'Browser target is not live');
    if (lease.webContents.isDestroyed() || lease.host.isDestroyed())
      throw new BrowserHostError('target_lost', 'The exact browser target was destroyed');
    return lease;
  }
  async createLease(ticket: BrowserLeaseTicket): Promise<BrowserLeaseSnapshot> {
    if (this.quitting) throw new BrowserHostError('quitting', 'Browser host is shutting down');
    if (!ticket || !ticket.scope || !ticket.leaseId || !validBrowserOwner(ticket) || !ticket.runnerGeneration
      || !Number.isSafeInteger(ticket.permissionEpoch) || ticket.permissionEpoch < 0
      || !Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= this.now()
      || ticket.expiresAt > this.now() + 24 * 60 * 60 * 1000
      || !Array.isArray(ticket.allowedOrigins) || ticket.allowedOrigins.length === 0)
      throw new BrowserHostError('invalid_ticket', 'Invalid or expired browser lease ticket');
    for (const origin of ticket.allowedOrigins) {
      const url = new URL(origin);
      if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin || url.username || url.password)
        throw new BrowserHostError('invalid_origin', 'Browser origins must be exact HTTP(S) origins');
    }
    if (this.creating.has(ticket.leaseId) || this.leases.has(ticket.leaseId) || this.tombstones.has(ticket.leaseId))
      throw new BrowserHostError('duplicate_lease', 'A browser lease ID cannot be reused');
    const scopeKey = JSON.stringify([ticket.scope.backendProfileId, ticket.scope.spaceId, ticket.scope.browserProfileId]);
    if (this.creatingScopes.has(scopeKey) || [...this.leases.values()].some(l => sameBrowserScope(l.ticket.scope, ticket.scope)))
      throw new BrowserHostError('scope_busy', 'This exact Scope already owns a browser lease');
    this.creating.add(ticket.leaseId);
    this.creatingScopes.add(scopeKey);
    let reservedPartition: string | undefined;
    let lease: OwnedLease | undefined;
    let createdHost: BaseWindow | undefined, createdView: WebContentsView | undefined;
    try {
      await this.options.validateTicket(ticket);
      const partition = await this.options.resolvePartition(ticket.scope);
      if (!partition || partition !== ticket.partitionKey)
        throw new BrowserHostError('partition_mismatch', 'Ticket does not match the Main-owned partition');
      if (this.creatingPartitions.has(partition) || this.quarantinedPartitions.has(partition)
        || [...this.leases.values()].some(l => l.ticket.partitionKey === partition))
        throw new BrowserHostError('session_busy', 'Execution storage is occupied or cleanup is unconfirmed');
      this.creatingPartitions.add(partition); reservedPartition = partition;
      // Awaiting validation must not let a late create survive shutdown or stale expiry.
      if (this.quitting || ticket.expiresAt <= this.now()) throw new BrowserHostError('quitting', 'Lease creation cancelled');
      await this.options.validateTicket(ticket);
      const targetSession = session.fromPartition(partition);
      if (this.options.isSessionQuarantined?.(targetSession))
        throw new BrowserHostError('cleanup_unconfirmed', 'Execution storage remains quarantined');
      if (isAgentExecutionPartition(partition)) this.executionSessions.add(targetSession);
      this.options.attachSession?.(targetSession);
      // Gate remains idle/deny until native cleanup has acknowledged. Preserve account cookies and origin storage.
      await this.clearExecutionWorkers(targetSession, partition);
      if (this.quitting || ticket.expiresAt <= this.now()) throw new BrowserHostError('quitting', 'Lease creation cancelled');
      await this.options.validateTicket(ticket);
      if (this.quitting || ticket.expiresAt <= this.now()) throw new BrowserHostError('quitting', 'Lease creation cancelled');
      const host = new BaseWindow({ show: false, width: 1100, height: 760, title: ticket.title ?? 'LastBrowser agent',
        skipTaskbar: true,
        autoHideMenuBar: true, backgroundColor: '#ffffff' });
      createdHost = host;
      const view = new WebContentsView({ webPreferences: {
        session: targetSession, nodeIntegration: false, nodeIntegrationInSubFrames: false,
        contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
        allowRunningInsecureContent: false, backgroundThrottling: false, disableDialogs: true,
        plugins: true
      } });
      createdView = view;
      host.contentView.addChildView(view);
      host.setIgnoreMouseEvents(true);
      const wc = view.webContents;
      wc.setBackgroundThrottling(false);
      lease = { ticket: Object.freeze({ ...ticket, scope: Object.freeze({ ...ticket.scope }),
          allowedOrigins: Object.freeze([...ticket.allowedOrigins]) }),
        host, view, webContents: wc, session: targetSession, targetId: '', navigationEpoch: 0, permissionEpoch: ticket.permissionEpoch,
        state: 'ready', queue: Promise.resolve(), inFlight: false, consumed: new Set(), listeners: [], timers: new Set(),
        closedSignal: new AbortController() };
      this.leases.set(ticket.leaseId, lease);
      const listen = (emitter: NodeJS.EventEmitter, name: string, handler: (...args: any[]) => void): void => {
        emitter.on(name, handler); lease!.listeners.push(() => emitter.removeListener(name, handler));
      };
      const bounds = (): void => {
        if (!host.isDestroyed()) { const [width, height] = host.getContentSize(); view.setBounds({ x: 0, y: 0, width, height }); }
      };
      bounds(); listen(host, 'resize', bounds);
      const lose = (reason: string): void => {
        if (lease!.state === 'closing' || lease!.state === 'closed' || lease!.state === 'lost') return;
        lease!.state = 'lost'; lease!.permissionEpoch++; this.emit(ticket.leaseId, 'lost', reason);
        void this.closeLease(ticket.leaseId, reason).catch(() => undefined);
      };
      listen(host, 'closed', () => lose('host_closed'));
      listen(wc, 'destroyed', () => lose('target_destroyed'));
      listen(wc, 'render-process-gone', () => lose('renderer_gone'));
      listen(wc.debugger, 'detach', () => lose('debugger_detached'));
      listen(wc, 'did-start-navigation', (_e, _url, _inPlace, mainFrame) => {
        if (mainFrame) { lease!.navigationEpoch++; this.emit(ticket.leaseId, 'navigation'); }
      });
      const checkNavigation = (event: { preventDefault(): void; url?: string }, url?: string): void => {
        if (!this.urlAllowed(lease!, event.url ?? url ?? '')) {
          event.preventDefault(); this.pauseImmediately(lease!);
          this.emit(ticket.leaseId, 'navigation_denied', 'origin_or_protocol_not_authorized');
        }
      };
      listen(wc, 'will-frame-navigate', checkNavigation);
      listen(wc, 'will-redirect', checkNavigation);
      wc.setWindowOpenHandler(() => { this.emit(ticket.leaseId, 'popup_denied'); return { action: 'deny' }; });
      // Scope-local download cancellation; does not replace session webRequest/permission handlers.
      const download = (event: { preventDefault(): void }, item: { cancel(): void }, from?: WebContents): void => {
        if (from?.id !== wc.id) return;
        event.preventDefault(); try { item.cancel(); } catch { /* already cancelled */ }
        this.emit(ticket.leaseId, 'download_denied');
      };
      targetSession.prependListener('will-download', download);
      lease.listeners.push(() => targetSession.removeListener('will-download', download));
      // Input cannot reach the work page before a safe manual takeover.
      listen(wc, 'before-input-event', (event) => { if (lease!.state !== 'paused') event.preventDefault(); });
      wc.debugger.attach('1.3');
      const { targetInfo } = await this.deadline(lease,
        wc.debugger.sendCommand('Target.getTargetInfo') as Promise<{ targetInfo: { targetId: string } }>, 5000);
      if (!targetInfo?.targetId) throw new BrowserHostError('target_missing', 'No debugger target for owned WebContents');
      await this.options.validateTicket(ticket);
      if (this.quitting || lease.state !== 'ready' || ticket.expiresAt <= this.now())
        throw new BrowserHostError('quitting', 'Lease creation was superseded by revocation or shutdown');
      lease.targetId = targetInfo.targetId;
      const captured = lease;
      lease.expiresTimer = setTimeout(() => {
        if (!this.leases.has(ticket.leaseId)) return;
        captured.state = 'revoked'; captured.permissionEpoch++; this.emit(ticket.leaseId, 'revoked', 'lease_expired');
        void this.closeLease(ticket.leaseId, 'lease_expired').catch(() => undefined);
      }, Math.max(1, ticket.expiresAt - this.now()));
      lease.expiresTimer.unref?.();
      this.emit(ticket.leaseId, 'created');
      return this.snapshot(ticket.leaseId);
    } catch (error) {
      if (lease) await this.closeLease(ticket.leaseId, 'create_failed');
      else {
        try { if (createdView && !createdView.webContents.isDestroyed()) createdView.webContents.close({ waitForBeforeUnload: false }); } catch { /* partial construction */ }
        try { if (createdHost && !createdHost.isDestroyed()) createdHost.destroy(); } catch { /* partial construction */ }
      }
      throw error;
    } finally {
      this.creating.delete(ticket.leaseId); this.creatingScopes.delete(scopeKey);
      if (reservedPartition) this.creatingPartitions.delete(reservedPartition);
    }
  }
  private quarantine(target: Session, partition: string): void {
    this.quarantinedPartitions.add(partition); this.options.quarantineSession?.(target);
  }
  private async clearExecutionWorkers(target: Session, partition: string): Promise<void> {
    if (!isAgentExecutionPartition(partition)) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await target.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
          if (Object.keys(target.serviceWorkers.getAllRunning()).length)
            throw new BrowserHostError('cleanup_unconfirmed', 'Execution workers remain alive after native cleanup');
        })(),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new BrowserHostError('cleanup_unconfirmed',
          'Execution worker cleanup did not acknowledge')), this.options.cleanupTimeoutMs ?? 1500); })
      ]);
    } catch (error) {
      this.quarantine(target, partition);
      throw error instanceof BrowserHostError ? error : new BrowserHostError('cleanup_unconfirmed', 'Native execution worker cleanup failed');
    }
    finally { if (timeout) clearTimeout(timeout); }
  }
  private urlAllowed(lease: OwnedLease, raw: string): boolean {
    try {
      const url = new URL(raw);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
        && lease.ticket.allowedOrigins.includes(url.origin);
    } catch { return false; }
  }
  private gate(lease: OwnedLease, permit: BrowserActionPermit, action: BrowserAction): void {
    if (lease.ticket.purpose === 'account_setup')
      throw new BrowserHostError('operation_denied', 'Manual account setup grants no worker action authority');
    if (this.quitting || lease.state !== 'ready' || this.now() >= lease.ticket.expiresAt)
      throw new BrowserHostError('gate_closed', 'The browser action gate is closed');
    if (lease.webContents.isDestroyed() || lease.host.isDestroyed())
      throw new BrowserHostError('target_lost', 'The owned browser target is destroyed');
    if (!lease.webContents.debugger.isAttached())
      throw new BrowserHostError('target_lost', 'The debugger lease was detached; no replacement target is selected');
    if (!sameBrowserScope(lease.ticket.scope, permit.scope) || !sameBrowserOwner(lease.ticket, permit)
      || lease.ticket.leaseId !== permit.leaseId || lease.targetId !== permit.targetId)
      throw new BrowserHostError('scope_mismatch', 'Action is not bound to this run and exact target');
    if (permit.mainGeneration !== this.mainGeneration || permit.runnerGeneration !== lease.ticket.runnerGeneration
      || (this.options.isRunnerGenerationLive && !this.options.isRunnerGenerationLive(lease.ticket.runnerGeneration)))
      throw new BrowserHostError('generation_stale', 'Action belongs to an old runtime generation');
    if (permit.permissionEpoch !== lease.permissionEpoch || permit.navigationEpoch !== lease.navigationEpoch)
      throw new BrowserHostError('epoch_stale', 'Authorization or target navigation changed');
    if (!Number.isFinite(permit.expiresAt) || permit.expiresAt <= this.now())
      throw new BrowserHostError('permit_expired', 'Action authorization expired');
    if (permit.actionDigest !== browserActionDigest(action)) throw new BrowserHostError('action_changed', 'Action digest mismatch');
    if (action.effect === 'write' && permit.allowMutation !== true)
      throw new BrowserHostError('mutation_denied', 'This action needs explicit mutation authorization');
  }
  private async deadline<T>(lease: OwnedLease, promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onClose: (() => void) | undefined;
    const closed = new Promise<never>((_, reject) => {
      onClose = () => reject(new BrowserHostError('action_interrupted', 'Browser target closed; any in-flight effect needs reconciliation', true));
      if (lease.closedSignal.signal.aborted) onClose();
      else lease.closedSignal.signal.addEventListener('abort', onClose, { once: true });
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BrowserHostError('action_timeout', 'Browser action timed out', true)), timeoutMs);
      lease.timers.add(timer);
    });
    try { return await Promise.race([promise, timeout, closed]); }
    finally {
      if (timer) { clearTimeout(timer); lease.timers.delete(timer); }
      if (onClose) lease.closedSignal.signal.removeEventListener('abort', onClose);
    }
  }
  execute(permit: BrowserActionPermit, action: BrowserAction): Promise<unknown> {
    const lease = this.owned(permit.leaseId);
    this.gate(lease, permit, action);
    if (!permit.permitId || lease.consumed.has(permit.permitId))
      throw new BrowserHostError('permit_consumed', 'An action permit may be used only once');
    if (lease.consumed.size >= 1000) throw new BrowserHostError('permit_budget', 'Browser action permit budget exhausted');
    lease.consumed.add(permit.permitId);
    const execute = async (): Promise<unknown> => {
      // Recheck after queueing, immediately before actual dispatch. Revoke never waits for this queue.
      this.gate(lease, permit, action); lease.inFlight = true;
      try {
        const value = await this.deadline(lease, this.perform(lease, permit, action), this.options.actionTimeoutMs ?? 30000);
        if (lease.state !== 'ready' || lease.permissionEpoch !== permit.permissionEpoch
          || (this.options.isRunnerGenerationLive && !this.options.isRunnerGenerationLive(lease.ticket.runnerGeneration)))
          throw new BrowserHostError('action_interrupted', 'Action ended after pause, stop or revocation; reconcile its outcome', true);
        return value;
      } catch (error) {
        if (error instanceof BrowserHostError && error.code === 'action_timeout') {
          lease.state = 'revoked'; lease.permissionEpoch++; this.emit(permit.leaseId, 'revoked', 'action_timeout');
          void this.closeLease(permit.leaseId, 'action_timeout').catch(() => undefined);
        } else if (lease.state !== 'ready' || lease.permissionEpoch !== permit.permissionEpoch
          || (this.options.isRunnerGenerationLive && !this.options.isRunnerGenerationLive(lease.ticket.runnerGeneration))) {
          throw new BrowserHostError('action_interrupted', 'Action failed after its gate closed; reconcile its outcome', true);
        }
        throw error;
      } finally { lease.inFlight = false; }
    };
    const result = lease.queue.then(execute);
    lease.queue = result.catch(() => undefined);
    return result;
  }
  private async perform(lease: OwnedLease, permit: BrowserActionPermit, action: BrowserAction): Promise<unknown> {
    const wc = lease.webContents;
    const command = async (method: string, args: Record<string, unknown> = {}): Promise<any> => {
      this.gate(lease, permit, action); return wc.debugger.sendCommand(method, args);
    };
    if (action.kind === 'navigate') {
      if (!this.urlAllowed(lease, action.url)) throw new BrowserHostError('origin_denied', 'Navigation origin or protocol is not authorized');
      this.gate(lease, permit, action); await wc.loadURL(action.url);
      // Electron 37's hidden WCV does not initialize its native input surface.
      // Warm that surface without activating or visibly displaying the host;
      // preserve this exact WebContents for later native manual takeover.
      if (lease.state !== 'ready' || lease.permissionEpoch !== permit.permissionEpoch)
        throw new BrowserHostError('action_interrupted', 'Navigation ended after pause, stop or revocation; reconcile its outcome', true);
      this.gate(lease, { ...permit, navigationEpoch: lease.navigationEpoch }, action);
      lease.host.setOpacity(0); lease.host.showInactive();
      try {
        const [width, height] = lease.host.getContentSize();
        lease.view.setBounds({ x: 0, y: 0, width: width + 1, height });
        lease.view.setBounds({ x: 0, y: 0, width, height });
        for (let attempt = 0; ; attempt++) {
          if (lease.state !== 'ready' || lease.permissionEpoch !== permit.permissionEpoch)
            throw new BrowserHostError('action_interrupted', 'Rendering initialization was interrupted', true);
          try { await wc.capturePage(undefined, { stayHidden: true, stayAwake: true }); break; }
          catch (error) {
            if (attempt >= 3 || !(error instanceof Error) || error.message !== 'Current display surface not available for capture') throw error;
            await new Promise<void>(resolve => setTimeout(resolve, 50 * 2 ** attempt));
          }
        }
      }
      finally { if (!lease.host.isDestroyed()) { lease.host.hide(); lease.host.setOpacity(1); } }
      return { url: wc.getURL(), navigationEpoch: lease.navigationEpoch };
    }
    if (!this.urlAllowed(lease, wc.getURL())) throw new BrowserHostError('origin_denied', 'Current target origin is not authorized');
    if (action.kind === 'screenshot') {
      const image = await this.captureReadyPage(lease); return { mimeType: 'image/png', base64: image.toPNG().toString('base64'),
        navigationEpoch: lease.navigationEpoch, observedAt: new Date(this.now()).toISOString() };
    }
    if (action.kind === 'read') {
      const max = Math.min(16000, Math.max(1, action.maxChars ?? 8000));
      if (action.selector && (typeof action.selector !== 'string' || action.selector.length > 512))
        throw new BrowserHostError('invalid_selector', 'Selector must be a short CSS selector');
      // Only this reviewed DOM projection is evaluated. No expression/script arrives from the worker.
      const expression = `(() => { const node = ${action.selector ? `document.querySelector(${JSON.stringify(action.selector)})` : 'document.body'};
        return {title: document.title, url: location.href, text: (node?.innerText || '').slice(0, ${max}),
          links: Array.from((node || document).querySelectorAll('a[href]')).slice(0, 100).map(a => ({text: (a.innerText || '').slice(0, 200), url: a.href}))}; })()`;
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false });
      if (result.exceptionDetails) throw new BrowserHostError('dom_read_failed', 'DOM projection failed');
      return result.result?.value;
    }
    if (action.kind !== 'click' && action.kind !== 'type')
      throw new BrowserHostError('operation_denied', 'Raw CDP and arbitrary JavaScript are not supported');
    if (typeof action.selector !== 'string' || !action.selector || action.selector.length > 512)
      throw new BrowserHostError('invalid_selector', 'Selector must be a short CSS selector');
    const doc = await command('DOM.getDocument', { depth: 0 });
    const found = await command('DOM.querySelector', { nodeId: doc.root.nodeId, selector: action.selector });
    if (!found.nodeId) throw new BrowserHostError('element_missing', 'Element is absent on the bound target');
    if (action.kind === 'type') {
      if (typeof action.text !== 'string' || action.text.length > 8192)
        throw new BrowserHostError('invalid_text', 'Input text is too large');
      await command('DOM.focus', { nodeId: found.nodeId });
      if (action.clear) {
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
        await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
      }
      await command('Input.insertText', { text: action.text }); return { typed: true };
    }
    await command('DOM.scrollIntoViewIfNeeded', { nodeId: found.nodeId });
    const model = await command('DOM.getBoxModel', { nodeId: found.nodeId });
    const quad = model.model.content;
    const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4, y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    return { clicked: true };
  }
  private pauseImmediately(lease: OwnedLease): void {
    if (lease.state !== 'ready') return;
    lease.state = 'pausing'; lease.host.hide(); lease.host.setIgnoreMouseEvents(true);
  }
  async requestPause(id: string): Promise<BrowserLeaseSnapshot> {
    const lease = this.owned(id);
    if (lease.state === 'paused') return this.snapshot(id);
    if (lease.state !== 'ready' && lease.state !== 'pausing') throw new BrowserHostError('gate_closed', 'Lease cannot be paused');
    this.pauseImmediately(lease);
    await this.deadline(lease, lease.queue, this.options.actionTimeoutMs ?? 30000);
    if (lease.state !== 'pausing') throw new BrowserHostError('gate_closed', 'Pause was superseded by stop or revocation');
    lease.state = 'paused'; this.emit(id, 'paused'); return this.snapshot(id);
  }
  async takeover(id: string, expected?: Readonly<{ owner: BrowserOwnerFields; scope: BrowserScope;
    targetId: string; mainGeneration: string; runnerGeneration: string; navigationEpoch: number; permissionEpoch: number }>): Promise<BrowserLeaseSnapshot> {
    const paused = await this.requestPause(id);
    const lease = this.owned(id);
    if (lease.state !== 'paused') throw new BrowserHostError('gate_closed', 'Safe pause is required for manual input');
    if (expected && (!sameBrowserOwner(lease.ticket, expected.owner) || !sameBrowserScope(lease.ticket.scope, expected.scope)
      || lease.targetId !== expected.targetId || this.mainGeneration !== expected.mainGeneration
      || lease.ticket.runnerGeneration !== expected.runnerGeneration || lease.navigationEpoch !== expected.navigationEpoch
      || lease.permissionEpoch !== expected.permissionEpoch || !this.urlAllowed(lease, lease.webContents.getURL())
      || this.options.isRunnerGenerationLive?.(expected.runnerGeneration) === false))
      throw new BrowserHostError('epoch_stale', 'Native manual target changed before it became visible');
    lease.host.setIgnoreMouseEvents(false); lease.host.show(); lease.host.focus();
    lease.webContents.focus();
    return { ...paused, visible: true };
  }
  /** Explicit human setup. No run capability or arbitrary script is issued. */
  async openAccountSetup(id: string, origin: string): Promise<BrowserLeaseSnapshot> {
    const lease = this.owned(id);
    if (lease.ticket.purpose !== 'account_setup' || !this.urlAllowed(lease, origin)
      || new URL(origin).origin !== origin || lease.ticket.allowedOrigins.length !== 1)
      throw new BrowserHostError('origin_denied', 'Account setup requires its exact explicit origin');
    if (lease.state !== 'ready') throw new BrowserHostError('gate_closed', 'Setup navigation was superseded');
    await this.deadline(lease, lease.webContents.loadURL(origin), this.options.actionTimeoutMs ?? 30000);
    // An uninitialized Electron 37 native view cannot become visible merely
    // by calling show(). Initialize its surface before enabling manual input.
    const epoch = lease.permissionEpoch;
    lease.host.setOpacity(0); lease.host.showInactive();
    try {
      const [width, height] = lease.host.getContentSize();
      lease.view.setBounds({ x: 0, y: 0, width: width + 1, height }); lease.view.setBounds({ x: 0, y: 0, width, height });
      for (let attempt = 0; ; attempt++) {
        if (lease.state !== 'ready' || lease.permissionEpoch !== epoch) throw new BrowserHostError('gate_closed', 'Account setup was interrupted');
        try { await lease.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }); break; }
        catch (error) {
          if (attempt >= 3 || !(error instanceof Error) || error.message !== 'Current display surface not available for capture') throw error;
          await new Promise<void>(resolve => setTimeout(resolve, 50 * 2 ** attempt));
        }
      }
    } finally { if (!lease.host.isDestroyed()) { lease.host.hide(); lease.host.setOpacity(1); } }
    await this.takeover(id);
    const current = this.owned(id);
    if (current !== lease || current.state !== 'paused' || !current.host.isVisible()
      || new URL(current.webContents.getURL()).origin !== origin)
      throw new BrowserHostError('target_lost', 'Account setup no longer owns its visible target');
    return this.snapshot(id);
  }
  resume(id: string, expectedNavigationEpoch: number, permissionEpoch: number): BrowserLeaseSnapshot {
    const lease = this.owned(id);
    if (lease.ticket.purpose === 'account_setup') throw new BrowserHostError('operation_denied', 'A setup target cannot become a worker target');
    if (lease.state !== 'paused' || lease.navigationEpoch !== expectedNavigationEpoch || lease.permissionEpoch !== permissionEpoch)
      throw new BrowserHostError('epoch_stale', 'Manual target or authorization changed; validate before resuming');
    lease.host.setIgnoreMouseEvents(true); lease.host.hide(); // input disabled before reopening gate
    lease.state = 'ready'; this.emit(id, 'resumed'); return this.snapshot(id);
  }
  private async captureReadyPage(lease: OwnedLease) {
    const hidden = !lease.host.isVisible();
    if (hidden) {
      lease.host.setOpacity(0); lease.host.showInactive();
      const [width, height] = lease.host.getContentSize();
      lease.view.setBounds({ x: 0, y: 0, width: width + 1, height });
      lease.view.setBounds({ x: 0, y: 0, width, height });
    }
    try {
      return await this.deadline(lease,
        lease.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }), 5000);
    } finally {
      // Called on the existing lease queue: manual takeover waits until this
      // cleanup completes, while revoke can still close the target immediately.
      if (hidden && !lease.host.isDestroyed()) { lease.host.hide(); lease.host.setOpacity(1); }
    }
  }
  async preview(id: string): Promise<{ mimeType: string; base64: string; observedAt: string; navigationEpoch: number }> {
    const lease = this.owned(id);
    if (lease.state === 'revoked') throw new BrowserHostError('gate_closed', 'Revoked target is unavailable');
    const navigationEpoch = lease.navigationEpoch, permissionEpoch = lease.permissionEpoch;
    const capture = async () => {
      const initial = this.owned(id);
      if (initial !== lease || initial.state === 'revoked' || initial.navigationEpoch !== navigationEpoch || initial.permissionEpoch !== permissionEpoch)
        throw new BrowserHostError('epoch_stale', 'Browser changed before preview capture');
      const image = await this.captureReadyPage(lease);
      const current = this.owned(id);
      if (current !== lease || current.state === 'revoked' || current.navigationEpoch !== navigationEpoch || current.permissionEpoch !== permissionEpoch)
        throw new BrowserHostError('epoch_stale', 'Browser changed during preview capture');
      return { mimeType: 'image/png', base64: image.toPNG().toString('base64'), observedAt: new Date(this.now()).toISOString(), navigationEpoch };
    };
    const result = lease.queue.then(capture);
    lease.queue = result.catch(() => undefined);
    return result;
  }
  /** Linearization happens synchronously; acknowledgement may await destruction, never dispatch. */
  revoke(id: string, nextPermissionEpoch: number, reason = 'permission_revoked'): Promise<void> {
    const lease = this.owned(id);
    if (!Number.isSafeInteger(nextPermissionEpoch) || nextPermissionEpoch <= lease.permissionEpoch)
      throw new BrowserHostError('epoch_stale', 'Revocation must advance permission epoch');
    lease.permissionEpoch = nextPermissionEpoch; lease.state = 'revoked';
    lease.webContents.stop(); lease.host.hide(); lease.host.setIgnoreMouseEvents(true);
    this.emit(id, 'revoked', reason); return this.closeLease(id, reason);
  }
  cancel(id: string): Promise<void> { const lease = this.owned(id); return this.revoke(id, lease.permissionEpoch + 1, 'cancelled'); }
  /** Exact terminal acknowledgements may confirm cleanup, never create authority. */
  async acknowledgeTerminalClose(id: string): Promise<void> {
    await this.closeLease(id, 'terminal_ack');
    const value = this.snapshot(id);
    if (value.state !== 'closed' || this.quarantinedPartitions.has(value.partitionKey)
      || this.options.isSessionQuarantined?.(session.fromPartition(value.partitionKey)))
      throw new BrowserHostError('cleanup_unconfirmed', 'Terminal target cleanup is not confirmed');
  }
  closeLease(id: string, reason = 'released'): Promise<void> {
    const pending = this.closing.get(id); if (pending) return pending;
    const lease = this.leases.get(id); if (!lease) return Promise.resolve();
    lease.state = 'closing';
    lease.closedSignal.abort();
    const cleanup = (async (): Promise<void> => {
      const wc = lease.webContents;
      if (lease.expiresTimer) clearTimeout(lease.expiresTimer);
      for (const timer of lease.timers) clearTimeout(timer); lease.timers.clear();
      for (const off of lease.listeners.splice(0)) { try { off(); } catch { /* emitter destroyed */ } }
      let settled = false;
      const destroyed = new Promise<void>(resolve => {
        if (wc.isDestroyed()) { settled = true; resolve(); return; }
        const done = (): void => { settled = true; resolve(); };
        wc.once('destroyed', done);
        // Own this listener until destruction or bounded cleanup timeout.
        lease.listeners.push(() => wc.removeListener('destroyed', done));
      });
      try { if (!wc.isDestroyed()) { wc.stop(); if (wc.debugger.isAttached()) wc.debugger.detach(); } } catch { /* renderer lost */ }
      try { if (!lease.host.isDestroyed()) lease.host.contentView.removeChildView(lease.view); } catch { /* native host lost */ }
      try { if (!wc.isDestroyed()) wc.close({ waitForBeforeUnload: false }); } catch { /* native target already closing */ }
      try { if (!lease.host.isDestroyed()) lease.host.destroy(); } catch { /* already gone */ }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([destroyed, new Promise<void>(resolve => { timeout = setTimeout(resolve, this.options.cleanupTimeoutMs ?? 1500); })]);
      if (timeout) clearTimeout(timeout);
      for (const off of lease.listeners.splice(0)) { try { off(); } catch { /* gone */ } }
      let workerCleanupFailure: unknown;
      if (!settled) this.quarantine(lease.session, lease.ticket.partitionKey);
      else {
        try { await this.clearExecutionWorkers(lease.session, lease.ticket.partitionKey); }
        catch (error) { workerCleanupFailure = error; }
      }
      lease.state = 'closed';
      const snapshot = this.snapshot(id); this.tombstones.set(id, snapshot);
      if (this.tombstones.size > 100) this.tombstones.delete(this.tombstones.keys().next().value!);
      this.leases.delete(id); lease.consumed.clear();
      this.emit(id, 'closed', !settled ? `${reason}:target_close_unconfirmed`
        : workerCleanupFailure ? `${reason}:worker_cleanup_unconfirmed` : reason);
      if (!settled) throw new BrowserHostError('cleanup_unconfirmed', 'Target destruction did not acknowledge within cleanup deadline');
      if (workerCleanupFailure) throw workerCleanupFailure;
    })();
    this.closing.set(id, cleanup);
    void cleanup.finally(() => this.closing.delete(id)).catch(() => undefined);
    return cleanup;
  }
  async closeAll(reason = 'app_quit'): Promise<void> {
    this.quitting = true;
    // Close every gate before awaiting any target, including when another action is hung.
    for (const lease of this.leases.values()) { lease.state = 'revoked'; lease.permissionEpoch++; }
    const results = await Promise.allSettled([...this.leases.keys()].map(id => this.closeLease(id, reason)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
}

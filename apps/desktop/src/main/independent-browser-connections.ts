import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { session, webContents, type Session, type WebContents } from 'electron';
import { BrowserHostError, IndependentBrowserHostRegistry, sameBrowserScope } from './independent-browser-host.js';
import type { BrowserHostEvent, BrowserLeaseSnapshot, BrowserLeaseTicket, BrowserScope } from './independent-browser-host.js';
import { computeAgentExecutionPartition } from './agent-execution-partition.js';

type Binding = { scope: BrowserScope; backendProfileName: string; spaceName: string };
type Api = (operation: string, scope: BrowserScope, payload: Record<string, unknown>, profile: string) => Promise<any>;
type Receipt = { scope: BrowserScope; backendProfileName: string; connectionId: string; revision: number; origin: string; cookieDigest: string };
type LiveSetup = { binding: Binding; flowId: string; leaseId: string; target?: WebContents; origin: string; host: IndependentBrowserHostRegistry;
  generation: string; closing: boolean; confirming: boolean; requestId: string };
const key = (scope: BrowserScope) => JSON.stringify([scope.backendProfileId, scope.spaceId, scope.browserProfileId]);
const uuid = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;
function identifier(value: unknown): asserts value is string { if (typeof value !== 'string' || !uuid.test(value)) throw new BrowserHostError('invalid_request', 'Invalid account setup identity'); }
function origin(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x1f]/.test(value)) throw new BrowserHostError('invalid_request', 'Invalid account origin');
  let url: URL; try { url = new URL(value); } catch { throw new BrowserHostError('invalid_request', 'Invalid account origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname))
    throw new BrowserHostError('invalid_request', 'Choose an exact HTTP(S) login origin');
  return url.origin;
}
function fields(payload: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(payload).some(name => !allowed.includes(name))) throw new BrowserHostError('invalid_request', 'Unexpected account setup fields');
}
function cookieMatches(cookie: { domain?: string }, accountOrigin: string): boolean {
  if (!cookie.domain) return true; // unattributed native changes cannot preserve account authority
  const host = new URL(accountOrigin).hostname, domain = cookie.domain.replace(/^\./, '');
  return host === domain || host.endsWith(`.${domain}`);
}

/** Human setup owns targets, never a second runner. Cookie values stay in Main. */
export class IndependentBrowserConnections {
  private readonly live = new Map<string, LiveSetup>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly sensitiveScopes = new Map<string, BrowserScope>();
  private readonly watched = new WeakMap<Session, Map<string, number>>();
  private readonly sessionListeners: (() => void)[] = [];
  private readonly scopesBeingChanged = new Set<string>();
  private persistQueue = Promise.resolve();
  private readonly loaded: Promise<void>;
  constructor(private readonly options: { userDataDir: string; apiRequest: Api;
    runtime: () => { host: IndependentBrowserHostRegistry; generation: string };
    quarantine: (target: Session) => void }) { this.loaded = this.load(); }
  private file(): string { return path.join(this.options.userDataDir, 'independent-browser-account-receipts.json'); }
  private async load(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.file(), 'utf8'));
      if (value.schemaVersion !== 1 || !Array.isArray(value.receipts) || value.receipts.length > 128
        || !Array.isArray(value.sensitiveScopes ?? []) || (value.sensitiveScopes ?? []).length > 256) throw new Error('Unsupported browser account receipt cache');
      for (const scope of value.sensitiveScopes ?? []) {
        if (!scope || ['spaceId', 'backendProfileId', 'browserProfileId'].some(name => typeof scope[name] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(scope[name]))) throw new Error('Invalid account sensitive scope');
        this.sensitiveScopes.set(key(scope), scope);
      }
      for (const row of value.receipts) {
        if (!row || !/^browser_account:[a-f0-9]{32}$/.test(row.connectionId) || !/^[a-f0-9]{64}$/.test(row.cookieDigest)
          || typeof row.backendProfileName !== 'string' || !Number.isSafeInteger(row.revision) || row.revision < 1
          || !row.scope || ['spaceId', 'backendProfileId', 'browserProfileId'].some(name => typeof row.scope[name] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(row.scope[name]))
          || origin(row.origin) !== row.origin) throw new Error('Invalid browser account receipt cache');
        this.receipts.set(row.connectionId, row);
        this.sensitiveScopes.set(key(row.scope), row.scope);
      }
    } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
  }
  private persist(): Promise<void> {
    this.persistQueue = this.persistQueue.then(async () => {
      await mkdir(this.options.userDataDir, { recursive: true });
      const temporary = `${this.file()}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ schemaVersion: 1, receipts: [...this.receipts.values()], sensitiveScopes: [...this.sensitiveScopes.values()] }), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.file());
    });
    return this.persistQueue;
  }
  private watch(target: Session): Map<string, number> {
    const existing = this.watched.get(target); if (existing) return existing;
    const epochs = new Map<string, number>(); this.watched.set(target, epochs);
    const changed = (_event: unknown, cookie: { domain?: string }): void => {
      for (const value of epochs.keys()) if (cookieMatches(cookie, value)) epochs.set(value, (epochs.get(value) ?? 0) + 1);
      for (const receipt of [...this.receipts.values()]) {
        if (session.fromPartition(computeAgentExecutionPartition(receipt.scope)) !== target || !cookieMatches(cookie, receipt.origin)) continue;
        this.invalidate(receipt, 'account_session_changed');
      }
    };
    target.cookies.on('changed', changed); this.sessionListeners.push(() => target.cookies.removeListener('changed', changed));
    return epochs;
  }
  private async digest(target: Session, accountOrigin: string): Promise<string> {
    const cookies = await target.cookies.get({ url: accountOrigin });
    const rows = cookies.map(cookie => [cookie.name, cookie.value, cookie.domain, cookie.path, cookie.secure, cookie.httpOnly, cookie.sameSite, cookie.expirationDate ?? null]);
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  private revokeTargets(scope: BrowserScope, reason: string): Promise<void> {
    let host: IndependentBrowserHostRegistry; try { host = this.options.runtime().host; } catch { return Promise.resolve(); }
    // Every native gate is closed synchronously, before the first backend await.
    const cleanup = host.list().filter(lease => sameBrowserScope(lease.scope, scope)).map(lease => host.revoke(lease.leaseId, lease.permissionEpoch + 1, reason));
    return Promise.all(cleanup).then(() => undefined);
  }
  private invalidate(receipt: Receipt, reason: string): void {
    if (this.receipts.get(receipt.connectionId) !== receipt) return;
    this.receipts.delete(receipt.connectionId);
    void this.revokeTargets(receipt.scope, reason).catch(() => this.options.quarantine(session.fromPartition(computeAgentExecutionPartition(receipt.scope))));
    void this.persist().catch(() => undefined);
    void this.options.apiRequest('browser.connectionInvalidate', receipt.scope,
      { connectionId: receipt.connectionId, expectedRevision: receipt.revision, reasonCode: reason }, receipt.backendProfileName).catch(() => undefined);
  }
  private flow(value: any, binding: Binding): any {
    if (!value || value.schemaVersion !== 1 || !sameBrowserScope(value.scope ?? {}, binding.scope)
      || typeof value.flowId !== 'string' || !uuid.test(value.flowId) || value.connectionId !== `browser_account:${value.flowId}`
      || origin(value.origin) !== value.origin || !Number.isSafeInteger(value.revision) || value.revision < 1)
      throw new BrowserHostError('invalid_response', 'Invalid scoped browser account response');
    return value;
  }
  private assertSetup(setup: LiveSetup): BrowserLeaseSnapshot {
    const runtime = this.options.runtime();
    const lease = setup.host.snapshot(setup.leaseId), target = webContents.fromId(lease.webContentsId);
    if (runtime.host !== setup.host || runtime.generation !== setup.generation || setup.closing
      || lease.purpose !== 'account_setup' || lease.state !== 'paused' || !lease.visible
      || lease.partitionKey !== computeAgentExecutionPartition(setup.binding.scope) || !sameBrowserScope(lease.scope, setup.binding.scope)
      || target !== setup.target || !target || target.isDestroyed() || !setup.host.ownsWebContents(target.id)
      || target.session !== session.fromPartition(lease.partitionKey) || lease.navigationEpoch < 1
      || new URL(target.getURL()).origin !== setup.origin || lease.runnerGeneration !== setup.generation || lease.expiresAt <= Date.now())
      throw new BrowserHostError('browser_login_target_changed', 'The owned login target or its origin changed');
    return lease;
  }
  private proof(setup: LiveSetup): Record<string, unknown> {
    const lease = this.assertSetup(setup);
    return { leaseId: lease.leaseId, targetId: lease.targetId, partitionKey: lease.partitionKey,
      mainGeneration: lease.mainGeneration, runnerGeneration: lease.runnerGeneration, navigationEpoch: lease.navigationEpoch,
      permissionEpoch: lease.permissionEpoch, urlOrigin: new URL(lease.url).origin, observedAt: new Date().toISOString() };
  }
  handlesEvent(event: BrowserHostEvent): boolean {
    if (event.lease.purpose !== 'account_setup') return false;
    if (['closed', 'lost', 'revoked'].includes(event.kind)) {
      const setup = [...this.live.values()].find(value => value.leaseId === event.lease.leaseId);
      if (setup && !setup.closing && !setup.confirming) {
        setup.closing = true; this.live.delete(setup.flowId);
        void this.options.apiRequest('browser.connectionCancel', setup.binding.scope,
          { flowId: setup.flowId, reasonCode: event.reason ?? 'setup_target_lost' }, setup.binding.backendProfileName).catch(() => undefined);
      }
    }
    return true;
  }
  ownsSetupTicket(ticket: BrowserLeaseTicket): boolean {
    if (typeof ticket.runId !== 'string') return false;
    const setup = this.live.get(ticket.runId);
    return Boolean(setup && !setup.closing && setup.leaseId === ticket.leaseId && sameBrowserScope(setup.binding.scope, ticket.scope)
      && setup.generation === ticket.runnerGeneration && ticket.allowedOrigins.length === 1 && ticket.allowedOrigins[0] === setup.origin);
  }
  closeSetupScope(scope: BrowserScope, reason: string): Promise<void> {
    const active = [...this.live.values()].filter(value => sameBrowserScope(value.binding.scope, scope));
    for (const value of active) { value.closing = true; this.live.delete(value.flowId); }
    const cleanup = this.revokeTargets(scope, reason);
    return Promise.all([cleanup, ...active.map(value => this.options.apiRequest('browser.connectionCancel', scope,
      { flowId: value.flowId, reasonCode: reason }, value.binding.backendProfileName))]).then(() => undefined);
  }
  async request(binding: Binding, payload: Record<string, any>, recheck: () => unknown): Promise<any> {
    await this.loaded; recheck();
    const action = payload.action;
    if (action === 'start') {
      fields(payload, ['action', 'origin', 'clientRequestId']); identifier(payload.clientRequestId);
      const accountOrigin = origin(payload.origin), runtime = this.options.runtime();
      const replay = [...this.live.values()].find(value => sameBrowserScope(value.binding.scope, binding.scope) && value.requestId === payload.clientRequestId);
      if (replay) {
        if (replay.origin !== accountOrigin) throw new BrowserHostError('idempotency_conflict', 'The same setup request cannot change its origin');
        this.assertSetup(replay);
        const result = this.flow(await this.options.apiRequest('browser.connectionPoll', binding.scope, { flowId: replay.flowId }, binding.backendProfileName), binding);
        recheck(); this.assertSetup(replay); return result;
      }
      if (this.scopesBeingChanged.has(key(binding.scope)) || runtime.host.list().some(lease => sameBrowserScope(lease.scope, binding.scope)))
        throw new BrowserHostError('resource_busy', 'Finish the active browser task or account setup first');
      this.scopesBeingChanged.add(key(binding.scope));
      let setup: LiveSetup | undefined;
      try {
        const value = this.flow(await this.options.apiRequest('browser.connectionStart', binding.scope,
          { origin: accountOrigin, clientRequestId: payload.clientRequestId, mainGeneration: runtime.host.mainGeneration, runnerGeneration: runtime.generation }, binding.backendProfileName), binding);
        recheck();
        if (value.origin !== accountOrigin) throw new BrowserHostError('invalid_response', 'The persisted setup request changed its origin');
        const ownerChanged = value.mainGeneration !== runtime.host.mainGeneration || value.runnerGeneration !== runtime.generation;
        if (value.setupStatus !== 'starting' || ownerChanged) {
          // A durable request may outlive its native target. Resolve the same request;
          // never replace that target or return the private start authority to the UI.
          const interrupted = ['starting', 'awaiting_user'].includes(value.setupStatus);
          const result = this.flow(await this.options.apiRequest(interrupted ? 'browser.connectionCancel' : 'browser.connectionPoll', binding.scope,
            { flowId: value.flowId, ...(interrupted ? { reasonCode: 'setup_owner_restarted' } : {}) }, binding.backendProfileName), binding);
          recheck();
          if (result.flowId !== value.flowId || result.origin !== accountOrigin
            || ['starting', 'awaiting_user'].includes(result.setupStatus))
            throw new BrowserHostError('invalid_response', 'The persisted setup outcome was not acknowledged');
          return result;
        }
        identifier(value.leaseId);
        if (!Number.isSafeInteger(value.permissionEpoch)
          || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) > Date.now() + 601000)
          throw new BrowserHostError('invalid_response', 'Invalid setup lease authority');
        setup = { binding, flowId: value.flowId, leaseId: value.leaseId, origin: accountOrigin, host: runtime.host, generation: runtime.generation, closing: false, confirming: false, requestId: payload.clientRequestId };
        this.live.set(setup.flowId, setup);
        const targetSession = session.fromPartition(computeAgentExecutionPartition(binding.scope));
        this.watch(targetSession).set(accountOrigin, 0);
        if (this.sensitiveScopes.size >= 256 && !this.sensitiveScopes.has(key(binding.scope))) throw new BrowserHostError('resource_busy', 'Too many account-sensitive Spaces');
        this.sensitiveScopes.set(key(binding.scope), { ...binding.scope }); await this.persist(); recheck();
        await runtime.host.createLease({ leaseId: value.leaseId, runId: value.flowId, scope: binding.scope,
          partitionKey: computeAgentExecutionPartition(binding.scope), runnerGeneration: runtime.generation, permissionEpoch: value.permissionEpoch,
          allowedOrigins: [accountOrigin], expiresAt: Date.parse(value.expiresAt), purpose: 'account_setup', title: `${binding.spaceName} — Account login` });
        recheck();
        const lease = runtime.host.snapshot(value.leaseId); setup.target = webContents.fromId(lease.webContentsId);
        await runtime.host.openAccountSetup(value.leaseId, accountOrigin); recheck();
        const opened = this.flow(await this.options.apiRequest('browser.connectionOpened', binding.scope,
          { flowId: value.flowId, mainProof: this.proof(setup) }, binding.backendProfileName), binding);
        recheck(); this.assertSetup(setup); return opened;
      } catch (error) {
        if (setup) { setup.closing = true; this.live.delete(setup.flowId); await setup.host.closeLease(setup.leaseId, 'setup_start_failed');
          await this.options.apiRequest('browser.connectionCancel', binding.scope, { flowId: setup.flowId, reasonCode: 'setup_start_failed' }, binding.backendProfileName).catch(() => undefined); }
        throw error;
      } finally { this.scopesBeingChanged.delete(key(binding.scope)); }
    }
    if (action === 'logout') {
      fields(payload, ['action', 'connectionId', 'expectedRevision', 'clientRequestId']); identifier(payload.clientRequestId);
      if (typeof payload.connectionId !== 'string' || !/^browser_account:[a-f0-9]{32}$/.test(payload.connectionId)
        || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 1) throw new BrowserHostError('invalid_request', 'Invalid account logout request');
      const receipt = this.receipts.get(payload.connectionId);
      if (!receipt || !sameBrowserScope(receipt.scope, binding.scope) || receipt.backendProfileName !== binding.backendProfileName || receipt.revision !== payload.expectedRevision)
        throw new BrowserHostError('browser_account_rebind_required', 'This account has no current native receipt');
      this.scopesBeingChanged.add(key(binding.scope)); this.receipts.delete(receipt.connectionId);
      const stopped = this.revokeTargets(binding.scope, 'browser_account_logout');
      const otherReceipts = [...this.receipts.values()].filter(row => sameBrowserScope(row.scope, binding.scope));
      for (const other of otherReceipts) this.invalidate(other, 'account_session_changed');
      try {
        await this.persist(); recheck();
        const pending = this.flow(await this.options.apiRequest('browser.connectionBeginLogout', binding.scope,
          { connectionId: receipt.connectionId, expectedRevision: receipt.revision, clientRequestId: payload.clientRequestId }, binding.backendProfileName), binding);
        recheck(); await stopped;
        const target = session.fromPartition(computeAgentExecutionPartition(binding.scope));
        let acknowledged = false;
        try { let timeout: ReturnType<typeof setTimeout> | undefined;
          try { await Promise.race([(async () => {
            await target.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'] });
            await target.cookies.flushStore(); acknowledged = (await target.cookies.get({})).length === 0 && Object.keys(target.serviceWorkers.getAllRunning()).length === 0;
          })(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new BrowserHostError('cleanup_unconfirmed', 'Account logout cleanup did not acknowledge')), 4000); })]); }
          finally { if (timeout) clearTimeout(timeout); }
          if (!acknowledged) this.options.quarantine(target);
        } catch { this.options.quarantine(target); }
        const final = this.flow(await this.options.apiRequest('browser.connectionCompleteLogout', binding.scope,
          { connectionId: receipt.connectionId, expectedRevision: pending.revision, cleanupAcknowledged: acknowledged }, binding.backendProfileName), binding);
        recheck();
        if (acknowledged && final.setupStatus === 'revoked' && final.reasonCode === 'user_logged_out') { this.sensitiveScopes.delete(key(binding.scope)); await this.persist(); recheck(); }
        return final;
      } finally { await stopped.catch(() => undefined); this.scopesBeingChanged.delete(key(binding.scope)); }
    }
    if (!['poll', 'confirm', 'cancel'].includes(action)) throw new BrowserHostError('operation_denied', 'Unsupported account setup action');
    fields(payload, action === 'confirm' ? ['action', 'flowId', 'expectedRevision', 'clientRequestId', 'accountLabel'] : ['action', 'flowId']); identifier(payload.flowId);
    const setup = this.live.get(payload.flowId);
    if (setup && (!sameBrowserScope(setup.binding.scope, binding.scope) || setup.binding.backendProfileName !== binding.backendProfileName)) throw new BrowserHostError('scope_mismatch', 'Account setup belongs to another Space');
    if (action === 'poll') {
      let value = this.flow(await this.options.apiRequest('browser.connectionPoll', binding.scope, { flowId: payload.flowId }, binding.backendProfileName), binding);
      recheck();
      if (!setup && ['starting', 'awaiting_user'].includes(value.setupStatus)) {
        value = this.flow(await this.options.apiRequest('browser.connectionCancel', binding.scope, { flowId: payload.flowId, reasonCode: 'setup_owner_restarted' }, binding.backendProfileName), binding);
        recheck();
      }
      if (setup && !setup.confirming && !['starting', 'awaiting_user'].includes(value.setupStatus)) { setup.closing = true; this.live.delete(setup.flowId); await setup.host.closeLease(setup.leaseId, 'setup_finished'); }
      return value;
    }
    if (action === 'cancel') {
      if (setup) { setup.closing = true; this.live.delete(setup.flowId); }
      const cleanup = setup?.host.closeLease(setup.leaseId, 'user_cancelled');
      try { const value = this.flow(await this.options.apiRequest('browser.connectionCancel', binding.scope, { flowId: payload.flowId }, binding.backendProfileName), binding); recheck(); return value; }
      finally { await cleanup; }
    }
    identifier(payload.clientRequestId);
    if (!setup || setup.confirming || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 1
      || (payload.accountLabel !== undefined && (typeof payload.accountLabel !== 'string' || payload.accountLabel.length > 80 || /[\x00-\x1f]/.test(payload.accountLabel))))
      throw new BrowserHostError('invalid_request', 'Account confirmation requires its live explicit setup');
    setup.confirming = true;
    const target = setup.target!.session, epochs = this.watch(target), epoch = epochs.get(setup.origin) ?? 0;
    let accepted: any;
    try {
      const captured = this.assertSetup(setup), digest = await this.digest(target, setup.origin);
      recheck(); const current = this.assertSetup(setup);
      if (captured.navigationEpoch !== current.navigationEpoch || epoch !== epochs.get(setup.origin)) throw new BrowserHostError('browser_login_target_changed', 'Login changed during confirmation');
      accepted = this.flow(await this.options.apiRequest('browser.connectionConfirm', binding.scope,
        { flowId: setup.flowId, expectedRevision: payload.expectedRevision, clientRequestId: payload.clientRequestId,
          ...(payload.accountLabel === undefined ? {} : { accountLabel: payload.accountLabel }), mainProof: this.proof(setup) }, binding.backendProfileName), binding);
      recheck(); const after = this.assertSetup(setup);
      if (accepted.setupStatus !== 'user_confirmed' || after.navigationEpoch !== captured.navigationEpoch || epoch !== epochs.get(setup.origin)
        || digest !== await this.digest(target, setup.origin)) throw new BrowserHostError('browser_login_target_changed', 'Login changed before confirmation acknowledged');
      recheck(); this.assertSetup(setup);
      const receipt: Receipt = { scope: { ...binding.scope }, backendProfileName: binding.backendProfileName, connectionId: accepted.connectionId,
        revision: accepted.revision, origin: setup.origin, cookieDigest: digest };
      if (this.receipts.size >= 128) throw new BrowserHostError('resource_busy', 'Too many native account receipts');
      for (const previous of [...this.receipts.values()]) if (sameBrowserScope(previous.scope, binding.scope)) this.invalidate(previous, 'account_session_changed');
      this.receipts.set(receipt.connectionId, receipt); await target.cookies.flushStore(); await this.persist(); recheck();
      if (this.receipts.get(receipt.connectionId) !== receipt || epoch !== epochs.get(setup.origin)) throw new BrowserHostError('browser_login_target_changed', 'Account session changed while saving confirmation');
      setup.closing = true; this.live.delete(setup.flowId); await setup.host.closeLease(setup.leaseId, 'account_confirmed'); return accepted;
    } catch (error) {
      if (accepted) {
        const receipt = this.receipts.get(accepted.connectionId);
        if (receipt) this.invalidate(receipt, 'confirmation_interrupted');
        else await this.options.apiRequest('browser.connectionInvalidate', binding.scope,
          { connectionId: accepted.connectionId, expectedRevision: accepted.revision, reasonCode: 'confirmation_interrupted' }, binding.backendProfileName).catch(() => undefined);
      }
      throw error;
    } finally { setup.confirming = false; }
  }
  async validateTicket(binding: Binding, ticket: BrowserLeaseTicket): Promise<void> {
    await this.loaded;
    if (this.scopesBeingChanged.has(key(binding.scope))) throw new BrowserHostError('resource_busy', 'Account session is changing');
    const selected = ticket.accountBindings ?? [];
    if (this.sensitiveScopes.has(key(binding.scope)) && !selected.length)
      throw new BrowserHostError('browser_account_binding_required', 'This own Session requires an explicitly bound account or scoped session logout');
    if (!selected.length) return;
    const target = session.fromPartition(computeAgentExecutionPartition(binding.scope)), epochs = this.watch(target);
    for (const value of selected) {
      const receipt = this.receipts.get(value.connectionId);
      if (!receipt || !sameBrowserScope(receipt.scope, binding.scope) || receipt.backendProfileName !== binding.backendProfileName || receipt.revision !== value.connectionRevision)
        throw new BrowserHostError('browser_account_rebind_required', 'Use an explicitly confirmed account in this agent Session');
      if (!epochs.has(receipt.origin)) epochs.set(receipt.origin, 0);
      const observed = epochs.get(receipt.origin), digest = await this.digest(target, receipt.origin);
      if (this.receipts.get(receipt.connectionId) !== receipt || epochs.get(receipt.origin) !== observed || digest !== receipt.cookieDigest) {
        this.invalidate(receipt, 'account_session_changed'); throw new BrowserHostError('browser_account_rebind_required', 'The confirmed account session changed');
      }
    }
    if (selected.length) {
      const result = await this.options.apiRequest('browser.connectionAuthorize', binding.scope, { accountBindings: selected }, binding.backendProfileName);
      if (!result || result.schemaVersion !== 1 || !sameBrowserScope(result.scope ?? {}, binding.scope) || !Array.isArray(result.accounts) || result.accounts.length !== selected.length)
        throw new BrowserHostError('browser_account_rebind_required', 'Account authority was not acknowledged');
      for (const value of selected) {
        const receipt = this.receipts.get(value.connectionId);
        if (!receipt || receipt.revision !== value.connectionRevision || !result.accounts.some((item: any) => item.connectionId === receipt.connectionId && item.revision === receipt.revision && item.origin === receipt.origin))
          throw new BrowserHostError('browser_account_rebind_required', 'Account authority changed during admission');
      }
    }
  }
  async disconnect(reason: string): Promise<void> {
    const active = [...this.live.values()]; this.live.clear();
    for (const value of active) value.closing = true;
    await Promise.allSettled(active.map(value => this.options.apiRequest('browser.connectionCancel', value.binding.scope,
      { flowId: value.flowId, reasonCode: reason.slice(0, 80) }, value.binding.backendProfileName)));
  }
  async shutdown(): Promise<void> { await this.disconnect('app_quit'); for (const off of this.sessionListeners.splice(0)) off(); await this.persistQueue; }
}

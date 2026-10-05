import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BrowserHostError, IndependentBrowserHostRegistry, sameBrowserScope } from './independent-browser-host.js';
import type { BrowserAction, BrowserActionPermit, BrowserLeaseTicket, BrowserScope } from './independent-browser-host.js';
import { browserOwnerFields, browserOwnerKeys, isNativeBrowserOwner, sameBrowserOwner, validBrowserOwner,
  type BrowserOwnerFields } from './browser-lease-owner.js';

type RunCapability = BrowserOwnerFields & Readonly<{
  version: 1; scope: BrowserScope; runnerGeneration: string; expiresAt: number; nonce: string;
}>;
export type BrowserGatewayOptions = {
  host: IndependentBrowserHostRegistry;
  /** Main/backend secret, not the renderer or model's credential. */
  bootstrapSecret?: string;
  isRunnerGenerationLive: (generation: string) => boolean;
  /** Trusted Main verifies the original binding before choosing execution storage. */
  normalizeTicket?: (ticket: BrowserLeaseTicket) => BrowserLeaseTicket | Promise<BrowserLeaseTicket>;
  /** Native owners require the actual Parent writer, never an ID-only claim. */
  validateNativeOwner?: (owner: BrowserOwnerFields, scope: BrowserScope, runnerGeneration: string) => Promise<void> | void;
  now?: () => number;
};

function constantEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BrowserHostError('invalid_request', 'Expected an object');
  return value as Record<string, any>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new BrowserHostError('invalid_request', 'Unexpected request fields');
}
function scope(value: unknown): BrowserScope {
  const item = record(value); keys(item, ['spaceId', 'backendProfileId', 'browserProfileId']);
  for (const key of ['spaceId', 'backendProfileId', 'browserProfileId'])
    if (typeof item[key] !== 'string' || !item[key] || item[key].length > 128)
      throw new BrowserHostError('invalid_request', 'Invalid scope identity');
  return item as BrowserScope;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function validatePermit(value: unknown): BrowserActionPermit {
  const permit = record(value);
  keys(permit, ['permitId', 'leaseId', 'runId', ...browserOwnerKeys, 'scope', 'targetId', 'mainGeneration', 'runnerGeneration',
    'navigationEpoch', 'permissionEpoch', 'actionDigest', 'expiresAt', 'allowMutation']);
  scope(permit.scope);
  if (!validBrowserOwner(permit as BrowserOwnerFields)) throw new BrowserHostError('invalid_request', 'Invalid action owner');
  for (const key of ['permitId', 'leaseId', 'targetId', 'mainGeneration', 'runnerGeneration', 'actionDigest'])
    if (typeof permit[key] !== 'string' || !permit[key] || permit[key].length > 256)
      throw new BrowserHostError('invalid_request', 'Invalid action permit identity');
  if (typeof permit.allowMutation !== 'boolean' || !Number.isFinite(permit.expiresAt)
    || !Number.isSafeInteger(permit.navigationEpoch) || !Number.isSafeInteger(permit.permissionEpoch)
    || permit.navigationEpoch < 0 || permit.permissionEpoch < 0)
    throw new BrowserHostError('invalid_request', 'Invalid action permit revision or permission');
  return permit as BrowserActionPermit;
}
export function validateBrowserAction(value: unknown): BrowserAction {
  const action = record(value);
  const fields: Record<string, string[]> = {
    navigate: ['kind', 'url', 'effect'], read: ['kind', 'selector', 'maxChars', 'effect'],
    click: ['kind', 'selector', 'effect'], type: ['kind', 'selector', 'text', 'clear', 'effect'],
    screenshot: ['kind', 'effect']
  };
  if (typeof action.kind !== 'string' || !Object.hasOwn(fields, action.kind))
    throw new BrowserHostError('operation_denied', 'Raw CDP, cookies, target listing and arbitrary evaluation are unavailable');
  keys(action, fields[action.kind]);
  if (!['read', 'write'].includes(action.effect) || (['read', 'screenshot'].includes(action.kind) && action.effect !== 'read')
    || (action.kind === 'type' && action.effect !== 'write'))
    throw new BrowserHostError('invalid_request', 'Invalid action effect');
  if (action.kind === 'navigate' && (typeof action.url !== 'string' || action.url.length > 4096))
    throw new BrowserHostError('invalid_request', 'Invalid navigation URL');
  if (['click', 'type'].includes(action.kind) && (typeof action.selector !== 'string' || !action.selector || action.selector.length > 512))
    throw new BrowserHostError('invalid_request', 'Invalid selector');
  if (action.selector !== undefined && (typeof action.selector !== 'string' || action.selector.length > 512))
    throw new BrowserHostError('invalid_request', 'Invalid selector');
  if (action.maxChars !== undefined && (!Number.isSafeInteger(action.maxChars) || action.maxChars < 1 || action.maxChars > 16000))
    throw new BrowserHostError('invalid_request', 'Invalid DOM text limit');
  if (action.kind === 'type' && (typeof action.text !== 'string' || action.text.length > 8192))
    throw new BrowserHostError('invalid_request', 'Invalid input text');
  if (action.clear !== undefined && typeof action.clear !== 'boolean') throw new BrowserHostError('invalid_request', 'Invalid clear flag');
  return action as BrowserAction;
}

/** Private transport only. It never exposes Electron's browser-wide remote-debugging port. */
export class IndependentBrowserGateway {
  readonly bootstrapSecret: string;
  private readonly signingKey = randomBytes(32);
  private readonly sequences = new Map<string, number>();
  private readonly capabilities = new Set<string>();
  private readonly now: () => number;
  private server?: Server;
  private port?: number;
  constructor(private readonly options: BrowserGatewayOptions) {
    this.bootstrapSecret = options.bootstrapSecret ?? randomBytes(32).toString('base64url');
    this.now = options.now ?? Date.now;
  }
  mintCapability(runId: string | null, runScope: BrowserScope, runnerGeneration: string, expiresAt: number,
    nativeOwner?: Omit<BrowserOwnerFields, 'runId'>): string {
    scope(runScope);
    const owner = { runId, ...nativeOwner };
    if (!validBrowserOwner(owner) || !this.options.isRunnerGenerationLive(runnerGeneration) || !Number.isFinite(expiresAt)
      || expiresAt <= this.now() || expiresAt > this.now() + 24 * 60 * 60 * 1000)
      throw new BrowserHostError('generation_stale', 'Cannot issue capability for an expired or disconnected runner');
    const payload: RunCapability = { version: 1, ...browserOwnerFields(owner), scope: { ...runScope }, runnerGeneration, expiresAt,
      nonce: randomBytes(16).toString('base64url') };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${encoded}.${createHmac('sha256', this.signingKey).update(encoded).digest('base64url')}`;
    this.capabilities.add(payload.nonce); return token;
  }
  private capability(raw: string): RunCapability {
    const parts = raw.split('.');
    if (parts.length !== 2 || raw.length > 4096
      || !constantEqual(createHmac('sha256', this.signingKey).update(parts[0]).digest('base64url'), parts[1]))
      throw new BrowserHostError('unauthorized', 'Invalid browser run capability');
    let parsed: RunCapability;
    try { parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
    catch { throw new BrowserHostError('unauthorized', 'Invalid capability payload'); }
    scope(parsed.scope);
    if (parsed.version !== 1 || !validBrowserOwner(parsed) || !this.capabilities.has(parsed.nonce) || parsed.expiresAt <= this.now()
      || !this.options.isRunnerGenerationLive(parsed.runnerGeneration))
      throw new BrowserHostError('generation_stale', 'Browser capability expired or runner disconnected');
    return parsed;
  }
  revokeCapability(token: string): void {
    try { this.capabilities.delete(this.capability(token).nonce); } catch { /* already expired */ }
  }
  /** Only a trusted backend can obtain this proof. A worker capability cannot grant write permission. */
  signActionPermit(permit: BrowserActionPermit): string {
    validatePermit(permit);
    return createHmac('sha256', this.signingKey).update(canonical(permit)).digest('base64url');
  }
  private sequence(runScope: BrowserScope, value: unknown): void {
    const key = JSON.stringify([runScope.backendProfileId, runScope.spaceId, runScope.browserProfileId]);
    const previous = this.sequences.get(key) ?? 0;
    if (!Number.isSafeInteger(value) || (value as number) <= previous)
      throw new BrowserHostError('sequence_stale', 'Scope control sequence must advance monotonically');
    this.sequences.set(key, value as number);
  }
  private verifyLease(cap: RunCapability, leaseId: string): void {
    const lease = this.options.host.snapshot(leaseId);
    if (!sameBrowserOwner(lease, cap) || !sameBrowserScope(lease.scope, cap.scope)
      || lease.runnerGeneration !== cap.runnerGeneration)
      throw new BrowserHostError('scope_mismatch', 'This capability does not own the exact browser lease');
  }
  private async validateOwner(owner: BrowserOwnerFields, runScope: BrowserScope, generation: string): Promise<void> {
    if (!isNativeBrowserOwner(owner)) return;
    if (!this.options.validateNativeOwner) throw new BrowserHostError('unauthorized', 'Native browser Parent authority is unavailable');
    await this.options.validateNativeOwner(browserOwnerFields(owner), runScope, generation);
    if (!this.options.isRunnerGenerationLive(generation)) throw new BrowserHostError('generation_stale', 'Native Parent disconnected during validation');
  }
  async start(): Promise<{ url: string; mainGeneration: string }> {
    if (this.server) throw new Error('Browser gateway already started');
    const server = createServer((req, res) => { void this.handle(req, res); });
    server.requestTimeout = 35000; server.headersTimeout = 5000; server.maxHeadersCount = 32;
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Browser gateway has no loopback address');
    this.port = address.port;
    return { url: `http://127.0.0.1:${address.port}`, mainGeneration: this.options.host.mainGeneration };
  }
  private async body(req: IncomingMessage): Promise<Record<string, any>> {
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) throw new BrowserHostError('request_too_large', 'Browser request exceeds 64 KiB');
      chunks.push(Buffer.from(chunk));
    }
    try { return record(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch (error) { if (error instanceof BrowserHostError) throw error; throw new BrowserHostError('invalid_request', 'Invalid request JSON'); }
  }
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const respond = (status: number, body: unknown): void => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      // A localhost TCP address alone is not authorization. Browser-origin requests are refused even with leaked IDs.
      if (req.method !== 'POST' || req.socket.remoteAddress !== '127.0.0.1'
        || req.headers.host !== `127.0.0.1:${this.port}` || req.headers.origin || req.headers.referer
        || req.headers['sec-fetch-site'] || req.headers['content-type'] !== 'application/json')
        throw new BrowserHostError('unauthorized', 'Only authenticated private loopback clients are accepted');
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ') || auth.length > 4200) throw new BrowserHostError('unauthorized', 'Browser capability required');
      const raw = auth.slice(7);
      const controller = constantEqual(raw, this.bootstrapSecret);
      const cap = controller ? undefined : this.capability(raw);
      const request = await this.body(req);
      if (request.schemaVersion !== 1) throw new BrowserHostError('invalid_request', 'Unsupported browser gateway schema');
      // Auth/generation can change while the body is being received.
      if (cap) this.capability(raw);
      let result: unknown;
      if (req.url === '/v1/leases/create') {
        if (!controller) throw new BrowserHostError('unauthorized', 'Only the trusted backend can issue a lease');
        keys(request, ['schemaVersion', 'controlSequence', 'ticket']);
        const ticket = record(request.ticket) as BrowserLeaseTicket;
        keys(ticket, ['leaseId', 'runId', ...browserOwnerKeys, 'scope', 'partitionKey', 'runnerGeneration', 'permissionEpoch', 'allowedOrigins', 'expiresAt', 'title', 'accountBindings']);
        if (ticket.accountBindings !== undefined && (!Array.isArray(ticket.accountBindings) || ticket.accountBindings.length > 16))
          throw new BrowserHostError('invalid_request', 'Invalid frozen browser account bindings');
        for (const value of ticket.accountBindings ?? []) {
          const binding = record(value); keys(binding, ['bindingId', 'connectionId', 'connectionRevision', 'revision']);
          if (typeof binding.bindingId !== 'string' || !/^[a-f0-9]{32}$/.test(binding.bindingId)
            || typeof binding.connectionId !== 'string' || !/^browser_account:[a-f0-9]{32}$/.test(binding.connectionId)
            || !Number.isSafeInteger(binding.connectionRevision) || binding.connectionRevision < 1
            || !Number.isSafeInteger(binding.revision) || binding.revision < 1)
            throw new BrowserHostError('invalid_request', 'Invalid frozen browser account identity');
        }
        scope(ticket.scope);
        if (!validBrowserOwner(ticket)) throw new BrowserHostError('invalid_request', 'Invalid browser lease owner');
        if (!this.options.isRunnerGenerationLive(ticket.runnerGeneration)) throw new BrowserHostError('generation_stale', 'Runner generation is not live');
        await this.validateOwner(ticket, ticket.scope, ticket.runnerGeneration);
        this.sequence(ticket.scope, request.controlSequence);
        const normalized = this.options.normalizeTicket ? await this.options.normalizeTicket(ticket) : ticket;
        if (!sameBrowserScope(normalized.scope, ticket.scope) || normalized.leaseId !== ticket.leaseId
          || !sameBrowserOwner(normalized, ticket) || normalized.runnerGeneration !== ticket.runnerGeneration
          || !this.options.isRunnerGenerationLive(ticket.runnerGeneration))
          throw new BrowserHostError('generation_stale', 'Ticket normalization changed its owner or runner');
        result = await this.options.host.createLease(normalized);
      } else if (req.url === '/v1/capabilities/create') {
        if (!controller) throw new BrowserHostError('unauthorized', 'Only the backend can issue a run capability');
        keys(request, ['schemaVersion', 'runId', ...browserOwnerKeys, 'scope', 'runnerGeneration', 'expiresAt']);
        if (!validBrowserOwner(request as BrowserOwnerFields)) throw new BrowserHostError('invalid_request', 'Invalid browser capability owner');
        const currentScope = scope(request.scope);
        await this.validateOwner(request as BrowserOwnerFields, currentScope, request.runnerGeneration);
        const { runId: _runId, ...owner } = browserOwnerFields(request as BrowserOwnerFields);
        result = { capability: this.mintCapability(request.runId, currentScope, request.runnerGeneration, request.expiresAt, owner) };
      } else if (req.url === '/v1/permits/create') {
        if (!controller) throw new BrowserHostError('unauthorized', 'Only the trusted authorization broker can sign an action permit');
        keys(request, ['schemaVersion', 'permit']);
        const permit = validatePermit(request.permit);
        await this.validateOwner(permit, permit.scope, permit.runnerGeneration);
        const lease = this.options.host.snapshot(permit.leaseId);
        if (!sameBrowserOwner(lease, permit) || !sameBrowserScope(lease.scope, permit.scope)
          || lease.runnerGeneration !== permit.runnerGeneration || !this.options.isRunnerGenerationLive(permit.runnerGeneration)
          || lease.mainGeneration !== permit.mainGeneration || lease.targetId !== permit.targetId
          || lease.navigationEpoch !== permit.navigationEpoch || lease.permissionEpoch !== permit.permissionEpoch
          || permit.expiresAt <= this.now())
          throw new BrowserHostError('epoch_stale', 'Permit no longer matches the live authorized target');
        result = { authorizationProof: this.signActionPermit(permit) };
      } else if (req.url === '/v1/action') {
        if (!cap) throw new BrowserHostError('unauthorized', 'A run-bound capability is required for actions');
        keys(request, ['schemaVersion', 'controlSequence', 'permit', 'authorizationProof', 'action']);
        const permit = validatePermit(request.permit);
        if (typeof request.authorizationProof !== 'string'
          || !constantEqual(this.signActionPermit(permit), request.authorizationProof))
          throw new BrowserHostError('unauthorized', 'Action permit was not issued by the trusted authorization broker');
        this.verifyLease(cap, permit.leaseId);
        if (!sameBrowserOwner(permit, cap) || !sameBrowserScope(permit.scope, cap.scope) || permit.runnerGeneration !== cap.runnerGeneration)
          throw new BrowserHostError('scope_mismatch', 'Permit differs from the run capability');
        const action = validateBrowserAction(request.action);
        await this.validateOwner(cap, cap.scope, cap.runnerGeneration);
        this.capability(raw); this.verifyLease(cap, permit.leaseId);
        this.sequence(cap.scope, request.controlSequence);
        result = await this.options.host.execute(permit, action);
      } else if (req.url === '/v1/control') {
        keys(request, ['schemaVersion', 'controlSequence', 'leaseId', 'runId', ...browserOwnerKeys, 'scope', 'runnerGeneration',
          'operation', 'navigationEpoch', 'permissionEpoch']);
        const lease = this.options.host.snapshot(request.leaseId);
        const currentScope = scope(request.scope);
        const terminalCleanup = controller && ['stop', 'revoke'].includes(request.operation)
          && ['revoked', 'lost', 'closing', 'closed'].includes(lease.state);
        if (lease.leaseId !== request.leaseId || !sameBrowserOwner(lease, request as BrowserOwnerFields) || !sameBrowserScope(lease.scope, currentScope)
          || lease.mainGeneration !== this.options.host.mainGeneration
          || lease.runnerGeneration !== request.runnerGeneration
          || !terminalCleanup && !this.options.isRunnerGenerationLive(request.runnerGeneration))
          throw new BrowserHostError('scope_mismatch', 'Control does not own the exact lease');
        if (cap) this.verifyLease(cap, request.leaseId);
        // Terminal close remains possible after its actual writer exits.
        if (!['stop', 'revoke'].includes(request.operation))
          await this.validateOwner(lease, currentScope, request.runnerGeneration);
        if (!controller && !['pause', 'stop'].includes(request.operation))
          throw new BrowserHostError('unauthorized', 'Runner cannot impersonate manual takeover or change its permissions');
        this.sequence(currentScope, request.controlSequence);
        if (controller && ['stop', 'revoke'].includes(request.operation) && ['revoked', 'lost', 'closing', 'closed'].includes(lease.state)) {
          await this.options.host.acknowledgeTerminalClose(request.leaseId);
          result = request.operation === 'stop' ? { stopped: true } : { revoked: true };
          respond(200, { schemaVersion: 1, result }); return;
        }
        switch (request.operation) {
          case 'pause': result = await this.options.host.requestPause(request.leaseId); break;
          case 'takeover': result = await this.options.host.takeover(request.leaseId); break;
          case 'resume': result = this.options.host.resume(request.leaseId, request.navigationEpoch, request.permissionEpoch); break;
          case 'stop': await this.options.host.cancel(request.leaseId); result = { stopped: true }; break;
          case 'revoke': await this.options.host.revoke(request.leaseId, request.permissionEpoch); result = { revoked: true }; break;
          default: throw new BrowserHostError('operation_denied', 'Unsupported browser control');
        }
      } else if (req.url === '/v1/snapshot') {
        keys(request, ['schemaVersion', 'leaseId']);
        if (!cap) throw new BrowserHostError('unauthorized', 'Snapshot requires its run capability');
        await this.validateOwner(cap, cap.scope, cap.runnerGeneration);
        this.verifyLease(cap, request.leaseId); result = this.options.host.snapshot(request.leaseId);
      } else throw new BrowserHostError('operation_denied', 'Unknown browser gateway operation');
      respond(200, { schemaVersion: 1, result });
    } catch (error) {
      const hostError = error instanceof BrowserHostError ? error : new BrowserHostError('browser_error', 'Browser operation failed');
      const status = hostError.code === 'unauthorized' ? 401 : hostError.code === 'invalid_request' ? 400
        : ['scope_mismatch', 'operation_denied', 'origin_denied', 'mutation_denied'].includes(hostError.code) ? 403 : 409;
      respond(status, { schemaVersion: 1, error: { code: hostError.code, message: hostError.message, inFlight: hostError.inFlight } });
    }
  }
  async stop(): Promise<void> {
    this.capabilities.clear(); this.sequences.clear();
    const server = this.server; this.server = undefined; this.port = undefined;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

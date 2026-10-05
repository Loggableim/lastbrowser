import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ BaseWindow: class {}, WebContentsView: class {}, session: {} }));
import { IndependentBrowserGateway, validateBrowserAction } from '../src/main/independent-browser-gateway.js';
import { browserActionDigest, type BrowserActionPermit, type IndependentBrowserHostRegistry } from '../src/main/independent-browser-host.js';
import { computeAgentExecutionPartition } from '../src/main/agent-execution-partition.js';

const scope = { spaceId: 'space-a', backendProfileId: 'profile-a', browserProfileId: 'browser-a' };
const snapshot = { leaseId: 'lease-a', runId: 'run-a', scope, partitionKey: 'persist:a', targetId: 'target-a',
  webContentsId: 42, mainGeneration: 'main-one', runnerGeneration: 'runner-one', navigationEpoch: 3,
  permissionEpoch: 2, state: 'ready', url: 'https://allowed.test', observedAt: new Date().toISOString(),
  expiresAt: Date.now() + 60000, visible: false };
const action = { kind: 'read', effect: 'read' } as const;
const authorization = (): BrowserActionPermit => ({ permitId: 'once', leaseId: snapshot.leaseId, runId: snapshot.runId,
  scope, targetId: snapshot.targetId, mainGeneration: snapshot.mainGeneration, runnerGeneration: snapshot.runnerGeneration,
  navigationEpoch: 3, permissionEpoch: 2, actionDigest: browserActionDigest(action),
  expiresAt: Date.now() + 10000, allowMutation: false });
let gateway: IndependentBrowserGateway, url: string, token: string, live: boolean;
let host: any;
beforeEach(async () => {
  live = true;
  host = { mainGeneration: 'main-one', snapshot: vi.fn(() => snapshot), execute: vi.fn(async () => ({ text: 'scoped result' })),
    createLease: vi.fn(async () => snapshot), requestPause: vi.fn(async () => snapshot), cancel: vi.fn(async () => {}),
    revoke: vi.fn(async () => {}), takeover: vi.fn(async () => snapshot), resume: vi.fn(() => snapshot) };
  gateway = new IndependentBrowserGateway({ host: host as IndependentBrowserHostRegistry, isRunnerGenerationLive: g => live && g === 'runner-one' });
  ({ url } = await gateway.start()); token = gateway.mintCapability('run-a', scope, 'runner-one', Date.now() + 60000);
});
afterEach(async () => { await gateway.stop(); });
async function post(route: string, body: unknown, auth = token, headers: Record<string, string> = {}) {
  const response = await fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}`, ...headers }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
async function request(sequence = 1, permit = authorization(), selectedAction: any = action) {
  return { schemaVersion: 1, controlSequence: sequence, permit, action: selectedAction, authorizationProof: gateway.signActionPermit(permit) };
}

describe('private browser gateway authorization', () => {
  it('acknowledges only exact trusted terminal stop/revoke and never bypasses unconfirmed native cleanup', async () => {
    host.snapshot.mockReturnValue({ ...snapshot, state: 'closed' });
    host.acknowledgeTerminalClose = vi.fn(async () => {});
    const control = { schemaVersion: 1, controlSequence: 1, leaseId: snapshot.leaseId, runId: snapshot.runId, scope,
      runnerGeneration: snapshot.runnerGeneration, operation: 'revoke', permissionEpoch: 5 };
    expect((await post('/v1/control', control, gateway.bootstrapSecret)).body.result).toEqual({ revoked: true });
    expect(host.acknowledgeTerminalClose).toHaveBeenCalledWith(snapshot.leaseId); expect(host.revoke).not.toHaveBeenCalled();
    expect((await post('/v1/control', { ...control, controlSequence: 2, runId: 'foreign' }, gateway.bootstrapSecret)).status).toBe(403);
    expect((await post('/v1/control', { ...control, controlSequence: 2 }, token)).status).toBe(401);
    host.acknowledgeTerminalClose.mockRejectedValue(new Error('Native cleanup not confirmed'));
    expect((await post('/v1/control', { ...control, controlSequence: 2 }, gateway.bootstrapSecret)).status).toBe(409);
    expect(host.acknowledgeTerminalClose).toHaveBeenCalledTimes(2);
  });
  it('rejects setup purpose and incomplete or invented browser account binding authority at the gateway', async () => {
    const ticket = { leaseId: 'new-lease', runId: 'run-a', scope, partitionKey: 'persist:original-profile', runnerGeneration: 'runner-one',
      permissionEpoch: 2, allowedOrigins: ['https://allowed.test'], expiresAt: Date.now() + 60000 };
    for (const extra of [{ purpose: 'account_setup' }, { accountBindings: 'invented' },
      { accountBindings: [{ bindingId: 'a'.repeat(32), connectionId: 'browser_account:' + 'b'.repeat(32), connectionRevision: 1, revision: 1, mainProof: {} }] },
      { accountBindings: [{ connectionId: 'browser_account:' + 'b'.repeat(32), connectionRevision: 1, revision: 1 }] }])
      expect((await post('/v1/leases/create', { schemaVersion: 1, controlSequence: 1, ticket: { ...ticket, ...extra } }, gateway.bootstrapSecret)).status).toBe(400);
    expect(host.createLease).not.toHaveBeenCalled();
  });
  it('normalizes only a controller-authenticated exact original profile binding into execution storage', async () => {
    await gateway.stop();
    const normalizeTicket = vi.fn(ticket => {
      if (ticket.partitionKey !== 'persist:original-profile') throw new Error('wrong source binding');
      return { ...ticket, partitionKey: computeAgentExecutionPartition(ticket.scope) };
    });
    gateway = new IndependentBrowserGateway({ host, isRunnerGenerationLive: g => live && g === 'runner-one', normalizeTicket });
    ({ url } = await gateway.start());
    token = gateway.mintCapability('run-a', scope, 'runner-one', Date.now() + 60000);
    const ticket = { leaseId: 'new-lease', runId: 'run-a', scope, partitionKey: 'persist:original-profile', runnerGeneration: 'runner-one',
      permissionEpoch: 2, allowedOrigins: ['https://allowed.test'], expiresAt: Date.now() + 60000 };
    expect((await post('/v1/leases/create', { schemaVersion: 1, controlSequence: 1, ticket })).status).toBe(401);
    expect(normalizeTicket).not.toHaveBeenCalled();
    expect((await post('/v1/leases/create', { schemaVersion: 1, controlSequence: 1, ticket }, gateway.bootstrapSecret)).status).toBe(200);
    expect(host.createLease).toHaveBeenCalledWith({ ...ticket, partitionKey: computeAgentExecutionPartition(scope) });
    host.createLease.mockClear();
    expect((await post('/v1/leases/create', { schemaVersion: 1, controlSequence: 2,
      ticket: { ...ticket, partitionKey: computeAgentExecutionPartition(scope) } }, gateway.bootstrapSecret)).status).toBe(409);
    expect(host.createLease).not.toHaveBeenCalled();
  });
  it('binds actual private loopback transport to one run and exact lease', async () => {
    const response = await post('/v1/action', await request()); expect(response.status).toBe(200);
    expect(response.body.result.text).toBe('scoped result'); expect(host.execute).toHaveBeenCalledTimes(1);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
  it('refuses unauthenticated and browser-origin requests even with a valid capability', async () => {
    for (const headers of [{ Origin: 'https://attacker.test' }, { Referer: 'https://attacker.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      expect((await post('/v1/action', await request(), token, headers)).status).toBe(401);
    }
    expect((await post('/v1/action', await request(), 'wrong')).status).toBe(401);
    expect(host.execute).not.toHaveBeenCalled();
  });
  it('does not accept bootstrap authority as a worker action credential', async () => {
    expect((await post('/v1/action', await request(), gateway.bootstrapSecret)).status).toBe(401);
  });
  it('signs permits only for controller and refuses worker-created or altered permits', async () => {
    const permit = authorization();
    expect((await post('/v1/permits/create', { schemaVersion: 1, permit })).status).toBe(401);
    const issued = await post('/v1/permits/create', { schemaVersion: 1, permit }, gateway.bootstrapSecret);
    expect(issued.status).toBe(200);
    const forged = { ...(await request()), permit: { ...permit, allowMutation: true }, authorizationProof: issued.body.result.authorizationProof };
    expect((await post('/v1/action', forged)).status).toBe(401); expect(host.execute).not.toHaveBeenCalled();
    const missing = { ...(await request()), authorizationProof: '' }; expect((await post('/v1/action', missing)).status).toBe(401);
  });
  it.each(['spaceId', 'backendProfileId', 'browserProfileId'])('rejects a forged %s across permit and capability', async field => {
    const permit = { ...authorization(), scope: { ...scope, [field]: 'other' } };
    expect((await post('/v1/action', await request(1, permit))).status).toBe(403); expect(host.execute).not.toHaveBeenCalled();
  });
  it('rejects altered run/runner and foreign lease even with a correctly signed permit', async () => {
    const permit = { ...authorization(), runId: 'other-run' };
    expect((await post('/v1/action', await request(1, permit))).status).toBe(403);
    host.snapshot.mockReturnValue({ ...snapshot, targetId: 'foreign', runId: 'other' });
    expect((await post('/v1/action', await request())).status).toBe(403); expect(host.execute).not.toHaveBeenCalled();
  });
  it('rejects expired/disconnected and revoked capabilities before tool dispatch', async () => {
    live = false; expect((await post('/v1/action', await request())).body.error.code).toBe('generation_stale');
    live = true; gateway.revokeCapability(token);
    expect((await post('/v1/action', await request())).body.error.code).toBe('generation_stale'); expect(host.execute).not.toHaveBeenCalled();
  });
  it('orders control and action messages monotonically per scope', async () => {
    expect((await post('/v1/action', await request(2))).status).toBe(200);
    const second = await post('/v1/action', await request(1)); expect(second.body.error.code).toBe('sequence_stale');
    expect(host.execute).toHaveBeenCalledTimes(1);
    const control = { schemaVersion: 1, controlSequence: 3, leaseId: 'lease-a', runId: 'run-a', scope, runnerGeneration: 'runner-one', operation: 'revoke', permissionEpoch: 3 };
    expect((await post('/v1/control', control, gateway.bootstrapSecret)).status).toBe(200);
    expect((await post('/v1/action', await request(3))).body.error.code).toBe('sequence_stale');
  });
  it('lets a runner stop/pause itself but never impersonate user takeover or extend rights', async () => {
    const control = { schemaVersion: 1, controlSequence: 1, leaseId: 'lease-a', runId: 'run-a', scope, runnerGeneration: 'runner-one', operation: 'takeover' };
    expect((await post('/v1/control', control)).status).toBe(401); expect(host.takeover).not.toHaveBeenCalled();
    expect((await post('/v1/control', { ...control, operation: 'pause' })).status).toBe(200);
    expect(host.requestPause).toHaveBeenCalledTimes(1);
  });
  it.each([
    { kind: 'Runtime.evaluate', expression: 'arbitrary()', effect: 'read' },
    { kind: 'Target.getTargets', effect: 'read' }, { kind: 'cookies', effect: 'read' },
    { kind: 'read', effect: 'read', method: 'Runtime.evaluate', expression: 'arbitrary()' },
    { kind: '__proto__', effect: 'read' }
  ])('rejects raw CDP/JS/target/cookie operation $kind', async selected => {
    const response = await post('/v1/action', await request(1, authorization(), selected));
    expect([400, 403]).toContain(response.status); expect(host.execute).not.toHaveBeenCalled();
  });
  it('uses strict schemas rather than truthy strings for mutation permission', async () => {
    const body = await request(); body.permit = { ...body.permit, allowMutation: 'false' as any };
    const response = await post('/v1/action', body); expect(response.status).toBe(400);
    expect(() => validateBrowserAction({ kind: 'type', selector: '#x', text: 'y', effect: 'read' })).toThrow();
    expect(() => validateBrowserAction({ kind: 'read', maxChars: 1e9, effect: 'read' })).toThrow();
  });
  it('rejects stale target/epoch before signing a broker permit', async () => {
    const permit = { ...authorization(), navigationEpoch: 1 };
    const response = await post('/v1/permits/create', { schemaVersion: 1, permit }, gateway.bootstrapSecret);
    expect(response.body.error.code).toBe('epoch_stale');
  });
});

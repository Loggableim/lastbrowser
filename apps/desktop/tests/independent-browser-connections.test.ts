import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
const fake = vi.hoisted(() => ({ sessions: new Map<string, any>(), guests: new Map<number, any>() }));
vi.mock('electron', () => ({ session: { fromPartition: (key: string) => fake.sessions.get(key) },
  webContents: { fromId: (id: number) => fake.guests.get(id) }, BaseWindow: class {}, WebContentsView: class {} }));
import { IndependentBrowserConnections } from '../src/main/independent-browser-connections.js';
import { computeAgentExecutionPartition } from '../src/main/agent-execution-partition.js';

const scope = { spaceId: '1'.repeat(32), backendProfileId: '2'.repeat(32), browserProfileId: 'browser-a' };
const second = { ...scope, spaceId: '3'.repeat(32) };
const binding = { scope, backendProfileName: 'profile-a', spaceName: 'A' };
const accountOrigin = 'https://controlled.invalid';
const flowId = '4'.repeat(32), leaseId = '5'.repeat(32), clientRequestId = '6'.repeat(32), connectionId = 'browser_account:' + flowId;
let directory: string, broker: IndependentBrowserConnections, api: ReturnType<typeof vi.fn>, host: any, target: any, cookies: any, current: any, values: any[];
beforeEach(async () => {
  fake.sessions.clear(); fake.guests.clear(); directory = await mkdtemp(path.join(tmpdir(), 'lastbrowser-native-account-test-'));
  values = [];
  cookies = new EventEmitter(); cookies.get = vi.fn(async () => [...values]); cookies.flushStore = vi.fn(async () => {});
  target = { cookies, clearStorageData: vi.fn(async () => { values = []; }), serviceWorkers: { getAllRunning: () => ({}) } };
  fake.sessions.set(computeAgentExecutionPartition(scope), target);
  current = undefined;
  const guest = { id: 17, session: target, isDestroyed: () => false, getURL: () => current.url };
  fake.guests.set(17, guest);
  host = { mainGeneration: 'main-owned', list: () => current ? [current] : [], ownsWebContents: (id: number) => Boolean(current && id === 17),
    createLease: vi.fn(async (ticket: any) => { current = { ...ticket, webContentsId: 17, targetId: 'own-target', mainGeneration: 'main-owned',
      navigationEpoch: 0, url: 'about:blank', state: 'ready', visible: false, partitionKind: 'dedicated_agent', accountSource: 'explicit_agent_login' }; return current; }),
    openAccountSetup: vi.fn(async () => { current = { ...current, state: 'paused', visible: true, navigationEpoch: 1, url: accountOrigin + '/' }; return current; }),
    snapshot: () => current,
    closeLease: vi.fn(async () => { current = undefined; }), revoke: vi.fn((id: string) => { current = { ...current, state: 'revoked' }; return Promise.resolve(); }) };
  api = vi.fn(async (operation: string, _scope: any, payload: any) => {
    const base = { schemaVersion: 1, scope, flowId, connectionId, origin: accountOrigin, permissionRevision: 0, permissionEpoch: 0,
      revision: 2, setupStatus: 'awaiting_user', expiresAt: new Date(Date.now() + 600000).toISOString(), healthStatus: 'unknown', authenticationStatus: 'unknown' };
    if (operation === 'browser.connectionStart') return { ...base, revision: 1, setupStatus: 'starting', leaseId, mainGeneration: 'main-owned', runnerGeneration: 'runner-owned' };
    if (operation === 'browser.connectionConfirm') return { ...base, revision: 3, setupStatus: 'user_confirmed', authenticationStatus: 'user_confirmed' };
    if (operation === 'browser.connectionBeginLogout') return { ...base, revision: 4, setupStatus: 'revoking' };
    if (operation === 'browser.connectionCompleteLogout') return { ...base, revision: 5, setupStatus: 'revoked', reasonCode: payload.cleanupAcknowledged ? 'user_logged_out' : 'cleanup_unconfirmed' };
    if (operation === 'browser.connectionAuthorize') return { schemaVersion: 1, scope, accounts: [{ connectionId, revision: 3, origin: accountOrigin }] };
    return base;
  });
  broker = new IndependentBrowserConnections({ userDataDir: directory, apiRequest: api, runtime: () => ({ host, generation: 'runner-owned' }), quarantine: vi.fn() });
});
afterEach(async () => { await broker.shutdown(); expect(cookies.listenerCount('changed')).toBe(0);
  expect(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)).toBe(true); await rm(directory, { recursive: true, force: true }); });
const start = () => broker.request(binding, { action: 'start', origin: accountOrigin, clientRequestId }, () => {});
const confirm = () => broker.request(binding, { action: 'confirm', flowId, expectedRevision: 2, clientRequestId }, () => {});
const ticket = (accountBindings: any[] = []) => ({ leaseId: 'work-owned', runId: 'work-owned', scope, partitionKey: computeAgentExecutionPartition(scope),
  runnerGeneration: 'runner-owned', permissionEpoch: 0, allowedOrigins: [accountOrigin], expiresAt: Date.now() + 60000, accountBindings });
const captured = [{ bindingId: '7'.repeat(32), connectionId, connectionRevision: 3, revision: 1 }];

describe('Main-owned browser account setup', () => {
  it('uses exactly the own execution Session and returns no cookies or native proof', async () => {
    const result = await start(); expect(result.setupStatus).toBe('awaiting_user');
    expect(host.createLease).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'account_setup', partitionKey: computeAgentExecutionPartition(scope), allowedOrigins: [accountOrigin] }));
    expect(api).not.toHaveBeenCalledWith('permissions', expect.anything(), expect.anything(), expect.anything());
    expect(JSON.stringify(result)).not.toContain('cookieDigest');
    expect(broker.ownsSetupTicket(current)).toBe(true);
  });
  it('replays a live human setup request without opening a second native target', async () => {
    await start(); await start(); expect(host.createLease).toHaveBeenCalledTimes(1);
    await expect(broker.request(binding, { action: 'start', origin: 'https://other.invalid', clientRequestId }, () => {})).rejects.toThrow(/same setup request/);
  });
  it('resolves the same persisted request after Main restart without replacing its old target', async () => {
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => {
      const result = await normal(...args);
      if (args[0] === 'browser.connectionStart') return { ...result, setupStatus: 'awaiting_user', mainGeneration: 'previous-main', mainProof: { targetId: 'previous-target' } };
      if (args[0] === 'browser.connectionCancel') return { ...result, revision: 3, setupStatus: 'interrupted', reasonCode: 'setup_owner_restarted' };
      return result;
    });
    const result = await start();
    expect(result).toMatchObject({ flowId, setupStatus: 'interrupted', reasonCode: 'setup_owner_restarted' });
    expect(api).toHaveBeenCalledWith('browser.connectionStart', scope, expect.objectContaining({ clientRequestId }), 'profile-a');
    expect(api).toHaveBeenCalledWith('browser.connectionCancel', scope, { flowId, reasonCode: 'setup_owner_restarted' }, 'profile-a');
    expect(host.createLease).not.toHaveBeenCalled(); expect(host.openAccountSetup).not.toHaveBeenCalled();
    for (const name of ['leaseId', 'mainProof', 'mainGeneration', 'runnerGeneration']) expect(result).not.toHaveProperty(name);
  });
  it('returns a public terminal outcome for a persisted completed request without minting account authority', async () => {
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => {
      const result = await normal(...args);
      if (args[0] === 'browser.connectionStart') return { ...result, setupStatus: 'user_confirmed', mainProof: { targetId: 'previous-target' } };
      if (args[0] === 'browser.connectionPoll') return { ...result, revision: 3, setupStatus: 'user_confirmed', authenticationStatus: 'user_confirmed' };
      return result;
    });
    const result = await start(); expect(result.setupStatus).toBe('user_confirmed');
    expect(host.createLease).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalledWith('browser.connectionCancel', expect.anything(), expect.anything(), expect.anything());
    expect(result).not.toHaveProperty('mainProof'); expect(result).not.toHaveProperty('leaseId');
    await expect(broker.validateTicket(binding, ticket(captured))).rejects.toThrow(/confirmed account/);
  });
  it('adopts a persisted starting request with the current owner only once after an unknown HTTP outcome', async () => {
    const normal = api.getMockImplementation()!; let first = true;
    api.mockImplementation(async (...args) => {
      if (args[0] === 'browser.connectionStart' && first) { first = false; throw new Error('Controlled acknowledgement lost'); }
      return normal(...args);
    });
    await expect(start()).rejects.toThrow(/acknowledgement lost/);
    expect(host.createLease).not.toHaveBeenCalled();
    expect((await start()).setupStatus).toBe('awaiting_user');
    expect((await start()).setupStatus).toBe('awaiting_user');
    expect(host.createLease).toHaveBeenCalledTimes(1);
    expect(api.mock.calls.filter(args => args[0] === 'browser.connectionStart').map(args => args[2].clientRequestId)).toEqual([clientRequestId, clientRequestId]);
  });
  it('does not let concurrent polling destroy a target while native confirmation is completing', async () => {
    await start(); const normal = api.getMockImplementation()!; let release!: () => void;
    api.mockImplementation(async (...args) => {
      if (args[0] === 'browser.connectionConfirm') await new Promise<void>(resolve => { release = resolve; });
      if (args[0] === 'browser.connectionPoll') return { ...(await normal('browser.connectionConfirm', scope, {}, 'profile-a')) };
      return normal(...args);
    });
    const confirming = confirm(); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect((await broker.request(binding, { action: 'poll', flowId }, () => {})).setupStatus).toBe('user_confirmed');
    expect(host.closeLease).not.toHaveBeenCalled(); release(); expect((await confirming).setupStatus).toBe('user_confirmed');
    expect(host.closeLease).toHaveBeenCalledTimes(1);
  });
  it('rejects renderer credentials, partitions, authority and target choices before backend calls', async () => {
    for (const extra of [{ partitionKey: 'persist:user' }, { cookies: [] }, { mainProof: {} }, { targetId: 'foreign' }, { actor: 'human' }])
      await expect(broker.request(binding, { action: 'start', origin: accountOrigin, clientRequestId, ...extra }, () => {})).rejects.toThrow(/Unexpected/);
    expect(api).not.toHaveBeenCalled();
    await expect(broker.request(binding, { action: 'start', origin: 'https://user:pass@controlled.invalid', clientRequestId }, () => {})).rejects.toThrow();
  });
  it('requires a current explicit account binding and invalidates before asynchronous cookie-change work', async () => {
    await start(); values = [{ name: 'controlled', value: 'local-human-fixture', domain: 'controlled.invalid', path: '/', httpOnly: true }];
    await confirm();
    await expect(broker.validateTicket(binding, ticket())).rejects.toThrow(/explicitly bound/);
    await expect(broker.validateTicket(binding, ticket(captured))).resolves.toBeUndefined();
    current = { ...ticket(captured), purpose: 'work', webContentsId: 17, state: 'ready' };
    cookies.emit('changed', {}, { domain: 'controlled.invalid' }, 'explicit', false);
    expect(current.state).toBe('revoked');
    await expect(broker.validateTicket(binding, ticket(captured))).rejects.toThrow(/confirmed account/);
    expect(api).toHaveBeenCalledWith('browser.connectionInvalidate', scope, expect.objectContaining({ reasonCode: 'account_session_changed' }), 'profile-a');
  });
  it('rejects target navigation or cookie change across the confirmation await', async () => {
    await start();
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { const value = await normal(...args); if (args[0] === 'browser.connectionConfirm') current = { ...current, navigationEpoch: 2 }; return value; });
    await expect(confirm()).rejects.toThrow(/changed/);
    await expect(broker.validateTicket(binding, ticket(captured))).rejects.toThrow(/confirmed account/);
    expect(api).toHaveBeenCalledWith('browser.connectionInvalidate', scope, expect.objectContaining({ reasonCode: 'confirmation_interrupted' }), 'profile-a');
  });
  it('refuses confirmation from a foreign Scope and stale trusted shell', async () => {
    await start(); api.mockClear();
    await expect(broker.request({ ...binding, scope: second }, { action: 'confirm', flowId, expectedRevision: 2, clientRequestId }, () => {})).rejects.toThrow(/another Space/);
    expect(api).not.toHaveBeenCalled();
    await expect(broker.request(binding, { action: 'confirm', flowId, expectedRevision: 2, clientRequestId }, () => { throw new Error('Shell reloaded'); })).rejects.toThrow(/Shell/);
  });
  it('keeps cancelled login sessions sensitive, rather than silently authorizing anonymous work', async () => {
    await start(); await broker.request(binding, { action: 'cancel', flowId }, () => {});
    expect(host.closeLease).toHaveBeenCalled();
    await expect(broker.validateTicket(binding, ticket())).rejects.toThrow(/explicitly bound/);
  });
  it('closes work authority before logout transport and clears only this native Session', async () => {
    await start(); await confirm(); current = { ...ticket(captured), purpose: 'work', webContentsId: 17, state: 'ready' };
    let unblock!: () => void;
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { if (args[0] === 'browser.connectionBeginLogout') await new Promise<void>(resolve => { unblock = resolve; }); return normal(...args); });
    const pending = broker.request(binding, { action: 'logout', connectionId, expectedRevision: 3, clientRequestId }, () => {});
    await vi.waitFor(() => expect(unblock).toBeTypeOf('function'));
    expect(current.state).toBe('revoked'); await expect(broker.validateTicket(binding, ticket(captured))).rejects.toThrow();
    unblock(); expect((await pending).setupStatus).toBe('revoked');
    expect(target.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'] });
    await expect(broker.validateTicket(binding, ticket())).resolves.toBeUndefined();
  });
  it('persists only opaque receipt metadata and detects changed native state after restart', async () => {
    await start(); values = [{ name: 'controlled', value: 'human-only-not-in-cache', domain: 'controlled.invalid', path: '/' }]; await confirm();
    const file = await readFile(path.join(directory, 'independent-browser-account-receipts.json'), 'utf8');
    expect(file).not.toContain('human-only-not-in-cache'); expect(JSON.parse(file).receipts[0].cookieDigest).toMatch(/^[a-f0-9]{64}$/);
    await broker.shutdown(); values = [];
    broker = new IndependentBrowserConnections({ userDataDir: directory, apiRequest: api, runtime: () => ({ host, generation: 'runner-owned' }), quarantine: vi.fn() });
    await expect(broker.validateTicket(binding, ticket(captured))).rejects.toThrow(/session changed/);
  });
});

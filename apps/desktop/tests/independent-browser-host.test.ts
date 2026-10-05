import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const fake = vi.hoisted(() => ({ windows: [] as any[], contents: [] as any[], sessions: new Map<string, any>(), attachFailure: false }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    destroyed = false; visible = false; ignoresMouse = true; contentView = { addChildView: vi.fn(), removeChildView: vi.fn() };
    constructor(public options: any) { super(); fake.windows.push(this); }
    getContentSize() { return [1100, 760]; } isDestroyed() { return this.destroyed; } isVisible() { return this.visible; }
    setIgnoreMouseEvents(value: boolean) { this.ignoresMouse = value; } show() { this.visible = true; } hide() { this.visible = false; }
    showInactive() { this.visible = true; } setOpacity = vi.fn();
    focus() {} destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('closed'); } }
  }
  class Contents extends EventEmitter {
    id = fake.contents.length + 1; destroyed = false; url = 'https://allowed.test/page'; attached = false;
    debugger = Object.assign(new EventEmitter(), {
      attach: vi.fn(() => { if (fake.attachFailure) throw new Error('debugger unavailable'); this.attached = true; }),
      detach: vi.fn(() => { this.attached = false; this.debugger.emit('detach', {}, 'target closed'); }), isAttached: () => this.attached,
      sendCommand: vi.fn(async (name: string) => {
        if (name === 'Target.getTargetInfo') return { targetInfo: { targetId: `target-${this.id}` } };
        if (name === 'Runtime.evaluate') return { result: { value: { title: 'local', text: 'real test projection' } } };
        if (name === 'DOM.getDocument') return { root: { nodeId: 1 } };
        if (name === 'DOM.querySelector') return { nodeId: 2 };
        if (name === 'DOM.getBoxModel') return { model: { content: [0, 0, 2, 0, 2, 2, 0, 2] } };
        return {};
      })
    });
    stop = vi.fn(); setBackgroundThrottling = vi.fn(); setWindowOpenHandler = vi.fn();
    focus = vi.fn();
    constructor() { super(); fake.contents.push(this); }
    isDestroyed() { return this.destroyed; } getURL() { return this.url; }
    async loadURL(url: string) { this.url = url; this.emit('did-start-navigation', {}, url, false, true); }
    async capturePage() { return { toPNG: () => Buffer.from('test image') }; }
    close = vi.fn(() => { if (!this.destroyed) { this.destroyed = true; this.emit('destroyed'); } });
  }
  return { BaseWindow: Window, WebContentsView: class { webContents = new Contents(); constructor(public options: any) {} setBounds() {} },
    session: { fromPartition: (key: string) => {
      if (!fake.sessions.has(key)) fake.sessions.set(key, Object.assign(new EventEmitter(), {
        clearStorageData: vi.fn(async () => {}), serviceWorkers: { getAllRunning: vi.fn(() => ({})) }
      })); return fake.sessions.get(key);
    } } };
});
import { IndependentBrowserHostRegistry, browserActionDigest, type BrowserAction, type BrowserActionPermit } from '../src/main/independent-browser-host.js';
import { assertTrustedShellSender, captureTrustedShellSender } from '../src/main/ipc-sender.js';
import { computeAgentExecutionPartition, isAgentExecutionPartition, isReservedAgentPartition } from '../src/main/agent-execution-partition.js';

const scope = { spaceId: 'space-a', backendProfileId: 'backend-a', browserProfileId: 'browser-a' };
const ticket = (id = 'lease-a') => ({ leaseId: id, runId: 'run-a', scope, partitionKey: 'persist:legacy-a',
  runnerGeneration: 'runner-one', permissionEpoch: 1, allowedOrigins: ['https://allowed.test'], expiresAt: Date.now() + 60000 });
function permit(host: IndependentBrowserHostRegistry, action: BrowserAction, id = 'permit-a'): BrowserActionPermit {
  const lease = host.snapshot('lease-a');
  return { permitId: id, leaseId: 'lease-a', runId: lease.runId, scope: lease.scope, targetId: lease.targetId,
    mainGeneration: lease.mainGeneration, runnerGeneration: lease.runnerGeneration, navigationEpoch: lease.navigationEpoch,
    permissionEpoch: lease.permissionEpoch, actionDigest: browserActionDigest(action), expiresAt: Date.now() + 10000, allowMutation: true };
}
const read: BrowserAction = { kind: 'read', effect: 'read' };
beforeEach(() => { fake.windows.length = 0; fake.contents.length = 0; fake.sessions.clear(); fake.attachFailure = false; });
async function fixture() {
  const host = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => 'persist:legacy-a', cleanupTimeoutMs: 5 });
  await host.createLease(ticket()); return host;
}

describe('Main-owned independent browser lifetime', () => {
  it('warms a hidden preview without input and settles capture before manual takeover', async () => {
    const host = await fixture(), window = fake.windows[0], contents = fake.contents[0];
    let complete!: (image: any) => void;
    contents.capturePage = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    const preview = host.preview('lease-a');
    await vi.waitFor(() => expect(contents.capturePage).toHaveBeenCalledWith(undefined, { stayHidden: true, stayAwake: true }));
    expect(window.ignoresMouse).toBe(true); expect(window.setOpacity).toHaveBeenCalledWith(0);
    const takeover = host.takeover('lease-a');
    expect(window.ignoresMouse).toBe(true);
    complete({ toPNG: () => Buffer.from('captured page') });
    expect((await preview).base64).toBe(Buffer.from('captured page').toString('base64'));
    expect((await takeover).visible).toBe(true);
    expect(window.ignoresMouse).toBe(false); expect(window.setOpacity).toHaveBeenLastCalledWith(1);
    await host.closeAll();
  });
  it('rejects an in-flight preview when its actual target is revoked', async () => {
    const host = await fixture(), contents = fake.contents[0];
    contents.capturePage = vi.fn(() => new Promise(() => {}));
    const preview = host.preview('lease-a');
    const rejection = expect(preview).rejects.toMatchObject({ name: 'BrowserHostError' });
    await vi.waitFor(() => expect(contents.capturePage).toHaveBeenCalled());
    await host.revoke('lease-a', host.snapshot('lease-a').permissionEpoch + 1);
    await rejection; expect(host.size).toBe(0);
  });
  it('keeps explicit account setup manual and cannot grant worker execution or resume authority', async () => {
    const host = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => 'persist:legacy-a' });
    await host.createLease({ ...ticket(), purpose: 'account_setup' });
    const opened = await host.openAccountSetup('lease-a', 'https://allowed.test');
    expect(opened).toMatchObject({ purpose: 'account_setup', state: 'paused', visible: true });
    expect(host.allowsRequest(opened.webContentsId, 'https://allowed.test/manual-login')).toBe(true);
    expect(host.allowsRequest(opened.webContentsId, 'https://other.test/login')).toBe(false);
    expect(() => host.execute(permit(host, read), read)).toThrow(/no worker action/);
    expect(() => host.resume('lease-a', opened.navigationEpoch, opened.permissionEpoch)).toThrow(/cannot become a worker/);
    await host.closeAll(); expect(host.size).toBe(0);
  });
  it('derives stable execution storage from all existing Scope identities and reserves it against renderer guests', () => {
    const key = computeAgentExecutionPartition(scope);
    expect(key).toMatch(/^persist:independent_agent_v1_[a-f0-9]{64}$/);
    expect(computeAgentExecutionPartition({ ...scope })).toBe(key);
    for (const field of ['spaceId', 'backendProfileId', 'browserProfileId'])
      expect(computeAgentExecutionPartition({ ...scope, [field]: 'different' })).not.toBe(key);
    expect(isAgentExecutionPartition(key)).toBe(true); expect(isAgentExecutionPartition(key + 'x')).toBe(false);
    expect(isReservedAgentPartition(key)).toBe(true); expect(isReservedAgentPartition('persist:space_home_default')).toBe(false);
  });
  it('attributes all dedicated Session requests to one live lease and denies idle, expired and disconnected workers', async () => {
    const partitionKey = computeAgentExecutionPartition(scope); let live = true, clock = Date.now();
    const host = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => partitionKey,
      isRunnerGenerationLive: () => live, now: () => clock,
      attachSession: target => expect(host.allowsSessionRequest(target, 'https://allowed.test/from-worker')).toBe(false) });
    await host.createLease({ ...ticket(), partitionKey }); const target = fake.sessions.get(partitionKey);
    expect(target.clearStorageData).toHaveBeenCalledWith({ storages: ['serviceworkers', 'cachestorage'] });
    expect(host.snapshot('lease-a')).toMatchObject({ partitionKind: 'dedicated_agent', accountSource: 'explicit_agent_login' });
    expect(host.allowsSessionRequest(target, 'https://allowed.test/from-worker')).toBe(true);
    expect(host.allowsSessionRequest(target, 'https://denied.test/')).toBe(false);
    expect(host.allowsSessionRequest({}, 'https://allowed.test/')).toBe(false);
    await host.requestPause('lease-a'); expect(host.allowsSessionRequest(target, 'https://allowed.test/')).toBe(false);
    await host.takeover('lease-a'); expect(host.allowsSessionRequest(target, 'https://allowed.test/')).toBe(true);
    host.resume('lease-a', host.snapshot('lease-a').navigationEpoch, 1);
    live = false; expect(host.allowsSessionRequest(target, 'https://allowed.test/')).toBe(false);
    live = true; clock += 60001; expect(host.allowsSessionRequest(target, 'https://allowed.test/')).toBe(false);
    await host.closeAll(); expect(host.allowsSessionRequest(target, 'https://allowed.test/')).toBe(false);
    expect(target.clearStorageData).toHaveBeenCalledTimes(2);
  });
  it('reserves an exact Scope before async creation so concurrent runs cannot share execution storage', async () => {
    let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
    const partitionKey = computeAgentExecutionPartition(scope);
    const host = new IndependentBrowserHostRegistry({ validateTicket: () => barrier, resolvePartition: () => partitionKey });
    const first = host.createLease({ ...ticket(), partitionKey });
    await expect(host.createLease({ ...ticket('lease-b'), runId: 'run-b', partitionKey })).rejects.toMatchObject({ code: 'scope_busy' });
    release(); await first; await host.closeAll();
  });
  it('denies different Scopes that accidentally map to one occupied execution Session', async () => {
    const partitionKey = computeAgentExecutionPartition(scope);
    const host = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => partitionKey });
    await host.createLease({ ...ticket(), partitionKey });
    await expect(host.createLease({ ...ticket('lease-b'), scope: { ...scope, spaceId: 'space-b' }, partitionKey }))
      .rejects.toMatchObject({ code: 'session_busy' });
    expect(fake.windows).toHaveLength(1); await host.closeAll();
  });
  it('quarantines unconfirmed worker cleanup across replacement registries without copying account storage', async () => {
    const partitionKey = computeAgentExecutionPartition(scope), quarantined = new WeakSet<object>();
    const options = { validateTicket: () => {}, resolvePartition: () => partitionKey,
      quarantineSession: (target: any) => quarantined.add(target), isSessionQuarantined: (target: any) => quarantined.has(target) };
    const host = new IndependentBrowserHostRegistry(options); await host.createLease({ ...ticket(), partitionKey });
    const target = fake.sessions.get(partitionKey); target.clearStorageData.mockRejectedValueOnce(new Error('native failure'));
    await expect(host.cancel('lease-a')).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
    expect(host.allowsSessionRequest(target, 'https://allowed.test/')).toBe(false); expect(quarantined.has(target)).toBe(true);
    const replacement = new IndependentBrowserHostRegistry(options);
    await expect(replacement.createLease({ ...ticket('lease-c'), partitionKey })).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
    expect(fake.windows).toHaveLength(1); await replacement.closeAll(); await host.closeAll();
  });
  it('does not open a lease if a service worker remains alive after the native clear acknowledgement', async () => {
    const partitionKey = computeAgentExecutionPartition(scope);
    const host = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => partitionKey,
      attachSession: target => fake.sessions.get(partitionKey).serviceWorkers.getAllRunning.mockReturnValue({ 9: { scope: 'https://allowed.test/' } }) });
    await expect(host.createLease({ ...ticket(), partitionKey })).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
    expect(fake.windows).toHaveLength(0); await host.closeAll();
  });
  it('uses existing partition, isolated secured host and strong Main references without a parent', async () => {
    const host = await fixture();
    expect(host.size).toBe(1); expect(fake.windows[0].options.parent).toBeUndefined();
    expect(fake.windows[0].options.show).toBe(false); expect(fake.windows[0].ignoresMouse).toBe(true);
    expect(fake.contents[0].setBackgroundThrottling).toHaveBeenCalledWith(false);
    expect(host.snapshot('lease-a')).toMatchObject({ scope, partitionKey: 'persist:legacy-a', targetId: 'target-1', state: 'ready' });
    await host.closeAll();
  });
  it('rejects wrong partition before creating native windows and rejects duplicate lease IDs', async () => {
    const host = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => 'persist:other' });
    await expect(host.createLease(ticket())).rejects.toMatchObject({ code: 'partition_mismatch' });
    expect(fake.windows).toHaveLength(0);
    const valid = await fixture(); await expect(valid.createLease(ticket())).rejects.toMatchObject({ code: 'duplicate_lease' });
    await valid.closeAll();
  });
  it('initializes native input rendering invisibly without transferring window focus', async () => {
    const host = await fixture(), action: BrowserAction = { kind: 'navigate', url: 'https://allowed.test/new', effect: 'read' };
    const focus = vi.spyOn(fake.windows[0], 'focus');
    await host.execute(permit(host, action), action);
    expect(fake.windows[0].setOpacity.mock.calls).toEqual([[0], [1]]);
    expect(fake.windows[0].options.skipTaskbar).toBe(true);
    expect(fake.windows[0].visible).toBe(false); expect(focus).not.toHaveBeenCalled();
    expect(host.snapshot('lease-a').navigationEpoch).toBe(1);
    await host.closeAll();
  });
  it('cleans partial initialization when the debugger cannot attach', async () => {
    fake.attachFailure = true;
    const host = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => 'persist:legacy-a' });
    await expect(host.createLease(ticket())).rejects.toThrow('debugger unavailable'); expect(host.size).toBe(0);
    expect(fake.windows[0].destroyed).toBe(true); expect(fake.contents[0].destroyed).toBe(true);
  });
  it('does not let late ticket validation recreate a host after quit', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const host = new IndependentBrowserHostRegistry({ validateTicket: () => gate, resolvePartition: () => 'persist:legacy-a' });
    const create = host.createLease(ticket()); await host.closeAll(); release();
    await expect(create).rejects.toMatchObject({ code: 'quitting' }); expect(fake.windows).toHaveLength(0);
  });
  it.each([
    ['runId', 'run-b', 'scope_mismatch'], ['targetId', 'target-other', 'scope_mismatch'],
    ['runnerGeneration', 'old-runner', 'generation_stale'], ['mainGeneration', 'old-main', 'generation_stale'],
    ['navigationEpoch', 99, 'epoch_stale'], ['permissionEpoch', 99, 'epoch_stale'], ['expiresAt', 1, 'permit_expired'],
    ['actionDigest', 'different', 'action_changed']
  ])('rejects altered %s before any target command', async (key, value, code) => {
    const host = await fixture(), authorization = { ...permit(host, read), [key]: value };
    expect(() => host.execute(authorization, read)).toThrow();
    try { host.execute(authorization, read); } catch (e: any) { expect(e.code).toBe(code); }
    expect(fake.contents[0].debugger.sendCommand.mock.calls.map((c: any) => c[0])).toEqual(['Target.getTargetInfo']);
    await host.closeAll();
  });
  it.each(['spaceId', 'backendProfileId', 'browserProfileId'])('rejects foreign scope field %s', async key => {
    const host = await fixture(), authorization = permit(host, read);
    expect(() => host.execute({ ...authorization, scope: { ...scope, [key]: 'foreign' } }, read)).toThrow();
    await host.closeAll();
  });
  it('consumes a permit only once and permits no arbitrary evaluation through DOM projection', async () => {
    const host = await fixture(), authorization = permit(host, read);
    await host.execute(authorization, read); expect(() => host.execute(authorization, read)).toThrow(/only once/);
    const call = fake.contents[0].debugger.sendCommand.mock.calls.find((c: any) => c[0] === 'Runtime.evaluate');
    expect(call[1].expression).toContain('document.body');
    const action = { kind: 'Runtime.evaluate', expression: 'malicious()', effect: 'read' } as any;
    await expect(host.execute(permit(host, action, 'raw'), action)).rejects.toMatchObject({ code: 'operation_denied' });
    await host.closeAll();
  });
  it('closes the gate before waiting for a safe pause and allows user input only after the ack', async () => {
    const host = await fixture(); let finish!: (v: unknown) => void;
    fake.contents[0].debugger.sendCommand.mockImplementation(() => new Promise(r => { finish = r; }));
    const action = host.execute(permit(host, read), read).catch((e: any) => e.code);
    await Promise.resolve();
    const takeover = host.takeover('lease-a');
    expect(host.snapshot('lease-a').state).toBe('pausing'); expect(fake.windows[0].visible).toBe(false);
    expect(fake.windows[0].ignoresMouse).toBe(true);
    expect(() => host.execute(permit(host, read, 'new'), read)).toThrow(/gate is closed/);
    finish({ result: { value: { text: 'late' } } });
    expect(await action).toBe('action_interrupted'); const paused = await takeover;
    expect(paused.state).toBe('paused'); expect(fake.windows[0].visible).toBe(true); expect(fake.windows[0].ignoresMouse).toBe(false);
    host.resume('lease-a', paused.navigationEpoch, paused.permissionEpoch);
    expect(fake.windows[0].visible).toBe(false); expect(fake.windows[0].ignoresMouse).toBe(true);
    await host.closeAll();
  });
  it('revocation wins over an already queued action and late results cannot reopen the gate', async () => {
    const host = await fixture(); let finish!: (v: unknown) => void;
    fake.contents[0].debugger.sendCommand.mockImplementation(() => new Promise(r => { finish = r; }));
    const current = host.execute(permit(host, read), read).catch((e: any) => e.code);
    const queued = host.execute(permit(host, read, 'second'), read).catch((e: any) => e.code);
    await Promise.resolve(); await host.revoke('lease-a', 2);
    finish({ result: { value: { text: 'late' } } });
    expect(await current).toBe('action_interrupted'); expect(await queued).toBe('gate_closed');
    expect(host.size).toBe(0); expect(host.snapshot('lease-a').state).toBe('closed');
    expect(fake.contents[0].debugger.sendCommand.mock.calls).toHaveLength(2);
  });
  it('detects target/host loss without substituting another target, and frees listeners/leases', async () => {
    const host = await fixture(); fake.contents[0].close(); await Promise.resolve(); await Promise.resolve();
    expect(() => host.execute(permit(host, read), read)).toThrow();
    await host.closeAll(); expect(host.size).toBe(0); expect(fake.windows[0].destroyed).toBe(true);
    expect(fake.sessions.get('persist:legacy-a').listenerCount('will-download')).toBe(0);
  });
  it('treats debugger detach as loss rather than silently attaching to another target', async () => {
    const host = await fixture(); fake.contents[0].debugger.detach(); await host.closeAll();
    expect(host.size).toBe(0); expect(host.snapshot('lease-a').state).toBe('closed');
  });
  it('blocks popups, redirects and owned downloads without replacing shared-session handlers', async () => {
    const host = await fixture(), contents = fake.contents[0];
    const popup = contents.setWindowOpenHandler.mock.calls[0][0]; expect(popup({ url: 'https://foreign.test' })).toEqual({ action: 'deny' });
    const preventDefault = vi.fn(); contents.emit('will-redirect', { preventDefault, url: 'file:///secret' });
    expect(preventDefault).toHaveBeenCalled(); expect(host.snapshot('lease-a').state).toBe('pausing');
    const shared = fake.sessions.get('persist:legacy-a'), old = vi.fn(); shared.on('will-download', old);
    const cancel = vi.fn(); shared.emit('will-download', { preventDefault }, { cancel }, contents);
    expect(cancel).toHaveBeenCalled(); expect(old).toHaveBeenCalled();
    await host.closeAll(); expect(shared.listenerCount('will-download')).toBe(1); // existing controller retained
  });
  it('rejects unsignalled target destruction instead of claiming successful cleanup', async () => {
    const host = await fixture(); fake.contents[0].close.mockImplementation(() => {});
    await expect(host.closeAll()).rejects.toMatchObject({ code: 'cleanup_unconfirmed' }); expect(host.size).toBe(0);
  });
  it('requires boolean write authorization and rejects file/protocol navigation', async () => {
    const host = await fixture(); const action: BrowserAction = { kind: 'type', selector: '#input', text: 'x', effect: 'write' };
    expect(() => host.execute({ ...permit(host, action), allowMutation: 'false' as any }, action)).toThrow(/authorization/);
    const nav: BrowserAction = { kind: 'navigate', url: 'file:///private', effect: 'read' };
    await expect(host.execute(permit(host, nav, 'nav'), nav)).rejects.toMatchObject({ code: 'origin_denied' }); await host.closeAll();
  });
});

describe('trusted IPC sender and main-frame identity', () => {
  const fixture = () => {
    const frame = { url: 'app://bundle/index.html', isDestroyed: () => false };
    const sender = { id: 1, mainFrame: frame, isDestroyed: () => false, getURL: () => frame.url };
    return { sender, senderFrame: frame } as any;
  };
  it('requires registered shell identity and rejects same-origin guests/subframes', () => {
    const event = fixture(); expect(assertTrustedShellSender(event, s => s.id === 1)).toBe(event.sender);
    expect(() => assertTrustedShellSender(event, () => false)).toThrow(/Untrusted/);
    expect(() => assertTrustedShellSender({ ...event, senderFrame: { ...event.senderFrame } }, () => true)).toThrow(/Untrusted/);
    event.senderFrame.url = 'https://foreign.test'; expect(() => assertTrustedShellSender(event, () => true)).toThrow(/Untrusted/);
  });
  it('rechecks origin and exact frame after awaiting backend work', () => {
    const event = fixture(), recheck = captureTrustedShellSender(event, () => true);
    event.sender.mainFrame = { ...event.senderFrame }; expect(() => recheck()).toThrow();
  });
});

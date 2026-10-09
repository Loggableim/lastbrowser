import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile, access, mkdir, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
const fake = vi.hoisted(() => ({ guests: new Map<number, any>(), session: {} }));
vi.mock('electron', () => ({ BaseWindow: class {}, WebContentsView: class {},
  session: { fromPartition: () => fake.session }, webContents: { fromId: (id: number) => fake.guests.get(id) } }));
import { IndependentController, independentIpcRequest } from '../src/main/independent-controller.js';
import { computeSpacePartition } from '../src/main/space-partition.js';

let directory: string, controller: IndependentController, api: ReturnType<typeof vi.fn>, event: any;
const workspace = 'C:/controlled/account-a', scope = { spaceId: 'native-a', backendProfileId: 'backend-a', browserProfileId: 'default' };
const known = [workspace];
beforeEach(async () => {
  fake.guests.clear(); directory = await mkdtemp(path.join(tmpdir(), 'lastbrowser-controller-test-'));
  const frame = { url: 'app://bundle/index.html', isDestroyed: () => false };
  const sender = { id: 1, mainFrame: frame, getURL: () => frame.url, isDestroyed: () => false,
    executeJavaScript: vi.fn(async () => ['default', 'browser-two']) };
  event = { sender, senderFrame: frame };
  let nextCapture = 0;
  api = vi.fn(async (operation: string, _scope: unknown, payload: any, profile: string) => {
    if (operation === 'browser.handshake') return { runnerGeneration: 'controlled-runner-generation' };
    if (operation === 'browser.shutdown') return { closed: true };
    if (operation === 'browser.backendProfiles') return { schemaVersion: 1, profiles: [
      { name: 'default', isDefault: true }, { name: 'other', isDefault: false },
      { name: 'alpha', isDefault: false }, { name: 'beta', isDefault: false }
    ] };
    if (operation === 'browser.spacePaths') return { knownSpacePaths: known };
    if (operation === 'resolveScope') return { schemaVersion: 1, scope, spaceName: 'Controlled A', workspacePath: payload.workspacePath,
      bindingRevision: 1, setupStatus: 'legacy', partitionKey: payload.partitionKey, backendProfileName: profile, knownSpacePaths: known };
    if (operation === 'selectedContext') return { ref: (++nextCapture).toString(16).padStart(32, '0'), scope,
      observedAt: new Date().toISOString(), expiresInSeconds: 120 };
    return { schemaVersion: 1, scope, sourceState: 'live' };
  });
  controller = new IndependentController({ userDataDir: directory, isShell: sender => sender.id === 1, apiRequest: api, attachSession: () => {} });
});
afterEach(async () => { await controller.shutdown();
  expect((controller as any).selectedCaptures.size).toBe(0);
  expect((controller as any).captureExpiryTimer).toBeUndefined(); vi.restoreAllMocks();
  expect(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)).toBe(true);
  await rm(directory, { recursive: true, force: true }); });
const resolve = (extra: any = {}) => controller.request(event, { schemaVersion: 1, operation: 'resolveScope',
  payload: { workspacePath: workspace, browserProfileId: 'default', ...extra } });

async function localAiFixture(hook?: (input: any) => Promise<void>) {
  await controller.shutdown();
  const scan = { schemaVersion: 1, scope, hardware: { schemaVersion: 1, scanId: 'actual-main-scan', observedAt: new Date().toISOString(),
    ramAvailableBytes: { value: 1234, status: 'measured', source: 'controlled-main-probe', observedAt: new Date().toISOString() } }, gpuFeatureStatus: {}, probeIssues: [] };
  const probe = vi.fn(async input => { await hook?.(input); return scan; });
  const base = api.getMockImplementation()!;
  api.mockImplementation(async (operation, scoped, payload, profile) => {
    if (operation === 'localAi.hardwareBind' || operation === 'localAi.hardwareRead') return { schemaVersion: 1, scope, scan, runtimes: [], availableComputeSlots: 2, skipAvailable: true, existingProviderAvailable: true };
    if (operation === 'localAi.recommend') return { schemaVersion: 1, scope, result: { hardwareScanId: payload.scanId, selectedArtifactIds: [] } };
    if (operation === 'localAi.catalog') return { schemaVersion: 1, scope, catalog: { artifacts: [] } };
    return base(operation, scoped, payload, profile);
  });
  controller = new IndependentController({ userDataDir: directory, isShell: sender => sender.id === 1, apiRequest: api,
    attachSession: () => {}, hardwareProbe: probe as any });
  await resolve(); api.mockClear(); return { scan, probe };
}
const localAi = (payload: any, selected: any = scope) => controller.request(event, { schemaVersion: 1, operation: 'localAi', scope: selected, payload });

describe('Native chat browser Main owner and control boundaries', () => {
  let ref: any, snapshot: any, host: any, sequence: string[];
  const open = (extra: any = {}) => controller.request(event, { schemaVersion: 1, operation: 'openNativeBrowser', scope,
    payload: { sessionId: 'chat-a', streamId: 'stream-a', clientRequestId: 'a'.repeat(32), ...extra } });
  const take = (extra: any = {}) => controller.request(event, { schemaVersion: 1, operation: 'takeoverNativeBrowser', scope,
    payload: { sessionId: 'chat-a', streamId: 'stream-a', clientRequestId: 'b'.repeat(32), writerGeneration: 'writer-a', writerLeaseId: 'writer-lease-a',
      expectedControlRevision: 1, expectedPermissionRevision: 1, expectedControlEpoch: 0, expectedNavigationEpoch: 1, ...extra } });
  beforeEach(async () => {
    await resolve(); sequence = [];
    const owner = { runId: null, ownerKind: 'native_chat', sessionId: 'chat-a', streamId: 'stream-a', writerGeneration: 'writer-a', writerLeaseId: 'writer-lease-a' };
    ref = { schemaVersion: 1, scope, owner, leaseId: 'native-lease', targetId: 'native-target', mainGeneration: 'main-live', runnerGeneration: 'runner-live',
      navigationEpoch: 1, permissionRevision: 1, controlEpoch: 0, controlRevision: 1, state: 'ready', automationPaused: false,
      writerAvailable: true, observedAt: new Date().toISOString() };
    snapshot = { ...owner, scope, leaseId: ref.leaseId, targetId: ref.targetId, mainGeneration: ref.mainGeneration, runnerGeneration: ref.runnerGeneration,
      navigationEpoch: 1, permissionEpoch: 0, expiresAt: Date.now() + 60000, state: 'ready', visible: false,
      partitionKind: 'dedicated_agent', accountSource: 'explicit_agent_login' };
    host = { mainGeneration: 'main-live', snapshot: vi.fn(() => ({ ...snapshot })),
      preview: vi.fn(async () => { sequence.push('preview'); return { mimeType: 'image/png', base64: 'controlled', navigationEpoch: 1, observedAt: new Date().toISOString() }; }),
      requestPause: vi.fn(async () => { sequence.push('pause'); snapshot.state = 'paused'; return { ...snapshot }; }),
      takeover: vi.fn(async () => { sequence.push('show'); snapshot.visible = true; return { ...snapshot }; }),
      closeAll: vi.fn(async () => {}) };
    (controller as any).host = host; (controller as any).generation = 'runner-live';
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (operation, selected, payload, profile) => {
      if (operation === 'browser.nativeView') { sequence.push('reference'); return structuredClone(ref); }
      if (operation === 'browser.nativeTakeover') { sequence.push('gate'); ref.controlRevision = 2; ref.automationPaused = true; return structuredClone(ref); }
      if (operation === 'browser.shutdown') return { closed: true };
      return base(operation, selected, payload, profile);
    });
    api.mockClear();
  });
  it('uses the saved backend and validates the original Parent again after preview', async () => {
    await expect(open()).resolves.toMatchObject({ kind: 'native_browser_preview', owner: ref.owner, writerAvailable: true });
    expect(sequence).toEqual(['reference', 'preview', 'reference']);
    expect(api).toHaveBeenCalledWith('browser.nativeView', scope,
      { sessionId: 'chat-a', streamId: 'stream-a', mainGeneration: 'main-live', runnerGeneration: 'runner-live' }, 'default');
    host.preview.mockImplementation(async () => { ref.owner.writerGeneration = 'replaced-writer'; return { navigationEpoch: 1 }; });
    await expect(open()).rejects.toThrow(/authorization|target|writer|changed/i);
    expect(host.takeover).not.toHaveBeenCalled();
  });
  it('closes the actual backend automation gate before pausing and showing', async () => {
    await expect(take()).resolves.toMatchObject({ kind: 'native_browser_takeover', automationPaused: true, state: 'paused' });
    expect(sequence).toEqual(['reference', 'gate', 'pause', 'reference', 'show']);
    expect(host.takeover).toHaveBeenCalledWith('native-lease', expect.objectContaining({ owner: ref.owner, scope, navigationEpoch: 1, permissionEpoch: 0 }));
  });
  it('rejects caller-selected targets and stale authorization before changing the browser', async () => {
    for (const field of ['targetId', 'leaseId', 'runId', 'partitionKey']) await expect(open({ [field]: 'foreign' })).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
    await expect(take({ expectedPermissionRevision: 2 })).rejects.toThrow(/changed/);
    expect(host.requestPause).not.toHaveBeenCalled(); expect(host.takeover).not.toHaveBeenCalled();
  });
  it('rejects a revoked epoch during pause before exposing the target', async () => {
    host.requestPause.mockImplementation(async () => { snapshot.state = 'paused'; snapshot.permissionEpoch = 1; ref.controlEpoch = 1; return snapshot; });
    await expect(take()).rejects.toThrow(/changed/);
    expect(host.takeover).not.toHaveBeenCalled();
  });
});

describe('Local AI Main purpose boundary', () => {
  it('serves scope-free hardware inventory only to the trusted shell without Sidekick, profile or cache setup', async () => {
    const inventory = { schemaVersion: 1, hardware: { schemaVersion: 1, scanId: 'actual-inventory', observedAt: new Date().toISOString() },
      gpuFeatureStatus: {}, probeIssues: [] };
    const probe = vi.fn(async () => inventory as any);
    controller = new IndependentController({ userDataDir: directory, isShell: sender => sender.id === 1, apiRequest: api,
      attachSession: () => {}, hardwareInventoryProbe: probe as any });
    const result = await independentIpcRequest(controller, event,
      { schemaVersion: 1, operation: 'localAiHardwareInventory', payload: {} });
    expect(result).toMatchObject({ ok: true, value: { schemaVersion: 1, hardware: { scanId: 'actual-inventory' } } });
    expect(probe).toHaveBeenCalledWith({ cacheDirectory: directory, timeoutMs: 3000 });
    expect(api).not.toHaveBeenCalled();
    expect((controller as any).bindings.size).toBe(0);
    await expect(access(path.join(directory, 'local-ai'))).rejects.toThrow();
    await expect(independentIpcRequest(controller, event,
      { schemaVersion: 1, operation: 'localAiHardwareInventory', payload: { cacheDirectory: directory } }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    await expect(independentIpcRequest(controller, event,
      { schemaVersion: 1, operation: 'localAiHardwareInventory', scope, payload: {} }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(probe).toHaveBeenCalledOnce();
  });

  it('rejects a shell-bound inventory if its trusted sender frame navigates during probing', async () => {
    const inventory = { schemaVersion: 1, hardware: { schemaVersion: 1, scanId: 'actual-inventory', observedAt: new Date().toISOString() },
      gpuFeatureStatus: {}, probeIssues: [] };
    const probe = vi.fn(async () => { event.senderFrame.url = 'https://untrusted.invalid'; return inventory as any; });
    controller = new IndependentController({ userDataDir: directory, isShell: sender => sender.id === 1, apiRequest: api,
      attachSession: () => {}, hardwareInventoryProbe: probe as any });
    await expect(independentIpcRequest(controller, event,
      { schemaVersion: 1, operation: 'localAiHardwareInventory', payload: {} }))
      .resolves.toMatchObject({ ok: false });
    expect(probe).toHaveBeenCalledOnce();
    expect(api).not.toHaveBeenCalled();
  });

  it('bounds a scope-free inventory and ignores its late hardware result after the deadline', async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const probe = vi.fn(async () => { entered(); await held; return {} as any; });
    controller = new IndependentController({ userDataDir: directory, isShell: sender => sender.id === 1, apiRequest: api,
      attachSession: () => {}, hardwareInventoryProbe: probe as any });
    vi.useFakeTimers();
    try {
      const request = independentIpcRequest(controller, event,
        { schemaVersion: 1, operation: 'localAiHardwareInventory', payload: {} });
      await started;
      const timedOut = expect(request).resolves.toMatchObject({ ok: false, error: { code: 'local_ai_hardware_timeout' } });
      await vi.advanceTimersByTimeAsync(15_000);
      await timedOut;
      expect(vi.getTimerCount()).toBe(0);
      release(); await Promise.resolve(); await Promise.resolve();
      expect(api).not.toHaveBeenCalled();
    } finally { release(); vi.useRealTimers(); }
  });

  it('fails closed for bundled local model features before API, disk, or runtime access', async () => {
    const { probe } = await localAiFixture();
    for (const action of ['store', 'setup', 'runtime', 'roleProfile', 'catalog', 'recommend'])
      await expect(localAi({ action })).rejects.toMatchObject({ code: 'local_ai_unavailable_in_test_build' });
    await expect(controller.request(event, { schemaVersion: 1, operation: 'localAiBootstrap', payload: { action: 'start' } }))
      .rejects.toMatchObject({ code: 'local_ai_unavailable_in_test_build' });
    expect(probe).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled(); expect((controller as any).host).toBeUndefined();
    await expect(access(path.join(directory, 'local-ai'))).rejects.toThrow();
  });
  it('keeps hardware inventory available without enabling local model recommendations', async () => {
    const { scan, probe } = await localAiFixture(); const result: any = await localAi({ action: 'scan' });
    expect(result.scan).toEqual(scan); expect(probe).toHaveBeenCalledWith({ scope, cacheDirectory: directory, timeoutMs: 3000 });
    expect(api).toHaveBeenCalledWith('localAi.hardwareBind', scope, scan, 'default');
    expect(api).toHaveBeenCalledWith('localAi.hardwareRead', scope, { scanId: scan.hardware.scanId }, 'default');
    expect((controller as any).host).toBeUndefined();
  });
  it('bounds a held Main hardware probe, clears its deadline and never binds a late result', async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    await localAiFixture(async () => { entered(); await held; });
    vi.useFakeTimers();
    try {
      const request = independentIpcRequest(controller, event,
        { schemaVersion: 1, operation: 'localAi', scope, payload: { action: 'scan' } });
      await started;
      const timedOut = expect(request).resolves.toMatchObject({ ok: false, error: { code: 'local_ai_hardware_timeout' } });
      await vi.advanceTimersByTimeAsync(15_000);
      await timedOut;
      expect(vi.getTimerCount()).toBe(0);
      release();
      await Promise.resolve(); await Promise.resolve();
      expect(api).not.toHaveBeenCalled();
    } finally { release(); vi.useRealTimers(); }
  });
  it('rejects renderer hardware, executable paths and invented scan references before probing or dispatch', async () => {
    const { probe } = await localAiFixture();
    for (const extra of [{ hardware: {} }, { exePath: 'external.exe' }, { availableComputeSlots: 2 }, { cacheDirectory: directory }, { runtime: {} }, { scanId: 'forged' }])
      await expect(localAi({ action: 'scan', ...extra })).rejects.toThrow(/authority/);
    await expect(localAi({ action: 'recommend', scanId: 'forged', preset: 'balanced', contextTokens: 1024 }))
      .rejects.toMatchObject({ code: 'local_ai_unavailable_in_test_build' });
    expect(probe).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled();
  });
  it('scans the trusted profile without traversing a preexisting model-cache junction', async () => {
    const { probe } = await localAiFixture(); const target = path.join(directory, 'external-target'); await mkdir(target);
    await symlink(target, path.join(directory, 'local-ai'), 'junction');
    await expect(localAi({ action: 'scan' })).resolves.toMatchObject({ scan: { hardware: { scanId: 'actual-main-scan' } } });
    expect(probe).toHaveBeenCalledWith({ scope, cacheDirectory: directory, timeoutMs: 3000 });
    expect(await readdir(target)).toEqual([]);
    // Install/runtime cache-junction rejection remains covered by the Main controller tests.
  });
  it('rechecks the trusted frame after the real scan and never binds proof from a reloaded sender', async () => {
    await localAiFixture(async () => { event.senderFrame.url = 'https://untrusted.invalid'; });
    await expect(localAi({ action: 'scan' })).rejects.toThrow(); expect(api).not.toHaveBeenCalled();
  });
  it('rejects foreign response scope and aborts the next await when the trusted frame changes', async () => {
    await localAiFixture(); const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { const result = await normal(...args); if (args[0] === 'localAi.hardwareBind') return { ...result, scope: { ...scope, spaceId: 'foreign' } }; return result; });
    await expect(localAi({ action: 'scan' })).rejects.toThrow(/another Space/);
    expect(api.mock.calls.map(row => row[0])).toEqual(['localAi.hardwareBind']);
    api.mockClear(); api.mockImplementation(async (...args) => { const result = await normal(...args); if (args[0] === 'localAi.hardwareBind') event.senderFrame.url = 'https://untrusted.invalid'; return result; });
    await expect(localAi({ action: 'scan' })).rejects.toThrow(); expect(api.mock.calls.map(row => row[0])).toEqual(['localAi.hardwareBind']);
  });
});

describe('independent Main controller authority', () => {
  it('binds Space removal to the saved profile and refuses renderer authority without resolving a new Space', async () => {
    await resolve(); api.mockClear();
    const input = { path: workspace, browserProfileId: 'default' };
    const captured = await controller.bindSpaceRemoval(event, input);
    expect(captured.request).toEqual({ path: workspace, profile: 'default', spaceScope: scope });
    expect((await controller.bindSpaceRemoval(event, { ...input, path: 'C:\\controlled\\ACCOUNT-A\\' })).request).toEqual(captured.request);
    expect(api).not.toHaveBeenCalled();
    for (const authority of ['profile', 'spaceScope', 'space_scope', 'nativeBridgeNonce', 'backendProfileName']) {
      await expect(controller.bindSpaceRemoval(event, { ...input, [authority]: 'foreign' })).rejects.toThrow(/Invalid Space removal/);
    }
    await expect(controller.bindSpaceRemoval(event, { ...input, browserProfileId: 'foreign' })).rejects.toThrow(/Unknown browser profile/);
    event.senderFrame.url = 'https://untrusted.invalid';
    expect(captured.recheck).toThrow();
    await expect(controller.bindSpaceRemoval(event, input)).rejects.toThrow();
  });
  it('preserves unresolved legacy removal and rechecks the sender after profile discovery', async () => {
    const input = { path: workspace, browserProfileId: 'browser-two' };
    const result = await controller.bindSpaceRemoval(event, input);
    expect(result.request).toEqual({ path: workspace }); expect(api).not.toHaveBeenCalled();
    event.sender.executeJavaScript.mockImplementation(async () => { event.senderFrame.url = 'https://untrusted.invalid'; return ['browser-two']; });
    await expect(controller.bindSpaceRemoval(event, input)).rejects.toThrow();
  });
  it('forwards a bound human control candidate and rejects invented commands and stale response authority', async () => {
    await resolve(); api.mockClear();
    const id = '0'.repeat(31) + '1';
    const payload = { humanTurnId: id, sourceMessageId: id, runId: id, clientRequestId: id,
      expectedRevision: 2, controlEpoch: 3, requestDigest: 'a'.repeat(64) };
    const envelope = { schemaVersion: 1, operation: 'assistantControl', scope, payload };
    await expect(controller.request(event, envelope)).resolves.toMatchObject({ schemaVersion: 1, scope });
    expect(api).toHaveBeenCalledWith('assistantControl', scope, payload, 'default');
    api.mockClear();
    for (const extra of [{ command: 'cancel' }, { actorRef: 'user:desktop' }, { source: 'human' },
      { runId: 'unbound' }, { expectedRevision: 0 }, { controlEpoch: -1 }, { requestDigest: 'unknown' }]) {
      await expect(controller.request(event, { ...envelope, payload: { ...payload, ...extra } })).rejects.toThrow(/Invalid human control/);
    }
    expect(api).not.toHaveBeenCalled();
    api.mockResolvedValue({ schemaVersion: 1, scope: { ...scope, spaceId: 'foreign' } });
    await expect(controller.request(event, envelope)).rejects.toThrow(/Invalid bound/);
    api.mockResolvedValue({ schemaVersion: 2, scope });
    await expect(controller.request(event, envelope)).rejects.toThrow(/Invalid bound/);
    api.mockImplementation(async () => { event.senderFrame.url = 'https://untrusted.invalid'; return { schemaVersion: 1, scope }; });
    await expect(controller.request(event, envelope)).rejects.toThrow();
  });
  it('returns the exact typed IPC result envelope and preserves safe backend error metadata', async () => {
    const input = { schemaVersion: 1, operation: 'resolveScope', payload: { workspacePath: workspace, browserProfileId: 'default' } };
    const result: any = await independentIpcRequest(controller, event, input);
    expect(result).toMatchObject({ ok: true, value: { schemaVersion: 1, scope } });
    api.mockRejectedValue(Object.assign(new Error('The connection revision changed.'), { code: 'connection_revision_changed', retryable: true, currentRevision: 3 }));
    expect(await independentIpcRequest(controller, event, { schemaVersion: 1, operation: 'activity', scope })).toEqual({ ok: false,
      error: { schemaVersion: 1, code: 'connection_revision_changed', message: 'The connection revision changed.', retryable: true, currentRevision: 3 } });
    event.sender.id = 2;
    expect(await independentIpcRequest(controller, event, input)).toMatchObject({ ok: false, error: { schemaVersion: 1, code: 'independent_request_failed' } });
  });
  it.each(['definitions', 'connectionSetup', 'connectionConfigure', 'assistantReset'])('forwards purpose operation %s only with the saved Scope/profile and rechecks its response', async operation => {
    await resolve(); api.mockClear();
    const payload = operation === 'definitions' ? { action: 'list' }
      : operation === 'assistantReset' ? { action: 'preview' }
      : operation === 'connectionSetup' ? { action: 'start', connectionId: 'provider:openai', clientRequestId: 'controlled' }
        : { connectionId: 'provider:openai', expectedConnectionRevision: 1, clientRequestId: 'controlled',
          configuration: { apiKey: 'synthetic-human-value' } };
    const envelope = { schemaVersion: 1, operation, scope, payload };
    await expect(controller.request(event, envelope)).resolves.toMatchObject({ schemaVersion: 1, scope });
    expect(api).toHaveBeenCalledWith(operation, scope, payload, 'default');
    await expect(controller.request(event, { ...envelope, backendProfileName: 'foreign' })).rejects.toThrow(/saved Space binding/);
    api.mockResolvedValue({ schemaVersion: 1, scope: { ...scope, spaceId: 'foreign' } });
    await expect(controller.request(event, envelope)).rejects.toThrow(/Invalid bound/);
    api.mockResolvedValue({ schemaVersion: 2, scope });
    await expect(controller.request(event, envelope)).rejects.toThrow(/Invalid bound/);
    api.mockImplementation(async () => { event.senderFrame.url = 'https://untrusted.invalid'; return { schemaVersion: 1, scope }; });
    await expect(controller.request(event, envelope)).rejects.toThrow();
  });
  it('binds model discovery and CAS selection to the immutable native profile and rejects extra authority', async () => {
    await resolve(); api.mockClear();
    api.mockImplementation(async (_op, scoped, body, profile) => {
      expect(scoped).toEqual(scope); expect(profile).toBe('default');
      return { schemaVersion: 1, scope, revision: body.action === 'set' ? 2 : 1, model: 'actual-model',
        provider: 'configured-provider', configured: true, supportsIndependent: true };
    });
    const envelope = { schemaVersion: 1, operation: 'modelSelection', scope };
    const payload = { action: 'set', model: 'actual-model', provider: 'configured-provider', expectedRevision: 1, clientRequestId: 'choice-a' };
    await expect(controller.request(event, { ...envelope, payload: { ...payload, baseUrl: 'http://foreign' } })).rejects.toThrow(/Invalid scoped model/);
    await expect(controller.request(event, { ...envelope, payload: { ...payload, includeCatalog: false } })).rejects.toThrow(/Invalid scoped model/);
    expect(api).not.toHaveBeenCalled();
    await controller.request(event, { ...envelope, payload: { action: 'get', includeCatalog: false } });
    expect(api).toHaveBeenCalledWith('modelSelection', scope, { action: 'get', includeCatalog: false }, 'default');
    const result: any = await controller.request(event, { ...envelope, payload });
    expect(result.revision).toBe(2); expect(api).toHaveBeenCalledWith('modelSelection', scope, payload, 'default');
  });
  it('refuses a model response for another Space and rechecks its shell after asynchronous discovery', async () => {
    await resolve();
    const response = { schemaVersion: 1, scope: { ...scope, spaceId: 'foreign' }, revision: 1,
      model: 'actual-model', provider: 'actual-provider', configured: true, supportsIndependent: true };
    api.mockResolvedValue(response);
    const request = { schemaVersion: 1, operation: 'modelSelection', scope, payload: { action: 'get' } };
    await expect(controller.request(event, request)).rejects.toThrow(/Invalid bound model/);
    api.mockImplementation(async () => { event.senderFrame.url = 'https://untrusted.invalid/'; return { ...response, scope }; });
    await expect(controller.request(event, request)).rejects.toThrow();
  });
  it('migrates the existing profile/partition explicitly and never invents a native profile from browser ID', async () => {
    await resolve();
    const call = api.mock.calls.find(call => call[0] === 'resolveScope')!;
    expect(call[3]).toBe('default'); expect(call[2].partitionKey).toBe(computeSpacePartition('default', workspace, false, known));
    expect(call[2].partitionKey).toBe('persist:space_c__controlled_account-a_default');
    const saved = JSON.parse(await readFile(path.join(directory, 'independent-browser-bindings.json'), 'utf8'));
    expect(saved.bindings[0].scope).toEqual(scope); expect(saved.bindings[0].backendProfileName).toBe('default');
  });
  it('uses backend paths before minting a collision-sensitive binding and ignores renderer path lists', async () => {
    await resolve({ knownSpacePaths: ['made-up'] });
    expect(api.mock.calls[0][0]).toBe('browser.spacePaths');
    const minted = api.mock.calls.find(c => c[0] === 'resolveScope')!;
    expect(minted[2]).not.toHaveProperty('knownSpacePaths');
  });
  it('binds null browser Home to its exact historical partition and preserves the null UI locator', async () => {
    await resolve({ workspacePath: null });
    const minted = api.mock.calls.find(call => call[0] === 'resolveScope')!;
    expect(minted[2].workspacePath).toBeNull(); expect(minted[2].partitionKey).toBe('persist:space_home_default');
    expect(await controller.lookupBinding('default', null)).toEqual({ scope, backendProfileName: 'default' });
    expect(await controller.lookupBinding('default', workspace)).toBeNull();
  });
  it('keeps a Globaloverview target resolution on the captured source binding backend profile', async () => {
    await controller.request(event, { schemaVersion: 1, operation: 'resolveScope', backendProfileName: 'other',
      payload: { workspacePath: workspace, browserProfileId: 'default' } });
    api.mockClear();
    const baseApi = api.getMockImplementation()!;
    api.mockImplementation(async (...args: any[]) => {
      const result = await (baseApi as any)(...args);
      return args[0] === 'resolveScope' ? { ...result, scope: { ...scope, spaceId: 'home-native' } } : result;
    });
    await controller.request(event, { schemaVersion: 1, operation: 'resolveScope', scope,
      payload: { workspacePath: null, nativeSpaceId: 'home-native', browserProfileId: 'default' } });
    expect(api.mock.calls[0]).toEqual(['browser.spacePaths', null, {}, 'other']);
    expect(api.mock.calls.find(call => call[0] === 'resolveScope')![3]).toBe('other');
    await expect(controller.request(event, { schemaVersion: 1, operation: 'resolveScope', scope, backendProfileName: 'default',
      payload: { workspacePath: null, browserProfileId: 'default' } })).rejects.toThrow(/source Space binding/);
  });
  it('refuses unknown browser profiles and caller-controlled partition/home/generation', async () => {
    await expect(resolve({ browserProfileId: 'foreign' })).rejects.toThrow(/Unknown browser profile/);
    for (const reserved of ['partitionKey', 'canonicalHome', 'runnerGeneration', 'bootstrapSecret'])
      await expect(resolve({ [reserved]: 'foreign' })).rejects.toThrow(/authority/);
    expect(api).not.toHaveBeenCalled();
  });
  it('keeps scoped API requests on the saved backend profile after UI profile changes', async () => {
    await resolve(); api.mockClear();
    await controller.request(event, { schemaVersion: 1, operation: 'activity', scope });
    expect(api).toHaveBeenCalledWith('activity', scope, {}, 'default');
    await expect(controller.request(event, { schemaVersion: 1, operation: 'activity', scope,
      backendProfileName: 'foreign' })).rejects.toThrow(/saved Space binding/);
  });
  it('looks up normal chat bindings only for their saved browser profile and Space without writing or guessing', async () => {
    await resolve(); api.mockClear();
    expect(await controller.lookupBinding('default', workspace)).toEqual({ scope, backendProfileName: 'default' });
    expect(await controller.lookupBinding('default', 'c:\\CONTROLLED\\account-a\\')).toEqual({ scope, backendProfileName: 'default' });
    expect(await controller.lookupBinding('browser-two', workspace)).toBeNull();
    expect(await controller.lookupBinding('default', 'C:/controlled/foreign')).toBeNull();
    expect(await controller.lookupBinding('default', null)).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
  it('preserves the registered spelling for collision-sensitive partition creation and accepts canonical backend paths', async () => {
    api.mockImplementation(async (operation, _scope, payload: any, profile) => {
      if (operation === 'browser.spacePaths') return { knownSpacePaths: ['C:/controlled/account:a', 'C:/controlled/account?a'] };
      if (operation === 'resolveScope') return { schemaVersion: 1, scope, workspacePath: 'C:\\controlled\\account?a',
        bindingRevision: 1, partitionKey: payload.partitionKey, backendProfileName: profile };
      throw new Error('Unexpected API call');
    });
    await resolve({ workspacePath: 'C:\\controlled\\account?a' });
    const minted = api.mock.calls.find(call => call[0] === 'resolveScope')!;
    expect(minted[2].partitionKey).toBe(computeSpacePartition('default', 'C:/controlled/account?a', false,
      ['C:/controlled/account:a', 'C:/controlled/account?a']));
  });
  it('rejects private browser API names and foreign scopes before forwarding', async () => {
    await resolve(); api.mockClear();
    await expect(controller.request(event, { schemaVersion: 1, operation: 'browser.handshake', scope })).rejects.toThrow(/not exposed/);
    await expect(controller.request(event, { schemaVersion: 1, operation: 'activity', scope: { ...scope, backendProfileId: 'foreign' } })).rejects.toThrow(/not been resolved/);
    expect(api).not.toHaveBeenCalled();
  });
  it('rechecks shell/frame after API await and refuses same-origin guest impersonation', async () => {
    event.sender.id = 2; await expect(resolve()).rejects.toThrow(/Untrusted IPC sender/); expect(api).not.toHaveBeenCalled();
    event.sender.id = 1;
    api.mockImplementation(async () => { event.senderFrame.url = 'https://foreign.test'; return { knownSpacePaths: known }; });
    await expect(resolve()).rejects.toThrow(/Untrusted IPC sender/);
  });
  it('captures only explicitly selected owned guest in the exact mapped partition', async () => {
    await resolve();
    const guest = Object.assign(new EventEmitter(), { id: 42, session: fake.session, hostWebContents: { id: 1 },
      getURL: () => 'https://controlled.test/', isDestroyed: () => false,
      executeJavaScript: vi.fn(async () => ({ selection: 'Selected text', page: '', title: 'Controlled', url: 'https://controlled.test/' })) });
    fake.guests.set(42, guest);
    await controller.request(event, { schemaVersion: 1, operation: 'selectedContext', scope,
      payload: { guestWebContentsId: 42, includePage: false } });
    const call = api.mock.calls.find(c => c[0] === 'selectedContext')!;
    expect(call[2]).toMatchObject({ guestWebContentsId: 42, navigationEpoch: 0, content: { selection: 'Selected text', page: '' } });
    expect(guest.executeJavaScript.mock.calls[0][0]).toContain("page: ''");
    guest.hostWebContents.id = 2;
    await expect(controller.request(event, { schemaVersion: 1, operation: 'selectedContext', scope,
      payload: { guestWebContentsId: 42, includePage: false } })).rejects.toThrow(/authorized target/);
  });
  it('rejects navigation to the same URL during capture by navigation epoch, not URL equality alone', async () => {
    await resolve();
    const guest = Object.assign(new EventEmitter(), { id: 42, session: fake.session, hostWebContents: { id: 1 },
      getURL: () => 'https://controlled.test/', isDestroyed: () => false, executeJavaScript: async () => {
        guest.emit('did-start-navigation', {}, 'https://controlled.test/', false, true); return { selection: 'old document' };
      } }); fake.guests.set(42, guest);
    await expect(controller.request(event, { schemaVersion: 1, operation: 'selectedContext', scope,
      payload: { guestWebContentsId: 42, includePage: true } })).rejects.toThrow(/changed during extraction/);
    expect(api.mock.calls.some(c => c[0] === 'selectedContext')).toBe(false);
  });
  function selectedGuest() {
    const document = { selection: 'Original selected text', page: '', title: 'Controlled', url: 'https://controlled.test/' };
    const guest = Object.assign(new EventEmitter(), { id: 42, session: fake.session, hostWebContents: { id: 1 }, destroyed: false,
      getURL: () => document.url, isDestroyed: () => guest.destroyed,
      executeJavaScript: vi.fn(async () => ({ ...document })) });
    fake.guests.set(42, guest); return { guest, document };
  }
  const captureSelected = () => controller.request(event, { schemaVersion: 1, operation: 'selectedContext', scope,
    payload: { guestWebContentsId: 42, includePage: false } }) as Promise<{ ref: string }>;
  const turnWith = (refs: unknown, selectedScope = scope) => controller.request(event,
    { schemaVersion: 1, operation: 'assistantTurn', scope: selectedScope, payload: { message: 'Use my selection', selectedContextRefs: refs } });
  it.each(['same-url-navigation', 'new-url', 'closed', 'id-reused', 'new-partition', 'new-owner', 'renderer-reload'])
    ('rejects a captured reference after %s before calling Backend or model', async change => {
      await resolve(); const { guest, document } = selectedGuest(); const captured = await captureSelected();
      api.mockClear();
      if (change === 'same-url-navigation') guest.emit('did-start-navigation', {}, document.url, false, true);
      if (change === 'new-url') document.url += 'new-document';
      if (change === 'closed') guest.destroyed = true;
      if (change === 'id-reused') fake.guests.set(42, { ...guest });
      if (change === 'new-partition') guest.session = {};
      if (change === 'new-owner') guest.hostWebContents.id = 2;
      if (change === 'renderer-reload') {
        const frame = { url: 'app://bundle/index.html', isDestroyed: () => false };
        event.sender.mainFrame = frame; event.senderFrame = frame;
      }
      await expect(turnWith([captured.ref])).rejects.toThrow(/Selected page reference/);
      expect(api).not.toHaveBeenCalled();
    });
  it('checks the same guest again after the capture API response and never registers a changed document', async () => {
    await resolve(); const { guest, document } = selectedGuest(); const native = api.getMockImplementation()!;
    api.mockImplementation(async (...args: any[]) => {
      const result = await native(...args);
      if (args[0] === 'selectedContext') guest.emit('did-start-navigation', {}, document.url, false, true);
      return result;
    });
    await expect(captureSelected()).rejects.toThrow(/no longer valid/);
    expect((controller as any).selectedCaptures.size).toBe(0); api.mockClear();
    await expect(turnWith(['0'.repeat(31) + '1'])).rejects.toThrow(/unknown or expired/);
    expect(api).not.toHaveBeenCalled();
  });
  it('refuses a captured reference in another known Space without forwarding a turn', async () => {
    await resolve(); selectedGuest(); const captured = await captureSelected();
    const other = { ...scope, spaceId: 'native-b' }, otherPath = 'C:/controlled/account-b';
    api.mockImplementation(async (operation, _scope, payload, profile) => operation === 'browser.spacePaths'
      ? { knownSpacePaths: [workspace, otherPath] }
      : { schemaVersion: 1, scope: other, workspacePath: otherPath, partitionKey: payload.partitionKey,
        bindingRevision: 1, backendProfileName: profile, spaceName: 'B' });
    await resolve({ workspacePath: otherPath }); api.mockClear();
    await expect(turnWith([captured.ref], other)).rejects.toThrow(/no longer valid/);
    expect(api).not.toHaveBeenCalled();
  });
  it('expires references using the monotonic 120-second limit and bounds retained references to 128', async () => {
    await resolve(); selectedGuest(); const now = performance.now(); const clock = vi.spyOn(performance, 'now').mockReturnValue(now);
    let first = '', last = '';
    for (let index = 0; index < 129; index++) {
      const value = await captureSelected(); first ||= value.ref; last = value.ref;
    }
    expect((controller as any).selectedCaptures.size).toBe(128); api.mockClear();
    await expect(turnWith([first])).rejects.toThrow(/unknown or expired/); expect(api).not.toHaveBeenCalled();
    clock.mockReturnValue(now + 120001);
    await expect(turnWith([last])).rejects.toThrow(/unknown or expired/);
    expect(api).not.toHaveBeenCalled(); expect((controller as any).selectedCaptures.size).toBe(0);
  });
  it('uses the original immutable user-selected snapshot once accepted, and rejects invented reference lists', async () => {
    await resolve(); const { guest, document } = selectedGuest(); const captured = await captureSelected();
    const capturedPayload = structuredClone(api.mock.calls.find(call => call[0] === 'selectedContext')![2]);
    document.selection = 'New unrelated content'; api.mockClear();
    for (const refs of [null, 'invented', ['f'.repeat(32)], [captured.ref, captured.ref], Array(5).fill(captured.ref)]) {
      await expect(turnWith(refs)).rejects.toThrow();
    }
    expect(api).not.toHaveBeenCalled();
    api.mockImplementation(async (operation: string) => {
      if (operation === 'browser.handshake') return { runnerGeneration: 'controlled-runner-generation' };
      if (operation === 'browser.shutdown') return { closed: true };
      guest.emit('did-start-navigation', {}, document.url, false, true);
      return { schemaVersion: 1, scope };
    });
    await expect(turnWith([captured.ref])).resolves.toMatchObject({ scope });
    expect(api).toHaveBeenCalledWith('assistantTurn', scope,
      { message: 'Use my selection', selectedContextRefs: [captured.ref] }, 'default');
    expect(capturedPayload.content.selection).toBe('Original selected text');
    expect(guest.executeJavaScript).toHaveBeenCalledOnce();
  });
  function browserHost() {
    const lease = { leaseId: 'lease-a', runId: 'run-a', scope, navigationEpoch: 4, permissionEpoch: 2, state: 'paused', visible: false };
    const host = { list: () => [lease], requestPause: vi.fn(async () => lease), snapshot: vi.fn(() => ({ ...lease })),
      takeover: vi.fn(async () => ({ ...lease, visible: true })), resume: vi.fn(), closeAll: vi.fn(async () => {}) };
    (controller as any).host = host;
    return { host, lease };
  }
  it('closes the browser gate before revision-bound backend pause and waits for the actual checkpoint to show it', async () => {
    await resolve(); const { host } = browserHost();
    api.mockImplementation(async operation => {
      if (operation === 'activity') {
        expect(host.requestPause).toHaveBeenCalledOnce();
        return { runs: [{ runId: 'run-a', scope, state: 'running', stateRevision: 7 }] };
      }
      return { runId: 'run-a', scope, state: 'pausing', stateRevision: 8 };
    });
    const first: any = await controller.request(event, { schemaVersion: 1, operation: 'takeover', scope,
      payload: { runId: 'run-a', clientRequestId: 'pause-a' } });
    expect(first.visible).toBe(false); expect(host.takeover).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith('runControl', scope,
      { runId: 'run-a', command: 'pause', expectedRevision: 7, clientRequestId: 'pause-a' }, 'default');
    api.mockImplementation(async () => ({ runs: [{ runId: 'run-a', scope, state: 'paused', stateRevision: 9 }] }));
    const second: any = await controller.request(event, { schemaVersion: 1, operation: 'takeover', scope, payload: { runId: 'run-a' } });
    expect(second.visible).toBe(true); expect(host.takeover).toHaveBeenCalledOnce();
  });
  it('validates resume epochs before backend CAS and lets backend admission perform the single gateway resume', async () => {
    await resolve(); const { host } = browserHost(); api.mockClear();
    const request = { schemaVersion: 1, operation: 'resumeBrowser', scope,
      payload: { runId: 'run-a', navigationEpoch: 4, permissionEpoch: 2, clientRequestId: 'resume-a' } };
    await expect(controller.request(event, { ...request, payload: { ...request.payload, navigationEpoch: 3 } })).rejects.toThrow(/changed/);
    expect(api).not.toHaveBeenCalled();
    api.mockImplementation(async operation => operation === 'activity'
      ? { runs: [{ runId: 'run-a', scope, state: 'paused', stateRevision: 9 }] }
      : { runId: 'run-a', scope, state: 'queued', stateRevision: 10 });
    const result: any = await controller.request(event, request);
    expect(api).toHaveBeenCalledWith('runControl', scope,
      { runId: 'run-a', command: 'resume', expectedRevision: 9, clientRequestId: 'resume-a' }, 'default');
    expect(result.state).toBe('paused'); expect(host.resume).not.toHaveBeenCalled();
  });
  it('keeps the paused browser gate closed when backend revision admission fails', async () => {
    await resolve(); const { host } = browserHost();
    api.mockImplementation(async operation => {
      if (operation === 'activity') return { runs: [{ runId: 'run-a', scope, state: 'paused', stateRevision: 9 }] };
      throw new Error('Run state changed');
    });
    await expect(controller.request(event, { schemaVersion: 1, operation: 'resumeBrowser', scope,
      payload: { runId: 'run-a', navigationEpoch: 4, permissionEpoch: 2 } })).rejects.toThrow(/state changed/);
    expect(host.resume).not.toHaveBeenCalled();
  });
  it('closes old targets when the authenticated heartbeat reports a new runner generation', async () => {
    const closeAll = vi.fn(async () => { expect((controller as any).generation).toBeUndefined(); }), stop = vi.fn(async () => {});
    (controller as any).host = { mainGeneration: 'main-old', closeAll };
    (controller as any).gateway = { stop }; (controller as any).generation = 'runner-old';
    api.mockImplementation(async () => ({ runnerGeneration: 'runner-new' }));
    await (controller as any).tick();
    expect(api).toHaveBeenCalledWith('browser.heartbeat', null, { mainGeneration: 'main-old', runnerGeneration: 'runner-old' }, '');
    expect(closeAll).toHaveBeenCalledWith('runner_restarted'); expect(stop).toHaveBeenCalledOnce();
    expect((controller as any).host).toBeUndefined();
  });
  it('keeps every execution Session request owned and denied across idle, generation loss and controller disconnect', async () => {
    const target = fake.session, other = {} as any;
    (controller as any).executionSessions.add(target);
    expect(controller.requestPolicy({ url: 'https://controlled.test/worker' }, target)).toEqual({ owned: true, allowed: false });
    const allowsSessionRequest = vi.fn(() => true), closeAll = vi.fn(async () => {});
    (controller as any).host = { allowsSessionRequest, closeAll }; (controller as any).generation = 'runner-live';
    expect(controller.requestPolicy({ url: 'https://controlled.test/worker', webContentsId: 0 }, target))
      .toEqual({ owned: true, allowed: true });
    expect(controller.requestPolicy({ url: 'https://controlled.test/user-worker' }, other)).toEqual({ owned: false, allowed: true });
    (controller as any).quarantinedExecutionSessions.add(target);
    expect(controller.requestPolicy({ url: 'https://controlled.test/worker' }, target)).toEqual({ owned: true, allowed: false });
    await controller.disconnect('lost_channel');
    expect(controller.requestPolicy({ url: 'https://controlled.test/late-worker' }, target)).toEqual({ owned: true, allowed: false });
  });
  it('ignores a late failed event from the disconnected host instead of closing its replacement', async () => {
    await resolve();
    const oldHost = { mainGeneration: 'main-old', closeAll: vi.fn(async () => {}) };
    (controller as any).host = oldHost;
    let rejectEvent!: (reason: Error) => void;
    api.mockImplementation(() => new Promise((_resolve, reject) => { rejectEvent = reject; }));
    const pending = (controller as any).event({ kind: 'paused', lease: { scope, mainGeneration: 'main-old', runnerGeneration: 'runner-old' } });
    await controller.disconnect('replace_host');
    const newHost = { mainGeneration: 'main-new', closeAll: vi.fn(async () => {}) };
    (controller as any).host = newHost;
    rejectEvent(new Error('Old backend stopped')); await pending;
    expect(newHost.closeAll).not.toHaveBeenCalled(); expect((controller as any).host).toBe(newHost);
    const call = api.mock.calls.find(call => call[0] === 'browser.event')!;
    expect(call[2]).toMatchObject({ mainGeneration: 'main-old', runnerGeneration: 'runner-old' });
    api.mockReset();
  });
  it('releases the gateway and reports unconfirmed target cleanup instead of acknowledging success', async () => {
    const stop = vi.fn(async () => {});
    (controller as any).host = { closeAll: vi.fn(async () => { throw new Error('Target cleanup unconfirmed'); }) };
    (controller as any).gateway = { stop }; (controller as any).generation = 'runner-old';
    await expect(controller.disconnect('cleanup_probe')).rejects.toThrow(/cleanup unconfirmed/);
    expect(stop).toHaveBeenCalledOnce(); expect((controller as any).generation).toBeUndefined();
  });
});

describe('work admission after a failed boot handshake', () => {
  it('recovers from a real loopback refusal when the local HTTP service becomes ready later', async () => {
    const reservation = createServer();
    await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));

    let received = 0;
    const delayedService = createServer((_request, response) => {
      received++;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ runnerGeneration: 'delayed-http-ready' }));
    });
    let refusedBeforeListening = 0;
    let listeningConfirmed = false;
    const original = api.getMockImplementation()!;
    const { independentApiRequest } = await import('../src/main/sidekick-api.js');
    api.mockImplementation(async (operation: string, selected: unknown, payload: unknown, profile: string) => {
      if (operation !== 'browser.handshake') return original(operation, selected, payload, profile);
      try {
        const result = await independentApiRequest(`http://127.0.0.1:${port}`, operation, null, payload, profile, 'controlled-private-nonce');
        expect(listeningConfirmed).toBe(true);
        return result;
      } catch (error) {
        expect(delayedService.listening).toBe(false);
        expect(error).toMatchObject({ code: 'sidekick_not_ready', retryable: true });
        refusedBeforeListening++;
        await new Promise<void>((resolve, reject) => {
          delayedService.once('error', reject);
          delayedService.listen(port, '127.0.0.1', () => { listeningConfirmed = true; resolve(); });
        });
        throw error;
      }
    });
    try {
      await controller.start();
    } finally {
      if (delayedService.listening) await new Promise<void>(resolve => delayedService.close(() => resolve()));
    }
    expect(refusedBeforeListening).toBe(1);
    expect(listeningConfirmed).toBe(true);
    expect(api.mock.calls.filter(call => call[0] === 'browser.handshake').length).toBeGreaterThan(1);
    expect(received).toBe(1);
    expect(api.mock.calls.some(call => call[0] === 'assistantTurn' || call[0] === 'dispatch')).toBe(false);
  });

  it('retries refused startup handshakes and forwards the assistant order once after readiness', async () => {
    const original = api.getMockImplementation()!;
    let refused = 0;
    api.mockImplementation(async (...args: any[]) => {
      if (args[0] === 'browser.handshake' && refused++ < 3) {
        throw Object.assign(new Error('The local Sidekick service is starting.'), { code: 'sidekick_not_ready', retryable: true });
      }
      return original(...args as [string, unknown, any, string]);
    });
    await controller.start();
    await resolve();
    await controller.request(event, { schemaVersion: 1, operation: 'assistantTurn', scope, payload: { message: 'Start work' } });
    const operations = api.mock.calls.map(call => call[0]);
    expect(operations.filter(name => name === 'browser.handshake')).toHaveLength(4);
    expect(operations.filter(name => name === 'assistantTurn')).toHaveLength(1);
    expect(operations.lastIndexOf('browser.handshake')).toBeLessThan(operations.indexOf('assistantTurn'));
  });
  it('does not retry non-readiness handshake failures', async () => {
    api.mockImplementation(async (operation: string) => {
      if (operation === 'browser.handshake') throw new Error('Invalid handshake contract');
      return { runnerGeneration: 'unused' };
    });
    await expect(controller.start()).rejects.toThrow('Invalid handshake contract');
    expect(api.mock.calls.filter(call => call[0] === 'browser.handshake')).toHaveLength(1);
  });
  it('does not dispatch when the broker cannot reconnect', async () => {
    await resolve();
    vi.spyOn(controller, 'start').mockRejectedValue(new Error('Broker unavailable'));
    await expect(controller.request(event, { schemaVersion: 1, operation: 'dispatch', scope, payload: {} })).rejects.toThrow('Broker unavailable');
    expect(api.mock.calls.some(call => call[0] === 'dispatch')).toBe(false);
  });
});

describe('Independent backend profile isolation and binding security', () => {
  it('retrieves backendProfiles and profileBindings via IPC', async () => {
    const res = await controller.request(event, { schemaVersion: 1, operation: 'backendProfiles' });
    expect(res).toEqual({
      schemaVersion: 1,
      profiles: [
        { name: 'default', isDefault: true },
        { name: 'other', isDefault: false },
        { name: 'alpha', isDefault: false },
        { name: 'beta', isDefault: false },
      ],
    });

    const bindingsRes = await controller.request(event, {
      schemaVersion: 1,
      operation: 'profileBindings',
      payload: { browserProfileId: 'default' },
    });
    expect(bindingsRes.schemaVersion).toBe(1);
    expect(Array.isArray(bindingsRes.bindings)).toBe(true);

    await expect(controller.request(event, {
      schemaVersion: 1,
      operation: 'profileBindings',
      payload: { browserProfileId: 'unknown_browser_profile' },
    })).rejects.toThrow(/Unknown browser profile/);
  });

  it('binds explicit allowed backend profile alpha and rejects unknown profile or directory traversal', async () => {
    const alphaRes = await controller.request(event, {
      schemaVersion: 1,
      operation: 'resolveScope',
      backendProfileName: 'alpha',
      payload: { workspacePath: workspace, browserProfileId: 'default' },
    });
    expect(alphaRes.backendProfileName).toBe('alpha');

    await expect(controller.request(event, {
      schemaVersion: 1,
      operation: 'resolveScope',
      backendProfileName: 'nonexistent',
      payload: { workspacePath: 'C:/other-workspace', browserProfileId: 'default' },
    })).rejects.toThrow(/Unknown backend profile/);

    await expect(controller.request(event, {
      schemaVersion: 1,
      operation: 'resolveScope',
      backendProfileName: '../traversal',
      payload: { workspacePath: 'C:/other-workspace', browserProfileId: 'default' },
    })).rejects.toThrow(/Unknown backend profile/);
  });

  it('rejects untrusted sender or destroyed frame on backendProfiles and resolveScope', async () => {
    const badSenderEvent = { sender: { id: 99, isDestroyed: () => false }, senderFrame: event.senderFrame };
    await expect(controller.request(badSenderEvent, {
      schemaVersion: 1,
      operation: 'backendProfiles',
    })).rejects.toThrow(/Untrusted IPC sender/);

    const destroyedEvent = { sender: { id: 1, isDestroyed: () => true }, senderFrame: event.senderFrame };
    await expect(controller.request(destroyedEvent, {
      schemaVersion: 1,
      operation: 'backendProfiles',
    })).rejects.toThrow(/Untrusted IPC sender/);

    const destroyedFrameEvent = { sender: event.sender, senderFrame: { ...event.senderFrame, isDestroyed: () => true } };
    await expect(controller.request(destroyedFrameEvent, {
      schemaVersion: 1,
      operation: 'backendProfiles',
    })).rejects.toThrow(/Untrusted IPC sender/);
  });

  it('enforces A->B->A switching: binds separate spaces to alpha and beta, keeps them isolated', async () => {
    const originalApi = api.getMockImplementation()!;
    api.mockImplementation(async (op, s, p, prof) => {
      if (op === 'browser.spacePaths') return { knownSpacePaths: [workspace, 'C:/controlled/space-alpha', 'C:/controlled/space-beta'] };
      if (op === 'resolveScope') {
        const spaceId = p.workspacePath === 'C:/controlled/space-alpha' ? 'space-alpha' : p.workspacePath === 'C:/controlled/space-beta' ? 'space-beta' : 'native-a';
        return {
          schemaVersion: 1,
          scope: { spaceId, backendProfileId: `backend-${prof}`, browserProfileId: p.browserProfileId },
          spaceName: `Space ${prof}`,
          workspacePath: p.workspacePath,
          bindingRevision: 1,
          setupStatus: 'legacy',
          partitionKey: p.partitionKey,
          backendProfileName: prof,
          knownSpacePaths: [workspace, 'C:/controlled/space-alpha', 'C:/controlled/space-beta'],
        };
      }
      return originalApi(op, s, p, prof);
    });

    const alphaRes = await controller.request(event, {
      schemaVersion: 1,
      operation: 'resolveScope',
      backendProfileName: 'alpha',
      payload: { workspacePath: 'C:/controlled/space-alpha', browserProfileId: 'default' },
    });
    expect(alphaRes.backendProfileName).toBe('alpha');
    const bindingAlpha = await controller.lookupBinding('default', 'C:/controlled/space-alpha', 'alpha');
    expect(bindingAlpha?.backendProfileName).toBe('alpha');

    const betaRes = await controller.request(event, {
      schemaVersion: 1,
      operation: 'resolveScope',
      backendProfileName: 'beta',
      payload: { workspacePath: 'C:/controlled/space-beta', browserProfileId: 'default' },
    });
    expect(betaRes.backendProfileName).toBe('beta');
    const bindingBeta = await controller.lookupBinding('default', 'C:/controlled/space-beta', 'beta');
    expect(bindingBeta?.backendProfileName).toBe('beta');

    expect(await controller.lookupBinding('default', 'C:/controlled/space-alpha', 'beta')).toBeNull();
    expect(await controller.lookupBinding('default', 'C:/controlled/space-beta', 'alpha')).toBeNull();

    const alphaResumed = await controller.request(event, {
      schemaVersion: 1,
      operation: 'resolveScope',
      scope: alphaRes.scope,
      payload: { workspacePath: 'C:/controlled/space-alpha', browserProfileId: 'default' },
    });
    expect(alphaResumed.backendProfileName).toBe('alpha');
  });

  it('preserves in-flight space binding and backend profile when another space binds to different profile', async () => {
    const originalApi = api.getMockImplementation()!;
    api.mockImplementation(async (op, s, p, prof) => {
      if (op === 'browser.spacePaths') return { knownSpacePaths: [workspace, 'C:/controlled/space-alpha', 'C:/controlled/space-beta'] };
      if (op === 'resolveScope') {
        const spaceId = p.workspacePath === 'C:/controlled/space-alpha' ? 'space-alpha' : p.workspacePath === 'C:/controlled/space-beta' ? 'space-beta' : 'native-a';
        return {
          schemaVersion: 1,
          scope: { spaceId, backendProfileId: `backend-${prof}`, browserProfileId: p.browserProfileId },
          spaceName: `Space ${prof}`,
          workspacePath: p.workspacePath,
          bindingRevision: 1,
          setupStatus: 'legacy',
          partitionKey: p.partitionKey,
          backendProfileName: prof,
          knownSpacePaths: [workspace, 'C:/controlled/space-alpha', 'C:/controlled/space-beta'],
        };
      }
      return originalApi(op, s, p, prof);
    });

    const alphaRes = await controller.request(event, {
      schemaVersion: 1,
      operation: 'resolveScope',
      backendProfileName: 'alpha',
      payload: { workspacePath: 'C:/controlled/space-alpha', browserProfileId: 'default' },
    });

    await controller.request(event, {
      schemaVersion: 1,
      operation: 'assistantTurn',
      scope: alphaRes.scope,
      payload: { message: 'Order for Alpha' },
    });
    expect(api).toHaveBeenLastCalledWith('assistantTurn', alphaRes.scope, { message: 'Order for Alpha' }, 'alpha');

    const betaRes = await controller.request(event, {
      schemaVersion: 1,
      operation: 'resolveScope',
      backendProfileName: 'beta',
      payload: { workspacePath: 'C:/controlled/space-beta', browserProfileId: 'default' },
    });

    await controller.request(event, {
      schemaVersion: 1,
      operation: 'assistantTurn',
      scope: alphaRes.scope,
      payload: { message: 'Second order for Alpha' },
    });
    expect(api).toHaveBeenLastCalledWith('assistantTurn', alphaRes.scope, { message: 'Second order for Alpha' }, 'alpha');

    await controller.request(event, {
      schemaVersion: 1,
      operation: 'assistantTurn',
      scope: betaRes.scope,
      payload: { message: 'Order for Beta' },
    });
    expect(api).toHaveBeenLastCalledWith('assistantTurn', betaRes.scope, { message: 'Order for Beta' }, 'beta');
  });
});


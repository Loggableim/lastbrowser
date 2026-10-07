import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
vi.mock('electron', () => ({}));
import { LocalAiController, localAiCachePathIsLegacySafe } from '../src/main/local-ai-controller.js';

const scope = { backendProfileId: 'backend-a', spaceId: 'space-a', browserProfileId: 'browser-a' };
const binding = { scope, backendProfileName: 'frozen-profile' };
const canonical = (value: any): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const digest = (value: any) => createHash('sha256').update(canonical(value)).digest('hex');
const licenseDigest = digest('controlled-license'), jobId = randomUUID().replaceAll('-', '');
let directory: string, controller: LocalAiController, api: ReturnType<typeof vi.fn>, owner: any, plan: any;
const invoke = (request: any, selected = binding) => controller.request(selected, { action: 'setup', request }, () => owner);
const planRequest = () => ({ operation: 'plan', expectedRevision: 1, clientRequestId: randomUUID() });
const confirmRequest = () => ({ operation: 'confirm', planDigest: plan.planDigest, licenseDigests: [licenseDigest], clientRequestId: randomUUID() });
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'lb-local-setup-'));
  owner = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false });
  const content = { schemaVersion: 1, scope, planId: randomUUID().replaceAll('-', ''), setupRevision: 1,
    catalogRevision: 'controlled', artifacts: [{ artifactId: 'controlled', licenseDigest }], totalBytes: 12,
    createdAt: new Date().toISOString(), executionUnavailable: true };
  plan = { ...content, planDigest: digest(content) };
  api = vi.fn(async (_operation, selected, payload) => {
    const request = payload.request, result: any = { schemaVersion: 1, scope: selected, operation: request.operation, skipAvailable: true, existingProviderAvailable: true };
    if (request.operation === 'get' || request.operation === 'select') result.preferences = { schemaVersion: 1, scope: selected, revision: 1, decision: 'local' };
    if (request.operation === 'plan') result.plan = plan;
    if (request.operation === 'confirm') result.consent = { scope: selected, planDigest: request.planDigest, licenseDigests: request.licenseDigests, authority: 'private_human_action' };
    if (['start', 'cancel', 'status'].includes(request.operation)) result.job = { schemaVersion: 1, scope: selected,
      jobId, planDigest: plan.planDigest, state: request.operation === 'cancel' ? 'stopping' : 'pending', executionUnavailable: true };
    return result;
  });
  controller = new LocalAiController({ userDataDir: directory, apiRequest: api });
});

describe('Main-owned productive role preferences', () => {
  const roles = (request: any, selected = binding) => controller.request(selected, { action: 'roleProfile', request }, () => owner);
  const choice = () => ({ expectedRevision: 0, setupRevision: 1, planDigest: plan.planDigest,
    clientRequestId: randomUUID(), selections: [{ task: 'browser.extract', artifactId: 'controlled', contextTokens: 2048 }] });
  beforeEach(() => {
    api.mockImplementation(async (operation, selected, payload) => {
      if (operation === 'localAi.setup') return { schemaVersion: 1, scope: selected, operation: payload.request.operation,
        preferences: { schemaVersion: 1, scope: selected, revision: 2, decision: 'skip' }, skipAvailable: true, existingProviderAvailable: true };
      const profile = payload.operation === 'draft' ? { scope: selected, expectedRevision: 0, profileRevision: 'profile-v1', setupRevision: 1,
        planDigest: plan.planDigest, available: false, choices: [{ task: 'browser.extract', artifactId: 'controlled', artifactRevision: 'pinned-v1',
          state: 'prepared', reasonCodes: [], available: false }, { task: 'agent', artifactId: 'blocked', artifactRevision: 'pinned-v1',
          state: 'blocked', reasonCodes: ['missing_weights'], available: false }] }
        : { schemaVersion: 1, scope: selected, revision: payload.operation === 'confirm' ? 1 : 0, setupRevision: 1,
          planDigest: plan.planDigest, actor: 'frozen-profile', selections: payload.choice?.selections ?? [],
          artifactRevisions: { controlled: 'pinned-v1' }, confirmedAt: null, available: false };
      return { schemaVersion: 1, scope: selected, kind: 'role_profile', operation: payload.operation, profile };
    });
  });
  const draft = () => roles({ operation: 'draft', planDigest: plan.planDigest });
  it('binds human confirmation to the actual reviewed scope and Main actor without runtime side effects', async () => {
    await expect(roles({ operation: 'confirm', choice: choice() })).rejects.toThrow(/Review/);
    expect(api).not.toHaveBeenCalled();
    await draft(); const selected = choice(); await roles({ operation: 'confirm', choice: selected });
    expect(api).toHaveBeenLastCalledWith('localAi.roleProfile', scope, { operation: 'confirm', choice: selected,
      confirmationDigest: digest({ actor: binding.backendProfileName, choice: selected }) }, 'frozen-profile');
    expect(await readdir(directory)).toEqual([]);
  });
  it('rejects blocked tasks, forged authority and navigation or profile changes before dispatch', async () => {
    await draft(); api.mockClear();
    await expect(roles({ operation: 'confirm', choice: { ...choice(), selections: [{ task: 'agent', artifactId: 'blocked', contextTokens: 2048 }] } })).rejects.toThrow(/Review/);
    await expect(roles({ operation: 'confirm', choice: { ...choice(), confirmationDigest: digest('forged') } })).rejects.toThrow();
    await expect(roles({ operation: 'confirm', choice: choice() }, { ...binding, backendProfileName: 'different' })).rejects.toThrow(/Review/);
    owner.emit('did-start-navigation', {}, '', false, true);
    await expect(roles({ operation: 'confirm', choice: choice() })).rejects.toThrow(/Review/);
    expect(api).not.toHaveBeenCalled();
  });
  it('rejects a draft that returns after a concurrent setup selection', async () => {
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => {
      const result = await normal(...args);
      if (args[0] === 'localAi.roleProfile') await invoke({ operation: 'select', choice: { decision: 'skip', expectedRevision: 1, clientRequestId: randomUUID() } });
      return result;
    });
    await expect(draft()).rejects.toThrow(/review changed/);
    api.mockImplementation(normal); api.mockClear();
    await expect(roles({ operation: 'confirm', choice: choice() })).rejects.toThrow(/Review/);
    expect(api).not.toHaveBeenCalled();
  });
  it('rejects foreign scope or changed selections in the confirmation response', async () => {
    await draft(); const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { const result = await normal(...args); result.profile.scope = { ...scope, spaceId: 'foreign' }; return result; });
    await expect(roles({ operation: 'confirm', choice: choice() })).rejects.toThrow(/Scope/);
    api.mockImplementation(async (...args) => { const result = await normal(...args); result.profile.selections = []; return result; });
    await expect(roles({ operation: 'confirm', choice: choice() })).rejects.toThrow(/selected tasks/);
  });
});
afterEach(async () => { vi.restoreAllMocks(); expect(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)).toBe(true);
  await rm(directory, { recursive: true, force: true }); });

describe('Main-owned Local AI setup review and download purpose', () => {
  it('requires an actual returned immutable plan before a separate confirmation and never forwards authority booleans', async () => {
    await expect(invoke(confirmRequest())).rejects.toThrow(/Review this exact/); expect(api).not.toHaveBeenCalled();
    await invoke(planRequest()); await invoke(confirmRequest());
    expect(api).toHaveBeenLastCalledWith('localAi.setup', scope, { request: expect.objectContaining({ operation: 'confirm', planDigest: plan.planDigest }) }, 'frozen-profile');
    expect(api.mock.calls[1][2]).not.toHaveProperty('privateHumanAction');
    await expect(invoke({ ...confirmRequest(), explicitValidatedConsent: true })).rejects.toThrow(/authority/);
    expect(api).toHaveBeenCalledTimes(2);
  });
  it('rejects modified plans, wrong licenses and foreign profiles before confirmation IO', async () => {
    const original = structuredClone(plan); plan.totalBytes++;
    await expect(invoke(planRequest())).rejects.toThrow(/digest/);
    plan = original; await invoke(planRequest()); api.mockClear();
    await expect(invoke({ ...confirmRequest(), licenseDigests: [digest('other-license')] })).rejects.toThrow(/Review this exact/);
    await expect(invoke(confirmRequest(), { ...binding, backendProfileName: 'other-profile' })).rejects.toThrow(/Review this exact/);
    await expect(invoke(confirmRequest(), { ...binding, scope: { ...scope, spaceId: 'other-space' } })).rejects.toThrow(/Review this exact/);
    expect(api).not.toHaveBeenCalled();
  });
  it('invalidates review on navigation even when Electron preserves the same mainFrame object', async () => {
    await invoke(planRequest()); api.mockClear();
    owner.emit('did-start-navigation', {}, 'app://bundle/index.html', false, true);
    await expect(invoke(confirmRequest())).rejects.toThrow(/Review this exact/); expect(api).not.toHaveBeenCalled();
    await invoke(planRequest()); await invoke(confirmRequest());
  });
  it('rejects a changed frame during plan response and during confirmation ACK', async () => {
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { const result = await normal(...args); owner.mainFrame = {}; return result; });
    await expect(invoke(planRequest())).rejects.toThrow(/Assistant changed/);
    api.mockImplementation(normal); await invoke(planRequest());
    api.mockImplementation(async (...args) => { const result = await normal(...args); owner.emit('did-start-navigation', {}, '', false, true); return result; });
    await expect(invoke(confirmRequest())).rejects.toThrow(/Review this exact/);
  });
  it('invalidates the displayed plan immediately when a concurrent selection begins', async () => {
    await invoke(planRequest()); api.mockClear();
    await invoke({ operation: 'select', choice: { decision: 'skip', expectedRevision: 1, clientRequestId: randomUUID() } });
    await expect(invoke(confirmRequest())).rejects.toThrow(/Review this exact/);
    expect(api).toHaveBeenCalledTimes(1); expect(api.mock.calls[0][2]).not.toHaveProperty('cacheRoot');
  });
  it('captures only the canonical Main cache on start and keeps status usable after controller reload', async () => {
    await invoke({ operation: 'get' }); expect(await readdir(directory)).toEqual([]);
    await invoke({ operation: 'start', planDigest: plan.planDigest, clientRequestId: randomUUID() });
    expect(api).toHaveBeenLastCalledWith('localAi.setup', scope, { request: expect.objectContaining({ operation: 'start' }),
      cacheRoot: path.join(directory, 'local-ai', 'cache') }, 'frozen-profile');
    controller = new LocalAiController({ userDataDir: directory, apiRequest: api });
    await invoke({ operation: 'status', jobId });
    const cancelled = await invoke({ operation: 'cancel', jobId, clientRequestId: randomUUID() });
    expect(cancelled.job.state).toBe('stopping'); expect(cancelled.job.executionUnavailable).toBe(true);
    await expect(invoke(confirmRequest())).rejects.toThrow(/Review this exact/);
  });
  it('rejects caller paths, scope, URLs, malformed identifiers and generic human flags before dispatch', async () => {
    for (const field of ['cacheRoot', 'scope', 'url', 'exePath', 'privateHumanAction'])
      await expect(invoke({ operation: 'get', [field]: directory })).rejects.toThrow();
    await expect(invoke({ operation: 'start', planDigest: plan.planDigest, clientRequestId: 'invented' })).rejects.toThrow(/UUID/);
    await expect(controller.request(binding, { action: 'setup', request: { operation: 'get' }, cacheRoot: directory }, () => owner)).rejects.toThrow();
    expect(api).not.toHaveBeenCalled(); expect(await readdir(directory)).toEqual([]);
  });
  it('refuses a junction cache before download start and leaves its target untouched', async () => {
    const target = path.join(directory, 'outside'); await mkdir(target); await symlink(target, path.join(directory, 'local-ai'), 'junction');
    await expect(invoke({ operation: 'start', planDigest: plan.planDigest, clientRequestId: randomUUID() })).rejects.toThrow(/own directory/);
    expect(api).not.toHaveBeenCalled(); expect(await readdir(target)).toEqual([]);
  });
  it('rejects foreign nested preferences and job snapshots even with a valid outer scope', async () => {
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { const result = await normal(...args); result.preferences.scope = { ...scope, spaceId: 'foreign' }; return result; });
    await expect(invoke({ operation: 'get' })).rejects.toThrow(/another Space/);
    api.mockImplementation(async (...args) => { const result = await normal(...args); result.job.scope = { ...scope, spaceId: 'foreign' }; return result; });
    await expect(invoke({ operation: 'status', jobId })).rejects.toThrow(/this Space/);
  });
});

describe('installation-wide Local AI first-run bootstrap', () => {
  const status = () => ({ schemaVersion: 1, installKey: 'router-lfm2.5-230m-qad-q4_0-v1', revision: 1,
    state: 'idle', jobId: null, attempt: 0, downloadedBytes: 0, verifiedBytes: 0, totalBytes: 149091630,
    artifactId: 'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0', artifactRevision: 'b27f8147d98080b0d6f063ff41de6e381ea9a530',
    sha256: 'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292', licenseLabel: 'LFM Open License v1.0',
    licenseUrl: 'https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE',
    commercialThresholdUsd: 10000000, executionUnavailable: true, errorCode: null, updatedAt: new Date().toISOString() });
  it('uses only the Main-owned cache and default installation scope, and validates the pinned response', async () => {
    const response = status(); api.mockResolvedValue(response);
    await expect(controller.bootstrap({ action: 'status' }, () => owner)).resolves.toEqual(response);
    expect(api).toHaveBeenCalledWith('localAi.bootstrap', null,
      { action: 'status', cacheRoot: path.join(directory, 'local-ai', 'cache') }, 'default');
    await expect(controller.bootstrap({ action: 'status', policyId: 'forged' }, () => owner)).rejects.toThrow();
    response.artifactId = 'foreign-model';
    await expect(controller.bootstrap({ action: 'status' }, () => owner)).rejects.toThrow(/status is invalid/);
  });
  it('requires a request id for cancellation and never dispatches a renderer-selected path', async () => {
    api.mockResolvedValue(status());
    await expect(controller.bootstrap({ action: 'cancel', jobId: randomUUID() }, () => owner)).rejects.toThrow();
    await expect(controller.bootstrap({ action: 'start', clientRequestId: randomUUID(), cacheRoot: directory }, () => owner)).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });
});

describe('hardware inventory trusted user-data path', () => {
  it('accepts a stable user-data path beneath a redirected parent while retaining the canonical target', async () => {
    const realParent = path.join(directory, 'roaming-real');
    const aliasParent = path.join(directory, 'roaming-alias');
    const realUserData = path.join(realParent, 'LastBrowser');
    const aliasedUserData = path.join(aliasParent, 'LastBrowser');
    await mkdir(realUserData, { recursive: true });
    await symlink(realParent, aliasParent, 'junction');
    const expectedCanonical = await realpath(realUserData);
    expect(expectedCanonical).not.toBe(path.resolve(aliasedUserData));
    const observed: string[] = [];
    const validInventory: any = { schemaVersion: 1,
      hardware: { scanId: 'stable-scan', observedAt: new Date().toISOString() },
      gpuFeatureStatus: {}, probeIssues: [] };
    controller = new LocalAiController({ userDataDir: aliasedUserData, apiRequest: api,
      inventory: vi.fn(async ({ cacheDirectory }) => { observed.push(cacheDirectory); return validInventory; }) as any });

    await expect(controller.hardwareInventory({}, () => undefined)).resolves.toEqual(validInventory);
    expect(observed).toEqual([expectedCanonical]);
  });

  it('still rejects a user-data directory whose final path component is a junction', async () => {
    const realUserData = path.join(directory, 'outside-user-data');
    const linkedUserData = path.join(directory, 'linked-user-data');
    await mkdir(realUserData);
    await symlink(realUserData, linkedUserData, 'junction');
    controller = new LocalAiController({ userDataDir: linkedUserData, apiRequest: api,
      inventory: vi.fn() as any });

    await expect(controller.hardwareInventory({}, () => undefined)).rejects.toThrow(/not a regular directory/);
  });

  it('rejects a redirected parent that changes while the hardware scan is running', async () => {
    const firstParent = path.join(directory, 'roaming-first');
    const secondParent = path.join(directory, 'roaming-second');
    const aliasParent = path.join(directory, 'roaming-changing-alias');
    const aliasedUserData = path.join(aliasParent, 'LastBrowser');
    await mkdir(path.join(firstParent, 'LastBrowser'), { recursive: true });
    await mkdir(path.join(secondParent, 'LastBrowser'), { recursive: true });
    await symlink(firstParent, aliasParent, 'junction');
    controller = new LocalAiController({ userDataDir: aliasedUserData, apiRequest: api,
      inventory: vi.fn(async () => {
        await rm(aliasParent);
        await symlink(secondParent, aliasParent, 'junction');
        return { schemaVersion: 1, hardware: { scanId: 'changing-scan', observedAt: new Date().toISOString() },
          gpuFeatureStatus: {}, probeIssues: [] } as any;
      }) as any });

    await expect(controller.hardwareInventory({}, () => undefined)).rejects.toThrow(/changed during the scan/);
  });
});

describe('Local AI model cache path limits', () => {
  it('keeps the normal Windows cache path and rejects unusually long user-data roots before IO', () => {
    expect(localAiCachePathIsLegacySafe('C:\\Users\\logga\\AppData\\Roaming\\Lastbrowser\\local-ai\\cache', 'win32')).toBe(true);
    expect(localAiCachePathIsLegacySafe('C:\\Users\\' + 'long-profile-'.repeat(8) + '\\AppData\\Roaming\\Lastbrowser\\local-ai\\cache', 'win32')).toBe(false);
    expect(localAiCachePathIsLegacySafe('/some/long/linux/path/local-ai/cache', 'linux')).toBe(true);
  });
});

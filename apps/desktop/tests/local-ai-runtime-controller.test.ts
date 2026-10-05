import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
vi.mock('electron', () => ({}));
import { LocalAiController, type LocalAiRuntimeRequest, type LocalAiRuntimeReview } from '../src/main/local-ai-controller.js';
import type { BoundHardwareScan } from '../src/main/local-ai-hardware.js';

const scope = { backendProfileId: 'backend-a', spaceId: 'space-a', browserProfileId: 'browser-a' };
const binding = { scope, backendProfileName: 'frozen-profile-a' };
const digest = createHash('sha256').update('controlled-local-runtime-purpose').digest('hex');
const handleId = randomUUID().replaceAll('-', '');
const normalizeId = (value: string) => value.replaceAll('-', '').toLowerCase();
let directory: string, controller: LocalAiController, api: ReturnType<typeof vi.fn>;
let owner: any, scan: ReturnType<typeof vi.fn>, review: LocalAiRuntimeReview;
const invoke = (request: LocalAiRuntimeRequest | Record<string, unknown>, selected = binding) =>
  controller.request(selected, { action: 'runtime', request }, () => owner);
const reviewRequest = (): LocalAiRuntimeRequest => ({ operation: 'review', artifactId: 'controlled-extract', role: 'extract', clientRequestId: randomUUID() });
const bootstrapRequest = (): LocalAiRuntimeRequest => ({ operation: 'bootstrap', purposeDigest: digest, clientRequestId: randomUUID() });
const scanAndReview = async (request: LocalAiRuntimeRequest = reviewRequest()) => {
  await controller.request(binding, { action: 'scan' }, () => owner); return invoke(request);
};
const runtimeCalls = () => api.mock.calls.filter(([operation]) => operation === 'localAi.runtime');
function handle(extra: Record<string, unknown> = {}) {
  return { handleId, artifactId: 'controlled-extract', artifactRevision: 'artifact-revision-1', role: 'extract',
    revision: 1, state: 'stopped', available: false, synthetic: true, reasonCode: null, coldStartMs: 2, ...extra };
}

beforeEach(async () => {
  directory = await realpath(await mkdtemp(path.join(tmpdir(), 'lb-local-runtime-')));
  owner = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false });
  review = { purposeDigest: digest, expiresAt: new Date(Date.now() + 28000).toISOString(),
    artifactId: 'controlled-extract', artifactRevision: 'artifact-revision-1', role: 'extract', contextTokens: 1024,
    parallelRequests: 1, budgetSeconds: 20, ramLimitBytes: 2 ** 30, runtimeBuildRef: 'controlled-cpu-build' };
  scan = vi.fn(async ({ scope: selected }: { scope: typeof scope }) => ({ schemaVersion: 1, scope: selected,
    hardware: { scanId: 'actual-scan-' + randomUUID(), observedAt: new Date().toISOString() },
    gpuFeatureStatus: {}, probeIssues: [] } as unknown as BoundHardwareScan));
  api = vi.fn(async (operation, selected, payload) => {
    const envelope = { schemaVersion: 1, scope: selected };
    if (operation === 'localAi.hardwareBind') return { ...envelope, scan: payload };
    if (operation === 'localAi.hardwareRead') return { ...envelope, scan: { scope: selected,
      hardware: { scanId: payload.scanId } } };
    const request = payload.request;
    if (operation === 'localAi.setup') return { ...envelope, operation: request.operation, skipAvailable: true,
      existingProviderAvailable: true, preferences: { ...envelope, revision: 1, decision: 'skip' } };
    if (request.operation === 'capability') return { ...envelope, operation: 'capability', state: 'unavailable', reasonCode: 'local_chat_role_not_selected' };
    if (request.operation === 'review') return { ...envelope, operation: 'review', ...review,
      purposeRef: randomUUID().replaceAll('-', ''), available: false, operationVerified: false };
    if (request.operation === 'inspect') return { ...envelope, operation: 'inspect', handles: [handle()], available: false };
    if (request.operation === 'unload') return { ...envelope, operation: 'unload', handleId: normalizeId(request.handleId), stopped: true };
    return { ...envelope, operation: 'bootstrap', state: 'complete', clientRequestId: normalizeId(request.clientRequestId),
      purposeDigest: request.purposeDigest, available: false, evidenceRef: 'controlled-bootstrap-evidence',
      observedAt: new Date().toISOString(), coldStartMs: 2, p95Ms: 4, samples: 1, peakObservedResidentBytes: 123456,
      operationShapeVerified: true, synthetic: true, suite: 'answer-smoke-v1', operationVerified: false, qualityPassed: null, sloPassed: null,
      recommendationEligible: false, contextCapacityVerified: false, memoryEnvelopeVerified: false };
  });
  controller = new LocalAiController({ userDataDir: directory, apiRequest: api, scan });
});
afterEach(async () => {
  vi.restoreAllMocks();
  expect(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)).toBe(true);
  await rm(directory, { recursive: true, force: true });
});

describe('Main-owned bounded Local AI runtime purposes', () => {
  it('projects only the scoped short-chat and deterministic AUTO capabilities', async () => {
    const request: LocalAiRuntimeRequest = { operation: 'capability' };
    const unavailable = await invoke(request);
    expect(unavailable).toMatchObject({ operation: 'capability', state: 'unavailable',
      capabilities: [], reasonCode: 'local_chat_role_not_selected', qualityVerified: false });
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (operation, selected, payload) => operation === 'localAi.runtime' && payload.request.operation === 'capability'
      ? { schemaVersion: 1, scope: selected, operation: 'capability', state: 'ready',
        artifactId: 'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0', artifactRevision: '9969000761ce34de907bf20017cbfc3d52d6eaf9',
        profileRevision: 'local-role-profile-3', planDigest: 'a'.repeat(64), adapterRef: 'pinned-chat-adapter',
        runtimeBuildRef: 'pinned-cpu-runtime', hardwareScanId: 'actual-scan-1', qualityEvidenceRef: 'quality-proof',
        memoryEvidenceRef: 'memory-proof', qualityVerified: true, contextTokens: 1024, maxOutputTokens: 48,
        parallelRequests: 1, maxRamBytes: 805306368, maxSeconds: 25, releaseRedistributionVerified: false }
      : normal(operation, selected, payload));
    const ready = await invoke(request);
    expect(ready).toMatchObject({ operation: 'capability', state: 'ready', qualityVerified: true,
      capabilities: ['local_short_chat','deterministic_auto_short_chat'], artifactRevision: '9969000761ce34de907bf20017cbfc3d52d6eaf9',
      contextTokens: 1024, maxOutputTokens: 48, parallelRequests: 1, maxRamBytes: 805306368, maxSeconds: 25 });
    api.mockImplementation(async (operation, selected, payload) => operation === 'localAi.runtime' && payload.request.operation === 'capability'
      ? { schemaVersion: 1, scope: selected, operation: 'capability', state: 'ready', artifactId: 'LiquidAI/LFM2.5-230M-GGUF',
        artifactRevision: 'b27f8147d98080b0d6f063ff41de6e381ea9a530', profileRevision: 'profile', planDigest: 'a'.repeat(64),
        adapterRef: 'adapter', runtimeBuildRef: 'runtime', hardwareScanId: 'scan', qualityEvidenceRef: 'quality', memoryEvidenceRef: 'memory',
        qualityVerified: true, contextTokens: 1024, maxOutputTokens: 48, parallelRequests: 1, maxRamBytes: 805306368,
        maxSeconds: 25, releaseRedistributionVerified: false }
      : normal(operation, selected, payload));
    await expect(invoke(request)).rejects.toThrow(/bounded product evidence/);
  });

  it('requires an actual fresh scan and a separate returned review before any bootstrap IO', async () => {
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/);
    await expect(invoke(reviewRequest())).rejects.toThrow(/fresh hardware scan/);
    expect(api).not.toHaveBeenCalled(); expect(await readdir(directory)).toEqual([]);
    const shown = await scanAndReview();
    expect(shown).toMatchObject({ ...review, schemaVersion: 1, scope, operation: 'review', available: false, operationVerified: false });
    expect(shown).not.toHaveProperty('purposeRef');
    const reviewCall = runtimeCalls()[0];
    expect(reviewCall).toEqual(['localAi.runtime', scope, { request: { operation: 'review',
      artifactId: 'controlled-extract', role: 'extract', scanId: expect.stringContaining('actual-scan-') },
      cacheRoot: path.join(directory, 'local-ai', 'cache') }, binding.backendProfileName]);
    expect(reviewCall[2].request).not.toHaveProperty('clientRequestId');
    const request = bootstrapRequest(); await invoke(request);
    expect(runtimeCalls()[1]).toEqual(['localAi.runtime', scope, { request,
      cacheRoot: path.join(directory, 'local-ai', 'cache') }, binding.backendProfileName]);
    expect(runtimeCalls()[1][2]).not.toHaveProperty('privateHumanAction');
    expect(runtimeCalls()[1][2]).not.toHaveProperty('privateHostHumanDigest');
  });

  it('passes only bounded embedded notice text through Main and rejects unsafe links', async () => {
    const summary = { schemaVersion: 1, runtimeBuildRef: 'runtime', sourceBundleVerified: true, verifiedPayloadCount: 40,
      components: [{ name: 'llama.cpp', licenseLabel: 'MIT', noticeId: 'local-ai-1',
        sourceUrl: 'https://github.com/ggml-org/llama.cpp/blob/9bf55f4a3677af697d914d959eaa70f93cfdc494/LICENSE',
        noticeText: 'MIT notice\\nCopyright' }], licenseClosureVerified: false, msvcDependencyClosureVerified: false,
      executionUnavailable: true, missingPrerequisites: ['license_unverified'] };
    const setupManifest = { schemaVersion: 1, runtimeBuildRef: 'runtime', noticeSummary: summary, available: false,
      executionUnavailable: true, skipAvailable: true, existingProviderAvailable: true, reasonCode: 'license_unverified' };
    api.mockImplementation(async (_operation, selected) => ({ schemaVersion: 1, scope: selected, operation: 'inspect', handles: [], setupManifest }));
    const inspected = await invoke({ operation: 'inspect' });
    expect(inspected.setupManifest.noticeSummary.components[0].noticeText).toBe('MIT notice\\nCopyright');
    const oversizedSetup = { ...setupManifest, noticeSummary: { ...summary,
      components: [{ ...summary.components[0], noticeText: 'x'.repeat(65537) }] } };
    api.mockImplementation(async (_operation, selected) => ({ schemaVersion: 1, scope: selected, operation: 'inspect', handles: [], setupManifest: oversizedSetup }));
    await expect(invoke({ operation: 'inspect' })).rejects.toThrow(/byte budget/);
    const invalidTextSetup = { ...setupManifest, noticeSummary: { ...summary,
      components: [{ ...summary.components[0], noticeText: { forged: true } }] } };
    api.mockImplementation(async (_operation, selected) => ({ schemaVersion: 1, scope: selected, operation: 'inspect', handles: [], setupManifest: invalidTextSetup }));
    await expect(invoke({ operation: 'inspect' })).rejects.toThrow(/notice text/);
    const unsafeLinkSetup = { ...setupManifest, noticeSummary: { ...summary,
      components: [{ ...summary.components[0], sourceUrl: 'https://evil.invalid/x' }] } };
    api.mockImplementation(async (_operation, selected) => ({ schemaVersion: 1, scope: selected, operation: 'inspect', handles: [], setupManifest: unsafeLinkSetup }));
    await expect(invoke({ operation: 'inspect' })).rejects.toThrow(/official runtime release attribution/);
  });

  it('admits only the exact pinned bounded chat review through Main', async () => {
    const candidate = { purposeDigest: digest, expiresAt: new Date(Date.now() + 28000).toISOString(),
      artifactId: 'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0', artifactRevision: '9969000761ce34de907bf20017cbfc3d52d6eaf9',
      role: 'chat' as const, contextTokens: 1024, parallelRequests: 1 as const, budgetSeconds: 25,
      ramLimitBytes: 805306368, runtimeBuildRef: 'llama-cpp-b11377-win-cpu-x64' };
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (operation, selected, payload) => {
      const value = await normal(operation, selected, payload);
      if (operation === 'localAi.runtime' && payload.request.operation === 'review')
        return { ...value, ...candidate };
      return value;
    });
    await controller.request(binding, { action: 'scan' }, () => owner);
    const shown = await invoke({ operation: 'review', artifactId: candidate.artifactId, role: 'chat', clientRequestId: randomUUID() });
    expect(shown).toMatchObject({ role: 'chat', artifactId: candidate.artifactId, contextTokens: 1024, budgetSeconds: 25, ramLimitBytes: 805306368 });
    const calls = runtimeCalls();
    expect(calls[0][2].request).toMatchObject({ operation: 'review', role: 'chat', artifactId: candidate.artifactId });
    const forged = { ...candidate, artifactId: 'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0' };
    api.mockImplementation(async (operation, selected, payload) => operation === 'localAi.runtime' && payload.request.operation === 'review'
      ? { schemaVersion: 1, scope: selected, operation: 'review', ...forged, available: false, operationVerified: false }
      : normal(operation, selected, payload));
    await expect(invoke({ operation: 'review', artifactId: forged.artifactId, role: 'chat', clientRequestId: randomUUID() }))
      .rejects.toThrow(/bounded runtime benchmark review/);
  });

  it('projects a real bounded chat qualification only when all pinned product evidence agrees', async () => {
    const artifactId = 'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0';
    const artifactRevision = '9969000761ce34de907bf20017cbfc3d52d6eaf9';
    const adapterRef = 'llama.cpp-lfm2.5-chat-qad-q4_0-v1';
    const runtimeSnapshot = { buildRef: 'llama-cpp-b11377-win-cpu-x64', state: 'verified', operations: [{ role: 'chat', artifactId,
      artifactRevision, contextLimit: 1024, evidenceRef: 'proof-chat-operation', adapterRef }] };
    const memoryProfile = { artifactId, artifactRevision, status: 'measured', maxContextTokens: 1024, maxParallelRequests: 1,
      hardwareScanId: 'scan-chat-1' };
    const benchmarkEvidence = { artifactId, artifactRevision, role: 'chat', contextTokens: 1024, parallelRequests: 1,
      qualityPassed: true, sloPassed: true, hardwareScanId: 'scan-chat-1' };
    review = { purposeDigest: digest, expiresAt: new Date(Date.now() + 28000).toISOString(), artifactId, artifactRevision,
      role: 'chat', contextTokens: 1024, parallelRequests: 1, budgetSeconds: 25, ramLimitBytes: 805306368,
      runtimeBuildRef: runtimeSnapshot.buildRef };
    const chatReview: LocalAiRuntimeRequest = { operation: 'review', artifactId, role: 'chat', clientRequestId: randomUUID() };
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (operation, selected, payload) => {
      const value = await normal(operation, selected, payload);
      if (operation !== 'localAi.runtime' || payload.request.operation !== 'bootstrap') return value;
      return { ...value, suite: 'chat-quality-v1', samples: 3, synthetic: false, operationVerified: true,
        qualityPassed: true, sloPassed: true, contextCapacityVerified: true, memoryEnvelopeVerified: true,
        productEvidence: { runtimeSnapshot, memoryProfile, benchmarkEvidence },
        operationProof: { role: 'chat', artifactId, artifactRevision, contextLimit: 1024, evidenceRef: 'proof-chat-operation', adapterRef } };
    });
    await scanAndReview(chatReview);
    const result = await invoke(bootstrapRequest());
    expect(result).toMatchObject({ available: false, productChatQualified: true, operationVerified: true,
      qualityPassed: true, sloPassed: true, contextCapacityVerified: true, memoryEnvelopeVerified: true,
      recommendationEligible: false, samples: 3 });
    api.mockImplementation(async (operation, selected, payload) => {
      const value = await normal(operation, selected, payload);
      if (operation !== 'localAi.runtime' || payload.request.operation !== 'bootstrap') return value;
      return { ...value, suite: 'chat-quality-v1', samples: 3, synthetic: false, operationVerified: true,
        qualityPassed: true, sloPassed: true, contextCapacityVerified: true, memoryEnvelopeVerified: true,
        productEvidence: { runtimeSnapshot, memoryProfile: { ...memoryProfile, hardwareScanId: 'scan-other' }, benchmarkEvidence },
        operationProof: { role: 'chat', artifactId, artifactRevision, contextLimit: 1024, evidenceRef: 'proof-chat-operation', adapterRef } };
    });
    await scanAndReview(chatReview);
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/unverified quality or resource capacity/);
  });

  it('forbids paths, compute ownership, generation, hardware and generic consent fields before dispatch', async () => {
    for (const field of ['scope', 'cacheRoot', 'runtimePath', 'exePath', 'modelLoad', 'existingComputeOwnerKey',
      'admissionGeneration', 'scanId', 'hardware', 'contextTokens', 'privateHumanAction', 'privateHostHumanDigest'])
      await expect(invoke({ operation: 'review', artifactId: 'controlled-extract', role: 'extract',
        clientRequestId: randomUUID(), [field]: 'caller-authority' })).rejects.toThrow(/authority/);
    await expect(controller.request(binding, { action: 'runtime', request: { operation: 'inspect' }, cacheRoot: directory }, () => owner)).rejects.toThrow(/authority/);
    await expect(invoke({ operation: 'review', artifactId: 'controlled-extract', role: 'extract', clientRequestId: 'invented' })).rejects.toThrow(/UUID/);
    expect(api).not.toHaveBeenCalled(); expect(await readdir(directory)).toEqual([]);
  });

  it('does not borrow a recent hardware scan from another Scope or backend profile', async () => {
    await controller.request(binding, { action: 'scan' }, () => owner); api.mockClear();
    await expect(invoke(reviewRequest(), { ...binding, backendProfileName: 'other-profile' })).rejects.toThrow(/fresh hardware scan/);
    await expect(invoke(reviewRequest(), { ...binding, scope: { ...scope, spaceId: 'space-b' } })).rejects.toThrow(/fresh hardware scan/);
    expect(api).not.toHaveBeenCalled();
  });

  it('keeps missing runtime/weights evidence typed and never creates a consent receipt from it', async () => {
    await controller.request(binding, { action: 'scan' }, () => owner);
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => args[0] === 'localAi.runtime'
      ? { schemaVersion: 1, scope, operation: 'review', available: false, executionUnavailable: true,
        reasonCode: 'runtime_native_assets_unavailable', runtimePath: 'private-path' } : normal(...args));
    expect(await invoke(reviewRequest())).toEqual({ schemaVersion: 1, scope, operation: 'review',
      available: false, executionUnavailable: true, reasonCode: 'runtime_native_assets_unavailable' });
    api.mockClear();
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/); expect(api).not.toHaveBeenCalled();
  });

  it.each(['artifactId', 'role', 'contextTokens', 'parallelRequests', 'expiresAt'])(
    'rejects changed or unbounded review field %s', async field => {
      await controller.request(binding, { action: 'scan' }, () => owner);
      const invalid: Record<string, unknown> = { artifactId: 'other-artifact', role: 'vision', contextTokens: 65536,
        parallelRequests: 2, expiresAt: new Date(Date.now() + 120000).toISOString() };
      const normal = api.getMockImplementation()!;
      api.mockImplementation(async (...args) => ({ ...await normal(...args), [field]: invalid[field] }));
      await expect(invoke(reviewRequest())).rejects.toThrow(/bounded runtime benchmark/);
      api.mockClear(); await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/);
      expect(api).not.toHaveBeenCalled();
    });

  it('invalidates review on preserved-frame navigation, owner replacement, profile or Space change', async () => {
    await scanAndReview(); api.mockClear();
    owner.emit('did-start-navigation', {}, 'app://bundle/index.html', false, true);
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/);
    expect(api).not.toHaveBeenCalled();
    await scanAndReview(); api.mockClear();
    await expect(invoke(bootstrapRequest(), { ...binding, backendProfileName: 'other-profile' })).rejects.toThrow(/Review this exact runtime/);
    await expect(invoke(bootstrapRequest(), { ...binding, scope: { ...scope, browserProfileId: 'browser-b' } })).rejects.toThrow(/Review this exact runtime/);
    owner = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false });
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/);
    expect(api).not.toHaveBeenCalled();
  });

  it('checks both actual host expiration and the monotone receipt lifetime', async () => {
    await scanAndReview(); api.mockClear();
    const wall = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(wall + 29000);
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/); expect(api).not.toHaveBeenCalled();
    vi.restoreAllMocks(); await scanAndReview(); api.mockClear();
    const monotone = performance.now(); vi.spyOn(performance, 'now').mockReturnValue(monotone + 31000);
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/); expect(api).not.toHaveBeenCalled();
  });

  it('rejects navigation or frame changes during inspect, review and bootstrap ACK', async () => {
    await controller.request(binding, { action: 'scan' }, () => owner);
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { const result = await normal(...args); owner.emit('did-start-navigation', {}, '', false, true); return result; });
    await expect(invoke({ operation: 'inspect' })).rejects.toThrow(/owner navigated/);
    await expect(invoke(reviewRequest())).rejects.toThrow(/owner navigated/);
    api.mockImplementation(normal); await scanAndReview();
    api.mockImplementation(async (...args) => { const result = await normal(...args); owner.mainFrame = {}; return result; });
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/owner navigated/);
  });

  it('invalidates a review as soon as Local AI preferences change and on Main controller reload', async () => {
    await scanAndReview(); api.mockClear();
    await controller.request(binding, { action: 'setup', request: { operation: 'select', choice: {
      decision: 'skip', expectedRevision: 1, clientRequestId: randomUUID() } } }, () => owner);
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/);
    expect(runtimeCalls()).toEqual([]);
    await scanAndReview(); api.mockClear();
    controller = new LocalAiController({ userDataDir: directory, apiRequest: api, scan });
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/); expect(api).not.toHaveBeenCalled();
    await invoke({ operation: 'inspect' }); expect(runtimeCalls()).toHaveLength(1);
  });

  it('allows only the same bootstrap UUID to retry an unknown dispatch outcome', async () => {
    await scanAndReview(); api.mockClear();
    const request = bootstrapRequest(), normal = api.getMockImplementation()!;
    api.mockRejectedValueOnce(new Error('controlled_unknown_ack'));
    await expect(invoke(request)).rejects.toThrow('controlled_unknown_ack');
    const before = api.mock.calls.length;
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/same runtime request identity/);
    expect(api.mock.calls).toHaveLength(before);
    api.mockImplementation(normal);
    const result = await invoke(request); expect(result.state).toBe('complete');
    expect(api).toHaveBeenCalledTimes(2); expect(api.mock.calls[0][2].request).toEqual(api.mock.calls[1][2].request);
  });

  it('preserves a durable in-progress/interrupted replay ACK without claiming readiness', async () => {
    await scanAndReview(); api.mockClear();
    const request = bootstrapRequest();
    api.mockImplementation(async (_operation, selected, payload) => ({ schemaVersion: 1, scope: selected, operation: 'bootstrap',
      state: 'running', clientRequestId: normalizeId(payload.request.clientRequestId), purposeDigest: payload.request.purposeDigest,
      available: false, executionUnavailable: true, reasonCode: 'runtime_bootstrap_already_started', hostPid: 42 }));
    const result = await invoke(request);
    expect(result).toMatchObject({ state: 'running', available: false, executionUnavailable: true,
      clientRequestId: normalizeId((request as Extract<LocalAiRuntimeRequest, { operation: 'bootstrap' }>).clientRequestId) });
    expect(result).not.toHaveProperty('hostPid');
  });

  it('binds bootstrap results to exact Scope, purpose and UUID and prunes private runtime fields', async () => {
    await scanAndReview(); const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => ({ ...await normal(...args), scope: { ...scope, spaceId: 'foreign' } }));
    const request = bootstrapRequest(); await expect(invoke(request)).rejects.toThrow(/another Space/);
    api.mockImplementation(async (...args) => ({ ...await normal(...args), clientRequestId: randomUUID() }));
    await expect(invoke(request)).rejects.toThrow(/reviewed purpose or request identity/);
    api.mockImplementation(async (...args) => ({ ...await normal(...args), purposeDigest: createHash('sha256').update('other').digest('hex') }));
    await expect(invoke(request)).rejects.toThrow(/reviewed purpose or request identity/);
    api.mockImplementation(async (...args) => ({ ...await normal(...args), runtimePath: 'private-path', profileHome: 'private-home',
      modelLoad: {}, computeOwner: 'private-owner', generation: 'private-generation' }));
    const result = await invoke(request);
    for (const key of ['runtimePath', 'profileHome', 'modelLoad', 'computeOwner', 'generation']) expect(result).not.toHaveProperty(key);
    expect(result).toMatchObject({ available: false, operationShapeVerified: true, synthetic: true, qualityPassed: null,
      sloPassed: null, recommendationEligible: false, contextCapacityVerified: false, memoryEnvelopeVerified: false });
  });

  it.each(['qualityPassed', 'sloPassed', 'recommendationEligible', 'contextCapacityVerified', 'memoryEnvelopeVerified'])(
    'rejects unsupported benchmark claim %s', async field => {
      await scanAndReview(); const normal = api.getMockImplementation()!;
      api.mockImplementation(async (...args) => ({ ...await normal(...args), [field]: true }));
      await expect(invoke(bootstrapRequest())).rejects.toThrow(/unverified quality or resource capacity/);
    });

  it('redacts runtime inventory and rejects duplicate identities or synthetic ready claims', async () => {
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => ({ ...await normal(...args), handles: [handle({ request: { scope },
      processPid: 42, runtimePath: 'private-path', computeOwner: 'private-owner' })] }));
    const result = await invoke({ operation: 'inspect' });
    expect(result.handles).toEqual([handle()]);
    api.mockImplementation(async (...args) => ({ ...await normal(...args), handles: [handle({ state: 'ready', available: true })] }));
    await expect(invoke({ operation: 'inspect' })).rejects.toThrow(/scoped runtime handle/);
    api.mockImplementation(async (...args) => ({ ...await normal(...args), handles: [handle(), handle()] }));
    await expect(invoke({ operation: 'inspect' })).rejects.toThrow(/reused a handle identity/);
  });

  it('uses scoped native unload ACK and does not upgrade a pending stop into completion', async () => {
    const request: LocalAiRuntimeRequest = { operation: 'unload', handleId, clientRequestId: randomUUID() };
    const normal = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => ({ ...await normal(...args), stopped: false }));
    expect(await invoke(request)).toEqual({ schemaVersion: 1, scope, operation: 'unload', handleId, stopped: false });
    expect(runtimeCalls()[0][2].request).toEqual({ operation: 'unload', handleId });
    api.mockImplementation(async (...args) => ({ ...await normal(...args), handleId: randomUUID() }));
    await expect(invoke(request)).rejects.toThrow(/requested handle/);
  });

  it('refuses a linked Main cache before runtime IO and leaves its target untouched', async () => {
    const target = path.join(directory, 'outside'); await mkdir(target);
    await symlink(target, path.join(directory, 'local-ai'), 'junction');
    await expect(invoke({ operation: 'inspect' })).rejects.toThrow(/own directory/);
    expect(api).not.toHaveBeenCalled(); expect(await readdir(target)).toEqual([]);
  });

  it('propagates actual shell authority loss after awaited IO and emits no runtime receipt', async () => {
    await controller.request(binding, { action: 'scan' }, () => owner);
    const normal = api.getMockImplementation()!; let permitted = true;
    api.mockImplementation(async (...args) => { const result = await normal(...args); permitted = false; return result; });
    await expect(controller.request(binding, { action: 'runtime', request: reviewRequest() }, () => {
      if (!permitted) throw new Error('Untrusted IPC sender'); return owner;
    })).rejects.toThrow('Untrusted IPC sender');
    permitted = true; api.mockClear();
    await expect(invoke(bootstrapRequest())).rejects.toThrow(/Review this exact runtime/); expect(api).not.toHaveBeenCalled();
  });
});

import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isLocalRoleChoice, isLocalRoleResponse, roleDigest, type LocalRoleDraft } from './local-ai-role-profile.js';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { WebContents } from 'electron';
import { BrowserHostError, sameBrowserScope, type BrowserScope } from './independent-browser-host.js';
import { scanLocalAiHardware, scanLocalAiHardwareInventory, type BoundHardwareScan, type LocalAiHardwareInventory } from './local-ai-hardware.js';

type Binding = { scope: BrowserScope; backendProfileName: string };
type Options = { userDataDir: string;
  apiRequest: (operation: string, scope: BrowserScope | null, payload: Record<string, unknown>, profile: string) => Promise<any>;
  scan?: typeof scanLocalAiHardware; inventory?: typeof scanLocalAiHardwareInventory; hardwareScanTimeoutMs?: number };
const roles = new Set(['encoder', 'retrieve', 'embed', 'extract', 'agent', 'chat', 'vision']);
const bootstrapStates = ['idle','pending','downloading','verifying','cancelling','complete','cancelled','offline','failed'] as const;
const bootstrapInstallKey = 'router-lfm2.5-230m-qad-q4_0-v1';
type BootstrapAction = { action: 'status' } | { action: 'start'|'retry'; clientRequestId: string }
  | { action: 'cancel'; jobId: string };
const scopeKey = (scope: BrowserScope) => JSON.stringify([scope.backendProfileId, scope.spaceId, scope.browserProfileId]);
const presets = ['lightweight', 'balanced', 'max_local', 'hybrid', 'custom'];
const uuid = (value: unknown): value is string => typeof value === 'string' && /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value);
const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
async function trustedUserDataDirectory(configuredPath: string): Promise<string> {
  const absolutePath = path.resolve(configuredPath);
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink() || !info.isDirectory())
    throw new BrowserHostError('local_ai_scan_path_unsafe', 'The trusted application data directory is not a regular directory');
  // Electron's userData path may pass through a redirected profile parent
  // (for example, a roaming-profile junction). Compare the target to the
  // canonical parent plus the unchanged final directory name, rather than to
  // the original spelling. A link at the trusted data directory itself is
  // still rejected by lstat above.
  const [canonicalParent, canonicalTarget] = await Promise.all([
    realpath(path.dirname(absolutePath)), realpath(absolutePath),
  ]);
  const expectedTarget = path.join(canonicalParent, path.basename(absolutePath));
  if (!samePath(canonicalTarget, expectedTarget))
    throw new BrowserHostError('local_ai_scan_path_unsafe', 'The trusted application data directory changed during validation');
  const confirmed = await lstat(absolutePath);
  if (confirmed.isSymbolicLink() || !confirmed.isDirectory())
    throw new BrowserHostError('local_ai_scan_path_unsafe', 'The trusted application data directory changed during validation');
  return canonicalTarget;
}
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export type LocalAiSetupRequest =
  | { operation: 'get' }
  | { operation: 'select'; choice: { expectedRevision: number; clientRequestId: string; decision: 'local' | 'skip'; preset?: string | null; artifactIds?: string[] } }
  | { operation: 'plan'; expectedRevision: number; clientRequestId: string }
  | { operation: 'confirm'; planDigest: string; licenseDigests: string[]; clientRequestId: string }
  | { operation: 'start'; planDigest: string; clientRequestId: string }
  | { operation: 'cancel'; jobId: string; clientRequestId: string }
  | { operation: 'status'; jobId?: string | null };
export type LocalAiRuntimeRole = 'encoder' | 'retrieve' | 'embed' | 'extract' | 'agent' | 'chat' | 'vision';
export type LocalAiRuntimeRequest =
  | { operation: 'inspect' }
  | { operation: 'capability' }
  | { operation: 'review'; artifactId: string; role: LocalAiRuntimeRole; clientRequestId: string }
  | { operation: 'bootstrap'; purposeDigest: string; clientRequestId: string }
  | { operation: 'receipt'; purposeDigest: string; clientRequestId: string }
  | { operation: 'unload'; handleId: string; clientRequestId: string };
export type LocalAiRuntimeReview = Readonly<{ purposeDigest: string; expiresAt: string; artifactId: string; artifactRevision: string;
  role: LocalAiRuntimeRole; contextTokens: number; parallelRequests: 1; budgetSeconds: number;
  ramLimitBytes: number; runtimeBuildRef: string }>;
export type LocalAiRuntimeHandle = Readonly<{ handleId: string; artifactId: string; artifactRevision: string;
  role: LocalAiRuntimeRole; state: 'uninstalled' | 'downloaded' | 'verified' | 'loading' | 'ready' | 'evicting' | 'stopped' | 'failed';
  revision: number; available: boolean; synthetic: boolean; reasonCode: string | null; coldStartMs: number | null }>;
export type LocalAiRuntimeBenchmark = Readonly<{ state: 'complete'; clientRequestId: string; purposeDigest: string;
  available: false; evidenceRef: string; observedAt: string; coldStartMs: number; p95Ms: number; samples: number;
  peakObservedResidentBytes: number; operationShapeVerified: true; synthetic: boolean; suite: string | null;
  operationVerified: boolean; qualityPassed: boolean | null; sloPassed: boolean | null; recommendationEligible: false;
  contextCapacityVerified: boolean; memoryEnvelopeVerified: boolean; productChatQualified: boolean }>;
export type LocalAiChatCapability = Readonly<{ operation: 'capability'; state: 'ready' | 'unavailable';
  reasonCode: string | null; capabilities: readonly ('local_short_chat' | 'deterministic_auto_short_chat')[];
  artifactId: string | null; artifactRevision: string | null; profileRevision: string | null; planDigest: string | null;
  adapterRef: string | null; runtimeBuildRef: string | null; hardwareScanId: string | null;
  qualityEvidenceRef: string | null; memoryEvidenceRef: string | null; qualityVerified: boolean;
  contextTokens: 1024 | null; maxOutputTokens: 48 | null; parallelRequests: 1 | null;
  maxRamBytes: 805306368 | null; maxSeconds: 25 | null; releaseRedistributionVerified: boolean | null }>;
export type LocalAiRuntimeNoticeSummary = Readonly<{ schemaVersion: 1; runtimeBuildRef: string;
  sourceBundleVerified: boolean; verifiedPayloadCount: number;
  components: ReadonlyArray<Readonly<{ name: string; licenseLabel: string; noticeId: string; sourceUrl: string | null; noticeText?: string }>>;
  licenseClosureVerified: false; msvcDependencyClosureVerified: false; executionUnavailable: true;
  missingPrerequisites: ReadonlyArray<string> }>;
export type LocalAiRuntimeSetupManifest = Readonly<{ schemaVersion: 1; runtimeBuildRef: string;
  noticeSummary: LocalAiRuntimeNoticeSummary | null; available: false; executionUnavailable: true;
  skipAvailable: true; existingProviderAvailable: true; reasonCode: string }>;
type RuntimeEnvelope<Operation extends LocalAiRuntimeRequest['operation']> = Readonly<{
  schemaVersion: 1; scope: BrowserScope; operation: Operation }>;
export type LocalAiRuntimeResponse =
  | (RuntimeEnvelope<'inspect'> & { handles: LocalAiRuntimeHandle[]; setupManifest?: LocalAiRuntimeSetupManifest })
  | (RuntimeEnvelope<'capability'> & LocalAiChatCapability)
  | (RuntimeEnvelope<'review'> & LocalAiRuntimeReview & { available: false; operationVerified: false })
  | (RuntimeEnvelope<'bootstrap'> & LocalAiRuntimeBenchmark)
  | (RuntimeEnvelope<'receipt'> & LocalAiRuntimeBenchmark)
  | (RuntimeEnvelope<'receipt'> & { state: 'unknown' | 'running' | 'interrupted' | 'failed';
    clientRequestId: string; purposeDigest: string; available: false; executionUnavailable?: true; reasonCode?: string })
  | (RuntimeEnvelope<'unload'> & { handleId: string; stopped: boolean })
  | (RuntimeEnvelope<LocalAiRuntimeRequest['operation']> & { available: false; executionUnavailable: true; reasonCode: string;
    handles?: []; setupManifest?: LocalAiRuntimeSetupManifest;
    state?: 'running' | 'interrupted' | 'failed'; clientRequestId?: string; purposeDigest?: string });
type RuntimeReceipt = { scopeKey: string; profile: string; owner: WebContents; frame: WebContents['mainFrame'];
  navigation: number; epoch: number; issuedAt: number; review: LocalAiRuntimeReview; dispatchId?: string };
const bootstrapRoles = new Set<LocalAiRuntimeRole>(['retrieve', 'embed', 'extract', 'chat', 'vision']);
const boundedChatArtifact = 'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0';
const boundedChatRevision = '9969000761ce34de907bf20017cbfc3d52d6eaf9';
const reference = (value: unknown): value is string => typeof value === 'string' && value.length > 0
  && value.length <= 512 && value === value.trim() && !/[\x00-\x1f]/.test(value);
export function localAiCachePathIsLegacySafe(cacheRoot: string, platform = process.platform): boolean {
  if (platform !== 'win32') return true;
  // Installer layout: cache/<plan SHA-256>/<artifact SHA-256>/<model filename>.
  // Reserve for the pinned chat candidate, including Windows' terminating NUL.
  return path.win32.join(cacheRoot, 'a'.repeat(64), 'b'.repeat(64), 'LFM2.5-350M-QAD-Q4_0.gguf').length < 260;
}
const sameIdentity = (left: string, right: string) => left.replaceAll('-', '').toLowerCase() === right.replaceAll('-', '').toLowerCase();
function runtimeRequest(value: unknown): LocalAiRuntimeRequest {
  if (!record(value)) throw new BrowserHostError('invalid_request', 'A typed Local AI runtime request is required');
  const allowed: Record<string, string[]> = { inspect: ['operation'], capability: ['operation'], review: ['operation', 'artifactId', 'role', 'clientRequestId'],
    bootstrap: ['operation', 'purposeDigest', 'clientRequestId'], receipt: ['operation', 'purposeDigest', 'clientRequestId'],
    unload: ['operation', 'handleId', 'clientRequestId'] };
  if (!allowed[value.operation]) throw new BrowserHostError('operation_denied', 'Unsupported Local AI runtime purpose');
  keys(value, allowed[value.operation]);
  if (!['inspect', 'capability'].includes(value.operation) && !uuid(value.clientRequestId))
    throw new BrowserHostError('invalid_request', 'Local AI runtime requires a client request UUID');
  if (value.operation === 'review' && (!reference(value.artifactId) || !roles.has(value.role)))
    throw new BrowserHostError('invalid_request', 'Choose an actual Local AI artifact and role');
  if (['bootstrap', 'receipt'].includes(value.operation) && !sha256(value.purposeDigest))
    throw new BrowserHostError('invalid_request', 'Invalid reviewed Local AI runtime purpose digest');
  if (value.operation === 'unload' && !uuid(value.handleId))
    throw new BrowserHostError('invalid_request', 'Invalid Local AI runtime handle UUID');
  return JSON.parse(JSON.stringify(value));
}
function runtimeBenchmark(result: Record<string, any>, reviewed?: LocalAiRuntimeReview): Omit<LocalAiRuntimeBenchmark, 'state' | 'clientRequestId' | 'purposeDigest' | 'available'> {
  const productEvidence = result.productEvidence;
  const operation = result.operationProof;
  const runtime = record(productEvidence) ? productEvidence.runtimeSnapshot : undefined;
  const memory = record(productEvidence) ? productEvidence.memoryProfile : undefined;
  const benchmark = record(productEvidence) ? productEvidence.benchmarkEvidence : undefined;
  const productChatQualified = result.suite === 'chat-quality-v1' && result.operationVerified === true
    && result.synthetic === false && result.qualityPassed === true && result.sloPassed === true
    && result.contextCapacityVerified === true && result.memoryEnvelopeVerified === true
    && result.recommendationEligible === false && record(operation) && operation.role === 'chat'
    && operation.artifactId === boundedChatArtifact && operation.artifactRevision === boundedChatRevision
    && (!reviewed || reviewed.role === 'chat' && reviewed.artifactId === boundedChatArtifact
      && reviewed.artifactRevision === boundedChatRevision && reviewed.contextTokens === 1024
      && reviewed.runtimeBuildRef === (record(runtime) ? runtime.buildRef : undefined))
    && operation.contextLimit === 1024 && reference(operation.adapterRef) && reference(operation.evidenceRef)
    && record(runtime) && runtime.state === 'verified' && Array.isArray(runtime.operations)
    && runtime.operations.some((item: any) => record(item) && item.role === 'chat' && item.artifactId === boundedChatArtifact
      && item.artifactRevision === boundedChatRevision && item.contextLimit === 1024 && item.evidenceRef === operation.evidenceRef
      && item.adapterRef === operation.adapterRef)
    && record(memory) && memory.artifactId === boundedChatArtifact && memory.artifactRevision === boundedChatRevision
    && memory.status === 'measured' && memory.maxContextTokens === 1024 && memory.maxParallelRequests === 1
    && record(benchmark) && benchmark.artifactId === boundedChatArtifact && benchmark.artifactRevision === boundedChatRevision
    && benchmark.role === 'chat' && benchmark.contextTokens === 1024 && benchmark.parallelRequests === 1
    && benchmark.qualityPassed === true && benchmark.sloPassed === true && memory.hardwareScanId === benchmark.hardwareScanId;
  const diagnosticOnly = result.operationVerified === false && result.qualityPassed == null && result.sloPassed == null
    && result.contextCapacityVerified === false && result.memoryEnvelopeVerified === false && result.recommendationEligible === false;
  const sampleCountMatches = productChatQualified ? result.samples === 3 : result.samples === 1;
  if (!reference(result.evidenceRef) || typeof result.observedAt !== 'string' || !Number.isFinite(Date.parse(result.observedAt))
    || ['coldStartMs', 'p95Ms'].some(name => typeof result[name] !== 'number' || !Number.isFinite(result[name]) || result[name] < 0)
    || !sampleCountMatches || !integer(result.peakObservedResidentBytes, 1, Number.MAX_SAFE_INTEGER)
    || result.operationShapeVerified !== true || typeof result.synthetic !== 'boolean'
    || !(diagnosticOnly || productChatQualified))
    throw new BrowserHostError('invalid_response', 'Runtime benchmark cannot claim unverified quality or resource capacity');
  return { evidenceRef: result.evidenceRef, observedAt: result.observedAt, coldStartMs: result.coldStartMs,
    p95Ms: result.p95Ms, samples: result.samples, peakObservedResidentBytes: result.peakObservedResidentBytes,
    operationShapeVerified: true, synthetic: result.synthetic, suite: result.suite ?? null,
    operationVerified: productChatQualified, qualityPassed: productChatQualified ? true : null,
    sloPassed: productChatQualified ? true : null, recommendationEligible: false,
    contextCapacityVerified: productChatQualified, memoryEnvelopeVerified: productChatQualified, productChatQualified };
}
function runtimeSetupManifest(value: unknown): LocalAiRuntimeSetupManifest {
  if (!record(value) || value.schemaVersion !== 1 || !reference(value.runtimeBuildRef)
    || value.available !== false || value.executionUnavailable !== true || value.skipAvailable !== true
    || value.existingProviderAvailable !== true || !reference(value.reasonCode))
    throw new BrowserHostError('invalid_response', 'Invalid Local AI source attribution manifest');
  let noticeSummary: LocalAiRuntimeNoticeSummary | null = null;
  if (value.noticeSummary !== null) {
    const summary = value.noticeSummary;
    if (!record(summary) || summary.schemaVersion !== 1 || summary.runtimeBuildRef !== value.runtimeBuildRef
      || typeof summary.sourceBundleVerified !== 'boolean' || !integer(summary.verifiedPayloadCount, 0, 128)
      || summary.licenseClosureVerified !== false || summary.msvcDependencyClosureVerified !== false
      || summary.executionUnavailable !== true || !Array.isArray(summary.components) || summary.components.length > 32
      || !Array.isArray(summary.missingPrerequisites) || summary.missingPrerequisites.length > 32
      || summary.missingPrerequisites.some((item: unknown) => !reference(item)))
      throw new BrowserHostError('invalid_response', 'Source attribution cannot claim runtime or license closure');
    let totalNoticeBytes = 0;
    const pinnedSourceUrl = (url: unknown): url is string => typeof url === 'string' && (
      /^https:\/\/github\.com\/ggml-org\/llama\.cpp\/releases\/tag\/[A-Za-z0-9._-]+$/.test(url)
      || /^https:\/\/github\.com\/ggml-org\/llama\.cpp\/blob\/9bf55f4a3677af697d914d959eaa70f93cfdc494\/(?:LICENSE|vendor\/nlohmann\/json\.hpp|vendor\/cpp-httplib\/LICENSE)$/.test(url));
    const components = summary.components.map((item: unknown) => {
      if (!record(item) || !reference(item.name) || !reference(item.licenseLabel) || !reference(item.noticeId)
        || !(item.sourceUrl === null || pinnedSourceUrl(item.sourceUrl)))
        throw new BrowserHostError('invalid_response', 'Invalid official runtime release attribution');
      if (item.noticeText !== undefined) {
        if (typeof item.noticeText !== 'string' || !item.noticeText || item.noticeText.includes('\u0000'))
          throw new BrowserHostError('invalid_response', 'Invalid embedded runtime notice text');
        const bytes = Buffer.byteLength(item.noticeText, 'utf8');
        if (bytes > 65536 || Buffer.from(item.noticeText, 'utf8').toString('utf8') !== item.noticeText
          || (totalNoticeBytes += bytes) > 262144)
          throw new BrowserHostError('invalid_response', 'Embedded runtime notice text exceeded its byte budget');
      }
      return { name: item.name, licenseLabel: item.licenseLabel, noticeId: item.noticeId, sourceUrl: item.sourceUrl,
        ...(item.noticeText === undefined ? {} : { noticeText: item.noticeText }) };
    });
    if (new Set(components.map((item: { noticeId: string }) => item.noticeId)).size !== components.length)
      throw new BrowserHostError('invalid_response', 'Source attribution reused a notice identity');
    noticeSummary = { schemaVersion: 1, runtimeBuildRef: summary.runtimeBuildRef,
      sourceBundleVerified: summary.sourceBundleVerified, verifiedPayloadCount: summary.verifiedPayloadCount, components,
      licenseClosureVerified: false, msvcDependencyClosureVerified: false, executionUnavailable: true,
      missingPrerequisites: [...summary.missingPrerequisites] };
  }
  return { schemaVersion: 1, runtimeBuildRef: value.runtimeBuildRef, noticeSummary, available: false,
    executionUnavailable: true, skipAvailable: true, existingProviderAvailable: true, reasonCode: value.reasonCode };
}
function setupRequest(value: unknown): LocalAiSetupRequest {
  if (!record(value)) throw new BrowserHostError('invalid_request', 'A typed Local AI setup request is required');
  const allowed: Record<string, string[]> = { get: ['operation'], select: ['operation', 'choice'],
    plan: ['operation', 'expectedRevision', 'clientRequestId'], confirm: ['operation', 'planDigest', 'licenseDigests', 'clientRequestId'],
    start: ['operation', 'planDigest', 'clientRequestId'], cancel: ['operation', 'jobId', 'clientRequestId'], status: ['operation', 'jobId'] };
  if (!allowed[value.operation]) throw new BrowserHostError('operation_denied', 'Unsupported Local AI setup purpose');
  keys(value, allowed[value.operation]);
  if (['plan', 'confirm', 'start', 'cancel'].includes(value.operation) && !uuid(value.clientRequestId))
    throw new BrowserHostError('invalid_request', 'Local AI setup requires a client request UUID');
  if (value.operation === 'plan' && !integer(value.expectedRevision, 0, Number.MAX_SAFE_INTEGER))
    throw new BrowserHostError('invalid_request', 'Invalid Local AI setup revision');
  if (['confirm', 'start'].includes(value.operation) && !sha256(value.planDigest))
    throw new BrowserHostError('invalid_request', 'Invalid immutable Local AI plan digest');
  if (value.operation === 'confirm' && (!Array.isArray(value.licenseDigests) || value.licenseDigests.length > 32
    || value.licenseDigests.some((digest: any) => !sha256(digest)) || new Set(value.licenseDigests).size !== value.licenseDigests.length))
    throw new BrowserHostError('invalid_request', 'Invalid Local AI license confirmations');
  if (value.operation === 'cancel' && !uuid(value.jobId) || value.operation === 'status' && value.jobId != null && !uuid(value.jobId))
    throw new BrowserHostError('invalid_request', 'Invalid Local AI download job UUID');
  if (value.operation === 'select') {
    const choice = value.choice;
    if (!record(choice)) throw new BrowserHostError('invalid_request', 'A Local AI setup choice is required');
    keys(choice, ['expectedRevision', 'clientRequestId', 'decision', 'preset', 'artifactIds']);
    if (!integer(choice.expectedRevision, 0, Number.MAX_SAFE_INTEGER) || !uuid(choice.clientRequestId)
      || !['local', 'skip'].includes(choice.decision) || choice.preset != null && !presets.includes(choice.preset)
      || choice.decision === 'local' && choice.preset == null
      || choice.decision === 'skip' && (choice.preset != null || choice.artifactIds?.length))
      throw new BrowserHostError('invalid_request', 'Invalid Local AI setup choice');
    if (choice.artifactIds !== undefined && (!Array.isArray(choice.artifactIds) || choice.artifactIds.length > 32
      || new Set(choice.artifactIds).size !== choice.artifactIds.length || choice.artifactIds.some((id: any) => typeof id !== 'string'
        || !id || id.length > 512 || id !== id.trim() || /[\x00-\x1f]/.test(id))))
      throw new BrowserHostError('invalid_request', 'Invalid explicit Local AI artifacts');
  }
  // Capture immutable JSON before the first asynchronous operation.
  return JSON.parse(JSON.stringify(value));
}
type PlanReceipt = { scopeKey: string; profile: string; owner: WebContents; frame: WebContents['mainFrame'];
  navigation: number; epoch: number; issuedAt: number; digest: string; licenses: string[] };
const samePath = (a: string, b: string) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
function keys(payload: Record<string, any>, allowed: string[]): void {
  if (Object.keys(payload).some(key => !allowed.includes(key))) throw new BrowserHostError('invalid_request', 'Renderer cannot supply hardware or runtime authority');
}
function integer(value: unknown, lower: number, upper: number): boolean { return Number.isSafeInteger(value) && Number(value) >= lower && Number(value) <= upper; }
function selection(payload: Record<string, any>): Record<string, unknown> {
  keys(payload, ['action', 'scanId', 'preset', 'contextTokens', 'parallelRequests', 'maxParallelModels', 'optInRoles', 'roleBudgets', 'maxRamBytes', 'maxGpuBytes', 'customArtifactIds']);
  if (typeof payload.scanId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(payload.scanId)
    || !['lightweight', 'balanced', 'max_local', 'hybrid', 'custom'].includes(payload.preset)
    || !integer(payload.contextTokens, 1, 1048576)
    || ('parallelRequests' in payload && !integer(payload.parallelRequests, 1, 32))
    || ('maxParallelModels' in payload && !integer(payload.maxParallelModels, 1, 8)))
    throw new BrowserHostError('invalid_request', 'Invalid Local AI selection goals');
  for (const name of ['maxRamBytes', 'maxGpuBytes']) if (payload[name] !== undefined && payload[name] !== null && !integer(payload[name], 0, Number.MAX_SAFE_INTEGER))
    throw new BrowserHostError('invalid_request', 'Invalid Local AI memory goal');
  if (payload.optInRoles !== undefined && (!Array.isArray(payload.optInRoles) || payload.optInRoles.length > 6
    || new Set(payload.optInRoles).size !== payload.optInRoles.length || payload.optInRoles.some((role: any) => !roles.has(role))))
    throw new BrowserHostError('invalid_request', 'Invalid Local AI helper roles');
  if (payload.roleBudgets !== undefined) {
    if (!Array.isArray(payload.roleBudgets) || payload.roleBudgets.length > 6) throw new BrowserHostError('invalid_request', 'Invalid Local AI role budgets');
    const seen = new Set<string>();
    for (const value of payload.roleBudgets) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BrowserHostError('invalid_request', 'Invalid Local AI role budget');
      keys(value, ['role', 'contextTokens', 'parallelRequests']);
      if (!roles.has(value.role) || seen.has(value.role) || !integer(value.contextTokens, 1, 1048576)
        || ('parallelRequests' in value && !integer(value.parallelRequests, 1, 32))) throw new BrowserHostError('invalid_request', 'Invalid Local AI role budget');
      seen.add(value.role);
    }
  }
  if (payload.customArtifactIds !== undefined && (!Array.isArray(payload.customArtifactIds) || payload.customArtifactIds.length > 32
    || new Set(payload.customArtifactIds).size !== payload.customArtifactIds.length
    || payload.customArtifactIds.some((id: any) => typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 512 || /[\x00-\x1f]/.test(id))))
    throw new BrowserHostError('invalid_request', 'Invalid Local AI artifact goals');
  return Object.fromEntries(Object.entries(payload).filter(([name]) => name !== 'action'));
}

/** Main-owned purposes. Hardware scans do not acquire model compute admission. */
export class LocalAiController {
  private readonly scans = new Map<string, { scopeKey: string; profile: string; observedAt: number }>();
  private readonly reviewedPlans = new Map<string, PlanReceipt>();
  private readonly roleReviews = new Map<string, { profile:string; owner:WebContents; frame:WebContents['mainFrame']; navigation:number; issuedAt:number; draft:LocalRoleDraft }>();
  private readonly setupEpochs = new Map<string, number>();
  private readonly navigation = new WeakMap<WebContents, { epoch: number }>();
  private readonly runtimeReviews = new Map<string, RuntimeReceipt>();
  private readonly runtimeEpochs = new Map<string, number>();
  constructor(private readonly options: Options) {}
  async hardwareInventory(payload: Record<string, any>, recheck: () => unknown): Promise<LocalAiHardwareInventory> {
    keys(payload, []);
    const timeoutMs = this.options.hardwareScanTimeoutMs ?? 15_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
      throw new BrowserHostError('invalid_request', 'Invalid Local AI hardware scan timeout');
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutError = () => new BrowserHostError('local_ai_hardware_timeout',
      'The Local AI hardware inventory timed out. No inference runtime was started.');
    const guard = () => { if (expired) throw timeoutError(); recheck(); };
    const operation = (async () => {
      guard();
      const trustedDirectory = await trustedUserDataDirectory(this.options.userDataDir); guard();
      const inventory = await (this.options.inventory ?? scanLocalAiHardwareInventory)(
        { cacheDirectory: trustedDirectory, timeoutMs: 3000 });
      guard();
      const finalPath = await trustedUserDataDirectory(this.options.userDataDir); guard();
      if (!samePath(trustedDirectory, finalPath))
        throw new BrowserHostError('local_ai_scan_path_unsafe', 'The trusted application data directory changed during the scan');
      if (inventory.schemaVersion !== 1 || !inventory.hardware || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(inventory.hardware.scanId)
        || !Number.isFinite(Date.parse(inventory.hardware.observedAt)))
        throw new BrowserHostError('invalid_response', 'The local hardware inventory returned an invalid snapshot');
      return inventory;
    })();
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(timeoutError()); }, timeoutMs);
    });
    try { return await Promise.race([operation, deadline]); }
    finally { if (timer) clearTimeout(timer); }
  }
  private async cacheDirectory(recheck: () => unknown): Promise<string> {
    recheck();
    const root = await realpath(this.options.userDataDir); recheck();
    const prospectiveCache = path.join(root, 'local-ai', 'cache');
    if (!localAiCachePathIsLegacySafe(prospectiveCache))
      throw new BrowserHostError('local_ai_path_too_long', 'The Local AI cache path is too long for Windows. Change the Windows user-data location before downloading or starting a model; existing files have been left untouched.');
    let parent = root;
    for (const component of ['local-ai', 'cache']) {
      const candidate = path.join(parent, component);
      let info;
      try { info = await lstat(candidate); recheck(); }
      catch (error: any) {
        recheck(); if (error?.code !== 'ENOENT') throw error;
        try { await mkdir(candidate); recheck(); }
        catch (createError: any) { recheck(); if (createError?.code !== 'EEXIST') throw createError; }
        info = await lstat(candidate); recheck();
      }
      if (info.isSymbolicLink() || !info.isDirectory()) throw new BrowserHostError('local_ai_cache_unsafe', 'Local AI cache must remain inside its own directory');
      const resolved = await realpath(candidate); recheck();
      const relative = path.relative(root, resolved);
      if (!samePath(candidate, resolved) || relative.startsWith('..') || path.isAbsolute(relative))
        throw new BrowserHostError('local_ai_cache_unsafe', 'Local AI cache resolves outside its own directory');
      parent = resolved;
    }
    return parent;
  }
  private bootstrapStatus(value: any): any {
    if (!record(value) || value.schemaVersion !== 1 || value.installKey !== bootstrapInstallKey
      || !Number.isSafeInteger(value.revision) || value.revision < 0 || !bootstrapStates.includes(value.state)
      || value.jobId !== null && !uuid(value.jobId) || !Number.isSafeInteger(value.attempt) || value.attempt < 0 || value.attempt > 3
      || !Number.isSafeInteger(value.downloadedBytes) || value.downloadedBytes < 0 || value.downloadedBytes > 149091630
      || !Number.isSafeInteger(value.verifiedBytes) || value.verifiedBytes < 0 || value.verifiedBytes > 149091630
      || value.totalBytes !== 149091630 || value.artifactId !== 'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0'
      || value.artifactRevision !== 'b27f8147d98080b0d6f063ff41de6e381ea9a530'
      || value.sha256 !== 'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292'
      || value.licenseLabel !== 'LFM Open License v1.0'
      || value.licenseUrl !== 'https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE'
      || value.commercialThresholdUsd !== 10000000 || value.executionUnavailable !== true
      || value.errorCode !== null && !reference(value.errorCode) || !Number.isFinite(Date.parse(value.updatedAt)))
      throw new BrowserHostError('invalid_response', 'The installation-wide Local AI download status is invalid');
    return value;
  }
  async bootstrap(payload: Record<string, any>, recheck: () => unknown): Promise<any> {
    const action = payload.action;
    if (action === 'status') keys(payload,['action']);
    else if (action === 'start' || action === 'retry') {
      keys(payload,['action','clientRequestId']);
      if (!uuid(payload.clientRequestId)) throw new BrowserHostError('invalid_request','A unique bootstrap request id is required');
    } else if (action === 'cancel') {
      keys(payload,['action','jobId','clientRequestId']);
      if (!uuid(payload.jobId) || !uuid(payload.clientRequestId)) throw new BrowserHostError('invalid_request','A bootstrap job and request id are required');
    } else throw new BrowserHostError('invalid_request','Unsupported Local AI bootstrap action');
    recheck();
    const cacheRoot = await this.cacheDirectory(recheck); recheck();
    const result = await this.options.apiRequest('localAi.bootstrap',null,{...payload,cacheRoot},'default'); recheck();
    return this.bootstrapStatus(result);
  }
  async ensureBootstrap(recheck: () => unknown): Promise<void> {
    let status = await this.bootstrap({action:'status'},recheck);
    if (status.state === 'idle') status = await this.bootstrap({action:'start',clientRequestId:randomUUID()},recheck);
    else if (['failed','offline'].includes(status.state) && status.attempt < 3)
      await this.bootstrap({action:'retry',clientRequestId:randomUUID()},recheck);
  }
  private response(value: any, binding: Binding): any {
    if (!value || value.schemaVersion !== 1 || !sameBrowserScope(value.scope ?? {}, binding.scope))
      throw new BrowserHostError('invalid_response', 'Local AI response belongs to another Space');
    return value;
  }
  private async hardwareScan(binding: Binding, recheck: () => unknown): Promise<any> {
    const timeoutMs = this.options.hardwareScanTimeoutMs ?? 15_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
      throw new BrowserHostError('invalid_request', 'Invalid Local AI hardware scan timeout');
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutError = () => new BrowserHostError('local_ai_hardware_timeout',
      'The Local AI hardware check timed out. Retry the scan; no runtime helper was started.');
    const guard = () => { if (expired) throw timeoutError(); recheck(); };
    const operation = (async () => {
      guard();
      const cache = await this.cacheDirectory(guard); guard();
      const scan: BoundHardwareScan = await (this.options.scan ?? scanLocalAiHardware)(
        { scope: { ...binding.scope }, cacheDirectory: cache, timeoutMs: 3000 });
      guard();
      const checkedCache = await this.cacheDirectory(guard); guard();
      if (!samePath(cache, checkedCache) || scan.schemaVersion !== 1 || !sameBrowserScope(scan.scope, binding.scope)
        || !scan.hardware || typeof scan.hardware.scanId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(scan.hardware.scanId)
        || !Number.isFinite(Date.parse(scan.hardware.observedAt)))
        throw new BrowserHostError('local_ai_scan_changed', 'Actual Local AI scan scope or cache changed');
      const bindingResponse = await this.options.apiRequest('localAi.hardwareBind', binding.scope,
        scan as unknown as Record<string, unknown>, binding.backendProfileName);
      guard();
      const bound = this.response(bindingResponse, binding);
      if (!bound.scan || !sameBrowserScope(bound.scan.scope ?? {}, binding.scope) || bound.scan.hardware?.scanId !== scan.hardware.scanId)
        throw new BrowserHostError('invalid_response', 'Hardware binding changed its actual scan');
      const readResponse = await this.options.apiRequest('localAi.hardwareRead', binding.scope,
        { scanId: scan.hardware.scanId }, binding.backendProfileName);
      guard();
      const result = this.response(readResponse, binding);
      if (!result.scan || !sameBrowserScope(result.scan.scope ?? {}, binding.scope) || result.scan.hardware?.scanId !== scan.hardware.scanId)
        throw new BrowserHostError('invalid_response', 'Hardware response changed its actual scan');
      if (this.scans.has(scan.hardware.scanId)) throw new BrowserHostError('local_ai_scan_changed', 'Hardware scan identity was reused');
      while (this.scans.size >= 64) this.scans.delete(this.scans.keys().next().value!);
      this.scans.set(scan.hardware.scanId, { scopeKey: scopeKey(binding.scope), profile: binding.backendProfileName,
        observedAt: Date.parse(scan.hardware.observedAt) });
      return result;
    })();
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(timeoutError()); }, timeoutMs);
    });
    try { return await Promise.race([operation, deadline]); }
    finally { if (timer) clearTimeout(timer); }
  }
  private owner(recheck: () => unknown): { owner: WebContents; frame: WebContents['mainFrame']; navigation: number } {
    const owner = recheck() as WebContents;
    if (!owner?.mainFrame || owner.isDestroyed()) throw new BrowserHostError('invalid_sender', 'The reviewed plan requires its actual Assistant window');
    let navigation = this.navigation.get(owner);
    if (!navigation) {
      navigation = { epoch: 0 }; this.navigation.set(owner, navigation);
      owner.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) navigation!.epoch++; });
    }
    return { owner, frame: owner.mainFrame, navigation: navigation.epoch };
  }
  private reviewed(binding: Binding, request: Extract<LocalAiSetupRequest, { operation: 'confirm' }>, recheck: () => unknown): PlanReceipt {
    const current = this.owner(recheck), key = scopeKey(binding.scope), receipt = this.reviewedPlans.get(key);
    if (!receipt || receipt.profile !== binding.backendProfileName || receipt.owner !== current.owner || receipt.frame !== current.frame
      || receipt.navigation !== current.navigation || receipt.epoch !== (this.setupEpochs.get(key) ?? 0)
      || performance.now() - receipt.issuedAt > 600000 || receipt.digest !== request.planDigest
      || canonical(receipt.licenses) !== canonical([...request.licenseDigests].sort()))
      throw new BrowserHostError('local_ai_review_required', 'Review this exact Local AI plan and licenses in the current Assistant window');
    return receipt;
  }
  private async setup(binding: Binding, payload: Record<string, any>, recheck: () => unknown): Promise<any> {
    keys(payload, ['action', 'request']);
    const request = setupRequest(payload.request), key = scopeKey(binding.scope);
    if (request.operation === 'select') {
      this.roleReviews.delete(key);
      this.reviewedPlans.delete(key); this.setupEpochs.set(key, (this.setupEpochs.get(key) ?? 0) + 1);
      this.runtimeReviews.delete(key); this.runtimeEpochs.set(key, (this.runtimeEpochs.get(key) ?? 0) + 1);
    }
    const epoch = this.setupEpochs.get(key) ?? 0;
    const reviewer = request.operation === 'plan' ? this.owner(recheck) : undefined;
    const receipt = request.operation === 'confirm' ? this.reviewed(binding, request, recheck) : undefined;
    const envelope: Record<string, unknown> = { request };
    if (request.operation === 'start') {
      envelope.cacheRoot = await this.cacheDirectory(recheck); recheck();
    }
    recheck();
    const response = await this.options.apiRequest('localAi.setup', binding.scope, envelope, binding.backendProfileName); recheck();
    const result = this.response(response, binding);
    if (result.operation !== request.operation || result.skipAvailable !== true || result.existingProviderAvailable !== true)
      throw new BrowserHostError('invalid_response', 'Local AI setup response changed its purpose');
    if (['get', 'select'].includes(request.operation) && (!record(result.preferences)
      || result.preferences.schemaVersion !== 1 || !sameBrowserScope(result.preferences.scope ?? {}, binding.scope)
      || !integer(result.preferences.revision, 0, Number.MAX_SAFE_INTEGER)))
      throw new BrowserHostError('invalid_response', 'Local AI preferences belong to another Space');
    if (request.operation === 'confirm' && (!record(result.consent) || !sameBrowserScope(result.consent.scope ?? {}, binding.scope)
      || result.consent.planDigest !== request.planDigest || result.consent.authority !== 'private_human_action'
      || !Array.isArray(result.consent.licenseDigests) || canonical([...result.consent.licenseDigests].sort()) !== canonical([...request.licenseDigests].sort())))
      throw new BrowserHostError('invalid_response', 'Local AI consent changed its reviewed plan');
    if (receipt && this.reviewed(binding, request as Extract<LocalAiSetupRequest, { operation: 'confirm' }>, recheck) !== receipt)
      throw new BrowserHostError('local_ai_review_required', 'The reviewed Local AI plan changed during confirmation');
    if (reviewer) {
      const current = this.owner(recheck), plan = result.plan;
      if (current.owner !== reviewer.owner || current.frame !== reviewer.frame || current.navigation !== reviewer.navigation
        || epoch !== (this.setupEpochs.get(key) ?? 0)) throw new BrowserHostError('local_ai_review_required', 'The Assistant changed while reviewing the Local AI plan');
      if (!record(plan) || plan.schemaVersion !== 1 || !sameBrowserScope(plan.scope ?? {}, binding.scope)
        || plan.executionUnavailable !== true || !sha256(plan.planDigest) || !Array.isArray(plan.artifacts) || !plan.artifacts.length
        || plan.artifacts.length > 32 || plan.artifacts.some((artifact: any) => !sha256(artifact?.licenseDigest)))
        throw new BrowserHostError('invalid_response', 'Invalid immutable Local AI install plan');
      const { planDigest, ...content } = plan;
      if (createHash('sha256').update(canonical(content), 'utf8').digest('hex') !== planDigest)
        throw new BrowserHostError('invalid_response', 'Local AI install plan digest does not match its contents');
      while (this.reviewedPlans.size >= 64) this.reviewedPlans.delete(this.reviewedPlans.keys().next().value!);
      this.reviewedPlans.set(key, { scopeKey: key, profile: binding.backendProfileName, ...reviewer, epoch,
        issuedAt: performance.now(), digest: planDigest, licenses: [...new Set<string>(plan.artifacts.map((artifact: any) => artifact.licenseDigest))].sort() });
    }
    if (result.job || result.jobs) {
      const jobs = result.job ? [result.job] : result.jobs;
      if (!Array.isArray(jobs) || jobs.some((job: any) => !record(job) || job.schemaVersion !== 1 || !sameBrowserScope(job.scope ?? {}, binding.scope)
        || job.executionUnavailable !== true || !uuid(job.jobId) || !sha256(job.planDigest)
        || !['pending', 'running', 'downloading', 'verifying', 'stopping', 'complete', 'cancelled', 'interrupted', 'failed'].includes(job.state)))
        throw new BrowserHostError('invalid_response', 'Local AI install job does not belong to this Space');
      if (request.operation === 'start' && result.job?.planDigest !== request.planDigest
        || ['cancel', 'status'].includes(request.operation) && 'jobId' in request && request.jobId != null && result.job?.jobId !== request.jobId.replaceAll('-', '').toLowerCase())
        throw new BrowserHostError('invalid_response', 'Local AI install response changed its requested job');
    }
    return result;
  }
  private async roleProfile(binding:Binding,payload:Record<string,any>,recheck:()=>unknown):Promise<any>{
    keys(payload,['action','request']);const request=payload.request;
    if(!record(request))throw new BrowserHostError('invalid_request','A typed local role request is required');
    const key=scopeKey(binding.scope),captured=this.owner(recheck),epoch=this.setupEpochs.get(key)??0,
      capturedReview=this.roleReviews.get(key),envelope:Record<string,unknown>={operation:request.operation};
    if(request.operation==='read')keys(request,['operation']);
    else if(request.operation==='draft'){
      keys(request,['operation','planDigest']);if(!roleDigest(request.planDigest))throw new BrowserHostError('invalid_request','Choose a confirmed local model plan');
      envelope.planDigest=request.planDigest;
    }else if(request.operation==='confirm'){
      keys(request,['operation','choice']);if(!isLocalRoleChoice(request.choice))throw new BrowserHostError('invalid_request','Invalid local task selection');
      const review=this.roleReviews.get(key),choice=request.choice;
      if(!review||review.profile!==binding.backendProfileName||review.owner!==captured.owner||review.frame!==captured.frame
        ||review.navigation!==captured.navigation||performance.now()-review.issuedAt>600000||review.draft.planDigest!==choice.planDigest
        ||review.draft.expectedRevision!==choice.expectedRevision||review.draft.setupRevision!==choice.setupRevision
        ||choice.selections.some(s=>!review.draft.choices.some(row=>row.task===s.task&&row.artifactId===s.artifactId&&row.state==='prepared')))
        throw new BrowserHostError('local_ai_review_required','Review these local task bindings in this window');
      envelope.choice=JSON.parse(JSON.stringify(choice));
      envelope.confirmationDigest=createHash('sha256').update(canonical({actor:binding.backendProfileName,choice}),'utf8').digest('hex');
    }else throw new BrowserHostError('operation_denied','Unsupported local role request');
    recheck();const result=await this.options.apiRequest('localAi.roleProfile',binding.scope,envelope,binding.backendProfileName);recheck();
    const current=this.owner(recheck);
    if(current.owner!==captured.owner||current.frame!==captured.frame||current.navigation!==captured.navigation
      ||epoch!==(this.setupEpochs.get(key)??0)
      ||request.operation==='confirm'&&this.roleReviews.get(key)!==capturedReview)
      throw new BrowserHostError('local_ai_review_required','The local task review changed its window');
    if(!isLocalRoleResponse(result)||!sameBrowserScope(result.scope,binding.scope)||result.operation!==request.operation)
      throw new BrowserHostError('invalid_response','Local task bindings changed their Scope or purpose');
    if(result.operation==='draft'){
      if(result.profile.planDigest!==request.planDigest)throw new BrowserHostError('invalid_response','Local role draft changed its plan');
      this.roleReviews.set(key,{profile:binding.backendProfileName,...current,issuedAt:performance.now(),draft:result.profile});
    }else if(result.operation==='confirm'&&(result.profile.revision!==request.choice.expectedRevision+1||result.profile.planDigest!==request.choice.planDigest
      ||canonical(result.profile.selections)!==canonical(request.choice.selections)))throw new BrowserHostError('invalid_response','Local role confirmation changed its selected tasks');
    return result;
  }
  private runtimeReceipt(binding: Binding, request: Extract<LocalAiRuntimeRequest, { operation: 'bootstrap' }>,
    recheck: () => unknown): RuntimeReceipt {
    const current = this.owner(recheck), key = scopeKey(binding.scope), receipt = this.runtimeReviews.get(key);
    if (!receipt || receipt.profile !== binding.backendProfileName || receipt.owner !== current.owner || receipt.frame !== current.frame
      || receipt.navigation !== current.navigation || receipt.epoch !== (this.runtimeEpochs.get(key) ?? 0)
      || performance.now() - receipt.issuedAt > 30000 || Date.now() >= Date.parse(receipt.review.expiresAt)
      || receipt.review.purposeDigest !== request.purposeDigest)
      throw new BrowserHostError('local_ai_runtime_review_required', 'Review this exact runtime benchmark in the current Assistant window');
    if (receipt.dispatchId && !sameIdentity(receipt.dispatchId, request.clientRequestId))
      throw new BrowserHostError('local_ai_runtime_request_reused', 'Retry the same runtime request identity or review a new benchmark');
    return receipt;
  }
  private runtimeScan(binding: Binding): string {
    const key = scopeKey(binding.scope), now = Date.now();
    const scan = [...this.scans.entries()].filter(([, value]) => value.scopeKey === key
      && value.profile === binding.backendProfileName && now - value.observedAt <= 30000 && value.observedAt <= now + 2000)
      .sort((left, right) => right[1].observedAt - left[1].observedAt)[0];
    if (!scan) throw new BrowserHostError('local_ai_scan_stale', 'Run a fresh hardware scan for this Space before reviewing its runtime');
    return scan[0];
  }
  private async runtime(binding: Binding, payload: Record<string, any>, recheck: () => unknown): Promise<any> {
    keys(payload, ['action', 'request']);
    binding = { scope: { ...binding.scope }, backendProfileName: binding.backendProfileName };
    const request = runtimeRequest(payload.request), key = scopeKey(binding.scope);
    const actor = this.owner(recheck);
    const checkActor = () => {
      const current = this.owner(recheck);
      if (current.owner !== actor.owner || current.frame !== actor.frame || current.navigation !== actor.navigation)
        throw new BrowserHostError('invalid_sender', 'The runtime request owner navigated or changed');
      return current.owner;
    };
    if (request.operation === 'receipt') {
      // A historical read is deliberately separate from launch authority. It
      // does not create cache directories, reviews, hardware bindings or hosts.
      checkActor();
      const result = this.response(await this.options.apiRequest('localAi.runtime', binding.scope,
        { request }, binding.backendProfileName), binding); checkActor();
      if (result.operation !== 'receipt' || result.available !== false || !uuid(result.clientRequestId)
        || !sameIdentity(result.clientRequestId, request.clientRequestId) || result.purposeDigest !== request.purposeDigest
        || !['unknown', 'running', 'interrupted', 'failed', 'complete'].includes(result.state)
        || result.reasonCode != null && !reference(result.reasonCode))
        throw new BrowserHostError('invalid_response', 'Runtime receipt changed its original request or purpose');
      const envelope = { schemaVersion: 1, scope: { ...binding.scope }, operation: 'receipt', state: result.state,
        clientRequestId: result.clientRequestId, purposeDigest: result.purposeDigest, available: false };
      if (result.state === 'complete') return { ...envelope, ...runtimeBenchmark(result) };
      if (result.state !== 'unknown' && result.executionUnavailable !== true)
        throw new BrowserHostError('invalid_response', 'An unsettled runtime receipt cannot claim availability');
      return { ...envelope, ...(result.state === 'unknown' ? {} : { executionUnavailable: true }),
        ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}) };
    }
    let reviewer: ReturnType<LocalAiController['owner']> | undefined;
    let epoch = this.runtimeEpochs.get(key) ?? 0;
    if (request.operation === 'review') {
      this.runtimeReviews.delete(key); this.runtimeEpochs.set(key, ++epoch); reviewer = this.owner(recheck);
    }
    const receipt = request.operation === 'bootstrap' ? this.runtimeReceipt(binding, request, recheck) : undefined;
    // Hardware identity and runtime limits are Main/host inputs, never renderer authority.
    const privateRequest = request.operation === 'review'
      ? { operation: 'review', artifactId: request.artifactId, role: request.role, scanId: this.runtimeScan(binding),
          ...(request.role === 'chat' ? { purpose: 'diagnostic', contextTokens: 1024, budgetSeconds: 25, ramLimitBytes: 805306368 } : {}) }
      : request.operation === 'unload' ? { operation: 'unload', handleId: request.handleId } : request;
    const cacheRoot = await this.cacheDirectory(checkActor); checkActor();
    if (receipt && request.operation === 'bootstrap') {
      if (this.runtimeReceipt(binding, request, recheck) !== receipt)
        throw new BrowserHostError('local_ai_runtime_review_required', 'The runtime review changed before dispatch');
      // Unknown outcomes may retry only this exact UUID; another dispatch is a
      // separate human action and must obtain its own fresh review.
      receipt.dispatchId = request.clientRequestId;
    }
    if (reviewer && epoch !== (this.runtimeEpochs.get(key) ?? 0))
      throw new BrowserHostError('local_ai_runtime_review_required', 'The runtime selection changed before review dispatch');
    const raw = await this.options.apiRequest('localAi.runtime', binding.scope, { request: privateRequest, cacheRoot }, binding.backendProfileName);
    checkActor();
    if (!samePath(cacheRoot, await this.cacheDirectory(checkActor)))
      throw new BrowserHostError('local_ai_cache_unsafe', 'The Local AI runtime cache changed during the request');
    checkActor();
    const result = this.response(raw, binding);
    if (result.operation !== request.operation) throw new BrowserHostError('invalid_response', 'Local AI runtime response changed its purpose');
    if (receipt && request.operation === 'bootstrap' && this.runtimeReceipt(binding, request, recheck) !== receipt)
      throw new BrowserHostError('local_ai_runtime_review_required', 'The runtime review changed during confirmation');
    const envelope = { schemaVersion: 1 as const, scope: { ...binding.scope }, operation: request.operation };
    if (request.operation === 'capability') {
      const allowed = ['schemaVersion','operation','state','reasonCode','scope','profileRevision','planDigest','artifactId','artifactRevision',
        'adapterRef','runtimeBuildRef','hardwareScanId','qualityEvidenceRef','memoryEvidenceRef','qualityVerified','contextTokens',
        'maxOutputTokens','parallelRequests','maxRamBytes','maxSeconds','releaseRedistributionVerified'];
      if (result.schemaVersion !== 1 || Object.keys(result).some(name => !allowed.includes(name)) || !['ready','unavailable'].includes(result.state)
        || result.scope !== undefined && !sameBrowserScope(result.scope, binding.scope)
        || result.reasonCode != null && !reference(result.reasonCode))
        throw new BrowserHostError('invalid_response', 'Invalid scoped Local AI chat capability');
      if (result.state === 'ready' && (result.artifactId !== boundedChatArtifact || result.artifactRevision !== boundedChatRevision
        || !reference(result.profileRevision) || !sha256(result.planDigest) || !reference(result.adapterRef)
        || !reference(result.runtimeBuildRef) || !reference(result.hardwareScanId) || !reference(result.qualityEvidenceRef)
        || !reference(result.memoryEvidenceRef) || result.qualityVerified !== true || result.contextTokens !== 1024
        || result.maxOutputTokens !== 48 || result.parallelRequests !== 1 || result.maxRamBytes !== 805306368
        || result.maxSeconds !== 25 || typeof result.releaseRedistributionVerified !== 'boolean'))
        throw new BrowserHostError('invalid_response', 'Local AI chat capability did not satisfy its bounded product evidence');
      if (result.state === 'unavailable' && !reference(result.reasonCode))
        throw new BrowserHostError('invalid_response', 'Unavailable Local AI capability has no reason code');
      const ready = result.state === 'ready';
      return { ...envelope, state: result.state, reasonCode: result.reasonCode ?? null,
        capabilities: ready ? ['local_short_chat','deterministic_auto_short_chat'] : [],
        artifactId: ready ? result.artifactId : null, artifactRevision: ready ? result.artifactRevision : null,
        profileRevision: ready ? result.profileRevision : null, planDigest: ready ? result.planDigest : null,
        adapterRef: ready ? result.adapterRef : null, runtimeBuildRef: ready ? result.runtimeBuildRef : null,
        hardwareScanId: ready ? result.hardwareScanId : null,
        qualityEvidenceRef: ready ? result.qualityEvidenceRef : null, memoryEvidenceRef: ready ? result.memoryEvidenceRef : null,
        qualityVerified: ready, contextTokens: ready ? 1024 : null, maxOutputTokens: ready ? 48 : null,
        parallelRequests: ready ? 1 : null, maxRamBytes: ready ? 805306368 : null, maxSeconds: ready ? 25 : null,
        releaseRedistributionVerified: ready ? result.releaseRedistributionVerified : null };
    }
    const setupManifest = request.operation === 'inspect' && result.setupManifest !== undefined
      ? runtimeSetupManifest(result.setupManifest) : undefined;
    if (request.operation === 'bootstrap' && (typeof result.clientRequestId !== 'string'
      || !uuid(result.clientRequestId) || !sameIdentity(result.clientRequestId, request.clientRequestId)
      || result.purposeDigest !== request.purposeDigest || result.available !== false
      || !['running', 'interrupted', 'failed', 'complete'].includes(result.state)))
      throw new BrowserHostError('invalid_response', 'Runtime bootstrap changed its reviewed purpose or request identity');
    // Missing installed weights/runtime evidence remains an honest, typed state.
    if (result.available === false && result.executionUnavailable === true && reference(result.reasonCode)) {
      if (request.operation === 'bootstrap' && result.state === 'complete')
        throw new BrowserHostError('invalid_response', 'A blocked runtime benchmark cannot claim completion');
      if (reviewer) {
        const current = this.owner(recheck);
        if (current.owner !== reviewer.owner || current.frame !== reviewer.frame || current.navigation !== reviewer.navigation
          || epoch !== (this.runtimeEpochs.get(key) ?? 0))
          throw new BrowserHostError('local_ai_runtime_review_required', 'The Assistant changed while reviewing the runtime');
      }
      return { ...envelope, available: false, executionUnavailable: true, reasonCode: result.reasonCode,
        ...(request.operation === 'inspect' ? { handles: [] } : {}),
        ...(setupManifest ? { setupManifest } : {}),
        ...(request.operation === 'bootstrap' ? { state: result.state, clientRequestId: result.clientRequestId,
          purposeDigest: result.purposeDigest } : {}) };
    }
    if (request.operation === 'inspect') {
      if (!Array.isArray(result.handles) || result.handles.length > 64) throw new BrowserHostError('invalid_response', 'Invalid scoped runtime inventory');
      const handles = result.handles.map((item: any) => {
        if (!record(item) || !uuid(item.handleId) || !reference(item.artifactId) || !reference(item.artifactRevision)
          || !roles.has(item.role) || !integer(item.revision, 1, Number.MAX_SAFE_INTEGER)
          || !['uninstalled', 'downloaded', 'verified', 'loading', 'ready', 'evicting', 'stopped', 'failed'].includes(item.state)
          || typeof item.available !== 'boolean' || typeof item.synthetic !== 'boolean' || item.synthetic && item.available
          || item.reasonCode != null && !reference(item.reasonCode)
          || item.coldStartMs != null && (typeof item.coldStartMs !== 'number' || !Number.isFinite(item.coldStartMs) || item.coldStartMs < 0))
          throw new BrowserHostError('invalid_response', 'Invalid scoped runtime handle');
        return { handleId: item.handleId, artifactId: item.artifactId, artifactRevision: item.artifactRevision, role: item.role,
          state: item.state, revision: item.revision, available: item.available, synthetic: item.synthetic,
          reasonCode: item.reasonCode ?? null, coldStartMs: item.coldStartMs ?? null };
      });
      if (new Set(handles.map((handle: { handleId: string }) => handle.handleId.replaceAll('-', '').toLowerCase())).size !== handles.length)
        throw new BrowserHostError('invalid_response', 'Runtime inventory reused a handle identity');
      return { ...envelope, handles, ...(setupManifest ? { setupManifest } : {}) };
    }
    if (request.operation === 'review') {
      const current = this.owner(recheck);
      if (!reviewer || current.owner !== reviewer.owner || current.frame !== reviewer.frame || current.navigation !== reviewer.navigation
        || epoch !== (this.runtimeEpochs.get(key) ?? 0))
        throw new BrowserHostError('local_ai_runtime_review_required', 'The Assistant changed while reviewing the runtime');
      const boundedChat = request.role === 'chat';
      if (result.available !== false || result.operationVerified !== false || !sha256(result.purposeDigest) || typeof result.expiresAt !== 'string'
        || !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now()
        || Date.parse(result.expiresAt) > Date.now() + 32000
        || result.artifactId !== request.artifactId || result.role !== request.role
        || !reference(result.artifactRevision) || !reference(result.runtimeBuildRef) || !bootstrapRoles.has(result.role)
        || !integer(result.contextTokens, 1, 4096) || result.parallelRequests !== 1 || !integer(result.budgetSeconds, 1, 30)
        || !integer(result.ramLimitBytes, 16777216, 17179869184)
        || boundedChat && (result.artifactId !== boundedChatArtifact || result.artifactRevision !== boundedChatRevision
          || result.contextTokens !== 1024 || result.budgetSeconds > 25 || result.ramLimitBytes > 805306368))
        throw new BrowserHostError('invalid_response', 'Invalid bounded runtime benchmark review');
      const review: LocalAiRuntimeReview = Object.freeze({ purposeDigest: result.purposeDigest, expiresAt: result.expiresAt, artifactId: result.artifactId,
        artifactRevision: result.artifactRevision, role: result.role, contextTokens: result.contextTokens, parallelRequests: 1,
        budgetSeconds: result.budgetSeconds, ramLimitBytes: result.ramLimitBytes, runtimeBuildRef: result.runtimeBuildRef });
      while (this.runtimeReviews.size >= 64) this.runtimeReviews.delete(this.runtimeReviews.keys().next().value!);
      this.runtimeReviews.set(key, { scopeKey: key, profile: binding.backendProfileName, ...reviewer, epoch,
        issuedAt: performance.now(), review });
      return { ...envelope, ...review, available: false, operationVerified: false };
    }
    if (request.operation === 'unload') {
      if (typeof result.handleId !== 'string' || !uuid(result.handleId) || !sameIdentity(result.handleId, request.handleId)
        || typeof result.stopped !== 'boolean')
        throw new BrowserHostError('invalid_response', 'Runtime unload changed its requested handle or acknowledgement');
      return { ...envelope, handleId: result.handleId, stopped: result.stopped };
    }
    if (result.state !== 'complete') throw new BrowserHostError('invalid_response', 'Runtime benchmark completion was not acknowledged');
    return { ...envelope, state: 'complete', clientRequestId: result.clientRequestId, purposeDigest: result.purposeDigest,
      available: false, ...runtimeBenchmark(result, receipt?.review) };
  }
  async request(binding: Binding, payload: Record<string, any>, recheck: () => unknown): Promise<any> {
    if(payload.action==='roleProfile')return this.roleProfile(binding,payload,recheck);
    recheck();
    if (payload.action === 'setup') return this.setup(binding, payload, recheck);
    if (payload.action === 'runtime') return this.runtime(binding, payload, recheck);
    if (payload.action === 'catalog') {
      keys(payload, ['action']);
      const result = await this.options.apiRequest('localAi.catalog', binding.scope, {}, binding.backendProfileName); recheck();
      return this.response(result, binding);
    }
    if (payload.action === 'scan') {
      keys(payload, ['action']);
      return this.hardwareScan(binding, recheck);
    }
    if (payload.action === 'recommend') {
      const goals = selection(payload), scan = this.scans.get(payload.scanId);
      if (!scan || scan.scopeKey !== scopeKey(binding.scope) || scan.profile !== binding.backendProfileName || Date.now() - scan.observedAt > 30000 || scan.observedAt > Date.now() + 2000)
        throw new BrowserHostError('local_ai_scan_stale', 'Run a fresh hardware scan for this Space');
      recheck();
      const recommendation = await this.options.apiRequest('localAi.recommend', binding.scope, goals, binding.backendProfileName); recheck();
      const result = this.response(recommendation, binding);
      if (!result.result || result.result.hardwareScanId !== payload.scanId)
        throw new BrowserHostError('invalid_response', 'Recommendation changed its bound hardware scan');
      return result;
    }
    throw new BrowserHostError('operation_denied', 'Unsupported Local AI action');
  }
}

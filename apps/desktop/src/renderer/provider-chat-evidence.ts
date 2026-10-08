export type ProviderChatEvidence = {
  providerId: string;
  modelId: string;
  browserProfileId: string;
  backendProfileName: string;
  runtimeGeneration: string;
  appBuildId: string;
  providerConfigGeneration: string;
  backendConfigGeneration: string;
  recordedAt: number;
};

export type CompletedChatEvidenceInput = {
  startAccepted: boolean;
  completed: boolean;
  cancelled?: boolean;
  streamError?: string | null;
  browserProfileId?: string | null;
  backendProfileName?: string | null;
  runtimeGeneration?: string | null;
  appBuildId?: string | null;
  providerEvidence?: {
    provider_id?: string;
    model_id?: string;
    successful_chat?: boolean;
    runtime_generation?: string;
    provider_config_generation?: string;
  } | null;
};

const STORAGE_KEY = 'lastbrowser.providerChatEvidence.v3';
const CONFIG_GENERATION_KEY = 'lastbrowser.providerConfigGeneration.v1';
const MAX_QUALIFICATION_AGE_MS = 24 * 60 * 60 * 1000;
let activeRuntimeGeneration = '';
let activeAppBuildId = '';

export function setProviderChatEvidenceRuntime(runtimeGeneration: string | null | undefined, appBuildId: string | null | undefined): void {
  activeRuntimeGeneration = String(runtimeGeneration || '').trim();
  activeAppBuildId = String(appBuildId || '').trim();
}

function randomGeneration(): string {
  try { return globalThis.crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
}

function normalizeProviderId(value: string): string { return value.trim().toLowerCase(); }
function evidenceKey(providerId: string, modelId: string, browserProfileId: string, backendProfileName: string): string {
  return JSON.stringify([normalizeProviderId(providerId), browserProfileId.trim(), backendProfileName.trim().toLowerCase(), modelId.trim()]);
}
function providerConfigGeneration(providerId: string, storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  try {
    const parsed = JSON.parse(storage.getItem(CONFIG_GENERATION_KEY) || '{}') as Record<string, unknown>;
    const provider = normalizeProviderId(providerId);
    const found = typeof parsed[provider] === 'string' ? parsed[provider] as string : '';
    if (found) return found;
    const next = randomGeneration();
    storage.setItem(CONFIG_GENERATION_KEY, JSON.stringify({ ...parsed, [provider]: next }));
    return next;
  } catch { return ''; }
}
function readAll(storage: Pick<Storage, 'getItem'>): Record<string, ProviderChatEvidence> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, ProviderChatEvidence> = {};
    for (const item of Object.values(parsed)) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const providerId = typeof record.providerId === 'string' ? normalizeProviderId(record.providerId) : '';
      const modelId = typeof record.modelId === 'string' ? record.modelId.trim() : '';
      const browserProfileId = typeof record.browserProfileId === 'string' ? record.browserProfileId.trim() : '';
      const backendProfileName = typeof record.backendProfileName === 'string' ? record.backendProfileName.trim() : '';
      const runtimeGeneration = typeof record.runtimeGeneration === 'string' ? record.runtimeGeneration.trim() : '';
      const appBuildId = typeof record.appBuildId === 'string' ? record.appBuildId.trim() : '';
      const configGeneration = typeof record.providerConfigGeneration === 'string' ? record.providerConfigGeneration.trim() : '';
      const backendConfigGeneration = typeof record.backendConfigGeneration === 'string' ? record.backendConfigGeneration.trim() : '';
      const recordedAt = Number(record.recordedAt);
      if (!providerId || !modelId || !browserProfileId || !backendProfileName || !runtimeGeneration || !appBuildId
        || !configGeneration || !backendConfigGeneration || !Number.isFinite(recordedAt)) continue;
      const evidence: ProviderChatEvidence = { providerId, modelId, browserProfileId, backendProfileName,
        runtimeGeneration, appBuildId, providerConfigGeneration: configGeneration, backendConfigGeneration, recordedAt };
      const key = evidenceKey(providerId, modelId, browserProfileId, backendProfileName);
      if (!result[key] || result[key].recordedAt < recordedAt) result[key] = evidence;
    }
    return result;
  } catch { return {}; }
}
function isFresh(evidence: ProviderChatEvidence, now: number): boolean {
  const age = now - evidence.recordedAt;
  return Number.isFinite(now) && age >= 0 && age <= MAX_QUALIFICATION_AGE_MS;
}
function matchesActiveIdentity(evidence: ProviderChatEvidence, storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  return Boolean(activeRuntimeGeneration && activeAppBuildId && evidence.runtimeGeneration === activeRuntimeGeneration
    && evidence.appBuildId === activeAppBuildId
    && evidence.providerConfigGeneration === providerConfigGeneration(evidence.providerId, storage));
}

export function recordProviderChatSuccess(
  providerId: string | null | undefined, modelId: string | null | undefined,
  browserProfileId: string | null | undefined, backendProfileName: string | null | undefined,
  storage: Pick<Storage, 'getItem' | 'setItem'>, runtimeGeneration: string, appBuildId: string,
  backendConfigGeneration: string, recordedAt = Date.now(),
): void {
  const provider = normalizeProviderId(String(providerId || ''));
  const model = String(modelId || '').trim(), profile = String(browserProfileId || '').trim();
  const backendProfile = String(backendProfileName || '').trim();
  if (!provider || !model || !profile || !backendProfile || !runtimeGeneration || !appBuildId
    || !backendConfigGeneration || !Number.isFinite(recordedAt)) return;
  try {
    const all = readAll(storage);
    all[evidenceKey(provider, model, profile, backendProfile)] = {
      providerId: provider, modelId: model, browserProfileId: profile, backendProfileName: backendProfile,
      runtimeGeneration, appBuildId, providerConfigGeneration: providerConfigGeneration(provider, storage),
      backendConfigGeneration, recordedAt,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* Evidence storage is best-effort and never blocks chat. */ }
}

export function recordCompletedChatEvidence(input: CompletedChatEvidenceInput, storage: Pick<Storage, 'getItem' | 'setItem'>, recordedAt = Date.now()): boolean {
  if (!input.startAccepted || !input.completed || input.cancelled || input.streamError || input.providerEvidence?.successful_chat !== true) return false;
  const provider = normalizeProviderId(String(input.providerEvidence.provider_id || ''));
  const model = String(input.providerEvidence.model_id || '').trim();
  const runtimeGeneration = String(input.runtimeGeneration || '').trim();
  const appBuildId = String(input.appBuildId || '').trim();
  const backendConfigGeneration = String(input.providerEvidence.provider_config_generation || '').trim();
  if (!provider || !model || !runtimeGeneration || !appBuildId || !backendConfigGeneration
    || input.providerEvidence.runtime_generation !== runtimeGeneration) return false;
  recordProviderChatSuccess(provider, model, input.browserProfileId, input.backendProfileName, storage,
    runtimeGeneration, appBuildId, backendConfigGeneration, recordedAt);
  return true;
}

export function getProviderChatEvidence(providerId: string, browserProfileId: string, backendProfileName: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now()): ProviderChatEvidence | undefined {
  const provider = normalizeProviderId(providerId), profile = browserProfileId.trim();
  const backendProfile = backendProfileName.trim().toLowerCase();
  return Object.values(readAll(storage)).filter(item => item.providerId === provider && item.browserProfileId === profile
    && item.backendProfileName.toLowerCase() === backendProfile && matchesActiveIdentity(item, storage) && isFresh(item, now))
    .sort((a, b) => b.recordedAt - a.recordedAt)[0];
}

export function isProviderModelQualified(providerId: string, modelId: string, browserProfileId: string,
  backendProfileName: string, storage: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now()): boolean {
  const provider = normalizeProviderId(providerId);
  const evidence = readAll(storage)[evidenceKey(provider, modelId, browserProfileId, backendProfileName)];
  return Boolean(evidence && matchesActiveIdentity(evidence, storage) && isFresh(evidence, now));
}

export function getQualifiedProviderModels(providerId: string, browserProfileId: string, backendProfileName: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now()): ReadonlySet<string> {
  const provider = normalizeProviderId(providerId), profile = browserProfileId.trim();
  const backendProfile = backendProfileName.trim().toLowerCase();
  return new Set(Object.values(readAll(storage)).filter(item => item.providerId === provider && item.browserProfileId === profile
    && item.backendProfileName.toLowerCase() === backendProfile && matchesActiveIdentity(item, storage) && isFresh(item, now))
    .map(item => item.modelId));
}

export function clearProviderChatEvidence(providerId: string, storage: Pick<Storage, 'getItem' | 'setItem'>): void {
  const provider = normalizeProviderId(providerId);
  if (!provider) return;
  try {
    const remaining = Object.fromEntries(Object.entries(readAll(storage)).filter(([, item]) => item.providerId !== provider));
    storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    const generations = JSON.parse(storage.getItem(CONFIG_GENERATION_KEY) || '{}') as Record<string, unknown>;
    storage.setItem(CONFIG_GENERATION_KEY, JSON.stringify({ ...generations, [provider]: randomGeneration() }));
  } catch { /* Clearing a qualification marker must not block editing provider settings. */ }
}

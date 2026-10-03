export type ProviderChatEvidence = {
  providerId: string;
  modelId: string;
  recordedAt: number;
};

export type CompletedChatEvidenceInput = {
  startAccepted: boolean;
  completed: boolean;
  cancelled?: boolean;
  streamError?: string | null;
  providerEvidence?: {
    provider_id?: string;
    model_id?: string;
    successful_chat?: boolean;
  } | null;
};

const STORAGE_KEY = 'lastbrowser.providerChatEvidence.v1';

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

function readAll(storage: Pick<Storage, 'getItem'>): Record<string, ProviderChatEvidence> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, ProviderChatEvidence> = {};
    for (const [providerId, item] of Object.entries(parsed)) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const modelId = typeof record.modelId === 'string' ? record.modelId.trim() : '';
      const recordedAt = Number(record.recordedAt);
      if (!providerId || !modelId || !Number.isFinite(recordedAt)) continue;
      result[providerId] = { providerId, modelId, recordedAt };
    }
    return result;
  } catch {
    return {};
  }
}

export function recordProviderChatSuccess(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  recordedAt = Date.now(),
): void {
  const provider = normalizeProviderId(String(providerId || ''));
  const model = String(modelId || '').trim();
  if (!provider || !model || !Number.isFinite(recordedAt)) return;
  try {
    const all = readAll(storage);
    all[provider] = { providerId: provider, modelId: model, recordedAt };
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Evidence storage is best-effort and never blocks chat.
  }
}

export function recordCompletedChatEvidence(
  input: CompletedChatEvidenceInput,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  recordedAt = Date.now(),
): boolean {
  if (!input.startAccepted || !input.completed || input.cancelled || input.streamError) return false;
  if (input.providerEvidence?.successful_chat !== true) return false;
  const provider = normalizeProviderId(String(input.providerEvidence.provider_id || ''));
  const model = String(input.providerEvidence.model_id || '').trim();
  if (!provider || !model) return false;
  recordProviderChatSuccess(provider, model, storage, recordedAt);
  return true;
}

export function getProviderChatEvidence(
  providerId: string,
  storage: Pick<Storage, 'getItem'>,
): ProviderChatEvidence | undefined {
  return readAll(storage)[normalizeProviderId(providerId)];
}

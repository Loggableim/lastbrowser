import { normalizeReasoningEfforts } from './chat-reasoning-effort.js';

export interface CatalogModel {
  id: string;
  label: string;
  reasoningEfforts: string[];
}

export interface CatalogModelGroup {
  id?: string;
  provider: string;
  providerId: string;
  models: CatalogModel[];
}

export interface ModelGroupKeyInput {
  id?: string;
  provider: string;
  providerId?: string;
}

/** Parse the /api/models group payload into the shape the picker renders. */
export function parseModelCatalogGroups(raw: unknown): CatalogModelGroup[] {
  const groups = Array.isArray(raw) ? raw : [];
  return groups.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const provider = String(record.provider || record.provider_id || 'Provider');
    const rows = Array.isArray(record.models) ? record.models : [];
    const models = rows.flatMap((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
      const model = row as Record<string, unknown>;
      const id = String(model.id || model.name || model.label || '');
      if (!id) return [];
      return [{
        id,
        label: String(model.label || model.name || model.id || id),
        reasoningEfforts: normalizeReasoningEfforts(model.reasoning_efforts),
      }];
    });
    if (!models.length) return [];
    return [{
      id: String(record.id || record.provider_id || record.provider || ''),
      provider,
      providerId: String(record.provider_id || record.provider || ''),
      models,
    }];
  });
}

/** Stable React key for a picker optgroup. */
export function modelGroupKey(group: ModelGroupKeyInput): string {
  return group.id || group.providerId || group.provider;
}

/** Stable React key for one picker option inside its group. */
export function modelOptionKey(group: ModelGroupKeyInput, modelId: string): string {
  return `${modelGroupKey(group)}:${modelId}`;
}

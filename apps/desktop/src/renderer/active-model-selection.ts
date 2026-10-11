import { useSyncExternalStore } from 'react';
import { isMultiAgentModelSelection, parseProviderModelId } from './provider-model-selection.js';

const STORAGE_KEY = 'lastbrowser.activeModelSelection.v1';
type StoredSelection = { version: 1; disabledByScope: Record<string, string[]> };
export type ActiveModelScope = Readonly<{ browserProfileId: string; backendProfileName: string }>;
export type ActiveModelChoice = Readonly<{ id: string; providerId: string }>;

const listeners = new Set<() => void>();
let revision = 0;

function scopeKey(scope: ActiveModelScope): string {
  return JSON.stringify([scope.browserProfileId.trim(), scope.backendProfileName.trim().toLowerCase() || 'default']);
}

function pairKey(providerId: string, modelId: string): string {
  const provider = providerId.trim().toLowerCase();
  return JSON.stringify([provider, parseProviderModelId(modelId, provider).model.trim()]);
}

function readStored(storage: Pick<Storage, 'getItem'>): StoredSelection {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Partial<StoredSelection>;
      if (record.version === 1 && record.disabledByScope && typeof record.disabledByScope === 'object'
        && !Array.isArray(record.disabledByScope)) return { version: 1, disabledByScope: { ...record.disabledByScope } };
    }
  } catch { /* Corrupt preferences must not hide newly discovered models. */ }
  return { version: 1, disabledByScope: {} };
}

/** Absent entries are active, so each newly discovered model starts active. */
export function isModelActive(storage: Pick<Storage, 'getItem'>, scope: ActiveModelScope,
  providerId: string, modelId: string): boolean {
  if (!providerId.trim() || !modelId.trim() || isMultiAgentModelSelection({ provider: providerId, model: modelId })) return false;
  const disabled = readStored(storage).disabledByScope[scopeKey(scope)];
  return !Array.isArray(disabled) || !disabled.includes(pairKey(providerId, modelId));
}

/** Persist only explicit opt-outs. Re-selecting a model removes its tombstone. */
export function setModelActive(storage: Pick<Storage, 'getItem' | 'setItem'>, scope: ActiveModelScope,
  providerId: string, modelId: string, active: boolean): void {
  if (!providerId.trim() || !modelId.trim() || isMultiAgentModelSelection({ provider: providerId, model: modelId })) return;
  const stored = readStored(storage);
  const key = scopeKey(scope);
  const disabled = new Set(Array.isArray(stored.disabledByScope[key])
    ? stored.disabledByScope[key].filter((item): item is string => typeof item === 'string') : []);
  const pair = pairKey(providerId, modelId);
  if (active) disabled.delete(pair);
  else disabled.add(pair);
  if (disabled.size) stored.disabledByScope[key] = [...disabled];
  else delete stored.disabledByScope[key];
  storage.setItem(STORAGE_KEY, JSON.stringify(stored));
  revision += 1;
  for (const listener of listeners) listener();
}

export function chooseActiveModel(choices: readonly ActiveModelChoice[], selected: Readonly<{ model: string; provider?: string }>,
  storage: Pick<Storage, 'getItem'>, scope: ActiveModelScope): Readonly<{ choice: ActiveModelChoice | null; changed: boolean }> {
  const active = choices.filter(choice => isModelActive(storage, scope, choice.providerId, choice.id));
  const current = active.find(choice => choice.id === selected.model && choice.providerId === selected.provider);
  const choice = current || active[0] || null;
  return { choice, changed: Boolean(selected.model) && (!choice || choice.id !== selected.model || choice.providerId !== selected.provider) };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    revision += 1;
    for (const current of listeners) current();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

export function useActiveModelRevision(): number {
  return useSyncExternalStore(subscribe, () => revision, () => 0);
}

/**
 * Per-model visibility switches for Lastbrowser (GitHub issue #172, F3).
 *
 * The settings panel can switch individual catalog models off. Disabled models
 * disappear from the full chat composer and from the Quickchat model picker.
 * Switches are stored provider-qualified so two providers can offer the same
 * model id without sharing a switch, and the choice survives a catalog reload
 * and an app restart because it lives in localStorage.
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lastbrowser.disabledModels.v1';

/** Fired on `window` whenever the disabled-model set changes. */
export const MODEL_VISIBILITY_EVENT = 'lastbrowser:model-visibility-changed';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Announce a switch change so every mounted chat surface (full chat, quickchat)
 * re-reads the disabled set. No-ops outside a browser, which keeps the module
 * importable from the node test environment.
 */
export function notifyModelVisibilityChanged(target?: EventTarget): void {
  const host = target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!host || typeof CustomEvent === 'undefined') return;
  host.dispatchEvent(new CustomEvent(MODEL_VISIBILITY_EVENT));
}

/** Provider-qualified switch key: `provider:model`, or the bare model id. */
export function modelVisibilityKey(providerId: string | undefined | null, modelId: string): string {
  const model = String(modelId ?? '').trim();
  if (!model) return '';
  const provider = String(providerId ?? '').trim().toLowerCase();
  return provider ? `${provider}:${model}` : model;
}

/** Read the disabled-model set, tolerating missing or corrupt storage. */
export function loadDisabledModels(storage: StorageLike): Set<string> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.flatMap((entry) => {
      const key = typeof entry === 'string' ? entry.trim() : '';
      return key ? [key] : [];
    }));
  } catch {
    return new Set();
  }
}

/** Persist the disabled-model set and return the normalised copy. */
export function saveDisabledModels(storage: StorageLike, disabled: Iterable<string>): Set<string> {
  const keys = new Set(Array.from(disabled, (key) => String(key || '').trim()).filter(Boolean));
  const sorted = Array.from(keys).sort();
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // Storage is optional; a failed write must not block the settings panel.
  }
  return new Set(sorted);
}

/** Flip one model switch, persist it, and return the resulting disabled set. */
export function setModelEnabled(
  storage: StorageLike,
  providerId: string | undefined | null,
  modelId: string,
  enabled: boolean,
): Set<string> {
  const key = modelVisibilityKey(providerId, modelId);
  const disabled = loadDisabledModels(storage);
  if (!key) return disabled;
  const wasDisabled = disabled.has(key);
  if (enabled) disabled.delete(key);
  else disabled.add(key);
  const saved = saveDisabledModels(storage, disabled);
  if (enabled ? wasDisabled : !wasDisabled) notifyModelVisibilityChanged();
  return saved;
}

/** True when the model is switched off. Ignores provider casing and accepts
 *  provider-less checks so a chat surface that only knows the model id still
 *  hides a model disabled via its provider-qualified switch. */
export function isModelDisabled(
  disabled: ReadonlySet<string>,
  providerId: string | undefined | null,
  modelId: string,
): boolean {
  const model = String(modelId ?? '').trim();
  if (!model) return false;
  const provider = String(providerId ?? '').trim().toLowerCase();
  if (provider && disabled.has(`${provider}:${model}`)) return true;
  if (disabled.has(model)) return true;
  if (!provider) {
    for (const key of disabled) {
      if (key.endsWith(`:${model}`)) return true;
    }
  }
  return false;
}

/** Drop disabled entries from a flat model list, preserving order. */
export function filterVisibleModels<T extends { id: string; providerId?: string }>(
  models: T[],
  disabled: ReadonlySet<string>,
): T[] {
  return models.filter((model) => !isModelDisabled(disabled, model.providerId, model.id));
}

/** Drop disabled models from a grouped catalog, removing groups left empty. */
export function filterVisibleModelGroups<T extends { providerId?: string; models: Array<{ id: string }> }>(
  groups: T[],
  disabled: ReadonlySet<string>,
): T[] {
  return groups
    .map((group) => ({
      ...group,
      models: group.models.filter((model) => !isModelDisabled(disabled, group.providerId, model.id)),
    }))
    .filter((group) => group.models.length > 0);
}

/** First enabled model across a grouped catalog, used as the switch-off fallback. */
export function firstEnabledCatalogModel<
  T extends { providerId?: string; provider?: string; models: Array<{ id: string; label?: string }> },
>(
  groups: T[],
  disabled: ReadonlySet<string>,
): { providerId: string; id: string; label: string } | null {
  for (const group of groups) {
    for (const model of group.models) {
      if (isModelDisabled(disabled, group.providerId, model.id)) continue;
      return { providerId: group.providerId || '', id: model.id, label: model.label || model.id };
    }
  }
  return null;
}

/**
 * React binding for the per-model switches: returns the disabled set and
 * re-renders the calling surface whenever any component flips a switch.
 */
export function useDisabledModels(
  storage: StorageLike | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): ReadonlySet<string> {
  const [disabled, setDisabled] = useState<Set<string>>(() =>
    storage ? loadDisabledModels(storage) : new Set(),
  );
  useEffect(() => {
    if (!storage) return;
    const sync = () => setDisabled(loadDisabledModels(storage));
    sync();
    window.addEventListener(MODEL_VISIBILITY_EVENT, sync);
    return () => window.removeEventListener(MODEL_VISIBILITY_EVENT, sync);
  }, [storage]);
  return disabled;
}

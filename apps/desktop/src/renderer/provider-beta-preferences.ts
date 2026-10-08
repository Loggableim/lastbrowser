import { useSyncExternalStore } from 'react';

let showUntestedBetas = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readShowUntestedProviderBetas(): boolean {
  return showUntestedBetas;
}

export function useShowUntestedProviderBetas(): boolean {
  return useSyncExternalStore(subscribe, readShowUntestedProviderBetas, () => false);
}

/** This is deliberately session-only; reloads and app updates close the beta gate. */
export function setShowUntestedProviderBetas(enabled: boolean): void {
  if (showUntestedBetas === enabled) return;
  showUntestedBetas = enabled;
  for (const listener of listeners) listener();
}

export function filterQualifiedModelGroups<T extends {
  providerId: string;
  models: readonly { id: string }[];
}>(
  groups: readonly T[],
  browserProfileId: string,
  showBetas: boolean,
  isQualified: (providerId: string, modelId: string, profileId: string) => boolean,
): T[] {
  return groups.flatMap(group => {
    if (showBetas) return [group];
    const models = group.models.filter(model => isQualified(group.providerId, model.id, browserProfileId));
    return models.length ? [{ ...group, models }] : [];
  });
}

export function isProviderQualifiedByModels(
  providerId: string,
  groups: readonly { providerId: string; models: readonly { id: string }[] }[],
  browserProfileId: string,
  isQualified: (providerId: string, modelId: string, profileId: string) => boolean,
): boolean {
  return groups.some(group => group.providerId.trim().toLowerCase() === providerId.trim().toLowerCase()
    && group.models.some(model => isQualified(group.providerId, model.id, browserProfileId)));
}

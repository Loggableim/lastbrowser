import { IndependentAssistantClient } from './independent-assistant-client.js';
import { mapScopedModelPickerOptions, type ModelPickerOptionGroup } from './model-picker-options.js';

export const MODEL_CATALOG_EVENT = 'lastbrowser:model-catalog-ready';
const STORAGE_KEY = 'lastbrowser.chatModelCatalog.v1';

export function readModelCatalogGroups(viewKey: string): ModelPickerOptionGroup[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '');
    if (raw?.viewKey === viewKey && Array.isArray(raw.groups)) return raw.groups as ModelPickerOptionGroup[];
  } catch {
    // A damaged cache must not block chat. The next startup prefetch replaces it.
  }
  return [];
}

export function publishModelCatalog(viewKey: string, groups: ModelPickerOptionGroup[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ viewKey, groups }));
  } catch {
    // The in-memory event still updates the open chat when storage is full.
  }
  window.dispatchEvent(new CustomEvent(MODEL_CATALOG_EVENT, { detail: { viewKey, groups } }));
}

export function clearModelCatalog(): void {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export async function prefetchModelCatalog(input: {
  viewKey: string;
  browserProfileId: string;
  workspacePath: string | null;
  backendProfileName?: string;
}): Promise<void> {
  const bridge = window.lastbrowser?.independent;
  if (!bridge) return;
  const client = new IndependentAssistantClient(bridge);
  const resolved = await client.request({
    schemaVersion: 1,
    operation: 'resolveScope',
    payload: { browserProfileId: input.browserProfileId, workspacePath: input.workspacePath },
    backendProfileName: input.backendProfileName
  });
  if (!resolved.ok) return;
  const result = await client.request({
    schemaVersion: 1,
    operation: 'modelSelection',
    scope: resolved.value.scope,
    payload: { action: 'get', includeCatalog: true },
    backendProfileName: input.backendProfileName
  });
  if (!result.ok || !Array.isArray(result.value.groups)) return;
  publishModelCatalog(input.viewKey, mapScopedModelPickerOptions(result.value));
}

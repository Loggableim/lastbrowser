import { IndependentAssistantClient } from './independent-assistant-client.js';
import { mapScopedModelPickerOptions, type ModelPickerOptionGroup } from './model-picker-options.js';

export const MODEL_CATALOG_EVENT = 'lastbrowser:model-catalog-ready';
export const CATALOG_VISIBLE_WAIT_MS = 12000;
const STORAGE_KEY = 'lastbrowser.chatModelCatalog.v1';
const QUICKCHAT_CATALOG_KEY = 'lastbrowser.quickchatModelCatalog.v1';

/** One canonical view key so the startup prefetch and the standard picker share a cache. */
export function chatModelCatalogViewKey(input: {
  browserProfileId: string;
  workspacePath: string;
  backendProfileName?: string | null;
}): string {
  return JSON.stringify([input.browserProfileId, input.workspacePath, input.backendProfileName || 'default']);
}

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

export function readQuickchatCatalog<T>(scopeKey: string): T[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(QUICKCHAT_CATALOG_KEY) || '');
    if (raw?.scopeKey === scopeKey && Array.isArray(raw.models)) return raw.models as T[];
  } catch {
    // A damaged Quickchat cache falls through to the live catalog request.
  }
  return [];
}

export function publishQuickchatCatalog(scopeKey: string, models: readonly unknown[]): void {
  try {
    window.localStorage.setItem(QUICKCHAT_CATALOG_KEY, JSON.stringify({ scopeKey, models }));
  } catch {
    // The in-memory list still paints the open picker.
  }
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

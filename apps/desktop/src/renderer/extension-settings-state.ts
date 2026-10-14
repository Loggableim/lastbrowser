import { isRecord } from './panels/RestPanelShared.js';

export const EXTENSION_RECOMMENDATION_PAGE_SIZE = 12;

export { CURATED_EXTENSION_CATALOG as USER_APPROVED_EXTENSION_CANDIDATES } from './curated-extension-catalog.js';

export type ExtensionRecommendation = {
  id: string;
  name: string;
  category: string;
  description?: string;
  author?: string;
};

export function filterExtensionRecommendations<T extends ExtensionRecommendation>(
  entries: readonly T[], query: string, category: string, allowedIds: ReadonlySet<string>
): T[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => allowedIds.has(entry.id)
    && (category === 'all' || entry.category === category)
    && (!needle || `${entry.name} ${entry.category} ${entry.description || ''} ${entry.author || ''}`.toLowerCase().includes(needle)));
}

export function paginateExtensionRecommendations<T>(entries: readonly T[], page: number, pageSize = EXTENSION_RECOMMENDATION_PAGE_SIZE): T[] {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(entries.length / safeSize));
  const safePage = Math.min(Math.max(0, Math.floor(page)), pageCount - 1);
  return entries.slice(safePage * safeSize, (safePage + 1) * safeSize);
}

export function chromeWebStoreSearchUrl(query: string): string | null {
  const value = query.trim();
  return value ? `https://chromewebstore.google.com/search/${encodeURIComponent(value)}` : null;
}

export type ExtensionSettingsApi<TExtension, TPreset> = {
  list: () => Promise<unknown>;
  presets: () => Promise<unknown>;
};

export async function loadExtensionSettingsData<TExtension, TPreset = never>(api: ExtensionSettingsApi<TExtension, TPreset>): Promise<{
  extensions: TExtension[];
  presets: TPreset[];
}> {
  const extensionsPromise = api.list();
  const [extensions, presets] = await Promise.all([extensionsPromise, Promise.resolve().then(() => api.presets()).catch(() => [])]);
  return {
    extensions: normalizeExtensionItems<TExtension>(extensions, 'extensions'),
    presets: normalizeExtensionItems<TPreset>(presets, 'extension presets')
  };
}

/** Normalize the extension IPC boundary before settings components render it. */
export function normalizeExtensionItems<T>(value: unknown, label: string): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid ${label} response: expected an array`);
  return value.filter(isRecord) as T[];
}

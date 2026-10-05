import { isRecord } from './panels/RestPanelShared.js';

export type ExtensionSettingsApi<TExtension, TPreset> = {
  list: () => Promise<unknown>;
  presets: () => Promise<unknown>;
};

export async function loadExtensionSettingsData<TExtension, TPreset>(api: ExtensionSettingsApi<TExtension, TPreset>): Promise<{
  extensions: TExtension[];
  presets: TPreset[];
}> {
  const [extensions, presets] = await Promise.all([api.list(), api.presets()]);
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

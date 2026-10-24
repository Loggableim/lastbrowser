import type { DesktopTranslationKey } from './i18n/keys.js';

/**
 * Localized optgroup labels for the F3 model picker (GitHub issue #172).
 *
 * The backend catalog emits the OpenCode Go catalog as a paid group and a free
 * group. Both keep the same ``provider_id`` and are distinguished by the extra
 * ``id`` field, so the renderer keys the label on that id. Every other group
 * keeps the provider label the backend emitted unchanged.
 */
const GROUP_LABEL_KEYS: Record<string, DesktopTranslationKey> = {
  'opencode-go': 'chat.modelGroupOpenCodeGo',
  'opencode-go-free': 'chat.modelGroupOpenCodeGoFree'
};

type Translator = (key: DesktopTranslationKey) => string;

export type ModelGroupLike = {
  id?: string;
  providerId?: string;
  provider?: string;
};

/** Localized label for one catalog group, falling back to the backend label. */
export function modelGroupLabel(group: ModelGroupLike, t: Translator): string {
  const id = String(group.id || '').trim().toLowerCase();
  const provider = String(group.provider || '').trim();
  const key = GROUP_LABEL_KEYS[id]
    || (provider === 'OpenCode Go Free' ? 'chat.modelGroupOpenCodeGoFree' : undefined);
  if (key) return t(key);
  return provider || String(group.providerId || '').trim();
}

import { parseProviderModelId } from './provider-model-selection.js';
import type { DesktopLocaleId } from './i18n/keys.js';

export const REASONING_EFFORT_LABELS: Record<string, string> = {
  none: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Very high',
  max: 'Max',
};

const localizedLabels: Record<DesktopLocaleId, readonly string[]> = {
  en: ['Off', 'Minimal', 'Low', 'Medium', 'High', 'Very high', 'Maximum'],
  de: ['Aus', 'Minimal', 'Niedrig', 'Mittel', 'Hoch', 'Sehr hoch', 'Maximum'],
  es: ['Desactivado', 'Mínimo', 'Bajo', 'Medio', 'Alto', 'Muy alto', 'Máximo'],
  fr: ['Désactivé', 'Minimal', 'Faible', 'Moyen', 'Élevé', 'Très élevé', 'Maximum'],
  it: ['Disattivato', 'Minimo', 'Basso', 'Medio', 'Alto', 'Molto alto', 'Massimo'],
  'pt-BR': ['Desativado', 'Mínimo', 'Baixo', 'Médio', 'Alto', 'Muito alto', 'Máximo'],
  ru: ['Выкл.', 'Минимальная', 'Низкая', 'Средняя', 'Высокая', 'Очень высокая', 'Максимальная'],
  ja: ['オフ', '最小', '低', '中', '高', '非常に高い', '最大'],
};

export function reasoningEffortLabel(effort: string, locale: DesktopLocaleId): string {
  const index = Object.keys(REASONING_EFFORT_LABELS).indexOf(effort);
  return localizedLabels[locale][index] ?? effort;
}

/** Match only the selected provider and model, including legacy qualified IDs.
 * Missing metadata stays unknown; it must not erase a conversation preference.
 */
export function resolveReasoningModel<T extends { id: string }>(
  model: string, provider: string,
  groups: readonly { providerId: string; models: readonly T[] }[],
): T | null {
  const selected = parseProviderModelId(model, provider || undefined);
  const matches = groups.flatMap(group => {
    if (selected.provider && group.providerId !== selected.provider) return [];
    return group.models.filter(entry => {
      const candidate = parseProviderModelId(entry.id, group.providerId || undefined);
      return candidate.model === selected.model && candidate.provider === (selected.provider || group.providerId || undefined);
    });
  });
  return matches.length === 1 ? matches[0] : null;
}

const PERSISTENCE_KEY = 'lastbrowser.chatReasoningEffort.v1';

/** Restore only the server's exact provider/model choice; discovery availability
 * is checked separately so a temporarily missing catalog never deletes it. */
export function resolveSessionReasoningEffort(value: unknown, model: string, provider: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.provider !== 'string' || typeof record.model !== 'string'
    || typeof record.effort !== 'string' || !normalizeReasoningEfforts([record.effort]).includes(record.effort)) return null;
  const selected = parseProviderModelId(model, provider || undefined);
  const saved = parseProviderModelId(record.model, record.provider || undefined);
  return selected.provider && selected.provider === saved.provider && selected.model === saved.model ? record.effort : null;
}

export function normalizeReasoningEfforts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const effort = typeof item === 'string' ? item.trim().toLowerCase() : '';
    if (!effort || !Object.hasOwn(REASONING_EFFORT_LABELS, effort) || seen.has(effort)) return [];
    seen.add(effort);
    return [effort];
  });
}

export function loadChatReasoningEffort(
  sessionId: string | null | undefined,
  storage: Pick<Storage, 'getItem'>,
): string {
  if (!sessionId) return '';
  try {
    const raw = storage.getItem(PERSISTENCE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
    const value = (parsed as Record<string, unknown>)[sessionId];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export function saveChatReasoningEffort(
  sessionId: string | null | undefined,
  effort: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): void {
  if (!sessionId) return;
  try {
    const raw = storage.getItem(PERSISTENCE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const values = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
    if (effort) values[sessionId] = effort;
    else delete values[sessionId];
    storage.setItem(PERSISTENCE_KEY, JSON.stringify(values));
  } catch {
    // Storage is optional; a failed preference write must not block chat.
  }
}

export const REASONING_EFFORT_LABELS: Record<string, string> = {
  none: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Very high',
  max: 'Max',
};

const PERSISTENCE_KEY = 'lastbrowser.chatReasoningEffort.v1';

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

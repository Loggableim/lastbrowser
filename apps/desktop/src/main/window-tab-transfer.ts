export type DetachTabPayload = {
  tab: { id: string; url: string; [key: string]: unknown };
  guestWebContentsId: number;
  screenX: number;
  screenY: number;
  spacePath?: string;
};

export type NavigationHistoryEntrySnapshot = {
  pageState?: string;
  title: string;
  url: string;
};

export type NavigationHistorySnapshot = {
  entries: NavigationHistoryEntrySnapshot[];
  index: number;
};

type NavigationHistoryReader = {
  getAllEntries: () => Array<{ pageState?: string; title: string; url: string }>;
  getActiveIndex: () => number;
};

/** Keep only the structured-clone-safe fields accepted by Electron restore(). */
export function serializeNavigationHistory(history: NavigationHistoryReader): NavigationHistorySnapshot | null {
  try {
    const sourceEntries = history.getAllEntries();
    const index = history.getActiveIndex();
    if (!Array.isArray(sourceEntries) || sourceEntries.length === 0
      || !Number.isInteger(index) || index < 0 || index >= sourceEntries.length) return null;

    const entries: NavigationHistoryEntrySnapshot[] = [];
    for (const entry of sourceEntries) {
      if (!entry || typeof entry.url !== 'string' || typeof entry.title !== 'string') return null;
      entries.push({
        ...(typeof entry.pageState === 'string' ? { pageState: entry.pageState } : {}),
        title: entry.title,
        url: entry.url
      });
    }
    return { entries, index };
  } catch {
    return null;
  }
}

/** A webview guest may only be inspected by the shell renderer that owns it. */
export function isGuestOwnedByRenderer(
  guest: { hostWebContents?: { id?: number } } | null | undefined,
  rendererWebContentsId: number
): boolean {
  return Number.isInteger(rendererWebContentsId)
    && Number.isInteger(guest?.hostWebContents?.id)
    && guest?.hostWebContents?.id === rendererWebContentsId;
}

/** Validate renderer IPC before creating a destination window. */
export function parseDetachTabPayload(value: unknown): DetachTabPayload | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Partial<DetachTabPayload>;
  const tab = payload.tab;
  if (!tab || typeof tab !== 'object') return null;
  if (typeof tab.id !== 'string' || !tab.id.trim()) return null;
  if (typeof tab.url !== 'string' || !tab.url.trim()) return null;
  if (!Number.isInteger(payload.guestWebContentsId) || (payload.guestWebContentsId ?? 0) <= 0) return null;
  if (!Number.isFinite(payload.screenX) || !Number.isFinite(payload.screenY)) return null;
  return payload as DetachTabPayload;
}

/** Coalesce repeated detach requests for the same tab from the same window. */
export class PendingTabDetachRegistry<T> {
  private readonly pending = new Map<string, Promise<T>>();

  run(key: string, operation: () => Promise<T>): Promise<T> {
    const current = this.pending.get(key);
    if (current) return current;

    // Deferring invocation by one microtask lets the pending promise reserve
    // the key before another IPC event can start a second destination window.
    const request = Promise.resolve().then(operation);
    this.pending.set(key, request);
    const clear = () => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    };
    void request.then(clear, clear);
    return request;
  }
}

export function detachRequestKey(sourceWebContentsId: number, tabId: string): string {
  return JSON.stringify([sourceWebContentsId, tabId]);
}

/**
 * Download tracking for the browser.
 *
 * Electron downloads run to completion whether or not anything observes them,
 * but without a `will-download` handler the user gets no feedback at all: no
 * progress, no "saved to", no way to see what happened. This module tracks
 * every download across all sessions (each browser profile has its own) and
 * forwards state changes to the renderer.
 */

export type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted';

export type DownloadEntry = {
  id: string;
  filename: string;
  url: string;
  /** Bytes received so far. */
  received: number;
  /** Total bytes, or 0 when the server did not send a length. */
  total: number;
  state: DownloadState;
  /** Absolute path once the download finished. */
  savePath: string;
  /** Unix ms when the download started. */
  startedAt: number;
};

type DownloadItemLike = {
  getFilename(): string;
  getURL(): string;
  getReceivedBytes(): number;
  getTotalBytes(): number;
  getSavePath(): string;
  isPaused?(): boolean;
  setSavePath?(path: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
};

type SessionLike = {
  on(event: 'will-download', listener: (event: unknown, item: DownloadItemLike, webContents: unknown) => void): void;
};

export type DownloadTracker = {
  /** Attach to a session (each browser profile creates its own). */
  attach(session: SessionLike): void;
  /** Current snapshot, newest first. */
  list(): DownloadEntry[];
  /** Remove one entry from the list. */
  clear(id: string): void;
  /** Remove finished entries. */
  clearFinished(): void;
  /** Subscribe to list changes. Returns an unsubscribe function. */
  subscribe(listener: (entries: DownloadEntry[]) => void): () => void;
};

export function createDownloadTracker(): DownloadTracker {
  const entries = new Map<string, DownloadEntry>();
  const listeners = new Set<(entries: DownloadEntry[]) => void>();
  const attached = new Set<SessionLike>();
  let counter = 0;
  // Monotonic sequence for ordering: two downloads can start in the same
  // millisecond, so `startedAt` alone is not a stable sort key.
  let sequence = 0;
  const order = new Map<string, number>();

  const snapshot = (): DownloadEntry[] =>
    Array.from(entries.values()).sort(
      (a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0)
    );

  const emit = (): void => {
    const list = snapshot();
    for (const listener of listeners) {
      try {
        listener(list);
      } catch {
        // A broken listener must not stop the others.
      }
    }
  };

  const update = (id: string, patch: Partial<DownloadEntry>): void => {
    const current = entries.get(id);
    if (!current) return;
    entries.set(id, { ...current, ...patch });
    emit();
  };

  return {
    attach(session: SessionLike): void {
      if (attached.has(session)) return;
      attached.add(session);
      session.on('will-download', (_event, item) => {
        const id = `dl-${++counter}-${Date.now()}`;
        order.set(id, ++sequence);
        entries.set(id, {
          id,
          filename: item.getFilename(),
          url: item.getURL(),
          received: item.getReceivedBytes(),
          total: item.getTotalBytes(),
          state: 'progressing',
          savePath: item.getSavePath(),
          startedAt: Date.now()
        });
        emit();

        item.on('updated', () => {
          update(id, {
            received: item.getReceivedBytes(),
            total: item.getTotalBytes(),
            state: item.isPaused?.() ? 'interrupted' : 'progressing'
          });
        });
        item.on('done', (_e, state) => {
          const finalState = String(state);
          update(id, {
            received: item.getReceivedBytes(),
            total: item.getTotalBytes(),
            savePath: item.getSavePath(),
            state:
              finalState === 'completed'
                ? 'completed'
                : finalState === 'cancelled'
                  ? 'cancelled'
                  : 'interrupted'
          });
        });
      });
    },

    list(): DownloadEntry[] {
      return snapshot();
    },

    clear(id: string): void {
      entries.delete(id);
      emit();
    },

    clearFinished(): void {
      for (const [id, entry] of entries) {
        if (entry.state !== 'progressing') entries.delete(id);
      }
      emit();
    },

    subscribe(listener: (entries: DownloadEntry[]) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

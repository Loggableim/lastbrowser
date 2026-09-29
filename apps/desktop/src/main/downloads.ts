import { existsSync } from 'node:fs';
import path from 'node:path';

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

// Keep a useful recent history without retaining every completed transfer for
// the lifetime of the browser process. In-progress downloads are never pruned.
const MAX_FINISHED_DOWNLOADS = 500;

export type DownloadEntry = {
  id: string;
  filename: string;
  url: string;
  /** Bytes received so far. */
  received: number;
  /** Total bytes, or 0 when the server did not send a length. */
  total: number;
  state: DownloadState;
  /** True while Electron still owns an active DownloadItem (including paused). */
  active: boolean;
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
  cancel(): void;
  setSavePath?(path: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
};

type SessionLike = {
  on(event: 'will-download', listener: (event: unknown, item: DownloadItemLike, webContents: unknown) => void): void;
};

export type DownloadTracker = {
  /** Attach to a session (each browser profile creates its own). */
  attach(session: SessionLike, downloadsDirectory?: string): void;
  /** Current snapshot, newest first. */
  list(): DownloadEntry[];
  /** Remove one entry from the list. */
  clear(id: string): void;
  /** Cancel a live Electron download without removing its history entry. */
  cancel(id: string): boolean;
  /** Remove finished entries. */
  clearFinished(): void;
  /** Subscribe to list changes. Returns an unsubscribe function. */
  subscribe(listener: (entries: DownloadEntry[]) => void): () => void;
};

function sanitizeFilename(filename: string): string {
  // Electron normally returns a filename, but a remote Content-Disposition
  // value must never be allowed to choose a directory or an invalid path.
  let safe = String(filename || '').split(/[\\/]/).pop() || '';
  safe = safe.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim();
  if (!safe || safe === '.' || safe === '..') safe = 'download';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  return safe;
}

function reserveDownloadPath(
  downloadsDirectory: string,
  filename: string,
  reservedPaths: Set<string>
): { path: string; key: string } {
  const safeFilename = sanitizeFilename(filename);
  const extension = path.extname(safeFilename);
  const stem = safeFilename.slice(0, safeFilename.length - extension.length);
  const directory = path.resolve(downloadsDirectory);
  for (let suffix = 0; ; suffix += 1) {
    const candidate = path.join(directory, suffix === 0 ? safeFilename : `${stem} (${suffix})${extension}`);
    const key = candidate.toLowerCase();
    if (!existsSync(candidate) && !reservedPaths.has(key)) {
      reservedPaths.add(key);
      return { path: candidate, key };
    }
  }
}

type DownloadWindowLike = {
  isDestroyed(): boolean;
  webContents: { send(channel: string, entries: DownloadEntry[]): void };
};

/** Publish a snapshot to every live browser window, including detached tabs. */
export function broadcastDownloadSnapshot(windows: Iterable<DownloadWindowLike>, entries: DownloadEntry[]): void {
  for (const window of windows) {
    try {
      if (!window.isDestroyed()) window.webContents.send('lastbrowser:downloads:changed', entries);
    } catch {
      // A window closing while a download changes must not block other windows.
    }
  }
}

export function createDownloadTracker(): DownloadTracker {
  const entries = new Map<string, DownloadEntry>();
  const listeners = new Set<(entries: DownloadEntry[]) => void>();
  const attached = new Set<SessionLike>();
  // Paused items report a non-progressing UI state but are still live Electron
  // DownloadItems. Keep them out of finished-history pruning until `done`.
  const activeDownloads = new Set<string>();
  const downloadItems = new Map<string, DownloadItemLike>();
  const reservedPaths = new Set<string>();
  const reservationById = new Map<string, string>();
  let counter = 0;
  // Monotonic sequence for ordering: two downloads can start in the same
  // millisecond, so `startedAt` alone is not a stable sort key.
  let sequence = 0;
  const order = new Map<string, number>();

  const pruneFinished = (): void => {
    const finished = Array.from(entries.values())
      .filter((entry) => entry.state !== 'progressing' && !activeDownloads.has(entry.id))
      .sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));
    for (const entry of finished.slice(MAX_FINISHED_DOWNLOADS)) {
      entries.delete(entry.id);
      order.delete(entry.id);
    }
  };

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
    if (patch.state && patch.state !== 'progressing') pruneFinished();
    emit();
  };

  return {
    attach(session: SessionLike, downloadsDirectory?: string): void {
      if (attached.has(session)) return;
      attached.add(session);
      session.on('will-download', (_event, item) => {
        const id = `dl-${++counter}-${Date.now()}`;
        activeDownloads.add(id);
        downloadItems.set(id, item);
        order.set(id, ++sequence);

        // Without an explicit path Electron falls back to its save dialog.
        // Lastbrowser provides its own download surface, so save into the
        // standard Downloads folder and let that surface report the outcome.
        if (downloadsDirectory && item.setSavePath && !item.getSavePath()) {
          let reservation: { path: string; key: string } | undefined;
          try {
            reservation = reserveDownloadPath(downloadsDirectory, item.getFilename(), reservedPaths);
            item.setSavePath(reservation.path);
            reservationById.set(id, reservation.key);
          } catch {
            if (reservation) reservedPaths.delete(reservation.key);
            // Preserve Electron's default save flow if path selection fails.
          }
        }
        entries.set(id, {
          id,
          filename: item.getFilename(),
          url: item.getURL(),
          received: item.getReceivedBytes(),
          total: item.getTotalBytes(),
          state: 'progressing',
          active: true,
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
          activeDownloads.delete(id);
          downloadItems.delete(id);
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
                  : 'interrupted',
            active: false
          });
          const reservation = reservationById.get(id);
          if (reservation) reservedPaths.delete(reservation);
          reservationById.delete(id);
        });
      });
    },

    list(): DownloadEntry[] {
      return snapshot();
    },

    clear(id: string): void {
      // An active row can only be removed after Electron confirms completion
      // or cancellation. This prevents the UI from hiding a live transfer.
      if (activeDownloads.has(id)) return;
      entries.delete(id);
      order.delete(id);
      emit();
    },

    cancel(id: string): boolean {
      const item = downloadItems.get(id);
      if (!item || !activeDownloads.has(id)) return false;
      try {
        item.cancel();
        return true;
      } catch {
        return false;
      }
    },

    clearFinished(): void {
      for (const [id, entry] of entries) {
        if (entry.state !== 'progressing' && !activeDownloads.has(id)) {
          entries.delete(id);
          order.delete(id);
        }
      }
      emit();
    },

    subscribe(listener: (entries: DownloadEntry[]) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

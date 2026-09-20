/**
 * Downloads panel for the browser.
 *
 * Electron downloads complete whether or not anything observes them, so without
 * this the user gets no feedback at all — no progress, no "saved to", no way to
 * see what happened. The main process tracks every download across all browser
 * profiles and pushes changes here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, Loader2, Trash2, X, XCircle } from 'lucide-react';

export type DownloadEntry = {
  id: string;
  filename: string;
  url: string;
  received: number;
  total: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  savePath: string;
  startedAt: number;
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Progress as 0..1, or null when the server sent no content length. */
function progressOf(entry: DownloadEntry): number | null {
  if (!entry.total || entry.total <= 0) return null;
  return Math.min(1, Math.max(0, entry.received / entry.total));
}

export function DownloadItemRow({
  entry,
  onClear
}: {
  entry: DownloadEntry;
  onClear: (id: string) => void;
}): JSX.Element {
  const progress = progressOf(entry);
  const done = entry.state === 'completed';

  return (
    <div className={`download-row ${entry.state}`}>
      <span className="download-icon">
        {entry.state === 'progressing' && <Loader2 size={15} className="spin" />}
        {done && <CheckCircle2 size={15} />}
        {(entry.state === 'cancelled' || entry.state === 'interrupted') && <XCircle size={15} />}
      </span>
      <span className="download-copy">
        <strong title={entry.filename}>{entry.filename}</strong>
        <small>
          {entry.state === 'progressing' && (
            progress === null
              ? `${formatBytes(entry.received)}`
              : `${formatBytes(entry.received)} / ${formatBytes(entry.total)}`
          )}
          {done && `Saved to ${entry.savePath}`}
          {entry.state === 'cancelled' && 'Cancelled'}
          {entry.state === 'interrupted' && 'Interrupted'}
        </small>
        {entry.state === 'progressing' && (
          <span className="download-progress">
            <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </span>
        )}
      </span>
      <button type="button" aria-label="Remove from list" title="Remove from list" onClick={() => onClear(entry.id)}>
        <X size={13} />
      </button>
    </div>
  );
}

export function DownloadsPanel({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const [entries, setEntries] = useState<DownloadEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await window.lastbrowser.downloads.list();
      setEntries(Array.isArray(list) ? (list as DownloadEntry[]) : []);
    } catch {
      // The bridge may not be ready yet; the push channel will catch up.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const unsubscribe = window.lastbrowser.downloads.onChanged((next) => {
      setEntries(Array.isArray(next) ? (next as DownloadEntry[]) : []);
    });
    return () => unsubscribe();
  }, [open, refresh]);

  if (!open) return null;

  const active = entries.filter((entry) => entry.state === 'progressing').length;

  return (
    <div className="downloads-panel" role="dialog" aria-label="Downloads">
      <header>
        <Download size={15} />
        <strong>Downloads</strong>
        {active > 0 && <span className="downloads-badge">{active} active</span>}
        <button
          type="button"
          className="downloads-clear"
          title="Clear finished"
          onClick={() => void window.lastbrowser.downloads.clear().then(setEntries)}
        >
          <Trash2 size={13} />
        </button>
        <button type="button" aria-label="Close downloads" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="downloads-list">
        {entries.length === 0 && <p className="downloads-empty">No downloads yet.</p>}
        {entries.map((entry) => (
          <DownloadItemRow
            key={entry.id}
            entry={entry}
            onClear={(id) => void window.lastbrowser.downloads.clear(id).then(setEntries)}
          />
        ))}
      </div>
    </div>
  );
}

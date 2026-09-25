/**
 * Downloads panel and floating dock window for Lastbrowser.
 *
 * Supports:
 *  - Dropdown popover (anchored under the toolbar trigger)
 *  - Pop-out to draggable, floating overlay window
 *  - Docking to 3 zones: Below tabs, in top bar (left/right), or next to Sidekick
 *  - Minimizable to floating pill badge with active download count
 */
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  GripHorizontal,
  Loader2,
  Minimize2,
  Minus,
  Move,
  PanelLeft,
  RotateCcw,
  Rows3,
  Trash2,
  X,
  XCircle
} from 'lucide-react';

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

export type DownloadsDockMode =
  | 'dropdown'
  | 'floating'
  | 'dock-tabs'
  | 'dock-topbar-left'
  | 'dock-topbar-right'
  | 'dock-sidekick';

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
  const [dockMode, setDockMode] = useState<DownloadsDockMode>(() => {
    try {
      return (window.localStorage.getItem('lastbrowser.downloads.mode.v1') as DownloadsDockMode) || 'dropdown';
    } catch {
      return 'dropdown';
    }
  });

  const [minimized, setMinimized] = useState<boolean>(false);
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number }>(() => {
    try {
      const stored = window.localStorage.getItem('lastbrowser.downloads.pos.v1');
      if (stored) return JSON.parse(stored);
    } catch {}
    return { x: Math.max(20, window.innerWidth - 460), y: 70 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  const handleSetDockMode = (mode: DownloadsDockMode) => {
    setDockMode(mode);
    setMinimized(false);
    try {
      window.localStorage.setItem('lastbrowser.downloads.mode.v1', mode);
    } catch {}
  };

  // Dragging support for floating mode
  const handleDragStart = (e: React.MouseEvent) => {
    if (dockMode !== 'floating' && !minimized) return;
    setIsDragging(true);
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const maxX = Math.max(0, window.innerWidth - (panelRef.current?.offsetWidth || 300));
      const maxY = Math.max(0, window.innerHeight - (panelRef.current?.offsetHeight || 100));
      const nextX = Math.min(maxX, Math.max(0, e.clientX - dragOffsetRef.current.x));
      const nextY = Math.min(maxY, Math.max(0, e.clientY - dragOffsetRef.current.y));

      const newPos = { x: Math.round(nextX), y: Math.round(nextY) };
      setFloatingPos(newPos);
      try {
        window.localStorage.setItem('lastbrowser.downloads.pos.v1', JSON.stringify(newPos));
      } catch {}
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!open) return null;

  const active = entries.filter((entry) => entry.state === 'progressing').length;
  const completed = entries.filter((entry) => entry.state === 'completed').length;

  // Render Minimized Pill
  if (minimized) {
    return (
      <div
        ref={panelRef}
        className="downloads-minimized-pill"
        style={{ left: `${floatingPos.x}px`, top: `${floatingPos.y}px` }}
        onMouseDown={handleDragStart}
        onClick={() => setMinimized(false)}
        title="Klicken zum Wiederherstellen • Ziehen zum Verschieben"
      >
        <Download size={14} className={active > 0 ? 'spin' : ''} />
        <span className="pill-text">
          Downloads {active > 0 ? `(${active} aktiv)` : `(${completed})`}
        </span>
        <button
          type="button"
          className="pill-close-btn"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Schließen"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // Position styles according to dock mode
  const getContainerStyle = (): React.CSSProperties => {
    switch (dockMode) {
      case 'floating':
        return {
          position: 'fixed',
          left: `${floatingPos.x}px`,
          top: `${floatingPos.y}px`,
          zIndex: 10002
        };
      case 'dock-tabs':
        return {
          position: 'fixed',
          top: '78px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10001
        };
      case 'dock-topbar-left':
        return {
          position: 'fixed',
          top: '48px',
          left: '120px',
          zIndex: 10001
        };
      case 'dock-topbar-right':
        return {
          position: 'fixed',
          top: '48px',
          right: '260px',
          zIndex: 10001
        };
      case 'dock-sidekick':
        return {
          position: 'fixed',
          top: '110px',
          left: '60px',
          zIndex: 10001
        };
      case 'dropdown':
      default:
        return {
          position: 'absolute',
          top: '52px',
          right: '16px',
          zIndex: 10001
        };
    }
  };

  return (
    <div
      ref={panelRef}
      className={`downloads-panel mode-${dockMode} ${isDragging ? 'is-dragging' : ''}`}
      style={getContainerStyle()}
      role="dialog"
      aria-label="Downloads"
    >
      <header onMouseDown={dockMode === 'floating' ? handleDragStart : undefined}>
        {dockMode === 'floating' && (
          <div className="downloads-drag-grip" title="Verschieben">
            <GripHorizontal size={14} />
          </div>
        )}

        <Download size={15} />
        <strong>Downloads</strong>
        {active > 0 && <span className="downloads-badge">{active} active</span>}

        {/* Dock Zone Quick Selector Buttons */}
        <div className="downloads-dock-controls">
          {dockMode === 'dropdown' ? (
            <button
              type="button"
              className="downloads-tool-btn"
              title="In frei verschiebbares Fenster ausdocken"
              onClick={() => handleSetDockMode('floating')}
            >
              <ExternalLink size={13} />
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`downloads-tool-btn ${dockMode === 'dock-tabs' ? 'active' : ''}`}
                title="Unter Tab-Leiste docken"
                onClick={() => handleSetDockMode('dock-tabs')}
              >
                <Rows3 size={13} />
              </button>
              <button
                type="button"
                className={`downloads-tool-btn ${dockMode === 'dock-sidekick' ? 'active' : ''}`}
                title="Neben Sidekick docken"
                onClick={() => handleSetDockMode('dock-sidekick')}
              >
                <PanelLeft size={13} />
              </button>
              <button
                type="button"
                className={`downloads-tool-btn ${dockMode === 'floating' ? 'active' : ''}`}
                title="Frei schwebend (Floating)"
                onClick={() => handleSetDockMode('floating')}
              >
                <Move size={13} />
              </button>
              <button
                type="button"
                className="downloads-tool-btn"
                title="Wieder als Menüleisten-Dropdown andocken"
                onClick={() => handleSetDockMode('dropdown')}
              >
                <Minimize2 size={13} />
              </button>
            </>
          )}

          {dockMode === 'floating' && (
            <button
              type="button"
              className="downloads-tool-btn"
              title="Minimieren"
              onClick={() => setMinimized(true)}
            >
              <Minus size={13} />
            </button>
          )}

          <button
            type="button"
            className="downloads-clear"
            title="Abgeschlossene leeren"
            onClick={() => void window.lastbrowser.downloads.clear().then(setEntries)}
          >
            <Trash2 size={13} />
          </button>

          <button type="button" aria-label="Schließen" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="downloads-list">
        {entries.length === 0 && <p className="downloads-empty">Keine Downloads vorhanden.</p>}
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

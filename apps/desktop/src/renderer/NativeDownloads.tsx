/**
 * Downloads panel and floating dock window for Lastbrowser.
 *
 * Supports:
 *  - Dropdown popover (anchored under the toolbar trigger)
 *  - Pop-out to draggable, floating overlay window
 *  - Docking to 3 zones: Below tabs, in top bar (left/right), or next to Sidekick
 *  - Minimizable to floating pill badge with active download count
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  GripHorizontal,
  Loader2,
  Minimize2,
  Minus,
  Move,
  MoveLeft,
  MoveRight,
  PanelLeft,
  RotateCcw,
  Rows3,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import { canApplyDownloadSnapshot } from './download-snapshot.js';
import { useDesktopI18n } from './i18n.js';

export type DownloadEntry = {
  id: string;
  filename: string;
  url: string;
  received: number;
  total: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  active: boolean;
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

const DOWNLOAD_DOCK_MODES: DownloadsDockMode[] = [
  'dropdown', 'floating', 'dock-tabs', 'dock-topbar-left', 'dock-topbar-right', 'dock-sidekick'
];

export function resolveDownloadsDockMode(value: string | null): DownloadsDockMode {
  return DOWNLOAD_DOCK_MODES.includes(value as DownloadsDockMode) ? value as DownloadsDockMode : 'dropdown';
}

/** A closed downloads surface always reopens expanded. */
export function resolveDownloadsMinimizedState(open: boolean, minimized: boolean): boolean {
  return open && minimized;
}

export function shouldRestoreDownloadsFromPillClick(didDrag: boolean): boolean {
  return !didDrag;
}

export function shouldStartDownloadsHeaderDrag(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (!element || typeof element.closest !== 'function') return true;
  return !element.closest('button, .downloads-dock-controls');
}

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
  onClear,
  onCancel
}: {
  entry: DownloadEntry;
  onClear: (id: string) => void;
  onCancel: (id: string) => void;
}): React.JSX.Element {
  const { t } = useDesktopI18n();
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
          {done && t('downloads.savedTo', { path: entry.savePath })}
          {entry.state === 'cancelled' && t('downloads.cancelled')}
          {entry.state === 'interrupted' && t('downloads.interrupted')}
        </small>
        {entry.state === 'progressing' && (
          <span className="download-progress">
            <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label={entry.active ? t('downloads.cancel') : t('downloads.remove')}
        title={entry.active ? t('downloads.cancel') : t('downloads.remove')}
        onClick={() => entry.active ? onCancel(entry.id) : onClear(entry.id)}
      >
        {entry.active ? <XCircle size={13} /> : <X size={13} />}
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
}): React.JSX.Element | null {
  const { t } = useDesktopI18n();
  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  const [dockMode, setDockMode] = useState<DownloadsDockMode>(() => {
    try {
      return resolveDownloadsDockMode(window.localStorage.getItem('lastbrowser.downloads.mode.v1'));
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
  const dragPointerStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const didDragRef = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Ignore an initial IPC snapshot if a newer push update arrived while the
  // request was in flight. Otherwise a slow list response can roll the panel
  // back to an older download state after onChanged already rendered progress.
  const downloadRevisionRef = useRef(0);

  useEffect(() => {
    setMinimized((current) => resolveDownloadsMinimizedState(open, current));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unsubscribe = window.lastbrowser.downloads.onChanged((next) => {
      downloadRevisionRef.current += 1;
      setEntries(Array.isArray(next) ? (next as DownloadEntry[]) : []);
    });
    const requestedRevision = downloadRevisionRef.current;
    let mounted = true;
    void window.lastbrowser.downloads.list().then((list) => {
      if (mounted && canApplyDownloadSnapshot(requestedRevision, downloadRevisionRef.current)) {
        setEntries(Array.isArray(list) ? (list as DownloadEntry[]) : []);
      }
    }).catch(() => {
      // The bridge may not be ready yet; the push channel will catch up.
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [open]);

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
    didDragRef.current = false;
    dragPointerStartRef.current = { x: e.clientX, y: e.clientY };
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
      if (
        Math.abs(e.clientX - dragPointerStartRef.current.x) >= 4 ||
        Math.abs(e.clientY - dragPointerStartRef.current.y) >= 4
      ) {
        didDragRef.current = true;
      }
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

  const active = entries.filter((entry) => entry.active).length;
  const completed = entries.filter((entry) => entry.state === 'completed').length;

  // Render Minimized Pill
  if (resolveDownloadsMinimizedState(open, minimized)) {
    return (
      <div
        ref={panelRef}
        className="downloads-minimized-pill"
        style={{ left: `${floatingPos.x}px`, top: `${floatingPos.y}px` }}
        onMouseDown={handleDragStart}
        onClick={() => {
          if (!shouldRestoreDownloadsFromPillClick(didDragRef.current)) {
            didDragRef.current = false;
            return;
          }
          setMinimized(false);
        }}
        title={t('downloads.restoreHint')}
      >
        <Download size={14} className={active > 0 ? 'spin' : ''} />
        <span className="pill-text">
          {active > 0 ? t('downloads.pillActive', { count: active }) : t('downloads.pillCompleted', { count: completed })}
        </span>
        <button
          type="button"
          className="pill-close-btn"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title={t('downloads.close')}
          aria-label={t('downloads.close')}
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
      data-dock-mode={dockMode}
      style={getContainerStyle()}
      role="dialog"
      aria-label={t('downloads.title')}
    >
      <header onMouseDown={dockMode === 'floating' ? (event) => {
        if (shouldStartDownloadsHeaderDrag(event.target)) handleDragStart(event);
      } : undefined}>
        {dockMode === 'floating' && (
          <div className="downloads-drag-grip" title={t('downloads.drag')}>
            <GripHorizontal size={14} />
          </div>
        )}

        <Download size={15} />
        <strong>{t('downloads.title')}</strong>
        {active > 0 && <span className="downloads-badge">{t('downloads.active', { count: active })}</span>}

        {/* Dock Zone Quick Selector Buttons */}
        <div className="downloads-dock-controls">
          {dockMode === 'dropdown' ? (
            <button
              type="button"
              className="downloads-tool-btn"
              data-dock-mode="floating"
              aria-label={t('downloads.undock')}
              title={t('downloads.undock')}
              onClick={() => handleSetDockMode('floating')}
            >
              <ExternalLink size={13} />
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`downloads-tool-btn ${dockMode === 'dock-tabs' ? 'active' : ''}`}
                data-dock-mode="dock-tabs"
                aria-label={t('downloads.dockTabs')}
                title={t('downloads.dockTabs')}
                onClick={() => handleSetDockMode('dock-tabs')}
              >
                <Rows3 size={13} />
              </button>
              <button
                type="button"
                className={`downloads-tool-btn ${dockMode === 'dock-sidekick' ? 'active' : ''}`}
                data-dock-mode="dock-sidekick"
                aria-label={t('downloads.dockSidekick')}
                title={t('downloads.dockSidekick')}
                onClick={() => handleSetDockMode('dock-sidekick')}
              >
                <PanelLeft size={13} />
              </button>
              <button
                type="button"
                className={`downloads-tool-btn ${dockMode === 'dock-topbar-left' ? 'active' : ''}`}
                data-dock-mode="dock-topbar-left"
                aria-label={t('downloads.dockTopLeft')}
                title={t('downloads.dockTopLeft')}
                onClick={() => handleSetDockMode('dock-topbar-left')}
              >
                <MoveLeft size={13} />
              </button>
              <button
                type="button"
                className={`downloads-tool-btn ${dockMode === 'dock-topbar-right' ? 'active' : ''}`}
                data-dock-mode="dock-topbar-right"
                aria-label={t('downloads.dockTopRight')}
                title={t('downloads.dockTopRight')}
                onClick={() => handleSetDockMode('dock-topbar-right')}
              >
                <MoveRight size={13} />
              </button>
              <button
                type="button"
                className={`downloads-tool-btn ${dockMode === 'floating' ? 'active' : ''}`}
                data-dock-mode="floating"
                aria-label={t('downloads.float')}
                title={t('downloads.float')}
                onClick={() => handleSetDockMode('floating')}
              >
                <Move size={13} />
              </button>
              <button
                type="button"
                className="downloads-tool-btn"
                data-dock-mode="dropdown"
                aria-label={t('downloads.dockDropdown')}
                title={t('downloads.dockDropdown')}
                onClick={() => handleSetDockMode('dropdown')}
              >
                <Minimize2 size={13} />
              </button>
            </>
          )}

          {dockMode !== 'dropdown' && (
            <button
              type="button"
              className="downloads-tool-btn"
              data-download-action="minimize"
              aria-label={t('downloads.minimize')}
              title={t('downloads.minimize')}
              onClick={() => setMinimized(true)}
            >
              <Minus size={13} />
            </button>
          )}

          <button
            type="button"
            aria-label={t('downloads.clearCompleted')}
            className="downloads-clear"
            title={t('downloads.clearCompleted')}
            onClick={() => void window.lastbrowser.downloads.clear().then(setEntries)}
          >
            <Trash2 size={13} />
          </button>

          <button type="button" data-download-action="close" aria-label={t('downloads.close')} title={t('downloads.close')} onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="downloads-list">
        {entries.length === 0 && <p className="downloads-empty">{t('downloads.empty')}</p>}
        {entries.map((entry) => (
          <DownloadItemRow
            key={entry.id}
            entry={entry}
            onCancel={(id) => void window.lastbrowser.downloads.cancel(id)}
            onClear={(id) => void window.lastbrowser.downloads.clear(id).then(setEntries)}
          />
        ))}
      </div>
    </div>
  );
}

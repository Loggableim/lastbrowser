/**
 * Downloads panel and floating dock window for Lastbrowser.
 *
 * Supports:
 *  - Dropdown popover (anchored under the toolbar trigger)
 *  - Pop-out to draggable, floating overlay window
 *  - Actual toolbar icon or bottom sidebar entry, with anchored expansion
 *  - Pointer snap preview, floating resize, and persistent reachable bounds
 */
import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle2, Download, ExternalLink, GripHorizontal, Loader2, Move, PanelLeft, Rows3, Trash2, X, XCircle } from 'lucide-react';
import { canApplyDownloadSnapshot } from './download-snapshot.js';
import { useDesktopI18n } from './i18n.js';
import { anchoredDownloadBounds, clampDownloadBounds, downloadDockTarget, downloadDockZoneBounds, getDownloadAnchors, getDownloadDockState, setDownloadDockState, useDownloadDockState, type DockState, type DownloadDock } from './downloads-docking.js';
import './downloads-docking.css';

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
    <div className={`download-row ${entry.state}`} data-download-id={entry.id}>
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


export function DownloadDockTrigger({ anchor, open, onOpen, className = '', children, label }: {
  anchor: 'top' | 'sidebar'; open: boolean; onOpen: () => void; className?: string; children?: React.ReactNode; label?: string;
}): React.JSX.Element {
  const { t } = useDesktopI18n();
  const state = useDownloadDockState();
  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  useEffect(() => {
    let current = true, revision = 0;
    const unsubscribe = window.lastbrowser.downloads.onChanged((next) => { revision++; setEntries(next); });
    const requested = revision;
    void window.lastbrowser.downloads.list().then((next) => { if (current && revision === requested) setEntries(next); }).catch(() => undefined);
    return () => { current = false; unsubscribe(); };
  }, []);
  const active = entries.filter((entry) => entry.active);
  const total = active.reduce((sum, entry) => sum + entry.total, 0);
  const received = active.reduce((sum, entry) => sum + entry.received, 0);
  const progress = total > 0 && active.every((entry) => entry.total > 0) ? Math.min(100, Math.round(received / total * 100)) : null;
  const visible = anchor === 'top' ? state.mode !== 'sidebar' : state.mode === 'sidebar';
  return <span data-download-dock-anchor={anchor} className={`download-dock-anchor anchor-${anchor} ${visible ? '' : 'anchor-inactive'}`}>
    <button type="button" className={className} aria-label={label ?? t('downloads.title')} title={`${label ?? t('downloads.title')} (Ctrl+J)`}
      aria-expanded={open && state.mode === anchor} aria-controls="native-downloads-panel" aria-haspopup="dialog"
      tabIndex={visible ? undefined : -1} aria-hidden={!visible || undefined}
      onClick={() => { setDownloadDockState({ ...getDownloadDockState(), mode: anchor }); onOpen(); }}>
      <Download size={16} />{children ?? (anchor === 'sidebar' && <span>{t('downloads.title')}</span>)}
      {active.length > 0 && <span className="download-trigger-count" title={progress === null ? t('downloads.active', { count: active.length }) : `${progress}%`} style={progress === null ? undefined : { background: `linear-gradient(to right, var(--accent, #00cbe8) ${progress}%, transparent ${progress}%)` }}>{active.length}</span>}
    </button>
  </span>;
}

export function DownloadsPanel({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const { t } = useDesktopI18n();
  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  const state = useDownloadDockState();
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [preview, setPreview] = useState<'top' | 'sidebar' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<{ original: DockState; startX: number; startY: number; bounds: DockState['bounds']; resize: boolean; moved: boolean } | null>(null);
  const downloadRevisionRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !gestureRef.current) onClose(); };
    const outside = (event: PointerEvent) => {
      const element = event.target as Element | null;
      if (getDownloadDockState().mode !== 'floating' && !gestureRef.current && !element?.closest('.downloads-panel, [data-download-dock-anchor]')) onClose();
    };
    window.addEventListener('keydown', key); window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', outside); };
  }, [open, onClose]);
  useEffect(() => {
    if (!open) return;
    const unsubscribe = window.lastbrowser.downloads.onChanged((next) => {
      downloadRevisionRef.current += 1;
      setEntries(Array.isArray(next) ? next as DownloadEntry[] : []);
    });
    const requestedRevision = downloadRevisionRef.current;
    let mounted = true;
    void window.lastbrowser.downloads.list().then((list) => {
      if (mounted && canApplyDownloadSnapshot(requestedRevision, downloadRevisionRef.current)) setEntries(Array.isArray(list) ? list as DownloadEntry[] : []);
    }).catch(() => {});
    return () => { mounted = false; unsubscribe(); };
  }, [open]);
  useEffect(() => {
    const update = () => {
      const current = getDownloadDockState();
      setDownloadDockState({ ...current, bounds: clampDownloadBounds(current.bounds, window.innerWidth, window.innerHeight) });
      setLayoutRevision((revision) => revision + 1);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = new ResizeObserver(update);
    document.querySelectorAll('[data-download-dock-anchor]').forEach((element) => observer.observe(element));
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!open) {
      if (gestureRef.current) setDownloadDockState(gestureRef.current.original);
      gestureRef.current = null; setIsDragging(false); setPreview(null);
    }
  }, [open]);
  useEffect(() => {
    if (!isDragging) return;
    const finish = (cancel: boolean, event?: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      if (cancel || !gesture.moved) setDownloadDockState(gesture.original);
      else {
        const current = getDownloadDockState();
        const target = !gesture.resize && event ? downloadDockTarget(event.clientX, event.clientY, getDownloadAnchors({ includeInactive: true })) : null;
        setDownloadDockState({ ...current, mode: target ?? 'floating' });
      }
      gestureRef.current = null; setIsDragging(false); setPreview(null);
    };
    const move = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4 && !gesture.moved) return;
      gesture.moved = true;
      const bounds = gesture.resize
        ? { ...gesture.bounds, width: gesture.bounds.width + dx, height: gesture.bounds.height + dy }
        : { ...gesture.bounds, x: gesture.bounds.x + dx, y: gesture.bounds.y + dy };
      setDownloadDockState({ mode: 'floating', bounds: clampDownloadBounds(bounds, window.innerWidth, window.innerHeight) }, false);
      setPreview(gesture.resize ? null : downloadDockTarget(event.clientX, event.clientY, getDownloadAnchors({ includeInactive: true })));
    };
    const up = (event: PointerEvent) => finish(false, event);
    const cancel = () => finish(true);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(true); } };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key, true); };
  }, [isDragging]);
  if (!open) return null;
  const anchors = getDownloadAnchors({ includeInactive: true });
  const showingDockTargets = isDragging && Boolean(gestureRef.current?.moved && !gestureRef.current.resize);
  const dockTargetZones = showingDockTargets ? anchors : {};
  const anchor = state.mode !== 'floating' ? anchors[state.mode] : undefined;
  const bounds = anchor && state.mode !== 'floating' ? anchoredDownloadBounds(state.mode, anchor, state.bounds, window.innerWidth, window.innerHeight) : state.bounds;
  const previewRect = preview ? anchors[preview] : undefined;
  const previewBounds = preview && previewRect ? anchoredDownloadBounds(preview, previewRect, state.bounds, window.innerWidth, window.innerHeight) : null;
  const setMode = (mode: DownloadDock) => {
    setDownloadDockState({ mode, bounds: mode === 'floating' ? bounds : state.bounds });
  };
  const begin = (event: React.PointerEvent, resize = false) => {
    if (event.button !== 0 || (!resize && !shouldStartDownloadsHeaderDrag(event.target))) return;
    event.preventDefault();
    gestureRef.current = { original: state, startX: event.clientX, startY: event.clientY, bounds, resize, moved: false };
    setIsDragging(true);
  };
  const active = entries.filter((entry) => entry.active).length;
  return <>
    {Object.entries(dockTargetZones).map(([mode, rect]) => {
      if (!rect) return null;
      const zone = downloadDockZoneBounds(rect, window.innerWidth, window.innerHeight);
      return <div key={mode} className={`downloads-dock-target-zone target-${mode}`} data-download-dock-target-zone={mode} aria-hidden="true"
        style={{ left: zone.x, top: zone.y, width: zone.width, height: zone.height }}>
        {mode === 'top' ? t('downloads.dockDropdown') : t('downloads.dockSidekick')}
      </div>;
    })}
    {previewBounds && <div className="downloads-dock-preview" data-download-dock-preview={preview} aria-hidden="true" style={{ left: previewBounds.x, top: previewBounds.y, width: previewBounds.width, height: previewBounds.height }} />}
    <div ref={panelRef} id="native-downloads-panel" role="dialog" aria-label={t('downloads.title')}
      className={`downloads-panel downloads-docking mode-${state.mode} ${isDragging ? 'is-dragging' : ''}`}
      data-dock-mode={state.mode} data-layout-revision={layoutRevision}
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}>
      <header data-download-arrival-target="true" onPointerDown={(event) => begin(event)}>
        <GripHorizontal size={14} className="downloads-drag-grip" aria-label={t('downloads.drag')} />
        <Download size={15} /><strong>{t('downloads.title')}</strong>
        {active > 0 && <span className="downloads-badge">{t('downloads.active', { count: active })}</span>}
        <div className="downloads-dock-controls">
          <button type="button" data-dock-mode="top" aria-pressed={state.mode === 'top'} aria-label={t('downloads.dockDropdown')} title={t('downloads.dockDropdown')} onClick={() => setMode('top')} disabled={!anchors.top}><Rows3 size={13} /></button>
          <button type="button" data-dock-mode="sidebar" aria-pressed={state.mode === 'sidebar'} aria-label={t('downloads.dockSidekick')} title={t('downloads.dockSidekick')} onClick={() => setMode('sidebar')} disabled={!anchors.sidebar}><PanelLeft size={13} /></button>
          <button type="button" data-dock-mode="floating" aria-pressed={state.mode === 'floating'} aria-label={t('downloads.float')} title={t('downloads.float')} onClick={() => setMode('floating')}><ExternalLink size={13} /></button>
          <button type="button" aria-label={t('downloads.clearCompleted')} title={t('downloads.clearCompleted')} onClick={() => void window.lastbrowser.downloads.clear().then(setEntries)}><Trash2 size={13} /></button>
          <button type="button" data-download-action="close" aria-label={t('downloads.close')} title={t('downloads.close')} onClick={onClose}><X size={14} /></button>
        </div>
      </header>
      <div className="downloads-list">{entries.length === 0 && <p className="downloads-empty">{t('downloads.empty')}</p>}
        {entries.map((entry) => <DownloadItemRow key={entry.id} entry={entry} onCancel={(id) => void window.lastbrowser.downloads.cancel(id)} onClear={(id) => void window.lastbrowser.downloads.clear(id).then(setEntries)} />)}
      </div>
      {state.mode === 'floating' && <button type="button" className="downloads-resize-handle" aria-label={t('snap.resizePane')} title={t('snap.resizePane')} onPointerDown={(event) => begin(event, true)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          const step = event.shiftKey ? 40 : 10;
          setDownloadDockState({ ...state, bounds: clampDownloadBounds({ ...state.bounds, width: state.bounds.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), height: state.bounds.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }, window.innerWidth, window.innerHeight) });
        }}><Move size={12} /></button>}
    </div>
  </>;
}

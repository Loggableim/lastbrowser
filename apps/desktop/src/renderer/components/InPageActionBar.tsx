import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Download,
  Globe2,
  GripVertical,
  Layout,
  MessageSquare,
  Search,
  Sparkles,
  Volume2,
  VolumeX
} from 'lucide-react';
import type { SidekickActionId } from '../bridge.js';
import type { ActionBarDock } from '../stores/usePanelStore.js';

export interface InPageActionBarProps {
  busy?: boolean;
  onAction: (actionId: SidekickActionId) => void;
  zoomFactor: number;
  onResetZoom: () => void;
  onFindOpen: () => void;
  downloadsOpen: boolean;
  hasActiveDownloads?: boolean;
  onToggleDownloads: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  muted?: boolean;
  onToggleMute: () => void;
  dockMode?: ActionBarDock;
  onSetDockMode?: (dock: ActionBarDock) => void;
}

const DOCK_LABELS: Record<ActionBarDock, string> = {
  'top-left': 'Oben Links (Standard)',
  'top-center': 'Oben Zentriert',
  'top-right': 'Oben Rechts',
  'bottom-center': 'Unten Zentriert',
  'free': 'Frei schwebend'
};

export function InPageActionBar({
  busy = false,
  onAction,
  zoomFactor,
  onResetZoom,
  onFindOpen,
  downloadsOpen,
  hasActiveDownloads = false,
  onToggleDownloads,
  historyOpen,
  onToggleHistory,
  muted = false,
  onToggleMute,
  dockMode = 'top-left',
  onSetDockMode
}: InPageActionBarProps): React.JSX.Element {
  const [internalDock, setInternalDock] = useState<ActionBarDock>(() => {
    try {
      const saved = window.localStorage.getItem('lastbrowser.actionBarDock.v1') as ActionBarDock;
      if (saved && ['top-left', 'top-center', 'top-right', 'bottom-center', 'free'].includes(saved)) {
        return saved;
      }
    } catch {}
    return dockMode;
  });

  const activeDock = onSetDockMode ? dockMode : internalDock;

  const [coords, setCoords] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = window.localStorage.getItem('lastbrowser.actionBarCoords.v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch {}
    return { x: 14, y: 14 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function handleSelectDock(d: ActionBarDock) {
    if (onSetDockMode) {
      onSetDockMode(d);
    } else {
      setInternalDock(d);
    }
    try {
      window.localStorage.setItem('lastbrowser.actionBarDock.v1', d);
    } catch {}
    setMenuOpen(false);
  }

  // Handle Dragging
  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return; // Only main button
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: coords.x,
      initY: coords.y
    };

    if (activeDock !== 'free') {
      // Calculate current offset relative to parent container
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const parentRect = containerRef.current.parentElement?.getBoundingClientRect() || { left: 0, top: 0 };
        const curX = rect.left - parentRect.left;
        const curY = rect.top - parentRect.top;
        setCoords({ x: Math.max(8, curX), y: Math.max(8, curY) });
      }
      handleSelectDock('free');
    }
  }

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const nextX = Math.max(8, dragStartRef.current.initX + dx);
      const nextY = Math.max(8, dragStartRef.current.initY + dy);
      setCoords({ x: nextX, y: nextY });
    }

    function handleMouseUp() {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        window.localStorage.setItem('lastbrowser.actionBarCoords.v1', JSON.stringify(coords));
      } catch {}
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, coords]);

  // Click outside menu closer
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const isFree = activeDock === 'free';
  const styleObj: React.CSSProperties = isFree
    ? { left: `${coords.x}px`, top: `${coords.y}px`, position: 'absolute' }
    : {};

  return (
    <div
      ref={containerRef}
      className={`browser-action-strip dock-${activeDock} ${isDragging ? 'is-dragging' : ''}`}
      style={styleObj}
      aria-label="Nova In-Page AI Actions"
    >
      {/* Drag Grip Handle */}
      <div
        className="action-strip-drag-handle"
        title="Gedrückt halten & frei verschieben"
        onMouseDown={handleMouseDown}
      >
        <GripVertical size={13} />
      </div>

      {/* AI Action Buttons */}
      <button
        type="button"
        className="action-strip-btn ai-action"
        onClick={() => void onAction('summarize-page')}
        disabled={busy}
        title="Seite zusammenfassen (Nova AI)"
      >
        <Sparkles size={14} />
        <span>Summarize</span>
      </button>

      <button
        type="button"
        className="action-strip-btn ai-action"
        onClick={() => void onAction('explain-selection')}
        disabled={busy}
        title="Markierten Text oder Seite erklären"
      >
        <MessageSquare size={14} />
        <span>Explain</span>
      </button>

      <button
        type="button"
        className="action-strip-btn ai-action"
        onClick={() => void onAction('research-page')}
        disabled={busy}
        title="Tiefenrecherche & Quellenabgleich"
      >
        <Globe2 size={14} />
        <span>Research</span>
      </button>

      <div className="action-strip-divider" />

      {/* Zoom indicator */}
      {Math.abs(zoomFactor - 1) > 0.001 && (
        <button
          type="button"
          className="zoom-indicator"
          title="Zoom auf 100% zurücksetzen (Ctrl+0)"
          onClick={onResetZoom}
        >
          {Math.round(zoomFactor * 100)}%
        </button>
      )}

      {/* Find in page */}
      <button
        type="button"
        className="find-trigger"
        title="Auf Seite suchen (Ctrl+F)"
        onClick={onFindOpen}
      >
        <Search size={14} />
      </button>

      {/* Downloads */}
      <button
        type="button"
        className={`downloads-trigger ${downloadsOpen ? 'active' : ''}`}
        title="Downloads (Ctrl+J)"
        onClick={onToggleDownloads}
      >
        <Download size={14} />
        {hasActiveDownloads && <span className="downloads-active-dot" />}
      </button>

      {/* History */}
      <button
        type="button"
        className={`history-trigger ${historyOpen ? 'active' : ''}`}
        title="Verlauf / Chronik"
        onClick={onToggleHistory}
      >
        <Clock size={14} />
      </button>

      {/* Mute */}
      <button
        type="button"
        className={`mute-trigger ${muted ? 'active' : ''}`}
        title={muted ? 'Tab entstummen (Ctrl+M)' : 'Tab stummschalten (Ctrl+M)'}
        onClick={onToggleMute}
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>

      {/* Dock Position Switcher Menu */}
      <div className="action-strip-dock-anchor" ref={menuRef}>
        <button
          type="button"
          className={`dock-menu-trigger-btn ${menuOpen ? 'open' : ''}`}
          title={`Andock-Position ändern (${DOCK_LABELS[activeDock]})`}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <Layout size={13} />
        </button>

        {menuOpen && (
          <div className="action-strip-dock-dropdown" role="menu">
            <div className="dock-dropdown-header">Andocken an Menüs:</div>
            {(['top-left', 'top-center', 'top-right', 'bottom-center', 'free'] as ActionBarDock[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`dock-dropdown-item ${activeDock === mode ? 'selected' : ''}`}
                onClick={() => handleSelectDock(mode)}
              >
                <span>{DOCK_LABELS[mode]}</span>
                {activeDock === mode && <span className="dock-check-badge">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

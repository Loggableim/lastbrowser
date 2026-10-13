import React, { useState, useEffect, useRef, useId } from 'react';
import {
  Clock,
  Download,
  Globe2,
  GripVertical,
  Layout,
  MessageSquare,
  MoreHorizontal,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { SidekickActionId } from '../bridge.js';
import type { ActionBarDock } from '../stores/usePanelStore.js';
import { useDesktopI18n } from '../i18n.js';

export interface InPageActionBarProps {
  /**
   * 'in-page': Floating or docked strip inside the webview container.
   * 'topbar': Compact icon in ModernTitlebar that unfolds over the address bar on hover/click.
   */
  variant?: 'in-page' | 'topbar';
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
  /** Existing browser tools moved from the page corner into the Sparkles flyout. */
  overlayTools?: React.ReactNode;
  dockMode?: ActionBarDock;
  onSetDockMode?: (dock: ActionBarDock) => void;
}

export const DOCK_LABELS: Record<ActionBarDock, string> = {
  'topbar': 'Topleiste (Icon mit Ausklapp-Leiste)',
  'sidebar': 'Seitenmenü (Links)',
  'bottom': 'Unten (Zentriert)',
  'bottom-center': 'Unten Zentriert',
  'top-left': 'Oben Links',
  'top-center': 'Oben Zentriert',
  'top-right': 'Oben Rechts',
  'free': 'Frei verschiebbar'
};

const DOCK_SELECTION_OPTIONS: ActionBarDock[] = [
  'topbar',
  'sidebar',
  'bottom',
  'top-left',
  'top-right',
  'free'
];

function sanitizeCoords(raw: { x: number; y: number } | null | undefined): { x: number; y: number } {
  if (!raw || typeof raw.x !== 'number' || typeof raw.y !== 'number' || isNaN(raw.x) || isNaN(raw.y)) {
    return { x: 14, y: 14 };
  }
  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const clampedX = Math.min(Math.max(8, raw.x), Math.max(8, maxW - 240));
  const clampedY = Math.min(Math.max(8, raw.y), Math.max(8, maxH - 60));
  return { x: clampedX, y: clampedY };
}

export function InPageActionBar({
  variant = 'in-page',
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
  overlayTools,
  dockMode = 'topbar',
  onSetDockMode
}: InPageActionBarProps): React.JSX.Element | null {
  const { t } = useDesktopI18n();
  const flyoutId = useId();
  const [internalDock, setInternalDock] = useState<ActionBarDock>(() => {
    try {
      const saved = window.localStorage.getItem('lastbrowser.actionBarDock.v1') as ActionBarDock;
      if (
        saved &&
        ['topbar', 'sidebar', 'bottom', 'bottom-center', 'top-left', 'top-center', 'top-right', 'free'].includes(saved)
      ) {
        return saved;
      }
    } catch {}
    return dockMode;
  });

  const activeDock = onSetDockMode ? dockMode : internalDock;
  const normalizedDock: ActionBarDock = activeDock === 'bottom-center' ? 'bottom' : activeDock;

  const [coords, setCoords] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = window.localStorage.getItem('lastbrowser.actionBarCoords.v1');
      if (saved) {
        return sanitizeCoords(JSON.parse(saved));
      }
    } catch {}
    return { x: 14, y: 14 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
  const pendingCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const sparklesTriggerRef = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Handle Dragging in free mode
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
      if (containerRef.current && containerRef.current.parentElement) {
        const rect = containerRef.current.getBoundingClientRect();
        const parentRect = containerRef.current.parentElement.getBoundingClientRect();
        const curX = rect.left - parentRect.left;
        const curY = rect.top - parentRect.top;
        const parentWidth = containerRef.current.parentElement.clientWidth;
        const parentHeight = containerRef.current.parentElement.clientHeight;
        const stripWidth = containerRef.current.offsetWidth || 280;
        const stripHeight = containerRef.current.offsetHeight || 40;

        const maxX = Math.max(8, parentWidth - stripWidth - 8);
        const maxY = Math.max(8, parentHeight - stripHeight - 8);

        const safeX = Math.min(Math.max(8, curX), maxX);
        const safeY = Math.min(Math.max(8, curY), maxY);
        setCoords({ x: safeX, y: safeY });
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
      const parentWidth = containerRef.current?.parentElement?.clientWidth || window.innerWidth;
      const parentHeight = containerRef.current?.parentElement?.clientHeight || window.innerHeight;
      const stripWidth = containerRef.current?.offsetWidth || 280;
      const stripHeight = containerRef.current?.offsetHeight || 40;

      const maxX = Math.max(8, parentWidth - stripWidth - 8);
      const maxY = Math.max(8, parentHeight - stripHeight - 8);

      const nextX = Math.min(Math.max(8, dragStartRef.current.initX + dx), maxX);
      const nextY = Math.min(Math.max(8, dragStartRef.current.initY + dy), maxY);
      pendingCoordsRef.current = { x: nextX, y: nextY };

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingCoordsRef.current) {
            setCoords(pendingCoordsRef.current);
          }
          rafRef.current = null;
        });
      }
    }

    function handleMouseUp() {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (pendingCoordsRef.current) {
        setCoords(pendingCoordsRef.current);
        try {
          window.localStorage.setItem('lastbrowser.actionBarCoords.v1', JSON.stringify(pendingCoordsRef.current));
        } catch {}
      }
      setIsDragging(false);
      dragStartRef.current = null;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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

  // Hover handlers for topbar flyout
  function handleMouseEnter() {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  }

  function handleMouseLeave() {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) setIsHovered(false);
    }, 280);
  }

  function closeFlyoutAndRestoreFocus(): void {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
    setIsPinned(false);
    setMenuOpen(false);
    sparklesTriggerRef.current?.focus();
  }

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Escape key closer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (menuOpen) {
          setMenuOpen(false);
        } else if (isHovered || isPinned) {
          closeFlyoutAndRestoreFocus();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen, isHovered, isPinned]);

  // ──────────────────────────────────────────────────────────────────────────
  // VARIANT: TOPBAR (Icon only, folds out over address bar on hover / click)
  // ──────────────────────────────────────────────────────────────────────────
  if (variant === 'topbar') {
    if (activeDock !== 'topbar') return null;
    const isFlyoutOpen = isHovered || isPinned || menuOpen;
    return (
      <div ref={containerRef} className="titlebar-research-dock research-toolbar-dock"
        onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
        onMouseDown={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !isPinned) {
            setIsHovered(false); setMenuOpen(false);
          }
        }}>
        <button type="button" ref={sparklesTriggerRef}
          className={`titlebar-tool-btn titlebar-research-trigger-btn ${isFlyoutOpen ? 'active' : ''}`}
          onClick={() => { setIsPinned(previous => !previous); setIsHovered(true); }}
          onKeyDown={event => {
            if (event.key !== 'ArrowDown') return;
            event.preventDefault(); setIsPinned(true);
            requestAnimationFrame(() => document.getElementById(flyoutId)?.querySelector<HTMLButtonElement>('button')?.focus());
          }}
          title="Nova Research · Hover / click · Esc" aria-label="Nova Research" aria-expanded={isFlyoutOpen} aria-controls={flyoutId}>
          <Sparkles size={14} className="research-sparkles-icon" />
        </button>
        <button type="button" className={`titlebar-tool-btn mute-trigger ${muted ? 'active' : ''}`} onClick={onToggleMute}
          title={muted ? 'Tab entstummen (Ctrl+M)' : 'Tab stummschalten (Ctrl+M)'} aria-label={muted ? 'Tab entstummen' : 'Tab stummschalten'} aria-pressed={muted}>
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        {isFlyoutOpen && <div id={flyoutId} className="titlebar-research-flyout research-toolbar" role="toolbar" aria-label="Nova Research">
          <div className="research-primary-actions">
            <button type="button" className="research-action" disabled={busy} onClick={() => void onAction('summarize-page')}
              title={t('browser.actions.summarize')} aria-label={t('browser.actions.summarize')}><Sparkles size={14} /><span>{t('browser.actions.summarize')}</span></button>
            <button type="button" className="research-action" disabled={busy} onClick={() => void onAction('explain-selection')}
              title={t('browser.actions.explain')} aria-label={t('browser.actions.explain')}><MessageSquare size={14} /><span>{t('browser.actions.explain')}</span></button>
            <button type="button" className="research-action" disabled={busy} onClick={() => void onAction('research-page')}
              title={t('browser.actions.research')} aria-label={t('browser.actions.research')}><Globe2 size={14} /><span>{t('browser.actions.research')}</span></button>
          </div>
          <div className="research-more-anchor" ref={menuRef}>
            <button type="button" className="research-action research-icon-action" title={t('chat.header.moreActions')}
              aria-label={t('chat.header.moreActions')} aria-expanded={menuOpen} aria-controls={`${flyoutId}-more`}
              onClick={() => setMenuOpen(previous => !previous)}><MoreHorizontal size={15} /></button>
            {menuOpen && <div id={`${flyoutId}-more`} className="research-more-popover" role="group" aria-label={t('chat.header.moreActions')}>
              {overlayTools && <div className="research-extra-tools" role="group" aria-label="Browser tools" onClick={closeFlyoutAndRestoreFocus}>{overlayTools}</div>}
              <div className="research-utility-actions">
                <button type="button" className="research-action" title={t('browser.chrome.findInPage')} onClick={onFindOpen}><Search size={14} /><span>{t('browser.chrome.findInPage')}</span></button>
                <button type="button" className={`research-action ${historyOpen ? 'active' : ''}`} title={t('sidebar.utilities.history.title')} aria-pressed={historyOpen} onClick={onToggleHistory}><Clock size={14} /><span>{t('sidebar.utilities.history.title')}</span></button>
                <button type="button" className={`research-action ${downloadsOpen ? 'active' : ''}`} title={t('sidebar.utilities.downloads.title')} aria-pressed={downloadsOpen} onClick={onToggleDownloads}><Download size={14} /><span>{t('sidebar.utilities.downloads.title')}{hasActiveDownloads ? ' •' : ''}</span></button>
                {Math.abs(zoomFactor - 1) > 0.001 && <button type="button" className="research-action" title="Zoom · Ctrl+0" onClick={onResetZoom}>{Math.round(zoomFactor * 100)}% → 100%</button>}
              </div>
              <details className="research-dock-options"><summary><Layout size={14} />{DOCK_LABELS[normalizedDock] || DOCK_LABELS[activeDock]}</summary>
                {DOCK_SELECTION_OPTIONS.map(mode => <button key={mode} type="button" className="research-action" aria-pressed={normalizedDock === mode} onClick={() => handleSelectDock(mode)}>
                  <span>{DOCK_LABELS[mode]}</span>{normalizedDock === mode && <span aria-hidden="true">✓</span>}
                </button>)}
              </details>
            </div>}
          </div>
          <button type="button" className="research-action research-icon-action" title={`${t('common.close')} (Esc)`} aria-label={t('common.close')} onClick={closeFlyoutAndRestoreFocus}><X size={14} /></button>
        </div>}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VARIANT: IN-PAGE (Rendered floating or docked inside BrowserMain)
  // When activeDock is 'topbar', nothing is shown on the page (leaves webview clean).
  // ──────────────────────────────────────────────────────────────────────────
  if (activeDock === 'topbar') {
    return null;
  }

  const isFree = activeDock === 'free';
  const styleObj: React.CSSProperties = isFree
    ? { left: `${coords.x}px`, top: `${coords.y}px`, position: 'absolute' }
    : {};

  return (
    <>
      {isDragging && (
        <div
          className="action-bar-drag-capture-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            cursor: 'grabbing',
            background: 'transparent',
            pointerEvents: 'auto'
          }}
        />
      )}
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
          title={`Andock-Position ändern (${DOCK_LABELS[normalizedDock] || DOCK_LABELS[activeDock]})`}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <Layout size={13} />
        </button>

        {menuOpen && (
          <div className="action-strip-dock-dropdown" role="menu">
            <div className="dock-dropdown-header">Andocken an Menüs:</div>
            {DOCK_SELECTION_OPTIONS.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`dock-dropdown-item ${normalizedDock === mode ? 'selected' : ''}`}
                onClick={() => handleSelectDock(mode)}
              >
                <span>{DOCK_LABELS[mode]}</span>
                {normalizedDock === mode && <span className="dock-check-badge">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      </div>
    </>
  );
}

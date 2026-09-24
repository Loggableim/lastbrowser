import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Bell,
  HelpCircle,
  Settings,
  Menu,
  Plus,
  GripHorizontal,
  GripVertical
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import type { LastbrowserPanelId } from '../shell-state.js';
import {
  type NovaDockSettings,
  usePanelStore
} from '../stores/usePanelStore.js';
import {
  usePinnedAppStore,
  type PinnedApp,
  extractAppDomain
} from '../stores/usePinnedAppStore.js';
import { renderAppIcon } from './PinnedAppGrid.js';
import { useDesktopI18n } from '../i18n.js';

export interface NovaDockProps {
  botName?: string;
  activePanel?: LastbrowserPanelId;
  activeTabUrl?: string;
  openTabUrls?: string[];
  onSelectPanel?: (panel: LastbrowserPanelId) => void;
  onOpenApp: (app: PinnedApp, options?: { newTab?: boolean }) => void;
  onAddPinnedApp?: () => void;
  onEditPinnedApp?: (app: PinnedApp) => void;
  onOpenHistory?: () => void;
  onOpenSettings: () => void;
  onNewTab: (url?: string) => void;
  onExpandSidebar: () => void;
}

export function NovaDock({
  botName = 'Nova',
  activePanel = 'browser',
  activeTabUrl,
  openTabUrls = [],
  onSelectPanel,
  onOpenApp,
  onAddPinnedApp,
  onEditPinnedApp,
  onOpenHistory,
  onOpenSettings,
  onNewTab,
  onExpandSidebar
}: NovaDockProps): React.JSX.Element {
  const { t } = useDesktopI18n();
  const dockSettings = usePanelStore((s) => s.dockSettings);
  const setDockSettings = usePanelStore((s) => s.setDockSettings);
  const pinnedStore = usePinnedAppStore();
  const apps = pinnedStore.apps;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState<boolean>(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dragging state for floating mode
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dockRef = useRef<HTMLDivElement | null>(null);

  const effectiveOrientation =
    dockSettings.position === 'floating'
      ? dockSettings.orientation
      : dockSettings.position === 'top' || dockSettings.position === 'bottom'
        ? 'horizontal'
        : 'vertical';

  const isHorizontal = effectiveOrientation === 'horizontal';

  // Clear hide timer when entering dock
  const handleMouseEnter = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsRevealed(true);
  }, []);

  // Schedule auto-hide on mouse leave if enabled
  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    if (dockSettings.autoHide) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => {
        setIsRevealed(false);
      }, 350);
    }
  }, [dockSettings.autoHide]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // Drag handlers for floating mode
  const handleDragMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (dockSettings.position !== 'floating' || !dockRef.current) return;
      e.preventDefault();
      setIsDragging(true);
      const rect = dockRef.current.getBoundingClientRect();
      dragStartOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    },
    [dockSettings.position]
  );

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      const maxX = Math.max(0, window.innerWidth - (dockRef.current?.offsetWidth || 100));
      const maxY = Math.max(0, window.innerHeight - (dockRef.current?.offsetHeight || 100));
      const nextX = Math.min(maxX, Math.max(0, e.clientX - dragStartOffset.current.x));
      const nextY = Math.min(maxY, Math.max(0, e.clientY - dragStartOffset.current.y));

      setDockSettings({
        floatingPos: { x: Math.round(nextX), y: Math.round(nextY) }
      });
    }

    function handleMouseUp() {
      setIsDragging(false);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setDockSettings]);

  // Fisheye scale calculator
  const getItemScale = useCallback(
    (index: number): number => {
      if (hoveredIndex === null) return 1;
      const distance = Math.abs(index - hoveredIndex);
      if (distance === 0) return dockSettings.magnification;
      if (distance === 1) return dockSettings.neighborScale;
      if (distance === 2) return 1 + (dockSettings.neighborScale - 1) * 0.4;
      return 1;
    },
    [hoveredIndex, dockSettings.magnification, dockSettings.neighborScale]
  );

  // Label reveal direction class
  const labelPlacementClass = useMemo(() => {
    switch (dockSettings.position) {
      case 'bottom':
        return 'label-pos-top';
      case 'top':
        return 'label-pos-bottom';
      case 'right':
        return 'label-pos-left';
      case 'left':
        return 'label-pos-right';
      case 'floating':
        return isHorizontal ? 'label-pos-top' : 'label-pos-right';
      default:
        return 'label-pos-right';
    }
  }, [dockSettings.position, isHorizontal]);

  // Build unified item list for continuous fisheye indexing
  let currentIndex = 0;
  const avatarIndex = currentIndex++;
  const chatIndex = currentIndex++;
  const kanbanIndex = currentIndex++;

  const pinnedIndexes = apps.map(() => currentIndex++);
  const addAppIndex = onAddPinnedApp ? currentIndex++ : null;

  const historyIndex = currentIndex++;
  const helpIndex = currentIndex++;
  const settingsIndex = currentIndex++;
  const expandIndex = currentIndex++;

  // Floating coordinates style
  const floatingStyle: React.CSSProperties =
    dockSettings.position === 'floating'
      ? {
          position: 'fixed',
          left: `${dockSettings.floatingPos.x}px`,
          top: `${dockSettings.floatingPos.y}px`,
          zIndex: 9990
        }
      : {};

  const animDurationStyle: React.CSSProperties = {
    '--dock-anim-duration': `${dockSettings.animationDuration}ms`
  } as React.CSSProperties;

  return (
    <>
      {/* Auto-Hide Hover Trigger Zone at the screen edge */}
      {dockSettings.autoHide && (
        <div
          className={`nova-dock-trigger-zone trigger-${dockSettings.position} ${isRevealed ? 'is-open' : 'is-peeking'}`}
          onMouseEnter={handleMouseEnter}
          aria-hidden="true"
        >
          <div className="nova-dock-peek-indicator" />
        </div>
      )}

      {/* Main Nova Dock Container */}
      <nav
        ref={dockRef}
        className={`nova-dock pos-${dockSettings.position} ${isHorizontal ? 'is-horizontal' : 'is-vertical'} anim-${dockSettings.animation} ${isRevealed ? 'is-revealed' : 'is-hidden'} ${isDragging ? 'is-dragging' : ''}`}
        style={{ ...floatingStyle, ...animDurationStyle }}
        aria-label="Nova Dock"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Drag handle for floating mode */}
        {dockSettings.position === 'floating' && (
          <div
            className="nova-dock-drag-handle"
            onMouseDown={handleDragMouseDown}
            title="Klicken & Ziehen zum Verschieben"
          >
            {isHorizontal ? <GripVertical size={13} /> : <GripHorizontal size={13} />}
          </div>
        )}

        {/* 1. Brand Avatar */}
        <div
          className="nova-dock-item-wrapper"
          onMouseEnter={() => setHoveredIndex(avatarIndex)}
          style={{ '--item-scale': getItemScale(avatarIndex) } as React.CSSProperties}
        >
          <button
            type="button"
            className="nova-dock-btn avatar-btn"
            onClick={onExpandSidebar}
            aria-label={`${botName} AI`}
          >
            <div className="dock-brand-circle">
              <img
                src={brandAssets.sidekickAvatar}
                alt={botName}
                className="dock-popart-avatar"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <span className="dock-online-dot" />
          </button>
          <div className={`nova-dock-label-pill ${labelPlacementClass}`}>
            <span className="label-text">{botName} AI</span>
            <span className="label-badge">Assistant</span>
          </div>
        </div>

        <div className="nova-dock-separator" />

        {/* 2. Quick Shortcuts: Chat & Kanban */}
        <div
          className="nova-dock-item-wrapper"
          onMouseEnter={() => setHoveredIndex(chatIndex)}
          style={{ '--item-scale': getItemScale(chatIndex) } as React.CSSProperties}
        >
          <button
            type="button"
            className={`nova-dock-btn ${activePanel === 'chat' ? 'is-active' : ''}`}
            onClick={() => onSelectPanel?.('chat')}
            aria-label={`${botName} Chat`}
          >
            <img src={brandAssets.sidebarIcons.chat} alt="Chat" className="dock-mini-icon" />
          </button>
          <div className={`nova-dock-label-pill ${labelPlacementClass}`}>
            <span className="label-text">{t('sidebar.items.chat.title')}</span>
          </div>
        </div>

        <div
          className="nova-dock-item-wrapper"
          onMouseEnter={() => setHoveredIndex(kanbanIndex)}
          style={{ '--item-scale': getItemScale(kanbanIndex) } as React.CSSProperties}
        >
          <button
            type="button"
            className={`nova-dock-btn ${activePanel === 'kanban' ? 'is-active' : ''}`}
            onClick={() => onSelectPanel?.('kanban')}
            aria-label="Kanban Board"
          >
            <img src={brandAssets.sidebarIcons.kanban} alt="Kanban" className="dock-mini-icon" />
          </button>
          <div className={`nova-dock-label-pill ${labelPlacementClass}`}>
            <span className="label-text">{t('sidebar.items.kanban.title')}</span>
          </div>
        </div>

        <div className="nova-dock-separator" />

        {/* 3. Pinned Web Apps & Bookmarks */}
        <div className="nova-dock-pinned-group">
          {apps.map((app, i) => {
            const index = pinnedIndexes[i];
            const isRunning = pinnedStore.isAppRunning(app, openTabUrls);
            const isActive = Boolean(
              activeTabUrl &&
                app.url &&
                (activeTabUrl.startsWith(app.url) ||
                  (app.domain && extractAppDomain(activeTabUrl) === app.domain))
            );

            return (
              <div
                key={app.id}
                className="nova-dock-item-wrapper"
                onMouseEnter={() => setHoveredIndex(index)}
                style={{ '--item-scale': getItemScale(index) } as React.CSSProperties}
              >
                <button
                  type="button"
                  className={`nova-dock-btn pinned-app-btn ${isActive ? 'is-active' : ''} ${isRunning ? 'is-running' : ''}`}
                  style={{ '--app-accent': app.color, '--app-bg': app.bg } as React.CSSProperties}
                  onClick={(e) => onOpenApp(app, { newTab: e.ctrlKey || e.metaKey })}
                  aria-label={app.name}
                >
                  <div className="pinned-dock-icon-wrapper" style={{ background: app.bg }}>
                    {renderAppIcon(app)}
                    {isActive && <span className="pinned-active-ring" />}
                  </div>
                  {isRunning && <span className="pinned-running-dot" />}
                </button>
                <div className={`nova-dock-label-pill ${labelPlacementClass}`}>
                  <span className="label-text">{app.name}</span>
                  {isRunning && <span className="label-status">Aktiv</span>}
                </div>
              </div>
            );
          })}

          {/* Add App Button */}
          {addAppIndex !== null && onAddPinnedApp && (
            <div
              className="nova-dock-item-wrapper"
              onMouseEnter={() => setHoveredIndex(addAppIndex)}
              style={{ '--item-scale': getItemScale(addAppIndex) } as React.CSSProperties}
            >
              <button
                type="button"
                className="nova-dock-btn add-btn"
                onClick={onAddPinnedApp}
                aria-label="App anheften"
              >
                <div className="pinned-dock-icon-wrapper">
                  <Plus size={14} />
                </div>
              </button>
              <div className={`nova-dock-label-pill ${labelPlacementClass}`}>
                <span className="label-text">App anheften</span>
              </div>
            </div>
          )}
        </div>

        <div className="nova-dock-separator" />

        {/* 4. Bottom / End Actions */}
        <div className="nova-dock-actions-group">
          {/* History */}
          <div
            className="nova-dock-item-wrapper"
            onMouseEnter={() => setHoveredIndex(historyIndex)}
            style={{ '--item-scale': getItemScale(historyIndex) } as React.CSSProperties}
          >
            <button
              type="button"
              className="nova-dock-btn"
              onClick={onOpenHistory}
              aria-label={t('sidebar.utilities.history.title')}
            >
              <Bell size={16} />
            </button>
            <div className={`nova-dock-label-pill ${labelPlacementClass}`}>
              <span className="label-text">{t('sidebar.utilities.history.title')}</span>
            </div>
          </div>

          {/* Help & Documentation */}
          <div
            className="nova-dock-item-wrapper"
            onMouseEnter={() => setHoveredIndex(helpIndex)}
            style={{ '--item-scale': getItemScale(helpIndex) } as React.CSSProperties}
          >
            <button
              type="button"
              className="nova-dock-btn"
              onClick={() => onNewTab('https://lastbrowser.com/docs')}
              aria-label={t('sidebar.drawer.help')}
            >
              <HelpCircle size={16} />
            </button>
            <div className={`nova-dock-label-pill ${labelPlacementClass}`}>
              <span className="label-text">{t('sidebar.drawer.help')}</span>
            </div>
          </div>

          {/* Settings */}
          <div
            className="nova-dock-item-wrapper"
            onMouseEnter={() => setHoveredIndex(settingsIndex)}
            style={{ '--item-scale': getItemScale(settingsIndex) } as React.CSSProperties}
          >
            <button
              type="button"
              className={`nova-dock-btn ${activePanel === 'settings' ? 'is-active' : ''}`}
              onClick={onOpenSettings}
              aria-label={t('sidebar.drawer.settings')}
            >
              <Settings size={16} />
            </button>
            <div className={`nova-dock-label-pill ${labelPlacementClass}`}>
              <span className="label-text">{t('sidebar.drawer.settings')}</span>
            </div>
          </div>

          {/* Expand Sidebar */}
          <div
            className="nova-dock-item-wrapper"
            onMouseEnter={() => setHoveredIndex(expandIndex)}
            style={{ '--item-scale': getItemScale(expandIndex) } as React.CSSProperties}
          >
            <button
              type="button"
              className="nova-dock-btn toggle-expand-btn"
              onClick={onExpandSidebar}
              aria-label={t('sidebar.drawer.expandSidebar')}
            >
              <Menu size={16} />
            </button>
            <div className={`nova-dock-label-pill ${labelPlacementClass}`}>
              <span className="label-text">{t('sidebar.drawer.expandSidebar')}</span>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}

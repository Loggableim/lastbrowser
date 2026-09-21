import React, { useState, useEffect, useRef } from 'react';
import {
  Code,
  FileText,
  Figma,
  Hash,
  Kanban,
  LayoutGrid,
  Plus,
  Tv,
  Globe,
  Terminal as TerminalIcon,
  ExternalLink,
  RefreshCw,
  Edit2,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Volume2,
  VolumeX,
  Check,
  Sparkles
} from 'lucide-react';
import type { LastbrowserPanelId } from '../shell-state.js';
import {
  type PinnedApp,
  DEFAULT_PINNED_APPS,
  PINNED_APPS_STORAGE_KEY_V2 as PINNED_APPS_STORAGE_KEY,
  extractAppDomain,
  getFaviconUrl,
  usePinnedAppStore
} from '../stores/usePinnedAppStore.js';

// Backward compatibility exports
export type { PinnedApp };
export { DEFAULT_PINNED_APPS, PINNED_APPS_STORAGE_KEY };
export function loadPinnedApps(): PinnedApp[] {
  return usePinnedAppStore.getState().apps;
}
export function savePinnedApps(apps: PinnedApp[]): void {
  usePinnedAppStore.getState().setApps(apps);
}

// Brand SVG icons for crisp presentation
function BrandIcon({ name, color }: { name: string; color: string }): React.JSX.Element {
  switch (name) {
    case 'github':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill={color}>
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
      );
    case 'chatgpt':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill={color}>
          <path d="M22.28 10.37a5.55 5.55 0 00-.47-4.47 5.76 5.76 0 00-3.83-2.73 5.71 5.71 0 00-4.73.91A5.62 5.62 0 009.08 3.5a5.75 5.75 0 00-4.3 2.15 5.64 5.64 0 00-.86 4.74 5.55 5.55 0 00-.47 4.47 5.76 5.76 0 003.83 2.73 5.71 5.71 0 004.73-.91 5.62 5.62 0 004.17.58 5.75 5.75 0 004.3-2.15 5.64 5.64 0 00.86-4.74h-.06zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
        </svg>
      );
    case 'youtube':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill={color}>
          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    case 'spotify':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill={color}>
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.503 17.308c-.215.352-.676.463-1.028.248-2.82-1.723-6.37-2.113-10.55-1.157-.402.093-.803-.158-.895-.56-.092-.403.159-.804.56-.896 4.577-1.046 8.508-.601 11.665 1.337.352.215.463.676.248 1.028zm1.467-3.262c-.27.44-.848.578-1.288.308-3.227-1.984-8.146-2.557-11.963-1.399-.494.15-1.023-.133-1.173-.627-.15-.494.133-1.023.627-1.173 4.364-1.324 9.789-.687 13.489 1.593.44.27.578.848.308 1.288zm.127-3.398C15.23 8.358 8.857 8.148 5.163 9.27c-.6.182-1.24-.162-1.422-.762-.182-.6.162-1.24.762-1.422 4.25-1.29 11.29-1.045 15.753 1.603.541.321.718 1.025.397 1.566-.32.541-1.024.718-1.566.397z" />
        </svg>
      );
    case 'discord':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill={color}>
          <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
      );
    case 'linear':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill={color}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5h-2v-2h2v2zm0-4h-2V7h2v5.5z" />
        </svg>
      );
    case 'twitter':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill={color}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    default:
      return <Globe size={15} color={color} />;
  }
}

export function renderAppIcon(app: PinnedApp): React.JSX.Element {
  if (app.iconName === 'terminal') {
    return <TerminalIcon size={16} color={app.color} />;
  }
  if (app.iconName === 'figma') {
    return <Figma size={16} color={app.color} />;
  }
  if (app.iconName === 'slack') {
    return <Hash size={16} color={app.color} />;
  }
  if (app.iconName === 'trello' || app.iconName === 'jira') {
    return <Kanban size={16} color={app.color} />;
  }
  if (app.iconName === 'netflix') {
    return <Tv size={16} color={app.color} />;
  }

  // Check SVG brand catalog
  if (
    app.iconName &&
    ['github', 'chatgpt', 'youtube', 'spotify', 'discord', 'linear', 'twitter'].includes(
      app.iconName
    )
  ) {
    return <BrandIcon name={app.iconName} color={app.color} />;
  }

  // Favicon preview if available
  if (app.faviconUrl) {
    return (
      <img
        src={app.faviconUrl}
        alt=""
        className="pinned-app-favicon"
        onError={(e) => {
          (e.currentTarget as HTMLElement).style.display = 'none';
        }}
      />
    );
  }

  if (app.letter) {
    return <span className="pinned-app-letter" style={{ color: app.color }}>{app.letter}</span>;
  }

  return <Globe size={15} color={app.color} />;
}

export interface PinnedAppGridProps {
  layout: 'dock' | 'grid';
  apps?: PinnedApp[];
  activeTabUrl?: string;
  openTabUrls?: string[];
  onOpenApp: (app: PinnedApp, options?: { newTab?: boolean }) => void;
  onAddApp?: () => void;
  onEditApp?: (app: PinnedApp) => void;
}

export function PinnedAppGrid({
  layout,
  apps: propsApps,
  activeTabUrl,
  openTabUrls = [],
  onOpenApp,
  onAddApp,
  onEditApp
}: PinnedAppGridProps): React.JSX.Element {
  const store = usePinnedAppStore();
  const apps = propsApps || store.apps;

  const [contextMenu, setContextMenu] = useState<{
    app: PinnedApp;
    x: number;
    y: number;
  } | null>(null);

  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      window.addEventListener('mousedown', handleOutsideClick);
    }
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, app: PinnedApp) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      app,
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - 260)
    });
  };

  const handleMove = (app: PinnedApp, direction: 'prev' | 'next') => {
    const idx = apps.findIndex((a) => a.id === app.id);
    if (idx === -1) return;
    const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < apps.length) {
      store.reorderApps(idx, targetIdx);
    }
    setContextMenu(null);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedAppId(id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedAppId || draggedAppId === targetId) return;
    const fromIdx = apps.findIndex((a) => a.id === draggedAppId);
    const toIdx = apps.findIndex((a) => a.id === targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      store.reorderApps(fromIdx, toIdx);
    }
    setDraggedAppId(null);
  };

  if (layout === 'dock') {
    return (
      <div className="pinned-dock-list" role="toolbar" aria-label="Pinned Web Apps">
        {apps.map((app) => {
          const isRunning = store.isAppRunning(app, openTabUrls);
          const isActive = Boolean(
            activeTabUrl &&
            app.url &&
            (activeTabUrl.startsWith(app.url) ||
              (app.domain && extractAppDomain(activeTabUrl) === app.domain))
          );

          return (
            <button
              key={app.id}
              type="button"
              draggable
              className={`pinned-dock-btn ${isActive ? 'is-active' : ''} ${isRunning ? 'is-running' : ''}`}
              title={`${app.name}${isRunning ? ' (Läuft)' : ''} – Rechtsklick für Optionen`}
              aria-label={app.name}
              style={{ '--app-accent': app.color, '--app-bg': app.bg } as React.CSSProperties}
              onClick={(e) => onOpenApp(app, { newTab: e.ctrlKey || e.metaKey })}
              onContextMenu={(e) => handleContextMenu(e, app)}
              onDragStart={(e) => handleDragStart(e, app.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, app.id)}
            >
              <div className="pinned-dock-icon-wrapper" style={{ background: app.bg }}>
                {renderAppIcon(app)}
                {isActive && <span className="pinned-active-ring" />}
              </div>
              {isRunning && <span className="pinned-running-dot" />}
            </button>
          );
        })}

        {onAddApp && (
          <button
            type="button"
            className="pinned-dock-btn add-btn"
            title="App anheften (+)"
            aria-label="App anheften"
            onClick={onAddApp}
          >
            <div className="pinned-dock-icon-wrapper">
              <Plus size={14} />
            </div>
          </button>
        )}

        {/* Floating Context Menu */}
        {contextMenu && (
          <PinnedContextMenuOverlay
            menuRef={menuRef}
            contextMenu={contextMenu}
            apps={apps}
            onOpenApp={onOpenApp}
            onEditApp={onEditApp}
            onMove={handleMove}
            onRemove={(id) => {
              store.removeApp(id);
              setContextMenu(null);
            }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // Grid layout (Zen compact raster)
  return (
    <div className="pinned-zen-grid" role="region" aria-label="Favorite Apps Grid">
      <div className="pinned-grid-header">
        <span className="pinned-grid-title">PINNED APPS</span>
        {onAddApp && (
          <button
            type="button"
            className="pinned-grid-quick-add"
            onClick={onAddApp}
            title="Neue App anheften"
          >
            <Plus size={11} />
          </button>
        )}
      </div>
      <div className="pinned-grid-cells">
        {apps.map((app) => {
          const isRunning = store.isAppRunning(app, openTabUrls);
          const isActive = Boolean(
            activeTabUrl &&
            app.url &&
            (activeTabUrl.startsWith(app.url) ||
              (app.domain && extractAppDomain(activeTabUrl) === app.domain))
          );

          return (
            <button
              key={app.id}
              type="button"
              draggable
              className={`pinned-grid-cell ${isActive ? 'is-active' : ''} ${isRunning ? 'is-running' : ''}`}
              title={`${app.name}${isRunning ? ' (Aktiv)' : ''} – Rechtsklick für Optionen`}
              aria-label={app.name}
              style={{ '--app-accent': app.color } as React.CSSProperties}
              onClick={(e) => onOpenApp(app, { newTab: e.ctrlKey || e.metaKey })}
              onContextMenu={(e) => handleContextMenu(e, app)}
              onDragStart={(e) => handleDragStart(e, app.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, app.id)}
            >
              <div className="pinned-grid-icon-box" style={{ background: app.bg }}>
                {renderAppIcon(app)}
                {isRunning && <span className="pinned-running-dot" />}
              </div>
              <span className="pinned-grid-label">{app.name}</span>
            </button>
          );
        })}

        {onAddApp && (
          <button
            type="button"
            className="pinned-grid-cell add-cell"
            title="App anheften"
            aria-label="App anheften"
            onClick={onAddApp}
          >
            <div className="pinned-grid-icon-box">
              <Plus size={14} />
            </div>
            <span className="pinned-grid-label">Add</span>
          </button>
        )}
      </div>

      {/* Floating Context Menu */}
      {contextMenu && (
        <PinnedContextMenuOverlay
          menuRef={menuRef}
          contextMenu={contextMenu}
          apps={apps}
          onOpenApp={onOpenApp}
          onEditApp={onEditApp}
          onMove={handleMove}
          onRemove={(id) => {
            store.removeApp(id);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// Sub-component for clean context menu rendering
function PinnedContextMenuOverlay({
  menuRef,
  contextMenu,
  apps,
  onOpenApp,
  onEditApp,
  onMove,
  onRemove,
  onClose
}: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  contextMenu: { app: PinnedApp; x: number; y: number };
  apps: PinnedApp[];
  onOpenApp: (app: PinnedApp, options?: { newTab?: boolean }) => void;
  onEditApp?: (app: PinnedApp) => void;
  onMove: (app: PinnedApp, direction: 'prev' | 'next') => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { app, x, y } = contextMenu;
  const idx = apps.findIndex((a) => a.id === app.id);

  return (
    <div
      ref={menuRef}
      className="pinned-context-menu"
      style={{ top: `${y}px`, left: `${x}px` }}
      role="menu"
    >
      <div className="pinned-context-header">
        <span className="pinned-context-title">{app.name}</span>
        {app.domain && <span className="pinned-context-domain">{app.domain}</span>}
      </div>

      <button
        type="button"
        className="pinned-context-item"
        onClick={() => {
          onOpenApp(app);
          onClose();
        }}
      >
        <Sparkles size={13} />
        <span>Öffnen / Wechseln</span>
      </button>

      <button
        type="button"
        className="pinned-context-item"
        onClick={() => {
          onOpenApp(app, { newTab: true });
          onClose();
        }}
      >
        <ExternalLink size={13} />
        <span>In neuem Tab öffnen</span>
      </button>

      <div className="pinned-context-separator" />

      {onEditApp && (
        <button
          type="button"
          className="pinned-context-item"
          onClick={() => {
            onEditApp(app);
            onClose();
          }}
        >
          <Edit2 size={13} />
          <span>Bearbeiten...</span>
        </button>
      )}

      {idx > 0 && (
        <button
          type="button"
          className="pinned-context-item"
          onClick={() => onMove(app, 'prev')}
        >
          <ArrowLeft size={13} />
          <span>Nach vorne verschieben</span>
        </button>
      )}

      {idx < apps.length - 1 && (
        <button
          type="button"
          className="pinned-context-item"
          onClick={() => onMove(app, 'next')}
        >
          <ArrowRight size={13} />
          <span>Nach hinten verschieben</span>
        </button>
      )}

      <div className="pinned-context-separator" />

      <button
        type="button"
        className="pinned-context-item danger"
        onClick={() => onRemove(app.id)}
      >
        <Trash2 size={13} />
        <span>Aus Pinned Apps entfernen</span>
      </button>
    </div>
  );
}

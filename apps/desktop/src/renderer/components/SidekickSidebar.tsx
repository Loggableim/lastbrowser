import React from 'react';
import {
  Bell,
  ChevronDown,
  EyeOff,
  Globe2,
  HelpCircle,
  Loader2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Star,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { BrowserTab } from '../tabs.js';
import type { SpaceSummary } from '../shell-state.js';
import { spaceDisplayName } from '../shell-state.js';
import { PinnedAppGrid, type PinnedApp } from './PinnedAppGrid.js';
import type { SidebarMode } from '../stores/usePanelStore.js';

export interface SidekickSidebarProps {
  mode: SidebarMode;
  tabs: BrowserTab[];
  activeTabId: string;
  draggedTabId?: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (url?: string, options?: { incognito?: boolean }) => void;
  onPinTab?: (tabId: string) => void;
  onToggleTabMute?: (tabId: string) => void;
  onDragStartTab?: (tabId: string | null) => void;
  onDragEndTab?: () => void;
  onMoveTab?: (sourceId: string, targetId: string) => void;
  onCycleMode: () => void;
  onSetMode: (mode: SidebarMode) => void;
  activeSpacePath: string;
  spaces: SpaceSummary[];
  onSelectSpace: (path: string) => void;
  onOpenSettings: () => void;
  onOpenHistory?: () => void;
  onOpenApp: (app: PinnedApp) => void;
  botName?: string;
}

export function SidekickSidebar({
  mode,
  tabs,
  activeTabId,
  draggedTabId,
  onActivateTab,
  onCloseTab,
  onNewTab,
  onPinTab,
  onToggleTabMute,
  onDragStartTab,
  onDragEndTab,
  onMoveTab,
  onCycleMode,
  onSetMode,
  activeSpacePath,
  spaces,
  onSelectSpace,
  onOpenSettings,
  onOpenHistory,
  onOpenApp,
  botName = 'Nova'
}: SidekickSidebarProps): React.JSX.Element {
  if (mode === 'hidden') {
    return (
      <div
        className="sidekick-sidebar-revealer"
        title="Show Sidebar (Ctrl+B)"
        onClick={() => onSetMode('slim')}
      >
        <div className="revealer-indicator" />
      </div>
    );
  }

  const activeSpace = spaces.find((s) => s.path === activeSpacePath);
  const spaceLabel = activeSpace ? spaceDisplayName(activeSpace) : 'Workspace';

  return (
    <aside className={`sidekick-sidebar ${mode}`}>
      {mode === 'slim' ? (
        <div className="sidekick-dock-inner">
          {/* Top avatar / brand */}
          <div className="dock-top-brand" onClick={() => onSetMode('expanded')} title={`${botName} - Click to expand sidebar`}>
            <div className="dock-brand-circle">
              <span>S</span>
            </div>
            <span className="dock-visually-hidden">Chat</span>
            <span className="dock-online-dot" />
          </div>

          {/* Pinned Web Apps Dock */}
          <div className="dock-apps-container">
            <PinnedAppGrid layout="dock" onOpenApp={onOpenApp} />
          </div>

          {/* Bottom Dock Actions */}
          <div className="dock-bottom-actions">
            <button
              type="button"
              className="dock-action-btn"
              title="History / Activity"
              aria-label="History"
              onClick={onOpenHistory}
            >
              <Bell size={16} />
              <span className="dock-visually-hidden">History</span>
            </button>
            <button
              type="button"
              className="dock-action-btn"
              title="Help & Documentation"
              aria-label="Help"
              onClick={() => onNewTab('https://lastbrowser.com/docs')}
            >
              <HelpCircle size={16} />
              <span className="dock-visually-hidden">Help</span>
            </button>
            <button
              type="button"
              className="dock-action-btn"
              title="Settings"
              aria-label="Settings"
              onClick={onOpenSettings}
            >
              <Settings size={16} />
              <span className="dock-visually-hidden">Settings</span>
            </button>
            <button
              type="button"
              className="dock-action-btn toggle-expand-btn"
              title="Expand Sidebar (Ctrl+B)"
              aria-label="Expand Sidebar"
              onClick={() => onSetMode('expanded')}
            >
              <Menu size={16} />
              <span className="dock-visually-hidden">Menu</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="sidekick-expanded-inner">
          {/* Top Workspace Picker Header */}
          <div className="expanded-top-bar">
            <div className="expanded-workspace-pill">
              <span className="workspace-badge-letter">
                {spaceLabel.charAt(0).toUpperCase()}
              </span>
              <span className="workspace-badge-name">{spaceLabel}</span>
              {spaces.length > 1 && <ChevronDown size={14} className="workspace-chevron" />}
            </div>
            <button
              type="button"
              className="sidebar-collapse-icon-btn"
              title="Collapse to Slim Dock (Ctrl+B)"
              onClick={() => onSetMode('slim')}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          {/* Zen Pinned Apps Raster */}
          <div className="expanded-pinned-raster">
            <PinnedAppGrid layout="grid" onOpenApp={onOpenApp} />
          </div>

          {/* Vertical Tabs List */}
          <div className="expanded-tabs-section">
            <div className="expanded-section-header">
              <span className="section-title">TABS</span>
              <span className="tab-count-badge">{tabs.length}</span>
            </div>

            <div className="vertical-tab-list" role="tablist">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    role="tab"
                    tabIndex={0}
                    draggable
                    aria-selected={isActive}
                    className={`vertical-tab-item ${isActive ? 'active' : ''} ${tab.pinned ? 'pinned' : ''} ${tab.incognito ? 'incognito' : ''} ${draggedTabId === tab.id ? 'dragging' : ''}`}
                    onClick={() => onActivateTab(tab.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onActivateTab(tab.id);
                      }
                    }}
                    onDragStart={() => onDragStartTab?.(tab.id)}
                    onDragEnd={() => onDragEndTab?.()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedTabId && draggedTabId !== tab.id) onMoveTab?.(draggedTabId, tab.id);
                      onDragEndTab?.();
                    }}
                  >
                    <div className="vtab-icon-wrapper">
                      {tab.isLoading ? (
                        <Loader2 size={13} className="tab-spinner" />
                      ) : tab.favicon ? (
                        <img
                          src={tab.favicon}
                          alt=""
                          className="vtab-favicon"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Globe2 size={13} className="vtab-fallback-icon" />
                      )}
                      {tab.incognito && (
                        <EyeOff size={10} className="vtab-incognito-badge" title="Private tab" />
                      )}
                    </div>

                    <span className="vtab-title" title={tab.title}>
                      {tab.title}
                    </span>

                    {/* Audio Mute button if playing or muted */}
                    {(tab.isPlayingAudio || tab.isMuted) && (
                      <button
                        type="button"
                        className={`vtab-audio-btn ${tab.isMuted ? 'is-muted' : 'is-playing'}`}
                        title={tab.isMuted ? `Unmute ${tab.title}` : `Mute ${tab.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleTabMute?.(tab.id);
                        }}
                      >
                        {tab.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                    )}

                    {/* Close Tab button */}
                    <button
                      type="button"
                      className="vtab-close-btn"
                      title="Close tab (Ctrl+W)"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* New Tab Button */}
            <button
              type="button"
              className="vertical-new-tab-btn"
              onClick={() => onNewTab()}
              title="New Tab (Ctrl+T)"
            >
              <Plus size={14} />
              <span>New Tab</span>
              <kbd className="shortcut-hint">Ctrl+T</kbd>
            </button>
          </div>

          {/* Bottom Footer in Expanded mode */}
          <div className="expanded-bottom-footer">
            <button
              type="button"
              className="footer-link-btn"
              onClick={onOpenSettings}
              title="Settings"
            >
              <Settings size={14} />
              <span>Settings</span>
            </button>
            <button
              type="button"
              className="footer-link-btn"
              onClick={() => onSetMode('hidden')}
              title="Hide Sidebar (Zen Mode)"
            >
              <PanelLeftClose size={14} />
              <span>Zen Mode</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

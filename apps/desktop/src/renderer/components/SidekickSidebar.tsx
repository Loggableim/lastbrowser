import React, { useState } from 'react';
import {
  Bell,
  ChevronDown,
  Columns2,
  Download,
  EyeOff,
  Globe2,
  HelpCircle,
  History,
  Layers,
  Loader2,
  Menu,
  Moon,
  PanelLeftClose,
  Plus,
  Puzzle,
  Settings,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  Wrench,
  X
} from 'lucide-react';
import type { BrowserTab } from '../tabs.js';
import type { LastbrowserPanelId, SpaceSummary } from '../shell-state.js';
import { spaceDisplayName } from '../shell-state.js';
import { brandAssets } from '../brand.js';
import { PinnedAppGrid, type PinnedApp } from './PinnedAppGrid.js';
import type { SidebarDrawerTab, SidebarMode, ZenExitDefaultMode } from '../stores/usePanelStore.js';
import type { DesktopSessionSummary } from '../sidekick-client.js';

export interface DrawerItem {
  id: LastbrowserPanelId;
  title: string;
  desc: string;
  iconSrc: string;
}

const AI_DRAWER_ITEMS: DrawerItem[] = [
  { id: 'chat', title: 'Nova Chat', desc: 'AI Konversation & Prompts', iconSrc: brandAssets.sidebarIcons.chat },
  { id: 'agents', title: 'Sub-Agents', desc: 'Spezialisierte Agenten-Flotte', iconSrc: brandAssets.sidebarIcons.agents },
  { id: 'skills', title: 'Agent Skills', desc: 'Fähigkeiten & MCP Tools', iconSrc: brandAssets.sidebarIcons.skills },
  { id: 'memory', title: 'Supermemory', desc: 'Langzeitgedächtnis & Fakten', iconSrc: brandAssets.sidebarIcons.memory },
  { id: 'profiles', title: 'Agent Profiles', desc: 'Modell- & System-Profile', iconSrc: brandAssets.sidebarIcons.profiles }
];

const WORKFLOW_DRAWER_ITEMS: DrawerItem[] = [
  { id: 'kanban', title: 'Kanban Board', desc: 'Visuelle Aufgaben-Pipeline', iconSrc: brandAssets.sidebarIcons.kanban },
  { id: 'tasks', title: 'Scheduled Tasks', desc: 'Hintergrund-Jobs & Scheduler', iconSrc: brandAssets.sidebarIcons.tasks },
  { id: 'workspaces', title: 'Spaces', desc: 'Getrennte Projekt-Bereiche', iconSrc: brandAssets.sidebarIcons.workspaces },
  { id: 'todos', title: 'Todos & Plan', desc: 'Schritt-für-Schritt Checklisten', iconSrc: brandAssets.sidebarIcons.todos },
  { id: 'insights', title: 'Insights & Usage', desc: 'Token-Kosten & LLM-Metriken', iconSrc: brandAssets.sidebarIcons.insights }
];

const TOOLS_DRAWER_ITEMS: DrawerItem[] = [
  { id: 'browser', title: 'AI Search & Web', desc: 'Browser & Recherche-Canvas', iconSrc: brandAssets.sidebarIcons.browser },
  { id: 'terminal', title: 'Terminal', desc: 'Integrierte Entwickler-Shell', iconSrc: brandAssets.sidebarIcons.spark },
  { id: 'gmail', title: 'Gmail AI', desc: 'E-Mail Triage & Entwürfe', iconSrc: brandAssets.sidebarIcons.gmail },
  { id: 'discord', title: 'Discord Agent', desc: 'Community & Bot Moderation', iconSrc: brandAssets.sidebarIcons.discord },
  { id: 'appstore', title: 'Extension & Skill Hub', desc: 'Chrome MV3 & Nova MCP Skills', iconSrc: brandAssets.sidebarIcons.appstore },
  { id: 'logs', title: 'System Logs', desc: 'Echtzeit-Debugging & Events', iconSrc: brandAssets.sidebarIcons.logs },
  { id: 'settings', title: 'Einstellungen', desc: 'Design, Provider & System', iconSrc: brandAssets.sidebarIcons.settings }
];

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
  onOpenDownloads?: () => void;
  onOpenExtensions?: () => void;
  onOpenPermissions?: () => void;
  onOpenApp: (app: PinnedApp, options?: { newTab?: boolean }) => void;
  onAddPinnedApp?: () => void;
  onEditPinnedApp?: (app: PinnedApp) => void;
  activeTabUrl?: string;
  openTabUrls?: string[];
  botName?: string;
  /** Called when a sleeping (discarded) tab is woken before activation. */
  onWakeTab?: (tabId: string) => void;
  /** Active panel in main view (e.g. browser, kanban, chat, etc.) */
  activePanel?: LastbrowserPanelId;
  /** Callback when user selects a panel from the multi-tier drawer */
  onSelectPanel?: (panel: LastbrowserPanelId) => void;
  /** Active drawer category tab in expanded mode */
  drawerTab?: SidebarDrawerTab;
  /** Callback when user switches drawer category tab */
  onSelectDrawerTab?: (tab: SidebarDrawerTab) => void;
  /** Default mode when exiting Zen mode */
  zenExitDefaultMode?: ZenExitDefaultMode;
  /** Recent Sidekick chat sessions */
  sessions?: DesktopSessionSummary[];
  /** Current active session id */
  activeSessionId?: string | null;
  /** Callback when a session is selected */
  onSelectSession?: (sessionId: string) => void;
  /** Callback when a new session is requested */
  onCreateSession?: () => void;
  /** Active split tabs (up to 4) */
  splitTabIds?: string[];
  /** Callback to add tab to splitscreen */
  onAddSplitTab?: (tabId: string, baseTabId?: string) => void;
  /** Callback to remove tab from splitscreen */
  onRemoveSplitTab?: (tabId: string) => void;
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
  onOpenDownloads,
  onOpenExtensions,
  onOpenPermissions,
  onOpenApp,
  onAddPinnedApp,
  onEditPinnedApp,
  activeTabUrl,
  openTabUrls = [],
  botName = 'Nova',
  onWakeTab,
  activePanel = 'browser',
  onSelectPanel,
  drawerTab = 'tabs',
  onSelectDrawerTab,
  zenExitDefaultMode = 'slim',
  sessions = [],
  activeSessionId = null,
  onSelectSession,
  onCreateSession,
  splitTabIds = [],
  onAddSplitTab,
  onRemoveSplitTab
}: SidekickSidebarProps): React.JSX.Element {
  const [dragOverInfo, setDragOverInfo] = useState<{ id: string; mode: 'before' | 'after' | 'split' } | null>(null);
  const [internalDrawerTab, setInternalDrawerTab] = useState<SidebarDrawerTab>(drawerTab);
  const currentDrawerTab = onSelectDrawerTab ? drawerTab : internalDrawerTab;

  function handleDrawerTabChange(tab: SidebarDrawerTab) {
    if (onSelectDrawerTab) {
      onSelectDrawerTab(tab);
    } else {
      setInternalDrawerTab(tab);
    }
  }

  if (mode === 'hidden') {
    return (
      <div
        className="sidekick-sidebar-revealer"
        title={`Show Sidebar (Ctrl+B) • Opens in ${zenExitDefaultMode} mode`}
        onClick={() => onSetMode(zenExitDefaultMode)}
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
          <div
            className="dock-top-brand"
            onClick={() => onSetMode('expanded')}
            title={`${botName} AI • Click to expand sidebar`}
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
            <span className="dock-visually-hidden">Chat</span>
            <span className="dock-online-dot" />
          </div>

          {/* Quick Access to Nova Chat & Kanban in dock */}
          <div className="dock-quick-shortcuts">
            <button
              type="button"
              className={`dock-shortcut-btn ${activePanel === 'chat' ? 'is-active' : ''}`}
              title={`${botName} Chat`}
              onClick={() => onSelectPanel?.('chat')}
            >
              <img src={brandAssets.sidebarIcons.chat} alt="Chat" className="dock-mini-icon" />
            </button>
            <button
              type="button"
              className={`dock-shortcut-btn ${activePanel === 'kanban' ? 'is-active' : ''}`}
              title="Kanban Board"
              onClick={() => onSelectPanel?.('kanban')}
            >
              <img src={brandAssets.sidebarIcons.kanban} alt="Kanban" className="dock-mini-icon" />
            </button>
          </div>

          {/* Pinned Web Apps Dock */}
          <div className="dock-apps-container">
            <PinnedAppGrid
              layout="dock"
              activeTabUrl={activeTabUrl}
              openTabUrls={openTabUrls}
              onOpenApp={onOpenApp}
              onAddApp={onAddPinnedApp}
              onEditApp={onEditPinnedApp}
            />
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

          {/* Variante B: Segmented Multi-Tier Drawer Tabs */}
          <div className="sidebar-drawer-tabs" role="tablist" aria-label="Seitenleisten-Bereiche">
            <button
              type="button"
              role="tab"
              aria-selected={currentDrawerTab === 'tabs'}
              className={`drawer-tab-btn ${currentDrawerTab === 'tabs' ? 'active' : ''}`}
              onClick={() => handleDrawerTabChange('tabs')}
              title="Browser Tabs & Gepinnte Apps"
            >
              <Globe2 size={13} />
              <span>Tabs</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentDrawerTab === 'ai'}
              className={`drawer-tab-btn ${currentDrawerTab === 'ai' ? 'active' : ''}`}
              onClick={() => handleDrawerTabChange('ai')}
              title="Nova AI, Agents & Skills"
            >
              <Sparkles size={13} />
              <span>AI</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentDrawerTab === 'workflows'}
              className={`drawer-tab-btn ${currentDrawerTab === 'workflows' ? 'active' : ''}`}
              onClick={() => handleDrawerTabChange('workflows')}
              title="Kanban, Tasks & Spaces"
            >
              <Layers size={13} />
              <span>Flows</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentDrawerTab === 'tools'}
              className={`drawer-tab-btn ${currentDrawerTab === 'tools' ? 'active' : ''}`}
              onClick={() => handleDrawerTabChange('tools')}
              title="Terminal, Gmail, Logs & Settings"
            >
              <Wrench size={13} />
              <span>Tools</span>
            </button>
          </div>

          {/* Drawer Body depending on active drawer tab */}
          {currentDrawerTab === 'tabs' && (
            <>
              {/* Zen Pinned Apps Raster */}
              <div className="expanded-pinned-raster">
                <PinnedAppGrid
                  layout="grid"
                  activeTabUrl={activeTabUrl}
                  openTabUrls={openTabUrls}
                  onOpenApp={onOpenApp}
                  onAddApp={onAddPinnedApp}
                  onEditApp={onEditPinnedApp}
                />
              </div>

              {/* Vertical Tabs List */}
              <div className="expanded-tabs-section">
                <div className="expanded-section-header">
                  <span className="section-title">TABS</span>
                  <div className="expanded-section-actions">
                    {onOpenDownloads && (
                      <button
                        type="button"
                        className="sidebar-header-icon-btn"
                        onClick={onOpenDownloads}
                        title="Downloads (Ctrl+J)"
                        aria-label="Downloads"
                      >
                        <Download size={12} />
                      </button>
                    )}
                    <span className="tab-count-badge">{tabs.length}</span>
                  </div>
                </div>

                <div className="vertical-tab-list" role="tablist">
                  {tabs.map((tab) => {
                    const isActive = tab.id === activeTabId && activePanel === 'browser';
                    const isDragTarget = dragOverInfo?.id === tab.id;
                    const dragMode = isDragTarget ? dragOverInfo.mode : null;
                    return (
                      <div
                        key={tab.id}
                        role="tab"
                        tabIndex={0}
                        draggable
                        aria-selected={isActive}
                        className={`vertical-tab-item ${isActive ? 'active' : ''} ${tab.pinned ? 'pinned' : ''} ${tab.incognito ? 'incognito' : ''} ${tab.isDiscarded ? 'discarded' : ''} ${draggedTabId === tab.id ? 'dragging' : ''} ${dragMode ? `drag-over-${dragMode}` : ''}`}
                        onClick={() => {
                          if (tab.isDiscarded) onWakeTab?.(tab.id);
                          onActivateTab(tab.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (tab.isDiscarded) onWakeTab?.(tab.id);
                            onActivateTab(tab.id);
                          }
                        }}
                        onDragStart={() => {
                          setDragOverInfo(null);
                          onDragStartTab?.(tab.id);
                        }}
                        onDragEnd={() => {
                          setDragOverInfo(null);
                          onDragEndTab?.();
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          if (!draggedTabId || draggedTabId === tab.id) return;
                          const rect = event.currentTarget.getBoundingClientRect();
                          const relY = (event.clientY - rect.top) / rect.height;
                          let mode: 'before' | 'after' | 'split' = 'split';
                          if (relY < 0.25) mode = 'before';
                          else if (relY > 0.75) mode = 'after';
                          if (!dragOverInfo || dragOverInfo.id !== tab.id || dragOverInfo.mode !== mode) {
                            setDragOverInfo({ id: tab.id, mode });
                          }
                        }}
                        onDragLeave={(event) => {
                          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                          if (dragOverInfo?.id === tab.id) {
                            setDragOverInfo(null);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const currentDrop = dragOverInfo;
                          setDragOverInfo(null);
                          if (draggedTabId && draggedTabId !== tab.id) {
                            if (currentDrop?.id === tab.id && currentDrop.mode === 'split') {
                              onAddSplitTab?.(draggedTabId, tab.id);
                            } else {
                              onMoveTab?.(draggedTabId, tab.id);
                            }
                          }
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
                          {tab.isDiscarded && (
                            <Moon size={10} className="vtab-discarded-badge" title="Tab sleeping – click to wake" />
                          )}
                        </div>

                        <span className="vtab-title" title={tab.title}>
                          {tab.title}
                        </span>

                        {dragMode === 'split' && (
                          <div className="vtab-split-drop-badge">
                            <Columns2 size={11} />
                            <span>Splitscreen</span>
                          </div>
                        )}

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

                        {/* Splitscreen Toggle button */}
                        {onAddSplitTab && (
                          <button
                            type="button"
                            className={`vtab-split-btn ${splitTabIds.includes(tab.id) ? 'active' : ''}`}
                            title={splitTabIds.includes(tab.id) ? "Splitscreen für diesen Tab beenden" : "In Splitscreen öffnen (bis zu 4 Tabs)"}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (splitTabIds.includes(tab.id)) {
                                onRemoveSplitTab?.(tab.id);
                              } else {
                                onAddSplitTab(tab.id);
                              }
                            }}
                          >
                            <Columns2 size={12} />
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

                {/* Tabs Action Buttons */}
                <div className="tabs-tier-actions-row">
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
                  {onOpenDownloads && (
                    <button
                      type="button"
                      className="vertical-downloads-btn"
                      onClick={onOpenDownloads}
                      title="Downloads (Ctrl+J)"
                    >
                      <Download size={13} />
                      <span>Downloads</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* AI Drawer Items */}
          {currentDrawerTab === 'ai' && (
            <div className="sidebar-drawer-content" role="region" aria-label="AI & Agents">
              {/* Prominent + New Chat button */}
              <div className="sidebar-ai-actions">
                <button
                  type="button"
                  className="sidebar-new-chat-btn"
                  onClick={() => onCreateSession?.()}
                  title="Neuen Chat starten"
                >
                  <Plus size={15} />
                  <span>+ Neuer Chat</span>
                </button>
              </div>

              {/* Recent Sessions List */}
              {sessions && sessions.length > 0 && (
                <div className="sidebar-recent-sessions">
                  <div className="drawer-section-title">LETZTE CHATS</div>
                  <div className="sidebar-session-list">
                    {sessions.slice(0, 5).map((session) => {
                      const isActive = session.session_id === activeSessionId && activePanel === 'chat';
                      return (
                        <button
                          key={session.session_id}
                          type="button"
                          className={`sidebar-session-item ${isActive ? 'is-active' : ''}`}
                          onClick={() => onSelectSession?.(session.session_id)}
                          title={session.title || 'Chat'}
                        >
                          <Sparkles size={12} className="session-item-icon" />
                          <span className="session-item-title">{session.title || 'Neuer Chat'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="drawer-section-title" style={{ marginTop: 12 }}>NOVA AI & AGENTS</div>
              <div className="drawer-cards-list">
                {AI_DRAWER_ITEMS.map((item) => {
                  const isCurrent = activePanel === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`sidebar-drawer-card ${isCurrent ? 'is-active' : ''}`}
                      onClick={() => onSelectPanel?.(item.id)}
                      title={item.desc}
                    >
                      <div className="drawer-card-icon-box">
                        <img src={item.iconSrc} alt="" className="drawer-popart-icon" />
                      </div>
                      <div className="drawer-card-text">
                        <span className="drawer-card-title">{item.title}</span>
                        <span className="drawer-card-desc">{item.desc}</span>
                      </div>
                      {isCurrent && <span className="drawer-active-dot" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Workflows Drawer Items */}
          {currentDrawerTab === 'workflows' && (
            <div className="sidebar-drawer-content" role="region" aria-label="Workflows & Spaces">
              <div className="drawer-section-title">WORKFLOWS & PRODUCTIVITY</div>
              <div className="drawer-cards-list">
                {WORKFLOW_DRAWER_ITEMS.map((item) => {
                  const isCurrent = activePanel === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`sidebar-drawer-card ${isCurrent ? 'is-active' : ''}`}
                      onClick={() => onSelectPanel?.(item.id)}
                      title={item.desc}
                    >
                      <div className="drawer-card-icon-box">
                        <img src={item.iconSrc} alt="" className="drawer-popart-icon" />
                      </div>
                      <div className="drawer-card-text">
                        <span className="drawer-card-title">{item.title}</span>
                        <span className="drawer-card-desc">{item.desc}</span>
                      </div>
                      {isCurrent && <span className="drawer-active-dot" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tools Drawer Items */}
          {currentDrawerTab === 'tools' && (
            <div className="sidebar-drawer-content" role="region" aria-label="Tools & System">
              <div className="drawer-section-title">DEVELOPER & SYSTEM TOOLS</div>
              <div className="drawer-cards-list">
                {TOOLS_DRAWER_ITEMS.map((item) => {
                  const isCurrent = activePanel === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`sidebar-drawer-card ${isCurrent ? 'is-active' : ''}`}
                      onClick={() => {
                        if (item.id === 'browser') {
                          onActivateTab(activeTabId);
                        } else {
                          onSelectPanel?.(item.id);
                        }
                      }}
                      title={item.desc}
                    >
                      <div className="drawer-card-icon-box">
                        <img src={item.iconSrc} alt="" className="drawer-popart-icon" />
                      </div>
                      <div className="drawer-card-text">
                        <span className="drawer-card-title">{item.title}</span>
                        <span className="drawer-card-desc">{item.desc}</span>
                      </div>
                      {isCurrent && <span className="drawer-active-dot" />}
                    </button>
                  );
                })}
              </div>

              <div className="drawer-section-title" style={{ marginTop: 14 }}>BROWSER UTILITIES</div>
              <div className="drawer-cards-list">
                <button
                  type="button"
                  className="sidebar-drawer-card"
                  onClick={() => onOpenDownloads ? onOpenDownloads() : undefined}
                  title="Downloads-Manager (Ctrl+J)"
                >
                  <div className="drawer-card-icon-box">
                    <Download size={16} className="drawer-utility-icon" />
                  </div>
                  <div className="drawer-card-text">
                    <span className="drawer-card-title">Downloads</span>
                    <span className="drawer-card-desc">Aktive und beendete Downloads</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="sidebar-drawer-card"
                  onClick={() => onOpenHistory ? onOpenHistory() : undefined}
                  title="Verlauf & Chronik"
                >
                  <div className="drawer-card-icon-box">
                    <History size={16} className="drawer-utility-icon" />
                  </div>
                  <div className="drawer-card-text">
                    <span className="drawer-card-title">Verlauf</span>
                    <span className="drawer-card-desc">Chronik und besuchte Webseiten</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="sidebar-drawer-card"
                  onClick={() => onOpenExtensions ? onOpenExtensions() : undefined}
                  title="Unified Extension & Skill Hub (Ctrl+Shift+X)"
                >
                  <div className="drawer-card-icon-box">
                    <Puzzle size={16} className="drawer-utility-icon" />
                  </div>
                  <div className="drawer-card-text">
                    <span className="drawer-card-title">Extension & Skill Hub</span>
                    <span className="drawer-card-desc">Chrome MV3 & Nova MCP Skills</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="sidebar-drawer-card"
                  onClick={() => onOpenPermissions ? onOpenPermissions() : undefined}
                  title="Website-Berechtigungen"
                >
                  <div className="drawer-card-icon-box">
                    <ShieldCheck size={16} className="drawer-utility-icon" />
                  </div>
                  <div className="drawer-card-text">
                    <span className="drawer-card-title">Berechtigungen</span>
                    <span className="drawer-card-desc">Kamera, Mikrofon & Seitenrechte</span>
                  </div>
                </button>
              </div>
            </div>
          )}

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

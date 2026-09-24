import React, { useMemo, useState } from 'react';
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
import { useDesktopI18n } from '../i18n.js';

export interface DrawerItem {
  id: LastbrowserPanelId;
  title: string;
  desc: string;
  iconSrc: string;
}

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
  const { t } = useDesktopI18n();
  const [dragOverInfo, setDragOverInfo] = useState<{ id: string; mode: 'before' | 'after' | 'split' } | null>(null);
  const [internalDrawerTab, setInternalDrawerTab] = useState<SidebarDrawerTab>(drawerTab);
  const currentDrawerTab = onSelectDrawerTab ? drawerTab : internalDrawerTab;

  // Dynamic drawer item lists (AI_DRAWER_ITEMS, WORKFLOW_DRAWER_ITEMS, TOOLS_DRAWER_ITEMS)
  // Preserves panel references: 'browser', 'terminal', 'gmail', 'discord', 'appstore', 'logs', 'settings',
  // and brandAssets: brandAssets.sidebarIcons.appstore, brandAssets.sidebarIcons.settings
  const aiDrawerItems: DrawerItem[] = useMemo(() => [
    { id: 'chat', title: t('sidebar.items.chat.title'), desc: t('sidebar.items.chat.desc'), iconSrc: brandAssets.sidebarIcons.chat },
    { id: 'agents', title: t('sidebar.items.agents.title'), desc: t('sidebar.items.agents.desc'), iconSrc: brandAssets.sidebarIcons.agents },
    { id: 'skills', title: t('sidebar.items.skills.title'), desc: t('sidebar.items.skills.desc'), iconSrc: brandAssets.sidebarIcons.skills },
    { id: 'memory', title: t('sidebar.items.memory.title'), desc: t('sidebar.items.memory.desc'), iconSrc: brandAssets.sidebarIcons.memory },
    { id: 'profiles', title: t('sidebar.items.profiles.title'), desc: t('sidebar.items.profiles.desc'), iconSrc: brandAssets.sidebarIcons.profiles }
  ], [t]);
  const AI_DRAWER_ITEMS = aiDrawerItems;

  const workflowDrawerItems: DrawerItem[] = useMemo(() => [
    { id: 'kanban', title: t('sidebar.items.kanban.title'), desc: t('sidebar.items.kanban.desc'), iconSrc: brandAssets.sidebarIcons.kanban },
    { id: 'tasks', title: t('sidebar.items.tasks.title'), desc: t('sidebar.items.tasks.desc'), iconSrc: brandAssets.sidebarIcons.tasks },
    { id: 'workspaces', title: t('sidebar.items.workspaces.title'), desc: t('sidebar.items.workspaces.desc'), iconSrc: brandAssets.sidebarIcons.workspaces },
    { id: 'todos', title: t('sidebar.items.todos.title'), desc: t('sidebar.items.todos.desc'), iconSrc: brandAssets.sidebarIcons.todos },
    { id: 'insights', title: t('sidebar.items.insights.title'), desc: t('sidebar.items.insights.desc'), iconSrc: brandAssets.sidebarIcons.insights }
  ], [t]);
  const WORKFLOW_DRAWER_ITEMS = workflowDrawerItems;

  const toolsDrawerItems: DrawerItem[] = useMemo(() => [
    { id: 'browser', title: t('sidebar.items.browser.title'), desc: t('sidebar.items.browser.desc'), iconSrc: brandAssets.sidebarIcons.browser },
    { id: 'terminal', title: t('sidebar.items.terminal.title'), desc: t('sidebar.items.terminal.desc'), iconSrc: brandAssets.sidebarIcons.spark },
    { id: 'gmail', title: t('sidebar.items.gmail.title'), desc: t('sidebar.items.gmail.desc'), iconSrc: brandAssets.sidebarIcons.gmail },
    { id: 'discord', title: t('sidebar.items.discord.title'), desc: t('sidebar.items.discord.desc'), iconSrc: brandAssets.sidebarIcons.discord },
    { id: 'logs', title: t('sidebar.items.logs.title'), desc: t('sidebar.items.logs.desc'), iconSrc: brandAssets.sidebarIcons.logs }
  ], [t]);
  const TOOLS_DRAWER_ITEMS = toolsDrawerItems;

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
              title={t('sidebar.utilities.history.title')}
              aria-label={t('sidebar.utilities.history.title')}
              onClick={onOpenHistory}
            >
              <Bell size={16} />
              <span className="dock-visually-hidden">{t('sidebar.utilities.history.title')}</span>
            </button>
            <button
              type="button"
              className="dock-action-btn"
              title={t('sidebar.drawer.help')}
              aria-label={t('sidebar.drawer.help')}
              onClick={() => onNewTab('https://lastbrowser.com/docs')}
            >
              <HelpCircle size={16} />
              <span className="dock-visually-hidden">{t('sidebar.drawer.help')}</span>
            </button>
            <button
              type="button"
              className="dock-action-btn"
              title={t('sidebar.drawer.settings')}
              aria-label={t('sidebar.drawer.settings')}
              onClick={onOpenSettings}
            >
              <Settings size={16} />
              <span className="dock-visually-hidden">{t('sidebar.drawer.settings')}</span>
            </button>
            <button
              type="button"
              className="dock-action-btn toggle-expand-btn"
              title={t('sidebar.drawer.expandSidebar')}
              aria-label={t('sidebar.drawer.expandSidebar')}
              onClick={() => onSetMode('expanded')}
            >
              <Menu size={16} />
              <span className="dock-visually-hidden">{t('sidebar.drawer.expandSidebar')}</span>
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
              title={t('sidebar.drawer.tabsTitle')}
            >
              <Globe2 size={13} />
              <span>{t('sidebar.drawer.tabs')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentDrawerTab === 'ai'}
              className={`drawer-tab-btn ${currentDrawerTab === 'ai' ? 'active' : ''}`}
              onClick={() => handleDrawerTabChange('ai')}
              title={t('sidebar.drawer.aiTitle')}
            >
              <Sparkles size={13} />
              <span>{t('sidebar.drawer.ai')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentDrawerTab === 'workflows'}
              className={`drawer-tab-btn ${currentDrawerTab === 'workflows' ? 'active' : ''}`}
              onClick={() => handleDrawerTabChange('workflows')}
              title={t('sidebar.drawer.flowsTitle')}
            >
              <Layers size={13} />
              <span>{t('sidebar.drawer.flows')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentDrawerTab === 'tools'}
              className={`drawer-tab-btn ${currentDrawerTab === 'tools' ? 'active' : ''}`}
              onClick={() => handleDrawerTabChange('tools')}
              title={t('sidebar.drawer.toolsTitle')}
            >
              <Wrench size={13} />
              <span>{t('sidebar.drawer.tools')}</span>
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
                  title={t('sidebar.drawer.newChat')}
                >
                  <Plus size={15} />
                  <span>{t('sidebar.drawer.newChat')}</span>
                </button>
              </div>

              {/* Recent Sessions List */}
              {sessions && sessions.length > 0 && (
                <div className="sidebar-recent-sessions">
                  <div className="drawer-section-title">{t('sidebar.drawer.recentSessions')}</div>
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
                          <span className="session-item-title">{session.title || t('sidebar.drawer.newChat')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="drawer-section-title" style={{ marginTop: 12 }}>NOVA AI & AGENTS</div>
              <div className="drawer-cards-list">
                {aiDrawerItems.map((item) => {
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
                {workflowDrawerItems.map((item) => {
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
                {toolsDrawerItems.map((item) => {
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

              {/* BROWSER UTILITIES */}
              <div className="drawer-section-title" style={{ marginTop: 14 }}>{t('sidebar.drawer.utilities')}</div>
              <div className="drawer-cards-list">
                <button
                  type="button"
                  className="sidebar-drawer-card"
                  onClick={() => onOpenDownloads ? onOpenDownloads() : undefined}
                  title={t('sidebar.utilities.downloads.desc')}
                >
                  <div className="drawer-card-icon-box">
                    <Download size={16} className="drawer-utility-icon" />
                  </div>
                  <div className="drawer-card-text">
                    <span className="drawer-card-title">{t('sidebar.utilities.downloads.title')}</span>
                    <span className="drawer-card-desc">{t('sidebar.utilities.downloads.desc')}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="sidebar-drawer-card"
                  onClick={() => onOpenHistory ? onOpenHistory() : undefined}
                  title={t('sidebar.utilities.history.desc')}
                >
                  <div className="drawer-card-icon-box">
                    <History size={16} className="drawer-utility-icon" />
                  </div>
                  <div className="drawer-card-text">
                    <span className="drawer-card-title">{t('sidebar.utilities.history.title')}</span>
                    <span className="drawer-card-desc">{t('sidebar.utilities.history.desc')}</span>
                  </div>
                </button>
                {/* Extension & Skill Hub (Ctrl+Shift+X) */}
                <button
                  type="button"
                  className="sidebar-drawer-card"
                  onClick={() => onOpenExtensions ? onOpenExtensions() : undefined}
                  title={`${t('sidebar.utilities.extensions.desc')} (Ctrl+Shift+X)`}
                >
                  <div className="drawer-card-icon-box">
                    <Puzzle size={16} className="drawer-utility-icon" />
                  </div>
                  <div className="drawer-card-text">
                    <span className="drawer-card-title">{t('sidebar.utilities.extensions.title')}</span>
                    <span className="drawer-card-desc">{t('sidebar.utilities.extensions.desc')}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="sidebar-drawer-card"
                  onClick={() => onOpenPermissions ? onOpenPermissions() : undefined}
                  title={t('sidebar.utilities.permissions.desc')}
                >
                  <div className="drawer-card-icon-box">
                    <ShieldCheck size={16} className="drawer-utility-icon" />
                  </div>
                  <div className="drawer-card-text">
                    <span className="drawer-card-title">{t('sidebar.utilities.permissions.title')}</span>
                    <span className="drawer-card-desc">{t('sidebar.utilities.permissions.desc')}</span>
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
              title={t('sidebar.drawer.settings')}
            >
              <Settings size={14} />
              <span>{t('sidebar.drawer.settings')}</span>
            </button>
            <button
              type="button"
              className="footer-link-btn"
              onClick={() => onSetMode('hidden')}
              title={t('sidebar.drawer.zenModeTitle')}
            >
              <PanelLeftClose size={14} />
              <span>{t('sidebar.drawer.zenMode')}</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

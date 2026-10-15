import React, { useEffect, useMemo, useRef, useState } from 'react';
import { readStandardChatCompanion, useStandardChatCompanion, writeStandardChatCompanion } from './CompanionPicker.js';
import { companionDefaultNames, personalityAvatar, useCompanionAppearance, type CompanionPersonality } from '../personality-avatar.js';
import { DownloadDockTrigger } from '../NativeDownloads.js';
import {
  Archive,
  Trash2,
  Bell,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
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
  Pin,
  PinOff,
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
import { prepareSnapTabDrag } from '../types/snap-layouts.js';
import { brandAssets } from '../brand.js';
import { PinnedAppGrid, type PinnedApp } from './PinnedAppGrid.js';
import { NovaDock } from './NovaDock.js';
import { type SidebarDrawerTab, type SidebarMode, type ZenExitDefaultMode, usePanelStore } from '../stores/usePanelStore.js';
import type { DesktopSessionSummary } from '../shell-state.js';
import { useDesktopI18n } from '../i18n.js';
import { useSidebarDrawerEdgeScroll } from './useSidebarDrawerEdgeScroll.js';
import './sidebar-drawer-tabs.css';
import './sidebar-sessions.css';
import { useTerminalEnabled } from '../terminal-feature.js';
import { useOptionalAiPolicy } from '../optional-ai-policy.js';
import { shellText } from '../i18n/shell-text.js';

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
  onPinTabAsApp?: (tabId: string) => void;
  onToggleTabMute?: (tabId: string) => void;
  onDragStartTab?: (tabId: string | null) => void;
  onDragEndTab?: () => void;
  onMoveTab?: (sourceId: string, targetId: string) => void;
  onCycleMode: () => void;
  onSetMode: (mode: SidebarMode) => void;
  activeSpacePath: string;
  spaces: SpaceSummary[];
  onSelectSpace: (path: string) => void;
  onCreateSpace?: () => void;
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
  onPinSession?: (session: DesktopSessionSummary) => void;
  onArchiveSession?: (session: DesktopSessionSummary) => void;
  onDeleteSession?: (session: DesktopSessionSummary) => void;
  onDeleteSessions?: (sessions: DesktopSessionSummary[]) => Promise<{ deletedIds: string[]; failedIds: string[] }>;
  sessionScopeKey?: string;
  researchToolbar?: React.ReactNode;
  /** Callback when a new session is requested */
  onCreateSession?: () => void;
  /** Active split tabs (up to 4) */
  splitTabIds?: string[];
  /** Callback to add tab to splitscreen */
  onAddSplitTab?: (tabId: string, baseTabId?: string) => void;
  /** Callback to remove tab from splitscreen */
  onRemoveSplitTab?: (tabId: string) => void;
  /** Callback when revealer is clicked/hovered in Zen mode to show floating sidebar */
  onRevealZen?: () => void;
  /** Whether this sidebar instance is rendered inside a floating overlay */
  isFloatingOverlay?: boolean;
  /** Callback to close the floating overlay */
  onCloseOverlay?: () => void;
  /** Callback to dock the sidebar and exit Zen mode */
  onDock?: () => void;
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
  onPinTabAsApp,
  onToggleTabMute,
  onDragStartTab,
  onDragEndTab,
  onMoveTab,
  onCycleMode,
  onSetMode,
  activeSpacePath,
  spaces,
  onSelectSpace,
  onCreateSpace,
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
  onPinSession,
  onArchiveSession,
  onDeleteSession,
  onDeleteSessions,
  sessionScopeKey = '',
  researchToolbar,
  onCreateSession,
  splitTabIds = [],
  onAddSplitTab,
  onRemoveSplitTab,
  onRevealZen,
  isFloatingOverlay = false,
  onCloseOverlay,
  onDock
}: SidekickSidebarProps): React.JSX.Element {
  const { t, locale } = useDesktopI18n();
  const terminalEnabled = useTerminalEnabled();
  const { policy, loaded: optionalFeaturesLoaded } = useOptionalAiPolicy(activeSpacePath);
  const [deleteArm, setDeleteArm] = useState<{ sessionId: string; scope: string; expiresAt: number } | null>(null);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const selectionAnchor = useRef<string | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const selectionScope = `${sessionScopeKey}::${activeSpacePath}`;
  const currentSelectionScope = useRef(selectionScope);
  currentSelectionScope.current = selectionScope;
  const recentChatKey = sessions.filter(session => !session.archived).sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))).slice(0, 5).map(session => session.session_id).join('|');
  useEffect(() => { setSelectedChatIds([]); selectionAnchor.current = null; setDeleteArm(null); setBatchDeleting(false); }, [selectionScope]);
  useEffect(() => {
    const available = new Set(recentChatKey.split('|'));
    setSelectedChatIds(current => current.filter(id => available.has(id)));
    if (selectionAnchor.current && !available.has(selectionAnchor.current)) selectionAnchor.current = null;
    setDeleteArm(null);
  }, [recentChatKey]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedChatIds([]); setDeleteArm(null); selectionAnchor.current = null; } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const deleteScope = `${sessionScopeKey}::${activeSpacePath}::${activeSessionId || ''}::${activePanel}`;
  useEffect(() => { setDeleteArm(null); }, [deleteScope, drawerTab, mode]);
  useEffect(() => {
    if (!deleteArm) return;
    const timer = window.setTimeout(() => setDeleteArm(null), Math.max(0, deleteArm.expiresAt - Date.now()));
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setDeleteArm(null); };
    window.addEventListener('keydown', escape);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', escape); };
  }, [deleteArm]);
  const deleteConfirmationLabel = locale === 'de' ? 'Sicher? Zum Löschen erneut klicken.' : 'Sure? Click again to delete.';
  function requestSessionDelete(event: React.MouseEvent<HTMLButtonElement>, session: DesktopSessionSummary) {
    event.preventDefault(); event.stopPropagation();
    if (deleteArm?.sessionId === session.session_id && deleteArm.scope === deleteScope && Date.now() < deleteArm.expiresAt) {
      setDeleteArm(null);
      onDeleteSession?.(session);
    } else setDeleteArm({ sessionId: session.session_id, scope: deleteScope, expiresAt: Date.now() + 5000 });
  }
  function selectChat(event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>, session: DesktopSessionSummary) {
    event.stopPropagation();
    if (batchDeleting) return;
    setDeleteArm(null);
    if (event.shiftKey) {
      const ids = recentSessions.map(item => item.session_id);
      const index = ids.indexOf(session.session_id);
      const anchor = Math.max(0, ids.indexOf(selectionAnchor.current || session.session_id));
      setSelectedChatIds(ids.slice(Math.min(index, anchor), Math.max(index, anchor) + 1));
      if (!selectionAnchor.current) selectionAnchor.current = session.session_id;
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedChatIds(current => current.includes(session.session_id) ? current.filter(id => id !== session.session_id) : [...current, session.session_id]);
      selectionAnchor.current = session.session_id;
    } else {
      setSelectedChatIds([]); selectionAnchor.current = session.session_id;
      onSelectSession?.(session.session_id);
    }
  }
  async function deleteSelectedChats(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation();
    if (!onDeleteSessions || batchDeleting || !selectedChatIds.length) return;
    if (deleteArm?.sessionId !== '__batch' || deleteArm.scope !== deleteScope || Date.now() >= deleteArm.expiresAt) {
      setDeleteArm({ sessionId: '__batch', scope: deleteScope, expiresAt: Date.now() + 5000 }); return;
    }
    const scope = selectionScope;
    setDeleteArm(null); setBatchDeleting(true);
    try {
      const result = await onDeleteSessions(recentSessions.filter(session => selectedChatIds.includes(session.session_id)));
      if (currentSelectionScope.current === scope) setSelectedChatIds(result.failedIds);
    } finally { if (currentSelectionScope.current === scope) setBatchDeleting(false); }
  }
  const archiveLabel = ({ de: 'Archivieren', en: 'Archive', es: 'Archivar', fr: 'Archiver', it: 'Archivia', 'pt-BR': 'Arquivar', ru: 'Архивировать', ja: 'アーカイブ' })[locale];
  const recentSessions = sessions.filter(session => !session.archived)
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))).slice(0, 5);
  const downloadsOpen = usePanelStore((state) => state.downloadsOpen);
  const [dragOverInfo, setDragOverInfo] = useState<{ id: string; mode: 'before' | 'after' | 'split' } | null>(null);
  const [internalDrawerTab, setInternalDrawerTab] = useState<SidebarDrawerTab>(drawerTab);
  const requestedDrawerTab = onSelectDrawerTab ? drawerTab : internalDrawerTab;
  const currentDrawerTab = requestedDrawerTab === 'workflows' ? 'tools' : requestedDrawerTab;
  useEffect(() => {
    if (requestedDrawerTab !== 'workflows') return;
    if (onSelectDrawerTab) onSelectDrawerTab('tools'); else setInternalDrawerTab('tools');
  }, [requestedDrawerTab, onSelectDrawerTab]);
  const drawerTabsRef=useSidebarDrawerEdgeScroll<HTMLDivElement>();
  const drawerTabOrder: SidebarDrawerTab[] = ['tabs', 'ai', 'tools'];
  const drawerTabIndex = drawerTabOrder.indexOf(currentDrawerTab);
  useEffect(() => {
    const element = drawerTabsRef.current;
    const selected = element?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!element || !selected) return;
    const left = selected.offsetLeft - element.offsetLeft;
    const right = left + selected.offsetWidth;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (left < element.scrollLeft || right > element.scrollLeft + element.clientWidth) {
      element.scrollTo({ left: Math.max(0, left - (element.clientWidth - selected.offsetWidth) / 2), behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [currentDrawerTab, mode, locale, drawerTabsRef]);
  const stepDrawerTab = (direction: -1 | 1) => {
    const next = drawerTabOrder[drawerTabIndex + direction];
    if (next) handleDrawerTabChange(next);
  };
  const dockSettings = usePanelStore((s) => s.dockSettings);
  const [spacePickerOpen, setSpacePickerOpen] = useState(false);
  const spacePickerRef = useRef<HTMLDivElement | null>(null);
  const [personalityOpen, setPersonalityOpen] = useState(false);
  const personalityRef = useRef<HTMLDivElement | null>(null);
  const expandedInnerRef = useRef<HTMLDivElement | null>(null);
  const drawerTabsShellRef = useRef<HTMLDivElement | null>(null);
  const [personalityTop, setPersonalityTop] = useState(0);
  const companion = useCompanionAppearance();
  const savedCompanion = readStandardChatCompanion();
  const standardCompanion = useStandardChatCompanion();
  const activeChatName = standardCompanion.stored ? standardCompanion.botName : botName;
  const activePersonality = standardCompanion.stored ? standardCompanion.personality : savedCompanion.personality;
  useEffect(() => {
    if (!personalityOpen) return undefined;
    const place = () => {
      const shell = drawerTabsShellRef.current;
      const host = expandedInnerRef.current;
      if (!shell || !host) return;
      setPersonalityTop(shell.getBoundingClientRect().bottom - host.getBoundingClientRect().top);
    };
    place();
    const outside = (event: PointerEvent) => { if (!personalityRef.current?.contains(event.target as Node)) setPersonalityOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPersonalityOpen(false); };
    window.addEventListener('resize', place);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [personalityOpen]);
  const choosePersonality = (personality: CompanionPersonality) => {
    writeStandardChatCompanion(personality, companionDefaultNames[personality]);
    setPersonalityOpen(false);
  };

  useEffect(() => {
    if (!spacePickerOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (spacePickerRef.current && !spacePickerRef.current.contains(event.target as Node)) {
        setSpacePickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [spacePickerOpen]);

  // Dynamic drawer item lists (AI_DRAWER_ITEMS, WORKFLOW_DRAWER_ITEMS, TOOLS_DRAWER_ITEMS)
  // Preserves panel references: 'browser', 'terminal', 'gmail', 'discord', 'appstore', 'logs', 'settings',
  // and brandAssets: brandAssets.sidebarIcons.appstore, brandAssets.sidebarIcons.settings
  const aiDrawerItems: DrawerItem[] = useMemo(() => [
    { id: 'chat', title: `${activeChatName} Chat`, desc: t('sidebar.items.chat.desc'), iconSrc: brandAssets.sidebarIcons.chat },
    ...(optionalFeaturesLoaded && policy.assistants_enabled ? [{ id: 'agents' as const, title: locale === 'de' ? 'Assistenten' : 'Assistants', desc: locale === 'de' ? 'Zusätzliche Helfer und Aufgaben' : 'Additional helpers and tasks', iconSrc: brandAssets.sidebarIcons.agents }] : []),
    ...(optionalFeaturesLoaded && policy.enabled ? [{ id: 'memory' as const, title: locale === 'de' ? 'Gedächtnis & Wissen' : 'Memory & Knowledge', desc: locale === 'de' ? 'Informationen ansehen und kontrollieren' : 'Review and control saved information', iconSrc: brandAssets.sidebarIcons.memory }] : [])
  ], [t, activeChatName, locale, optionalFeaturesLoaded, policy.assistants_enabled, policy.enabled]);
  const AI_DRAWER_ITEMS = aiDrawerItems;

  const toolsDrawerItems: DrawerItem[] = useMemo(() => [
    ...(optionalFeaturesLoaded && policy.tasks_enabled ? [{ id: 'task-center' as const, title: locale === 'de' ? 'Aufgaben · Beta' : 'Tasks · Beta', desc: locale === 'de' ? 'Funktioniert derzeit nicht' : 'Not working', iconSrc: brandAssets.sidebarIcons.tasks }] : []),
    { id: 'insights', title: t('sidebar.items.insights.title'), desc: t('sidebar.items.insights.desc'), iconSrc: brandAssets.sidebarIcons.insights },
    ...(optionalFeaturesLoaded && policy.gmail_ai_enabled ? [{ id: 'gmail' as const, title: 'Gmail AI · Beta', desc: locale === 'de' ? 'Ungetestet' : 'Untested', iconSrc: brandAssets.sidebarIcons.spark }] : []),
    ...(optionalFeaturesLoaded && policy.discord_agents_enabled ? [{ id: 'discord' as const, title: 'Discord Agents · Beta', desc: locale === 'de' ? 'Ungetestet' : 'Untested', iconSrc: brandAssets.sidebarIcons.spark }] : []),
    ...(terminalEnabled ? [{ id: 'terminal' as const, title: t('sidebar.items.terminal.title'), desc: t('sidebar.items.terminal.desc'), iconSrc: brandAssets.sidebarIcons.spark }] : []),
    { id: 'logs', title: t('sidebar.items.logs.title'), desc: t('sidebar.items.logs.desc'), iconSrc: brandAssets.sidebarIcons.logs }
  ], [t, terminalEnabled, optionalFeaturesLoaded, policy.gmail_ai_enabled, policy.discord_agents_enabled, policy.tasks_enabled, locale]);
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
        title={`${t('sidebar.drawer.expandSidebar')} (Ctrl+B)`}
        onClick={() => {
          if (onRevealZen) onRevealZen();
          else onSetMode(zenExitDefaultMode);
        }}
        onMouseEnter={() => {
          onRevealZen?.();
        }}
      >
        <div className="revealer-indicator" />
      </div>
    );
  }

  const activeSpace = spaces.find((s) => s.path === activeSpacePath);
  const spaceLabel = activeSpace ? spaceDisplayName(activeSpace) : t('sidebar.space.workspace');
  const effectiveDockPos = isFloatingOverlay ? 'left' : dockSettings.position;
  // The sidebar renders the inline dock only when it actually hosts it (left
  // position or the zen floating overlay). For right/top/bottom/floating the
  // App shell renders NovaDock outside this <aside> (goal.md Paket 5).
  const sidebarHostsDock = isFloatingOverlay || dockSettings.position === 'left';

  return (
    <aside className={`sidekick-sidebar ${mode} dock-pos-${effectiveDockPos} ${researchToolbar ? 'has-research-toolbar' : ''} ${isFloatingOverlay ? 'zen-floating-sidebar' : ''}`}>
      {researchToolbar && <div className="sidebar-research-host">
        {mode === 'slim' ? <button type="button" className="sidebar-research-reveal" title="Nova Research" aria-label={shellText(locale, "Nova Research öffnen", "Open Nova Research")}
          onClick={() => {
            onSetMode('expanded');
            requestAnimationFrame(() => requestAnimationFrame(() => {
              const details = document.querySelector<HTMLDetailsElement>('.sidekick-sidebar.expanded [data-nova-research-sidebar]');
              if (details) { details.open = true; details.querySelector<HTMLElement>('summary')?.focus(); }
            }));
          }}><Sparkles size={17} /></button> : researchToolbar}
      </div>}
      {mode === 'slim' ? (
        sidebarHostsDock ? (
          <div className="sidekick-dock-inner dock-top-brand dock-popart-avatar dock-quick-shortcuts dock-shortcut-btn dock-bottom-actions">
            {/* Nova Dock provides Apple-style fisheye magnification, label reveal animations and PinnedAppGrid integration */}
            <NovaDock
              botName={botName}
              activePanel={activePanel}
              activeTabUrl={activeTabUrl}
              openTabUrls={openTabUrls}
              onSelectPanel={onSelectPanel}
              onOpenApp={onOpenApp}
              onAddPinnedApp={onAddPinnedApp}
              onEditPinnedApp={onEditPinnedApp}
              onOpenHistory={onOpenHistory}
              onOpenSettings={onOpenSettings}
              onNewTab={onNewTab}
              onExpandSidebar={() => onSetMode('expanded')}
              onEnterZenMode={() => {
                if (isFloatingOverlay && onCloseOverlay) onCloseOverlay();
                else onSetMode('hidden');
              }}
              forcedPosition={isFloatingOverlay ? 'left' : undefined}
              spacePath={activeSpacePath}
              draggedTabId={draggedTabId}
              tabs={tabs}
              onPinTabAsApp={onPinTabAsApp}
            />
            {onOpenDownloads && <DownloadDockTrigger anchor="sidebar" open={downloadsOpen} onOpen={onOpenDownloads} className="download-sidebar-slim" />}
          </div>
        ) : null
      ) : (
        <div className="sidekick-expanded-inner" ref={expandedInnerRef} style={{ position: 'relative' }}>
          {/* Top Workspace Picker Header */}
          <div className="expanded-top-bar" ref={spacePickerRef} style={{ position: 'relative' }}>
            <div
              className={`expanded-workspace-pill ${spacePickerOpen ? 'is-open' : ''}`}
              role="button"
              tabIndex={0}
              aria-haspopup="true"
              aria-expanded={spacePickerOpen}
              title={t('sidebar.space.switch')}
              onClick={() => setSpacePickerOpen((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSpacePickerOpen((prev) => !prev);
                }
              }}
            >
              <span className="workspace-badge-letter">
                {spaceLabel.charAt(0).toUpperCase()}
              </span>
              <span className="workspace-badge-name">{spaceLabel}</span>
              <ChevronDown size={14} className={`workspace-chevron ${spacePickerOpen ? 'rotated' : ''}`} />
            </div>

            {spacePickerOpen && (
              <div className="workspace-picker-flyout" role="menu">
                <div className="workspace-picker-header">
                  <span>{t('sidebar.space.spaces')}</span>
                </div>
                <div className="workspace-picker-list">
                  {spaces.map((s) => {
                    const isActive = s.path === activeSpacePath;
                    const name = spaceDisplayName(s);
                    return (
                      <button
                        key={s.path}
                        type="button"
                        className={`workspace-picker-item ${isActive ? 'active' : ''}`}
                        role="menuitem"
                        onClick={() => {
                          onSelectSpace?.(s.path);
                          setSpacePickerOpen(false);
                        }}
                      >
                        <span className="workspace-item-letter">{name.charAt(0).toUpperCase()}</span>
                        <span className="workspace-item-name">{name}</span>
                        {isActive && <Check size={13} className="workspace-active-check" />}
                      </button>
                    );
                  })}
                </div>
                <div className="workspace-picker-footer">
                  <button
                    type="button"
                    className="workspace-create-btn"
                    onClick={() => {
                      setSpacePickerOpen(false);
                      onCreateSpace?.();
                    }}
                  >
                    <Plus size={13} />
                    <span>{t('sidebar.space.new')}</span>
                  </button>
                </div>
              </div>
            )}

            {isFloatingOverlay && onDock && (
              <button
                type="button"
                className="sidebar-dock-pin-btn"
                title={t('sidebar.zen.dock')}
                onClick={onDock}
              >
                <Pin size={14} />
              </button>
            )}

            <button
              type="button"
              className="sidebar-collapse-icon-btn"
              title={`${t('sidebar.drawer.toggleSidebar')} (Ctrl+B)`}
              onClick={() => onSetMode('slim')}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          {/* Variante B: Segmented Multi-Tier Drawer Tabs */}
          <div className="sidebar-drawer-tabs-shell" ref={drawerTabsShellRef}>
            <button type="button" className="sidebar-drawer-scroll-control" aria-label={`${t('sidebar.drawer.sections')}: ${t('common.back')}`} title={`${t('sidebar.drawer.sections')}: ${t('common.back')}`} disabled={drawerTabIndex <= 0} onClick={() => stepDrawerTab(-1)}>
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
          <div ref={drawerTabsRef} className="sidebar-drawer-tabs" role="tablist" aria-label={t('sidebar.drawer.sections')}>
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
              onClick={() => { handleDrawerTabChange('ai'); setPersonalityOpen(true); }}
              title={`${activeChatName} AI`}
            >
              <Sparkles size={13} />
              <span>{t('sidebar.drawer.ai')}</span>
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
            <button type="button" className="sidebar-drawer-scroll-control" aria-label={`${t('sidebar.drawer.sections')}: ${t('common.next')}`} title={`${t('sidebar.drawer.sections')}: ${t('common.next')}`} disabled={drawerTabIndex >= drawerTabOrder.length - 1} onClick={() => stepDrawerTab(1)}>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>

          {/* Drawer Body depending on active drawer tab */}
          {currentDrawerTab === 'tabs' && (
            <>
              <button
                type="button"
                className="vertical-new-tab-btn vertical-new-tab-btn-prominent"
                onClick={() => onNewTab()}
                title={`${t('sidebar.tabs.new')} (Ctrl+T)`}
                aria-label={`${t('sidebar.tabs.new')} (Ctrl+T)`}
              >
                <Plus size={15} />
                <span>{t('sidebar.tabs.new')}</span>
                <kbd className="shortcut-hint">Ctrl+T</kbd>
              </button>
              {/* Zen Pinned Apps Raster */}
              <div className="expanded-pinned-raster">
                <PinnedAppGrid
                  layout="grid"
                  spacePath={activeSpacePath}
                  activeTabUrl={activeTabUrl}
                  openTabUrls={openTabUrls}
                  onOpenApp={onOpenApp}
                  onAddApp={onAddPinnedApp}
                  onEditApp={onEditPinnedApp}
                  draggedTabId={draggedTabId}
                  tabs={tabs}
                  onPinTabAsApp={onPinTabAsApp}
                />
              </div>

              {/* Vertical Tabs List */}
              <div className="expanded-tabs-section">
                <div className="expanded-section-header">
                  <span className="section-title">{t('sidebar.tabs.header')}</span>
                  <div className="expanded-section-actions">
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
                        className={`vertical-tab-item ${isActive ? 'active' : ''} ${tab.pinned ? 'pinned' : ''} ${tab.incognito ? 'incognito' : ''} ${tab.isDiscarded ? 'discarded' : ''} ${draggedTabId === tab.id ? 'dragging' : ''} ${dragMode ? `drag-over-${dragMode}` : ''} ${splitTabIds.includes(tab.id) ? 'is-in-snap-group' : ''}`}
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
                        onDragStart={(event) => {
                          prepareSnapTabDrag(event.dataTransfer, tab.id);
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
                            <EyeOff size={10} className="vtab-incognito-badge" aria-label={t('sidebar.tabs.private')} />
                          )}
                          {tab.isDiscarded && (
                            <Moon size={10} className="vtab-discarded-badge" aria-label={t('sidebar.tabs.sleeping')} />
                          )}
                        </div>

                        <span className="vtab-title" title={tab.title}>
                          {tab.title}
                        </span>
                        <button
                          type="button"
                          className={`vertical-tab-pin-btn ${tab.pinned ? 'pinned' : ''}`}
                          title={t(tab.pinned ? 'sidebar.tabs.unpin' : 'sidebar.tabs.pin')}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPinTab?.(tab.id);
                          }}
                        >
                          {tab.pinned ? <PinOff size={18} /> : <Pin size={18} />}
                        </button>

                        {splitTabIds.includes(tab.id) && (
                          <span className="vtab-snap-badge" title={t('sidebar.tabs.snap')}>
                            Snap
                          </span>
                        )}

                        {dragMode === 'split' && (
                          <div className="vtab-split-drop-badge">
                            <Columns2 size={11} />
                            <span>{t('sidebar.tabs.split')}</span>
                          </div>
                        )}

                        {/* Audio Mute button if playing or muted */}
                        {(tab.isPlayingAudio || tab.isMuted) && (
                          <button
                            type="button"
                            className={`vtab-audio-btn ${tab.isMuted ? 'is-muted' : 'is-playing'}`}
                          title={t(tab.isMuted ? 'sidebar.tabs.unmute' : 'sidebar.tabs.mute', { title: tab.title })}
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
                            title={t(splitTabIds.includes(tab.id) ? 'sidebar.tabs.endSplit' : 'sidebar.tabs.openSplit')}
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
                          title={t('sidebar.tabs.close')}
                          aria-label={t('sidebar.tabs.close')}
                          onKeyDown={(event) => event.stopPropagation()}
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
                </div>
              </div>
            </>
          )}

          {/* AI Drawer Items */}
          {currentDrawerTab === 'ai' && (
            <div className="sidebar-drawer-content" role="region" aria-label={t('sidebar.drawer.aiRegion')}>
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
              {recentSessions.length > 0 && (
                <div className="sidebar-recent-sessions">
                  <div className="drawer-section-title">{t('sidebar.drawer.recentSessions')}</div>
                  {selectedChatIds.length > 0 && <div className="sidebar-chat-selection" onPointerLeave={() => setDeleteArm(current => current?.sessionId === '__batch' ? null : current)}>
                    <span role="status">{deleteArm?.sessionId === '__batch'
                      ? (locale === 'de' ? `${selectedChatIds.length} Chats löschen?` : `Delete ${selectedChatIds.length} chats?`)
                      : `${selectedChatIds.length} ${locale === 'de' ? 'markiert' : 'selected'}`}</span>
                    {onDeleteSessions && <button type="button" className={`sidebar-session-action is-delete ${deleteArm?.sessionId === '__batch' ? 'is-armed' : ''}`}
                      disabled={batchDeleting} title={deleteArm?.sessionId === '__batch' ? deleteConfirmationLabel : (locale === 'de' ? 'Markierte Chats löschen' : 'Delete selected chats')}
                      aria-label={deleteArm?.sessionId === '__batch' ? deleteConfirmationLabel : (locale === 'de' ? 'Markierte Chats löschen' : 'Delete selected chats')}
                      onClick={event => void deleteSelectedChats(event)}>{deleteArm?.sessionId === '__batch' ? <span aria-hidden="true">?</span> : <Trash2 size={13} />}</button>}
                  </div>}
                  <div className="sidebar-session-list">
                    {recentSessions.map((session) => {
                      const isActive = session.session_id === activeSessionId && activePanel === 'chat';
                      const deleteArmed = deleteArm?.sessionId === session.session_id && deleteArm.scope === deleteScope;
                      return (
                        <div key={session.session_id} className={`sidebar-session-item ${isActive ? 'is-active' : ''} ${selectedChatIds.includes(session.session_id) ? 'is-selected' : ''}`}
                          onPointerLeave={() => setDeleteArm(current => current?.sessionId === session.session_id ? null : current)}>
                          <button type="button" className="sidebar-session-open"
                            aria-pressed={selectedChatIds.includes(session.session_id)} disabled={batchDeleting}
                            onClick={event => selectChat(event, session)}
                            onKeyDown={event => {
                              if ((event.key === ' ' || event.key === 'Enter') && (event.shiftKey || event.ctrlKey || event.metaKey)) {
                                event.preventDefault(); selectChat(event, session);
                              }
                            }}
                            title={session.title || t('sidebar.drawer.newChat')}>
                            {session.pinned ? <Pin size={12} className="session-item-icon" /> : <Sparkles size={12} className="session-item-icon" />}
                            <span className="session-item-title" role={deleteArmed ? 'status' : undefined}>{deleteArmed ? (locale === 'de' ? 'Sicher?' : 'Sure?') : session.title || t('sidebar.drawer.newChat')}</span>
                          </button>
                          <div className="sidebar-session-actions">
                            {onPinSession && <button type="button" className="sidebar-session-action"
                              title={t(session.pinned ? 'sidebar.tabs.unpin' : 'sidebar.tabs.pin')}
                              aria-label={t(session.pinned ? 'sidebar.tabs.unpin' : 'sidebar.tabs.pin')}
                              onClick={event => { event.stopPropagation(); setDeleteArm(null); onPinSession(session); }}>{session.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>}
                            {onArchiveSession && <button type="button" className="sidebar-session-action" title={archiveLabel}
                              aria-label={archiveLabel} onClick={event => { event.stopPropagation(); setDeleteArm(null); onArchiveSession(session); }}><Archive size={13} /></button>}
                            {onDeleteSession && <button type="button" className={`sidebar-session-action is-delete ${deleteArmed ? 'is-armed' : ''}`}
                              title={deleteArmed ? deleteConfirmationLabel : t('common.delete')}
                              aria-label={deleteArmed ? deleteConfirmationLabel : t('common.delete')}
                              onClick={event => requestSessionDelete(event, session)}>{deleteArmed ? <span aria-hidden="true">?</span> : <Trash2 size={13} />}</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="drawer-section-title" style={{ marginTop: 12 }}>{activeChatName} AI</div>
              <div className="drawer-cards-list">
                {aiDrawerItems.map((item) => {
                  const isCurrent = activePanel === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`sidebar-drawer-card ${isCurrent ? 'is-active' : ''}`}
                      onClick={() => { onSelectPanel?.(item.id); if (item.id === 'chat') setPersonalityOpen(true); }}
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
            <div className="sidebar-drawer-content" role="region" aria-label={t('sidebar.drawer.toolsRegion')}>
              <div className="drawer-section-title">{t('sidebar.drawer.toolsHeading')}</div>
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
            {onOpenDownloads && <DownloadDockTrigger anchor="sidebar" open={downloadsOpen} onOpen={onOpenDownloads} className="footer-link-btn"><span>{t('sidebar.downloads')}</span></DownloadDockTrigger>}
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
          {personalityOpen && <div ref={personalityRef} className="sidebar-personality-flyout" role="dialog" aria-label={t('sidebar.companion.menu')} style={{ position: 'absolute', left: 0, right: 0, top: personalityTop, bottom: 0, zIndex: 30, overflow: 'auto', background: 'var(--bg-primary, #101522)', borderInlineStart: '1px solid var(--border-color)', padding: 12, display: 'grid', alignContent: 'start', gap: 8 }}>
            <strong>{t('sidebar.companion.menu')}</strong>
            {(Object.keys(companionDefaultNames) as CompanionPersonality[]).map(personality => {
              const selected = activePersonality === personality;
              const description = {
                nova: 'sidebar.companion.nova',
                analytical: 'sidebar.companion.analytical',
                developer: 'sidebar.companion.developer',
                creative: 'sidebar.companion.creative',
                mentor: 'sidebar.companion.mentor'
              } as const;
              return <button key={personality} type="button" aria-pressed={selected} onClick={() => choosePersonality(personality)} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 10, alignItems: 'center', textAlign: 'left', padding: 8, borderRadius: 10, border: selected ? '2px solid var(--accent-primary, #38bdf8)' : '2px solid transparent', background: 'var(--bg-hover, rgba(255,255,255,.04))', color: 'inherit', cursor: 'pointer' }}>
                <img src={personalityAvatar(personality)} alt="" width={52} height={52} style={{ objectFit: 'contain' }} />
                <span><strong>{companionDefaultNames[personality]}</strong><span style={{ display: 'block', fontSize: 12, lineHeight: 1.4 }}>{t(description[personality])}</span></span>
              </button>;
            })}
          </div>}
        </div>
      )}
    </aside>
  );
}

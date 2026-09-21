import React, { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Code2,
  Columns3,
  Cpu,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Globe2,
  HardDrive,
  Eye,
  EyeOff,
  LayoutGrid,
  ListChecks,
  Loader2,
  LogIn,
  Mail,
  MessageSquare,
  Minus,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  StopCircle,
  Terminal,
  Trash2,
  UserCircle,
  Users,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { hideWebviewScrollbars } from './browser-view.js';
import {
  bookmarkFromTab,
  isBookmarkableUrl,
  isBookmarked,
  loadBookmarks,
  removeBookmark,
  saveBookmarks,
  upsertBookmark
} from './bookmarks.js';
import type { BrowserBookmark } from './bookmarks.js';
import { mergeBookmarks } from './bookmark-io.js';
import {
  BrowserTab,
  browserStartUrl,
  createInitialTab,
  isAiBrowserHomeUrl,
  loadSearchEngineId,
  rememberClosedTab,
  reorderTabs,
  saveSearchEngineId,
  searchEngines,
  takeLastClosedTab,
  normalizeNavigationInput,
  updateTabTitle,
  updateTabUrl,
  updateTabFavicon,
  updateTabLoading,
  updateTabMediaPlaying,
  updateTabMuted,
  togglePinnedTab,
  type ClosedTab
} from './tabs.js';
import { brandAssets } from './brand.js';
import { categoryLabels, modelNote, providerPresentation, tierLabels } from './provider-presentation.js';
import {
  addProfile,
  loadActiveProfileId,
  loadProfiles,
  profileById,
  profilePartition,
  removeProfile,
  renameProfile,
  saveActiveProfileId,
  saveProfiles,
  type BrowserProfile
} from './profiles.js';
import {
  loadProfileTabs,
  loadSessionSnapshot,
  removeProfileTabs,
  saveProfileTabs,
  saveSessionSnapshot
} from './tab-sessions.js';
import {
  loadVisitedSites,
  recordVisit,
  removeVisit,
  saveVisitedSites,
  startPageVisitLimit,
  type BrowserVisit
} from './history.js';
import {
  SidekickActionId,
  buildSidekickPrompt,
  collectBrowserContext,
  lastAssistantText,
  resolveConfiguredModel,
  sidekickActionLabels
} from './bridge.js';
import {
  OnboardingStatus,
  SetupState,
  canSubmitCloudSetup,
  cloudProviderOptions,
  defaultSetupState,
  firstRunStatus,
  isFirstRunRequired,
  modelsForProvider,
  normalizeSetupState
} from './setup-state.js';
import {
  ChatRunState,
  DesktopChatMessage,
  DesktopSessionDetail,
  DesktopSessionSummary,
  LastbrowserPanelId,
  ProjectSummary,
  sessionTitle,
  shortSessionId,
  SpaceSummary,
  spaceDisplayName,
  WorkspaceFilePreview,
  WorkspaceTreeEntry,
  lastbrowserPanels,
  isInstalledSidebarApp,
  leftSidebarCollapsedStorageKey,
  loadInstalledSidebarApps,
  loadBooleanPreference,
  loadNumericPreference,
  loadInitialPanel,
  saveActivePanel,
  saveBooleanPreference,
  saveNumericPreference,
  saveInstalledSidebarApps,
  contextSidebarWidthStorageKey,
  workspacePanelWidthStorageKey,
  workspacePanelCollapsedStorageKey
} from './shell-state.js';
import { canCallSidekickApi } from './runtime-readiness.js';
import { describeChatContent, partitionChatMessages } from './chat-display.js';
import { AdvancedWebUiTools } from './panels/AdvancedWebUiTools.js';
import { NativeBrowserStartPage } from './panels/NativeBrowserStartPage.js';
import { NativeAiBrowserMain } from './panels/NativeAiBrowserMain.js';
import {
  NativeAgentsMain,
  NativeAppstoreMain,
  NativeDiscordMain,
  NativeGmailMain,
  NativeInsightsMain,
  NativeLogsMain,
  NativeMemoryMain,
  NativeProfilesMain,
  NativeSettingsMain,
  NativeSkillsMain,
  jsonPreview
} from './panels/NativeRestPanels.js';
import { NativeTasksMain, NativeKanbanMain, NativeTodosMain } from './panels/TaskPanels.js';
import { NativeTerminalMain } from './panels/NativeTerminalMain.js';
import { ControlCenter } from './NativeControlCenter.js';
import { ApprovalPollManager, ApprovalCard } from './NativeApproval.js';
import { DownloadsPanel } from './NativeDownloads.js';
import { HistoryPanel } from './NativeHistory.js';
import { PermissionsPanel, SitePermissionButton } from './NativePermissions.js';
import { ContextUsageIndicator } from './NativeContextUsage.js';
import { QueueIndicator, CompressButton, useChatQueue } from './NativeCompressQueue.js';
import { RichTextRenderer } from './NativeRichText.js';
import { DesktopI18nProvider, useDesktopI18n, desktopLocaleIds, desktopLocaleNames } from './i18n.js';
import { FirstRunSetupPane, type SetupForm } from './components/FirstRunSetupPane.js';
import { NativeChatMain, type ComposerMode } from './panels/NativeChatMain.js';
import {
  BookmarkBar,
  UpdatePill,
  ProfileSwitcher,
  SpaceSelector,
  WindowTitlebar,
  ModernTitlebar,
  WindowControls,
  useWindowDrag
} from './components/HeaderComponents.js';
import { SidekickSidebar } from './components/SidekickSidebar.js';
import { CopilotSplitView } from './components/CopilotSplitView.js';
import { WorkspacePanel } from './panels/WorkspacePanel.js';
import { ShellRail } from './components/ShellRail.js';
import { ContextSidebar, panelContextItems, type SidekickMessage } from './components/ContextSidebar.js';
import { AdblockShield } from './components/AdblockShield.js';
import { AddressBar } from './components/AddressBar.js';
import { useTabStore } from './stores/useTabStore.js';
import { usePanelStore } from './stores/usePanelStore.js';
import { CommandPalette } from './components/CommandPalette.js';
import { LiveAutomationBanner } from './components/LiveAutomationBanner.js';
import { detectPageCategory, getQuickActionChips, executeQuickAction, type QuickActionChip } from './quick-actions.js';
import { parseNaturalLanguageBrowserCommand, executeBrowserAction } from './browser-agent-tools.js';
import './styles.css';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
type UpdateStatus = Awaited<ReturnType<typeof window.lastbrowser.updates.status>>;
type CronJobSummary = Awaited<ReturnType<typeof window.lastbrowser.sidekick.listCrons>>['jobs'][number];
type KanbanBoardResponse = Awaited<ReturnType<typeof window.lastbrowser.sidekick.getKanbanBoard>>;
type KanbanColumnSummary = NonNullable<KanbanBoardResponse['columns']>[number];
type KanbanTaskSummary = NonNullable<KanbanColumnSummary['tasks']>[number];
type DesktopSettingsRecord = Record<string, unknown>;
const desktopSettingsStorageKey = 'lastbrowser.desktopSettings.v1';

function isRecord(value: unknown): value is DesktopSettingsRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractDesktopSettings(payload: unknown): DesktopSettingsRecord {
  if (!isRecord(payload)) return {};
  if (isRecord(payload.settings)) return payload.settings;
  return payload;
}

function loadDesktopSettingsFromStorage(): DesktopSettingsRecord | null {
  try {
    const raw = window.localStorage.getItem(desktopSettingsStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveDesktopSettingsToStorage(settings: DesktopSettingsRecord | null): void {
  try {
    if (!settings || !Object.keys(settings).length) {
      window.localStorage.removeItem(desktopSettingsStorageKey);
      return;
    }
    window.localStorage.setItem(desktopSettingsStorageKey, JSON.stringify(settings));
  } catch {
    // Ignore persistence failures in restricted renderer contexts.
  }
}

function normalizeAppearanceTheme(value: string): 'light' | 'dark' | 'system' {
  const normalized = value.trim().toLowerCase();
  return normalized === 'light' || normalized === 'system' ? normalized : 'dark';
}

function normalizeAppearanceSkin(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized || 'default';
}

function applyDesktopAppearance(settings: DesktopSettingsRecord | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = normalizeAppearanceTheme(String(settings?.theme || 'dark'));
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  const skin = normalizeAppearanceSkin(String(settings?.skin || 'default'));
  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = theme;
  root.dataset.skin = skin;
  root.classList.toggle('theme-light', resolvedTheme === 'light');
  root.classList.toggle('theme-dark', resolvedTheme !== 'light');
  root.classList.toggle('theme-system', theme === 'system');
  root.style.colorScheme = resolvedTheme;
}

type TodoItem = {
  id?: string;
  content?: string;
  title?: string;
  status?: string;
};

type SidebarResizeTarget = 'context' | 'workspace';

type SidebarResizeState = {
  target: SidebarResizeTarget;
  startX: number;
  startWidth: number;
};

const DEFAULT_LEFT_RAIL_WIDTH = 168;
const COLLAPSED_LEFT_RAIL_WIDTH = 48;
const DEFAULT_CONTEXT_SIDEBAR_WIDTH = 280;
const MIN_CONTEXT_SIDEBAR_WIDTH = 220;
const MAX_CONTEXT_SIDEBAR_WIDTH = 420;
const DEFAULT_WORKSPACE_PANEL_WIDTH = 320;
const MIN_WORKSPACE_PANEL_WIDTH = 260;
const MAX_WORKSPACE_PANEL_WIDTH = 520;
const MIN_BROWSER_WIDTH = 640;
const COLLAPSED_PANEL_WIDTH = 44;



class PanelErrorBoundary extends React.Component<
  { panel: LastbrowserPanelId; children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { panel: LastbrowserPanelId; children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message };
  }

  componentDidCatch(error: Error): void {
    console.error('Panel render failed', this.props.panel, error);
  }

  render(): JSX.Element {
    if (this.state.error) {
      return (
        <section className="browser-main native-rest-main panel-error-main">
          <header className="native-rest-header">
            <div className="native-rest-title">
              <div className="native-rest-icon"><AlertTriangle size={21} /></div>
              <div>
                <span className="eyebrow">Panel error</span>
                <h1>{this.props.panel}</h1>
                <p>{this.state.error}</p>
              </div>
            </div>
          </header>
        </section>
      );
    }

    return <>{this.props.children}</>;
  }
}

const panelIcons: Record<LastbrowserPanelId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  chat: MessageSquare,
  tasks: CalendarDays,
  kanban: Columns3,
  skills: Sparkles,
  agents: Bot,
  memory: Brain,
  workspaces: Folder,
  profiles: UserCircle,
  todos: ListChecks,
  insights: BarChart3,
  logs: FileText,
  gmail: Mail,
  browser: Globe2,
  discord: Users,
  appstore: LayoutGrid,
  settings: Settings,
  terminal: Terminal
};

export function App(): JSX.Element {
  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    closedTabs,
    setClosedTabs,
    searchEngineId,
    setSearchEngineId,
    draggedTabId,
    setDraggedTabId,
    addressValue,
    setAddressValue,
    browserMode,
    setBrowserMode,
    browserLoadError,
    setBrowserLoadError
  } = useTabStore();

  const {
    activePanel,
    setActivePanel,
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    sidebarMode,
    setSidebarMode,
    cycleSidebarMode,
    copilotOpen,
    setCopilotOpen,
    toggleCopilot,
    contextSidebarCollapsed,
    setContextSidebarCollapsed,
    contextSidebarWidth,
    setContextSidebarWidth,
    workspacePanelCollapsed,
    setWorkspacePanelCollapsed,
    workspacePanelWidth,
    setWorkspacePanelWidth,
    activeContextItem,
    setActiveContextItem,
    installedSidebarApps,
    setInstalledSidebarApps
  } = usePanelStore();

  const [layoutMode, setLayoutMode] = useState<'modern' | 'classic'>(() => {
    try {
      const val = window.localStorage.getItem('lastbrowser.layoutMode.v1');
      if (val === 'classic' || val === 'modern') return val;
    } catch {}
    return 'modern';
  });

  useEffect(() => {
    const handleLayoutModeChanged = () => {
      try {
        const val = window.localStorage.getItem('lastbrowser.layoutMode.v1');
        if (val === 'classic' || val === 'modern') setLayoutMode(val);
      } catch {}
    };
    window.addEventListener('lastbrowser:layout-mode-changed', handleLayoutModeChanged);
    window.addEventListener('storage', handleLayoutModeChanged);
    return () => {
      window.removeEventListener('lastbrowser:layout-mode-changed', handleLayoutModeChanged);
      window.removeEventListener('storage', handleLayoutModeChanged);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        cycleSidebarMode();
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        toggleCopilot();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        usePanelStore.getState().toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cycleSidebarMode, toggleCopilot]);

  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>(() => loadBookmarks(window.localStorage));
  const [profiles, setProfiles] = useState<BrowserProfile[]>(() => loadProfiles(window.localStorage));
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId(window.localStorage));
  const [visitedSites, setVisitedSites] = useState<BrowserVisit[]>(() => loadVisitedSites(window.localStorage));
  const [desktopSettings, setDesktopSettings] = useState<Record<string, unknown> | null>(() => loadDesktopSettingsFromStorage());
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const { isMaximized: windowMaximized, handleDoubleClick: handleTopbarDoubleClick, handleMouseDown: handleTopbarMouseDown } = useWindowDrag();
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [setupState, setSetupState] = useState<SetupState>(defaultSetupState);
  // The wizard covers the whole window, so it must always be dismissible —
  // otherwise a user who cannot finish setup is locked out of the browser.
  const [setupDismissed, setSetupDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('lastbrowser.setupDismissed') === '1';
    } catch {
      return false;
    }
  });
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [sessions, setSessions] = useState<DesktopSessionSummary[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<DesktopSessionDetail | null>(null);
  const [activeSessionLoading, setActiveSessionLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<DesktopChatMessage[]>([]);
  const [chatError, setChatError] = useState('');
  const [chatRunState, setChatRunState] = useState<ChatRunState>('idle');
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [composerText, setComposerText] = useState('');
  const [composerMode, setComposerMode] = useState<ComposerMode>('action');
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [activeSpacePath, setActiveSpacePath] = useState('');
  const [spacesError, setSpacesError] = useState('');
  const [workspacePath, setWorkspacePath] = useState('.');
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceTreeEntry[]>([]);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspacePreview, setWorkspacePreview] = useState<WorkspaceFilePreview | null>(null);
  const [workspacePreviewDraft, setWorkspacePreviewDraft] = useState('');
  const [workspaceEditing, setWorkspaceEditing] = useState(false);
  const [workspaceShowHidden, setWorkspaceShowHidden] = useState(false);
  const [workspaceRefreshNonce, setWorkspaceRefreshNonce] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [hasActiveDownloads, setHasActiveDownloads] = useState(false);
  const [sidekickBusy, setSidekickBusy] = useState(false);
  const [messages, setMessages] = useState<SidekickMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Sidekick is ready for page summaries, selection explanations, and research tasks.'
    }
  ]);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || tabs[0], [activeTabId, tabs]);
  const activeProfile = useMemo(() => profileById(profiles, activeProfileId), [profiles, activeProfileId]);
  const activePartition = useMemo(() => profilePartition(activeProfile.id), [activeProfile.id]);

  // Keep the active profile's tab session and auto-recovery snapshot up to date.
  useEffect(() => {
    saveProfileTabs(activeProfileId, { tabs, activeTabId }, window.localStorage);
    saveSessionSnapshot(activeProfileId, { tabs, activeTabId }, window.localStorage);
  }, [activeProfileId, tabs, activeTabId]);

  const activeBookmarkable = isBookmarkableUrl(activeTab.url);
  const activeBookmarked = useMemo(() => isBookmarked(bookmarks, activeTab.url), [activeTab.url, bookmarks]);
  const activeTabIdRef = useRef(activeTabId);
  const browserFrameRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const resizeStateRef = useRef<SidebarResizeState | null>(null);
  const contextSidebarWidthRef = useRef(contextSidebarWidth);
  const workspacePanelWidthRef = useRef(workspacePanelWidth);
  const contextSidebarCollapsedRef = useRef(contextSidebarCollapsed);
  const workspacePanelCollapsedRef = useRef(workspacePanelCollapsed);
  const leftSidebarCollapsedRef = useRef(leftSidebarCollapsed);
  const setupRequired = isFirstRunRequired(setupState, onboardingStatus) && !setupDismissed;
  const sidekickApiReady = canCallSidekickApi(status);

  useEffect(() => {
    if (!sidekickApiReady) return undefined;
    let alive = true;
    void window.lastbrowser.sidekick.getSettings()
      .then((payload) => {
        if (!alive) return;
        setDesktopSettings((current) => {
          const serverSettings = extractDesktopSettings(payload);
          const storedSettings = loadDesktopSettingsFromStorage();
          const nextSettings = {
            ...serverSettings,
            ...(storedSettings || current || {})
          };
          saveDesktopSettingsToStorage(nextSettings);
          return nextSettings;
        });
      })
      .catch(() => {
        if (!alive) return;
        setDesktopSettings((current) => current || loadDesktopSettingsFromStorage());
      });
    const handleSettingsChanged = (event: Event) => {
      const custom = event as CustomEvent<{ settings?: Record<string, unknown> } | Record<string, unknown>>;
      const nextSettings = isRecord(custom.detail) && isRecord((custom.detail as Record<string, unknown>).settings)
        ? (custom.detail as Record<string, unknown>).settings
        : isRecord(custom.detail) ? custom.detail as Record<string, unknown> : null;
      if (nextSettings && Object.keys(nextSettings).some((key) => !key.startsWith('_'))) {
        setDesktopSettings((current) => {
          const merged = {
            ...(current || {}),
            ...nextSettings
          };
          saveDesktopSettingsToStorage(merged);
          return merged;
        });
      }
    };
    window.addEventListener('lastbrowser:settings-changed', handleSettingsChanged);
    return () => {
      alive = false;
      window.removeEventListener('lastbrowser:settings-changed', handleSettingsChanged);
    };
  }, [sidekickApiReady]);

  useEffect(() => {
    applyDesktopAppearance(desktopSettings);
  }, [desktopSettings]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    setAddressValue(isAiBrowserHomeUrl(activeTab.url) ? '' : activeTab.url);
  }, [activeTab.id, activeTab.url]);

  useEffect(() => {
    if (activePanel !== 'browser') return;
    setBrowserMode(isAiBrowserHomeUrl(activeTab.url) ? 'home' : 'web');
  }, [activePanel, activeTab.id, activeTab.url]);

  useEffect(() => {
    saveBookmarks(window.localStorage, bookmarks);
  }, [bookmarks]);

  useEffect(() => {
    saveVisitedSites(window.localStorage, visitedSites);
  }, [visitedSites]);

  useEffect(() => {
    saveSearchEngineId(window.localStorage, searchEngineId);
  }, [searchEngineId]);

  /** Drop a single entry from the history panel. */
  function removeHistoryEntry(url: string): void {
    setVisitedSites((current) => removeVisit(current, url));
  }

  /** Wipe the whole history log. */
  function clearHistory(): void {
    setVisitedSites([]);
  }

  useEffect(() => {
    const unbindTab = window.lastbrowser?.browser?.onOpenTab?.((url) => addTab(url));
    const unbindIncognito = window.lastbrowser?.browser?.onOpenIncognitoTab?.((url) => addTab(url, { incognito: true }));
    const unbindResearch = window.lastbrowser?.browser?.onDeepResearch?.(async (payload) => {
      setActivePanel('chat');
      if (payload.selectionText) {
        await startNativeChat(
          `Erstelle eine tiefe, fundierte Recherche zu folgendem ausgewählten Text:\n\n„${payload.selectionText}“\n\nQuelle: ${payload.pageUrl || 'Browser'}`,
          `Deep Research: ${payload.selectionText.slice(0, 30)}…`
        );
      } else if (payload.pageUrl) {
        await runSidekickAction('research-page');
      }
    });
    return () => {
      unbindTab?.();
      unbindIncognito?.();
      unbindResearch?.();
    };
  }, [addTab]);

  useEffect(() => {
    if (!window.lastbrowser?.downloads?.onChanged) return;
    return window.lastbrowser.downloads.onChanged((entries) => {
      setHasActiveDownloads(entries.some((e) => e.state === 'progressing'));
    });
  }, []);

  useEffect(() => {
    const handleToggleDevtools = () => {
      try {
        const view = webviewRef.current;
        if (view && typeof view.openDevTools === 'function') {
          if (view.isDevToolsOpened()) {
            view.closeDevTools();
          } else {
            view.openDevTools({ mode: 'right' });
          }
        }
      } catch {
        // ignore
      }
    };
    const handlePrint = () => {
      try {
        webviewRef.current?.print?.();
      } catch {
        // ignore
      }
    };
    window.addEventListener('lastbrowser:toggle-devtools', handleToggleDevtools);
    window.addEventListener('lastbrowser:print-page', handlePrint);
    return () => {
      window.removeEventListener('lastbrowser:toggle-devtools', handleToggleDevtools);
      window.removeEventListener('lastbrowser:print-page', handlePrint);
    };
  }, []);

  useEffect(() => {
    if (!window.lastbrowser?.browser?.onShortcut) return;
    return window.lastbrowser.browser.onShortcut((event: { action: string; payload?: { index?: number } }) => {
      switch (event.action) {
        case 'new-tab':
          addTab();
          setActivePanel('browser');
          break;
        case 'new-incognito-tab':
          addTab(browserStartUrl, { incognito: true });
          setActivePanel('browser');
          break;
        case 'history-back':
          try {
            webviewRef.current?.goBack();
          } catch {
            // ignore
          }
          break;
        case 'history-forward':
          try {
            webviewRef.current?.goForward();
          } catch {
            // ignore
          }
          break;
        case 'toggle-fullscreen':
          void window.lastbrowser.window?.toggleFullScreen?.();
          break;
        case 'print-page':
          try {
            webviewRef.current?.print?.();
          } catch {
            // ignore
          }
          break;
        case 'close-tab': {
          const curId = activeTabIdRef.current;
          if (curId) closeTab(curId);
          break;
        }
        case 'reopen-tab':
          reopenClosedTab();
          setActivePanel('browser');
          break;
        case 'focus-address':
          addressInputRef.current?.focus();
          addressInputRef.current?.select();
          break;
        case 'reload':
          try {
            webviewRef.current?.reload();
          } catch {
            // ignore
          }
          break;
        case 'reload-hard':
          try {
            (webviewRef.current as any)?.reloadIgnoringCache?.() ?? webviewRef.current?.reload();
          } catch {
            // ignore
          }
          break;
        case 'next-tab': {
          const allTabs = useTabStore.getState().tabs;
          const curId = activeTabIdRef.current;
          const idx = allTabs.findIndex((t) => t.id === curId);
          if (allTabs.length > 1 && idx >= 0) {
            const nextIdx = (idx + 1) % allTabs.length;
            setActiveTabId(allTabs[nextIdx].id);
            setActivePanel('browser');
          }
          break;
        }
        case 'prev-tab': {
          const allTabs = useTabStore.getState().tabs;
          const curId = activeTabIdRef.current;
          const idx = allTabs.findIndex((t) => t.id === curId);
          if (allTabs.length > 1 && idx >= 0) {
            const prevIdx = (idx - 1 + allTabs.length) % allTabs.length;
            setActiveTabId(allTabs[prevIdx].id);
            setActivePanel('browser');
          }
          break;
        }
        case 'jump-tab': {
          const allTabs = useTabStore.getState().tabs;
          const target = event.payload?.index ?? 0;
          if (target >= 0 && target < allTabs.length) {
            setActiveTabId(allTabs[target].id);
            setActivePanel('browser');
          }
          break;
        }
        case 'jump-last-tab': {
          const allTabs = useTabStore.getState().tabs;
          if (allTabs.length > 0) {
            setActiveTabId(allTabs[allTabs.length - 1].id);
            setActivePanel('browser');
          }
          break;
        }
        case 'find-in-page':
          usePanelStore.getState().setFindOpen(true);
          break;
        case 'open-history':
          usePanelStore.getState().setHistoryOpen(!usePanelStore.getState().historyOpen);
          break;
        case 'open-downloads':
          usePanelStore.getState().setDownloadsOpen(!usePanelStore.getState().downloadsOpen);
          break;
        case 'open-settings':
          setActivePanel('settings');
          break;
        case 'toggle-sidebar':
          cycleSidebarMode();
          setContextSidebarCollapsed((prev) => !prev);
          break;
        case 'toggle-command-palette':
          usePanelStore.getState().toggleCommandPalette();
          break;
        case 'toggle-copilot':
          toggleCopilot();
          break;
        case 'toggle-devtools':
          try {
            const view = webviewRef.current;
            if (view && typeof view.openDevTools === 'function') {
              if (view.isDevToolsOpened()) {
                view.closeDevTools();
              } else {
                view.openDevTools({ mode: 'right' });
              }
            }
          } catch {
            // ignore
          }
          break;
        case 'zoom-in': {
          const view = webviewRef.current;
          if (view && typeof view.getZoomFactor === 'function' && typeof view.setZoomFactor === 'function') {
            view.getZoomFactor((factor: number) => {
              view.setZoomFactor(Math.min(3, factor + 0.1));
            });
          }
          break;
        }
        case 'zoom-out': {
          const view = webviewRef.current;
          if (view && typeof view.getZoomFactor === 'function' && typeof view.setZoomFactor === 'function') {
            view.getZoomFactor((factor: number) => {
              view.setZoomFactor(Math.max(0.25, factor - 0.1));
            });
          }
          break;
        }
        case 'zoom-reset': {
          const view = webviewRef.current;
          if (view && typeof view.setZoomFactor === 'function') {
            view.setZoomFactor(1);
          }
          break;
        }
      }
    });
  }, [addTab, closeTab, reopenClosedTab, setActiveTabId, setActivePanel, setContextSidebarCollapsed]);

  useEffect(() => {
    saveActivePanel(undefined, activePanel);
  }, [activePanel]);

  useEffect(() => {
    saveInstalledSidebarApps(undefined, installedSidebarApps);
  }, [installedSidebarApps]);

  useEffect(() => {
    if (isInstalledSidebarApp(activePanel, installedSidebarApps)) return;
    if (activePanel === 'gmail' || activePanel === 'discord') {
      setActivePanel('browser');
    }
  }, [activePanel, installedSidebarApps]);

  useEffect(() => {
    setActiveContextItem(panelContextItems[activePanel]?.[0] || '');
  }, [activePanel]);

  useEffect(() => {
    saveBooleanPreference(undefined, leftSidebarCollapsedStorageKey, leftSidebarCollapsed);
  }, [leftSidebarCollapsed]);

  useEffect(() => {
    saveBooleanPreference(undefined, workspacePanelCollapsedStorageKey, workspacePanelCollapsed);
  }, [workspacePanelCollapsed]);

  useEffect(() => {
    saveNumericPreference(undefined, contextSidebarWidthStorageKey, contextSidebarWidth);
  }, [contextSidebarWidth]);

  useEffect(() => {
    saveNumericPreference(undefined, workspacePanelWidthStorageKey, workspacePanelWidth);
  }, [workspacePanelWidth]);

  useEffect(() => {
    contextSidebarWidthRef.current = contextSidebarWidth;
  }, [contextSidebarWidth]);

  useEffect(() => {
    workspacePanelWidthRef.current = workspacePanelWidth;
  }, [workspacePanelWidth]);

  useEffect(() => {
    contextSidebarCollapsedRef.current = contextSidebarCollapsed;
  }, [contextSidebarCollapsed]);

  useEffect(() => {
    workspacePanelCollapsedRef.current = workspacePanelCollapsed;
  }, [workspacePanelCollapsed]);

  useEffect(() => {
    leftSidebarCollapsedRef.current = leftSidebarCollapsed;
  }, [leftSidebarCollapsed]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const next = await window.lastbrowser.services.status();
      if (alive) setStatus(next);
    };
    void refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadSetup(): Promise<void> {
      setSetupLoading(true);
      try {
        const stored = await window.lastbrowser.setup.load();
        if (!alive) return;
        setSetupState(normalizeSetupState(stored));
      } finally {
        if (alive) setSetupLoading(false);
      }
    }
    void loadSetup();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const onboarding = await window.lastbrowser.sidekick.onboardingStatus().catch(() => null);
      if (alive && onboarding) setOnboardingStatus(onboarding as OnboardingStatus);
    };
    void refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [status?.webuiUrl]);

  useEffect(() => {
    let alive = true;
    void window.lastbrowser.updates.status().then((next) => {
      if (alive) setUpdateStatus(next);
    }).catch(() => null);
    const dispose = window.lastbrowser.updates.onStatus((next) => setUpdateStatus(next));
    return () => {
      alive = false;
      dispose();
    };
  }, []);

  const refreshOnboardingStatus = useCallback(async (): Promise<void> => {
    const onboarding = await window.lastbrowser.sidekick.onboardingStatus().catch(() => null);
    if (onboarding) setOnboardingStatus(onboarding as OnboardingStatus);
  }, []);

  const refreshSessions = useCallback(async (): Promise<void> => {
    if (!sidekickApiReady) return;
    try {
      const result = await window.lastbrowser.sidekick.listSessions();
      const nextSessions = Array.isArray(result.sessions) ? result.sessions : [];
      setSessions(nextSessions);
      setSessionError('');
      // Fetch projects
      try {
        const projData = await window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/projects' });
        if (Array.isArray(projData?.projects)) setProjects(projData.projects);
      } catch { /* ignore */ }
      setActiveSessionId((current) => {
        if (current && nextSessions.some((session) => session.session_id === current)) return current;
        return nextSessions[0]?.session_id || null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSessionError(isTransientSidekickFetchError(message) ? '' : message);
    }
  }, [sidekickApiReady]);

  const refreshSpaces = useCallback(async (): Promise<void> => {
    if (!sidekickApiReady) return;
    try {
      const result = await window.lastbrowser.sidekick.listSpaces();
      const nextSpaces = Array.isArray(result.workspaces) ? result.workspaces : [];
      setSpaces(nextSpaces);
      setSpacesError('');
      setActiveSpacePath((current) => {
        if (current && nextSpaces.some((space) => space.path === current)) return current;
        return result.last || nextSpaces[0]?.path || '';
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSpacesError(isTransientSidekickFetchError(message) ? '' : message);
    }
  }, [sidekickApiReady]);

  const loadActiveSession = useCallback(async (
    sessionId: string,
    options: { loadDraft?: boolean; showLoading?: boolean } = {}
  ): Promise<DesktopSessionDetail | null> => {
    if (!sidekickApiReady || !sessionId) return null;
    if (options.showLoading !== false) setActiveSessionLoading(true);
    try {
      const [sessionResult, draftResult] = await Promise.all([
        window.lastbrowser.sidekick.getSession({ sessionId, messages: true, msgLimit: 80 }),
        options.loadDraft === false
          ? Promise.resolve(null)
          : window.lastbrowser.sidekick.getDraft(sessionId).catch(() => null)
      ]);
      const session = sessionResult.session || null;
      if (!session) throw new Error('Sidekick session was not found.');
      setActiveSession(session);
      setChatMessages(normalizeChatMessages(session.messages));
      setActiveStreamId(session.active_stream_id || null);
      setChatRunState(session.active_stream_id || session.pending_user_message ? 'streaming' : 'idle');
      setChatError('');
      if (draftResult?.draft && options.loadDraft !== false) {
        setComposerText(String(draftResult.draft.text || ''));
      }
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setChatError(isTransientSidekickFetchError(message) ? '' : message);
      return null;
    } finally {
      if (options.showLoading !== false) setActiveSessionLoading(false);
    }
  }, [sidekickApiReady]);

  useEffect(() => {
    if (!sidekickApiReady) return undefined;
    void refreshSessions();
    void refreshSpaces();
    const timer = window.setInterval(() => void refreshSessions(), 5000);
    const spaceTimer = window.setInterval(() => void refreshSpaces(), 10000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(spaceTimer);
    };
  }, [refreshSessions, refreshSpaces, sidekickApiReady]);

  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      setChatMessages([]);
      setComposerText('');
      setActiveStreamId(null);
      setChatRunState('idle');
      return undefined;
    }

    void loadActiveSession(activeSessionId, { loadDraft: true, showLoading: true });
    return undefined;
  }, [activeSessionId, loadActiveSession]);

  useEffect(() => {
    if (!activeSessionId || !sidekickApiReady) return undefined;
    const timer = window.setTimeout(() => {
      void window.lastbrowser.sidekick.saveDraft({ sessionId: activeSessionId, text: composerText, files: [] }).catch(() => null);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeSessionId, composerText, sidekickApiReady]);

  const refreshWorkspace = useCallback(async (pathOverride?: string): Promise<void> => {
    if (status?.sidekick !== 'ready' || !activeSessionId || workspacePanelCollapsed) return;
    try {
      const nextPath = pathOverride || workspacePath || '.';
      const result = await window.lastbrowser.sidekick.listWorkspace({
        sessionId: activeSessionId,
        path: nextPath
      });
      setWorkspaceEntries(Array.isArray(result.entries) ? result.entries : []);
      setWorkspacePath(result.path || nextPath || '.');
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }, [activeSessionId, status?.sidekick, workspacePanelCollapsed, workspacePath]);

  useEffect(() => {
    let alive = true;
    if (status?.sidekick !== 'ready' || !activeSessionId || workspacePanelCollapsed) return undefined;
    void refreshWorkspace().finally(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
  }, [activeSessionId, refreshWorkspace, status?.sidekick, workspacePanelCollapsed, workspacePath, workspaceRefreshNonce]);

  function navigate(url: string): void {
    const normalized = normalizeNavigationInput(url, searchEngineId);
    setTabs((current) => updateTabUrl(current, activeTab.id, normalized));
    setBrowserMode(isAiBrowserHomeUrl(normalized) ? 'home' : 'web');
    setBrowserLoadError('');
    setActivePanel('browser');
  }

  function submitNavigation(event: FormEvent): void {
    event.preventDefault();
    navigate(addressValue.trim() ? addressValue : browserStartUrl);
  }

  function addTab(url = browserStartUrl, options?: { incognito?: boolean }): void {
    const next = createInitialTab(url, options);
    setTabs((current) => [...current, next]);
    setBrowserMode(isAiBrowserHomeUrl(url) ? 'home' : 'web');
    setBrowserLoadError('');
    activeTabIdRef.current = next.id;
    setActiveTabId(next.id);
    setActivePanel('browser');
  }

  function toggleActiveBookmark(): void {
    if (!activeBookmarkable) return;
    setBookmarks((current) => (
      activeBookmarked
        ? removeBookmark(current, activeTab.url)
        : upsertBookmark(current, bookmarkFromTab(activeTab))
    ));
  }

  function removeBookmarkItem(bookmark: BrowserBookmark): void {
    setBookmarks((current) => removeBookmark(current, bookmark.url));
  }

  function importBookmarkItems(incoming: BrowserBookmark[]): void {
    setBookmarks((current) => mergeBookmarks(current, incoming));
  }

  function switchProfile(profileId: string): void {
    if (profileId === activeProfileId) return;
    // Persist the outgoing profile's tabs before swapping.
    saveProfileTabs(activeProfileId, { tabs, activeTabId }, window.localStorage);
    const stored = loadProfileTabs(profileId, window.localStorage);
    const nextTabs = stored.tabs.length ? stored.tabs : [createInitialTab(browserStartUrl)];
    const nextActiveId = stored.activeTabId && nextTabs.some((tab) => tab.id === stored.activeTabId)
      ? stored.activeTabId
      : nextTabs[0].id;
    setTabs(nextTabs);
    activeTabIdRef.current = nextActiveId;
    setActiveTabId(nextActiveId);
    setActiveProfileId(profileId);
    saveActiveProfileId(window.localStorage, profileId);
  }

  function createProfileEntry(name: string): void {
    setProfiles((current) => {
      const next = addProfile(current, name);
      saveProfiles(window.localStorage, next);
      return next;
    });
  }

  function renameProfileEntry(profileId: string, name: string): void {
    setProfiles((current) => {
      const next = renameProfile(current, profileId, name);
      saveProfiles(window.localStorage, next);
      return next;
    });
  }

  function deleteProfileEntry(profileId: string): void {
    setProfiles((current) => {
      const next = removeProfile(current, profileId);
      saveProfiles(window.localStorage, next);
      return next;
    });
    removeProfileTabs(profileId, window.localStorage);
    if (profileId === activeProfileId) {
      switchProfile('default');
    }
  }

  function closeTab(tabId: string): void {
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const closing = tabs[index];
    if (closing && !closing.incognito) {
      // Remember it so Ctrl+Shift+T can bring it back.
      setClosedTabs((current) => rememberClosedTab(current, closing));
    }
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      const nextActiveId = nextTabs[Math.max(0, index - 1)].id;
      activeTabIdRef.current = nextActiveId;
      setActiveTabId(nextActiveId);
    }
  }

  /** Reopen the most recently closed tab (Ctrl+Shift+T), or restore session snapshot if closedTabs is empty. */
  function reopenClosedTab(): void {
    const { tab, rest } = takeLastClosedTab(closedTabs);
    if (tab) {
      setClosedTabs(rest);
      const created = createInitialTab(tab.url);
      const restored = { ...created, title: tab.title || created.title };
      setTabs((current) => [...current, restored]);
      activeTabIdRef.current = restored.id;
      setActiveTabId(restored.id);
      setActivePanel('browser');
      setAddressValue(isAiBrowserHomeUrl(restored.url) ? '' : restored.url);
      return;
    }
    const snapshot = loadSessionSnapshot(activeProfileId, window.localStorage);
    if (snapshot && snapshot.state.tabs.length > tabs.length) {
      setTabs(snapshot.state.tabs);
      if (snapshot.state.activeTabId) {
        activeTabIdRef.current = snapshot.state.activeTabId;
        setActiveTabId(snapshot.state.activeTabId);
      }
      setActivePanel('browser');
    }
  }

  function updateTitle(tabId: string, title: string): void {
    setTabs((current) => updateTabTitle(current, tabId, title));
    const tab = tabs.find((item) => item.id === tabId);
    if (tab && !tab.incognito) {
      setVisitedSites((current) => recordVisit(current, tab.url, title, { increment: false }));
    }
  }

  function updateUrl(tabId: string, url: string): void {
    setTabs((current) => updateTabUrl(current, tabId, url));
    if (activeTabIdRef.current === tabId) {
      setAddressValue(isAiBrowserHomeUrl(url) ? '' : url);
      setBrowserLoadError('');
    }
    if (activePanel === 'browser' && activeTabIdRef.current === tabId) {
      setBrowserMode(isAiBrowserHomeUrl(url) ? 'home' : 'web');
    }
    const tab = tabs.find((item) => item.id === tabId);
    if (tab && !tab.incognito) {
      setVisitedSites((current) => recordVisit(current, url, tab?.title || ''));
    }
  }

  function updateFavicon(tabId: string, favicon: string): void {
    setTabs((current) => updateTabFavicon(current, tabId, favicon));
  }

  function updateLoading(tabId: string, isLoading: boolean): void {
    setTabs((current) => updateTabLoading(current, tabId, isLoading));
  }

  function updateMediaPlaying(tabId: string, isPlayingAudio: boolean): void {
    setTabs((current) => updateTabMediaPlaying(current, tabId, isPlayingAudio));
  }

  function toggleTabMute(tabId: string): void {
    const target = tabs.find((t) => t.id === tabId);
    const nextMuted = !target?.isMuted;
    setTabs((current) => updateTabMuted(current, tabId, nextMuted));
    if (tabId === activeTab.id) {
      try {
        webviewRef.current?.setAudioMuted(nextMuted);
      } catch {
        // ignore
      }
    }
  }

  function moveTab(tabId: string, targetTabId: string): void {
    setTabs((current) => reorderTabs(current, tabId, targetTabId));
  }

  function toggleTabPinned(tabId: string): void {
    setTabs((current) => togglePinnedTab(current, tabId));
  }

  async function completeSetup(form: SetupForm): Promise<void> {
    setSetupError('');
    if (!form.provider || !form.model) {
      setSetupError('Choose a provider and model before continuing.');
      return;
    }
    setSetupSaving(true);
    try {
      if (form.provider === 'openai-codex') {
        await window.lastbrowser.sidekick.setDefaultModel({
          model: form.model.startsWith('@openai-codex:') ? form.model : `@openai-codex:${form.model}`
        });
      }
      const botName = form.botName?.trim() || 'Nova';
      const personality = form.personality?.trim() || 'nova';

      await window.lastbrowser.sidekick.saveSettings({
        settings: {
          bot_name: botName,
          personality: personality
        }
      }).catch(() => null);

      const nextStatus = await window.lastbrowser.sidekick.applyCloudSetup({
        provider: form.provider,
        model: form.model,
        apiKey: form.apiKey
      });
      const completeStatus = await window.lastbrowser.sidekick.completeCloudSetup().catch(() => nextStatus);
      const nextState = await window.lastbrowser.setup.save({
        cloudSetupComplete: true,
        provider: form.provider,
        model: form.model,
        botName: botName,
        personality: personality
      });
      setSetupState(nextState);
      setOnboardingStatus((completeStatus || nextStatus) as OnboardingStatus);
      void refreshSessions();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setSetupSaving(false);
    }
  }

  async function createNativeSession(): Promise<void> {
    if (status?.sidekick !== 'ready') {
      setSessionError('Sidekick is still starting.');
      return;
    }

    try {
      const result = await window.lastbrowser.sidekick.createSession(activeSpacePath ? { workspace: activeSpacePath } : {});
      const session = result.session;
      if (session?.session_id) {
        setSessions((current) => [
          session,
          ...current.filter((item) => item.session_id !== session.session_id)
        ]);
        setActiveSessionId(session.session_id);
        setActivePanel('chat');
        setSessionError('');
      }
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }

  function pinNativeSession(session: DesktopSessionSummary): void {
    void window.lastbrowser.sidekick
      .requestWebui({
        method: 'POST',
        path: '/api/session/pin',
        body: { session_id: session.session_id, pinned: true }
      })
      .then(() => {
        setSessions((current) =>
          current.map((item) =>
            item.session_id === session.session_id ? { ...item, pinned: true } : item
          )
        );
      })
      .catch(() => {});
  }

  function unpinNativeSession(session: DesktopSessionSummary): void {
    void window.lastbrowser.sidekick
      .requestWebui({
        method: 'POST',
        path: '/api/session/pin',
        body: { session_id: session.session_id, pinned: false }
      })
      .then(() => {
        setSessions((current) =>
          current.map((item) =>
            item.session_id === session.session_id ? { ...item, pinned: false } : item
          )
        );
      })
      .catch(() => {});
  }

  function archiveNativeSession(session: DesktopSessionSummary): void {
    void window.lastbrowser.sidekick
      .requestWebui({
        method: 'POST',
        path: '/api/session/archive',
        body: { session_id: session.session_id, archived: true }
      })
      .then(() => {
        setSessions((current) =>
          current.map((item) =>
            item.session_id === session.session_id ? { ...item, archived: true } : item
          )
        );
      })
      .catch(() => {});
  }

  /**
   * Wait for a chat turn to finish.
   *
   * Prefers the SSE stream (each event arrives as the agent produces it) and
   * falls back to polling when the stream cannot be established — e.g. an older
   * sidecar without the SSE route, or a proxy that buffers event streams.
   */
  async function pollNativeChat(streamId: string, sessionId: string): Promise<void> {
    const deadline = Date.now() + 120000;
    let sawStreamEnd = false;
    let streamFailed = false;

    const unsubscribe = window.lastbrowser.sidekick.onChatStreamEvent((payload) => {
      const event = payload as { streamId?: string; event?: string; data?: unknown } | null;
      if (!event || event.streamId !== streamId) return;
      if (event.event === 'stream_end' || event.event === 'cancel') {
        sawStreamEnd = true;
        return;
      }
      if (event.event === 'error') {
        streamFailed = true;
        return;
      }
      // Any content-bearing event means the turn is progressing; refresh the
      // transcript so the user sees the text without waiting for completion.
      if (event.event === 'delta' || event.event === 'message' || event.event === 'tool') {
        void loadActiveSession(sessionId, { loadDraft: false, showLoading: false });
      }
    });

    try {
      await window.lastbrowser.sidekick.subscribeChatStream({ streamId }).catch(() => {
        streamFailed = true;
      });

      while (Date.now() < deadline) {
        await delay(600);
        if (sawStreamEnd) return;
        if (streamFailed) break;
        // The stream is the fast path, but a dropped connection must not hang
        // the turn: poll occasionally as a safety net.
        if (Date.now() % 6000 < 700) {
          const streamStatus = await window.lastbrowser.sidekick.getStreamStatus(streamId).catch(() => null);
          const latest = await loadActiveSession(sessionId, { loadDraft: false, showLoading: false });
          if (!streamStatus?.active && !latest?.active_stream_id && !latest?.pending_user_message) return;
        }
      }
      if (sawStreamEnd) return;
    } finally {
      unsubscribe();
      void window.lastbrowser.sidekick.unsubscribeChatStream({ streamId }).catch(() => null);
    }

    // Stream path ended without a terminal event — fall back to polling.
    while (Date.now() < deadline) {
      await delay(1200);
      const streamStatus = await window.lastbrowser.sidekick.getStreamStatus(streamId).catch(() => null);
      const latest = await loadActiveSession(sessionId, { loadDraft: false, showLoading: false });
      const streamActive = streamStatus?.active === true;
      if (!streamActive && !latest?.active_stream_id && !latest?.pending_user_message) return;
    }
    throw new Error('Sidekick is still working. Try again in a moment.');
  }

  async function startNativeChat(message: string, displayText = message): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed || sidekickBusy || chatRunState === 'starting' || chatRunState === 'streaming') return;

    // Fast-path: Check for natural language browser management commands (Phase 10.4)
    const browserCommand = parseNaturalLanguageBrowserCommand(trimmed);
    if (browserCommand) {
      const visibleUserMessage: DesktopChatMessage = { role: 'user', content: displayText };
      setChatMessages((current) => [...current, visibleUserMessage]);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: displayText }]);
      setComposerText('');

      const result = await executeBrowserAction(browserCommand);
      const assistantReply = `### 🛠️ ${result.title}\n\n${result.message}`;

      setChatMessages((current) => [...current, { role: 'assistant', content: assistantReply, pending: false }]);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: assistantReply, pending: false }]);
      return;
    }

    const visibleUserMessage: DesktopChatMessage = { role: 'user', content: displayText };
    setChatMessages((current) => [
      ...current,
      visibleUserMessage,
      { role: 'assistant', content: 'Working on it...', pending: true }
    ]);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: displayText },
      { id: crypto.randomUUID(), role: 'assistant', content: 'Working on it...', pending: true }
    ]);
    setSidekickBusy(true);
    setChatRunState('starting');
    setChatError('');
    try {
      const response = await window.lastbrowser.sidekick.startChat({
        sessionId: activeSessionId,
        message: trimmed,
        // Resolve the model explicitly. The setup state is often empty (the
        // wizard may have been skipped), and sending nothing made the backend
        // pick a stale catalog entry — observed as
        // "Ring-2.6-1T is no longer available as a free model".
        model: setupState.model || (await resolveConfiguredModel((request) => window.lastbrowser.sidekick.requestWebui(request))) || undefined,
        workspace: activeSpacePath,
        mode: composerMode
      });
      setActiveSessionId(response.sessionId);
      setActiveStreamId(response.streamId);
      setComposerText('');
      setChatRunState('streaming');
      await window.lastbrowser.sidekick.saveDraft({ sessionId: response.sessionId, text: '', files: [] }).catch(() => null);
      await pollNativeChat(response.streamId, response.sessionId);
      // Show the ACTUAL answer. The pending placeholder used to be replaced with
      // the literal string "Sidekick finished.", so every reply — including
      // errors and full summaries — was hidden behind that text.
      const finished = await loadActiveSession(response.sessionId, { loadDraft: false, showLoading: false });
      const answer = lastAssistantText(finished);
      setMessages((current) => current.map((item) => (
        item.pending
          ? { ...item, content: answer || 'Sidekick finished.', pending: false }
          : item
      )));
      void refreshSessions();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      setChatError(messageText);
      setChatMessages((current) => current.map((item) => (
        item.pending ? { ...item, content: `Sidekick could not respond: ${messageText}`, pending: false } : item
      )));
      setMessages((current) => current.map((item) => (
        item.pending ? { ...item, content: `Sidekick could not respond: ${messageText}`, pending: false } : item
      )));
      setChatRunState('error');
    } finally {
      setSidekickBusy(false);
      setActiveStreamId(null);
      setChatRunState((current) => (current === 'error' ? 'error' : 'idle'));
    }
  }

  async function stopNativeChat(): Promise<void> {
    if (!activeStreamId) return;
    setChatRunState('cancelling');
    try {
      await window.lastbrowser.sidekick.cancelStream(activeStreamId);
      if (activeSessionId) await loadActiveSession(activeSessionId, { loadDraft: false, showLoading: false });
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
    } finally {
      setSidekickBusy(false);
      setActiveStreamId(null);
      setChatRunState('idle');
    }
  }

  useEffect(() => {
    const handleWorkflowSend = (event: Event) => {
      const custom = event as CustomEvent<{ prompt?: string }>;
      if (custom.detail?.prompt) {
        setCopilotOpen(true);
        void startNativeChat(custom.detail.prompt);
      }
    };
    window.addEventListener('lastbrowser:workflow:send', handleWorkflowSend);
    return () => {
      window.removeEventListener('lastbrowser:workflow:send', handleWorkflowSend);
    };
  }, [setCopilotOpen]);

  async function renameNativeSession(session: DesktopSessionSummary): Promise<void> {
    const nextTitle = window.prompt('Rename chat', sessionTitle(session));
    if (!nextTitle?.trim()) return;
    try {
      const result = await window.lastbrowser.sidekick.renameSession({ sessionId: session.session_id, title: nextTitle.trim() });
      const updated = result.session || { ...session, title: nextTitle.trim() };
      setSessions((current) => current.map((item) => (item.session_id === session.session_id ? { ...item, ...updated } : item)));
      if (activeSessionId === session.session_id) {
        setActiveSession((current) => (current ? { ...current, ...updated } : current));
      }
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteNativeSession(session: DesktopSessionSummary): Promise<void> {
    if (!window.confirm(`Delete "${sessionTitle(session)}"?`)) return;
    try {
      await window.lastbrowser.sidekick.deleteSession({ sessionId: session.session_id });
      setSessions((current) => {
        const next = current.filter((item) => item.session_id !== session.session_id);
        if (activeSessionId === session.session_id) {
          setActiveSessionId(next[0]?.session_id || null);
        }
        return next;
      });
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function duplicateNativeSession(session: DesktopSessionSummary): Promise<void> {
    try {
      const result = await window.lastbrowser.sidekick.duplicateSession({ sessionId: session.session_id });
      const duplicated = result.session;
      if (duplicated?.session_id) {
        setSessions((current) => [
          duplicated,
          ...current.filter((item) => item.session_id !== duplicated.session_id)
        ]);
        setActiveSessionId(duplicated.session_id);
        setActivePanel('chat');
      }
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function runSidekickAction(action: SidekickActionId): Promise<void> {
    const context = await collectBrowserContext(webviewRef.current, activeTab);
    const prompt = buildSidekickPrompt(action, context);
    if (!prompt.ok) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'system', content: prompt.reason }]);
      return;
    }
    await startNativeChat(prompt.prompt, sidekickActionLabels[action]);
  }

  async function readWorkspaceEntry(entry: WorkspaceTreeEntry): Promise<void> {
    if (!activeSessionId) return;
    const nextPath = entry.path || entry.name;
    if (!nextPath) return;

    if (entry.is_dir || entry.type === 'dir' || entry.type === 'directory') {
      setWorkspacePath(nextPath);
      setWorkspacePreview(null);
      setWorkspacePreviewDraft('');
      setWorkspaceEditing(false);
      return;
    }

    try {
      const preview = await window.lastbrowser.sidekick.readWorkspaceFile({ sessionId: activeSessionId, path: nextPath });
      setWorkspacePreview(preview);
      setWorkspacePreviewDraft(String(preview.content || ''));
      setWorkspaceEditing(false);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createWorkspaceFileNative(): Promise<void> {
    if (!activeSessionId) return;
    const name = window.prompt('New file name');
    if (!name?.trim()) return;
    const path = joinWorkspacePath(workspacePath, name.trim());
    try {
      await window.lastbrowser.sidekick.createWorkspaceFile({ sessionId: activeSessionId, path, content: '' });
      setWorkspaceRefreshNonce((current) => current + 1);
      const preview = await window.lastbrowser.sidekick.readWorkspaceFile({ sessionId: activeSessionId, path }).catch(() => null);
      if (preview) {
        setWorkspacePreview(preview);
        setWorkspacePreviewDraft(String(preview.content || ''));
        setWorkspaceEditing(true);
      }
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createWorkspaceFolderNative(): Promise<void> {
    if (!activeSessionId) return;
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;
    try {
      await window.lastbrowser.sidekick.createWorkspaceDirectory({
        sessionId: activeSessionId,
        path: joinWorkspacePath(workspacePath, name.trim())
      });
      setWorkspaceRefreshNonce((current) => current + 1);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameWorkspaceEntryNative(entry: WorkspaceTreeEntry): Promise<void> {
    if (!activeSessionId) return;
    const currentPath = entry.path || entry.name;
    if (!currentPath) return;
    const nextName = window.prompt('Rename item', entry.name);
    if (!nextName?.trim()) return;
    try {
      const result = await window.lastbrowser.sidekick.renameWorkspaceEntry({
        sessionId: activeSessionId,
        path: currentPath,
        newName: nextName.trim()
      });
      const newPath = String(result.new_path || joinWorkspacePath(parentPath(currentPath), nextName.trim()));
      if (workspacePreview?.path === currentPath) {
        setWorkspacePreview((current) => current ? { ...current, path: newPath } : current);
      }
      setWorkspaceRefreshNonce((current) => current + 1);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteWorkspaceEntryNative(entry: WorkspaceTreeEntry): Promise<void> {
    if (!activeSessionId) return;
    const currentPath = entry.path || entry.name;
    if (!currentPath) return;
    const isFolder = isWorkspaceDirectory(entry);
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    try {
      await window.lastbrowser.sidekick.deleteWorkspaceEntry({
        sessionId: activeSessionId,
        path: currentPath,
        recursive: isFolder
      });
      if (workspacePreview?.path === currentPath) {
        setWorkspacePreview(null);
        setWorkspacePreviewDraft('');
        setWorkspaceEditing(false);
      }
      setWorkspaceRefreshNonce((current) => current + 1);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveWorkspacePreviewNative(): Promise<void> {
    if (!activeSessionId || !workspacePreview?.path) return;
    try {
      await window.lastbrowser.sidekick.saveWorkspaceFile({
        sessionId: activeSessionId,
        path: workspacePreview.path,
        content: workspacePreviewDraft
      });
      setWorkspacePreview((current) => current ? { ...current, content: workspacePreviewDraft, size: workspacePreviewDraft.length } : current);
      setWorkspaceEditing(false);
      setWorkspaceRefreshNonce((current) => current + 1);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function addSpaceNative(path: string, name: string): Promise<void> {
    try {
      const result = await window.lastbrowser.sidekick.addSpace({ path, name, create: true });
      const nextSpaces = Array.isArray(result.workspaces) ? result.workspaces : spaces;
      setSpaces(nextSpaces);
      setActiveSpacePath(path);
      setSpacesError('');
    } catch (error) {
      setSpacesError(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameSpaceNative(space: SpaceSummary): Promise<void> {
    const nextName = window.prompt('Rename space', spaceDisplayName(space));
    if (!nextName?.trim()) return;
    try {
      const result = await window.lastbrowser.sidekick.renameSpace({ path: space.path, name: nextName.trim() });
      if (Array.isArray(result.workspaces)) setSpaces(result.workspaces);
      setSpacesError('');
    } catch (error) {
      setSpacesError(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeSpaceNative(space: SpaceSummary): Promise<void> {
    if (!window.confirm(`Remove "${spaceDisplayName(space)}" from spaces?`)) return;
    try {
      const result = await window.lastbrowser.sidekick.removeSpace({ path: space.path });
      const nextSpaces = Array.isArray(result.workspaces) ? result.workspaces : spaces.filter((item) => item.path !== space.path);
      setSpaces(nextSpaces);
      if (activeSpacePath === space.path) setActiveSpacePath(nextSpaces[0]?.path || '');
      setSpacesError('');
    } catch (error) {
      setSpacesError(error instanceof Error ? error.message : String(error));
    }
  }

  async function moveSpaceNative(space: SpaceSummary, direction: -1 | 1): Promise<void> {
    const index = spaces.findIndex((item) => item.path === space.path);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= spaces.length) return;
    const next = [...spaces];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setSpaces(next);
    try {
      const result = await window.lastbrowser.sidekick.reorderSpaces({ paths: next.map((entry) => entry.path) });
      if (Array.isArray(result.workspaces)) setSpaces(result.workspaces);
      setSpacesError('');
    } catch (error) {
      setSpacesError(error instanceof Error ? error.message : String(error));
    }
  }

  function clampSidebarWidth(
    target: SidebarResizeTarget,
    width: number,
  ): number {
    const leftWidth = leftSidebarCollapsedRef.current ? COLLAPSED_LEFT_RAIL_WIDTH : DEFAULT_LEFT_RAIL_WIDTH;
    const contextWidth = contextSidebarCollapsedRef.current ? COLLAPSED_PANEL_WIDTH : contextSidebarWidthRef.current;
    const workspaceWidth = workspacePanelCollapsedRef.current ? COLLAPSED_PANEL_WIDTH : workspacePanelWidthRef.current;
    const browserFloor = MIN_BROWSER_WIDTH;
    const maxByViewport = Math.max(
      target === 'context' ? MIN_CONTEXT_SIDEBAR_WIDTH : MIN_WORKSPACE_PANEL_WIDTH,
      window.innerWidth - leftWidth - contextWidth - workspaceWidth - browserFloor
    );

    if (target === 'context') {
      return Math.round(Math.min(MAX_CONTEXT_SIDEBAR_WIDTH, Math.max(MIN_CONTEXT_SIDEBAR_WIDTH, Math.min(width, maxByViewport))));
    }

    return Math.round(Math.min(MAX_WORKSPACE_PANEL_WIDTH, Math.max(MIN_WORKSPACE_PANEL_WIDTH, Math.min(width, maxByViewport))));
  }

  function beginSidebarResize(target: SidebarResizeTarget, event: React.MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();

    if (target === 'context' && contextSidebarCollapsedRef.current) return;
    if (target === 'workspace' && workspacePanelCollapsedRef.current) return;

    resizeStateRef.current = {
      target,
      startX: event.clientX,
      startWidth: target === 'context' ? contextSidebarWidthRef.current : workspacePanelWidthRef.current
    };
    document.body.classList.add('sidebar-resizing');
  }

  useEffect(() => {
    function handleMouseMove(event: MouseEvent): void {
      const resize = resizeStateRef.current;
      if (!resize) return;

      const delta = resize.target === 'context'
        ? event.clientX - resize.startX
        : resize.startX - event.clientX;
      const nextWidth = clampSidebarWidth(resize.target, resize.startWidth + delta);

      if (resize.target === 'context') {
        setContextSidebarWidth(nextWidth);
      } else {
        setWorkspacePanelWidth(nextWidth);
      }
      document.body.classList.add('sidebar-resizing');
    }

    function handleMouseUp(): void {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.classList.remove('sidebar-resizing');
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
      document.body.classList.remove('sidebar-resizing');
    };
  }, []);

  useEffect(() => {
    if (!resizeStateRef.current) return;
    const target = resizeStateRef.current.target;
    const nextWidth = clampSidebarWidth(target, target === 'context' ? contextSidebarWidthRef.current : workspacePanelWidthRef.current);
    if (target === 'context') {
      setContextSidebarWidth(nextWidth);
    } else {
      setWorkspacePanelWidth(nextWidth);
    }
  }, [leftSidebarCollapsed, contextSidebarCollapsed, workspacePanelCollapsed]);

  const activePageCategory = useMemo(() => {
    return detectPageCategory(activeTab.url, activeTab.title);
  }, [activeTab.url, activeTab.title]);

  const quickActions = useMemo(() => {
    if (!activeTab.url || activeTab.url.startsWith('lastbrowser://') || activeTab.url.startsWith('about:') || activeTab.url.startsWith('chrome://')) {
      return [];
    }
    return getQuickActionChips(activePageCategory, activeTab.url);
  }, [activePageCategory, activeTab.url]);

  const handleExecuteQuickAction = useCallback((chip: QuickActionChip) => {
    setCopilotOpen(true);
    void executeQuickAction(chip, activeTab, (prompt) => {
      void startNativeChat(prompt);
    });
  }, [activeTab, setCopilotOpen, startNativeChat]);

  const isModernBrowser = layoutMode === 'modern' && activePanel === 'browser';

  return (
    <DesktopI18nProvider>
    <div className={`app-shell panel-${activePanel} ${isModernBrowser ? 'modern-mode' : ''} ${windowMaximized ? 'is-maximized' : ''}`}>
      {isModernBrowser ? (
        <>
          <ModernTitlebar
            isLoading={activeTab.isLoading}
            onGoBack={() => webviewRef.current?.goBack()}
            onGoForward={() => webviewRef.current?.goForward()}
            onReloadOrStop={() => {
              if (activeTab.isLoading) {
                try {
                  webviewRef.current?.stop();
                } catch {
                  // ignore
                }
                updateLoading(activeTab.id, false);
              } else {
                webviewRef.current?.reload();
              }
            }}
            sidebarMode={sidebarMode}
            onToggleSidebar={cycleSidebarMode}
            blockedAdsCount={3420}
            onToggleShieldPopover={() => {}}
            onToggleFind={() => usePanelStore.getState().setFindOpen(!usePanelStore.getState().findOpen)}
            onToggleDownloads={() => usePanelStore.getState().setDownloadsOpen(!usePanelStore.getState().downloadsOpen)}
            hasActiveDownloads={hasActiveDownloads}
            onToggleExtensions={() => {
              setActivePanel('settings');
              setActiveContextItem('extensions');
            }}
            copilotOpen={copilotOpen}
            onToggleCopilot={toggleCopilot}
            onOpenGithub={() => addTab('https://github.com/Loggableim/lastbrowser')}
            quickActions={quickActions}
            onExecuteQuickAction={handleExecuteQuickAction}
          >
            <AddressBar
              value={addressValue}
              onChange={setAddressValue}
              onSubmit={navigate}
              bookmarks={bookmarks}
              visits={visitedSites}
              searchEngineId={searchEngineId}
              activeBookmarkable={activeBookmarkable}
              activeBookmarked={activeBookmarked}
              onToggleBookmark={toggleActiveBookmark}
              inputRef={addressInputRef}
            />
          </ModernTitlebar>

          <div className={`browser-zen-workspace mode-${sidebarMode}`}>
            <SidekickSidebar
              mode={sidebarMode}
              tabs={tabs}
              activeTabId={activeTab.id}
              draggedTabId={draggedTabId}
              onActivateTab={(tabId) => {
                activeTabIdRef.current = tabId;
                setActiveTabId(tabId);
                setActivePanel('browser');
              }}
              onCloseTab={closeTab}
              onNewTab={(url, opts) => addTab(url, opts)}
              onPinTab={toggleTabPinned}
              onToggleTabMute={toggleTabMute}
              onDragStartTab={setDraggedTabId}
              onDragEndTab={() => setDraggedTabId(null)}
              onMoveTab={moveTab}
              onCycleMode={cycleSidebarMode}
              onSetMode={setSidebarMode}
              activeSpacePath={activeSpacePath}
              spaces={spaces}
              onSelectSpace={setActiveSpacePath}
              onOpenSettings={() => setActivePanel('settings')}
              onOpenHistory={() => usePanelStore.getState().setHistoryOpen(true)}
              onOpenApp={(app) => {
                if (app.panel) {
                  setActivePanel(app.panel);
                } else if (app.url) {
                  addTab(app.url);
                }
              }}
              botName={setupState.botName || 'Nova'}
            />

            <div className={`browser-content-area ${copilotOpen ? 'with-copilot-split' : 'full-canvas'}`}>
              <div className="browser-canvas-pane">
                <BrowserMain
                  activePanel={activePanel}
                  activeSession={activeSession}
                  activeSessionId={activeSessionId}
                  activeTab={activeTab}
                  activeProfile={activeProfile}
                  onboardingStatus={onboardingStatus}
                  onReopenSetup={() => {
                    setSetupDismissed(false);
                    try {
                      window.localStorage.removeItem('lastbrowser.setupDismissed');
                    } catch {
                      // Storage unavailable — the wizard still opens for this session.
                    }
                  }}
                  busy={sidekickBusy}
                  chatError={chatError}
                  chatMessages={chatMessages}
                  chatRunState={chatRunState}
                  composerMode={composerMode}
                  composerText={composerText}
                  bookmarks={bookmarks}
                  serviceStatus={status}
                  sessionLoading={activeSessionLoading}
                  setupModel={setupState.model}
                  spaces={spaces}
                  activeSpacePath={activeSpacePath}
                  browserMode={browserMode}
                  browserLoadError={browserLoadError}
                  visitedSites={visitedSites}
                  browserFrameRef={browserFrameRef}
                  activeContextItem={activeContextItem}
                  webviewRef={webviewRef}
                  onAction={runSidekickAction}
                  onComposerMode={setComposerMode}
                  onComposerText={setComposerText}
                  onCreateSession={() => void createNativeSession()}
                  onAddSpace={(path, name) => void addSpaceNative(path, name)}
                  onMoveSpace={(space, direction) => void moveSpaceNative(space, direction)}
                  onNavigate={navigate}
                  onInstalledSidebarApp={(panel) => setInstalledSidebarApps((current) => Array.from(new Set([...current, panel])))}
                  onUninstalledSidebarApp={(panel) => setInstalledSidebarApps((current) => current.filter((item) => item !== panel))}
                  onWebviewNavigate={updateUrl}
                  onWebviewTitle={updateTitle}
                  onWebviewFavicon={updateFavicon}
                  onWebviewLoading={updateLoading}
                  onWebviewMediaPlaying={updateMediaPlaying}
                  hasActiveDownloads={hasActiveDownloads}
                  onRemoveSpace={(space) => void removeSpaceNative(space)}
                  onRenameSpace={(space) => void renameSpaceNative(space)}
                  onSelectSpace={setActiveSpacePath}
                  onSendChat={(message) => void startNativeChat(message)}
                  onStopChat={() => void stopNativeChat()}
                  onClearBrowserError={() => setBrowserLoadError('')}
                  onSetBrowserError={setBrowserLoadError}
                  onRemoveVisit={removeHistoryEntry}
                  onClearHistory={clearHistory}
                  onReopenClosedTab={reopenClosedTab}
                  searchEngineId={searchEngineId}
                  onSearchEngineChange={setSearchEngineId}
                />
              </div>

              {copilotOpen && (
                <CopilotSplitView
                  isOpen={copilotOpen}
                  onClose={() => setCopilotOpen(false)}
                  onMinimize={() => setCopilotOpen(false)}
                  botName={setupState.botName || 'Nova'}
                  modelName={setupState.model || 'Sidekick Pro'}
                  messages={chatMessages}
                  busy={sidekickBusy}
                  onSendMessage={(msg) => void startNativeChat(msg)}
                  onStopChat={() => void stopNativeChat()}
                  activeUrl={activeTab.url}
                  activeTitle={activeTab.title}
                  quickActions={quickActions}
                  onExecuteQuickAction={handleExecuteQuickAction}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <WindowTitlebar
            tabs={tabs}
            activeTabId={activeTab.id}
            draggedTabId={draggedTabId}
            onActivateTab={(tabId) => {
              activeTabIdRef.current = tabId;
              setActiveTabId(tabId);
              setActivePanel('browser');
            }}
            onCloseTab={closeTab}
            onMoveTab={moveTab}
            onNewTab={() => addTab()}
            onPinTab={toggleTabPinned}
            onToggleTabMute={toggleTabMute}
            onDragStartTab={setDraggedTabId}
            onDragEndTab={() => setDraggedTabId(null)}
          />
          <div className="browser-chrome">
            <header
              className={`topbar ${windowMaximized ? 'is-maximized' : ''}`}
              onDoubleClick={handleTopbarDoubleClick}
              onMouseDown={handleTopbarMouseDown}
            >
              <div className="traffic-actions">
                <button type="button" aria-label="Back" onClick={() => webviewRef.current?.goBack()}><ChevronLeft size={17} /></button>
                <button type="button" aria-label="Forward" onClick={() => webviewRef.current?.goForward()}><ChevronRight size={17} /></button>
                <button
                  type="button"
                  aria-label={activeTab.isLoading ? 'Stop loading' : 'Reload'}
                  onClick={() => {
                    if (activeTab.isLoading) {
                      try {
                        webviewRef.current?.stop();
                      } catch {
                        // ignore
                      }
                      updateLoading(activeTab.id, false);
                    } else {
                      webviewRef.current?.reload();
                    }
                  }}
                >
                  {activeTab.isLoading ? <X size={16} /> : <RefreshCw size={16} />}
                </button>
              </div>
              <AddressBar
                value={addressValue}
                onChange={setAddressValue}
                onSubmit={navigate}
                bookmarks={bookmarks}
                visits={visitedSites}
                searchEngineId={searchEngineId}
                activeBookmarkable={activeBookmarkable}
                activeBookmarked={activeBookmarked}
                onToggleBookmark={toggleActiveBookmark}
                inputRef={addressInputRef}
              />
              <SpaceSelector
                activePath={activeSpacePath}
                error={spacesError}
                spaces={spaces}
                onOpenSpaces={() => setActivePanel('workspaces')}
                onSelect={(path) => setActiveSpacePath(path)}
              />
              <ProfileSwitcher
                profiles={profiles}
                activeProfileId={activeProfile.id}
                onSelect={switchProfile}
                onCreate={createProfileEntry}
                onRename={renameProfileEntry}
                onDelete={deleteProfileEntry}
              />
              <div className={`runtime-pill ${status?.sidekick === 'ready' ? 'ready' : 'starting'}`}>
                <span className="status-dot" />
                <span>{status?.sidekick === 'ready' ? 'sidekick online' : 'sidekick starting'}</span>
              </div>
              <UpdatePill status={updateStatus} />
            </header>
            <BookmarkBar
              activeBookmarkable={activeBookmarkable}
              activeBookmarked={activeBookmarked}
              bookmarks={bookmarks}
              onNavigate={navigate}
              onRemove={removeBookmarkItem}
              onToggleActive={toggleActiveBookmark}
              onImport={importBookmarkItems}
            />
          </div>

          <main
            className={`workspace ${leftSidebarCollapsed ? 'left-collapsed' : ''} ${contextSidebarCollapsed ? 'context-collapsed' : ''} ${workspacePanelCollapsed ? 'workspace-collapsed' : ''}`}
            style={{
              '--left-rail-width': `${leftSidebarCollapsed ? COLLAPSED_LEFT_RAIL_WIDTH : DEFAULT_LEFT_RAIL_WIDTH}px`,
              '--context-sidebar-width': `${contextSidebarCollapsed ? COLLAPSED_PANEL_WIDTH : contextSidebarWidth}px`,
              '--workspace-panel-width': `${workspacePanelCollapsed ? COLLAPSED_PANEL_WIDTH : workspacePanelWidth}px`
            } as React.CSSProperties}
          >
            <ShellRail
              activePanel={activePanel}
              leftCollapsed={leftSidebarCollapsed}
              installedSidebarApps={installedSidebarApps}
              onPanel={(panel) => {
                setActivePanel(panel);
                if (panel === 'browser') {
                  setBrowserMode('search');
                }
              }}
              onToggleLeft={() => setLeftSidebarCollapsed((current) => !current)}
            />
            <ContextSidebar
              activePanel={activePanel}
              activeSessionId={activeSessionId}
              busy={sidekickBusy}
              collapsed={contextSidebarCollapsed}
              activeContextItem={activeContextItem}
              messages={messages}
              search={sessionSearch}
              sessions={sessions}
              serviceStatus={status}
              sessionError={sessionError}
              projects={projects}
              activeProjectFilter={activeProjectFilter}
              activeTagFilter={activeTagFilter}
              onAction={runSidekickAction}
              onNewSession={() => void createNativeSession()}
              onPanel={setActivePanel}
              onDeleteSession={(session) => void deleteNativeSession(session)}
              onDuplicateSession={(session) => void duplicateNativeSession(session)}
              onRenameSession={(session) => void renameNativeSession(session)}
              onPinSession={(session) => (session.pinned ? unpinNativeSession : pinNativeSession)(session)}
              onArchiveSession={(session) => archiveNativeSession(session)}
              onSearch={setSessionSearch}
              onSelectSession={(sessionId) => {
                setActiveSessionId(sessionId);
                setActivePanel('chat');
              }}
              onContextItemChange={setActiveContextItem}
              onBrowserModeChange={setBrowserMode}
              onToggleCollapse={() => setContextSidebarCollapsed((current) => !current)}
              onResizeStart={(event) => beginSidebarResize('context', event)}
              onProjectFilter={setActiveProjectFilter}
              onTagFilter={setActiveTagFilter}
            />
            <BrowserMain
              activePanel={activePanel}
              activeSession={activeSession}
              activeSessionId={activeSessionId}
              activeTab={activeTab}
              activeProfile={activeProfile}
              onboardingStatus={onboardingStatus}
              onReopenSetup={() => {
                setSetupDismissed(false);
                try {
                  window.localStorage.removeItem('lastbrowser.setupDismissed');
                } catch {
                  // Storage unavailable — the wizard still opens for this session.
                }
              }}
              busy={sidekickBusy}
              chatError={chatError}
              chatMessages={chatMessages}
              chatRunState={chatRunState}
              composerMode={composerMode}
              composerText={composerText}
              bookmarks={bookmarks}
              serviceStatus={status}
              sessionLoading={activeSessionLoading}
              setupModel={setupState.model}
              spaces={spaces}
              activeSpacePath={activeSpacePath}
              browserMode={browserMode}
              browserLoadError={browserLoadError}
              visitedSites={visitedSites}
              browserFrameRef={browserFrameRef}
              activeContextItem={activeContextItem}
              webviewRef={webviewRef}
              onAction={runSidekickAction}
              onComposerMode={setComposerMode}
              onComposerText={setComposerText}
              onCreateSession={() => void createNativeSession()}
              onAddSpace={(path, name) => void addSpaceNative(path, name)}
              onMoveSpace={(space, direction) => void moveSpaceNative(space, direction)}
              onNavigate={navigate}
              onInstalledSidebarApp={(panel) => setInstalledSidebarApps((current) => Array.from(new Set([...current, panel])))}
              onUninstalledSidebarApp={(panel) => setInstalledSidebarApps((current) => current.filter((item) => item !== panel))}
              onWebviewNavigate={updateUrl}
              onWebviewTitle={updateTitle}
              onWebviewFavicon={updateFavicon}
              onWebviewLoading={updateLoading}
              onWebviewMediaPlaying={updateMediaPlaying}
              hasActiveDownloads={hasActiveDownloads}
              onRemoveSpace={(space) => void removeSpaceNative(space)}
              onRenameSpace={(space) => void renameSpaceNative(space)}
              onSelectSpace={setActiveSpacePath}
              onSendChat={(message) => void startNativeChat(message)}
              onStopChat={() => void stopNativeChat()}
              onClearBrowserError={() => setBrowserLoadError('')}
              onSetBrowserError={setBrowserLoadError}
              onRemoveVisit={removeHistoryEntry}
              onClearHistory={clearHistory}
              onReopenClosedTab={reopenClosedTab}
              searchEngineId={searchEngineId}
              onSearchEngineChange={setSearchEngineId}
            />
            <WorkspacePanel
              activeSessionId={activeSessionId}
              collapsed={workspacePanelCollapsed}
              entries={workspaceEntries}
              error={workspaceError}
              editing={workspaceEditing}
              draft={workspacePreviewDraft}
              showHidden={workspaceShowHidden}
              path={workspacePath}
              preview={workspacePreview}
              serviceStatus={status}
              onEntry={readWorkspaceEntry}
              onCreateFile={() => void createWorkspaceFileNative()}
              onCreateFolder={() => void createWorkspaceFolderNative()}
              onDeleteEntry={(entry) => void deleteWorkspaceEntryNative(entry)}
              onDraft={setWorkspacePreviewDraft}
              onRenameEntry={(entry) => void renameWorkspaceEntryNative(entry)}
              onSavePreview={() => void saveWorkspacePreviewNative()}
              onToggleEditing={() => setWorkspaceEditing((current) => !current)}
              onToggleHidden={() => setWorkspaceShowHidden((current) => !current)}
              onParent={() => {
                setWorkspacePath(parentPath(workspacePath));
                setWorkspacePreview(null);
                setWorkspacePreviewDraft('');
                setWorkspaceEditing(false);
              }}
              onRefresh={() => setWorkspaceRefreshNonce((current) => current + 1)}
              onToggle={() => setWorkspacePanelCollapsed((current) => !current)}
              onResizeStart={(event) => beginSidebarResize('workspace', event)}
            />
          </main>
        </>
      )}
        {setupRequired && (
          <FirstRunSetupPane
            status={status}
            onboardingStatus={onboardingStatus}
            setupLoading={setupLoading}
            error={setupError}
            saving={setupSaving}
            onRefreshOnboarding={refreshOnboardingStatus}
            onSubmit={completeSetup}
            onDismiss={() => {
              setSetupDismissed(true);
              try {
                window.localStorage.setItem('lastbrowser.setupDismissed', '1');
              } catch {
                // Storage unavailable — the wizard stays dismissed for this session.
              }
            }}
          />
        )}
        <CommandPalette />
    </div>
    </DesktopI18nProvider>
  );
}

function BrowserMain({
  activePanel,
  activeSession,
  activeSessionId,
  activeTab,
  activeProfile,
  onboardingStatus,
  onReopenSetup,
  busy,
  chatError,
  chatMessages,
  chatRunState,
  activeContextItem,
  bookmarks,
  browserMode,
  composerMode,
  composerText,
  serviceStatus,
  sessionLoading,
  setupModel,
  spaces,
  activeSpacePath,
  browserLoadError,
  visitedSites,
  browserFrameRef,
  webviewRef,
  onAction,
  onAddSpace,
  onComposerMode,
  onComposerText,
  onCreateSession,
  onMoveSpace,
  onNavigate,
  onInstalledSidebarApp,
  onUninstalledSidebarApp,
  onWebviewNavigate,
  onWebviewTitle,
  onWebviewFavicon,
  onWebviewLoading,
  onWebviewMediaPlaying,
  hasActiveDownloads,
  onRemoveSpace,
  onRenameSpace,
  onSelectSpace,
  onSendChat,
  onStopChat,
  onClearBrowserError,
  onSetBrowserError,
  onRemoveVisit,
  onClearHistory,
  onReopenClosedTab,
  searchEngineId,
  onSearchEngineChange
}: {
  activePanel: LastbrowserPanelId;
  activeSession: DesktopSessionDetail | null;
  activeSessionId: string | null;
  activeTab: BrowserTab;
  activeProfile: BrowserProfile;
  onboardingStatus: OnboardingStatus | null;
  onReopenSetup: () => void;
  busy: boolean;
  chatError: string;
  chatMessages: DesktopChatMessage[];
  chatRunState: ChatRunState;
  activeContextItem: string;
  bookmarks: BrowserBookmark[];
  browserMode: 'home' | 'search' | 'web';
  composerMode: ComposerMode;
  composerText: string;
  serviceStatus: ServiceStatus | null;
  sessionLoading: boolean;
  setupModel: string;
  spaces: SpaceSummary[];
  activeSpacePath: string;
  browserLoadError: string;
  visitedSites: BrowserVisit[];
  browserFrameRef: React.MutableRefObject<HTMLDivElement | null>;
  webviewRef: React.MutableRefObject<Electron.WebviewTag | null>;
  onAction: (action: SidekickActionId) => Promise<void>;
  onAddSpace: (path: string, name: string) => void;
  onComposerMode: (mode: ComposerMode) => void;
  onComposerText: (text: string) => void;
  onCreateSession: () => void;
  onMoveSpace: (space: SpaceSummary, direction: -1 | 1) => void;
  onNavigate: (url: string) => void;
  onInstalledSidebarApp: (panel: LastbrowserPanelId) => void;
  onUninstalledSidebarApp: (panel: LastbrowserPanelId) => void;
  onWebviewNavigate: (tabId: string, url: string) => void;
  onWebviewTitle: (tabId: string, title: string) => void;
  onWebviewFavicon?: (tabId: string, favicon: string) => void;
  onWebviewLoading?: (tabId: string, isLoading: boolean) => void;
  onWebviewMediaPlaying?: (tabId: string, isPlaying: boolean) => void;
  hasActiveDownloads?: boolean;
  onRemoveSpace: (space: SpaceSummary) => void;
  onRenameSpace: (space: SpaceSummary) => void;
  onSelectSpace: (path: string) => void;
  onSendChat: (message: string) => void;
  onStopChat: () => void;
  onClearBrowserError: () => void;
  onSetBrowserError: (error: string) => void;
  onRemoveVisit: (url: string) => void;
  onClearHistory: () => void;
  onReopenClosedTab: () => void;
  searchEngineId: string;
  onSearchEngineChange: (id: string) => void;
}): JSX.Element {
  const browserWebviewStyle = {
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0
  } as React.CSSProperties;



  // Electron creates the guest webContents with the size the <webview> had at
  // mount time, and later CSS/size changes on that element do NOT resize the
  // guest (verified: explicit px size and display toggles both leave the guest
  // at its initial height). Only re-creating the element gives the guest the
  // correct bounds. So we mount the webview, then remount it once the frame
  // has been laid out — that second mount is the one that sticks.
  const [webviewReady, setWebviewReady] = useState(false);
  const [webviewMountKey, setWebviewMountKey] = useState(0);
  useLayoutEffect(() => {
    setWebviewReady(false);
    let cancelled = false;
    let attempts = 0;
    const measure = () => {
      if (cancelled) return;
      const frame = browserFrameRef.current;
      const rect = frame?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        setWebviewReady(true);
        // Force one remount so the guest is created with the real bounds.
        setWebviewMountKey((current) => current + 1);
        return;
      }
      // Give up after ~1s so a missing frame cannot block browsing forever.
      if (attempts++ < 60) window.requestAnimationFrame(measure);
      else setWebviewReady(true);
    };
    measure();
    return () => {
      cancelled = true;
    };
  }, [activeTab.id, activeProfile.id, activePanel]);

  // Browsers are unusable without zoom: dense pages need scaling down, small
  // text needs scaling up. The guest webContents owns the zoom factor, so it
  // must be re-applied whenever the webview is recreated (profile/tab switch).
  const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const [zoomFactor, setZoomFactor] = useState<number>(() => {
    try {
      const stored = Number(window.localStorage.getItem('lastbrowser.zoomFactor'));
      return Number.isFinite(stored) && stored > 0 ? stored : 1;
    } catch {
      return 1;
    }
  });

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(3, Math.max(0.5, next));
    setZoomFactor(clamped);
    try {
      window.localStorage.setItem('lastbrowser.zoomFactor', String(clamped));
    } catch {
      // Storage unavailable — zoom still applies for this session.
    }
    const view = webviewRef.current;
    if (view && typeof view.setZoomFactor === 'function') {
      try {
        view.setZoomFactor(clamped);
      } catch {
        // Guest not ready yet; the effect below re-applies on dom-ready.
      }
    }
  }, []);

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoomFactor((current) => {
      const index = ZOOM_STEPS.findIndex((step) => step >= current - 0.001);
      const from = index >= 0 ? index : ZOOM_STEPS.length - 1;
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, from + direction))];
      const clamped = Math.min(3, Math.max(0.5, next));
      try {
        window.localStorage.setItem('lastbrowser.zoomFactor', String(clamped));
      } catch {
        // ignore
      }
      const view = webviewRef.current;
      if (view && typeof view.setZoomFactor === 'function') {
        try {
          view.setZoomFactor(clamped);
        } catch {
          // ignore
        }
      }
      return clamped;
    });
  }, []);

  // Re-apply the stored zoom whenever the guest is (re)created.
  useEffect(() => {
    const view = webviewRef.current;
    if (!view || typeof view.setZoomFactor !== 'function') return;
    try {
      view.setZoomFactor(zoomFactor);
    } catch {
      // ignore
    }
  }, [zoomFactor, webviewMountKey, webviewReady]);

  // Sync tab muted state to the active webview
  useEffect(() => {
    const view = webviewRef.current;
    if (!view || typeof view.setAudioMuted !== 'function') return;
    try {
      view.setAudioMuted(Boolean(activeTab.isMuted));
    } catch {
      // ignore
    }
  }, [activeTab.id, activeTab.isMuted, webviewMountKey, webviewReady]);

  // ── Guest navigation events ──────────────────────────────────────────────
  // React does NOT wire the webview's DOM events from JSX props: `onDidNavigate`
  // and friends are silently ignored (verified — the address bar kept the old
  // URL after the guest had already navigated, and history recorded nothing).
  // The events must be registered imperatively on the element.
  useEffect(() => {
    let cancelled = false;
    let attached: Electron.WebviewTag | null = null;
    let attempts = 0;

    const onNavigate = (event: Event) => {
      const url = (event as unknown as { url?: string }).url;
      if (typeof url === 'string' && url) onWebviewNavigate(activeTab.id, url);
    };
    const onTitle = (event: Event) => {
      const title = (event as unknown as { title?: string }).title;
      if (typeof title === 'string') onWebviewTitle(activeTab.id, title);
    };
    const onFavicon = (event: Event) => {
      const favicons = (event as unknown as { favicons?: string[] }).favicons;
      if (favicons && favicons.length > 0 && favicons[0]) {
        onWebviewFavicon?.(activeTab.id, favicons[0]);
      }
    };
    const onStartLoading = () => {
      onWebviewLoading?.(activeTab.id, true);
    };
    const onStopLoading = () => {
      onWebviewLoading?.(activeTab.id, false);
    };
    const onFailLoad = () => {
      onWebviewLoading?.(activeTab.id, false);
    };
    const onCrash = () => {
      onWebviewLoading?.(activeTab.id, false);
      onSetBrowserError?.('The web page crashed or was terminated unexpectedly.');
    };
    const onMediaStarted = () => {
      onWebviewMediaPlaying?.(activeTab.id, true);
    };
    const onMediaPaused = () => {
      onWebviewMediaPlaying?.(activeTab.id, false);
    };

    const attach = () => {
      if (cancelled) return;
      const view = webviewRef.current;
      if (!view || typeof view.addEventListener !== 'function') {
        if (attempts++ < 120) window.requestAnimationFrame(attach);
        return;
      }
      attached = view;
      view.addEventListener('did-navigate', onNavigate);
      view.addEventListener('did-navigate-in-page', onNavigate);
      view.addEventListener('page-title-updated', onTitle);
      view.addEventListener('page-favicon-updated', onFavicon);
      view.addEventListener('did-start-loading', onStartLoading);
      view.addEventListener('did-stop-loading', onStopLoading);
      view.addEventListener('did-fail-load', onFailLoad);
      view.addEventListener('render-process-gone', onCrash);
      view.addEventListener('media-started-playing', onMediaStarted);
      view.addEventListener('media-paused', onMediaPaused);
    };
    attach();

    return () => {
      cancelled = true;
      if (attached) {
        try {
          attached.removeEventListener('did-navigate', onNavigate);
          attached.removeEventListener('did-navigate-in-page', onNavigate);
          attached.removeEventListener('page-title-updated', onTitle);
          attached.removeEventListener('page-favicon-updated', onFavicon);
          attached.removeEventListener('did-start-loading', onStartLoading);
          attached.removeEventListener('did-stop-loading', onStopLoading);
          attached.removeEventListener('did-fail-load', onFailLoad);
          attached.removeEventListener('render-process-gone', onCrash);
          attached.removeEventListener('media-started-playing', onMediaStarted);
          attached.removeEventListener('media-paused', onMediaPaused);
        } catch {
          // ignore
        }
      }
    };
  }, [activeTab.id, webviewMountKey, webviewReady, onWebviewNavigate, onWebviewTitle, onWebviewFavicon, onWebviewLoading, onWebviewMediaPlaying, onSetBrowserError]);

  // Ctrl/Cmd +, -, 0 — the shortcuts every browser user reaches for.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        stepZoom(1);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        stepZoom(-1);
      } else if (event.key === '0') {
        event.preventDefault();
        applyZoom(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepZoom, applyZoom]);

  // Ctrl/Cmd+Shift+T reopens the most recently closed tab.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      if (event.key !== 'T' && event.key !== 't') return;
      event.preventDefault();
      onReopenClosedTab();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onReopenClosedTab]);

  // ── DevTools + per-tab mute ──────────────────────────────────────────────
  // Both are per-guest: the webContents is recreated on profile/tab switch, so
  // the state must be re-read whenever the element is (re)created.
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  const toggleDevTools = useCallback(() => {
    const view = webviewRef.current;
    if (!view || typeof view.openDevTools !== 'function') return;
    try {
      if (view.isDevToolsOpened()) {
        view.closeDevTools();
        setDevToolsOpen(false);
      } else {
        // 'right' keeps the page visible — a bottom dock eats the viewport on
        // a laptop screen.
        view.openDevTools({ mode: 'right' });
        setDevToolsOpen(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleMute = useCallback(() => {
    const view = webviewRef.current;
    if (!view || typeof view.setAudioMuted !== 'function') return;
    setMuted((current) => {
      const next = !current;
      try {
        view.setAudioMuted(next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Re-read both flags when the guest is recreated.
  useEffect(() => {
    const view = webviewRef.current;
    if (!view) return;
    try {
      setMuted(typeof view.isAudioMuted === 'function' ? view.isAudioMuted() : false);
      setDevToolsOpen(typeof view.isDevToolsOpened === 'function' ? view.isDevToolsOpened() : false);
    } catch {
      // ignore
    }
  }, [webviewMountKey, webviewReady, activeTab.id]);

  // F12 toggles DevTools; Ctrl/Cmd+M mutes the tab.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F12') {
        event.preventDefault();
        toggleDevTools();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'm' || event.key === 'M')) {
        event.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleDevTools, toggleMute]);

  // ── Find in page ─────────────────────────────────────────────────────────
  // Ctrl+F is muscle memory; without it long pages are unnavigable. The guest
  // reports matches via 'found-in-page', which we surface as "3 / 12".
  const {
    findOpen,
    setFindOpen,
    downloadsOpen,
    setDownloadsOpen,
    historyOpen,
    setHistoryOpen,
    permissionsOpen,
    setPermissionsOpen
  } = usePanelStore();
  const [findQuery, setFindQuery] = useState('');
  const [findResult, setFindResult] = useState<{ matches: number; active: number } | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (findOpen) {
      window.setTimeout(() => findInputRef.current?.select(), 0);
    }
  }, [findOpen]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindResult(null);
    const view = webviewRef.current;
    if (view && typeof view.stopFindInPage === 'function') {
      try {
        view.stopFindInPage('clearSelection');
      } catch {
        // ignore
      }
    }
  }, [setFindOpen]);

  const runFind = useCallback((query: string, forward = true) => {
    const view = webviewRef.current;
    if (!view || typeof view.findInPage !== 'function') return;
    if (!query) {
      setFindResult(null);
      try {
        view.stopFindInPage('clearSelection');
      } catch {
        // ignore
      }
      return;
    }
    try {
      // `forward` selects the direction; `findNext` advances to the next match
      // instead of restarting from the top. Passing `!forward` here inverted
      // the search and produced no result at all.
      view.findInPage(query, { forward, findNext: true });
    } catch {
      // ignore
    }
  }, []);

  // Ctrl+F opens the bar; Escape closes it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        setFindOpen(true);
        window.setTimeout(() => findInputRef.current?.select(), 0);
      } else if (event.key === 'Escape' && findOpen) {
        closeFind();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [findOpen, closeFind]);

  // Surface match counts from the guest.
  //
  // The ref is still null on the first effect run (React attaches refs after
  // render), so a plain `webviewRef.current` check silently skips the listener
  // and the counter stays at 0/0 forever. Retry on the next frame until the
  // element exists.
  useEffect(() => {
    let cancelled = false;
    let attached: Electron.WebviewTag | null = null;
    let attempts = 0;

    const onFound = (event: Event) => {
      const detail = (event as unknown as { result?: { matches?: number; activeMatchOrdinal?: number } }).result;
      if (!detail) return;
      setFindResult({ matches: detail.matches ?? 0, active: detail.activeMatchOrdinal ?? 0 });
    };

    const attach = () => {
      if (cancelled) return;
      const view = webviewRef.current;
      if (!view || typeof view.addEventListener !== 'function') {
        if (attempts++ < 120) window.requestAnimationFrame(attach);
        return;
      }
      attached = view;
      view.addEventListener('found-in-page', onFound as EventListener);
    };
    attach();

    return () => {
      cancelled = true;
      if (attached) {
        try {
          attached.removeEventListener('found-in-page', onFound as EventListener);
        } catch {
          // ignore
        }
      }
    };
  }, [webviewMountKey, webviewReady]);

  if (activePanel === 'chat') {
    return (
      <PanelErrorBoundary panel={activePanel} key={activePanel}>
        <NativeChatMain
          activeSession={activeSession}
          activeSessionId={activeSessionId}
          busy={busy}
          chatError={chatError}
          messages={chatMessages}
          runState={chatRunState}
          composerMode={composerMode}
          composerText={composerText}
          serviceStatus={serviceStatus}
          sessionLoading={sessionLoading}
          setupModel={setupModel}
          activeSpacePath={activeSpacePath}
          onComposerMode={onComposerMode}
          onComposerText={onComposerText}
          onCreateSession={onCreateSession}
          onSend={onSendChat}
          onStop={onStopChat}
        />
      </PanelErrorBoundary>
    );
  }

  if (activePanel !== 'browser') {
    switch (activePanel) {
      case 'workspaces':
        return (
          <PanelErrorBoundary panel={activePanel} key={activePanel}>
            <NativeSpacesMain
              activeSpacePath={activeSpacePath}
              activeContextItem={activeContextItem}
              error=""
              serviceStatus={serviceStatus}
              spaces={spaces}
              onAddSpace={onAddSpace}
              onMoveSpace={onMoveSpace}
              onRemoveSpace={onRemoveSpace}
              onRenameSpace={onRenameSpace}
              onSelectSpace={onSelectSpace}
              onNewSession={onCreateSession}
            />
          </PanelErrorBoundary>
        );
      case 'tasks':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeTasksMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'kanban':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeKanbanMain activeContextItem={activeContextItem} activeSpacePath={activeSpacePath} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'todos':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeTodosMain activeContextItem={activeContextItem} activeSession={activeSession} messages={chatMessages} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'skills':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeSkillsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'agents':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeAgentsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'profiles':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeProfilesMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'memory':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeMemoryMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'insights':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeInsightsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'logs':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeLogsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'gmail':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeGmailMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'discord':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeDiscordMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'appstore':
        return (
          <PanelErrorBoundary panel={activePanel} key={activePanel}>
            <NativeAppstoreMain
              activeContextItem={activeContextItem}
              serviceStatus={serviceStatus}
              onInstalledSidebarApp={onInstalledSidebarApp}
              onUninstalledSidebarApp={onUninstalledSidebarApp}
            />
          </PanelErrorBoundary>
        );
      case 'settings':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeSettingsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} onboardingStatus={onboardingStatus} onReopenSetup={onReopenSetup} searchEngineId={searchEngineId} onSearchEngineChange={onSearchEngineChange} /></PanelErrorBoundary>;
      case 'terminal':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeTerminalMain serviceStatus={serviceStatus} activeSessionId={activeSessionId} workspacePath={activeSpacePath} /></PanelErrorBoundary>;
      default:
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeChatMain activeSession={activeSession} activeSessionId={activeSessionId} busy={busy} chatError={chatError} messages={chatMessages} runState={chatRunState} composerMode={composerMode} composerText={composerText} serviceStatus={serviceStatus} sessionLoading={sessionLoading} setupModel={setupModel} activeSpacePath={activeSpacePath} onComposerMode={onComposerMode} onComposerText={onComposerText} onCreateSession={onCreateSession} onSend={onSendChat} onStop={onStopChat} /></PanelErrorBoundary>;
    }
  }

  if (browserMode === 'search') {
    return <PanelErrorBoundary panel="browser" key="browser-search"><NativeAiBrowserMain serviceStatus={serviceStatus} onNavigate={onNavigate} /></PanelErrorBoundary>;
  }

  if (browserMode === 'home' || isAiBrowserHomeUrl(activeTab.url)) {
    return (
      <PanelErrorBoundary panel="browser" key="browser-home">
        <NativeBrowserStartPage
          bookmarks={bookmarks}
          visits={visitedSites}
          onNavigate={onNavigate}
          onAskAi={(prompt) => {
            setCopilotOpen(true);
            void onSendChat(prompt);
          }}
          onOpenCommandPalette={() => usePanelStore.getState().setCommandPaletteOpen(true)}
        />
      </PanelErrorBoundary>
    );
  }

  return (
    <PanelErrorBoundary panel="browser" key={activeTab.id}>
    <section className="browser-main browser-page-main">
      <div className="browser-action-strip" aria-label="Sidekick page actions">
        <button type="button" onClick={() => void onAction('summarize-page')} disabled={busy}>
          <Sparkles size={14} />
          <span>Summarize</span>
        </button>
        <button type="button" onClick={() => void onAction('explain-selection')} disabled={busy}>
          <MessageSquare size={14} />
          <span>Explain</span>
        </button>
        <button type="button" onClick={() => void onAction('research-page')} disabled={busy}>
          <Globe2 size={14} />
          <span>Research</span>
        </button>
        {/* Zoom indicator — only visible when zoomed away from 100%, so it does
            not add noise for the common case. Clicking resets to 100%. */}
        {Math.abs(zoomFactor - 1) > 0.001 && (
          <button
            type="button"
            className="zoom-indicator"
            title="Reset zoom to 100% (Ctrl+0)"
            onClick={() => applyZoom(1)}
          >
            {Math.round(zoomFactor * 100)}%
          </button>
        )}
        <button type="button" className="find-trigger" title="Find in page (Ctrl+F)" onClick={() => setFindOpen(true)}>
          <Search size={14} />
        </button>
        <button
          type="button"
          className="downloads-trigger"
          title="Downloads (Ctrl+J)"
          onClick={() => setDownloadsOpen((current) => !current)}
        >
          <Download size={14} />
          {hasActiveDownloads && <span className="downloads-active-dot" />}
        </button>
        <button type="button" className="history-trigger" title="History" onClick={() => setHistoryOpen((current) => !current)}>
          <Clock size={14} />
        </button>
        <button
          type="button"
          className={`mute-trigger ${muted ? 'active' : ''}`}
          title={muted ? 'Unmute tab (Ctrl+M)' : 'Mute tab (Ctrl+M)'}
          aria-pressed={muted}
          onClick={toggleMute}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <button
          type="button"
          className={`devtools-trigger ${devToolsOpen ? 'active' : ''}`}
          title="Toggle DevTools (F12)"
          aria-pressed={devToolsOpen}
          onClick={toggleDevTools}
        >
          <Code2 size={14} />
        </button>
        <SitePermissionButton url={activeTab.url} />
        <button
          type="button"
          className="permissions-trigger"
          title="Site permissions"
          onClick={() => setPermissionsOpen((current) => !current)}
        >
          <ShieldCheck size={14} />
        </button>
      </div>
      <PermissionsPanel open={permissionsOpen} onClose={() => setPermissionsOpen(false)} />
      <DownloadsPanel open={downloadsOpen} onClose={() => setDownloadsOpen(false)} />
      <HistoryPanel
        open={historyOpen}
        visits={visitedSites}
        onClose={() => setHistoryOpen(false)}
        onOpen={(url) => onNavigate(url)}
        onRemove={(url) => onRemoveVisit(url)}
        onClear={() => onClearHistory()}
      />
      <div className="browser-webview-frame" ref={browserFrameRef}>
        <LiveAutomationBanner webview={webviewRef.current} />
        {findOpen && (
          <div className="find-bar" role="search">
            <Search size={14} />
            <input
              ref={findInputRef}
              value={findQuery}
              placeholder="Find in page"
              aria-label="Find in page"
              onChange={(event) => {
                setFindQuery(event.target.value);
                runFind(event.target.value, true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  runFind(findQuery, !event.shiftKey);
                }
              }}
            />
            <span className="find-count">
              {findResult ? `${findResult.active} / ${findResult.matches}` : findQuery ? '0 / 0' : ''}
            </span>
            <button
              type="button"
              aria-label="Previous match"
              title="Previous (Shift+Enter)"
              onClick={() => runFind(findQuery, false)}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="Next match"
              title="Next (Enter)"
              onClick={() => runFind(findQuery, true)}
            >
              <ChevronRight size={14} />
            </button>
            <button type="button" aria-label="Close find bar" title="Close (Esc)" onClick={closeFind}>
              <X size={14} />
            </button>
          </div>
        )}
        {browserLoadError && (
          <div className="browser-load-error" role="alert">
            <AlertTriangle size={16} />
            <span>{browserLoadError}</span>
          </div>
        )}
        {webviewReady && (
        <webview
          key={`${activeProfile.id}:${activeTab.id}:${webviewMountKey}`}
          ref={webviewRef}
          src={activeTab.url}
          className="browser-view"
          style={browserWebviewStyle}
          partition={activeTab.incognito ? 'in-memory-incognito' : profilePartition(activeProfile.id)}
          allowpopups="false"
          onDidStartLoading={() => onClearBrowserError()}
          onDomReady={(event) => {
            void hideWebviewScrollbars(event.currentTarget);
          }}
          onDidFailLoad={(event) => {
            if (!event.isMainFrame || event.errorCode === -3) return;
            // Reset to start page on serious load failures to prevent grey screen
            if (event.errorCode < -100) {
              onSetBrowserError(`Connection failed (${event.errorDescription}). Returning to start page.`);
              setTimeout(() => {
                onNavigate(browserStartUrl);
              }, 1500);
            } else {
              onSetBrowserError(`${event.errorCode}: ${event.errorDescription}`);
            }
          }}
        />
        )}
      </div>
    </section>
    </PanelErrorBoundary>
  );
}


function NativeSpacesMain({
  activeSpacePath,
  activeContextItem,
  error,
  serviceStatus,
  spaces,
  onAddSpace,
  onMoveSpace,
  onRemoveSpace,
  onRenameSpace,
  onSelectSpace,
  onNewSession
}: {
  activeSpacePath: string;
  activeContextItem: string;
  error: string;
  serviceStatus: ServiceStatus | null;
  spaces: SpaceSummary[];
  onAddSpace: (path: string, name: string) => void;
  onMoveSpace: (space: SpaceSummary, direction: -1 | 1) => void;
  onRemoveSpace: (space: SpaceSummary) => void;
  onRenameSpace: (space: SpaceSummary) => void;
  onSelectSpace: (path: string) => void;
  onNewSession: () => void;
}): JSX.Element {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Spaces');
  const ready = canCallSidekickApi(serviceStatus);
  const activeSpace = spaces.find((space) => space.path === activeSpacePath) || spaces[0] || null;

  useEffect(() => {
    setSection(activeContextItem || 'Spaces');
  }, [activeContextItem]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!path.trim()) return;
    onAddSpace(path.trim(), name.trim());
    setPath('');
    setName('');
  }

  return (
    <section className="browser-main spaces-main">
      <div className="spaces-header">
        <div>
          <span className="eyebrow">Spaces</span>
          <h1>Workspaces</h1>
          <p>{section === 'Active workspace' ? 'Aktiver Space und Session-Bindung im Fokus.' : section === 'Files' ? 'Spaces steuern den aktiven Workspace und die Datei-Leiste rechts.' : 'Neue Sessions starten im aktiven Space. Die rechte Workspace-Leiste bleibt an die aktive Session gebunden.'}</p>
        </div>
        <div className={`native-chat-status ${ready ? 'ready' : 'starting'}`}>
          <span className={ready ? 'status-dot ready' : 'status-dot'} />
          <span>{ready ? 'Online' : 'Starting'}</span>
        </div>
      </div>
      <div className="native-card-actions insights-tabs">
        {['Spaces', 'Active workspace', 'Files', 'New chat'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <section className="native-work-card detail-json-card">
        <header>
          <strong>{section}</strong>
          {section === 'New chat' && (
            <button type="button" className="primary-action compact" onClick={onNewSession} disabled={!ready}>
              <Plus size={13} />
              <span>Open chat</span>
            </button>
          )}
        </header>
        <pre>{jsonPreview({
          activeSpacePath,
          spaceCount: spaces.length,
          activeSpace,
          hint: section === 'New chat'
            ? 'Open a new chat session in the active space.'
            : section === 'Files'
              ? 'Use the workspace panel on the right to browse files for the active session.'
              : section === 'Active workspace'
                ? 'The active workspace binds new sessions to the current space.'
                : 'Spaces are the top-level workspace selector.'
        })}</pre>
      </section>
      <form className="space-create-form" onSubmit={submit}>
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Portfolio" />
        </label>
        <label>
          <span>Path</span>
          <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="C:\\work\\portfolio" />
        </label>
        <button type="submit" className="primary-action compact" disabled={!ready || !path.trim()}>
          <Plus size={15} />
          <span>Add Space</span>
        </button>
      </form>
      {error && <div className="workspace-error">{error}</div>}
      <AdvancedWebUiTools panel="workspaces" serviceStatus={serviceStatus} compact />
      <div className="spaces-grid">
        {spaces.map((space, index) => (
          <article key={space.path} className={`space-card ${space.path === activeSpacePath ? 'active' : ''}`}>
            <button type="button" className="space-card-main" onClick={() => onSelectSpace(space.path)}>
              <img src={brandAssets.sidebarIcons.folder} alt="" />
              <strong>{spaceDisplayName(space)}</strong>
              <span>{space.path}</span>
            </button>
            <div className="space-card-actions">
              <button type="button" title="Move up" disabled={index === 0} onClick={() => onMoveSpace(space, -1)}><ChevronLeft size={14} /></button>
              <button type="button" title="Move down" disabled={index === spaces.length - 1} onClick={() => onMoveSpace(space, 1)}><ChevronRight size={14} /></button>
              <button type="button" title="Rename space" onClick={() => onRenameSpace(space)}><Edit3 size={14} /></button>
              <button type="button" title="Remove space" onClick={() => onRemoveSpace(space)}><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
        {!spaces.length && (
          <div className="spaces-empty">
            <Folder size={26} />
            <span>{ready ? 'No spaces configured yet.' : 'Sidekick runtime is starting.'}</span>
          </div>
        )}
      </div>
      <section className="native-work-card detail-json-card">
        <header><strong>Active workspace</strong></header>
        <pre>{jsonPreview({
          activeSpacePath,
          activeSpace,
          actions: {
            select: 'Choose a space from the list to make it active',
            chat: 'Use the Open chat button to start a session in the active space'
          }
        })}</pre>
      </section>
    </section>
  );
}

function NativePanelMain({
  activePanel,
  serviceStatus,
  spaces
}: {
  activePanel: LastbrowserPanelId;
  serviceStatus: ServiceStatus | null;
  spaces: SpaceSummary[];
}): JSX.Element {
  const panel = lastbrowserPanels.find((item) => item.id === activePanel) || lastbrowserPanels[0];
  return (
    <section className="browser-main native-panel-main">
      <div className="native-panel-card">
        <img src={brandAssets.sidebarIcons[activePanel]} alt="" />
        <span className="eyebrow">{panel.label}</span>
        <h1>{panel.label}</h1>
        <p>{panel.label} is available in the native Lastbrowser shell.</p>
        {!spaces.length && serviceStatus?.sidekick !== 'ready' && <small>Sidekick runtime is starting.</small>}
      </div>
    </section>
  );
}



function isTransientSidekickFetchError(message: string): boolean {
  return /fetch failed|service is not ready|ECONNREFUSED|unreachable/i.test(message);
}

function normalizeChatMessages(messages: DesktopChatMessage[] | undefined): DesktopChatMessage[] {
  return Array.isArray(messages)
    ? messages.filter((message) => String(message.content || '').trim() || message.role)
    : [];
}

function workspaceLabel(path: string): string {
  if (!path || path === 'default') return 'default';
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function workspacePathParts(path: string): string[] {
  const normalized = (path || '.').replace(/\\/g, '/').replace(/^\.\/?/, '').replace(/\/+$/, '');
  if (!normalized || normalized === '.') return [];
  return normalized.split('/').filter(Boolean);
}

function joinWorkspacePath(basePath: string, name: string): string {
  const cleanName = name.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const base = (basePath || '.').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!base || base === '.') return cleanName;
  return `${base}/${cleanName}`;
}

function isWorkspaceDirectory(entry: WorkspaceTreeEntry): boolean {
  return entry.is_dir === true || entry.type === 'dir' || entry.type === 'directory';
}

function entryFromPreview(preview: WorkspaceFilePreview): WorkspaceTreeEntry {
  const path = preview.path || '';
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return {
    name: parts[parts.length - 1] || path || 'Preview',
    path,
    type: 'file',
    size: preview.size
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}


function parentPath(path: string): string {
  const normalized = (path || '.').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized || normalized === '.') return '.';
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/') || '.';
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}


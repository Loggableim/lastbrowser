import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Columns3,
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
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Sparkles,
  Square,
  Star,
  StopCircle,
  Trash2,
  UserCircle,
  Users,
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
import {
  BrowserTab,
  browserStartUrl,
  createInitialTab,
  isAiBrowserHomeUrl,
  reorderTabs,
  normalizeNavigationInput,
  updateTabTitle,
  updateTabUrl,
  togglePinnedTab
} from './tabs.js';
import { brandAssets } from './brand.js';
import { loadVisitedSites, recordVisit, saveVisitedSites, type BrowserVisit } from './history.js';
import {
  SidekickActionId,
  buildSidekickPrompt,
  collectBrowserContext,
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
  SpaceSummary,
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

type SidekickMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  pending?: boolean;
};

type ComposerMode = 'action' | 'plan';

type SetupForm = {
  provider: string;
  model: string;
  apiKey: string;
};

type CodexOAuthState = {
  status: 'idle' | 'starting' | 'pending' | 'success' | 'expired' | 'cancelled' | 'error';
  flowId?: string;
  verificationUri?: string;
  userCode?: string;
  pollIntervalSeconds?: number;
  message?: string;
};

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

const idleCodexOAuth: CodexOAuthState = { status: 'idle' };

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
  settings: Settings
};

const panelContextItems: Partial<Record<LastbrowserPanelId, string[]>> = {
  skills: ['Library', 'Editor', 'Linked files', 'Create skill'],
  agents: ['Dashboard', 'Agents', 'Chat sessions', 'Workspace terminal', 'Create agent'],
  memory: ['Core memory', 'User facts', 'Supermemory', 'Hybrid search'],
  workspaces: ['Spaces', 'Active workspace', 'Files', 'New chat'],
  profiles: ['Profiles', 'Active profile', 'Gateway', 'Model defaults'],
  tasks: ['Scheduled jobs', 'Active', 'Paused', 'History'],
  kanban: ['Board', 'Triage', 'Running', 'Done'],
  todos: ['Pending', 'In progress', 'Completed'],
  insights: ['Usage', 'Models', 'Cost', 'LLM wiki'],
  logs: ['Agent', 'WebUI', 'Errors', 'Gateway'],
  gmail: ['Accounts', 'Inbox', 'Search', 'AI actions'],
  discord: ['Guild', 'Channels', 'Members', 'Moderation'],
  appstore: ['Home', 'Categories', 'My apps', 'SDK', 'Submit'],
  settings: ['Conversation', 'Appearance', 'Preferences', 'Providers', 'Plugins', 'System'],
  browser: ['AI Search', 'Brief', 'Sources', 'Automation tools']
};

function panelForContextItem(item: string): LastbrowserPanelId | null {
  const label = item.toLowerCase();
  if (['spaces', 'active workspace', 'files'].includes(label)) return 'workspaces';
  if (['scheduled jobs', 'active', 'paused', 'history'].includes(label)) return 'tasks';
  if (['board', 'triage', 'running', 'done'].includes(label)) return 'kanban';
  if (['pending', 'in progress', 'completed'].includes(label)) return 'todos';
  if (['usage', 'models', 'cost', 'llm wiki'].includes(label)) return 'insights';
  if (['agent', 'webui', 'errors'].includes(label)) return 'logs';
  if (['accounts', 'inbox', 'ai actions'].includes(label)) return 'gmail';
  if (['guild', 'channels', 'members', 'moderation'].includes(label)) return 'discord';
  if (['home', 'categories', 'my apps', 'sdk', 'submit'].includes(label)) return 'appstore';
  if (['conversation', 'appearance', 'preferences', 'providers', 'plugins', 'system'].includes(label)) return 'settings';
  if (['ai search', 'brief', 'sources', 'automation tools'].includes(label)) return 'browser';
  return null;
}

export function App(): JSX.Element {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [createInitialTab(browserStartUrl)]);
  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>(() => loadBookmarks(window.localStorage));
  const [visitedSites, setVisitedSites] = useState<BrowserVisit[]>(() => loadVisitedSites(window.localStorage));
  const [desktopSettings, setDesktopSettings] = useState<Record<string, unknown> | null>(() => loadDesktopSettingsFromStorage());
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [addressValue, setAddressValue] = useState(() => (
    isAiBrowserHomeUrl(tabs[0].url) ? '' : tabs[0].url
  ));
  const [activePanel, setActivePanel] = useState<LastbrowserPanelId>(() => loadInitialPanel());
  const [installedSidebarApps, setInstalledSidebarApps] = useState<LastbrowserPanelId[]>(() => loadInstalledSidebarApps(window.localStorage));
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => (
    loadBooleanPreference(undefined, leftSidebarCollapsedStorageKey, false)
  ));
  const [contextSidebarCollapsed, setContextSidebarCollapsed] = useState(false);
  const [contextSidebarWidth, setContextSidebarWidth] = useState(() => (
    loadNumericPreference(undefined, contextSidebarWidthStorageKey, DEFAULT_CONTEXT_SIDEBAR_WIDTH, MIN_CONTEXT_SIDEBAR_WIDTH, MAX_CONTEXT_SIDEBAR_WIDTH)
  ));
  const [workspacePanelCollapsed, setWorkspacePanelCollapsed] = useState(() => (
    loadBooleanPreference(undefined, workspacePanelCollapsedStorageKey, false)
  ));
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(() => (
    loadNumericPreference(undefined, workspacePanelWidthStorageKey, DEFAULT_WORKSPACE_PANEL_WIDTH, MIN_WORKSPACE_PANEL_WIDTH, MAX_WORKSPACE_PANEL_WIDTH)
  ));
  const [activeContextItem, setActiveContextItem] = useState('');
  const [browserMode, setBrowserMode] = useState<'home' | 'search' | 'web'>(() => (
    isAiBrowserHomeUrl(tabs[0].url) ? 'home' : 'web'
  ));
  const [browserLoadError, setBrowserLoadError] = useState('');
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [setupState, setSetupState] = useState<SetupState>(defaultSetupState);
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
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
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
  const [sidekickBusy, setSidekickBusy] = useState(false);
  const [messages, setMessages] = useState<SidekickMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Sidekick is ready for page summaries, selection explanations, and research tasks.'
    }
  ]);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || tabs[0], [activeTabId, tabs]);
  const activeBookmarkable = isBookmarkableUrl(activeTab.url);
  const activeBookmarked = useMemo(() => isBookmarked(bookmarks, activeTab.url), [activeTab.url, bookmarks]);
  const activeTabIdRef = useRef(activeTabId);
  const browserFrameRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const resizeStateRef = useRef<SidebarResizeState | null>(null);
  const contextSidebarWidthRef = useRef(contextSidebarWidth);
  const workspacePanelWidthRef = useRef(workspacePanelWidth);
  const contextSidebarCollapsedRef = useRef(contextSidebarCollapsed);
  const workspacePanelCollapsedRef = useRef(workspacePanelCollapsed);
  const leftSidebarCollapsedRef = useRef(leftSidebarCollapsed);
  const setupRequired = isFirstRunRequired(setupState, onboardingStatus);
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
    return window.lastbrowser.browser.onOpenTab((url) => addTab(url));
  }, []);

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
    const normalized = normalizeNavigationInput(url);
    setTabs((current) => updateTabUrl(current, activeTab.id, normalized));
    setBrowserMode(isAiBrowserHomeUrl(normalized) ? 'home' : 'web');
    setBrowserLoadError('');
    setActivePanel('browser');
  }

  function submitNavigation(event: FormEvent): void {
    event.preventDefault();
    navigate(addressValue.trim() ? addressValue : browserStartUrl);
  }

  function addTab(url = browserStartUrl): void {
    const next = createInitialTab(url);
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

  function closeTab(tabId: string): void {
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      const nextActiveId = nextTabs[Math.max(0, index - 1)].id;
      activeTabIdRef.current = nextActiveId;
      setActiveTabId(nextActiveId);
    }
  }

  function updateTitle(tabId: string, title: string): void {
    setTabs((current) => updateTabTitle(current, tabId, title));
    const tab = tabs.find((item) => item.id === tabId);
    if (tab) {
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
    setVisitedSites((current) => recordVisit(current, url, tab?.title || ''));
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
      const nextStatus = await window.lastbrowser.sidekick.applyCloudSetup({
        provider: form.provider,
        model: form.model,
        apiKey: form.apiKey
      });
      const completeStatus = await window.lastbrowser.sidekick.completeCloudSetup().catch(() => nextStatus);
      const nextState = await window.lastbrowser.setup.save({
        cloudSetupComplete: true,
        provider: form.provider,
        model: form.model
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

  async function pollNativeChat(streamId: string, sessionId: string): Promise<void> {
    const deadline = Date.now() + 120000;
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
        model: setupState.model,
        workspace: activeSpacePath,
        mode: composerMode
      });
      setActiveSessionId(response.sessionId);
      setActiveStreamId(response.streamId);
      setComposerText('');
      setChatRunState('streaming');
      await window.lastbrowser.sidekick.saveDraft({ sessionId: response.sessionId, text: '', files: [] }).catch(() => null);
      await pollNativeChat(response.streamId, response.sessionId);
      setMessages((current) => current.map((item) => (
        item.pending ? { ...item, content: 'Sidekick finished.', pending: false } : item
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

  return (
    <div className={`app-shell panel-${activePanel}`}>
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
        onDragStartTab={setDraggedTabId}
        onDragEndTab={() => setDraggedTabId(null)}
      />
      <div className="browser-chrome">
        <header className="topbar">
          <div className="traffic-actions">
            <button type="button" aria-label="Back" onClick={() => webviewRef.current?.goBack()}><ChevronLeft size={17} /></button>
            <button type="button" aria-label="Forward" onClick={() => webviewRef.current?.goForward()}><ChevronRight size={17} /></button>
            <button type="button" aria-label="Reload" onClick={() => webviewRef.current?.reload()}><RefreshCw size={16} /></button>
          </div>
          <form className="addressbar" onSubmit={submitNavigation}>
            <Globe2 size={16} />
            <input value={addressValue} onChange={(event) => setAddressValue(event.target.value)} aria-label="Address or search" />
            <button
              type="button"
              className={`bookmark-star ${activeBookmarked ? 'active' : ''}`}
              aria-label={activeBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              aria-pressed={activeBookmarked}
              disabled={!activeBookmarkable}
              onClick={toggleActiveBookmark}
            >
              <Star size={15} fill={activeBookmarked ? 'currentColor' : 'none'} />
            </button>
            <button type="submit" aria-label="Navigate"><Search size={16} /></button>
          </form>
          <SpaceSelector
            activePath={activeSpacePath}
            error={spacesError}
            spaces={spaces}
            onOpenSpaces={() => setActivePanel('workspaces')}
            onSelect={(path) => setActiveSpacePath(path)}
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
          onAction={runSidekickAction}
          onNewSession={() => void createNativeSession()}
          onPanel={setActivePanel}
          onDeleteSession={(session) => void deleteNativeSession(session)}
          onDuplicateSession={(session) => void duplicateNativeSession(session)}
          onRenameSession={(session) => void renameNativeSession(session)}
          onSearch={setSessionSearch}
          onSelectSession={(sessionId) => {
            setActiveSessionId(sessionId);
            setActivePanel('chat');
          }}
          onContextItemChange={setActiveContextItem}
          onBrowserModeChange={setBrowserMode}
          onToggleCollapse={() => setContextSidebarCollapsed((current) => !current)}
          onResizeStart={(event) => beginSidebarResize('context', event)}
        />
        <BrowserMain
          activePanel={activePanel}
          activeSession={activeSession}
          activeSessionId={activeSessionId}
          activeTab={activeTab}
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
          onRemoveSpace={(space) => void removeSpaceNative(space)}
          onRenameSpace={(space) => void renameSpaceNative(space)}
          onSelectSpace={setActiveSpacePath}
          onSendChat={(message) => void startNativeChat(message)}
          onStopChat={() => void stopNativeChat()}
          onClearBrowserError={() => setBrowserLoadError('')}
          onSetBrowserError={setBrowserLoadError}
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
        {setupRequired && (
          <FirstRunSetupPane
            status={status}
            onboardingStatus={onboardingStatus}
            setupLoading={setupLoading}
            error={setupError}
            saving={setupSaving}
            onRefreshOnboarding={refreshOnboardingStatus}
            onSubmit={completeSetup}
          />
        )}
      </main>
    </div>
  );
}

function BookmarkBar({
  activeBookmarkable,
  activeBookmarked,
  bookmarks,
  onNavigate,
  onRemove,
  onToggleActive
}: {
  activeBookmarkable: boolean;
  activeBookmarked: boolean;
  bookmarks: BrowserBookmark[];
  onNavigate: (url: string) => void;
  onRemove: (bookmark: BrowserBookmark) => void;
  onToggleActive: () => void;
}): JSX.Element {
  return (
    <nav className="bookmark-bar" aria-label="Bookmarks">
      <div className="bookmark-list">
        {bookmarks.map((bookmark) => (
          <div key={bookmark.id} className="bookmark-item">
            <button
              type="button"
              className="bookmark-open"
              title={bookmark.url}
              onClick={() => onNavigate(bookmark.url)}
            >
              <Star size={13} fill="currentColor" />
              <span>{bookmark.title}</span>
            </button>
            <button
              type="button"
              className="bookmark-remove"
              aria-label={`Remove ${bookmark.title}`}
              onClick={() => onRemove(bookmark)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {!bookmarks.length && <span className="bookmark-empty">No bookmarks yet</span>}
      </div>
      <button
        type="button"
        className={`bookmark-add ${activeBookmarked ? 'active' : ''}`}
        disabled={!activeBookmarkable}
        aria-label={activeBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        aria-pressed={activeBookmarked}
        onClick={onToggleActive}
      >
        <Star size={14} fill={activeBookmarked ? 'currentColor' : 'none'} />
      </button>
    </nav>
  );
}

function UpdatePill({ status }: { status: UpdateStatus | null }): JSX.Element | null {
  if (!status || status.state === 'disabled') return null;
  const visibleStates: UpdateStatus['state'][] = ['checking', 'available', 'downloading', 'downloaded', 'error'];
  if (!visibleStates.includes(status.state)) return null;

  const label = updateLabel(status);
  const handleClick = () => {
    if (status.state === 'downloaded') {
      void window.lastbrowser.updates.install();
      return;
    }
    if (status.state === 'available') {
      void window.lastbrowser.updates.download();
      return;
    }
    if (status.state === 'error') {
      void window.lastbrowser.updates.check();
    }
  };

  return (
    <button
      type="button"
      className={`update-pill ${status.state}`}
      onClick={handleClick}
      disabled={status.state === 'checking' || status.state === 'downloading'}
      title={status.message || label}
    >
      {status.state === 'checking' || status.state === 'downloading'
        ? <Loader2 size={14} className="spin" />
        : status.state === 'downloaded'
          ? <CheckCircle2 size={14} />
          : <RefreshCw size={14} />}
      <span>{label}</span>
    </button>
  );
}

function updateLabel(status: UpdateStatus): string {
  if (status.state === 'checking') return 'checking updates';
  if (status.state === 'available') return status.availableVersion ? `update ${status.availableVersion}` : 'update available';
  if (status.state === 'downloading') return `downloading ${status.percent ?? 0}%`;
  if (status.state === 'downloaded') return 'restart to update';
  if (status.state === 'error') return 'update retry';
  return 'updates';
}

function SpaceSelector({
  activePath,
  error,
  spaces,
  onOpenSpaces,
  onSelect
}: {
  activePath: string;
  error: string;
  spaces: SpaceSummary[];
  onOpenSpaces: () => void;
  onSelect: (path: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const activeSpace = spaces.find((space) => space.path === activePath) || spaces[0] || null;
  const label = activeSpace ? spaceDisplayName(activeSpace) : 'default';

  return (
    <div className="titlebar-space">
      <button
        type="button"
        className={`space-button ${open ? 'open' : ''}`}
        title={error || activeSpace?.path || 'Spaces'}
        onClick={() => setOpen((current) => !current)}
      >
        <img src={brandAssets.sidebarIcons.folder} alt="" />
        <span>{label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="space-dropdown">
          <div className="space-dropdown-head">
            <strong>Spaces</strong>
            <button type="button" onClick={() => { setOpen(false); onOpenSpaces(); }}>
              Manage
            </button>
          </div>
          <div className="space-list">
            {spaces.map((space) => (
              <button
                key={space.path}
                type="button"
                className={space.path === activePath ? 'active' : ''}
                onClick={() => {
                  onSelect(space.path);
                  setOpen(false);
                }}
              >
                <span>{space.emoji || '·'}</span>
                <strong>{spaceDisplayName(space)}</strong>
                <small>{space.path}</small>
              </button>
            ))}
            {!spaces.length && (
              <div className="space-empty">
                {error || 'Sidekick loads spaces when the runtime is online.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WindowTitlebar({
  tabs,
  activeTabId,
  draggedTabId,
  onActivateTab,
  onCloseTab,
  onDragEndTab,
  onDragStartTab,
  onMoveTab,
  onNewTab,
  onPinTab
}: {
  tabs?: BrowserTab[];
  activeTabId?: string;
  draggedTabId?: string | null;
  onActivateTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onDragEndTab?: () => void;
  onDragStartTab?: (tabId: string | null) => void;
  onMoveTab?: (tabId: string, targetTabId: string) => void;
  onNewTab?: () => void;
  onPinTab?: (tabId: string) => void;
}): JSX.Element {
  return (
    <header className="browser-titlebar">
      <div className="brand">
        <img src={brandAssets.appIcon256} alt="" className="brand-mark" />
        <span>lastbrowser</span>
      </div>
      {tabs && activeTabId && onActivateTab && onCloseTab && onNewTab ? (
        <nav className="tabbar" aria-label="Browser tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              draggable
              className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.pinned ? 'pinned' : ''} ${draggedTabId === tab.id ? 'dragging' : ''}`}
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
              <button
                type="button"
                className={`tab-favorite ${tab.pinned ? 'active' : ''}`}
                aria-label={tab.pinned ? `Unfavorite ${tab.title}` : `Favorite ${tab.title}`}
                aria-pressed={Boolean(tab.pinned)}
                onClick={(event) => {
                  event.stopPropagation();
                  onPinTab?.(tab.id);
                }}
              >
                <Star size={11} fill={tab.pinned ? 'currentColor' : 'none'} />
              </button>
              <span>{tab.title}</span>
              <X
                size={13}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
              />
            </div>
          ))}
          <button type="button" className="new-tab" onClick={onNewTab} aria-label="New tab"><Plus size={16} /></button>
        </nav>
      ) : (
        <div className="titlebar-drag-fill" />
      )}
      <WindowControls />
    </header>
  );
}

function WindowControls(): JSX.Element {
  return (
    <div className="window-controls" aria-label="Window controls">
      <button type="button" className="window-control" aria-label="Minimize" onClick={() => void window.lastbrowser.window.minimize()}>
        <Minus size={15} />
      </button>
      <button type="button" className="window-control" aria-label="Maximize or restore" onClick={() => void window.lastbrowser.window.toggleMaximize()}>
        <Square size={13} />
      </button>
      <button type="button" className="window-control close" aria-label="Close" onClick={() => void window.lastbrowser.window.close()}>
        <X size={15} />
      </button>
    </div>
  );
}

function ShellRail({
  activePanel,
  leftCollapsed,
  installedSidebarApps,
  onPanel,
  onToggleLeft
}: {
  activePanel: LastbrowserPanelId;
  leftCollapsed: boolean;
  installedSidebarApps: LastbrowserPanelId[];
  onPanel: (panel: LastbrowserPanelId) => void;
  onToggleLeft: () => void;
}): JSX.Element {
  const visiblePanels = lastbrowserPanels.filter((panel) => panel.id !== 'settings' && isInstalledSidebarApp(panel.id, installedSidebarApps));
  const settingsPanel = lastbrowserPanels.find((panel) => panel.id === 'settings') || lastbrowserPanels[lastbrowserPanels.length - 1];

  return (
    <nav className="shell-rail" aria-label="Lastbrowser navigation">
      <div className="rail-main">
        {visiblePanels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            className={`rail-button ${activePanel === panel.id ? 'active' : ''}`}
            title={panel.tooltip}
            onClick={() => onPanel(panel.id)}
          >
            <img src={brandAssets.sidebarIcons[panel.id]} alt="" />
            <span>{panel.label}</span>
            {panel.id === 'tasks' && <em>9+</em>}
          </button>
        ))}
      </div>
      <div className="rail-bottom">
        <button type="button" className="rail-collapse" title="Toggle sidebar" onClick={onToggleLeft}>
          {leftCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span>Sidebar ein-/ausblenden</span>
        </button>
        <button
          type="button"
          className={`rail-button ${activePanel === 'settings' ? 'active' : ''}`}
          title={settingsPanel.tooltip}
          onClick={() => onPanel('settings')}
        >
          <img src={brandAssets.sidebarIcons.settings} alt="" />
          <span>{settingsPanel.label}</span>
        </button>
      </div>
    </nav>
  );
}

function ContextSidebar({
  activePanel,
  activeSessionId,
  busy,
  collapsed,
  activeContextItem,
  messages,
  search,
  sessions,
  serviceStatus,
  sessionError,
  onAction,
  onNewSession,
  onPanel,
  onDeleteSession,
  onDuplicateSession,
  onRenameSession,
  onSearch,
  onSelectSession,
  onContextItemChange,
  onBrowserModeChange,
  onToggleCollapse,
  onResizeStart
}: {
  activePanel: LastbrowserPanelId;
  activeSessionId: string | null;
  busy: boolean;
  collapsed: boolean;
  activeContextItem: string;
  messages: SidekickMessage[];
  search: string;
  sessions: DesktopSessionSummary[];
  serviceStatus: ServiceStatus | null;
  sessionError: string;
  onAction: (action: SidekickActionId) => Promise<void>;
  onNewSession: () => void;
  onPanel: (panel: LastbrowserPanelId) => void;
  onDeleteSession: (session: DesktopSessionSummary) => void;
  onDuplicateSession: (session: DesktopSessionSummary) => void;
  onRenameSession: (session: DesktopSessionSummary) => void;
  onSearch: (value: string) => void;
  onSelectSession: (sessionId: string) => void;
  onContextItemChange: (item: string) => void;
  onBrowserModeChange: (mode: 'home' | 'search' | 'web') => void;
  onToggleCollapse: () => void;
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
}): JSX.Element {
  const panel = lastbrowserPanels.find((item) => item.id === activePanel) || lastbrowserPanels[0];
  const filteredSessions = sessions.filter((session) => {
    const haystack = `${session.title || ''} ${session.workspace || ''}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const recentMessages = messages.slice(-3);
  const showSessionTools = activePanel === 'chat' || activePanel === 'browser';
  const contextItems = panelContextItems[activePanel] || [];
  const activeContextItemDefault = contextItems[0] || '';

  useEffect(() => {
    onContextItemChange(activeContextItemDefault);
  }, [activeContextItemDefault, onContextItemChange]);

  function handleContextItem(item: string): void {
    onContextItemChange(item);
    if (activePanel === 'browser' && item === 'AI Search') {
      onBrowserModeChange('search');
      return;
    }
    if (item === 'New chat' || item === 'Chat sessions') {
      onNewSession();
      return;
    }
    const targetPanel = panelForContextItem(item);
    if (targetPanel) {
      if (targetPanel === 'browser') {
        onBrowserModeChange(item === 'AI Search' ? 'search' : 'web');
      }
      onPanel(targetPanel);
    }
  }

  if (collapsed) {
    return (
      <aside className="context-sidebar collapsed">
        <button type="button" aria-label="Open context sidebar" title="Open context sidebar" onClick={onToggleCollapse}>
          <PanelLeftOpen size={17} />
        </button>
      </aside>
    );
  }

  return (
    <aside className={`context-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="context-header">
        <div>
          <span className="context-kicker">{panel.id === 'browser' ? 'BROWSER' : panel.label.toUpperCase()}</span>
          <h2>{panel.label}</h2>
        </div>
        <button type="button" aria-label="Collapse sidebar" onClick={onToggleCollapse}>
          <PanelLeftClose size={17} />
        </button>
      </div>

      {showSessionTools && (
        <>
          <button type="button" className="new-session-button" onClick={onNewSession}>
            <Plus size={16} />
            <span>New chat</span>
          </button>
          <label className="session-search">
            <Search size={15} />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Filter conversations..." />
          </label>
          {sessionError && <div className="context-error">{sessionError}</div>}
          <div className="session-list">
            {filteredSessions.map((session) => (
              <div
                key={session.session_id}
                className={`session-item ${session.session_id === activeSessionId ? 'active' : ''}`}
              >
                <button type="button" className="session-main" onClick={() => onSelectSession(session.session_id)}>
                  <span>{sessionTitle(session)}</span>
                  <small>{session.workspace || session.source_label || 'Sidekick'}</small>
                </button>
                <div className="session-actions">
                  <button type="button" title="Rename chat" onClick={() => onRenameSession(session)}><Edit3 size={13} /></button>
                  <button type="button" title="Duplicate chat" onClick={() => onDuplicateSession(session)}><Copy size={13} /></button>
                  <button type="button" title="Delete chat" onClick={() => onDeleteSession(session)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            {!filteredSessions.length && (
              <div className="context-empty">
                <Bot size={18} />
                <span>{serviceStatus?.sidekick === 'ready' ? 'No conversations yet' : 'Sidekick starting'}</span>
              </div>
            )}
          </div>
          <div className="context-actions">
            <button type="button" onClick={() => void onAction('summarize-page')} disabled={busy}>
              <Sparkles size={15} />
              <span>Summarize</span>
            </button>
            <button type="button" onClick={() => void onAction('explain-selection')} disabled={busy}>
              <MessageSquare size={15} />
              <span>Explain</span>
            </button>
            <button type="button" onClick={() => void onAction('research-page')} disabled={busy}>
              <Globe2 size={15} />
              <span>Research</span>
            </button>
          </div>
          <div className="activity-feed">
            {recentMessages.map((message) => (
              <div key={message.id} className={`activity-item ${message.role} ${message.pending ? 'pending' : ''}`}>
                {message.pending && <Loader2 size={13} className="spin" />}
                <p>{message.content}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {!collapsed && <div className="sidebar-resize-handle context-resize-handle" role="presentation" aria-hidden="true" onMouseDown={onResizeStart} />}

      {!showSessionTools && (
        <div className="context-native-panel">
          <div className="panel-mini panel-hand-off">
            <div className="panel-mini-icon">
              <img src={brandAssets.sidebarIcons[activePanel]} alt="" />
            </div>
            <strong>{panel.label}</strong>
            {activePanel === 'workspaces' && (
              <button type="button" className="new-session-button" onClick={onNewSession}>
                <Plus size={15} />
                <span>New chat in selected space</span>
              </button>
            )}
          </div>
          <div className="context-section-list">
            {contextItems.map((item) => (
              <button
                key={item}
                type="button"
                className={item === activeContextItem ? 'active' : ''}
                aria-pressed={item === activeContextItem}
                onClick={() => handleContextItem(item)}
              >
                <img src={brandAssets.sidebarIcons[activePanel]} alt="" />
                <span>{item}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function BrowserMain({
  activePanel,
  activeSession,
  activeSessionId,
  activeTab,
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
  onRemoveSpace,
  onRenameSpace,
  onSelectSpace,
  onSendChat,
  onStopChat,
  onClearBrowserError,
  onSetBrowserError,
}: {
  activePanel: LastbrowserPanelId;
  activeSession: DesktopSessionDetail | null;
  activeSessionId: string | null;
  activeTab: BrowserTab;
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
  onRemoveSpace: (space: SpaceSummary) => void;
  onRenameSpace: (space: SpaceSummary) => void;
  onSelectSpace: (path: string) => void;
  onSendChat: (message: string) => void;
  onStopChat: () => void;
  onClearBrowserError: () => void;
  onSetBrowserError: (error: string) => void;
}): JSX.Element {
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
              onNewSession={createNativeSession}
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
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeSettingsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
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
      </div>
      <div className="browser-webview-frame" ref={browserFrameRef}>
        {browserLoadError && (
          <div className="browser-load-error" role="alert">
            <AlertTriangle size={16} />
            <span>{browserLoadError}</span>
          </div>
        )}
        <webview
          key={activeTab.id}
          ref={webviewRef}
          src={activeTab.url}
          className="browser-view"
          style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, position: 'absolute', inset: 0 }}
          partition="persist:lastbrowser-main"
          allowpopups="false"
          onDidStartLoading={() => onClearBrowserError()}
          onDomReady={(event) => {
            void hideWebviewScrollbars(event.currentTarget);
            void annotateWebviewViewport(event.currentTarget);
          }}
          onDidFailLoad={(event) => {
            if (!event.isMainFrame || event.errorCode === -3) return;
            onSetBrowserError(`${event.errorCode}: ${event.errorDescription}`);
          }}
          onDidNavigate={(event) => onWebviewNavigate(activeTab.id, event.url)}
          onDidNavigateInPage={(event) => onWebviewNavigate(activeTab.id, event.url)}
          onPageTitleUpdated={(event) => onWebviewTitle(activeTab.id, event.title)}
        />
      </div>
    </section>
    </PanelErrorBoundary>
  );
}

function NativeChatMain({
  activeSession,
  activeSessionId,
  busy,
  chatError,
  messages,
  runState,
  composerMode,
  composerText,
  serviceStatus,
  sessionLoading,
  setupModel,
  activeSpacePath,
  onComposerMode,
  onComposerText,
  onCreateSession,
  onSend,
  onStop
}: {
  activeSession: DesktopSessionDetail | null;
  activeSessionId: string | null;
  busy: boolean;
  chatError: string;
  messages: DesktopChatMessage[];
  runState: ChatRunState;
  composerMode: ComposerMode;
  composerText: string;
  serviceStatus: ServiceStatus | null;
  sessionLoading: boolean;
  setupModel: string;
  activeSpacePath: string;
  onComposerMode: (mode: ComposerMode) => void;
  onComposerText: (text: string) => void;
  onCreateSession: () => void;
  onSend: (message: string) => void;
  onStop: () => void;
}): JSX.Element {
  const running = runState === 'starting' || runState === 'streaming' || runState === 'cancelling';
  const ready = canCallSidekickApi(serviceStatus);
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);
  const { visible: visibleMessages, developer: developerMessages } = useMemo(
    () => partitionChatMessages(messages),
    [messages]
  );
  const model = activeSession?.model || setupModel || 'default';
  const profile = activeSession?.profile || 'default';
  const workspace = activeSession?.workspace || activeSpacePath || 'default';

  return (
    <section className="browser-main native-chat-main">
      <div className="native-chat-header">
        <div className="native-chat-title">
          <img src={brandAssets.sidekickAvatar} alt="" />
          <div>
            <span>{activeSessionId ? shortSessionId(activeSessionId) : 'New chat'}</span>
            <h1>{activeSession ? sessionTitle(activeSession) : 'Sidekick'}</h1>
          </div>
        </div>
        <div className="native-chat-header-actions">
          <button
            type="button"
            className={`secondary-action compact developer-toggle ${showDeveloperTools ? 'active' : ''}`}
            onClick={() => setShowDeveloperTools((current) => !current)}
          >
            {showDeveloperTools ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>Developer</span>
          </button>
          <div className={`native-chat-status ${ready ? 'ready' : 'starting'}`}>
            <span className={ready ? 'status-dot ready' : 'status-dot'} />
            <span>{ready ? 'Online' : 'Starting'}</span>
          </div>
        </div>
      </div>
      <ChatTranscript
        activeSession={activeSession}
        error={chatError}
        developerMessages={developerMessages}
        loading={sessionLoading}
        messages={visibleMessages}
        pendingUserMessage={activeSession?.pending_user_message || ''}
        ready={ready}
        showDeveloperTools={showDeveloperTools}
        onCreateSession={onCreateSession}
        serviceStatus={serviceStatus}
      />
      <ChatComposer
        busy={busy || running}
        mode={composerMode}
        model={model}
        profile={profile}
        ready={ready}
        runState={runState}
        text={composerText}
        workspace={workspace}
        onMode={onComposerMode}
        onSend={onSend}
        onStop={onStop}
        onText={onComposerText}
      />
    </section>
  );
}

function ChatTranscript({
  activeSession,
  error,
  developerMessages,
  loading,
  messages,
  pendingUserMessage,
  ready,
  showDeveloperTools,
  onCreateSession,
  serviceStatus
}: {
  activeSession: DesktopSessionDetail | null;
  error: string;
  developerMessages: DesktopChatMessage[];
  loading: boolean;
  messages: DesktopChatMessage[];
  pendingUserMessage: string;
  ready: boolean;
  showDeveloperTools: boolean;
  onCreateSession: () => void;
  serviceStatus: ServiceStatus | null;
}): JSX.Element {
  if (loading) {
    return (
      <div className="chat-transcript chat-state">
        <Loader2 size={22} className="spin" />
        <span>Loading session...</span>
      </div>
    );
  }

  if (!activeSession && !messages.length) {
    return (
      <div className="chat-transcript chat-empty-state">
        <img src={brandAssets.sidekickAvatar} alt="" />
        <h2>Start a Sidekick chat</h2>
        <p>Chat, browser actions, planning and workspace runs now use native Lastbrowser UI.</p>
        <button type="button" className="primary-action compact" onClick={onCreateSession} disabled={!ready}>
          <Plus size={15} />
          <span>New chat</span>
        </button>
      </div>
    );
  }

  return (
    <div className="chat-transcript">
      {error && <div className="chat-error">{error}</div>}
      {messages.map((message, index) => (
        <article key={`${message.role || 'message'}-${index}`} className={`chat-message ${message.role || 'assistant'} ${message.pending ? 'pending' : ''}`}>
          <div className="message-avatar">
            {message.role === 'user' ? <UserCircle size={17} /> : <img src={brandAssets.sidekickAvatar} alt="" />}
          </div>
          <div className="message-body">
            <div className="message-meta">
              <strong>{message.role === 'user' ? 'You' : message.role === 'system' ? 'System' : 'Sidekick'}</strong>
              {message.pending && <Loader2 size={13} className="spin" />}
            </div>
            <ChatMessageBody content={String(message.content || '')} />
          </div>
        </article>
      ))}
      {pendingUserMessage && (
        <article className="chat-message user pending">
          <div className="message-avatar"><UserCircle size={17} /></div>
          <div className="message-body">
            <div className="message-meta"><strong>You</strong><Loader2 size={13} className="spin" /></div>
            <ChatMessageBody content={pendingUserMessage} />
          </div>
        </article>
      )}
      {showDeveloperTools && (
        <section className="chat-developer-panel native-work-card">
          <div className="chat-developer-header">
            <div>
              <strong>Developer trace</strong>
              <span>{developerMessages.length} hidden messages</span>
            </div>
            <span>Hidden by default</span>
          </div>
          <div className="chat-developer-messages">
            {developerMessages.length ? developerMessages.map((message, index) => (
              <article key={`dev-${message.role || 'message'}-${index}`} className={`chat-developer-message ${message.role || 'assistant'}`}>
                <div className="message-meta">
                  <strong>{message.role || 'message'}</strong>
                </div>
                <pre>{String(message.content || '').trim() || '...'}</pre>
              </article>
            )) : (
              <div className="chat-developer-empty">No hidden prompts or tool messages.</div>
            )}
          </div>
          <AdvancedWebUiTools panel="chat" serviceStatus={serviceStatus} compact />
        </section>
      )}
    </div>
  );
}

function ChatMessageBody({ content }: { content: string }): JSX.Element {
  const view = useMemo(() => describeChatContent(content), [content]);

  switch (view.kind) {
    case 'empty':
      return <p>...</p>;
    case 'text':
      return <p>{view.text}</p>;
    case 'html':
      return (
        <div className="chat-structured chat-html-structured">
          <div className="chat-structured-header">
            <strong>HTML response</strong>
            <span>{view.title || 'Markup payload'}</span>
          </div>
          <div className="chat-html-preview">
            <div className="chat-html-preview-chip">{view.title || 'HTML'}</div>
            <pre>{view.snippet}</pre>
          </div>
          <details className="chat-structured-raw">
            <summary>Show raw HTML</summary>
            <pre>{view.raw}</pre>
          </details>
        </div>
      );
    case 'research':
      return (
        <div className="chat-structured chat-research-structured">
          <div className="chat-structured-header">
            <strong>{view.summary}</strong>
            <span>{view.results.length} results</span>
          </div>
          {view.keyPoints.length > 0 && (
            <div className="chat-chip-row">
              {view.keyPoints.map((point, index) => <span key={`${point}-${index}`}>{point}</span>)}
            </div>
          )}
          {view.results.length > 0 && (
            <div className="chat-result-list">
              {view.results.map((result, index) => (
                <article key={`${result.title}-${index}`} className="chat-result-card">
                  <div className="chat-result-card-head">
                    <strong>{result.title}</strong>
                    {result.source && <span>{result.source}</span>}
                  </div>
                  {result.url && (
                    <a href={result.url} target="_blank" rel="noreferrer">
                      {result.url}
                    </a>
                  )}
                  {result.snippet && <p>{result.snippet}</p>}
                </article>
              ))}
            </div>
          )}
          {view.nextSteps.length > 0 && (
            <div className="chat-next-steps">
              <strong>Next steps</strong>
              <ul>
                {view.nextSteps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}
              </ul>
            </div>
          )}
          <details className="chat-structured-raw">
            <summary>Show raw JSON</summary>
            <pre>{view.raw}</pre>
          </details>
        </div>
      );
    case 'json':
      return (
        <div className="chat-structured chat-json-structured">
          <div className="chat-structured-header">
            <strong>JSON response</strong>
            <span>{view.entries.length} fields</span>
          </div>
          <dl className="chat-json-grid">
            {view.entries.map((entry) => (
              <React.Fragment key={entry.key}>
                <dt>{entry.key}</dt>
                <dd>{entry.value || '-'}</dd>
              </React.Fragment>
            ))}
          </dl>
          <details className="chat-structured-raw">
            <summary>Show raw JSON</summary>
            <pre>{view.raw}</pre>
          </details>
        </div>
      );
    default:
      return <p>{content.trim()}</p>;
  }
}

function ChatComposer({
  busy,
  mode,
  model,
  profile,
  ready,
  runState,
  text,
  workspace,
  onMode,
  onSend,
  onStop,
  onText
}: {
  busy: boolean;
  mode: ComposerMode;
  model: string;
  profile: string;
  ready: boolean;
  runState: ChatRunState;
  text: string;
  workspace: string;
  onMode: (mode: ComposerMode) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  onText: (text: string) => void;
}): JSX.Element {
  const canSend = ready && text.trim().length > 0 && !busy;
  const running = runState === 'starting' || runState === 'streaming' || runState === 'cancelling';

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    if (canSend) onSend(text);
  }

  return (
    <form className="chat-composer" onSubmit={submit}>
      <div className="composer-toolbar">
        <div className="composer-mode" role="group" aria-label="Composer mode">
          <button type="button" className={mode === 'action' ? 'active' : ''} onClick={() => onMode('action')}>
            <Sparkles size={13} />
            <span>Action</span>
          </button>
          <button type="button" className={mode === 'plan' ? 'active' : ''} onClick={() => onMode('plan')}>
            <Columns3 size={13} />
            <span>Plan</span>
          </button>
        </div>
      </div>
      <div className="composer-input-row">
        <textarea
          value={text}
          placeholder={ready ? 'Message Sidekick...' : 'Sidekick runtime is starting...'}
          rows={3}
          disabled={!ready}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {running ? (
          <button type="button" className="composer-send stop" onClick={onStop}>
            <StopCircle size={17} />
          </button>
        ) : (
          <button type="submit" className="composer-send" disabled={!canSend}>
            <Send size={17} />
          </button>
        )}
      </div>
      <div className="composer-chips">
        <span>{mode}</span>
        <span>{model}</span>
        <span>{profile}</span>
        <span>{workspaceLabel(workspace)}</span>
      </div>
    </form>
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

function NativeTasksMain({
  activeContextItem,
  serviceStatus
}: {
  activeContextItem: string;
  serviceStatus: ServiceStatus | null;
}): JSX.Element {
  const ready = canCallSidekickApi(serviceStatus);
  const [jobs, setJobs] = useState<CronJobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('0 9 * * *');
  const [prompt, setPrompt] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Scheduled jobs');
  const [dispatchState, setDispatchState] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!ready) return;
    setLoading(true);
    try {
      const result = await window.lastbrowser.sidekick.listCrons();
      setJobs(Array.isArray(result.jobs) ? result.jobs : []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshDispatchState = useCallback(async (): Promise<void> => {
    if (!ready) return;
    try {
      setDispatchState(await window.lastbrowser.sidekick.getActiveDispatches());
    } catch {
      setDispatchState(null);
    }
  }, [ready]);

  useEffect(() => {
    void refreshDispatchState();
  }, [refreshDispatchState]);

  useEffect(() => {
    setSection(activeContextItem || 'Scheduled jobs');
  }, [activeContextItem]);

  const visibleJobs = jobs.filter((job) => {
    const paused = job.enabled === false || job.state === 'paused';
    if (section === 'Active') return !paused;
    if (section === 'Paused') return paused;
    return true;
  });

  async function createJob(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!prompt.trim() || !schedule.trim()) return;
    setLoading(true);
    try {
      await window.lastbrowser.sidekick.createCron({
        name: name.trim(),
        prompt: prompt.trim(),
        schedule: schedule.trim(),
        deliver: 'local'
      });
      setName('');
      setPrompt('');
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setLoading(false);
    }
  }

  async function editJob(job: CronJobSummary): Promise<void> {
    const nextName = window.prompt('Task name', job.name || '');
    if (nextName === null) return;
    const nextSchedule = window.prompt('Schedule', cronScheduleLabel(job));
    if (!nextSchedule?.trim()) return;
    const nextPrompt = window.prompt('Prompt', job.prompt || '');
    if (nextPrompt === null) return;
    try {
      await window.lastbrowser.sidekick.updateCron({
        jobId: job.id,
        name: nextName.trim(),
        schedule: nextSchedule.trim(),
        prompt: nextPrompt.trim()
      });
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    }
  }

  async function mutateJob(job: CronJobSummary, action: 'run' | 'pause' | 'resume' | 'delete'): Promise<void> {
    if (action === 'delete' && !window.confirm(`Delete "${job.name || job.id}"?`)) return;
    try {
      if (action === 'run') await window.lastbrowser.sidekick.runCron({ jobId: job.id });
      if (action === 'pause') await window.lastbrowser.sidekick.pauseCron({ jobId: job.id });
      if (action === 'resume') await window.lastbrowser.sidekick.resumeCron({ jobId: job.id });
      if (action === 'delete') await window.lastbrowser.sidekick.deleteCron({ jobId: job.id });
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }

  async function runDispatcher(): Promise<void> {
    if (!ready) return;
    await window.lastbrowser.sidekick.runDispatchOnce({ dryRun: false });
    await Promise.all([refresh(), refreshDispatchState()]);
  }

  return (
    <section className="browser-main native-work-main tasks-main">
      <header className="native-work-header">
        <div>
          <span className="eyebrow">Tasks</span>
          <h1>{section}</h1>
          <p>Native port of the WebUI Tasks panel. Jobs use the existing Sidekick cron backend.</p>
        </div>
        <button type="button" className="secondary-action compact" onClick={() => void refresh()} disabled={!ready || loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          <span>Refresh</span>
        </button>
        <button type="button" className="secondary-action compact" onClick={() => void runDispatcher()} disabled={!ready}>
          <Sparkles size={15} />
          <span>Run dispatcher</span>
        </button>
      </header>
      <div className="native-card-actions insights-tabs">
        {['Scheduled jobs', 'Active', 'Paused', 'History'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <form className="native-work-card native-task-form" onSubmit={(event) => void createJob(event)}>
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Daily review" />
        </label>
        <label>
          <span>Schedule</span>
          <input value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="0 9 * * *" />
        </label>
        <label className="wide">
          <span>Prompt</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What should Sidekick do on this schedule?" rows={3} />
        </label>
        <button type="submit" className="primary-action compact" disabled={!ready || loading || !prompt.trim() || !schedule.trim()}>
          <Plus size={15} />
          <span>New job</span>
        </button>
      </form>
      {error && <div className="workspace-error">{error}</div>}
      <AdvancedWebUiTools panel="tasks" serviceStatus={serviceStatus} compact />
      <section className="native-work-card detail-json-card">
        <header><strong>Dispatcher</strong></header>
        <pre>{jsonPreview(dispatchState || { active: [] })}</pre>
      </section>
      <div className="native-work-grid">
        {visibleJobs.map((job) => {
          const paused = job.enabled === false || job.state === 'paused';
          return (
            <article key={job.id} className="native-work-card task-card">
              <div className="task-card-head">
                <div>
                  <strong>{job.name || cronScheduleLabel(job) || job.id}</strong>
                  <span>{cronScheduleLabel(job) || 'manual'}</span>
                </div>
                <span className={`task-state ${paused ? 'paused' : cronStatus(job)}`}>{paused ? 'paused' : cronStatus(job)}</span>
              </div>
              <p>{job.prompt || job.last_error || 'No prompt preview available.'}</p>
              <div className="task-card-meta">
                <span>Next: {formatMaybeDate(job.next_run_at) || 'n/a'}</span>
                <span>Last: {formatMaybeDate(job.last_run_at) || 'never'}</span>
              </div>
              <div className="native-card-actions">
                <button type="button" onClick={() => void mutateJob(job, 'run')}><Sparkles size={13} /><span>Run</span></button>
                {paused ? (
                  <button type="button" onClick={() => void mutateJob(job, 'resume')}><CheckCircle2 size={13} /><span>Resume</span></button>
                ) : (
                  <button type="button" onClick={() => void mutateJob(job, 'pause')}><Minus size={13} /><span>Pause</span></button>
                )}
                <button type="button" onClick={() => void editJob(job)}><Edit3 size={13} /><span>Edit</span></button>
                <button type="button" className="danger" onClick={() => void mutateJob(job, 'delete')}><Trash2 size={13} /><span>Delete</span></button>
              </div>
            </article>
          );
        })}
        {!visibleJobs.length && (
          <div className="native-work-empty">
            <CalendarDays size={28} />
            <span>{ready ? 'No scheduled jobs yet.' : 'Sidekick runtime is starting.'}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function NativeKanbanMain({
  activeContextItem,
  activeSpacePath,
  serviceStatus
}: {
  activeContextItem: string;
  activeSpacePath: string;
  serviceStatus: ServiceStatus | null;
}): JSX.Element {
  const ready = canCallSidekickApi(serviceStatus);
  const [board, setBoard] = useState<KanbanBoardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('todo');
  const [section, setSection] = useState(activeContextItem || 'Board');
  const [dispatchState, setDispatchState] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!ready) return;
    setLoading(true);
    try {
      const result = await window.lastbrowser.sidekick.getKanbanBoard({ workspace: activeSpacePath || undefined });
      setBoard(result);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeSpacePath, ready]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshDispatchState = useCallback(async (): Promise<void> => {
    if (!ready) return;
    try {
      setDispatchState(await window.lastbrowser.sidekick.getActiveDispatches());
    } catch {
      setDispatchState(null);
    }
  }, [ready]);

  useEffect(() => {
    void refreshDispatchState();
  }, [refreshDispatchState]);

  useEffect(() => {
    setSection(activeContextItem || 'Board');
  }, [activeContextItem]);

  const columns = board?.columns?.length
    ? board.columns
    : ['triage', 'todo', 'ready', 'running', 'blocked', 'done'].map((name) => ({ name, tasks: [] }));
  const visibleColumns = section === 'Board'
    ? columns
    : columns.filter((column) => kanbanColumnLabel(column.name).toLowerCase() === section.toLowerCase() || column.name.toLowerCase() === section.toLowerCase());

  async function createTask(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await window.lastbrowser.sidekick.createKanbanTask({
        title: title.trim(),
        body: body.trim(),
        status
      });
      setTitle('');
      setBody('');
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    }
  }

  async function moveTask(task: KanbanTaskSummary, nextStatus: string): Promise<void> {
    if (!task.id || !nextStatus) return;
    try {
      await window.lastbrowser.sidekick.updateKanbanTask({ taskId: task.id, status: nextStatus });
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    }
  }

  async function runDispatcher(): Promise<void> {
    if (!ready) return;
    await window.lastbrowser.sidekick.runDispatchOnce({ dryRun: false });
    await Promise.all([refresh(), refreshDispatchState()]);
  }

  return (
    <section className="browser-main native-work-main kanban-main">
      <header className="native-work-header">
        <div>
          <span className="eyebrow">Kanban</span>
          <h1>{section}</h1>
          <p>{activeSpacePath ? workspaceLabel(activeSpacePath) : 'Default workspace'} · native board view backed by `/api/kanban`.</p>
        </div>
        <button type="button" className="secondary-action compact" onClick={() => void refresh()} disabled={!ready || loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          <span>Refresh</span>
        </button>
        <button type="button" className="secondary-action compact" onClick={() => void runDispatcher()} disabled={!ready}>
          <Sparkles size={15} />
          <span>Run dispatcher</span>
        </button>
      </header>
      <div className="native-card-actions insights-tabs">
        {['Board', 'Triage', 'Running', 'Done'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <form className="native-work-card kanban-task-form" onSubmit={(event) => void createTask(event)}>
        <label>
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New task" />
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {columns.map((column) => <option key={column.name} value={column.name}>{kanbanColumnLabel(column.name)}</option>)}
          </select>
        </label>
        <label className="wide">
          <span>Description</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Task details" rows={2} />
        </label>
        <button type="submit" className="primary-action compact" disabled={!ready || !title.trim()}>
          <Plus size={15} />
          <span>Add task</span>
        </button>
      </form>
      {error && <div className="workspace-error">{error}</div>}
      <AdvancedWebUiTools panel="kanban" serviceStatus={serviceStatus} compact />
      <section className="native-work-card detail-json-card">
        <header><strong>Dispatcher</strong></header>
        <pre>{jsonPreview(dispatchState || { active: [] })}</pre>
      </section>
      <div className="native-kanban-board">
        {visibleColumns.map((column) => (
          <section key={column.name} className="native-kanban-column">
            <header>
              <span>{kanbanColumnLabel(column.name)}</span>
              <strong>{column.tasks?.length || 0}</strong>
            </header>
            <div className="native-kanban-cards">
              {(column.tasks || []).map((task) => (
                <article key={task.id} className="native-work-card kanban-card-native">
                  <small>{task.id}</small>
                  <strong>{kanbanTaskTitle(task)}</strong>
                  {kanbanTaskBody(task) && <p>{kanbanTaskBody(task)}</p>}
                  <div className="task-card-meta">
                    {task.assignee && <span>@{task.assignee}</span>}
                    {task.tenant && <span>{task.tenant}</span>}
                    {task.priority !== undefined && <span>P{String(task.priority)}</span>}
                  </div>
                  <select value={task.status || column.name} onChange={(event) => void moveTask(task, event.target.value)}>
                    {columns.map((target) => <option key={target.name} value={target.name}>{kanbanColumnLabel(target.name)}</option>)}
                  </select>
                </article>
              ))}
              {!column.tasks?.length && <div className="native-kanban-empty">Empty</div>}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function NativeTodosMain({
  activeContextItem,
  activeSession,
  messages,
  serviceStatus
}: {
  activeContextItem: string;
  activeSession: DesktopSessionDetail | null;
  messages: DesktopChatMessage[];
  serviceStatus: ServiceStatus | null;
}): JSX.Element {
  const [section, setSection] = useState(activeContextItem || 'Pending');
  const todos = extractTodosFromSession(activeSession, messages);
  const pending = todos.filter((todo) => normalizeTodoStatus(todo.status) === 'pending');
  const inProgress = todos.filter((todo) => normalizeTodoStatus(todo.status) === 'in_progress');
  const completed = todos.filter((todo) => ['completed', 'cancelled'].includes(normalizeTodoStatus(todo.status)));
  useEffect(() => {
    setSection(activeContextItem || 'Pending');
  }, [activeContextItem]);
  const visibleTodos = section === 'In progress' ? inProgress : section === 'Completed / cancelled' ? completed : pending;

  return (
    <section className="browser-main native-work-main todos-main">
      <header className="native-work-header">
        <div>
          <span className="eyebrow">Todos</span>
          <h1>{section}</h1>
          <p>Native view of the latest todo state emitted in the active Sidekick session.</p>
        </div>
        <div className="todo-metrics">
          <span><strong>{todos.length}</strong> total</span>
          <span><strong>{pending.length + inProgress.length}</strong> active</span>
          <span><strong>{completed.length}</strong> done</span>
        </div>
      </header>
      <div className="native-card-actions insights-tabs">
        {['Pending', 'In progress', 'Completed / cancelled'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="todos-columns-native">
        <TodoColumn title={section} todos={visibleTodos} />
      </div>
      <AdvancedWebUiTools panel="todos" serviceStatus={serviceStatus} compact />
      {!todos.length && (
        <div className="native-work-empty">
          <ListChecks size={28} />
          <span>No active todo state in this chat yet.</span>
        </div>
      )}
    </section>
  );
}

function TodoColumn({ title, todos }: { title: string; todos: TodoItem[] }): JSX.Element {
  return (
    <section className="native-work-card todo-column-native">
      <header>
        <span>{title}</span>
        <strong>{todos.length}</strong>
      </header>
      {todos.map((todo, index) => (
        <article key={todo.id || `${title}-${index}`} className={`todo-card ${normalizeTodoStatus(todo.status)}`}>
          {normalizeTodoStatus(todo.status) === 'completed' ? <CheckCircle2 size={15} /> : <Square size={15} />}
          <div>
            <strong>{todo.content || todo.title || 'Untitled todo'}</strong>
            <span>{todo.id || normalizeTodoStatus(todo.status)}</span>
          </div>
        </article>
      ))}
      {!todos.length && <div className="native-kanban-empty">Empty</div>}
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

function WorkspacePanel({
  activeSessionId,
  collapsed,
  draft,
  editing,
  entries,
  error,
  path,
  preview,
  serviceStatus,
  showHidden,
  onEntry,
  onCreateFile,
  onCreateFolder,
  onDeleteEntry,
  onDraft,
  onParent,
  onRenameEntry,
  onRefresh,
  onSavePreview,
  onToggleEditing,
  onToggleHidden,
  onToggle,
  onResizeStart
}: {
  activeSessionId: string | null;
  collapsed: boolean;
  draft: string;
  editing: boolean;
  entries: WorkspaceTreeEntry[];
  error: string;
  path: string;
  preview: WorkspaceFilePreview | null;
  serviceStatus: ServiceStatus | null;
  showHidden: boolean;
  onEntry: (entry: WorkspaceTreeEntry) => Promise<void>;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onDeleteEntry: (entry: WorkspaceTreeEntry) => void;
  onDraft: (value: string) => void;
  onParent: () => void;
  onRenameEntry: (entry: WorkspaceTreeEntry) => void;
  onRefresh: () => void;
  onSavePreview: () => void;
  onToggleEditing: () => void;
  onToggleHidden: () => void;
  onToggle: () => void;
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
}): JSX.Element {
  if (collapsed) {
    return (
      <aside className="workspace-panel collapsed">
        <button type="button" aria-label="Open workspace" onClick={onToggle}>
          <HardDrive size={18} />
        </button>
      </aside>
    );
  }

  const visibleEntries = showHidden ? entries : entries.filter((entry) => !entry.name.startsWith('.'));
  const previewEntry = preview?.path ? entryFromPreview(preview) : null;

  return (
    <aside className="workspace-panel">
      <div className="sidebar-resize-handle workspace-resize-handle" role="presentation" aria-hidden="true" onMouseDown={onResizeStart} />
      <div className="workspace-header">
        <div>
          <span>WORKSPACE</span>
          <strong>{activeSessionId ? shortSessionId(activeSessionId) : 'No session'}</strong>
        </div>
        <div className="workspace-actions">
          <button type="button" aria-label="Parent folder" onClick={onParent}><ChevronLeft size={16} /></button>
          <button type="button" aria-label="Refresh workspace" onClick={onRefresh}><RefreshCw size={15} /></button>
          <button type="button" aria-label="Collapse workspace" onClick={onToggle}><ChevronRight size={16} /></button>
        </div>
      </div>
      <WorkspaceBreadcrumb path={path} onRoot={() => onEntry({ name: '.', path: '.', type: 'dir', is_dir: true })} onSelect={(nextPath) => onEntry({ name: nextPath, path: nextPath, type: 'dir', is_dir: true })} />
      <WorkspaceToolbar
        disabled={!activeSessionId}
        showHidden={showHidden}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
        onRefresh={onRefresh}
        onToggleHidden={onToggleHidden}
      />
      {error && <div className="workspace-error">{error}</div>}
      {!activeSessionId && (
        <div className="workspace-empty">
          <Folder size={20} />
          <span>{serviceStatus?.sidekick === 'ready' ? 'Start or select a chat' : 'Workspace loading'}</span>
        </div>
      )}
      {activeSessionId && (
        <div className="workspace-list">
          {visibleEntries.map((entry) => {
            const isFolder = isWorkspaceDirectory(entry);
            return (
              <div
                key={`${entry.path || entry.name}-${entry.type || ''}`}
                className="workspace-entry"
              >
                <button type="button" className="workspace-entry-main" onClick={() => void onEntry(entry)}>
                  {isFolder ? <Folder size={15} /> : <FileText size={15} />}
                  <span>{entry.name}</span>
                  {entry.size !== undefined && <small>{formatBytes(entry.size)}</small>}
                </button>
                <div className="workspace-entry-actions">
                  <button type="button" title="Rename" onClick={() => onRenameEntry(entry)}><Edit3 size={13} /></button>
                  <button type="button" title="Delete" onClick={() => onDeleteEntry(entry)}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
          {!visibleEntries.length && !error && (
            <div className="workspace-empty">
              <Folder size={20} />
              <span>{entries.length ? 'Hidden files are currently hidden' : 'No files found'}</span>
            </div>
          )}
        </div>
      )}
      <WorkspacePreview
        draft={draft}
        editing={editing}
        entry={previewEntry}
        preview={preview}
        serviceStatus={serviceStatus}
        sessionId={activeSessionId}
        onDeleteEntry={previewEntry ? () => onDeleteEntry(previewEntry) : undefined}
        onDraft={onDraft}
        onRenameEntry={previewEntry ? () => onRenameEntry(previewEntry) : undefined}
        onSavePreview={onSavePreview}
        onToggleEditing={onToggleEditing}
      />
    </aside>
  );
}

function WorkspaceToolbar({
  disabled,
  showHidden,
  onCreateFile,
  onCreateFolder,
  onRefresh,
  onToggleHidden
}: {
  disabled: boolean;
  showHidden: boolean;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRefresh: () => void;
  onToggleHidden: () => void;
}): JSX.Element {
  return (
    <div className="workspace-toolbar">
      <button type="button" title="New file" disabled={disabled} onClick={onCreateFile}><FilePlus size={14} /></button>
      <button type="button" title="New folder" disabled={disabled} onClick={onCreateFolder}><FolderPlus size={14} /></button>
      <button type="button" title={showHidden ? 'Hide dotfiles' : 'Show dotfiles'} disabled={disabled} onClick={onToggleHidden}>
        {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button type="button" title="Refresh" disabled={disabled} onClick={onRefresh}><RefreshCw size={14} /></button>
    </div>
  );
}

function WorkspaceBreadcrumb({
  path,
  onRoot,
  onSelect
}: {
  path: string;
  onRoot: () => void;
  onSelect: (path: string) => void;
}): JSX.Element {
  const parts = workspacePathParts(path);
  return (
    <div className="workspace-breadcrumb">
      <button type="button" onClick={onRoot}>~</button>
      {parts.map((part, index) => {
        const nextPath = parts.slice(0, index + 1).join('/');
        return (
          <React.Fragment key={`${part}-${index}`}>
            <span>/</span>
            <button type="button" onClick={() => onSelect(nextPath)}>{part}</button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function WorkspacePreview({
  draft,
  editing,
  entry,
  preview,
  serviceStatus,
  sessionId,
  onDeleteEntry,
  onDraft,
  onRenameEntry,
  onSavePreview,
  onToggleEditing
}: {
  draft: string;
  editing: boolean;
  entry: WorkspaceTreeEntry | null;
  preview: WorkspaceFilePreview | null;
  serviceStatus: ServiceStatus | null;
  sessionId: string | null;
  onDeleteEntry?: () => void;
  onDraft: (value: string) => void;
  onRenameEntry?: () => void;
  onSavePreview: () => void;
  onToggleEditing: () => void;
}): JSX.Element | null {
  if (!preview?.path) return null;
  const rawUrl = serviceStatus?.webuiUrl && sessionId
    ? `${serviceStatus.webuiUrl.replace(/\/+$/, '')}/api/file/raw?session_id=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(preview.path)}&download=1`
    : '';

  return (
    <div className="workspace-preview">
      <div className="workspace-preview-head">
        <strong>{preview.path}</strong>
        <div className="workspace-preview-actions">
          {rawUrl && <a href={rawUrl} title="Download"><Download size={13} /></a>}
          <button type="button" title={editing ? 'Cancel edit' : 'Edit'} onClick={onToggleEditing}><Edit3 size={13} /></button>
          <button type="button" title="Save" disabled={!editing} onClick={onSavePreview}><Save size={13} /></button>
          <button type="button" title="Rename" disabled={!entry} onClick={onRenameEntry}><FileText size={13} /></button>
          <button type="button" title="Delete" disabled={!entry} onClick={onDeleteEntry}><Trash2 size={13} /></button>
        </div>
      </div>
      {editing ? (
        <textarea value={draft} onChange={(event) => onDraft(event.target.value)} />
      ) : (
        <pre>{preview.content || ''}</pre>
      )}
    </div>
  );
}

function FirstRunSetupPane({
  status,
  onboardingStatus,
  setupLoading,
  error,
  saving,
  onRefreshOnboarding,
  onSubmit
}: {
  status: ServiceStatus | null;
  onboardingStatus: OnboardingStatus | null;
  setupLoading: boolean;
  error: string;
  saving: boolean;
  onRefreshOnboarding: () => Promise<void>;
  onSubmit: (form: SetupForm) => Promise<void>;
}): JSX.Element {
  const providers = cloudProviderOptions(onboardingStatus);
  const [provider, setProvider] = useState(providers[0]?.id || 'openrouter');
  const models = modelsForProvider(onboardingStatus, provider);
  const [model, setModel] = useState(models[0]?.id || '');
  const [apiKey, setApiKey] = useState('');
  const [oauthState, setOAuthState] = useState<CodexOAuthState>(idleCodexOAuth);
  const readiness = firstRunStatus(status, onboardingStatus);
  const canSubmit = canSubmitCloudSetup(readiness);
  const isCodexProvider = provider === 'openai-codex';
  const codexAlreadyReady = onboardingStatus?.system?.chat_ready === true
    && onboardingStatus.system.current_provider === 'openai-codex';
  const codexLoginReady = !isCodexProvider || oauthState.status === 'success' || codexAlreadyReady;
  const canSubmitForm = canSubmit && codexLoginReady;

  useEffect(() => {
    if (!providers.some((item) => item.id === provider) && providers[0]) {
      setProvider(providers[0].id);
    }
  }, [provider, providers]);

  useEffect(() => {
    const nextModels = modelsForProvider(onboardingStatus, provider);
    if (!nextModels.some((item) => item.id === model)) {
      setModel(nextModels[0]?.id || '');
    }
  }, [model, onboardingStatus, provider]);

  useEffect(() => {
    if (!isCodexProvider && oauthState.status !== 'idle') {
      setOAuthState(idleCodexOAuth);
    }
  }, [isCodexProvider, oauthState.status]);

  useEffect(() => {
    if (!isCodexProvider || oauthState.status !== 'pending' || !oauthState.flowId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await window.lastbrowser.sidekick.pollOAuth(oauthState.flowId || '');
        if (cancelled) return;
        const nextStatus = String(response.status || 'error') as CodexOAuthState['status'];
        if (nextStatus === 'pending') {
          setOAuthState((current) => ({
            ...current,
            status: 'pending',
            message: 'Waiting for ChatGPT authorization...'
          }));
          return;
        }
        if (nextStatus === 'success') {
          setOAuthState((current) => ({
            ...current,
            status: 'success',
            message: 'ChatGPT login connected. Codex tokens are ready for Sidekick.'
          }));
          await onRefreshOnboarding();
          return;
        }
        setOAuthState((current) => ({
          ...current,
          status: nextStatus,
          message: response.error || 'The ChatGPT login flow ended before credentials were saved.'
        }));
      } catch (pollError) {
        if (cancelled) return;
        setOAuthState((current) => ({
          ...current,
          status: 'error',
          message: pollError instanceof Error ? pollError.message : String(pollError)
        }));
      }
    }, Math.max(1000, (oauthState.pollIntervalSeconds || 3) * 1000));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isCodexProvider, oauthState.flowId, oauthState.pollIntervalSeconds, oauthState.status, onRefreshOnboarding]);

  async function startCodexLogin(): Promise<void> {
    setOAuthState({ status: 'starting', message: 'Starting ChatGPT login...' });
    try {
      const response = await window.lastbrowser.sidekick.startOAuth({ provider: 'openai-codex' });
      if (response.error) throw new Error(response.error);
      const flowId = String(response.flow_id || '');
      if (response.status === 'success') {
        setOAuthState({
          status: 'success',
          flowId,
          message: 'Existing Codex login found and connected. Codex tokens are ready for Sidekick.'
        });
        await onRefreshOnboarding();
        return;
      }
      const verificationUri = String(response.verification_uri || '');
      const userCode = String(response.user_code || '');
      if (!flowId || !verificationUri || !userCode) throw new Error('Sidekick returned an incomplete ChatGPT login flow.');
      setOAuthState({
        status: response.status === 'success' ? 'success' : 'pending',
        flowId,
        verificationUri,
        userCode,
        pollIntervalSeconds: Number(response.poll_interval_seconds || 3),
        message: 'Open ChatGPT, enter the code, then return to Lastbrowser.'
      });
      window.open(verificationUri, '_blank', 'noopener,noreferrer');
    } catch (loginError) {
      setOAuthState({
        status: 'error',
        message: loginError instanceof Error ? loginError.message : String(loginError)
      });
    }
  }

  async function cancelCodexLogin(): Promise<void> {
    const flowId = oauthState.flowId;
    setOAuthState({ status: 'cancelled', message: 'ChatGPT login cancelled.' });
    if (flowId) {
      await window.lastbrowser.sidekick.cancelOAuth({ flowId, provider: 'openai-codex' }).catch(() => null);
    }
  }

  function copyCodexCode(): void {
    if (!oauthState.userCode) return;
    void navigator.clipboard?.writeText(oauthState.userCode);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (isCodexProvider && !codexLoginReady) {
      setOAuthState((current) => ({
        ...current,
        status: current.status === 'idle' ? 'error' : current.status,
        message: 'Sign in with ChatGPT before starting Lastbrowser with Codex.'
      }));
      return;
    }
    void onSubmit({ provider, model, apiKey });
  }

  return (
    <aside className="first-run-pane">
      <div className="first-run-hero">
        <img src={brandAssets.sidekickAvatar} alt="" className="first-run-avatar" />
        <div className="setup-brand">
          <img src={brandAssets.logo} alt="Lastbrowser" />
        </div>
        <span className="eyebrow">AI-native browsing runtime</span>
        <h1>Set up Sidekick while you browse</h1>
        <p>The browser is already available. Sidekick comes online in the background.</p>
      </div>

      <div className="setup-progress" aria-label="First-run setup status">
        <div className={`setup-step ${readiness.id === 'starting-runtime' ? 'active' : 'ready'}`}>
          <span className={readiness.id === 'starting-runtime' ? 'status-dot' : 'status-dot ready'} />
          <div>
            <strong>Starting runtime</strong>
            <span>{status?.port ? `Local port ${status.port}` : 'Finding local runtime port'}</span>
          </div>
        </div>
        <div className={`setup-step ${status?.sidekick === 'ready' ? 'ready' : ''}`}>
          <span className={status?.sidekick === 'ready' ? 'status-dot ready' : 'status-dot'} />
          <div>
            <strong>Sidekick ready</strong>
            <span>{readiness.id === 'sidekick-ready' ? readiness.detail : status?.webuiHealth || 'Waiting'}</span>
          </div>
        </div>
        <div className={`setup-step ${readiness.id === 'provider-needed' ? 'active' : readiness.id === 'ready' ? 'ready' : ''}`}>
          <span className={readiness.id === 'ready' ? 'status-dot ready' : 'status-dot'} />
          <div>
            <strong>{readiness.label}</strong>
            <span>{setupLoading ? 'Loading local setup state' : readiness.detail}</span>
          </div>
        </div>
      </div>

      <form className="setup-form" onSubmit={submit}>
        <label>
          <span>Provider</span>
          <select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
              setApiKey('');
              setOAuthState(idleCodexOAuth);
            }}
          >
            {providers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>Model</span>
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {isCodexProvider ? (
          <div className={`codex-auth-card ${oauthState.status}`}>
            <div className="codex-auth-copy">
              <strong>ChatGPT Codex login</strong>
              <span>Use your OpenAI Codex credentials instead of pasting an API key.</span>
            </div>
            {oauthState.status === 'success' || codexAlreadyReady ? (
              <div className="codex-auth-success">
                <CheckCircle2 size={17} />
                <span>Connected</span>
              </div>
            ) : (
              <button
                type="button"
                className="secondary-action"
                onClick={() => void startCodexLogin()}
                disabled={!canSubmit || oauthState.status === 'starting' || oauthState.status === 'pending'}
              >
                {oauthState.status === 'starting' || oauthState.status === 'pending'
                  ? <Loader2 size={16} className="spin" />
                  : <LogIn size={16} />}
                <span>Sign in with ChatGPT</span>
              </button>
            )}
            {oauthState.verificationUri && oauthState.userCode && oauthState.status === 'pending' && (
              <div className="codex-device-flow">
                <a href={oauthState.verificationUri} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  <span>Open authorization page</span>
                </a>
                <button type="button" className="code-pill" onClick={copyCodexCode}>
                  <span>{oauthState.userCode}</span>
                  <ClipboardCopy size={14} />
                </button>
                <button type="button" className="text-action" onClick={() => void cancelCodexLogin()}>Cancel</button>
              </div>
            )}
            {oauthState.message && <p className="codex-auth-message">{oauthState.message}</p>}
          </div>
        ) : (
          <label>
            <span>API key</span>
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
              placeholder="Cloud provider API key"
            />
          </label>
        )}
        {error && <div className="setup-error">{error}</div>}
        <button type="submit" className="primary-action" disabled={saving || !provider || !model || !canSubmitForm}>
          {saving || !canSubmitForm ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          <span>{saving ? 'Connecting' : canSubmitForm ? 'Start Lastbrowser' : isCodexProvider ? 'Connect ChatGPT first' : 'Preparing sidekick'}</span>
        </button>
      </form>
    </aside>
  );
}

function sessionTitle(session: DesktopSessionSummary): string {
  return session.title?.trim() || shortSessionId(session.session_id);
}

function spaceDisplayName(space: SpaceSummary): string {
  const cleanName = space.name?.trim();
  if (cleanName) return cleanName;
  const normalized = space.path.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'default';
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

function cronScheduleLabel(job: CronJobSummary): string {
  if (job.schedule_display) return String(job.schedule_display);
  if (typeof job.schedule === 'string') return job.schedule;
  return String(job.schedule?.expression || '');
}

function cronStatus(job: CronJobSummary): string {
  if (job.last_error) return 'error';
  return String(job.last_status || job.state || 'active');
}

function formatMaybeDate(value: string | number | null | undefined): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function kanbanColumnLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function kanbanTaskTitle(task: KanbanTaskSummary): string {
  return task.title || task.summary || task.id || 'Task';
}

function kanbanTaskBody(task: KanbanTaskSummary): string {
  return task.body || task.description || task.prompt || '';
}

function extractTodosFromSession(
  activeSession: DesktopSessionDetail | null,
  messages: DesktopChatMessage[]
): TodoItem[] {
  const source = Array.isArray(activeSession?.messages) && activeSession.messages.length
    ? activeSession.messages
    : messages;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const message = source[index];
    if (message?.role !== 'tool') continue;
    try {
      const parsed = JSON.parse(String(message.content || '{}')) as { todos?: TodoItem[] };
      if (Array.isArray(parsed.todos)) return parsed.todos;
    } catch {
      // Ignore non-todo tool payloads.
    }
  }
  return [];
}

function normalizeTodoStatus(status: string | undefined): string {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'done') return 'completed';
  if (value === 'active' || value === 'running') return 'in_progress';
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shortSessionId(sessionId: string): string {
  return sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId;
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


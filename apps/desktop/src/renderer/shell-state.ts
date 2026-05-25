export type LastbrowserPanelId =
  | 'chat'
  | 'tasks'
  | 'kanban'
  | 'skills'
  | 'agents'
  | 'memory'
  | 'workspaces'
  | 'profiles'
  | 'todos'
  | 'insights'
  | 'logs'
  | 'gmail'
  | 'browser'
  | 'discord'
  | 'appstore'
  | 'settings';

export type LastbrowserPanel = {
  id: LastbrowserPanelId;
  label: string;
  tooltip: string;
};

export type DesktopSessionSummary = {
  session_id: string;
  title?: string;
  workspace?: string;
  updated_at?: string | number;
  last_message_at?: string | number;
  message_count?: number;
  source_label?: string;
  profile?: string;
};

export type DesktopChatMessage = {
  role?: string;
  content?: string;
  timestamp?: string | number;
  tool_calls?: unknown[];
  pending?: boolean;
};

export type ComposerDraft = {
  text?: string;
  files?: unknown[];
};

export type DesktopSessionDetail = DesktopSessionSummary & {
  model?: string;
  model_provider?: string | null;
  active_stream_id?: string | null;
  pending_user_message?: string | null;
  messages?: DesktopChatMessage[];
  composer_draft?: ComposerDraft;
};

export type ChatRunState = 'idle' | 'starting' | 'streaming' | 'cancelling' | 'error';

export type WorkspaceTreeEntry = {
  name: string;
  path?: string;
  type?: string;
  size?: number;
  modified?: string | number;
  is_dir?: boolean;
};

export type WorkspaceFilePreview = {
  path?: string;
  content?: string;
  mime?: string;
  language?: string;
  size?: number;
  truncated?: boolean;
};

export type SpaceSummary = {
  path: string;
  name?: string;
  emoji?: string;
  color?: string;
};

type PanelStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const activePanelStorageKey = 'lastbrowser.activePanel';
export const leftSidebarCollapsedStorageKey = 'lastbrowser.leftSidebarCollapsed';
export const workspacePanelCollapsedStorageKey = 'lastbrowser.workspacePanelCollapsed';

export const lastbrowserPanels: LastbrowserPanel[] = [
  { id: 'chat', label: 'Chat', tooltip: 'Chat' },
  { id: 'tasks', label: 'Tasks', tooltip: 'Tasks' },
  { id: 'kanban', label: 'Kanban', tooltip: 'Kanban' },
  { id: 'skills', label: 'Skills', tooltip: 'Skills' },
  { id: 'agents', label: 'Agents', tooltip: 'Agents' },
  { id: 'memory', label: 'Memory', tooltip: 'Memory' },
  { id: 'workspaces', label: 'Spaces', tooltip: 'Spaces' },
  { id: 'profiles', label: 'Profiles', tooltip: 'Agent profiles' },
  { id: 'todos', label: 'Todos', tooltip: 'Todos' },
  { id: 'insights', label: 'Insights', tooltip: 'Insights' },
  { id: 'logs', label: 'Logs', tooltip: 'Logs' },
  { id: 'gmail', label: 'Gmail', tooltip: 'Gmail' },
  { id: 'browser', label: 'AI Browser', tooltip: 'AI Browser' },
  { id: 'discord', label: 'Discord', tooltip: 'Discord' },
  { id: 'appstore', label: 'Appstore', tooltip: 'Appstore' },
  { id: 'settings', label: 'Settings', tooltip: 'Settings' },
];

const panelIds = new Set(lastbrowserPanels.map((panel) => panel.id));

function defaultStorage(): PanelStorageLike | undefined {
  return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
}

export function normalizePanelId(value: unknown): LastbrowserPanelId {
  return typeof value === 'string' && panelIds.has(value as LastbrowserPanelId)
    ? (value as LastbrowserPanelId)
    : 'browser';
}

export function loadInitialPanel(storage: PanelStorageLike | undefined = defaultStorage()): LastbrowserPanelId {
  if (!storage) {
    return 'browser';
  }

  try {
    return normalizePanelId(storage.getItem(activePanelStorageKey));
  } catch {
    return 'browser';
  }
}

export function saveActivePanel(
  storage: PanelStorageLike | undefined = defaultStorage(),
  panel: LastbrowserPanelId,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(activePanelStorageKey, panel);
  } catch {
    // Ignore unavailable storage, for example in restricted renderer contexts.
  }
}

export function loadBooleanPreference(
  storage: PanelStorageLike | undefined = defaultStorage(),
  key: string,
  defaultValue = false,
): boolean {
  if (!storage) {
    return defaultValue;
  }

  try {
    const value = storage.getItem(key);
    if (value === '1') {
      return true;
    }
    if (value === '0') {
      return false;
    }
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export function saveBooleanPreference(
  storage: PanelStorageLike | undefined = defaultStorage(),
  key: string,
  value: boolean,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, value ? '1' : '0');
  } catch {
    // Ignore unavailable storage, for example in restricted renderer contexts.
  }
}

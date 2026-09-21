import React, { useEffect, useMemo } from 'react';
import {
  Bot,
  Copy,
  Edit3,
  Globe2,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import {
  type DesktopSessionSummary,
  type LastbrowserPanelId,
  type ProjectSummary,
  lastbrowserPanels,
  sessionTitle
} from '../shell-state.js';

export type SidekickActionId = 'summarize-page' | 'explain-selection' | 'research-page';

export type SidekickMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  pending?: boolean;
};

export const panelContextItems: Partial<Record<LastbrowserPanelId, string[]>> = {
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
  browser: ['AI Search', 'Brief', 'Sources', 'Automation tools'],
  terminal: ['Terminal', 'New session', 'Close']
};

export function panelForContextItem(item: string): LastbrowserPanelId | null {
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

export type ContextSidebarProps = {
  activePanel: LastbrowserPanelId;
  activeSessionId: string | null;
  busy: boolean;
  collapsed: boolean;
  activeContextItem: string;
  messages: SidekickMessage[];
  search: string;
  sessions: DesktopSessionSummary[];
  serviceStatus: { sidekick?: string } | null;
  sessionError: string;
  projects: ProjectSummary[];
  activeProjectFilter: string | null;
  activeTagFilter: string | null;
  onAction: (action: SidekickActionId) => Promise<void>;
  onNewSession: () => void;
  onPanel: (panel: LastbrowserPanelId) => void;
  onDeleteSession: (session: DesktopSessionSummary) => void;
  onDuplicateSession: (session: DesktopSessionSummary) => void;
  onRenameSession: (session: DesktopSessionSummary) => void;
  onPinSession: (session: DesktopSessionSummary) => void;
  onArchiveSession: (session: DesktopSessionSummary) => void;
  onSearch: (value: string) => void;
  onSelectSession: (sessionId: string) => void;
  onContextItemChange: (item: string) => void;
  onBrowserModeChange: (mode: 'home' | 'search' | 'web') => void;
  onToggleCollapse: () => void;
  onResizeStart?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onProjectFilter: (projectId: string | null) => void;
  onTagFilter: (tag: string | null) => void;
};

export function ContextSidebar({
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
  projects,
  activeProjectFilter,
  activeTagFilter,
  onAction,
  onNewSession,
  onPanel,
  onDeleteSession,
  onDuplicateSession,
  onRenameSession,
  onPinSession,
  onArchiveSession,
  onSearch,
  onSelectSession,
  onContextItemChange,
  onBrowserModeChange,
  onToggleCollapse,
  onResizeStart,
  onProjectFilter,
  onTagFilter
}: ContextSidebarProps): React.JSX.Element {
  const panel = lastbrowserPanels.find((item) => item.id === activePanel) || lastbrowserPanels[0];

  // Extract all tags from sessions
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const s of sessions) {
      if (s.tags) for (const t of s.tags) tagSet.add(t);
      const tagMatch = s.title?.match(/#(\w+)/g);
      if (tagMatch) tagMatch.forEach((t) => tagSet.add(t.slice(1)));
    }
    return Array.from(tagSet).sort();
  }, [sessions]);

  // Filter sessions by search, project, and tag
  const filteredSessions = useMemo(() => {
    let result = sessions;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((s) => {
        const haystack = `${s.title || ''} ${s.workspace || ''}`.toLowerCase();
        return haystack.includes(q);
      });
    }
    if (activeProjectFilter) {
      result = result.filter((s) => s.project_id === activeProjectFilter);
    }
    if (activeTagFilter) {
      result = result.filter((s) => {
        if (s.tags?.includes(activeTagFilter)) return true;
        return s.title?.toLowerCase().includes(`#${activeTagFilter}`.toLowerCase()) ?? false;
      });
    }
    return result;
  }, [sessions, search, activeProjectFilter, activeTagFilter]);

  // Group sessions: pinned first, then by project, then unassigned
  const groupedSessions = useMemo(() => {
    const pinned: DesktopSessionSummary[] = [];
    const byProject = new Map<string, DesktopSessionSummary[]>();
    const unassigned: DesktopSessionSummary[] = [];

    for (const s of filteredSessions) {
      if (s.pinned) {
        pinned.push(s);
      } else if (s.project_id) {
        const list = byProject.get(s.project_id) || [];
        list.push(s);
        byProject.set(s.project_id, list);
      } else {
        unassigned.push(s);
      }
    }

    const groups: {
      label: string;
      color?: string;
      sessions: DesktopSessionSummary[];
      kind: 'pinned' | 'project' | 'unassigned' | 'archived';
    }[] = [];
    if (pinned.length) groups.push({ label: 'Pinned', sessions: pinned, kind: 'pinned' });

    for (const [pid, sessList] of byProject) {
      const proj = projects.find((p) => p.project_id === pid);
      groups.push({ label: proj?.name || pid, color: proj?.color || '#888', sessions: sessList, kind: 'project' });
    }

    if (unassigned.length) groups.push({ label: 'Other', sessions: unassigned, kind: 'unassigned' });

    return groups;
  }, [filteredSessions, projects]);

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
          {/* Project filter bar */}
          {projects.length > 0 && (
            <div className="session-project-filters">
              <button
                type="button"
                className={`project-filter-chip ${!activeProjectFilter ? 'active' : ''}`}
                onClick={() => onProjectFilter(null)}
              >
                All
              </button>
              {projects.map((proj) => (
                <button
                  key={proj.project_id}
                  type="button"
                  className={`project-filter-chip ${activeProjectFilter === proj.project_id ? 'active' : ''}`}
                  style={proj.color ? ({ '--chip-color': proj.color } as React.CSSProperties) : undefined}
                  onClick={() => onProjectFilter(proj.project_id === activeProjectFilter ? null : proj.project_id)}
                >
                  {proj.name}
                </button>
              ))}
            </div>
          )}
          {/* Tag filter bar */}
          {allTags.length > 0 && (
            <div className="session-tag-filters">
              {allTags.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`tag-filter-chip ${activeTagFilter === tag ? 'active' : ''}`}
                  onClick={() => onTagFilter(tag === activeTagFilter ? null : tag)}
                >
                  {activeTagFilter === tag ? '✕ ' : '# '}
                  {tag}
                </button>
              ))}
              {allTags.length > 8 && <span className="tag-filter-more">+{allTags.length - 8}</span>}
            </div>
          )}
          <div className="session-list">
            {groupedSessions.map((group) => (
              <div key={group.label} className="session-group">
                <div className="session-group-header">
                  {group.kind === 'pinned' ? (
                    <span className="session-group-dot pinned-dot" />
                  ) : group.kind === 'project' ? (
                    <span className="session-group-dot" style={{ background: group.color }} />
                  ) : null}
                  <span className="session-group-label">{group.label}</span>
                  <span className="session-group-count">{group.sessions.length}</span>
                </div>
                {group.sessions.map((session) => (
                  <div
                    key={session.session_id}
                    className={`session-item ${session.session_id === activeSessionId ? 'active' : ''}`}
                  >
                    <button type="button" className="session-main" onClick={() => onSelectSession(session.session_id)}>
                      <span>{sessionTitle(session)}</span>
                      <small>{session.workspace || session.source_label || 'Sidekick'}</small>
                      {session.is_cli_session && <span className="session-cli-badge">CLI</span>}
                    </button>
                    <div className="session-actions">
                      <button type="button" title={session.pinned ? 'Unpin' : 'Pin'} onClick={() => onPinSession(session)}>
                        <Star size={13} fill={session.pinned ? 'currentColor' : 'none'} />
                      </button>
                      <button type="button" title="Rename" onClick={() => onRenameSession(session)}>
                        <Edit3 size={13} />
                      </button>
                      <button type="button" title="Duplicate" onClick={() => onDuplicateSession(session)}>
                        <Copy size={13} />
                      </button>
                      <button type="button" title="Delete" onClick={() => onDeleteSession(session)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
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
      {!collapsed && onResizeStart && (
        <div className="sidebar-resize-handle context-resize-handle" role="presentation" aria-hidden="true" onMouseDown={onResizeStart} />
      )}

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

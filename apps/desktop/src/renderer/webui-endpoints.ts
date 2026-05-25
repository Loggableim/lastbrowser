import type { LastbrowserPanelId } from './shell-state.js';

export type WebuiEndpointMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type WebuiEndpointAction = {
  id: string;
  panel: LastbrowserPanelId;
  label: string;
  method: WebuiEndpointMethod;
  path: string;
  queryTemplate?: Record<string, string | number | boolean>;
  bodyTemplate?: Record<string, unknown>;
  dangerous?: boolean;
};

export type WebuiEndpointGroup = {
  id: string;
  panel: LastbrowserPanelId;
  title: string;
  description: string;
  actions: WebuiEndpointAction[];
};

function action(
  panel: LastbrowserPanelId,
  id: string,
  label: string,
  method: WebuiEndpointMethod,
  path: string,
  options: Pick<WebuiEndpointAction, 'queryTemplate' | 'bodyTemplate' | 'dangerous'> = {}
): WebuiEndpointAction {
  return { id, panel, label, method, path, ...options };
}

export const webuiEndpointGroups: WebuiEndpointGroup[] = [
  {
    id: 'skills-full',
    panel: 'skills',
    title: 'Skills Files',
    description: 'Skill library content, save and delete endpoints for SKILL.md and linked files.',
    actions: [
      action('skills', 'skills-list', 'Skills', 'GET', '/api/skills'),
      action('skills', 'skill-content', 'Skill content', 'GET', '/api/skills/content', { queryTemplate: { name: '', file: '' } }),
      action('skills', 'skill-save', 'Save skill', 'POST', '/api/skills/save', { bodyTemplate: { name: '', content: '' } }),
      action('skills', 'skill-delete', 'Delete skill', 'POST', '/api/skills/delete', { bodyTemplate: { name: '' }, dangerous: true })
    ]
  },
  {
    id: 'chat-sessions',
    panel: 'chat',
    title: 'Chat, Sessions, Approvals',
    description: 'Session lifecycle, command execution, approval flows and advanced chat controls.',
    actions: [
      action('chat', 'session-export', 'Export session', 'GET', '/api/session/export', { queryTemplate: { session_id: '' } }),
      action('chat', 'session-import', 'Import session', 'POST', '/api/session/import', { bodyTemplate: { payload: {} } }),
      action('chat', 'session-update', 'Update session', 'POST', '/api/session/update', { bodyTemplate: { session_id: '', patch: {} } }),
      action('chat', 'session-retry', 'Retry answer', 'POST', '/api/session/retry', { bodyTemplate: { session_id: '' } }),
      action('chat', 'session-undo', 'Undo last turn', 'POST', '/api/session/undo', { bodyTemplate: { session_id: '' } }),
      action('chat', 'session-branch', 'Branch session', 'POST', '/api/session/branch', { bodyTemplate: { session_id: '', message_index: 0 } }),
      action('chat', 'session-compress', 'Compress context', 'POST', '/api/session/compress', { bodyTemplate: { session_id: '' } }),
      action('chat', 'session-yolo', 'Toggle yolo', 'POST', '/api/session/yolo', { bodyTemplate: { session_id: '', enabled: true } }),
      action('chat', 'session-archive', 'Archive session', 'POST', '/api/session/archive', { bodyTemplate: { session_id: '', archived: true } }),
      action('chat', 'session-pin', 'Pin session', 'POST', '/api/session/pin', { bodyTemplate: { session_id: '', pinned: true } }),
      action('chat', 'session-move', 'Move session', 'POST', '/api/session/move', { bodyTemplate: { session_id: '', workspace: '' } }),
      action('chat', 'session-delete', 'Delete session', 'POST', '/api/session/delete', { bodyTemplate: { session_id: '' }, dangerous: true }),
      action('chat', 'session-search', 'Search sessions', 'GET', '/api/sessions/search', { queryTemplate: { q: '' } }),
      action('chat', 'session-rounds', 'Conversation rounds', 'GET', '/api/session/conversation-rounds', { queryTemplate: { session_id: '' } }),
      action('chat', 'session-handoff', 'Handoff summary', 'GET', '/api/session/handoff-summary', { queryTemplate: { session_id: '' } }),
      action('chat', 'session-toolsets', 'Toolsets', 'GET', '/api/session/toolsets', { queryTemplate: { session_id: '' } }),
      action('chat', 'session-truncate', 'Truncate session', 'POST', '/api/session/truncate', { bodyTemplate: { session_id: '', message_index: 0 }, dangerous: true }),
      action('chat', 'chat-steer', 'Steer run', 'POST', '/api/chat/steer', { bodyTemplate: { session_id: '', instruction: '' } }),
      action('chat', 'chat-apply-patch', 'Apply patch', 'POST', '/api/chat/apply-patch', { bodyTemplate: { session_id: '', patch: '' }, dangerous: true }),
      action('chat', 'chat-plan-accept', 'Accept plan', 'POST', '/api/chat/plan/accept', { bodyTemplate: { session_id: '' } }),
      action('chat', 'chat-plan-revise', 'Revise plan', 'POST', '/api/chat/plan/revise', { bodyTemplate: { session_id: '', instruction: '' } }),
      action('chat', 'commands', 'Commands', 'GET', '/api/commands'),
      action('chat', 'command-exec', 'Execute command', 'POST', '/api/commands/exec', { bodyTemplate: { command: '' }, dangerous: true }),
      action('chat', 'models', 'Models', 'GET', '/api/models'),
      action('chat', 'models-refresh', 'Refresh models', 'POST', '/api/models/refresh'),
      action('chat', 'personalities', 'Personalities', 'GET', '/api/personalities'),
      action('chat', 'personality-set', 'Set personality', 'POST', '/api/personality/set', { bodyTemplate: { personality: 'default' } }),
      action('chat', 'reasoning', 'Reasoning controls', 'GET', '/api/reasoning'),
      action('chat', 'approval-pending', 'Pending approvals', 'GET', '/api/approval/pending', { queryTemplate: { session_id: '' } }),
      action('chat', 'approval-respond', 'Respond approval', 'POST', '/api/approval/respond', { bodyTemplate: { session_id: '', approval_id: '', decision: 'approve' } }),
      action('chat', 'clarify-pending', 'Pending clarifications', 'GET', '/api/clarify/pending', { queryTemplate: { session_id: '' } }),
      action('chat', 'clarify-respond', 'Respond clarification', 'POST', '/api/clarify/respond', { bodyTemplate: { session_id: '', clarify_id: '', answer: '' } }),
      action('chat', 'background-status', 'Background status', 'GET', '/api/background/status', { queryTemplate: { session_id: '' } }),
      action('chat', 'background', 'Background task', 'POST', '/api/background', { bodyTemplate: { session_id: '', enabled: true } }),
      action('chat', 'btw', 'BTW task', 'POST', '/api/btw', { bodyTemplate: { session_id: '', message: '' } })
    ]
  },
  {
    id: 'spaces-workspace',
    panel: 'workspaces',
    title: 'Spaces, Projects, Workspace Files',
    description: 'Spaces, projects, workspace suggestions, file utilities and rollback tools.',
    actions: [
      action('workspaces', 'projects', 'Projects', 'GET', '/api/projects'),
      action('workspaces', 'project-create', 'Create project', 'POST', '/api/projects/create', { bodyTemplate: { name: '', path: '' } }),
      action('workspaces', 'project-rename', 'Rename project', 'POST', '/api/projects/rename', { bodyTemplate: { project_id: '', name: '' } }),
      action('workspaces', 'project-delete', 'Delete project', 'POST', '/api/projects/delete', { bodyTemplate: { project_id: '' }, dangerous: true }),
      action('workspaces', 'spaces-list', 'Spaces', 'GET', '/api/spaces'),
      action('workspaces', 'space-create', 'Create space', 'POST', '/api/space/create', { bodyTemplate: { slug: '', path: '', name: '' } }),
      action('workspaces', 'space-delete', 'Delete space', 'POST', '/api/space/delete', { bodyTemplate: { slug: '' }, dangerous: true }),
      action('workspaces', 'space-config', 'Space config', 'GET', '/api/space/config', { queryTemplate: { slug: '' } }),
      action('workspaces', 'space-agents', 'Space agents', 'GET', '/api/space/agents', { queryTemplate: { slug: '' } }),
      action('workspaces', 'workspace-suggest', 'Workspace suggestions', 'GET', '/api/workspaces/suggest', { queryTemplate: { q: '' } }),
      action('workspaces', 'file-raw', 'Raw file', 'GET', '/api/file/raw', { queryTemplate: { session_id: '', path: '' } }),
      action('workspaces', 'file-path', 'File path', 'GET', '/api/file/path', { queryTemplate: { session_id: '', path: '' } }),
      action('workspaces', 'file-reveal', 'Reveal file', 'POST', '/api/file/reveal', { bodyTemplate: { session_id: '', path: '' } }),
      action('workspaces', 'file-media', 'Media preview', 'GET', '/api/file/media', { queryTemplate: { session_id: '', path: '' } }),
      action('workspaces', 'file-upload', 'Upload file', 'POST', '/api/file/upload', { bodyTemplate: { session_id: '', path: '', content_base64: '' } }),
      action('workspaces', 'file-extract', 'Extract file', 'POST', '/api/file/extract', { bodyTemplate: { session_id: '', path: '' } }),
      action('workspaces', 'file-transcribe', 'Transcribe media', 'POST', '/api/file/transcribe', { bodyTemplate: { session_id: '', path: '' } }),
      action('workspaces', 'rollback-list', 'Rollback list', 'GET', '/api/rollback/list', { queryTemplate: { workspace: '' } }),
      action('workspaces', 'rollback-diff', 'Rollback diff', 'GET', '/api/rollback/diff', { queryTemplate: { workspace: '', snapshot: '' } }),
      action('workspaces', 'rollback-restore', 'Rollback restore', 'POST', '/api/rollback/restore', { bodyTemplate: { workspace: '', snapshot: '' }, dangerous: true }),
      action('workspaces', 'git-info', 'Git info', 'GET', '/api/git-info', { queryTemplate: { session_id: '' } })
    ]
  },
  {
    id: 'tasks-crons',
    panel: 'tasks',
    title: 'Tasks and Cron Runs',
    description: 'Scheduled jobs, recent output, run history and runtime status.',
    actions: [
      action('tasks', 'crons', 'Crons', 'GET', '/api/crons'),
      action('tasks', 'cron-status', 'Cron status', 'GET', '/api/crons/status', { queryTemplate: { job_id: '' } }),
      action('tasks', 'cron-history', 'Cron history', 'GET', '/api/crons/history', { queryTemplate: { job_id: '' } }),
      action('tasks', 'cron-recent', 'Recent runs', 'GET', '/api/crons/recent', { queryTemplate: { since: '' } }),
      action('tasks', 'cron-run-query', 'Run by query', 'GET', '/api/crons/run', { queryTemplate: { job_id: '' } })
    ]
  },
  {
    id: 'kanban-full',
    panel: 'kanban',
    title: 'Kanban Boards and Events',
    description: 'Boards, config, stats, assignees, comments, links, dispatch and event stream endpoints.',
    actions: [
      action('kanban', 'boards', 'Boards', 'GET', '/api/kanban/boards'),
      action('kanban', 'board-detail', 'Board detail', 'GET', '/api/kanban/boards/', { queryTemplate: { board: '' } }),
      action('kanban', 'board-config', 'Board config', 'GET', '/api/kanban/config'),
      action('kanban', 'board-stats', 'Board stats', 'GET', '/api/kanban/stats'),
      action('kanban', 'assignees', 'Assignees', 'GET', '/api/kanban/assignees'),
      action('kanban', 'events', 'Events', 'GET', '/api/kanban/events'),
      action('kanban', 'events-stream', 'Events stream', 'GET', '/api/kanban/events/stream'),
      action('kanban', 'tasks', 'Tasks', 'GET', '/api/kanban/tasks'),
      action('kanban', 'task-detail', 'Task detail', 'GET', '/api/kanban/tasks/', { queryTemplate: { task_id: '' } }),
      action('kanban', 'task-bulk', 'Bulk tasks', 'POST', '/api/kanban/tasks/bulk', { bodyTemplate: { task_ids: [], action: '' } }),
      action('kanban', 'task-dispatch', 'Dispatch task', 'POST', '/api/kanban/dispatch', { bodyTemplate: { task_id: '', assignee: '' } }),
      action('kanban', 'task-comments', 'Task comments', 'GET', '/api/kanban/tasks/comments', { queryTemplate: { task_id: '' } }),
      action('kanban', 'task-links', 'Task links', 'GET', '/api/kanban/tasks/links', { queryTemplate: { task_id: '' } })
    ]
  },
  {
    id: 'browser-automation',
    panel: 'browser',
    title: 'Browser Automation Tools',
    description: 'Legacy WebUI browser runtime as an automation tool while Electron remains the user browser.',
    actions: [
      action('browser', 'browser-state', 'Automation state', 'GET', '/api/browser/state', { queryTemplate: { session_id: '' } }),
      action('browser', 'browser-permission', 'Permission', 'GET', '/api/browser/permission', { queryTemplate: { session_id: '' } }),
      action('browser', 'browser-control', 'Control browser', 'POST', '/api/browser/control', { bodyTemplate: { session_id: '', command: 'open', url: '' } }),
      action('browser', 'browser-action', 'Browser action', 'POST', '/api/browser/action', { bodyTemplate: { session_id: '', action: '', args: {} } }),
      action('browser', 'browser-events', 'Browser events', 'GET', '/api/browser/events', { queryTemplate: { session_id: '' } }),
      action('browser', 'browser-frame', 'Browser frame', 'GET', '/api/browser/frame', { queryTemplate: { session_id: '' } }),
      action('browser', 'browser-agent-control', 'Agent control', 'POST', '/api/browser/agent-control', { bodyTemplate: { session_id: '', enabled: true } }),
      action('browser', 'cast-status', 'Cast status', 'GET', '/api/cast/status'),
      action('browser', 'cast-toggle', 'Toggle cast', 'POST', '/api/cast/toggle', { bodyTemplate: { enabled: true } })
    ]
  },
  {
    id: 'agents-advanced',
    panel: 'agents',
    title: 'Agent Advanced APIs',
    description: 'Creator flow, active agent, sessions, profile, memory, soul and workspace terminal controls.',
    actions: [
      action('agents', 'agent-activated', 'Activated agents', 'GET', '/api/agents/activated'),
      action('agents', 'agent-current', 'Current agent', 'GET', '/api/agents/current'),
      action('agents', 'agent-create', 'Create agent', 'POST', '/api/agents/create', { bodyTemplate: { slug: '', name: '', prompt: '' } }),
      action('agents', 'agent-detail', 'Agent detail', 'GET', '/api/agents/', { queryTemplate: { slug: '' } }),
      action('agents', 'agent-sessions', 'Agent sessions', 'GET', '/api/agents/research/sessions'),
      action('agents', 'agent-session-detail', 'Agent session detail', 'GET', '/api/agents/research/sessions/', { queryTemplate: { session_id: '' } }),
      action('agents', 'agent-chat', 'Agent chat', 'POST', '/api/agents/research/chat', { bodyTemplate: { session_id: '', message: '' } }),
      action('agents', 'agent-workspace', 'Agent workspace', 'GET', '/api/agents/workspace/', { queryTemplate: { session_id: '', path: '.' } }),
      action('agents', 'agent-workspace-stream', 'Agent workspace stream', 'GET', '/api/agents/workspace/stream/', { queryTemplate: { session_id: '' } })
    ]
  },
  {
    id: 'profiles-full',
    panel: 'profiles',
    title: 'Profiles',
    description: 'Profile list, active profile, create, switch and delete endpoints.',
    actions: [
      action('profiles', 'profiles-list', 'Profiles', 'GET', '/api/profiles'),
      action('profiles', 'profile-active', 'Active profile', 'GET', '/api/profile/active'),
      action('profiles', 'profile-switch', 'Switch profile', 'POST', '/api/profile/switch', { bodyTemplate: { name: 'default' } }),
      action('profiles', 'profile-create', 'Create profile', 'POST', '/api/profile/create', { bodyTemplate: { name: '', model: '', provider: '' } }),
      action('profiles', 'profile-delete', 'Delete profile', 'POST', '/api/profile/delete', { bodyTemplate: { name: '' }, dangerous: true })
    ]
  },
  {
    id: 'memory-full',
    panel: 'memory',
    title: 'Memory and Supermemory',
    description: 'Core memory, writes, Supermemory document operations and hybrid search.',
    actions: [
      action('memory', 'memory-read', 'Memory', 'GET', '/api/memory'),
      action('memory', 'memory-write', 'Write memory', 'POST', '/api/memory/write', { bodyTemplate: { section: 'memory', content: '' } }),
      action('memory', 'supermemory-status', 'Supermemory status', 'GET', '/api/memory/supermemory/status'),
      action('memory', 'supermemory-list', 'Supermemory list', 'GET', '/api/memory/supermemory/list'),
      action('memory', 'supermemory-document', 'Supermemory document', 'GET', '/api/memory/supermemory/document', { queryTemplate: { id: '' } }),
      action('memory', 'supermemory-search', 'Supermemory search', 'POST', '/api/memory/supermemory/search', { bodyTemplate: { query: '', limit: 20 } }),
      action('memory', 'supermemory-add', 'Add Supermemory document', 'POST', '/api/memory/supermemory/add', { bodyTemplate: { title: '', content: '', metadata: {} } }),
      action('memory', 'supermemory-forget', 'Forget Supermemory document', 'POST', '/api/memory/supermemory/forget', { bodyTemplate: { id: '' }, dangerous: true }),
      action('memory', 'hybrid-memory-search', 'Hybrid search', 'POST', '/api/memory/hybrid/search', { bodyTemplate: { query: '', limit: 20 } })
    ]
  },
  {
    id: 'logs-errors',
    panel: 'logs',
    title: 'Logs and Errors',
    description: 'Log tails, error database, stats and clear operations.',
    actions: [
      action('logs', 'logs-tail', 'Logs', 'GET', '/api/logs', { queryTemplate: { file: '', tail: 200 } }),
      action('logs', 'errors-list', 'Errors', 'GET', '/api/errors/'),
      action('logs', 'errors-stats', 'Error stats', 'GET', '/api/errors/stats'),
      action('logs', 'errors-log', 'Error log', 'GET', '/api/errors/log'),
      action('logs', 'errors-db-path', 'Error database path', 'GET', '/api/errors/db-path'),
      action('logs', 'errors-clear', 'Clear errors', 'POST', '/api/errors/clear', { dangerous: true })
    ]
  },
  {
    id: 'integrations-gmail-discord',
    panel: 'gmail',
    title: 'Gmail Advanced APIs',
    description: 'Mail search, read/send/move/delete, AI actions and stream surfaces.',
    actions: [
      action('gmail', 'gmail-stream', 'Gmail stream', 'GET', '/api/gmail/stream'),
      action('gmail', 'gmail-task', 'Create mail task', 'POST', '/api/gmail/ai/task', { bodyTemplate: { message_id: '', title: '' } }),
      action('gmail', 'gmail-related', 'Related mail', 'GET', '/api/gmail/ai/related', { queryTemplate: { message_id: '' } })
    ]
  },
  {
    id: 'integrations-discord',
    panel: 'discord',
    title: 'Discord Advanced APIs',
    description: 'Guild, channel tree, roles, members, moderation, config and bot information.',
    actions: [
      action('discord', 'discord-config', 'Discord config', 'POST', '/api/discord/config', { bodyTemplate: { action: 'get' } }),
      action('discord', 'discord-ban', 'Ban member', 'POST', '/api/discord/ban', { bodyTemplate: { user_id: '', reason: '' }, dangerous: true }),
      action('discord', 'discord-purge', 'Purge messages', 'POST', '/api/discord/purge', { bodyTemplate: { channel_id: '', amount: 10 }, dangerous: true })
    ]
  },
  {
    id: 'appstore-full',
    panel: 'appstore',
    title: 'Appstore Full Surface',
    description: 'Home, category, detail, my apps, SDK, submit, install, uninstall and update flows.',
    actions: [
      action('appstore', 'appstore-home', 'Home', 'GET', '/api/appstore'),
      action('appstore', 'appstore-detail', 'Detail', 'GET', '/api/appstore/detail', { queryTemplate: { app_id: '' } }),
      action('appstore', 'appstore-my-apps', 'My apps', 'GET', '/api/appstore/my'),
      action('appstore', 'appstore-updates', 'Updates', 'GET', '/api/appstore/updates'),
      action('appstore', 'appstore-update', 'Update app', 'POST', '/api/appstore/update', { bodyTemplate: { app_id: '' } })
    ]
  },
  {
    id: 'settings-system',
    panel: 'settings',
    title: 'Settings, System, Gateway',
    description: 'Providers, plugins, MCP, health, logs, updates and privileged system actions.',
    actions: [
      action('settings', 'auth-status', 'Auth status', 'GET', '/api/auth/status'),
      action('settings', 'auth-logout', 'Logout', 'POST', '/api/auth/logout', { dangerous: true }),
      action('settings', 'providers', 'Providers', 'GET', '/api/providers'),
      action('settings', 'provider-quota', 'Provider quota', 'GET', '/api/provider/quota'),
      action('settings', 'provider-delete', 'Delete provider', 'POST', '/api/providers/delete', { bodyTemplate: { provider: '' }, dangerous: true }),
      action('settings', 'plugins', 'Plugins', 'GET', '/api/plugins'),
      action('settings', 'mcp-servers', 'MCP servers', 'GET', '/api/mcp/servers'),
      action('settings', 'mcp-tools', 'MCP tools', 'GET', '/api/mcp/tools'),
      action('settings', 'dashboard-status', 'Dashboard status', 'GET', '/api/dashboard/status'),
      action('settings', 'dashboard-config', 'Dashboard config', 'GET', '/api/dashboard/config'),
      action('settings', 'errors', 'Errors', 'GET', '/api/errors/'),
      action('settings', 'system-health', 'System health', 'GET', '/api/system/health'),
      action('settings', 'update-check', 'Check updates', 'GET', '/api/updates/check', { queryTemplate: { force: 1 } }),
      action('settings', 'update-force', 'Force update', 'POST', '/api/updates/force', { dangerous: true }),
      action('settings', 'update-apply', 'Apply update', 'POST', '/api/updates/apply', { dangerous: true }),
      action('settings', 'gateway-status', 'Gateway status', 'GET', '/api/gateway/status'),
      action('settings', 'gateway-restart', 'Restart gateway', 'POST', '/api/gateway/restart', { dangerous: true }),
      action('settings', 'system-shutdown', 'Shutdown system', 'POST', '/api/system/shutdown', { dangerous: true }),
      action('settings', 'system-restart', 'Restart system', 'POST', '/api/system/restart', { dangerous: true }),
      action('settings', 'terminal-start', 'Terminal start', 'POST', '/api/terminal/start', { bodyTemplate: { session_id: '', cwd: '' }, dangerous: true }),
      action('settings', 'terminal-input', 'Terminal input', 'POST', '/api/terminal/input', { bodyTemplate: { terminal_id: '', data: '' } }),
      action('settings', 'terminal-resize', 'Terminal resize', 'POST', '/api/terminal/resize', { bodyTemplate: { terminal_id: '', cols: 120, rows: 32 } }),
      action('settings', 'terminal-close', 'Terminal close', 'POST', '/api/terminal/close', { bodyTemplate: { terminal_id: '' } }),
      action('settings', 'terminal-stream', 'Terminal stream', 'GET', '/api/terminal/stream', { queryTemplate: { terminal_id: '' } }),
      action('settings', 'window-control', 'Window control', 'POST', '/api/window/control', { bodyTemplate: { action: 'focus' } })
    ]
  },
  {
    id: 'evey',
    panel: 'insights',
    title: 'Evey Observability',
    description: 'Evey dashboard, telemetry, learning, validation, memory, habits, cache and watchdog endpoints.',
    actions: [
      action('insights', 'evey-dashboard', 'Dashboard', 'GET', '/api/evey/dashboard'),
      action('insights', 'evey-status', 'Status', 'GET', '/api/evey/status'),
      action('insights', 'evey-telemetry', 'Telemetry', 'GET', '/api/evey/telemetry'),
      action('insights', 'evey-learnings', 'Learnings', 'GET', '/api/evey/learnings'),
      action('insights', 'evey-delegation', 'Delegation stats', 'GET', '/api/evey/delegation/stats'),
      action('insights', 'evey-habits', 'Habit insights', 'GET', '/api/evey/habits/insights'),
      action('insights', 'evey-cache', 'Cache', 'GET', '/api/evey/cache'),
      action('insights', 'evey-schedule', 'Schedule', 'GET', '/api/evey/schedule'),
      action('insights', 'evey-watchdog', 'Watchdog', 'GET', '/api/evey/watchdog/status'),
      action('insights', 'evey-learn', 'Record learning', 'POST', '/api/evey/learn', { bodyTemplate: { task: '', model_or_tool: '', quality_score: 5 } }),
      action('insights', 'evey-validate', 'Validate output', 'POST', '/api/evey/validate', { bodyTemplate: { task: '', result: '', model_used: 'unknown' } }),
      action('insights', 'evey-memory-score', 'Memory score', 'POST', '/api/evey/memory/score', { bodyTemplate: { key: '' } }),
      action('insights', 'evey-watchdog-heartbeat', 'Watchdog heartbeat', 'POST', '/api/evey/watchdog/heartbeat')
    ]
  }
];

export function endpointGroupsForPanel(panel: LastbrowserPanelId): WebuiEndpointGroup[] {
  return webuiEndpointGroups.filter((group) => group.panel === panel);
}

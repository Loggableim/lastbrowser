# HermesBrowser Architecture

> Generated via DeepSeek Pro (deepseek-chat) — 13.05.2026

## Data Model (TypeScript Interfaces)

```typescript
interface Workspace {
  id: string;
  name: string;
  icon: string;
  color: string;
  sessionPartition: string;   // Electron session.fromPartition()
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface App {
  id: string;
  name: string;
  url: string;
  icon: string;
  manifestUrl: string;
  isPinned: boolean;
  order: number;
  workspaceId: string;
  accounts: Account[];
}

interface Account {
  id: string;
  appId: string;
  label: string;              // "Gmail Work", "Gmail Private"
  avatarUrl: string;
  sessionPartition: string;   // per-account isolation
  isActive: boolean;
}

interface Tab {
  id: string;
  title: string;
  url: string;
  favicon: string;
  workspaceId: string;
  appId: string | null;
  accountId: string | null;
  parentTabId: string | null;
  tabSetId: string | null;
  order: number;
  isPinned: boolean;
  isSuspended: boolean;
  lastAccessed: string;
  createdAt: string;
}

interface TabSet {
  id: string;
  name: string;
  color: string;
  workspaceId: string;
  order: number;
}

interface SplitLayout {
  id: string;
  workspaceId: string;
  layout: '50/50' | '70/30' | '30/70' | '3-col' | '2x2';
  panels: Panel[];
}

interface Panel {
  id: string;
  splitViewId: string;
  tabId: string;
  position: number;
  size: number;               // relative width/height
}

interface UserTask {
  id: string;
  title: string;
  description: string;
  workspaceId: string;
  isCompleted: boolean;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FocusSession {
  id: string;
  type: 'pomodoro' | 'focus' | 'break';
  durationMinutes: number;
  startedAt: string;
  endedAt: string | null;
  workspaceId: string;
}

interface FocusRule {
  id: string;
  pattern: string;            // URL pattern (glob/regex)
  redirect: string | null;    // redirect URL or null = block
  enabled: boolean;
}

interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  compactMode: boolean;
  focusMode: boolean;
  resourceSaver: boolean;
  adblockEnabled: boolean;
  cookieControl: 'allow_all' | 'block_third_party' | 'strict';
  suspendTimeoutMinutes: number;
  pomodoroDuration: number;
  backupPath: string;
}

interface NotificationState {
  id: string;
  appId: string;
  title: string;
  body: string;
  badgeCount: number;
  timestamp: string;
  isRead: boolean;
}
```

## SQLite Schema

See `src/main/database/schema.sql` for the full DDL.

| Table | Purpose |
|-------|---------|
| `workspaces` | Workspace definitions + session partition IDs |
| `apps` | Pinned app shortcuts |
| `accounts` | Multi-account per app |
| `tabs` | All open/historical tabs |
| `tab_sets` | Tab groups/collections |
| `split_views` | Saved split layouts |
| `panels` | Individual panels in a split |
| `tasks` | Per-workspace tasks |
| `focus_sessions` | Pomodoro/focus history |
| `focus_rules` | Distraction blocking rules |
| `notifications` | Notification history |
| `settings` | Global app settings (single row) |

## IPC Channel Design

All channels follow `domain:action` naming:

```
workspace:list, workspace:create, workspace:update, workspace:delete, workspace:pause, workspace:export, workspace:import
app:list, app:create, app:update, app:delete, app:reorder, app:account:add, app:account:remove, app:account:switch
tab:create, tab:update, tab:close, tab:restore, tab:suspend, tab:unsuspend, tab:set:create, tab:set:save, tab:set:restore
split:create, split:update, split:delete
focus:start, focus:stop, focus:pause, focus:status
settings:get, settings:update, settings:reset, backup:create, backup:restore
notification:list, notification:dismiss, notification:clear
palette:search
task:list, task:create, task:update, task:delete
```

## File Structure

```
F:\hermesbrowser\native\
├── package.json
├── electron-builder.config.js
├── main.js                    # Electron main process entry
├── preload.js                 # Context bridge
├── src/
│   ├── main/
│   │   ├── index.ts           # App lifecycle, window creation
│   │   ├── workspaceManager.ts
│   │   ├── appManager.ts
│   │   ├── tabManager.ts
│   │   ├── splitViewManager.ts
│   │   ├── focusManager.ts
│   │   ├── resourceSaver.ts
│   │   ├── notificationManager.ts
│   │   ├── settingsManager.ts
│   │   ├── commandPalette.ts
│   │   ├── taskManager.ts
│   │   ├── trayManager.ts
│   │   ├── pythonBridge.ts
│   │   ├── ipcRouter.ts       # Routes IPC to managers
│   │   └── database/
│   │       ├── index.ts       # SQLite init + migrations
│   │       └── schema.sql
│   ├── preload/
│   │   └── index.ts           # contextBridge API exposure
│   ├── renderer/
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── styles/
│   │   ├── components/
│   │   ├── stores/            # Zustand
│   │   └── hooks/
│   └── shared/
│       ├── types.ts
│       └── constants.ts
├── assets/
├── scripts/
└── docs/
```

## Implementation Phases

### Phase 1: Core Workspace & Session Isolation
- workspaceManager with session.fromPartition()
- Workspace CRUD + IPC handlers
- Basic workspace UI (list, selector)
- SQLite init + migrations

### Phase 2: App Sidebar & Multi-Account
- appManager with account support
- App/account IPC handlers
- Sidebar component with icons + account switcher
- App-specific session partitions

### Phase 3: Vertical Tabs & Tab Sets
- tabManager with suspension, pinning, tab sets
- Tab IPC handlers
- Vertical tab bar + tab set grouping UI
- Tab context menu

### Phase 4: Split View
- splitViewManager using WebContentsView
- Split IPC handlers
- Split view container with drag-to-resize panels
- 2-4 panel layouts

### Phase 5: Focus & Pomodoro
- focusManager with timer + distraction blocking
- Focus IPC handlers
- Pomodoro timer UI + focus mode overlay
- Focus rules engine

### Phase 6: Command Palette
- Fuzzy search index
- Ctrl+K overlay UI
- Keyboard navigation

### Phase 7: Tasks & Notifications
- taskManager + notificationManager
- Per-workspace task list UI
- Notification badges + panel

### Phase 8: Resource Saver & Privacy
- Tab suspension logic
- Adblock + cookie control via session.webRequest
- Memory indicators

### Phase 9: Settings & Backup/Restore
- Full settings UI
- JSON export/import
- Backup/restore controls

### Phase 10: Polish
- Animations, keyboard shortcuts
- Performance optimization
- Testing

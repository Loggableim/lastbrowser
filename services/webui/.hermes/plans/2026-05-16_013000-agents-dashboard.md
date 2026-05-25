# Plan: Agent Dashboard (Vorschlag B)

> Proposal: Clean multi-agent overview with status bar, agent grid with stats, and cross-agent activity feed.

---

## Goal

Replace the current Agents panel (grid + cramped 3-pane workspace + interfering rightpanel) with a full-view **Agent Dashboard** that lives in `<main class="main">` and gives the user a comprehensive overview of all agents at a glance.

---

## Current State

- **`#panelAgents`** in sidebar: shows either wizard or agent grid + chat/workspace view
- **No `#mainAgents`** — everything is cramped into the sidebar panel
- **Rightpanel** shows workspace file tree (useless in Agents context)
- **No activity log** — no cross-agent history
- **Agent grid** is bare: just name + emoji + description
- **Chat** and **Workspace** are in a 3-pane layout that's too narrow

## Target Layout

```
┌─ panelAgents (sidebar) ─────┬─ mainAgents ─────────────────────────────┐
│ Kompakte Agenten-Liste       │ (showing-agents → rightpanel hidden)     │
│ (nur Karten + Status)        │                                          │
│                               │ ┌─ Status Bar ────────────────────────┐ │
│ [🤖 Dev]    ● active         │ │ ● Dev (active)  ○ PM (idle)          │ │
│ [📋 PM]     ○ idle           │ │ Letzte: Dev → push origin main (2m) │ │
│ [🔬 Res]    ○ idle           │ └──────────────────────────────────────┘ │
│ [🎓 Mentor] ○ paused         │ ┌─ Agent Cards Grid ──────────────────┐ │
│                               │ │ [🤖 Dev     ] [📋 PM      ]        │ │
│ [+ Neu]                      │ │  ● active     ○ idle                │ │
│                               │ │  12 chats     3 chats              │ │
│ Klick → Agent-Chat öffnet    │ │  [Chat][WS]   [Chat][WS]           │ │
│ im main als Overlay/Modal    │ │                                      │ │
│                               │ │ [🔬 Researcher] [🎓 Mentor   ]    │ │
│                               │ │  ○ idle         ○ paused            │ │
│                               │ │  8 chats       1 chat              │ │
│                               │ │  [Chat][WS]   [Chat][WS]           │ │
│                               │ └──────────────────────────────────────┘ │
│                               │ ┌─ Activity Feed ────────────────────┐ │
│                               │ │ 🕐 14:32  Dev → git push main     │ │
│                               │ │ 🕐 14:28  PM  → Task v2.1 updated │ │
│                               │ │ 🕐 14:15  Res → Recherche fertig  │ │
│                               │ └──────────────────────────────────────┘ │
└───────────────────────────────┴──────────────────────────────────────────┘
```

---

## Step-by-Step Plan

### Step 1: Backend — Activity Log Table + API Endpoints

**File:** `api/agents.py`

1. Add new table `agent_activity` to `_ensure_schema()`:
   ```sql
   CREATE TABLE IF NOT EXISTS agent_activity (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       agent_slug  TEXT NOT NULL REFERENCES agents(slug) ON DELETE CASCADE,
       activity    TEXT NOT NULL,
       details     TEXT DEFAULT '',
       status      TEXT DEFAULT 'done',  -- 'running' | 'done' | 'error'
       created_at  TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_activity_agent ON agent_activity(agent_slug);
   CREATE INDEX IF NOT EXISTS idx_activity_time ON agent_activity(created_at DESC);
   ```

2. Add functions:
   - `log_activity(agent_slug, activity, details='', status='done')` — inserts activity row
   - `list_activities(limit=50, agent_slug=None)` — returns recent activities, ordered by `created_at DESC`
   - `get_agent_stats()` — returns per-agent: `{slug, message_count, session_count, last_activity, status}`

3. Add API endpoints in `api/routes.py`:
   - `GET /api/agents/activities?limit=50&agent=<slug>` → `list_activities()`
   - `GET /api/agents/stats` → `get_agent_stats()` → merged agent + activity data

4. Integrate logging into existing operations:
   - `chat_with_agent()` → log "Chat: {user_message[:60]}"
   - `spawn_hermes_agent()` → log "Hermes task: {task[:60]}"
   - `process_agent_request()` → log each command executed
   - Agent create/delete → log create/delete activity

### Step 2: Backend — `get_agent_stats()` Endpoint

**File:** `api/agents.py`

Query that returns per agent:
```python
{
  "slug": "developer",
  "name": "Developer",
  "emoji": "💻",
  "color": "#3B82F6",
  "status": "active",
  "message_count": 42,
  "session_count": 5,
  "last_activity": "vor 2 Min.",
  "last_activity_text": "git push origin main"
}
```

This powers the dashboard grid cells directly.

### Step 3: Frontend — HTML Structure für #mainAgents

**File:** `static/index.html`

1. Add `#mainAgents` in `<main class="main">` (after `#mainGmail`, before `#mainSettings`):
   - Status bar (top bar with agent status dots + last activity)
   - Agent cards grid (2-3 columns, responsive)
   - Activity feed (scrollable bottom section)
   - Chat overlay (modal/inline for active agent chat)

2. Add CSS reference for `agents-dashboard.css` in `<head>`

3. Add rail + sidebar-nav buttons (already exist)

### Step 4: Frontend — CSS: Dashboard, Grid, Feed

**File:** `static/agents-dashboard.css` (new, ~400 lines)

- `.dashboard-status-bar` — horizontal bar with status dots per agent, last activity marquee
- `.dashboard-grid` — CSS grid with agent cards (min 280px columns)
- `.agent-dashboard-card` — card with emoji, name, status dot, stats, action buttons
- `.dashboard-feed` — scrollable list with timeline entries
- `.feed-entry` — icon + time + agent name + activity text
- `body.showing-agents .rightpanel{display:none}` — hide workspace file tree

### Step 5: Frontend — panels.js Lifecycle

**File:** `static/panels.js`

1. Add `'agents'` to the `showing-` class list (line ~289)
2. Add Gmail/Discord-style full-view lifecycle:
   ```javascript
   // ── Agents Dashboard lifecycle ──
   const agentsMain = document.getElementById('mainAgents');
   if (nextPanel === 'agents') {
     if (chatMain) chatMain.style.display = 'none';
     if (agentsMain) agentsMain.style.display = '';
     document.body.classList.add('showing-agents');
   } else if (prevPanel === 'agents') {
     if (agentsMain) agentsMain.style.display = 'none';
     if (chatMain) chatMain.style.display = '';
     document.body.classList.remove('showing-agents');
   }
   ```

3. Add lazy-load call:
   ```javascript
   if (nextPanel === 'agents') loadAgentsDashboard();
   ```

### Step 6: Frontend — agents.js: Dashboard Logic

**File:** `static/agents.js`

Add new functions (~300 lines new code):

1. `loadAgentsDashboard()` — main entry point
   - Fetch `/api/agents/list` + `/api/agents/stats` + `/api/agents/activities`
   - Render status bar, grid, feed

2. `renderDashboardStatusBar(agents, stats)` — Top status section
   - For each agent: colored dot + name
   - Most recent activity across all agents

3. `renderDashboardGrid(agents, stats)` — Card grid
   - Each card shows: emoji, name, status dot, message count, session count, last activity
   - Action buttons: [💬 Chat] [⚡ Workspace] [⚙️ Edit]
   - Click card → expand to chat, or open chat in overlay

4. `renderDashboardFeed(activities)` — Activity timeline
   - Chronological list (newest first)
   - Each entry: timestamp, agent emoji, activity text, status icon
   - Auto-refresh via polling (every 15s)

5. `agentChatOverlay(slug)` — Modal/overlay for agent chat
   - Slides up from bottom or opens inline
   - Contains chat pane + composer
   - Close button returns to dashboard

6. Update `closeAgentChat()` to return to dashboard view

### Step 7: CSS — style.css #mainAgents Visibility Rules

**File:** `static/style.css`

Add to the main-view switching block (~line 3340-3370):
```css
main.main > #mainAgents{display:none;}
main.main:not(.showing-...) > #mainAgents{/* no effect */}
main.main.showing-agents > #mainAgents{display:flex;}
```

Also add `body.showing-agents` rules for rightpanel:
```css
body.showing-agents .rightpanel{display:none !important;}
body.showing-agents .split-resize-handle{display:none !important;}
```

### Step 8: Add `#mainAgents` to titlebar

**File:** `static/panels.js` — add `agents: 'tab_agents'` to `APP_TITLEBAR_KEYS`

---

## Files Changed / Created

| File | Action | Description |
|------|--------|-------------|
| `api/agents.py` | **Edit** | Add `agent_activity` table, `log_activity()`, `list_activities()`, `get_agent_stats()`, integrate logging into chat/workspace |
| `api/routes.py` | **Edit** | Add `GET /api/agents/activities`, `GET /api/agents/stats` |
| `static/index.html` | **Edit** | Add `#mainAgents` HTML structure |
| `static/style.css` | **Edit** | Add `#mainAgents` visibility rules, `body.showing-agents` rightpanel hide |
| `static/agents-dashboard.css` | **Create** | Dashboard-specific styles (~400 lines) |
| `static/agents.js` | **Edit** | Add dashboard render functions, chat overlay, auto-refresh |
| `static/panels.js` | **Edit** | Add `'agents'` to `showing-`, lifecycle, lazy-load |

---

## Risks & Tradeoffs

- **Activity log storage**: New DB table. Over time it grows — add cleanup strategy (keep last 7 days, or max 500 entries)
- **Chat overlay vs inline**: Overlay is simpler but modal-like. Inline is smoother UX. Decision: start with overlay, upgrade to inline if needed
- **Polling**: 15s poll for activity feed. Could switch to SSE in v2 for real-time updates
- **Backward compatibility**: Existing agents continue working. Old chat sessions remain accessible. The grid view is replaced but all data is preserved

---

## Verification

1. Open Agents tab → dashboard loads with status bar + grid + feed
2. Rightpanel is hidden when Agents tab is active
3. Agent card shows correct stats (message_count, last activity)
4. Click [💬 Chat] → opens chat overlay → send message → activity appears in feed
5. Activity feed auto-refreshes
6. Switch to another tab → rightpanel reappears
7. Switch back to Agents → dashboard restores state

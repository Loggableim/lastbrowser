# Hermes Browser Environment — Feature Plan

## Goal
A Multi-Client Browser Environment integrated into Hermes WebUI, inspired by Sidekick and Wavebox.io.  
Each Hermes Agent gets its own isolated browser session (separate cookies, storage, user-agent).  
Agents can browse, automate, screenshot, and interact with web pages — acting as independent "clients" that can also communicate with each other.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Hermes WebUI (8787)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Agent A  │  │  Agent B  │  │  Agent C         │   │
│  │  Browser  │  │  Browser  │  │  Browser         │   │
│  │  Session  │  │  Session  │  │  Session         │   │
│  │  (isol.)  │  │  (isol.)  │  │  (isol.)         │   │
│  └────┬─────┘  └────┬─────┘  └──────┬───────────┘   │
│       │              │               │               │
│       └──────────────┴───────────────┘               │
│                        │                              │
│              ┌─────────▼──────────┐                   │
│              │  Browser Bridge    │                   │
│              │  (port 8791)       │                   │
│              │  Playwright +      │                   │
│              │  Camoufox          │                   │
│              └─────────┬──────────┘                   │
│                        │                              │
└────────────────────────┼──────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │  Headless/Headed    │
              │  Browser Instances  │
              │  (Chromium/Firefox) │
              └─────────────────────┘
```

## Components

### 1. Browser Bridge API Server (port 8791)
Standalone Python server (like freelancer_api_server.py) that manages Playwright browser contexts.

**Endpoints:**
```
GET  /health                  → Server status
POST /session/create          → Create new browser context (agent_id, user_agent, viewport)
POST /session/{id}/navigate   → Navigate to URL
POST /session/{id}/click      → Click element (selector or x,y)
POST /session/{id}/fill       → Fill input field
POST /session/{id}/screenshot → Take screenshot (returns base64 or path)
POST /session/{id}/evaluate   → Run JavaScript in page context
POST /session/{id}/cookies    → Get/set cookies
POST /session/{id}/close      → Close browser context
POST /session/list            → List all active sessions
POST /agent/{id}/message      → Send message between agents (inter-agent comm)
```

### 2. Frontend Panel: "Browser" in WebUI
New main-view panel (`#mainBrowser`) with:

- **Tab bar** at top: each open URL/page gets a tab
- **Address bar**: URL input + navigation buttons (back, forward, refresh, go)
- **Page viewport**: Live screenshot/stream of the page (polled or via SSE)
- **Agent selector**: Which agent's browser session to view
- **DevTools panel**: Console output, network requests, element inspector
- **Multi-view**: Split screen (2 agents side by side)

### 3. Agent Browser Sessions
Each agent gets an isolated `browserContext` (Playwright):
- Separate cookies, localStorage, IndexedDB
- Configurable user-agent (simulate mobile/desktop)
- Configurable viewport size
- Session persists until agent closes it

### 4. Inter-Agent Communication
Agents can message each other via the Browser Bridge:
```
Agent A → POST /agent/{B}/message → Agent B receives notification in chat
Agent B → POST /agent/{A}/message → Agent A receives response
```
Messages appear as system messages in each agent's chat panel.

## Implementation Phases

### Phase 1: Foundation
- Browser Bridge API server (port 8791)
- Playwright integration (headless Chromium)
- Single session create/navigate/screenshot
- Basic WebUI panel with URL bar + screenshot view

### Phase 2: Multi-Session
- Multiple browser contexts (one per agent)
- Session management (list, close, switch)
- Agent selector in Browser panel
- Tab management (multiple pages per session)

### Phase 3: Interaction
- Click, fill, evaluate endpoints
- Interactive element overlay (clickable regions)
- Form auto-fill from agent prompts
- Cookie/storage inspection

### Phase 4: Multi-Client Simulation
- Per-agent user-agent rotation
- Per-agent proxy support
- Multiple simultaneous browser sessions
- Side-by-side agent view (split screen)

### Phase 5: Inter-Agent Communication
- Agent-to-agent messaging API
- Agent chat receives external messages
- Collaboration workflows (Agent A asks Agent B for data)
- Shared clipboard / data exchange

## File Structure
```
hermes-webui/
├── browser_bridge_server.py    # API server for Playwright
├── browser_context_manager.py  # Manages per-agent browser contexts
├── agent_messaging.py          # Inter-agent communication
├── static/
│   ├── browser.js              # Frontend panel JS
│   ├── browser.css             # Browser panel styles
│   └── index.html              # Panel HTML (injected)
└── references/
    └── browser-environment.md  # This plan
```

## Tech Stack
- **Backend**: Python + Playwright (like Camoufox integration)
- **Browser engine**: Chromium (via Playwright) with optional Firefox
- **Frontend**: Vanilla JS (no framework) like existing panels
- **Screenshots**: PNG via Playwright, base64 or file path
- **Streaming**: SSE for live page updates (optional, Phase 3+)

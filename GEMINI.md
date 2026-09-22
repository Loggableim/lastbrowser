# Lastbrowser Architecture Guidelines & Agent Rules

> **MANDATORY INSTRUCTIONS FOR ALL AI AGENTS & CONTRIBUTORS**  
> This file is loaded by Antigravity, Codex, Claude Code, Cursor, and all automated coding assistants. Adherence to these architectural rules is mandatory.

---

## 1. Monorepo Architecture (The Way to Go)

Lastbrowser is structured as an **integrated, fully self-contained Monorepo**. All source code for both the frontend browser shell and the local Python backend engine resides directly within this repository.

### Directory Structure
```
c:/projekte/lastbrowser/
├── apps/
│   └── desktop/                 # Electron desktop shell
│       ├── src/main/            # Main process (window, tabs, CDP, services, IPC)
│       ├── src/renderer/        # React 19 + Vite UI (sidebar, copilot, tabs, views)
│       └── tests/               # Vitest suite (514+ unit & integration tests)
├── services/
│   ├── sidekick/                # NATIVE IN-TREE PYTHON ENGINE & CLI
│   │   ├── cli/                 # Web server (FastAPI uvicorn), Gateway, TUI, CLI commands
│   │   ├── web/api/             # REST/SSE routes, OAuth, Onboarding, Models, Workspace
│   │   ├── runtime/             # Agent runtime, prompt builder, providers, model resolution
│   │   ├── skills/              # Built-in agent skills catalog
│   │   └── tests/               # Backend Python tests
│   └── sidekick-source.json     # Integration manifest
├── assets/
│   └── store/                   # Microsoft Store submission assets (icons & 1920x1080 screens)
├── brand/                       # Vector brand assets, icons, and logos
├── docs/                        # Architecture documentation, Store listing guide, Release plan
├── lastbrowser.com/             # Public landing page, GDPR/Store privacy policy, support portal
└── scripts/                     # Build tools, preflight verifiers, asset generators
```

---

## 2. Cardinal Rules for the Sidekick Backend Engine

1. **In-Tree Source of Truth:**
   - `services/sidekick/` is the **permanent, tracked source of truth** for the Sidekick backend.
   - It is committed directly to Git. **NEVER** re-add `services/sidekick/` or `services/sidekick-source.json` to `.gitignore`.

2. **NO External Cloning or Syncing:**
   - **DO NOT** attempt to clone, fetch, or sync from `Loggableim/sidekick-agent` or any external repository at build time, test time, or runtime.
   - The packaging pipeline (`npm run package:win`) bundles `services/sidekick/` directly. Builds must remain 100% offline-capable, deterministic, and free from external network dependencies.

3. **NO Monkey-Patching / Regex Replacement Scripts:**
   - **DO NOT** write or maintain find-and-replace patch scripts (such as legacy `sidekick-patches.mjs`).
   - If a backend behavior needs fixing or extending (e.g. OAuth flows, timeouts, new routes, model handling), **edit the Python files directly in `services/sidekick/`**.

4. **`services/webui` is Permanently Deleted:**
   - The old, fragmented `services/webui/` folder was a legacy fork and has been completely removed.
   - **DO NOT** re-create, reference, or import from `services/webui`. All web API routes are served by FastAPI in `services/sidekick/cli/web_server.py` and `services/sidekick/web/api/`.

5. **Atomic Commits:**
   - Features requiring both frontend changes (React/Electron IPC) and backend changes (FastAPI endpoints / Python runtime) **MUST** be implemented and committed together in a single atomic commit in this repository.

---

## 3. Development, Verification & Quality Standards

Before committing or pushing any changes, all agents must verify the following pipeline:

| Step | Command | Acceptance Criteria |
| :--- | :--- | :--- |
| **Unit & Integration Tests** | `npm test` | All 64+ test suites pass (514+ tests green) |
| **Store Release Preflight** | `npm run verify:store` | All 27 automated checks pass (`[PASS]`), 0 failures |
| **Desktop Shell Build** | `npm --workspace apps/desktop run build` | 0 TypeScript errors, 0 Vite errors |
| **Python Syntax Check** | `python -m compileall -q services/sidekick` | Exits with code 0, 0 warnings |

---

## 4. Security, Secrets & Hygiene

- **No Secret-Shaped Literals:** Never commit API keys, bot tokens, or test fixtures resembling Telegram/OpenAI tokens (enforced by `tests/secret-fixtures.test.ts`). Use dynamic string concatenation for mock fixtures if necessary.
- **No SQLite or Database Files:** `.db`, `.db-shm`, `.db-wal`, `auth.json`, and `config.yaml` must never be checked into Git.
- **Zero Involuntary Telemetry (Local-First):** All browsing data, tab history, and credentials reside in `%APPDATA%\Lastbrowser`. Never transmit user data without explicit user action.

---

## 5. Multi-Agent Work Isolation Boundaries

When two or more autonomous agents work simultaneously:
- **Stream A (Desktop UI & Renderer):** Owns `apps/desktop/src/renderer/`.
- **Stream B (Engine, Backend, Web, Release):** Owns `services/sidekick/`, `apps/desktop/src/main/`, `lastbrowser.com/`, `assets/store/`, `docs/`, `scripts/`.
- Agents must never cross boundary lines into another active agent's workspace without coordination.

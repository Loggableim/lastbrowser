"""Hermes Agents Plugin — Multi-Agent-System für Hermes Agent CLI.

Ermöglicht das Umschalten zwischen verschiedenen Agent-Persönlichkeiten
direkt im Hermes Agent CLI. Teilt sich die Agenten-Datenbank mit dem
WebUI Agents-Tab (cids-hermes-webui).

Features:
  - Profile Mapping: Jeder Agent hat ein verknüpftes Hermes-Profil
  - Workdir Enforcement: Arbeitet im Agenten-Arbeitsverzeichnis
  - Tool Enforcement: Nur erlaubte Toolsets sind verfügbar
  - Kanban Integration: Projektmanager kann Kanban orchestrieren
  - Shared Memory: Bidirektional zwischen CLI und WebUI
"""

import json
import os
import shutil
import sqlite3
import uuid
import urllib.request
from contextlib import closing
from pathlib import Path
from datetime import datetime

# ── Pfade ────────────────────────────────────────────────────────────────
HERMES_HOME = Path(os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes")))
AGENTS_DB = HERMES_HOME / "webui" / "agents.db"
AGENTS_DATA_DIR = HERMES_HOME / "webui" / "agents"
SOUL_MASTER = HERMES_HOME / "SOUL.md"
PROFILES_ROOT = Path.home() / ".hermes" / "profiles"

# ── Aktiven Agent merken ─────────────────────────────────────────────────
_ACTIVE_AGENT_SLUG = None  # None = default Hermes Agent

# ── Template-Metadaten für Profile ──────────────────────────────────────
TEMPLATE_PROFILES = {
    "friend": {
        "model": "deepseek-v4-flash",
        "provider": "opencode-go",
        "base_url": "https://opencode.ai/zen/go/v1",
        "personality_key": "helpful",
    },
    "project-manager": {
        "model": "deepseek-v4-flash",
        "provider": "opencode-go",
        "base_url": "https://opencode.ai/zen/go/v1",
        "personality_key": "helpful",
    },
    "social-media": {
        "model": "deepseek-v4-flash",
        "provider": "opencode-go",
        "base_url": "https://opencode.ai/zen/go/v1",
        "personality_key": "helpful",
    },
    "developer": {
        "model": "deepseek-v4-flash",
        "provider": "opencode-go",
        "base_url": "https://opencode.ai/zen/go/v1",
        "personality_key": "technical",
    },
    "knowledge-base": {
        "model": "deepseek-v4-flash",
        "provider": "opencode-go",
        "base_url": "https://opencode.ai/zen/go/v1",
        "personality_key": "helpful",
    },
}


# ── DB-Helfer ────────────────────────────────────────────────────────────

def _get_conn():
    """Öffne (oder lege an) die WebUI Agents-DB mit aktuellem Schema."""
    path = str(AGENTS_DB)
    exists = os.path.exists(path)

    conn = sqlite3.connect(path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=3000")

    if not exists:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS agents (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                slug        TEXT UNIQUE NOT NULL,
                agent_type  TEXT,
                avatar_emoji TEXT DEFAULT '🤖',
                description TEXT DEFAULT '',
                personality TEXT DEFAULT '',
                color       TEXT DEFAULT '#6366F1',
                workdir     TEXT DEFAULT '',
                tools       TEXT DEFAULT '[]',
                profile     TEXT DEFAULT '',
                memory_mode TEXT DEFAULT 'local',
                status      TEXT DEFAULT 'active',
                is_template INTEGER DEFAULT 0,
                message_count INTEGER DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS agent_memory (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                key         TEXT NOT NULL,
                value       TEXT NOT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(agent_id, key)
            );

            CREATE TABLE IF NOT EXISTS agent_sessions (
                id              TEXT PRIMARY KEY,
                agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                title           TEXT DEFAULT '',
                message_count   INTEGER DEFAULT 0,
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                last_message_at TEXT
            );

            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)
        conn.commit()
    else:
        # Migration: profile column hinzufügen falls nicht vorhanden
        try:
            conn.execute("ALTER TABLE agents ADD COLUMN profile TEXT DEFAULT ''")
        except sqlite3.OperationalError:
            pass  # Column existiert bereits

    return conn


def _list_agents(include_templates=False):
    """Liste Agenten aus der shared DB."""
    conn = _get_conn()
    with closing(conn):
        if include_templates:
            rows = conn.execute(
                "SELECT * FROM agents ORDER BY is_template DESC, name ASC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM agents WHERE is_template=0 ORDER BY name ASC"
            ).fetchall()
        return [dict(r) for r in rows]


def _get_agent(slug):
    """Hole einen Agenten aus der shared DB."""
    conn = _get_conn()
    with closing(conn):
        row = conn.execute(
            "SELECT * FROM agents WHERE slug=?", (slug,)
        ).fetchone()
        return dict(row) if row else None


def _read_soul(slug):
    """Lese die SOUL.md eines Agenten."""
    soul_path = AGENTS_DATA_DIR / slug / "SOUL.md"
    if soul_path.exists():
        return soul_path.read_text(encoding="utf-8")
    return None


def _get_memory(slug):
    """Hole alle Erinnerungen eines Agenten als formatierten Text."""
    conn = _get_conn()
    with closing(conn):
        agent = conn.execute(
            "SELECT id FROM agents WHERE slug=?", (slug,)
        ).fetchone()
        if agent is None:
            return ""
        rows = conn.execute(
            "SELECT key, value FROM agent_memory WHERE agent_id=? ORDER BY created_at DESC",
            (agent["id"],),
        ).fetchall()
        if not rows:
            return ""
        items = [f"- {r['key']}: {r['value']}" for r in rows]
        return "Agent Memory:\n" + "\n".join(items)


# ── Profil-Management ────────────────────────────────────────────────────

def _ensure_profile(slug, force_create=False):
    """Stelle sicher, dass ein Hermes-Profil für den Agenten existiert.

    Erzeugt ~/.hermes/profiles/<slug>/ mit eigener config.yaml, wenn nicht vorhanden.
    """
    profile_dir = PROFILES_ROOT / slug
    config_path = profile_dir / "config.yaml"

    # Prüfe ob Profil existiert
    if config_path.exists() and not force_create:
        return {"status": "exists", "path": str(profile_dir)}

    # Profil anlegen
    agent = _get_agent(slug)
    if not agent:
        return {"error": f"Agent '{slug}' not found"}

    profile_dir.mkdir(parents=True, exist_ok=True)
    ag_type = agent.get("agent_type") or "custom"
    tmpl_cfg = TEMPLATE_PROFILES.get(ag_type, TEMPLATE_PROFILES.get("friend"))

    # Tools in disabled_toolsets umwandeln
    allowed_tools = json.loads(agent.get("tools", "[]")) if isinstance(agent.get("tools"), str) else agent.get("tools", [])
    all_toolsets = [
        "hermes-cli", "web", "terminal", "file", "delegation",
        "kanban", "browser", "search", "memory", "vision",
        "evey_identity", "evey_learner", "evey_goals", "evey_habits",
    ]
    disabled = [t for t in all_toolsets if t not in allowed_tools and t != "hermes-cli"]

    cfg = f"""# Hermione Agent Profil — automatisch erstellt für Agent '{slug}'
# Erzeugt am {datetime.now().strftime('%Y-%m-%d %H:%M')}

model:
  default: {tmpl_cfg['model']}
  provider: {tmpl_cfg['provider']}
  base_url: {tmpl_cfg['base_url']}
  api_mode: chat_completions

providers:
  openrouter:
    base_url: https://openrouter.ai/api/v1
    api_key_env: OPENROUTER_API_KEY

toolsets:
  - hermes-cli

agent:
  max_turns: 166
  service_tier: ''
  tool_use_enforcement: auto
  disabled_toolsets: {json.dumps(disabled)}
  reasoning_effort: low
  image_input_mode: auto
  personalities:
    helpful: You are a helpful, friendly AI assistant.
    technical: You are a technical expert. Provide detailed, accurate technical information.

display:
  compact: false
  personality: {tmpl_cfg.get('personality_key', 'helpful')}
  streaming: true
  skin: default
  language: en
"""
    config_path.write_text(cfg, encoding="utf-8")

    # SOUL.md ins Profil kopieren
    agent_soul = _read_soul(slug)
    if agent_soul:
        (profile_dir / "SOUL.md").write_text(agent_soul, encoding="utf-8")

    # Speichere den Profil-Namen in der DB
    conn = _get_conn()
    with closing(conn):
        conn.execute("UPDATE agents SET profile=? WHERE slug=?", (slug, slug))
        conn.commit()

    return {"status": "created", "path": str(profile_dir), "profile": slug, "disabled_toolsets": disabled}


def _profile_switch_command(slug):
    """Erzeuge den Befehl, um in das Profil zu wechseln.

    Gibt das Kommando zurück, das der User ausführen kann, um
    dauerhaft in das Agent-Profil zu wechseln.
    """
    return f"hermes -p {slug}"


# ── Tools ────────────────────────────────────────────────────────────────

TOOL_AGENT_LIST = {
    "name": "agent_list",
    "description": (
        "List all available agents from the Multi-Agent system. "
        "Shows name, emoji, status, message count, tools, profile mapping, and description. "
        "Use this to see which agents you can switch to."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
    },
}


TOOL_AGENT_SWITCH = {
    "name": "agent_switch",
    "description": (
        "Switch to a different agent persona. "
        "This changes your personality, memory context, available tools, and workdir. "
        "The agent's SOUL.md is loaded as your system prompt. "
        "A matching Hermes profile (~/.hermes/profiles/<slug>/) is created with its "
        "own config.yaml, disabled_toolsets for tool enforcement, and workdir. "
        "Call agent_list first to see available slugs."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "slug": {
                "type": "string",
                "description": "The agent slug (e.g. 'friend', 'project-manager', 'developer'). "
                               "Use agent_list to see all available slugs.",
            },
        },
        "required": ["slug"],
    },
}


TOOL_AGENT_STATUS = {
    "name": "agent_status",
    "description": (
        "Show which agent persona is currently active. "
        "Returns the current agent's name, slug, personality, tools, workdir, "
        "profile mapping, and a summary of their stored memory. "
        "Use this to remind yourself who you are."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
    },
}


TOOL_AGENT_CREATE = {
    "name": "agent_create",
    "description": (
        "Create a new agent in the Multi-Agent system. "
        "You can base it on a template or define a custom personality. "
        "The agent gets its own SOUL.md, memory database, tool allowlist, "
        "workdir, and an optional Hermes profile for task execution. "
        "Also creates a Hermes profile at ~/.hermes/profiles/<slug>/."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Human-readable name for the agent (e.g. 'My Assistant').",
            },
            "template_slug": {
                "type": "string",
                "description": "Optional: base this agent on a template slug "
                               "(friend, project-manager, social-media, developer, knowledge-base).",
            },
            "personality": {
                "type": "string",
                "description": "Optional: custom personality description in 3-5 sentences. "
                               "Overrides the template personality if provided.",
            },
            "avatar_emoji": {
                "type": "string",
                "description": "Optional: emoji for the agent's avatar (default: 🤖).",
            },
            "color": {
                "type": "string",
                "description": "Optional: hex color for the agent card (default: #6366F1).",
            },
            "tools": {
                "type": "array",
                "description": "Optional: list of allowed tool names (e.g. ['web', 'terminal', 'file']). "
                               "These become the agent's restricted toolset.",
                "items": {"type": "string"},
            },
            "workdir": {
                "type": "string",
                "description": "Optional: working directory path for the agent.",
            },
            "create_profile": {
                "type": "boolean",
                "description": "Optional: also create a Hermes profile for this agent (default: true).",
            },
        },
    },
}


TOOL_AGENT_MEMORY_ADD = {
    "name": "agent_memory_add",
    "description": (
        "Store a memory for the current agent. The agent can recall this "
        "information in future conversations. Use this to remember facts, "
        "preferences, or context about the user or the task."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "key": {
                "type": "string",
                "description": "A short label/category for the memory (e.g. 'hobby', 'project', 'preference').",
            },
            "value": {
                "type": "string",
                "description": "The memory content to store. Be specific and self-contained.",
            },
        },
        "required": ["key", "value"],
    },
}


TOOL_AGENT_MEMORY_GET = {
    "name": "agent_memory_get",
    "description": (
        "Retrieve all stored memories for the current agent. "
        "Shows key-value pairs with timestamps. Use this to recall "
        "saved information about the user or context."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
    },
}


TOOL_AGENT_KANBAN_CREATE = {
    "name": "agent_kanban_create",
    "description": (
        "Create a Kanban task and dispatch it to an agent profile. "
        "The task is created in the Kanban board and assigned to the "
        "matching Hermes profile for execution. Use this for multi-step "
        "or multi-agent workflows. The Kanban dispatcher will pick up the task "
        "and spawn a worker with the right persona."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Short title describing what needs to be done.",
            },
            "body": {
                "type": "string",
                "description": "Detailed description of the task with requirements, context, and acceptance criteria.",
            },
            "assignee_slug": {
                "type": "string",
                "description": "The agent slug to assign this task to (e.g. 'developer', 'project-manager'). "
                               "The task will be dispatched to that agent's Hermes profile.",
            },
            "priority": {
                "type": "string",
                "enum": ["low", "normal", "high", "critical"],
                "description": "Task priority (default: normal).",
            },
        },
        "required": ["title", "body"],
    },
}


TOOL_AGENT_PROFILE_LIST = {
    "name": "agent_profile_list",
    "description": (
        "List all Hermes profiles linked to agents. "
        "Shows which agents have profiles, their status, "
        "disabled toolsets for tool enforcement, and workdir."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
    },
}


# ── Handler ──────────────────────────────────────────────────────────────

def _build_agent_context(slug):
    """Baue den System-Prompt-Context für einen Agenten."""
    agent = _get_agent(slug)
    if not agent:
        return None

    soul = _read_soul(slug)
    memory = _get_memory(slug)
    tools = json.loads(agent.get("tools", "[]")) if isinstance(agent.get("tools"), str) else agent.get("tools", [])
    workdir = agent.get("workdir", "") or ""
    profile = agent.get("profile", "") or ""

    context_parts = []
    if soul:
        context_parts.append(soul)

    ctx_lines = [
        f"## Current Identity",
        f"Du bist **{agent['name']}** ({agent.get('avatar_emoji', '🤖')}).",
        f"{agent.get('description', '')}",
        f"{agent.get('personality', '')}",
    ]
    if workdir:
        ctx_lines.append(f"\n## Arbeitsverzeichnis\nDein Arbeitsverzeichnis ist: `{workdir}`\nAlle Dateioperationen sollten sich auf dieses Verzeichnis beziehen.")
    if profile:
        ctx_lines.append(f"\n## Hermes Profil\nDein Hermes-Profil ist `{profile}`. Für Kanban-Aufrufe verwende `hermes -p {profile}`.")
    context_parts.append("\n".join(ctx_lines))

    if tools:
        context_parts.append(f"## Available Tools\n"
                             f"Du hast Zugriff auf diese Tools: {', '.join(tools)}\n"
                             f"Andere Tools sind für dich nicht verfügbar. Nutze nur die aufgeführten Tools.")

    if memory:
        context_parts.append(memory)

    # Additional instructions based on agent type
    ag_type = agent.get("agent_type", "")
    if ag_type == "project-manager" or "kanban" in tools:
        context_parts.append(
            "## Kanban\n"
            "Du kannst Kanban-Tasks erstellen mit agent_kanban_create. "
            "Zerlege große Ziele in kleine, bearbeitbare Tasks und weise sie "
            "den richtigen Agenten zu (developer, social-media, etc.). "
            "Jeder Task bekommt einen assignee_slug, der dem Agent-Profil entspricht."
        )

    return {
        "agent": agent,
        "soul": soul,
        "memory": memory,
        "tools": tools,
        "workdir": workdir,
        "profile": profile,
        "context_text": "\n\n---\n\n".join(context_parts),
    }


def _set_active_agent(slug):
    """Setze den aktiven Agenten: SOUL laden, Profil anlegen, Memory einblenden."""
    global _ACTIVE_AGENT_SLUG

    ctx = _build_agent_context(slug)
    if not ctx:
        return {"error": f"Agent '{slug}' not found"}

    _ACTIVE_AGENT_SLUG = slug

    # 1. SOUL.md als Master schreiben
    if ctx["soul"]:
        SOUL_MASTER.parent.mkdir(parents=True, exist_ok=True)
        SOUL_MASTER.write_text(
            f"# {ctx['agent']['name']} — Active Agent\n\n"
            f"{ctx['soul']}\n\n"
            f"---\n\n"
            f"*Activated: {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n"
            f"*Agent: {slug}*\n"
        )

    # 2. Hermes-Profil anlegen (wenn nicht vorhanden)
    profile_result = _ensure_profile(slug)

    # 3. Workdir setzen (als ENV-Variable)
    if ctx["workdir"]:
        os.environ["AGENT_WORKDIR"] = ctx["workdir"]

    # 4. WebUI benachrichtigen
    _sync_webui_current_agent(slug)

    response = {
        "status": "switched",
        "agent_name": ctx["agent"]["name"],
        "slug": slug,
        "avatar": ctx["agent"].get("avatar_emoji", "🤖"),
        "description": ctx["agent"].get("description", ""),
        "tools": ctx["tools"],
        "workdir": ctx["workdir"],
        "profile": profile_result.get("profile", ""),
        "profile_path": profile_result.get("path", ""),
    }

    # Profil-Switch-Kommando hinzufügen
    if profile_result.get("status") in ("exists", "created"):
        response["profile_command"] = f"hermes -p {slug}"

    return response


def _sync_webui_current_agent(slug):
    """Benachrichtige die WebUI über den aktiven Agenten."""
    try:
        data = json.dumps({"slug": slug}).encode()
        req = urllib.request.Request(
            "http://127.0.0.1:8787/api/agents/current",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass


def _store_memory(slug, key, value):
    """Speichere eine Erinnerung für den aktiven Agenten."""
    conn = _get_conn()
    with closing(conn):
        row = conn.execute(
            "SELECT id FROM agents WHERE slug=?", (slug,)
        ).fetchone()
        if row is None:
            return {"error": f"Agent '{slug}' not found"}
        conn.execute(
            """INSERT INTO agent_memory (agent_id, key, value) VALUES (?, ?, ?)
               ON CONFLICT(agent_id, key) DO UPDATE SET value=excluded.value""",
            (row["id"], key, value),
        )
        conn.commit()
    return {"status": "stored", "key": key, "value": value}


def _read_memory(slug):
    """Lese alle Erinnerungen eines Agenten."""
    conn = _get_conn()
    with closing(conn):
        row = conn.execute(
            "SELECT id FROM agents WHERE slug=?", (slug,)
        ).fetchone()
        if row is None:
            return {"error": f"Agent '{slug}' not found", "memories": []}
        rows = conn.execute(
            "SELECT key, value, created_at FROM agent_memory "
            "WHERE agent_id=? ORDER BY created_at DESC",
            (row["id"],),
        ).fetchall()
        return {"memories": [dict(r) for r in rows]}


# ── Template-Daten ──────────────────────────────────────────────────────

AGENT_TEMPLATES_DATA = {
    "friend": {
        "personality": (
            "Du bist ein warmherziger, empathischer Freund. Du erinnerst dich an alles, "
            "was der User dir erzählt hat — seine Hobbys, Sorgen, Erfolge, Beziehungen. "
            "Du fragst nach, zeigst echte Anteilnahme und freust dich aufrichtig."
        ),
        "avatar_emoji": "\U0001f60a",
        "color": "#FF6B6B",
        "tools": [],
    },
    "project-manager": {
        "personality": (
            "Du bist ein erfahrener, strukturierter Projektmanager. Du hilfst dem User, "
            "große Ziele in machbare Tasks zu zerlegen, Meilensteine zu setzen und den "
            "Fortschritt zu tracken. Du nutzt Kanban, erstellst Tasks, weist Prioritäten zu."
        ),
        "avatar_emoji": "\U0001f4cb",
        "color": "#4ECDC4",
        "tools": ["kanban", "todo", "delegation"],
    },
    "social-media": {
        "personality": (
            "Du bist ein kreativer Social-Media-Manager. Du kennst alle Plattformen, "
            "Trends und Best Practices. Du erstellst Content-Pläne, schreibst Posts, "
            "optimierst Hashtags und analysierst Engagement."
        ),
        "avatar_emoji": "\U0001f4f1",
        "color": "#A855F7",
        "tools": ["web", "search"],
    },
    "developer": {
        "personality": (
            "Du bist ein erfahrener Softwareentwickler. Du hilfst beim Schreiben von Code, "
            "Debuggen, Code-Review, Architektur-Design und Refactoring. Du denkst in Patterns "
            "und Best Practices, bist pragmatisch aber gründlich."
        ),
        "avatar_emoji": "\U0001f4bb",
        "color": "#3B82F6",
        "tools": ["terminal", "file", "web", "delegation", "kanban"],
    },
    "knowledge-base": {
        "personality": (
            "Du bist eine hochorganisierte Wissensdatenbank mit einer freundlichen "
            "Persönlichkeit. Du speicherst Fakten, Ideen, Recherchen, Zitate und "
            "Zusammenfassungen. Du verknüpfst Informationen miteinander."
        ),
        "avatar_emoji": "\U0001f4da",
        "color": "#F59E0B",
        "tools": ["web", "search"],
    },
}


# ── Tool Handler Functions ──────────────────────────────────────────────

def handler_agent_list(args):
    agents = _list_agents(include_templates=False)

    result = {
        "agents": [
            {
                "name": a["name"],
                "slug": a["slug"],
                "avatar_emoji": a.get("avatar_emoji", "\U0001f916"),
                "color": a.get("color", "#6366F1"),
                "description": a.get("description", ""),
                "status": a.get("status", "active"),
                "message_count": a.get("message_count", 0),
                "tools": json.loads(a.get("tools", "[]")) if isinstance(a.get("tools"), str) else a.get("tools", []),
                "workdir": a.get("workdir", ""),
                "profile": a.get("profile", ""),
            }
            for a in agents
        ],
        "active_slug": _ACTIVE_AGENT_SLUG,
    }
    return json.dumps(result)


def handler_agent_switch(args):
    slug = args.get("slug", "").strip()
    if not slug:
        return json.dumps({"error": "Missing required field: slug"})

    result = _set_active_agent(slug)
    return json.dumps(result)


def handler_agent_status(args):
    if not _ACTIVE_AGENT_SLUG:
        return json.dumps({
            "active": False,
            "message": "No custom agent active. You are the default Hermes Agent.",
        })

    ctx = _build_agent_context(_ACTIVE_AGENT_SLUG)
    if not ctx:
        return json.dumps({"active": False, "error": f"Agent '{_ACTIVE_AGENT_SLUG}' not found"})

    mem = _read_memory(_ACTIVE_AGENT_SLUG)

    # Prüfe ob Profil existiert
    profile_path = PROFILES_ROOT / _ACTIVE_AGENT_SLUG
    profile_exists = profile_path.exists() and (profile_path / "config.yaml").exists()

    return json.dumps({
        "active": True,
        "agent": {
            "name": ctx["agent"]["name"],
            "slug": _ACTIVE_AGENT_SLUG,
            "avatar_emoji": ctx["agent"].get("avatar_emoji", "\U0001f916"),
            "color": ctx["agent"].get("color", "#6366F1"),
            "description": ctx["agent"].get("description", ""),
            "tools": ctx["tools"],
            "workdir": ctx["workdir"],
            "profile": ctx["profile"],
            "profile_exists": profile_exists,
            "profile_command": f"hermes -p {_ACTIVE_AGENT_SLUG}" if profile_exists else None,
            "memory_count": len(mem.get("memories", [])),
        },
    })


def handler_agent_create(args):
    name = args.get("name", "").strip()
    if not name:
        return json.dumps({"error": "Missing required field: name"})

    # Slug generieren
    slug = name.lower().replace(" ", "-").replace("_", "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-")

    agent_id = str(uuid.uuid4())
    template_slug = args.get("template_slug")
    tmpl = AGENT_TEMPLATES_DATA.get(template_slug) if template_slug else None

    final_personality = args.get("personality") or (
        tmpl["personality"] if tmpl else f"Du bist {name}, ein persönlicher KI-Assistent."
    )
    final_emoji = args.get("avatar_emoji") or (tmpl["avatar_emoji"] if tmpl else "\U0001f916")
    final_color = args.get("color") or (tmpl["color"] if tmpl else "#6366F1")
    final_tools = json.dumps(args.get("tools") or (tmpl["tools"] if tmpl else []))
    workdir = args.get("workdir", "")
    description = f"{name} hilft bei verschiedenen Aufgaben."

    conn = _get_conn()
    with closing(conn):
        existing = conn.execute(
            "SELECT 1 FROM agents WHERE slug=?", (slug,)
        ).fetchone()
        if existing:
            slug = f"{slug}-{int(datetime.now().timestamp())}"

        conn.execute(
            """INSERT INTO agents (id, name, slug, agent_type, avatar_emoji,
               description, personality, color, workdir, tools, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')""",
            (agent_id, name, slug, template_slug or "custom",
             final_emoji, description, final_personality,
             final_color, workdir, final_tools),
        )
        conn.commit()

    # SOUL.md schreiben
    agent_dir = AGENTS_DATA_DIR / slug
    agent_dir.mkdir(parents=True, exist_ok=True)
    soul_content = f"""# SOUL.md — {name}

{final_personality}

---

## Wachstum

Diese SOUL entwickelt sich mit jeder Interaktion weiter. Der Agent lernt dazu,
sammelt Erfahrungen und verfeinert seine Persönlichkeit.

## Regeln

1. Sei konsistent in deiner Persönlichkeit
2. Merke dir wichtige Informationen über den User
3. Entwickle eine eigene Beziehung zum User
4. Nutze deine verfügbaren Tools/Skills wenn nötig
5. Reflektiere über vergangene Gespräche

---

*Letzte Aktualisierung: {datetime.now().strftime('%Y-%m-%d %H:%M')}*
"""
    (agent_dir / "SOUL.md").write_text(soul_content, encoding="utf-8")

    # Profil anlegen (optional, default: true)
    create_profile = args.get("create_profile", True)
    profile_result = {}
    if create_profile:
        profile_result = _ensure_profile(slug, force_create=True)

    result = {
        "status": "created",
        "slug": slug,
        "name": name,
        "avatar_emoji": final_emoji,
        "tools": json.loads(final_tools),
        "workdir": workdir,
    }
    if profile_result.get("status"):
        result["profile"] = profile_result.get("profile", slug)
        result["profile_path"] = profile_result.get("path", "")

    return json.dumps(result)


def handler_agent_memory_add(args):
    if not _ACTIVE_AGENT_SLUG:
        return json.dumps({"error": "No active agent. Use agent_switch first."})
    key = args.get("key", "").strip()
    value = args.get("value", "").strip()
    if not key or not value:
        return json.dumps({"error": "Missing required fields: key and value"})
    result = _store_memory(_ACTIVE_AGENT_SLUG, key, value)
    return json.dumps(result)


def handler_agent_memory_get(args):
    if not _ACTIVE_AGENT_SLUG:
        return json.dumps({"error": "No active agent. Use agent_switch first.", "memories": []})
    result = _read_memory(_ACTIVE_AGENT_SLUG)
    return json.dumps(result)


def handler_agent_kanban_create(args):
    """Erstelle einen Kanban-Task für einen Agenten."""
    title = args.get("title", "").strip()
    if not title:
        return json.dumps({"error": "Missing required field: title"})

    assignee_slug = args.get("assignee_slug", "").strip()
    body = args.get("body", "").strip()

    # Wenn assignee_slug gesetzt, in Hermes-Profil-Namen übersetzen
    profile_name = None
    if assignee_slug:
        agent = _get_agent(assignee_slug)
        if agent:
            profile_name = agent.get("profile") or assignee_slug
        else:
            profile_name = assignee_slug

    priority = args.get("priority", "normal")

    # Kanban-Task via hermes CLI erstellen
    import subprocess
    cmd = ["hermes", "kanban", "create", title]
    if body:
        cmd.extend(["--body", body])
    if profile_name:
        cmd.extend(["--assignee", profile_name, "--profile", profile_name])

    priority_map = {"low": 1, "normal": 2, "high": 3, "critical": 5}
    cmd.extend(["--priority", str(priority_map.get(priority, 2))])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return json.dumps({
                "status": "created",
                "title": title,
                "assignee": profile_name or "unassigned",
                "priority": priority,
                "output": result.stdout.strip(),
            })
        else:
            return json.dumps({
                "status": "error",
                "error": result.stderr.strip() or result.stdout.strip(),
            })
    except FileNotFoundError:
        return json.dumps({"error": "hermes CLI not found — is it installed and in PATH?"})
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "Kanban create timed out after 30s"})
    except Exception as e:
        return json.dumps({"error": str(e)})


def handler_agent_profile_list(args):
    """Liste alle Agent-Profile auf."""
    agents = _list_agents(include_templates=False)
    profiles = []

    for a in agents:
        slug = a["slug"]
        profile_path = PROFILES_ROOT / slug
        config_path = profile_path / "config.yaml"
        profile_exists = config_path.exists()

        tools = json.loads(a.get("tools", "[]")) if isinstance(a.get("tools"), str) else a.get("tools", [])
        workdir = a.get("workdir", "")

        info = {
            "slug": slug,
            "name": a["name"],
            "profile_exists": profile_exists,
            "profile_name": a.get("profile", ""),
            "tools": tools,
            "workdir": workdir,
        }

        if profile_exists:
            # Lese disabled_toolsets aus dem Profil
            try:
                import yaml
                cfg = yaml.safe_load(config_path.read_text(encoding="utf-8"))
                info["disabled_toolsets"] = cfg.get("agent", {}).get("disabled_toolsets", [])
                info["model"] = cfg.get("model", {}).get("default", "")
            except Exception:
                info["disabled_toolsets"] = []

        profiles.append(info)

    return json.dumps({
        "profiles": profiles,
        "profiles_root": str(PROFILES_ROOT),
        "active_slug": _ACTIVE_AGENT_SLUG,
    })


# ── Tool-Dispatch ────────────────────────────────────────────────────────

_HANDLERS = {
    "agent_list": handler_agent_list,
    "agent_switch": handler_agent_switch,
    "agent_status": handler_agent_status,
    "agent_create": handler_agent_create,
    "agent_memory_add": handler_agent_memory_add,
    "agent_memory_get": handler_agent_memory_get,
    "agent_kanban_create": handler_agent_kanban_create,
    "agent_profile_list": handler_agent_profile_list,
}

_SCHEMAS = {
    "agent_list": TOOL_AGENT_LIST,
    "agent_switch": TOOL_AGENT_SWITCH,
    "agent_status": TOOL_AGENT_STATUS,
    "agent_create": TOOL_AGENT_CREATE,
    "agent_memory_add": TOOL_AGENT_MEMORY_ADD,
    "agent_memory_get": TOOL_AGENT_MEMORY_GET,
    "agent_kanban_create": TOOL_AGENT_KANBAN_CREATE,
    "agent_profile_list": TOOL_AGENT_PROFILE_LIST,
}


def register(ctx):
    """Registriere alle Agent-Tools."""
    for name, schema in _SCHEMAS.items():
        ctx.register_tool(
            name=name,
            toolset="hermes_agents",
            schema=schema,
            handler=_HANDLERS[name],
        )

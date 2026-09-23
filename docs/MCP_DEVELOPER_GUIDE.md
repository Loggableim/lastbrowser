# Lastbrowser MCP Developer Guide

**Externe MCP-Server anbinden — Unified Extension & Skill Hub (Säule 2)**

Gültig ab **v0.1.31**. Dieses Dokument richtet sich an Entwickler, die eigene oder fremde
Model-Context-Protocol-Server (MCP) in Lastbrowser einbinden wollen — lokal als `stdio`-Prozess
oder remote als `sse`/`http`-Dienst.

---

## 1. Was ist der Unified Extension & Skill Hub?

Lastbrowser konsolidiert seit v0.1.31 alle Erweiterungspunkte in einem einzigen Hub
(`Ctrl+Shift+X` oder Sidebar → „Extensions & Skills“) mit **zwei Säulen**:

| Säule | Technologie | Zweck | Kann NICHT |
| :--- | :--- | :--- | :--- |
| 🌐 **Web-Erweiterungen** | Chrome Manifest V3 (CRX3-Engine) | DOM-/Netzwerk-Kontext: Adblocker, Passwort-Manager, Stylesheets, Userscripts | OS-Prozesse starten, Python/Node-Toolchains ausführen, ConPTY steuern |
| ⚡ **Nova AI Skills & MCP-Tools** | Model Context Protocol (Open Standard, Linux Foundation / Anthropic) | Autonome System- & Agentic-Workflows: Shell, Dateisystem, lokale LLM-Runtimes, externe Dienste | (bewusst) in der Chromium-Extension-Sandbox laufen |

MCP ist der **offene Standard** für Säule 2. Jeder kompatible Server — inklusive solcher aus dem
Claude-Desktop- und Codex-Ökosystem — lässt sich ohne eigenen Plugin-Code anbinden.

---

## 2. Quick Start: Ersten MCP-Server hinzufügen

### Variante A: Über den Hub (UI)

1. `Ctrl+Shift+X` öffnen → Reiter **„⚡ Nova AI Skills & Tools (MCP)“**.
2. Button **`mcp_servers.json`** klicken — der JSON-Editor-Drawer öffnet sich
   (Format vollständig kompatibel zum Claude-Desktop-Ökosystem).
3. Server-Eintrag hinzufügen (siehe Abschnitt 3), auf **„Konfiguration anwenden“** klicken.
4. Der Server verbindet sich beim nächsten Agent-Start; seine Tools erscheinen
   automatisch in der Tool-Übersicht des Hubs.

### Variante B: Über die CLI

```bash
# Remote-Server (HTTP/SSE):
sidekick mcp add ink --url "https://mcp.ml.ink/mcp"

# Lokaler stdio-Server (npx):
sidekick mcp add github --command npx --args @modelcontextprotocol/server-github

# Mit Umgebungsvariablen (nur stdio):
sidekick mcp add github --command npx --args @modelcontextprotocol/server-github \
  --env GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx

# Preset verwenden:
sidekick mcp add myserver --preset mypreset

# Verwalten:
sidekick mcp list          # alle Server + Tool-Status
sidekick mcp test <name>   # Verbindung + Tool-Discovery testen
sidekick mcp remove <name> # Server entfernen
```

Die CLI führt nach dem Anlegen eine **Discovery-first Probe** durch: Sie verbindet sich,
listet die Tools des Servers auf und lässt dich wählen, welche registriert werden sollen.

---

## 3. `mcp_servers.json` — Vollständige Konfigurationsreferenz

Die Kanonische Ablage erfolgt im Profil unter dem Schlüssel `mcp_servers`
(`~/.sidekick/config.yaml` bzw. `%APPDATA%\Lastbrowser`-Profilpfad). Der Hub-Editor
spricht dasselbe Modell in der Claude-Desktop-kompatiblen `mcp_servers.json`-Form an.

### 3.1 Grundschema

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "npx",                          // stdio: ausführbarer Befehl
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {                                   // optional, nur stdio
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${MCP_GITHUB_API_KEY}"
      },

      "url": "https://example.com/mcp",          // remote: Endpoint (statt command)
      "transport": "sse",                        // optional: "sse" erzwingen
      "headers": {                               // optional, nur remote
        "Authorization": "Bearer ${MCP_EXAMPLE_API_KEY}"
      },
      "auth": "oauth",                           // optional: OAuth 2.1 Flow
      "connect_timeout": 30,                     // Sekunden bis Handshake-Timeout
      "ssl_verify": true,                        // TLS-Verifikation (niemals blind deaktivieren)

      "tools": {                                 // optional: Tool-Filterung
        "include": ["create_issue", "list_issues"],  // Whitelist (hat Vorrang)
        "exclude": ["delete_repository"],            // Blacklist
        "resources": true,                           // Utility-Tools list/read_resource
        "prompts": true                              // Utility-Tools list/get_prompt
      },

      "security": {                              // optional
        "allow_suspicious_tool_descriptions": [] // Tool-Namen mit bekannt auffälligen
      },                                         // Beschreibungen explizit erlauben

      "sampling": {                              // optional: MCP Sampling (Server→LLM)
        "enabled": true,
        "max_rpm": 10,                           // Rate-Limit Anfragen/Minute
        "timeout": 30,
        "max_tokens_cap": 4096,
        "max_tool_rounds": 5,
        "model": null,                           // Modell-Override
        "allowed_models": []
      }
    }
  }
}
```

**Regeln:**

- `command` (+ optional `args`, `env`) = **stdio-Server** (lokaler Prozess).
- `url` (+ optional `headers`, `auth`) = **remote-Server** (Streamable HTTP / SSE).
- Beides gleichzeitig ist ungültig; `--env` per CLI nur für stdio.
- `${ENV_VAR}`-Platzhalter in `env`/`headers` werden beim Start interpoliert.
  API-Keys gehören **nicht** in die JSON-Datei, sondern in die `.env` im
  Sidekick-Home (die CLI legt sie automatisch als `MCP_<NAME>_API_KEY` ab).

### 3.2 Fertige Beispiele

**GitHub MCP (stdio, npx):**

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${MCP_GITHUB_API_KEY}" },
      "tools": { "exclude": ["delete_repository", "delete_file"] }
    }
  }
}
```

**SQLite MCP (stdio, uvx):**

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "uvx",
      "args": ["mcp-server-sqlite", "--db-path", "C:/projekte/demo/app.db"],
      "tools": { "include": ["read_query", "list_tables", "describe_table"] }
    }
  }
}
```

**Fetch MCP (stdio, uvx):**

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    }
  }
}
```

**Remote-Server mit OAuth:**

```json
{
  "mcpServers": {
    "linear": {
      "url": "https://mcp.linear.app/sse",
      "transport": "sse",
      "auth": "oauth"
    }
  }
}
```

**Remote-Server mit Bearer-Token:**

```json
{
  "mcpServers": {
    "ink": {
      "url": "https://mcp.ml.ink/mcp",
      "headers": { "Authorization": "Bearer ${MCP_INK_API_KEY}" }
    }
  }
}
```

Der Token lebt in `<sidekick-home>/.env` als `MCP_INK_API_KEY` — nie im Klartext im Repo.

---

## 4. Wie die Tools im Agent ankommen

1. **Verbindung:** Beim Start verbindet sich die Engine zu jedem aktivierten Server
   (stdio-Subprozess bzw. HTTP-Session) und führt den MCP-`initialize`-Handshake aus.
2. **Discovery:** `tools/list` wird gelesen; jedes Tool wird registriert.
3. **Namenskonvention:** Tools erhalten das Präfix `mcp_<server>_<tool>`,
   z. B. `mcp_github_create_issue`. Kollisionen sind damit ausgeschlossen.
4. **Toolset:** Alle Tools eines Servers bilden das Toolset `mcp-<server>` —
   so lässt sich ein ganzer Server gezielt aktivieren/deaktivieren.
5. **Utility-Tools:** `list_resources` / `read_resource` / `list_prompts` / `get_prompt`
   werden nur registriert, wenn der Server die jeweilige Capability im
   `initialize`-Response auch **advertiert** (verhindert `-32601 Method not found`-Fehler).
6. **Live-Refresh:** Sendet der Server `notifications/tools/list_changed`, werden
   Tools ohne Neustart aktualisiert.
7. **Prompt-Injection-Scan:** Tool-Beschreibungen werden auf Injection-Muster
   gescannt (z. B. „ignore previous instructions“, gefährliche Import-Referenzen).
   Betroffene Tools werden markiert bzw. blockiert — Ausnahmen nur über
   `security.allow_suspicious_tool_descriptions`.

---

## 5. Berechtigungs- & Sandboxing-Modell

Jeder native Skill und jeder MCP-Server deklariert seine Fähigkeiten explizit.
Der Hub zeigt die Klassifizierung farbcodiert an:

| Stufe | Permission | Bedeutung | Standardverhalten |
| :--- | :--- | :--- | :--- |
| 🛡️ | `read_only` | Dateien lesen, Suchen ausführen, Webseiten abfragen | Auto-Approve möglich |
| ⚠️ | `filesystem_write` | Dateien im Workspace anlegen/ändern | Interaktive Bestätigung im Chat |
| 🚨 | `terminal_execute` | Shell-/ConPTY-Befehle ausführen | **Immer** Human-in-the-Loop |
| 🌐 | `network_outbound` | Externe HTTP/WebSocket-Anfragen außerhalb des Browsers | Interaktive Bestätigung empfohlen |
| 🤖 | `agent_autonomy` | Unüberwachte Multi-Step-Toolchains | Nur nach explizitem Opt-in |

**Security-First-Regeln:**

1. **Human-in-the-Loop:** Kritische Werkzeuge (`terminal_execute`, destruktive File-Writes)
   verlangen standardmäßig eine interaktive Bestätigung im Chat.
2. **Auto-Approve ist Opt-in:** Nur wenn du einen Skill explizit auf
   *„Immer vertrauen (Auto-Approve)“* setzt, entfällt die Nachfrage.
3. **1-Klick-Widerruf:** Alle gewährten Berechtigungen sind im Hub einsehbar
   und jederzeit mit einem Klick entziehbar.
4. **Least Privilege:** Nutze `tools.include`, um Server auf die minimal
   benötigte Tool-Menge zu beschränken (siehe SQLite-Beispiel oben).

---

## 6. Workspace-Scoping

Skills und MCP-Server werden **pro Workspace** aktiviert/deaktiviert. Der aktive
Workspace bestimmt, welche Tools Nova im Kontext geladen bekommt — das hält das
Context-Window schlank und reduziert Halluzinationen.

| Workspace-Typ | Typischerweise aktiv |
| :--- | :--- |
| **Coding** | ConPTY Terminal Executor, Git-/GitHub-MCP, Terminal-Tools, File System Automator |
| **Recherche** | Deep Web Scraper, Per-Tab Summarizer, Supermemory Vector Search, Arxiv-MCP |
| **Design** | ComfyUI Image Generation, Image-Inspection, Color-Palette-Extractor |
| **Alle** | Universell freigegebene Skills (z. B. DevTools Inspector) |

Im Hub filterst du die Skill-Liste über die Workspace-Chips
(`Alle / Coding / Recherche / Design`).

**Eingebaute Skills (Auslieferungszustand):**

| Skill | Kategorie | Workspace | Permissions |
| :--- | :--- | :--- | :--- |
| 💻 ConPTY Terminal Executor | system | coding | `terminal_execute`, `filesystem_write` |
| 🧠 Supermemory Vector Search | research | recherche | `read_only`, `filesystem_write` |
| 🌐 Deep Web Scraper | research | recherche | `read_only`, `network_outbound` |
| 🔍 DevTools & CDP Inspector | code | coding | `read_only` |
| 🎨 ComfyUI Image Generation | design | design | `network_outbound`, `agent_autonomy` |
| 📁 File System Automator | system | coding | `read_only`, `filesystem_write` |

---

## 7. Eigene MCP-Server entwickeln (Kompatibilitäts-Checkliste)

Damit dein Server sauber in Lastbrowser läuft:

1. **Standard-Konform:** Implementiere das MCP-Protokoll (JSON-RPC 2.0) über
   `stdio` oder Streamable-HTTP/SSE — z. B. mit dem offiziellen
   [`modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol) für
   TypeScript oder Python.
2. **Sauberer stdio-Start:** Kein Banner/Logging auf **stdout** — stdout ist
   ausschließlich für JSON-RPC reserviert. Logs nach **stderr** (Lastbrowser
   schreibt sie in `mcp-stderr.log`).
3. **Kapabilitäten ehrlich advertieren:** Nur `resources`/`prompts` in der
   `initialize`-Response deklarieren, wenn du sie wirklich implementierst.
4. **Tool-Schemas:** Jedes Tool braucht einen stabilen `name`, eine präzise
   `description` (keine Injection-Muster!) und ein valides JSON-Schema als
   `inputSchema`.
5. **Env statt Hardcoding:** Secrets ausschließlich über `env` + `${PLACEHOLDER}`
   referenzieren.
6. **Tool-Filter respektieren:** Dein Server muss damit klarkommen, dass der
   Nutzer nur eine Teilmenge deiner Tools freischaltet.

## 8. Troubleshooting

| Symptom | Ursache | Fix |
| :--- | :--- | :--- |
| Server verbindet nicht | `npx`/`uvx` nicht im PATH | Node.js bzw. `uv` installieren, Pfad prüfen |
| `Method not found (-32601)` bei Utility-Tools | Server advertiert Capability nicht | Server implementiert resources/prompts nicht — Filter in `tools` setzen |
| Tool fehlt in Nova | `tools.include`-Filter zu restriktiv oder Workspace-Scoping deaktiviert | `sidekick mcp list` + Hub-Workspace-Filter prüfen |
| Tool als „suspicious“ markiert | Injection-Muster in Tool-Beschreibung | Server-Beschreibung bereinigen oder gezielt allowlisten |
| Auth-Fehler am Remote-Server | Token fehlt/abgelaufen | `MCP_<NAME>_API_KEY` in `.env` setzen, `sidekick mcp test <name>` |
| Erste Nutzung hängt | Paket-Download bei erstem `npx -y`/`uvx -y`-Aufruf | Einmalig manuell ausführen, danach ist es gecacht |

Debug-Log: `mcp-stderr.log` im Sidekick-Home enthält stderr-Ausgaben aller stdio-Server.
# Lastbrowser / Nova AI – Model Context Protocol (MCP) Developer Guide

Dieses Dokument ist die offizielle Entwickler-Dokumentation für die Integration von **Model Context Protocol (MCP)** Servern und **Chrome Manifest V3 (MV3) WebExtensions** in Lastbrowser / Nova AI (v0.1.31+).

---

## 1. Die Zwei-Säulen-Architektur (Phase 14)

Lastbrowser trennt Browser-Erweiterungen und KI-Capabilities strikt nach Verantwortlichkeiten in einer dualen Architektur:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        LASTBROWSER UNIFIED EXTENSION & SKILL HUB                       │
├───────────────────────────────────────────────────┬────────────────────────────────────┤
│  SÄULE 1: Chromium MV3 WebExtensions              │  SÄULE 2: Native MCP System Skills │
│  (DOM-Kontext & Browser-Interaktion)              │  (System- & Agenten-Workflows)     │
├───────────────────────────────────────────────────┼────────────────────────────────────┤
│ • In-Page DOM Manipulation & CSS Styling          │ • Modell-aggnostisches Protokoll   │
│ • Content Scripts, Service Worker, Action Popups  │ • stdio & sse Transport-Layer      │
│ • Beispiele: Dark Reader, uBlock, Bitwarden       │ • Beispiele: GitHub, SQLite, FS    │
│ • Ausführung: Isolierte Chromium Extensions Engine│ • Ausführung: Python/Node Subproz. │
└───────────────────────────────────────────────────┴────────────────────────────────────┘
```

### Säule 1: Chromium MV3 WebExtensions (DOM-Kontext)
- **Zweck:** Visuelles Modifizieren von Webseiten, Auslesen des aktiven DOM, Formular-Autofill und klassische Browser-Add-ons.
- **Formate:** Entpackte Erweiterungsverzeichnisse, `.crx`-Dateien oder 1-Klick-Installation aus dem Chrome Web Store.
- **Sandboxing:** Unterliegt dem nativen Chromium Manifest V3 Sicherheitsmodell.

### Säule 2: Native MCP Skills (System- & Agenten-Workflows)
- **Zweck:** Systemnahe Operationen, Datenbank-Abfragen, Git-Operationen, Terminal-Befehle und Schnittstellen zu externen Diensten.
- **Standard:** Offener **Model Context Protocol (MCP)** Standard (initiiert von Anthropic, unterstützt vom Claude Desktop Ökosystem).
- **Transporte:** Interprozesskommunikation über `stdio` (Standard I/O Subprozesse) oder `sse` (Server-Sent Events über HTTP/HTTPS).

---

## 2. Konfigurationsformat `mcp_servers.json`

Die Konfiguration aller aktiven MCP-Server erfolgt deklarativ über eine zentral verwaltete JSON-Datei.

### Speicherorte
- **Global:** `%APPDATA%\Lastbrowser\mcp_servers.json`
- **Workspace-spezifisch:** `.lastbrowser/mcp_servers.json` im Projekt-Stammverzeichnis.

### JSON-Schema Definition

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node|python|uvx|npx",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR_NAME": "VALUE"
      },
      "permissions": ["read_only", "filesystem_write"],
      "disabled": false
    },
    "sse-server-name": {
      "url": "https://mcp-server.example.com/sse",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      },
      "permissions": ["read_only", "network_outbound"]
    }
  }
}
```

---

## 3. Konkrete Einrichtungsbeispiele für populäre MCP-Server

### 3.1 GitHub MCP Server (stdio)
Ermöglicht Nova AI das Lesen von Repositories, Erstellen von Issues und Verwalten von Pull Requests.

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN"
      },
      "permissions": ["read_only", "network_outbound"]
    }
  }
}
```

### 3.2 SQLite MCP Server (stdio)
Erlaubt das Abfragen und Analysieren lokaler SQLite-Datenbanken.

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "uvx",
      "args": ["mcp-server-sqlite", "--db-path", "C:/Users/Public/database.db"],
      "permissions": ["read_only"]
    }
  }
}
```

### 3.3 Fetch MCP Server (stdio)
Bietet sicheren HTTP-Abruf und Konvertierung von Webinhalten in Markdown.

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "permissions": ["read_only", "network_outbound"]
    }
  }
}
```

### 3.4 Brave Search MCP Server (stdio)
Ermöglicht strukturierte Web-Recherchen über die Brave Search API.

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "YOUR_BRAVE_SEARCH_API_KEY"
      },
      "permissions": ["read_only", "network_outbound"]
    }
  }
}
```

### 3.5 Filesystem MCP Server (stdio)
Gewährt strukturierten Zugriff auf freigegebene lokale Verzeichnisse.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:/projekte/lastbrowser",
        "C:/Users/Public/Documents"
      ],
      "permissions": ["read_only", "filesystem_write"]
    }
  }
}
```

---

## 4. Sicherheits- & Sandboxing-Modell

Lastbrowser erzwingt ein transparentes, mehrstufiges Berechtigungsmodell für alle installierten MCP-Skills.

### Berechtigungsstufen Matrix

| Icon | Berechtigungsstufe | Beschreibung | Bestätigungspflicht |
| :-: | :--- | :--- | :--- |
| 🛡️ | `read_only` | Lesezugriff auf Daten, Suchen, Dokumenten-Parsing. | Automatisch erlaubt |
| ⚠️ | `filesystem_write` | Erstellen, Bearbeiten oder Löschen lokaler Dateien. | Human-in-the-Loop |
| 🚨 | `terminal_execute` | Ausführen von Shell-Befehlen und Scripts im Terminal. | Expliziter Dialog |
| 🌐 | `network_outbound` | Ausgehende HTTP/HTTPS-Anfragen an externe Server. | Transparenzhinweis |

### Human-in-the-Loop Bestätigungsdialog
Sollte ein MCP-Skill eine Aktion anfordern, die über `read_only` hinausgeht (z. B. Datei überschreiben oder Shell-Befehl ausführen), unterbricht Lastbrowser die Ausführung und rendert ein interaktives Bestätigungsfenster:

- **Anzeigedetails:** Skill-Name, angeforderte Aktion, Zielpfad/Befehl, Risikostufe.
- **Optionen:** `Einmalig erlauben`, `Für diesen Workspace erlauben`, `Ablehnen`.
- **Widerruf:** Alle erteilten Freigaben können im **Unified Extension & Skill Hub (`Ctrl+Shift+X`)** mit einem Klick widerrufen werden.

---

## 5. Workspace-Scoping

Um das Kontextfenster (Context Window) der KI-Modelle schlank zu halten und Halluzinationen zu vermeiden, werden MCP-Skills in Lastbrowser pro Workspace isoliert.

### Workspace-Typen & Skill-Profile

1. **Coding Workspace (`/code`)**
   - **Aktive Skills:** Filesystem MCP, GitHub MCP, SQLite MCP, Terminal execution.
   - **Ziel:** Schnelle Code-Navigierung, Git-Workflows und automatische Tests.

2. **Recherche Workspace (`/research`)**
   - **Aktive Skills:** Fetch MCP, Brave Search MCP, Paper Summarizer, Deep Analysis Workflows.
   - **Ziel:** Quellensynthese, Fact-Checking und Erstellung von Berichten.

3. **Design & Content Workspace (`/design`)**
   - **Aktive Skills:** WebExtensions (Dark Reader, ColorPicker), Image-Export, Social Thread Generator.
   - **Ziel:** Layout-Bewertung, Farbpaletten-Extraktion und Content-Doku.

---

## 6. Verifikation & Fehlerbehebung

Zur Überprüfung der geladenen MCP-Server bietet Lastbrowser eingebaute Diagnose-Tools:

1. **GUI:** Tastenkombination `Ctrl+Shift+X` drücken &rarr; Reiter **Skills &amp; MCP-Tools** auswählen.
2. **Terminal:** Im ConPTY-Terminal den Befehl `sidekick doctor` ausführen, um Verbindungsstatus, Latenz und Pfade zu verifizieren.
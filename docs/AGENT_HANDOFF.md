# Übergabe & Follow-Up Prompt für den nachfolgenden Agenten

> **Status:** Alle Pakete 2, 3, 4 und 5 vollständig implementiert und verifiziert (`npm test` 573 Tests grün in 68 Suites, `npm run verify:store` 27/27 PASS, `npm --workspace apps/desktop run build` 0 Fehler, `python -m compileall` 0 Fehler).

---

## 1. Vollständig umgesetzter Stand (Pakete 2, 3, 4, 5)

1. **Zen-Mode Omnibox-Autohide (Paket 4.2):**
   - Bei `sidebarMode === 'hidden'` blendet sich die `ModernTitlebar` sanft nach oben aus (`transform: translateY(-100%)`).
   - Kanten-Hover-Sensor an der oberen Bildschirmkante oder Shortcut `Ctrl+L` lässt die Leiste sanft einschweben (`transform: translateY(0)`).
2. **Multi-Tab Splitscreen (Paket 4.4):**
   - 2-Wege (Spalten / Zeilen), 3-Wege und 4-Wege (2x2 Grid) Viewport-Teilung im Browser-Canvas.
   - Drag & Drop Dropzone-Overlay sowie 1-Klick Split-Button (`vtab-split-btn`) an jedem Tab.
   - Synchrones Browsing mit unabhängigen Adressleisten, Reload- und Close-Split-Controls.
3. **Nova AI Chat Session Management (Paket 4.1 / Paket 3):**
   - Button *„+ Neuer Chat“* / Reset in `CopilotSplitView.tsx` und `NativeChatMain.tsx`.
   - Automatische Titelgenerierung prägnanter Chat-Titel aus dem ersten User-Prompt via `renameSession`.
   - Durchsuchbare Session-Historie in der Copilot-Leiste.
   - High-Contrast Dropdown Dark-Theme Fix (`.model-group-title`, `#0b1325` Hintergrund).
4. **First-Launch Wizard Erweiterungen (Paket 2):**
   - **Top-3 LLMs dominant hervorgehoben (Paket 2.1):** Google Gemini CLI (Multi-Account Round-Robin & Live-Discovery), ChatGPT / Codex (o3-mini, GPT-4o, Coding-Parität), Ollama (100% Offline-Privatsphäre).
   - **Fremdbrowser-Import (Paket 2.2):** Auswahlkarten für Chrome, Edge, Firefox, Brave mit Checkboxen für Lesezeichen, Verlauf & Shortcuts; 1-Klick Datei-Picker für `.html` / `.json` Lesezeichen-Dateien mit direktem Mergen in `localStorage`.
   - **Pinned Apps Setup (Paket 2.4):** Interaktive Kachelauswahl der beliebtesten Web-Apps (WhatsApp, Notion, Figma, GitHub, Discord, Spotify etc.) mit Live-Sync in den `usePinnedAppStore`.
   - **Windows Standard-Browser Abfrage (Paket 2.3):** Prominente Abfrage-Karte mit Statusprüfung (`isDefaultBrowser`) und 1-Klick Button *„Jetzt als Standard festlegen“* (`window.lastbrowser.system.setDefaultBrowser()`).

---

## 2. Kopierbarer Prompt für den nächsten Agenten (Fokus: Paket 1)

```markdown
Du übernimmst die Weiterentwicklung von Lastbrowser auf Branch `codex/lastbrowser-electron-shell`.
Lies verbindlich AGENTS.md, goal.md und docs/AGENT_HANDOFF.md.

Der aktuelle Stand ist vollständig getestet (573 Tests grün in 68 Suites, 27/27 Store Checks PASS, 0 Buildfehler).
Die Pakete 2, 3, 4 und 5 aus goal.md sind fertig umgesetzt.

Setze als Nächstes Paket 1 (Kern-Architektur & System-Engine) aus goal.md um:
1. MCP JSON-RPC Client (Paket 1.1):
   - In-Tree Python Runtime (`services/sidekick/runtime/`) & Main-Process: Vollwertiger JSON-RPC 2.0 Client für stdio (Subprozesse via npx/uvx/python) und sse (HTTP Server-Sent Events).
   - Dynamische Weitergabe der Tools (`tools/list`) an das Nova Function-Calling-Schema mit Sicherheits-Bestätigungsmodell (read_only, filesystem_write, terminal_execute, network_outbound).
2. Universal Command Palette 38+ CLI-Subcommands (Paket 1.2):
   - In `apps/desktop/src/renderer/components/CommandPalette.tsx`: Alle 38+ administrativen und diagnostischen Sidekick-Befehle als durchsuchbare 1-Klick-Aktionen mit Autocomplete einpflegen (`sidekick fix`, `sidekick supermemory index/dump`, `sidekick config show`, Gateway Daemon, etc.).
3. Supermemory-Vektoreinbettung mit automatischem Fallback (Paket 1.3):
   - Automatischer Fallback: 1. Google Gemini CLI Embedding (`text-embedding-004`), 2. Lokales Ollama Embedding (`nomic-embed-text`), 3. Lokale BM25/SQLite Fallback-Vektorisierung.

Halte vor jedem Commit alle Qualitäts-Gates ein:
- npm test (alle 68+ Suites müssen grün sein)
- npm run verify:store (27/27 Checks PASS)
- npm --workspace apps/desktop run build (0 Fehler)
- python -m compileall -q services/sidekick (Exit Code 0)
```


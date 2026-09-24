# Lastbrowser & Nova AI – Master Goal & Debugging Roadmap

> **Arbeitsanweisung für nachfolgende Agenten:**  
> Dieses Dokument definiert alle verbindlichen Implementierungs- und Debugging-Ziele. Aufgaben sind modular und priorisiert gegliedert. Vor jeder Umsetzung sind die Architektur-Richtlinien in [`AGENTS.md`](file:///c:/projekte/lastbrowser/AGENTS.md) zu beachten (In-Tree Source of Truth `services/sidekick/`, keine externen Syncs, Qualitäts-Gates via `npm test`, `npm run verify:store` und `npm run build`).

---

## 1. Übersicht der Aufgabenpakete

- [ ] **Paket 1: Kern-Architektur & System-Engine** (MCP Runtime, CLI Palette, Supermemory Embeddings)
- [x] **Paket 2: First-Launch Wizard & Onboarding Route** (Top-3 LLMs, Browser-Import, Default-Browser, Pinned-Apps Setup)
- [x] **Paket 3: Nova AI Chat Experience & Model Resolution** (Chat-Management, Reset/Neuer Chat, Kontrast-Fix, Live-Modell-Sync)
- [x] **Paket 4: Shell-Ergonomie, Navigation & Tab-Splitscreen** (Top-Bar Bug-Icon, Nova Icon-Only, Zen-Mode Omnibox-Autohide, 4-Way Tab Splitscreen, Pinned-Apps Modal)
- [x] **Paket 5: Debugging-Ziele & Panel-Stabilität** (AdvancedWebUiTools Crash, Supermemory Object-Error, Profile Creation)

---

## 2. Paket 1: Kern-Architektur & System-Engine

### 1.1 MCP JSON-RPC Client im Python-Backend / Main-Process
- **Ziel:** Die in Phase 14 spezifizierten und im Frontend [`UnifiedExtensionHub.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/UnifiedExtensionHub.tsx) deklarierten externen MCP-Server live an die Runtime anbinden.
- **Anforderungen:**
  - Implementierung eines vollwertigen JSON-RPC 2.0 Clients für:
    - **`stdio`**: Starten von Subprozessen (`npx`, `python`, `uvx`) mit I/O-Pipes und Environment-Variablen.
    - **`sse`**: HTTP Server-Sent Events Verbindung zu Remote-MCP-Servern.
  - Dynamische Übergabe der entdeckten Werkzeuge (`tools/list`) in das LLM-Function-Calling-Schema von Nova AI.
  - Berücksichtigung des Sicherheits- und Bestätigungs-Modells (🛡️ `read_only`, ⚠️ `filesystem_write`, 🚨 `terminal_execute`, 🌐 `network_outbound`).
- **Betroffene Dateien:**
  - [`services/sidekick/runtime/`](file:///c:/projekte/lastbrowser/services/sidekick/runtime/)
  - [`apps/desktop/src/main/services.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/main/services.ts)
  - [`apps/desktop/src/main/preload.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/main/preload.ts)

### 1.2 Vollständige 38+ CLI-Subcommands in der Universal Command Palette (`Ctrl+K`)
- **Ziel:** Alle administrativen und diagnostischen Sidekick-Befehle als durchsuchbare Aktionen in die Palette einpflegen.
- **Anforderungen:**
  - Registrierung von 1-Klick-Aktionen mit Autocomplete und Icons für:
    - `> Sidekick: Local State reparieren (`sidekick fix`)`
    - `> Sidekick: Supermemory reindizieren (`sidekick supermemory index`)`
    - `> Sidekick: Supermemory Status & Dump (`sidekick supermemory dump`)`
    - `> Sidekick: Konfiguration anzeigen (`sidekick config show`)`
    - `> Sidekick: Gateway Daemon starten / stoppen / neu starten`
    - `> Sidekick: Token-Verbrauch analysieren (`sidekick token count`)`
    - `> Sidekick: RAG-Vektordatenbank aktualisieren`
    - Weitere administrative CLI-Subcommands gemäß Sidekick CLI Katalog.
- **Betroffene Datei:**
  - [`apps/desktop/src/renderer/components/CommandPalette.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/CommandPalette.tsx)

### 1.3 Supermemory-Vektoreinbettung mit automatischem Fallback
- **Ziel:** Vollautomatische Vektor-Einbettung (Embeddings) für die semantische Suche ohne manuelle API-Key-Hürden.
- **Anforderungen:**
  - Automatischer Fallback-Pfad:
    1. Primär: Google Gemini CLI Embedding (`text-embedding-004`) bei aktivem Google-Login.
    2. Sekundär: Lokales Ollama Embedding (`nomic-embed-text` oder `all-minilm`) falls Ollama erreichbar ist.
    3. Tertiär: Schlüsselfertige lokale Fallback-Vektorisierung (BM25 / Sentence-Transformers) in SQLite.
- **Betroffene Dateien:**
  - [`services/sidekick/runtime/`](file:///c:/projekte/lastbrowser/services/sidekick/runtime/)
  - [`services/sidekick/web/api/`](file:///c:/projekte/lastbrowser/services/sidekick/web/api/)

---

## 3. Paket 2: First-Launch Wizard & Onboarding Route

### 2.1 Top-3 LLMs als empfohlene Provider hervorheben
- **Ziel:** Im Setup-Assistenten die wichtigsten drei Provider dominant und detailliert präsentieren:
  1. **Google Gemini CLI** (Empfohlen • Kostenlose Kontingente, Multi-Account Round-Robin, Live-Discovery).
  2. **ChatGPT CLI / OpenAI** (GPT-4o, o3-mini, Coding-Parität).
  3. **Ollama Cloud / Local** (100% Offline-Privatsphäre, Open-Source Modelle).
- **Anforderungen:**
  - Ausführliche Beschreibungen, Funktionsmerkmale und Einrichtungs-Tipps für die Top 3.
  - Weitere Provider (Anthropic, DeepSeek, etc.) dezent darunter als Sekundär-Optionen listen.
- **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/FirstRunWizard.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/FirstRunWizard.tsx)
  - [`apps/desktop/src/renderer/stores/setup-state.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/stores/setup-state.ts)

### 2.2 Profil- & Passwort-Import aus Fremdbrowsern
- **Ziel:** Nutzer beim Erststart fragen, ob Daten aus vorhandenen Browsern (Google Chrome, Microsoft Edge, Mozilla Firefox, Brave) importiert werden sollen.
- **Anforderungen:**
  - Erkennung installierter Standardbrowser.
  - Checkboxen für Lesezeichen, Verlauf und optional Passwörter/Logins.
  - Saubere Integration in den Einrichtungs-Flow vor dem ersten Seitenaufruf.
- **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/FirstRunWizard.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/FirstRunWizard.tsx)
  - [`apps/desktop/src/main/main.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/main/main.ts) (IPC für Fremdbrowser-Pfade)

### 2.3 Windows Standard-Browser Abfrage
- **Ziel:** Beim ersten Start aktiv nachfragen, ob Lastbrowser als Standard-Webbrowser für HTTP/HTTPS und HTML-Dateien registriert werden soll.
- **Anforderungen:**
  - Prominente Abfrage-Karte im Wizard mit *„Jetzt als Standard festlegen“* und *„Später entscheiden“*.
  - Bei Bestätigung Aufruf von `app.setAsDefaultProtocolClient` bzw. Öffnen der Windows-Einstellungen (`ms-settings:defaultapps`).
- **Betroffene Datei:**
  - [`apps/desktop/src/renderer/components/FirstRunWizard.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/FirstRunWizard.tsx)

### 2.4 Pinned Apps Favoriten-Auswahl im Setup-Assistenten
- **Ziel:** Nutzer sollen bereits beim Einrichten ihre bevorzugten Pinned Apps (WhatsApp, Notion, Figma, GitHub, Discord, Spotify etc.) auswählen können.
- **Anforderungen:**
  - Kachel-Grid der Top-Web-Apps mit Mehrfachauswahl im Setup-Wizard.
  - Sofortige Übernahme in den [`usePinnedAppStore`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/stores/usePinnedAppStore.ts).
- **Betroffene Datei:**
  - [`apps/desktop/src/renderer/components/FirstRunWizard.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/FirstRunWizard.tsx)

---

## 4. Paket 3: Nova AI Chat Experience & Model Resolution

### 4.1 Nova Chat Session Management & Modernes Chat-Layout
- **Ziel:** Chatfenster grundlegend modernisieren nach Vorbild von ChatGPT / Gemini / Claude.
- **Anforderungen:**
  - Button *„+ Neuer Chat“* / Reset, um eine frische Konversation zu starten.
  - Automatische Generierung von prägnanten Chat-Titeln basierend auf der ersten Nutzeranfrage.
  - Durchsuchbare Chat-Historie (Aktive Chats, Archivierte Chats, Löschen).
  - Übersichtliches Zwei-Spalten- oder Drawer-Layout für Konversationen.
- **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/CopilotSplitView.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/CopilotSplitView.tsx)
  - [`apps/desktop/src/renderer/panels/NativeChatMain.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/panels/NativeChatMain.tsx)

### 4.2 Kontrast-Fix für Modellauswahl im Chat
- **Ziel:** Weiße Schrift auf weißem Hintergrund im Chat-Modellauswahl-Dropdown beheben.
- **Anforderungen:**
  - Dunkler Hintergrund (`#0b1325` / `--panel`), saubere Textfarbe (`#F7FAFF` / `--text`), cyanfarbene Hover-Zustände.
  - Überprüfung in Light- und Dark-Themes.
- **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/CopilotSplitView.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/CopilotSplitView.tsx)
  - [`apps/desktop/src/renderer/styles.css`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/styles.css)

### 4.3 Default Model / Conversation Live-Discovery
- **Ziel:** Im Einstellungsbereich *Default Model / Conversation* veraltete Hardcoded-Modell-IDs entfernen und exakt wie im Chat dynamisch die real verfügbaren Modelle (Google CLI Quota-Discovery) abfragen.
- **Anforderungen:**
  - Bindung des Select-Inputs an `/api/models` / Live-Quota-API.
  - Nur provisionierte Modelle mit Kontingent-Status anzeigen.
- **Betroffene Datei:**
  - [`apps/desktop/src/renderer/panels/SystemPanels.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/panels/SystemPanels.tsx) (Bereich *Conversation / Model Settings*)

---

## 5. Paket 4: Shell-Ergonomie, Navigation & Tab-Splitscreen

### 5.1 Titelleiste & Slim Dock Icon-Bereinigung
- **Ziel:** Redundante Text- und Buchstabenelemente entfernen.
  - **Oben rechts in Titelleiste:** Nur noch das Nova-Icon anzeigen (Text „Nova“ entfernen).
  - **Im Slim Dock (48px):** Nur noch das Nova-Icon anzeigen (zusätzlicher Buchstabe „N“ entfällt).
  - **Topleiste GitHub Link:** Ersetzen des GitHub-Icons durch ein Bug-Icon mit direktem Link zu `https://github.com/Loggableim/lastbrowser/issues`.
- **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/HeaderComponents.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/HeaderComponents.tsx)
  - [`apps/desktop/src/renderer/components/ModernSidebar.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/ModernSidebar.tsx)

### 5.2 Zen-Mode: Adressleiste nach oben ausblenden
- **Ziel:** Im Zen-Fokusmodus (0px Sidebar) auch die obere Adressleiste / Titelleiste automatisch nach oben ausblenden.
- **Anforderungen:**
  - Leiste blendet sich sanft nach oben aus (`transform: translateY(-100%)`).
  - Reaktivierung bei Mouseover an die oberste Bildschirmkante (Hover-Zone) oder Drücken von `Ctrl+L`.
- **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/HeaderComponents.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/HeaderComponents.tsx)
  - [`apps/desktop/src/renderer/styles.css`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/styles.css)

### 5.3 Pinned Apps: Modales Favoriten-Overlay ("+")
- **Ziel:** Klick auf das `+`-Icon bei den Pinned Apps öffnet ein elegantes Overlay zur schnellen Festlegung von Favoriten.
- **Anforderungen:**
  - Schnellauswahl aus Top-64-Katalog + benutzerdefinierte URLs.
  - 1-Klick Anpinnen/Abpinnen mit visueller Rückmeldung.
- **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/ModernSidebar.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/ModernSidebar.tsx)
  - [`apps/desktop/src/renderer/stores/usePinnedAppStore.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/stores/usePinnedAppStore.ts)

### 5.4 Multi-Tab Splitscreen per Drag & Drop (bis zu 4 Tabs)
- **Ziel:** Ziehen eines Tabs aus der Sidebar auf einen anderen Tab oder in den Web-Viewport aktiviert einen flexiblen Splitscreen-Modus.
- **Anforderungen:**
  - **2 Tabs:** 50/50 Split (vertikal oder horizontal).
  - **3 Tabs:** Gedrittelt (2 kleine links / 1 großer rechts, oder 2 oben / 1 unten) mit Layout-Umschalter.
  - **4 Tabs:** Geviertelt (2x2 Grid).
  - Synchrones Browsing, unabhängige Navigation und sauberes Schließen einzelner Split-Tabs.
- **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/TabComponents.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/TabComponents.tsx)
  - [`apps/desktop/src/renderer/components/ModernSidebar.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/ModernSidebar.tsx)
  - [`apps/desktop/src/renderer/stores/useTabStore.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/stores/useTabStore.ts)
  - [`apps/desktop/src/renderer/App.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/App.tsx)

### 5.5 Appearance Settings Rework
- **Ziel:** Portierung und Vereinheitlichung der Appearance-Einstellungen aus dem alten WebUI.
- **Anforderungen:**
  - Farbthemen / Akzent-Themes (Neon Cyan, Electric Violet, Emerald Flow, Solar Amber, Monochrome Slate).
  - Glassmorphism-Stufen (Solid, Subtil, Modern, Deep Glass).
  - Schriftgrößen & UI-Dichte (Kompakt / Standard / Groß).
  - Message-Layout-Auswahl (Bubble, Compact, Minimal, Terminal-Style).
- **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/panels/SystemPanels.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/panels/SystemPanels.tsx)
  - [`apps/desktop/src/renderer/styles.css`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/styles.css)

---

## 6. Paket 5: Debugging-Ziele & Panel-Stabilität (Sofort-Behebung)

### 6.1 Panel Crash: `AdvancedWebUiTools is not defined`
- **Symptom:** Beim Öffnen von `Settings`, `Insights` oder `Logs` stürzt das Rendering mit `ReferenceError: AdvancedWebUiTools is not defined` ab.
- **Ursache:** Fehlender Komponenten-Import in [`SystemPanels.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/panels/SystemPanels.tsx).
- **Lösungsschritt:**
  1. `import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';` im Kopf von `SystemPanels.tsx` ergänzen.
  2. Statischen Integritätstest in `tests/browser-layout.test.ts` schreiben, der ungebundene JSX-Identifier abfängt.

### 6.2 Supermemory: `Error: [object Object]` bei `listSupermemoryDocuments`
- **Symptom:** Im Memory-Bereich erscheint `Error invoking remote method 'lastbrowser:sidekick:listSupermemoryDocuments': Error: [object Object]`.
- **Ursache:** Die IPC-Bridge bzw. der FastAPI-Endpunkt wirft ein strukturiertes Fehlerobjekt (HTTP 500 / uninitialisierte SQLite-Tabelle), das von Electron serialisiert wird.
- **Lösungsschritt:**
  1. Im Backend [`services/sidekick/web/api/`](file:///c:/projekte/lastbrowser/services/sidekick/web/api/) sicherstellen, dass leere Dokumentenlisten als `[]` mit HTTP 200 zurückgegeben werden, wenn die Tabelle noch uninitialisiert ist.
  2. Im IPC-Handler [`apps/desktop/src/main/services.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/main/services.ts) Fehlerobjekte vor dem Rückwurf sauber mit `err?.message ?? 'Supermemory uninitialisiert'` extrahieren.

### 6.3 Agent Profiles: "Add new profile" Button ohne Funktion
- **Symptom:** Klick auf *„Add new profile“* im Agent Profiles Panel löst keine Aktion aus.
- **Ursache:** Fehlender Event-Handler oder leere Callback-Funktion im `AgentProfilesPanel`.
- **Lösungsschritt:**
  1. Dialog / Inline-Formular zur Eingabe von Profilname, Gateway, Standardmodell und System-Prompt implementieren.
  2. Profilerstellung über die Backend-API `/api/profiles` persistieren und Store aktualisieren.

---

## 7. Qualitätskriterien für den Abschluss aller Tasks

| Check | Befehl | Soll-Ergebnis |
| :--- | :--- | :--- |
| **Unit & Integration Tests** | `npm test` | Alle 66+ Suites bestanden, 0 Fehler |
| **Store Release Preflight** | `npm run verify:store` | 27/27 Checks bestanden (`[PASS]`) |
| **Desktop Shell Build** | `npm --workspace apps/desktop run build` | 0 TypeScript- und Vite-Fehler |
| **Python Syntax Check** | `python -m compileall -q services/sidekick` | Exit Code 0 |

# Lastbrowser & Sidekick – Verbindliches Zielbild

## 1. Leitidee & Vision

Lastbrowser vereint einen vollständigen, schnellen Windows-Browser (Chromium/Electron) mit dem vollwertigen **Sidekick AI Agenten** (`services/sidekick`).
Das Zielbild ist die **vollständige, native Parität** und eine **moderne, aufgeräumte Ästhetik**:
1. **Funktionale Parität:** Alle Fähigkeiten, Werkzeuge, Oberflächen und Hintergrunddienste aus Sidekick Standalone (TUI, `sidekick doctor`, 38+ CLI-Befehle, Messaging Gateway Daemon) sind im Lastbrowser nativ integriert.
2. **UI-Synthese (Sidekick + Zen Browser):** Die überladene Drei-Spalten-Ansicht wird durch eine elegante, vertikale Navigationsstruktur ersetzt. Die **beliebte ein- und ausklappbare Sidebar** bleibt als Kern-Feature vollständig erhalten und wird flexibler (ausgeklappt, kompakter Slim-Icon-Dock oder 100% Full-Canvas).

---

## 2. Statusübersicht der Phasen

- [x] **Phase 1: Stabilitätsfundament** (Zustand Stores, App.tsx Modularisierung, 6 Locales i18n, node-pty Terminal, auto-generierter 418-Endpunkte-API-Katalog, Multi-Monitor Window Dragging)
- [x] **Phase 2: Modularisierung & Kernfeatures (v0.1.26)** (Sub-Panels ausgelagert, Netscape/JSON Lesezeichen-Import/Export, Session-Snapshots, Visual Adblock Shield)
- [x] **Phase 3: Auth, Modellkatalog & Setup Assistant** (In-App OAuth Connect Window, Gemini CLI Modellparität, Fullscreen First-Run Wizard, 5 Persönlichkeitsprofile)
- [x] **Phase 4: Shortcuts, Omnibox & Speed Dial (v0.1.27)** (Globaler IPC-Shortcut-Dispatcher, Omnibox-Autocomplete mit Live-Suggestions, Startseiten Speed-Dial)
- [x] **Phase 5: Browser Polish & UX (v0.1.28)** (Tab-Favicons, Lade-Spinner, dynamischer Stop/Reload-Button, Webview Crash-Recovery, F11 Vollbild, Download-Aktivitätsindikator, 306 Unit-Tests grün)
- [x] **Phase 6: Browser Power-Features (v0.1.29)** (Rechtsklick „Element untersuchen“ / DevTools Inspect mit Auto-Open, Rechtsklick „Deep Research mit [Assistenten-Name]“, Tab Audio-Indikator & Per-Tab Mute, Privater / Inkognito-Modus mit in-memory-incognito Partition & Ctrl+Shift+N, 309 Unit-Tests grün)
- [x] **Phase 7: Volle Standalone-Parität – Native Integration der Sidekick-Kernfeatures** (TUI, `sidekick doctor`, 38+ CLI-Subcommands, Multi-Platform Messaging Gateway Daemon)
- [x] **Phase 8: WebExtensions / Addon-Support (Manifest V3)** (Entpacktes Laden, Zero-Dependency CRX3-Extraktor, kuratierter 1-Klick-Store mit Dark Reader, uBlock Origin Lite, Bitwarden, ClearURLs, Violentmonkey, Web Store URL-Install, Session-Attachment)
- [x] **Phase 9: Modernes UI-Redesign (Sidekick + Zen Synthese mit einklappbarer Sidebar)** (Einklappbare vertikale Tabs, Wegfall horizontaler Tabs, 48px Slim-Dock, Pinned-Grid, Sidekick-Startseiten-Dashboard, 70/30 Copilot Split-View)
- [x] **Phase 10: Agentic Browsing & Deep Tab Intelligence (Comet-Parität)** (10.1 Cross-Tab Context Synthesis `@tabs`, 10.6 CometJacking & Prompt-Injection Guardrails, Clickable Citation Badges)

---

## 3. Architekturüberblick

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               LASTBROWSER SHELL                                  │
├───────────────────────┬───────────────────────────────┬──────────────────────────┤
│    BROWSER VIEW       │    COLLAPSIBLE SIDEBAR        │    HINTERGRUND-DIENSTE   │
│ • Tabs & Navigation   │ • 48px Slim-Dock (Agent/Apps) │ • Sidekick FastAPI Core  │
│ • DevTools & Inspect  │ • Vertikale Tabs & Pinned-Grid│ • Multi-Platform Gateway │
│ • Adblock & History   │ • Ein-/Ausklappbar (3 Modi)   │   Daemon (Telegram, WA,  │
│ • Tab Audio / Mute    │ • Copilot Split-View (70/30)  │   Discord, Slack, etc.)  │
│ • Inkognito-Modus     │ • Terminal (Shell & TUI-Mode) │ • System Tray Runner     │
└───────────────────────┴───────────────────────────────┴──────────────────────────┘
```

---

## 4. Spezifikation Phase 7: Volle Standalone-Parität

### 7.1 Terminal UI (TUI) – Native Integration
1. **Modus-Umschalter im Terminal-Panel (`panels/NativeTerminalMain.tsx`):**
   - Umschalter zwischen `[ System Shell ]` und `[ Sidekick TUI ]`.
2. **Direktstart von `sidekick --tui`:**
   - Im TUI-Modus startet der PTY-Prozess (`terminal-process.ts`) den bundled Python-Interpreter mit:
     `python.exe -m sidekick_cli.main --tui`
   - Übernahme von `SIDEKICK_HOME`, Workspace-Pfad und aktivem Profil.
3. **Nahtloser Wechsel aus dem Chat-Panel:**
   - Button *„In TUI fortsetzen“* wechselt direkt zum Terminal-Panel mit Übernahme der aktuellen Session-ID.
4. **PTY-Resize-Unterstützung:**
   - Sauberes Curses-/Box-Drawing durch bestehende `node-pty` Resize-Übertragung.

### 7.2 CLI-Diagnose (`sidekick doctor`) – Interaktives Diagnosetool
1. **Diagnose-Reiter in Settings (`SystemPanels.tsx`) & Control Center:**
   - Button: *„System-Diagnose ausführen (`sidekick doctor`)“*.
### 7.1 Sidekick Terminal UI (TUI) & ANSI-PTY Integration [x] (Umgesetzt)
1. **Echter ConPTY Pseudo-Terminal via `node-pty`:**
   - [x] ConPTY-Allokation mit vollem VT100/ANSI-Support und dynamischem Resize (`terminal-process.ts`).
2. **Sidekick Curses/TUI Support:**
   - [x] Start von `python.exe -m sidekick_cli.main --tui` im ConPTY.
3. **Native Terminal UI (`NativeTerminalMain.tsx`):**
   - [x] Modus-Umschalter zwischen PowerShell-Shell und Sidekick TUI, Quick-Command-Chips (`sidekick doctor`, `status`, `--help`), ANSI-Cleaning.

### 7.2 Diagnose-Dashboard (sidekick doctor) [x] (Umgesetzt)
1. **Interaktiver Aufruf:**
   - [x] Direkt im Terminal via 1-Klick-Button `doctor` oder CLI `sidekick doctor`.
2. **Strukturierte JSON-Diagnose-API:**
   - [x] IPC-Handler `lastbrowser:doctor:run` & `services.runDoctor({ fix?: boolean })` mit robustem Parser (`parseDoctorOutput`) für strukturierte Reports (`DoctorReport`).
   - [x] Kategorien: Python/Runtime, Provider-Konnektivität (Pings), Toolchains (Node, Git, Ripgrep), Konfiguration, Speicher/Berechtigungen & WAL.
3. **Interaktives UI-Dashboard:**
   - [x] Farbcodierte Status-Badges (Grün/Gelb/Rot) für jede Diagnosegruppe sowie Quick-Fixes (*„Auto-Fix anwenden (`--fix`)“*, *„Setup-Assistent öffnen“*).
   - [x] Umschaltung zwischen visuellem Category-Grid-Report und Raw-CLI-Konsolenlog mit 1-Klick-Kopierfunktion.

### 7.3 38+ CLI-Subcommands – Command Palette & Shell-Integration [x] (Umgesetzt)
1. **Universal Command Palette (`Ctrl+K`):**
   - Alle 38+ Subcommands als durchsuchbare Aktionen in der Palette (z. B. `> Sidekick: Local State reparieren`, `> Sidekick: Modell wechseln`, `> Sidekick: Supermemory reindizieren`).
2. **Automatische Alias-/PATH-Bereitstellung im Terminal:**
   - [x] Im Lastbrowser-Terminal wird `sidekick` als globale PowerShell-Funktion hinterlegt (`function global:sidekick { & "$env:LASTBROWSER_PYTHON_EXE" -m sidekick_cli.main @args }`), sodass alle 38+ CLI-Befehle direkt auf der Konsole ausführbar sind.
3. **1-Klick-Buttons für administrative Operationen:**
   - [x] Quick-Buttons für `doctor`, `status`, `help` im Native Terminal UI.

### 7.4 Multi-Platform Messaging Gateway Daemon – Hintergrunddienst & UI [x] (Umgesetzt)
1. **Lifecycle Management im Electron Main Process (`services.ts`):**
   - [x] Registrierung des Gateway-Runners (`services.startGateway()`, `services.stopGateway()`, `services.restartGateway()`, `services.getGatewayStatus()`).
   - [x] Sauberes Beenden beim App-Quit.
2. **Natives Gateway-Kontrollpanel (`IntegrationPanels.tsx` / `NativeGatewayMain`):**
   - [x] Übersicht aller Messenger-Plattformen als Status-Kacheln (Telegram, WhatsApp, Signal, Discord, Slack, Matrix, BlueBubbles, Home Assistant, Email).
   - [x] Status pro Plattform & Gateway-Laufzeitstatus (PID, Fehler, Start-/Stopp-/Restart-Aktionen).
   - [x] Anleitung für interaktives Setup (`sidekick gateway setup`).
3. **Windows System Tray & 24/7 Betrieb (`tray.ts`):**
   - [x] Windows System Tray mit Kontextmenü (Lastbrowser öffnen, Service/Gateway Status & Toggles, Beenden).
   - [x] Minimize-to-Tray beim Schließen des Fensters (`setupMinimizeToTray`), damit der Agent und Gateway 24/7 erreichbar bleiben.

---

## 4b. Spezifikation Phase 8: WebExtensions / Addon-Support (Manifest V3) [x] (Umgesetzt v0.1.29)

### 8.1 Zero-Dependency CRX3 & ZIP Extraktions-Engine (`extensions.ts`) [x]
1. **CRX3 / CRX2 Header-Parser:**
   - [x] Parsing von `Cr24` Magic, Version 3/2 und dynamischem Header-Offset ohne Drittanbieter-NPM-Pakete (rein über Node.js `node:zlib` und `node:fs`).
   - [x] Schutz vor Directory-Traversal (`..` Pfade werden automatisch neutralisiert).
2. **Direkter Download aus dem Chrome Web Store:**
   - [x] Unterstützung von 32-Zeichen CWS-IDs und URLs (`chromewebstore.google.com/detail/...`).
   - [x] Direkter Download des CRX3-Pakets über Googles offizielle Update-API.

### 8.2 Kuratierter 1-Klick-Store & Unpacked-Modus [x]
1. **1-Klick-Store Presets:**
   - [x] **Dark Reader** (Automatischer Dark Mode für jede Webseite)
   - [x] **uBlock Origin Lite** (Manifest V3 DeclarativeNetRequest Blocker)
   - [x] **Bitwarden** (Open-Source Passwort-Manager)
   - [x] **ClearURLs** (Anti-Tracking URL-Cleaner)
   - [x] **Violentmonkey** (Userscript Manager)
2. **Unpacked-Modus für Entwickler:**
   - [x] Nativer Ordnerauswahl-Dialog via Electron `dialog.showOpenDialog`.
   - [x] Validierung der `manifest.json`, Versionsauslese, Berechtigungs-Pills und Icon-Extraktion (Data-URL).

### 8.3 Session-Attachment, Incognito-Isolation & UI-Verwaltung [x]
1. **Electron Session Bindung:**
   - [x] Automatisches Einhängen bei `app.whenReady()` und `app.on('session-created')` für alle Profile (`persist:profile-*`).
   - [x] Content Scripts, DeclarativeNetRequest und Service-Worker laufen nahtlos in `<webview>` Gästen.
   - [x] Incognito-Isolation: Standardmäßig im privaten Modus deaktiviert, per Checkbox optional aktivierbar.
2. **Erweiterungs-Verwaltung:**
   - [x] Dedizierter Bereich **„Extensions & Add-ons“** in den Einstellungen (`SystemPanels.tsx`).
   - [x] Titelleisten-Button (`Puzzle`-Icon) für 1-Klick-Zugriff direkt aus dem Browser-Header.
   - [x] Enable/Disable Switch, Incognito-Toggle und Löschen mit Bestätigungsdialog.

---

## 5. Spezifikation Phase 9: Modernes UI-Redesign (Sidekick + Zen Browser Synthese) [x] (Umgesetzt v0.1.29)

### 9.1 Einklappbare vertikale Navigationsleiste (Collapsible Sidebar) [x]
Die bestehende **Ein- und Ausklappbarkeit der Lastbrowser-Sidebar bleibt als Kernfunktion erhalten** und wird durch drei intelligente Zustände aufgewertet:
1. **Zustand 1: Vollständig Ausgeklappt (~240px)** [x]
   - Zeigt Workspace-Dropdown (*„Sprint planning“* / *„Personal“*).
   - Kompaktes Pinned-App-Raster (3x2 oder 4x2).
   - Vertikale Liste aller offenen Tabs mit Favicon, Titel, Audio-Icon und Schließen-Button.
   - Unten: `+ New Tab` und Shortcut-Hinweis.
2. **Zustand 2: Kompakter Slim-Dock (48px – Sidekick-Stil)** [x]
   - Schmale Leiste nur mit Icons (Sidekick-Agent, Favicons der aktiven Tabs, Web-Apps, Settings).
   - Tooltips beim Drüberfahren (Hover-Preview).
   - Klick auf das Chevron/Toggle-Icon oder Shortcut (`Ctrl+B`) klappt die Sidebar auf.
3. **Zustand 3: Vollständig Verborgen (0px – Zen-Fokusmodus)** [x]
   - Maximaler Platz für die Webseite.
   - Einblenden durch Mausbewegung an den linken Bildschirmrand (Hover-Slide-In) oder Shortcut `Ctrl+B`.

### 9.2 Abschaffung der doppelten horizontalen Tab-Leiste [x]
- Die bisherige obere horizontale Tab-Leiste entfällt im modernen Modus vollständig zugunsten der vertikalen Tabs in der Sidebar.
- Der obere Bereich wird auf eine **ultra-flache, elegante Titelleiste (42px)** reduziert:
   - Links: Collapse-Toggle für die Sidebar, Navigation (Zurück, Vorwärts, Neu laden).
   - Mitte: Integrierte Adresszeile (Omnibox) mit Sicherheits-Badge und **Live-Statistiken** nach Sidekick-Vorbild (*„3,420 Ads blocked · 1.2 GB RAM saved“*).
   - Rechts: Find in Page, Downloads, GitHub Link, Sidekick Copilot Toggle Button, Fenstersteuerungen (Minimieren, Maximieren, Schließen).

### 9.3 Kompaktes Pinned-App-Raster (Zen-Stil) [x]
- Direkt unter dem Workspace-Dropdown in der Sidebar befindet sich ein **kompaktes Icon-Raster** für angepinnte Dauerdienste (z. B. Notion, Figma, Trello, Slack, Netflix, Jira, Miro, + Add).
- Spart gegenüber langen vertikalen Zeilen massiv Platz ein und ermöglicht schnellen 1-Klick-Wechsel zwischen Arbeits-Apps.

### 9.4 Zentrales Dashboard & Startseite (Sidekick-Vorbild) [x]
- Wenn ein neuer Tab geöffnet wird, erscheint ein atmosphärisches, aufgeräumtes Dashboard mit Uhrzeit, Datumsanzeige, Such-/Prompt-Eingabe und Favoriten-Kacheln.

### 9.5 70/30 Split-View statt „Drei-Spalten-Einklemmung“ [x]
- **Web-Surfen:** 100 % Breite für den Web-Inhalt (bei geschlossener Copilot-Ansicht).
- **Mit Sidekick Copilot:** Sauberer **70/30 Split-View** (70 % Webseite links, 30 % Sidekick AI Copilot rechts mit Code-Highlighting, Copy-Buttons, Modell-Auswahl und Prompt-Eingabe).

---

## 6. Spezifikation Phase 10: Agentic Browsing & Deep Tab Intelligence (Comet-Parität)

Aus der Architektur des Perplexity Comet Browsers werden gezielt jene Kernfeatures übernommen, die Lastbrowser zu einer vollwertigen agentischen Recherche- und Automatisierungs-Workstation machen – unter Beibehaltung von Lastbrowsers Local-First- und Multi-Modell-Prinzipien (kein Cloud-Lock-in, kein Widget-Bloat):

### 10.1 Cross-Tab Context Synthesis („Chat mit deinen Tabs“ / `@tabs`) [x] (Umgesetzt v0.1.29)
1. **Multi-Tab Kontext-Erfassung:**
   - [x] Im Sidekick Copilot steht ein Quick-Action-Chip oder das Präfix `@tabs` / `@tab:N` zur Verfügung (z. B. *„@tabs Vergleiche die Preise und Stornobedingungen der drei Hotel-Seiten in einer Tabelle“*).
   - [x] Der Electron-Prozess extrahiert den sichtbaren Text und die semantische Struktur aller im aktuellen Workspace aktiven Tabs (via Live-Webview `executeJavaScript` oder Background-Fetch).
2. **Intelligentes Chunking & Token-Management:**
   - [x] Automatisches Trimming von Boilerplate (Navigation, Footer, Scripts, Tracking) und Token-Budgetierung (z. B. 4.000 Zeichen/1.000 Tokens pro Tab, 12.000 Tokens Gesamtbudget).
   - [x] HTML-Table-to-Markdown-Konverter für Tabellenvergleiche.
   - [x] Ausgabe strukturierter `<context_tabs>`-XML-Blöcke und tabellarischer Reports direkt im Copilot.
   - [x] Interaktive, klickbare Zitat-Badges (`[Tab X: ...]`), die per Klick direkt den jeweiligen Tab fokussieren.

### 10.2 Visuelles In-Page Quell-Highlighting & Deep Linking (Grounding Anchors) [x] (Umgesetzt v0.1.29)
1. **Interaktive Quell-Zitate im Copilot:**
   - [x] Wenn Sidekick Antworten aus Webseiten-Inhalten generiert, werden Aussagen mit Zitat-Badges belegt (`[Tab X: ...]`).
   - [x] In `NativeRichText.tsx` und `CopilotSplitView.tsx` werden Zitate mit `data-snippet` versehen und als interaktive Badges gerendert.
2. **Direct-Jump mit visueller Hervorhebung:**
   - [x] Klick auf das Zitat springt automatisch zum entsprechenden Tab (`jumpToTabAnchor`).
   - [x] Leichtgewichtiges Scroll- & Highlight-Script scrollt flüssig zur Fundstelle (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) und hebt den Treffer für 2 Sekunden mit einer leuchtenden Cyan-Aura (`0 0 24px rgba(56, 189, 248, 0.5)`) hervor.
   - [x] `window.find()` und `findInPage` als nahtlose Fallbacks.

### 10.3 Live Webview CDP-Automatisierung (Autonomer Formular- & Klick-Assistent) [x] (Umgesetzt v0.1.29)
1. **Direkte Kopplung von Sidekicks CDP-Tools an die sichtbare Webview:**
   - [x] Bereitstellung von Chromium Remote-Debugging-Port (`DEFAULT_CDP_PORT = 9222`, konfigurierbar via `LASTBROWSER_CDP_PORT` oder `--remote-debugging-port`).
   - [x] Automatische Injektion von `BROWSER_CDP_URL` und `LASTBROWSER_CDP_PORT` in die Sidecar-Umgebung von Sidekick (`buildSidecarEnvironment`), sodass Sidekicks `browser_cdp_tool.py` und `browser_tool.py` direkt an die Webview ankoppeln.
   - [x] IPC-Brücke (`lastbrowser:cdp:status`, `lastbrowser:cdp:execute`) für DevTools-Targets und Guest-Webview-Inspektion.
2. **Visuelle Interaktionsmarker & Human-in-the-Loop:**
   - [x] Injektion animierter Zielpunkt-Glow-Marker (`#lastbrowser-visual-beacon`) mit pulsierendem Ring (`lbBeaconPulse`), Cyan-Aura und Aktions-Badges für Klick-, Formularausfüll- und Scroll-Vorgänge (`live-automation.ts`).
   - [x] Automatisches Entdecken und Auslesen aller Formularfelder (`discoverActiveForm`) und Pagination-Erkennung (`triggerLivePagination`).
   - [x] Schwebendes Status-Banner (`LiveAutomationBanner.tsx`) mit aktiver Schrittanzeige.
   - [x] Volle Nutzerkontrolle: Jederzeit sofort unterbrechbar durch Drücken von `Esc` oder Klick auf „Abbrechen“ (`abortLiveAutomation`).

### 10.4 Natural Language Tab- & Workspace-Management & Tool-Calling [x] (Umgesetzt v0.1.29)
1. **Browser-Operationen per Befehl & Shortcuts:**
   - [x] Bereitstellung von Zustand-Store-Operationen (`useTabStore`, `usePanelStore`) für smarte Tab-Verwaltung:
     - `closeDuplicateTabs()`: Schließt alle redundanten/doppelten Tabs und schützt angeheftete Tabs bevorzugt.
     - `sortTabsByDomain()`: Gruppiert offene Tabs alphabetisch nach Hostname (ohne www-Präfix).
     - `closeUnpinnedTabs()`: Schließt alle nicht angepinnten Tabs mit einem Klick.
     - `closeTabsToTheRight(id)`: Schließt alle Tabs rechts vom gewählten Tab.
2. **Verfügbarkeit in der Universal Command Palette (`Ctrl+K` / `Cmd+K`):**
   - [x] Spotlight-/Raycast-Overlay (`CommandPalette.tsx`) mit globalem Shortcut-Interceptor (überwindet `<webview>` Guest-Focus-Traps).
   - [x] Sofortiges Filtern und Ausführen aller Sidekick-Befehle (> Doctor, > Supermemory, > Profil wechseln, > Modell wechseln), Tab-Aktionen und Navigation.
   - [x] Direkte Aktionen für *„Lesezeichen-Ordner aus Tabs erstellen“* und *„Tabs in neuem Workspace bündeln“*.
3. **Natural Language Parser & Local Tool-Calling Execution:**
   - [x] Mehrsprachiger Intent-Parser (`parseNaturalLanguageBrowserCommand`) für deutsche und englische Anweisungen (*„schließe alle doppelten tabs“*, *„sortiere tabs nach domain“*, *„mach mir einen lesezeichen-ordner aus allen tabs“*, *„bündle tabs in neuem workspace“*, *„welche tabs sind offen?“*).
   - [x] Zero-Latency Local Fast-Path in `startNativeChat` (<10ms Antwortzeit ohne Netzwerk-Roundtrip und ohne Token-Kosten).
   - [x] OpenAI- & Gemini-kompatibles Function Calling Tool-Schema (`BROWSER_AGENT_TOOLS_SCHEMA`) zur autonomen Browser-Steuerung durch LLM-Agenten.

### 10.5 Kontextuelle Quick-Action-Chips in Omnibox & Header [x] (Umgesetzt v0.1.29)
1. **Seitenspezifische 1-Klick-Aktionen:**
   - [x] In der flachen Titelleiste (`ModernTitlebar`) neben der URL sowie im Copilot-Header erscheinen je nach Seitentyp intelligente Aktions-Chips:
     - Bei News/Artikeln: `⚡ TL;DR` · `⚖️ Gegenargumente`
     - Bei Tabellen/Preisen/Shop: `📊 Tabellen exportieren` · `⚡ TL;DR`
     - Bei Repositories/Docs: `💻 Code extrahieren` · `⚡ TL;DR`
   - [x] 1 Klick übergibt den gefilterten DOM-Ausschnitt im strukturierten `<context_tabs>`-Format mit passendem Prompt sofort an den Sidekick Copilot.

### 10.6 Datenschutz & Local-First Guardrails (CometJacking Prevention) [x] (Umgesetzt v0.1.29)
1. **Keine unbemerkte Cloud-Exfiltration:**
   - [x] Anders als bei Comet fließen Tab-Inhalte niemals automatisch an einen Cloud-Provider, sondern ausschließlich lokal verarbeitet in die vom Nutzer explizit autorisierte Session.
2. **Prompt-Injection & CometJacking Schutz:**
   - [x] Bereinigung unsichtbarer Zero-Width- und bidirektionaler Steuerzeichen (`\u200B`, `\uFEFF`, etc.), die für Prompt-Injection-Bypasses genutzt werden.
   - [x] Neutralisierung bekannter Prompt-Injection-Vektoren (*„ignore previous instructions“*, *„system prompt override“*, *„exfiltrate“*, *„developer mode“*, etc.) durch Schutzmaskierung `[⚠️ Guardrail: Untrusted instruction block sanitized]`.
   - [x] Striktes Sandboxing von Web-DOM-Inhalten.

---

## 7. Checkliste für umsetzende Agenten

Jeder nachfolgende Agent arbeitet nach folgenden Regeln:

1. **Ein Fokus pro Durchlauf:** Genau einen Teilbereich (z. B. 7.1, 7.2, 9.1, 9.2 oder 10.1) bearbeiten.
2. **Einklappbarkeit bewahren:** Die Ein-/Ausklapp-Logik der Sidebar niemals entfernen, sondern auf die 3 definierten Modi (Expanded, 48px Slim, Hidden) optimieren.
3. **Keine Regressionen:** Nach jeder Änderung `npm run test:run` ausführen; alle bestehenden 322+ Tests müssen grün bleiben.
4. **Unit-Tests für neue UI-Logik:** Neue Komponenten und Store-Zustände in `tests/` mit Vitest abdecken.
5. **Typensicherheit:** `npm run build` (`build:main` und `build:renderer`) müssen 0 TypeScript- und Vite-Fehler aufweisen.
6. **Dokumentenpflege:** Nach erfolgreicher Umsetzung den Haken in diesem Zielbild (`[x]`) und im Backlog setzen.


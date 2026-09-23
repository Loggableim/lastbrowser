# Lastbrowser & Nova AI – Zukünftiges Zielbild & Innovations-Roadmap (v2.0+)

> Dieses Dokument definiert die strategischen Meilensteine und zukünftigen Feature-Horizonte für Lastbrowser nach Abschluss der v0.1.31-Basis. Es dient allen Mitwirkenden und autonomen KI-Agenten als strukturierte Leitlinie für Architektur, Priorisierung und User Experience.

---

## 1. Prioritäten-Matrix im Überblick

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              STRATEGISCHE PRIORITÄTEN-MATRIX                           │
├──────────────┬─────────────────────────────────────────────────┬───────────────────────┤
│ PRIORITÄT    │ MEILENSTEIN-BEREICH                             │ KERNZIEL              │
├──────────────┼─────────────────────────────────────────────────┼───────────────────────┤
│ **PRIO 1**   │ **Nova Teamwork (Multi-Agenten-System)**        │ 3-Stufen-Architektur  │
│ **PRIO 2**   │ **Advanced Power-Browsing & Ergonomie**         │ Splitscreen, Workspaces│
│ **PRIO 3**   │ **Agentic Automation & Voice Intelligence**     │ Auto-Pilot, Live-Voice│
│ **PRIO 4**   │ **Local-First Souveränität & Zero-Cloud Sync**  │ P2P Sync, Offline-Hub │
└──────────────┴─────────────────────────────────────────────────┴───────────────────────┘
```

---

## 2. Priorität 1: Nova Teamwork (Die 3 Stufen der Multi-Agenten-Orchestrierung)

Das Teamwork-System überträgt das Konzept autonomer Entwickler- und Recherche-Teams (inspiriert von Google Antigravity Teamwork) nativ in den Browser.

### Stufe 1: Deep Research Team (Nova Sidebar)
* **Ziel:** Paralleles, mehrstufiges Forschen über Tab- und Webgrenzen hinweg ohne Blockierung des Nutzers.
* **Architektur:**
  - **1. Lead Orchestrator (Nova Core):** Analysiert den Prompt, identifiziert Unklarheiten und zerlegt die Aufgabe in 3–5 Teilmeilensteine.
  - **2. Parallele Worker-Agenten (Web Scraper & Analyst):** Bis zu 3 Sub-Agenten scannen gleichzeitig geöffnete Tabs und externe Quellen (Brave Search / Fetch).
  - **3. Adversarial Reviewer (Faktenprüfer & Kritiker):** Prüft die Fundstellen unabhängig gegen Halluzinationen, validiert Zahlen und erzwingt saubere Quellen-Zitate (`[Tab 1]`, `[Quelle B]`).
* **UI-Integration:** Modus-Umschalter im Chat: `[ ⚡ Schnell-Chat ]` vs. `[ 👥 Nova Teamwork / Deep Mode ]` mit sichtbarem Milestone-Tracker.
* **Token-Superkraft:** Ausnutzung des bestehenden **Gemini CLI Multi-Account Round-Robins**, um die parallelen Anfragen der Worker ohne Quota-Limits (HTTP 429) über mehrere Google-Accounts zu verteilen.

### Stufe 2: Visuelle Kanban-Integration & Task-Board
* **Ziel:** Transparente Echtzeit-Verfolgung der Agenten-Aktivitäten im nativen Kanban-Board (`panels/KanbanPanel.tsx`).
* **Architektur:**
  - Subtasks des Agenten-Teams werden live als Karten in die Spalten geschoben:
    `Backlog` &rarr; `In Recherche` &rarr; `Verifikation & Review` &rarr; `Abgeschlossen`.
  - Jede Karte enthält: Zuständiger Agent, verarbeitete URLs, gefundene Daten-Snippets und Latenz.
  - Nutzer kann direkt intervenieren: Karten per Drag & Drop priorisieren, abbrechen oder Notizen hinzufügen.

### Stufe 3: Full Teamwork mit MCP & Autonomen CDP-Workers
* **Ziel:** Vollwertige System- und Toolchain-Orchestrierung über das Model Context Protocol (MCP) und Chrome DevTools Protocol (CDP).
* **Architektur:**
  - **Spezialisierte Worker-Rollen mit MCP-Skills:**
    - *Code-Worker:* Nutzt Filesystem- & GitHub-MCP zur automatischen Fehlerbehebung oder Patch-Generierung.
    - *Daten-Worker:* Nutzt SQLite- & Tabellen-MCP zur direkten Befüllung lokaler Datenbanken.
  - **Autonome Background Webviews:** Worker-Agenten können im Hintergrund isolierte Webview-Instanzen öffnen, JavaScript ausführen und Daten extrahieren, ohne den aktiven Tab des Nutzers zu stören.
  - **Human-in-the-Loop Gateways:** Vor kritischen System- oder Web-Aktionen (z. B. Formular absenden, Datei überschreiben) pausiert der jeweilige Worker und blendet einen Genehmigungs-Dialog ein.

---

## 3. Priorität 2: Advanced Power-Browsing & Desktop-Ergonomie

Funktionen, die Lastbrowser zum produktivsten und ergonomischsten Browser auf Windows machen:

### 2.1 Multi-Tab Splitscreen per Drag & Drop (bis zu 4 Tabs)
* **Konzept:** Ziehen eines Tabs aus der vertikalen Sidebar direkt auf die aktive Webseite oder einen anderen Tab öffnet einen geteilten Viewport.
* **Layout-Modi:**
  - **2 Tabs:** 50/50 Split (vertikal oder horizontal) mit verstellbarem Trennbalken.
  - **3 Tabs:** 1 Hauptansicht links (66%), 2 gestapelte Ansichten rechts (je 33%) – ideal für Recherchen mit Vergleichs-Tabs.
  - **4 Tabs:** 2x2 Kachel-Grid für Monitoring, Dashboards oder parallele Entwicklungs-Webviews.
* **Synchrones Scrollen (Optional):** Zuschaltbares gekoppeltes Scrollen für Vorher-/Nachher-Vergleiche oder Übersetzungen.

### 2.2 Intelligente Tab-Bündelung & KI-Workspaces
* **Auto-Topic Clustering:** Nova erkennt thematische Zusammenhänge offener Tabs (z. B. *„Kaufberatung Grafikkarten“*, *„Urlaubsplanung Portugal“*, *„Lastbrowser GitHub Issues“*) und schlägt 1-Klick-Tab-Gruppen vor.
* **Smart Tab Stashing & RAM-Schlafmodus:** Inaktive Gruppen werden mit einem Klick eingefroren und in eine schlanke Markdown-Sitzungsdatei ausgelagert. Spart Gigabytes an RAM und hält den Browser blitzschnell.

### 2.3 Persistente In-Page Annotationen & Ghost Highlighting
* **Web-Marker:** Textpassagen auf beliebigen Webseiten mit der Maus markieren und farbig hervorheben (Gelb, Cyan, Magenta).
* **Lokale Persistenz:** Die Hervorhebungen und Notizen bleiben lokal in `sqlite` gespeichert und werden beim erneuten Aufruf der URL automatisch wieder über das DOM gelegt.
* **Supermemory-Sync:** Jedes Highlight fließt automatisch in das persönliche Wissensnetzwerk von Nova AI ein.

---

## 4. Priorität 3: Agentic Automation & Next-Gen Interaktion

### 3.1 Autonomer Web-Autopilot mit CDP
* **Mehrschrittige Formular- & Workflow-Automation:**
  - *„Lade die letzten 3 Rechnungen von Anbieter X herunter und lege sie im Ordner Rechnungen ab.“*
  - *„Fülle dieses Bewerbungsformular mit den Daten aus meinem hinterlegten Profil aus.“*
* **Sicherheits-Beacon:** Optische Hervorhebung jedes Klicks und Eingabefelds mit animierten Zielmarkern und Abbruchmöglichkeit per `Esc`.

### 3.2 Live Audio & Voice Copilot (Gemini Live API)
* **Bidirektionales Sprach-Surfen:**
  - Freihändiges Steuern und Erfragen von Inhalten über das Mikrofon mit extrem geringer Latenz (<500ms via Gemini Live WebSocket API).
  - Befehle wie: *„Lies mir die Zusammenfassung vor“*, *„Scrolle nach unten zur Preistabelle“*, *„Öffne den zweiten Link aus dem Artikel“*.

### 3.3 Visual Screen & Video Intelligence
* **Optische Screenshot-Analyse:**
  - Tastenkombination `Ctrl+Shift+S` für einen rechteckigen Snipping-Ausschnitt, der direkt an Nova AI übergeben wird.
  - Analyse von Diagrammen, Infografiken, komplexen Web-Apps (Figma, Canva) oder Fehler-Popups.
* **YouTube & Video Deep-Search:**
  - Automatisches Auslesen und Durchsuchen von Video-Transkripten mit Sprungmarken direkt zur relevanten Sekunde im Video-Player.

---

## 5. Priorität 4: Datenschutz, Souveränität & Zero-Cloud Sync

### 4.1 Vollständiger Offline-Modus & Local-LLM Hub (Ollama / ONNX)
* **Air-Gapped Browsing:** Ein Modus, in dem Lastbrowser garantiert keine externen Netzwerkverbindungen für KI-Aufgaben öffnet.
* **1-Klick Ollama-Verwaltung:** Herunterladen, Starten und Verwalten lokaler Open-Source-Modelle (`llama3.2`, `deepseek-r1:8b`, `qwen2.5-coder`, `nomic-embed-text`) direkt aus dem Einstellungs-Panel.

### 4.2 Verschlüsselter P2P-Sync (Zero-Cloud)
* **Geräte-Synchronisation ohne fremde Server:**
  - Abgleich von Lesezeichen, Einstellungen, Workspaces und Pinned Apps zwischen mehreren PCs über verschlüsselte Peer-to-Peer-Verbindungen (WebRTC / lokales Netzwerk / Tailscale).
  - Kein Account-Zwang, keine Speicherung auf Lastbrowser- oder Cloud-Servern.

### 4.3 Content Shield & Smart Reader Mode
* **Anti-Clutter Engine:**
  - Bereinigung von Cookie-Bannern, Paywall-Overlays, aggressiven Popups und animierter Werbung über native Rust-/WASM-Filterlisten.
  - Eleganter Reader Mode mit anpassbarer Typografie, Zeilenbreite und automatischem Inhaltsverzeichnis (TOC).

---

## 6. Umsetzungs-Reihenfolge & Roadmap-Phasen

| Phase | Fokus | Kern-Deliverables | Status |
| :--- | :--- | :--- | :---: |
| **Phase 15** | **Nova Teamwork Stufe 1** | Deep Research Multi-Agent (Lead + 2 Worker + Reviewer) in Sidebar | 🟡 Geplant (Start) |
| **Phase 16** | **Power Splitscreen & Zen Polish** | 2–4 Tab Splitscreen Drag & Drop, Zen Omnibox Autohide | ⚪ Ausstehend |
| **Phase 17** | **Nova Teamwork Stufe 2 & 3** | Kanban Task-Board Live-Verdrahtung, MCP-Worker & Background Webviews | ⚪ Ausstehend |
| **Phase 18** | **Voice & Vision Intelligence** | Gemini Live Audio Streaming & Visual Screenshot Snipping Tool | ⚪ Ausstehend |
| **Phase 19** | **Local Sovereignty & P2P Sync** | Integrierter Ollama Hub & verschlüsselter Local-First Geräte-Sync | ⚪ Ausstehend |

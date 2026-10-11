# Analyse der Chat-Anbindung im Original-Sidekick (Hermes-Fork)

**Auftrag:** A-014 – Chat-Anbindung im Original-Sidekick (Hermes-Fork) analysieren  
**Bearbeiter:** `antigravity-worker-8`  
**Datum:** 2026-10-11  
**Status:** Abgeschlossen  
**Branch:** `codex/a-014-sidekick-chat-20261010`  
**Basis:** `origin/codex/lastbrowser-electron-shell`  
**Quellverzeichnis:** `services/sidekick/` (in-tree Sidekick-Backend-Engine und Original-WebUI)

---

## 1. Einleitung & Zielsetzung

Im Rahmen des übergeordneten Programms *„Chat verbessern“* (Aufträge A-014 bis A-017) dient diese Analyse der systematischen Untersuchung der Chat-Architektur des ursprünglichen Sidekick-Agenten (Hermes-Fork). Ziel ist es, die Architektur, Mechanismen und Stärken des Sidekick-Chats im Detail zu dokumentieren, um als fundierte Entscheidungsgrundlage für die Portierung und Sanierung des Chats in **Lastbrowser** zu dienen.

---

## 2. Nachrichtenfluss: UI → Backend → Modell → UI

Der Nachrichtenfluss im Sidekick ist als vollständig asynchrones, zustandsbehaftetes Modell realisiert, das Entkopplung zwischen HTTP-Client, Backend-Worker und LLM-Inferenz gewährleistet.

```
┌──────────────┐                  ┌───────────────────┐                  ┌──────────────────┐
│   Frontend   │                  │  Sidekick Backend │                  │   LLM Provider   │
│ (WebUI / JS) │                  │ (FastAPI/Worker)  │                  │ (OpenAI/Anth/..) │
└──────┬───────┘                  └─────────┬─────────┘                  └────────┬─────────┘
       │                                    │                                     │
       │ 1. POST /api/chat/start            │                                     │
       │───────────────────────────────────>│                                     │
       │    (prompt, session_id, model,     │ 2. Worker-Thread & Queue            │
       │     attachments, mode)             │    generiert stream_id              │
       │                                    │                                     │
       │ 3. 200 OK {stream_id: "..."}       │                                     │
       │<───────────────────────────────────│                                     │
       │                                    │                                     │
       │ 4. GET /api/chat/stream?stream_id  │                                     │
       │───────────────────────────────────>│                                     │
       │    (SSE EventSource)               │ 5. Asynchroner Modellaufruf         │
       │                                    │────────────────────────────────────>│
       │                                    │    (Streaming API Request)          │
       │                                    │                                     │
       │                                    │ 6. Token / Thinking Deltas          │
       │                                    │<────────────────────────────────────│
       │ 7. SSE: event: delta               │                                     │
       │    SSE: event: reasoning_delta     │                                     │
       │<───────────────────────────────────│                                     │
       │                                    │ 7a. Tool-Call erkannt               │
       │ 8. SSE: event: tool_start          │<────────────────────────────────────│
       │<───────────────────────────────────│                                     │
       │                                    │ 7b. Tool Execution (lokal)          │
       │ 9. SSE: event: tool_result         │                                     │
       │<───────────────────────────────────│                                     │
       │                                    │ 7c. Folgeturn an Modell             │
       │                                    │────────────────────────────────────>│
       │ 10. SSE: event: complete           │                                     │
       │<───────────────────────────────────│                                     │
       │                                    │ 11. Background Task:                │
       │                                    │     Titel & Memory Sync             │
```

### 2.1 Initiierung: `POST /api/chat/start`
- **Frontend (`messages.js:send()`):** Sendet Prompt, `session_id`, `model`, `model_provider`, `profile`, `mode` (`action` | `chat`), `chat_mode`, optionale Upload-Referenzen (`attachments`) und Feature-Flags.
- **Backend (`web/api/routes.py` & `web/api/streaming.py`):**
  - Validiert Sitzungs- und Profilberechtigungen.
  - Initialisiert einen persistenten Worker-Stream mit eindeutiger `stream_id` (`str(uuid.uuid4())`).
  - Legt den anfänglichen Nutzer-Turn im Sitzungsjournal ab (`_materialize_pending_user_turn_before_error`).
  - Gibt sofort `200 OK` mit `{"stream_id": stream_id, "effective_model": ...}` zurück (Dauer: < 15 ms). Dadurch bleibt das UI blockierungsfrei.

### 2.2 Streaming-Transport: `GET /api/chat/stream` (SSE)
- Das Frontend öffnet einen `EventSource`-Stream auf `/api/chat/stream?stream_id=<id>`.
- **Ereignis-Typen (`_sse()` in `streaming.py`):**
  - `delta`: Fließender Textinhalt der Assistant-Antwort (`{"content": "..."}`).
  - `reasoning_delta`: Denkprozess / Chain-of-Thought (`<think>` oder native Reasoning-Tokens z. B. bei DeepSeek R1 / Kimi).
  - `tool_start`: Start eines Werkzeugaufrufs mit Name und parametrisierten Argumenten.
  - `tool_progress`: Zwischenmeldungen bei lang laufenden Werkzeugen.
  - `tool_result`: Rückgabewert des Werkzeugs (strukturiert oder formatiert).
  - `approval_required`: Signalisiert, dass ein destruktiver Tool-Aufruf eine menschliche Bestätigung erfordert.
  - `clarify`: Rückfrage des Agenten an den Nutzer während des Laufs.
  - `plan_proposed`: Entwurf eines mehrstufigen Handlungsplans.
  - `complete`: Finaler Abschluss des Chat-Turns mit bereinigtem Endstatus.
  - `error`: Strukturierte Fehlermeldung mit Fehlercode und Retryable-Flag.

### 2.3 Abbruch (Cancellation)
- **Frontend:** Klick auf den Stop-Button sendet `POST /api/chat/cancel` mit `{"stream_id": stream_id}`.
- **Backend (`cancel_stream()` in `streaming.py` & `run_agent.py`):**
  - Setzt ein Interrupt-Flag (`_cancel_requested = True`).
  - Erzwingt bei blockierten Sockets ein TCP-Force-Close (`_force_close_tcp_sockets`).
  - Schließt die Stream-Queue sauber ab, sodass verwaiste Hintergrundprozesse keine Ressourcen binden.
  - Speichert den bis zum Abbruch empfangenen Teiltext im Sitzungsverlauf, markiert als abgebrochen (`interrupted: true`).

### 2.4 Verbindungsabriss & Wiederaufnahme (Reconnection)
- Fällt die Netzwerkverbindung oder das SSE aus, schlägt die UI-Routine `_scheduleStreamReconnect()` an.
- Fragt `/api/chat/stream/status?stream_id=...` ab:
  - Ist der Stream noch `active`: Reconnect via SSE (`_openEventSource()`) mit Resume-Offset.
  - Ist der Stream bereits beendet: `_restoreSettledSession()` lädt den final persistierten Stand aus der Sitzungsdatenbank.

---

## 3. Sitzungen und Verlauf (Sessions & History)

### 3.1 Trennung von Kontext- und Display-Nachrichten
Ein herausragendes Kernkonzept im Sidekick ist die strikte Trennung zweier Nachrichtenströme:
1. **Context Messages (`context_messages`):** Die für das Sprachmodell formatierte Token-Sequenz. Enthält Systemprompts, Tool-Definitions, serialisierte Tool-Returns und komprimierte Historie.
2. **Display Messages (`messages`):** Der für das menschliche Auge aufbereitete Verlauf. Enthält Render-Metadaten, formatierte Tool-Karten, Zeitstempel, Status-Indikatoren und UI-spezifische Zitate.

### 3.2 Persistenz und Session-Speicherung
- Sitzungen liegen als JSON-/SQLite-Strukturen vor (`agent_sessions.py`, `turn_journal.py`).
- **Turn-Journaling:** Jeder Turn (User Prompt, Agent Deltas, Tool Calls, Tool Outputs, Final Assistant Response) wird atomar festgeschrieben. Ein Absturz des Servers während Turn 4 zerstört Turn 1 bis 3 nicht.

### 3.3 Automatische Titelerzeugung im Hintergrund
- Sobald der erste vollständige Austausch erfolgt ist, stößt `streaming.py` (`_run_background_title_update`) einen asynchronen Worker an.
- Ein separates kleines Hilfsmodell (Auxiliary Client, z. B. schnelles Flash- oder Local-Modell) generiert einen prägnanten Titel (3 bis 6 Wörter).
- Das Hauptgespräch wird dabei nicht verlangsamt. Nach Fertigstellung aktualisiert ein SSE- oder Polling-Event den Titel in der Seitenleiste.

---

## 4. Kontextaufbau & Gedächtnissystem

### 4.1 Systemprompt-Komposition (`runtime/prompt_builder.py`)
Der Systemprompt wird modular vor jedem API-Aufruf frisch aggregiert:
1. **Basis-Identität & SOUL.md:** Liest Werte, ethische Grenzen und Charaktermerkmale aus `SOUL.md`.
2. **Projekt-Richtlinien:** Durchsucht den aktuellen Arbeitsordner nach `SIDEKICK.md`, `AGENTS.md`, `CLAUDE.md` und `.cursorrules`.
3. **Environment Hints:** Erkennt OS (Windows/Linux/macOS), Terminal-Fähigkeiten, installierte Werkzeuge (Git, Node, Python, Docker).
4. **Skills Manifest:** Dynamische Auflistung aller im System registrierten Fähigkeiten mit Kurzbeschreibung und Aufruf-Syntax.
5. **Memory Context:** Injizierte Relevanzblöcke aus dem Gedächtnissystem.

### 4.2 Gedächtnissystem (`runtime/memory_manager.py` & `supermemory_engine.py`)
- **Episodisches Gedächtnis:** Protokolliert Ereignisse und Erkenntnisse aus vergangenen Sitzungen.
- **Semantisches / Fakten-Gedächtnis:** Speichert Nutzerpräferenzen, Projektvereinbarungen und dauerhafte Fakten.
- **Prefetching (`prefetch_all`):** Bereits beim Tippen des Prompts sucht ein Vektor-/Volltextindex nach thematisch passenden Erinnerungen.
- **Syncing (`sync_all`):** Nach Abschluss des Turns analysiert das System im Hintergrund, ob neue erinnerungswürdige Fakten entstanden sind.
- **Pre-Compression Hook (`on_pre_compress`):** Bevor der Kontext wegen Überschreitung des Kontextfensters gekürzt wird, extrahiert der Memory Manager wesentliche Erkenntnisse und rettet sie in die permanente Wissensbasis.

### 4.3 Kontext-Kompression (`runtime/context_compressor.py`)
- Nähert sich die Konversation dem Token-Limit des Zielmodells, greift der automatische Komprimierer:
  - Entfernt Roh-Outputs alter Tool-Aufrufe und ersetzt sie durch 1-Zeilen-Zusammenfassungen (`_summarize_tool_result`).
  - Entfernt Base64-Bildteile aus älteren Nachrichten (`_strip_image_parts_from_parts`).
  - Fasst ältere Dialogwechsel in einem kohärenten System-Zusammenfassungsblock zusammen.

---

## 5. Werkzeuge & Tool-Aufrufe (Tool Execution)

### 5.1 Werkzeug-Definitionen & Schema-Validierung (`model_tools.py`)
- Werkzeuge definieren JSON-Schemas für Parameter, Typen und Beschreibungen.
- **Typ-Koerzierung (`coerce_tool_args`):** Behebt häufige Modell-Fehlformatierungen (z. B. String `"123"` statt Integer `123`, JSON-Strings statt Objekte), bevor die Python-Funktion aufgerufen wird.

### 5.2 Sequenzielle vs. Nebenläufige Ausführung
- **Nebenläufig (`_execute_tool_calls_concurrent`):** Unabhängige Lese-Operationen (z. B. 4 parallele Datei-Inspektionen) werden über einen `ThreadPoolExecutor` parallel ausgeführt.
- **Sequenziell (`_execute_tool_calls_sequential`):** Mutierende oder voneinander abhängige Operationen (z. B. Datei schreiben und danach Test ausführen) werden strikt der Reihe nach verarbeitet.

### 5.3 Live Tool Cards im Chat
- Das Frontend rendert Werkzeuge nicht als rohen JSON-Text, sondern als interaktive Komponenten:
  - Status: Spinner bei Ausführung → grünes Häkchen bei Erfolg → rotes Kreuz bei Fehler.
  - Details sind ein- und ausklappbar (Collapsible Input/Output).
  - Code- und Dateidiffs werden mit Inline-Diff-View dargestellt.

### 5.4 Sicherheits-Leitplanken (`tool_guardrails.py`)
- Destruktive Aktionen (z. B. Löschen von Dateien, Beenden von Prozessen, Modifizieren sensibler Systembereiche) erfordern explizite Bestätigung (`approval_required`).
- Der Agent hält an und wartet auf die Nutzerentscheidung über `/api/chat/steer` oder den UI-Dialog.

---

## 6. Provider-Umschaltung & Fehlerbehandlung

### 6.1 Multi-Provider-Unterstützung (`runtime/providers.py` & Adapter)
- Sidekick besitzt native Adapter für:
  - **OpenAI / kompatible:** Standard REST/SSE mit Tool Calls.
  - **Anthropic Claude:** Native Messages API mit Input/Output Caching und Vision.
  - **Ollama / Local AI:** Lokale Inferenz mit OpenAI-Kompatibilität.
  - **DashScope / Qwen:** Spezielle Formatierungsanpassungen für Qwen-Modelle.
  - **Google Gemini:** Multimodale Strukturierung.

### 6.2 Credential Pool & Hot-Swapping (`runtime/credential_pool.py`)
- Unterstützt mehrere API-Keys pro Provider.
- Erkennt HTTP 429 (Rate Limit) oder HTTP 401/403:
  - Rotiert automatisch auf den nächsten verfügbaren Schlüssel im Pool (`_recover_with_credential_pool`).
  - Temporäre Ausfälle lösen einen exponentiellen Backoff aus.
  - Scheitert ein Provider komplett, kann auf einen konfigurierten Fallback-Provider (Failover) gewechselt werden.

---

## 7. Slash-Befehle, Skills, Anhänge & Formatierung

### 7.1 Slash-Befehle (`commands.js`)
- Clientseitige Erkennung von Kommandos:
  - `/plan`: Aktiviert den strukturierten Planungsmodus.
  - `/goal`: Setzt ein persistentes Arbeitsziel.
  - `/skin`: Wechselt Farb- und Oberflächen-Themes.
  - `/reasoning`: Schaltet Thinking-Stufen (Low/Med/High) um.

### 7.2 Skills-Katalog (`services/sidekick/skills/`)
- Fähigkeiten liegen als Markdown-Dateien mit YAML-Frontmatter vor.
- Enthält Beschreibungen, Aufrufregeln und Beispiele, die zur Laufzeit vom Modell selektiert werden können.

### 7.3 Datei- und Bildanhänge
- **Dateien:** Hochgeladene Dateien werden serverseitig zwischengespeichert und als Kontextreferenzen übergeben.
- **Bilder:** Werden entweder nativ als Base64-Vision-Payload übergeben oder bei Modellen ohne Vision über einen lokalen Bildbeschreibungs-Fallback vorverarbeitet.

### 7.4 Markdown- & Code-Darstellung
- Standardkonformes Markdown-Rendering via Markdown-Parser.
- Prism.js für Syntax-Highlighting aller gängigen Programmiersprachen.
- Copy-Buttons, Zeilennummern und differenzierte Darstellung von Gedankenblöcken (`reasoning-accordion`).

---

## 8. Funktionsmatrix des Sidekick-Chats

| Funktion | Dateien / Module | Abhängigkeiten | Reifegrad | Umfang |
| :--- | :--- | :--- | :--- | :--- |
| **Asynchroner Chat-Start (`/start`)** | `web/api/routes.py`, `streaming.py` | FastAPI, UUID, threading | **Stabil** | Mittel |
| **SSE Token- & Delta-Streaming** | `web/api/streaming.py`, `messages.js` | sse-starlette / native SSE | **Stabil** | Groß |
| **Reasoning-Stream (`<think>`)** | `run_agent.py`, `think_scrubber.py`, `ui.js` | Regex, Scrubber-Engine | **Stabil** | Mittel |
| **Tool Execution & Coercion** | `model_tools.py`, `run_agent.py` | JSONSchema, ThreadPool | **Stabil** | Groß |
| **Live Tool Cards im UI** | `web/static/messages.js`, `ui.js` | DOM, Event-Dispatcher | **Stabil** | Mittel |
| **Stream-Reconnect & Recovery** | `web/static/messages.js`, `routes.py` | EventSource, HTTP Status API | **Stabil** | Mittel |
| **Session Journal & History** | `agent_sessions.py`, `turn_journal.py` | SQLite / JSON | **Stabil** | Groß |
| **Background Titelerzeugung** | `web/api/streaming.py`, `title_generator.py` | Auxiliary LLM Client | **Stabil** | Klein |
| **Systemprompt & SOUL.md** | `runtime/prompt_builder.py`, `SOUL.md` | Pathlib, PyYAML | **Stabil** | Mittel |
| **Memory Manager & Supermemory** | `runtime/memory_manager.py`, `supermemory_engine.py` | SQLite, Vektorspeicher | **Stabil** | Groß |
| **Context Compression** | `runtime/context_compressor.py` | Token-Zähler, Heuristiken | **Stabil** | Mittel |
| **Credential-Pool & Rate-Guard** | `runtime/credential_pool.py`, `rate_limit_tracker.py` | Thread-Locks, Time | **Stabil** | Mittel |
| **Provider-Adapter (Multi-LLM)** | `runtime/anthropic_adapter.py`, `transports.py` | HTTP-Clients (httpx/requests) | **Stabil** | Groß |
| **Slash-Commands** | `web/static/commands.js` | RegExp, Event-Listener | **Halb fertig** | Klein |
| **Inline Diff & Patch-Apply** | `web/static/ui.js`, `web/api/routes.py` | Diff-Engine, Git | **Halb fertig** | Mittel |
| **Smart Track / Teamwork** | `smart_track_orchestrator.py`, `teamwork_orchestrator.py` | Async Queues, Quorum | **Prototyp** | Groß |

---

## 9. Stärken & Vorbilder vs. Altlasten

### 9.1 Was ist besonders gut gelöst und sollte Vorbild für Lastbrowser sein?
1. **Entkoppelter SSE-Lebenszyklus:** Der Start über `POST /api/chat/start` mit getrenntem `GET /api/chat/stream` verhindert blockierende HTTP-Requests und ermöglicht saubere Reconnects nach Netzwerkunterbrechungen oder Renderer-Reloads.
2. **Klares Token-Routing:** Die Trennung von regulären Text-Deltas (`delta`) und internen Reasoning-Tokens (`reasoning_delta`) stellt sicher, dass Denkprozesse sauber visualisiert werden, ohne den Antworttext zu verunreinigen.
3. **Strikte Trennung von Context und Display:** Context-Messages enthalten nur modellrelevante Daten (token-optimiert), während Display-Messages reiche UI-Zustände (Karten, Status, Fehler) speichern.
4. **Resilientes Tool-Calling:** Argument Coercion fängt typische Modellfehler robust ab, bevor Funktionen aufgerufen werden.
5. **Memory-Hooks vor Kompression:** Bevor alte Nachrichten dem Kontext-Limit zum Opfer fallen, werden Kernfakten ins Langzeitgedächtnis überführt.
6. **Hintergrund-Titelgenerierung:** Nutzt ein separates Hilfsmodell und hält den Haupt-Thread frei von Wartezeiten.

### 9.2 Was sind Altlasten, die NICHT mitportiert werden sollten?
1. **Monolithische Monster-Dateien:**
   - `services/sidekick/run_agent.py` umfasst über 15.500 Zeilen Code, in denen API-Clients, Prompt-Aufbau, Tool-Ausführung, Fallbacks und Socket-Tricks vermischt sind.
   - `services/sidekick/web/static/ui.js` umfasst über 7.000 Zeilen und `messages.js` über 2.500 Zeilen Vanilla-JS.
   - **Empfehlung für Lastbrowser:** Klare modulare Aufteilung im React 19 Frontend (Stores in Zustand, fokussierte UI-Komponenten) und saubere Service-Klassen im Python-Backend.
2. **Vermischung von CLI-, Gateway- und WebUI-Pfaden:** Im Sidekick existieren historische Shims für CLI-Terminals, Telegram-Bots und Discord-Gateways direkt in den Chat-Routen. In Lastbrowser sollte ausschließlich die fokussierte Electron-IPC- und Browser-API bedient werden.
3. **Fehlende Typisierung im Frontend:** Vanilla-JavaScript mit globalen `S`-Objekten und Ad-hoc-Window-Variablen führt zu schwer auffindbaren Regressionsfehlern. Lastbrowser nutzt striktes TypeScript.
4. **Komplexe, fehleranfällige Event-Loop-Schachtelungen:** Die parallele Nutzung von `asyncio`-Event-Loops, Hintergrund-Threads und synchronen HTTP-Handlern erfordert im Sidekick unzählige Sonderprüfungen (`_force_close_tcp_sockets`, `_cleanup_dead_connections`). Im Monorepo sollte ein einheitliches, asynchrones FastAPI-Muster genutzt werden.

---

## 10. Fazit & Empfehlung für Folgeauftrag A-017

Der Sidekick-Chat verfügt über eine hochgradig durchdachte funktionale Architektur (Streaming, State-Recovery, Tool-Karten, Context-Scrubbing, Memory), leidet jedoch unter monolithischer Code-Struktur und historischer Fragmentierung.

Für Lastbrowser ist die Kernarchitektur (das *„Wie es funktioniert“*) ein ideales Vorbild:
- Das Protokoll (`/api/chat/start` + SSE-Events `delta`, `reasoning_delta`, `tool_start`, `tool_result`, `complete`) sollte 1:1 beibehalten werden.
- Die Frontend-Implementierung sollte modern in TypeScript / React 19 Komponenten (`CopilotSplitView`, `NativeChatMain`, `useChatStore`) realisiert werden, anstatt alte DOM-Manipulations-Skripte zu portieren.
- Das Backend profitiert von der direkten Wiederverwendung der robusten Streaming- und Tool-Logik aus `services/sidekick/web/api/streaming.py` und `model_tools.py`, befreit von Altlasten.

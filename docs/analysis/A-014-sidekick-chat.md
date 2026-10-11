# Analyse A-014: Chat-Anbindung im Original-Sidekick (Hermes-Fork)

> **Auftrag:** A-014 (Programm „Chat verbessern“, Vorbereitung für A-015 bis A-017)  
> **Typ:** Analyse (nur lesen)  
> **Status:** Abgeschlossen  
> **Datum:** 2026-10-11  
> **Autor:** `antigravity-worker-8`  
> **Basis-Repository & Pfad:** `Loggableim/lastbrowser` (`services/sidekick/`, in-tree monorepo baseline v0.8.84, synchron zu `Loggableim/sidekick-agent` master)  
> **Referenz-Branch:** `codex/a-014-sidekick-chat-20261010`  

---

## 1. Einleitung & Zielsetzung

Der Gründer und Chef-Architekt (Cid) stellte fest, dass die Chat-Erfahrung in Lastbrowser hinter den Fähigkeiten und der Stabilität des ursprünglichen Sidekick-Agenten (Hermes-Fork) zurückbleibt.  
Ziel des Analyse- und Modernisierungsprogramms **A-014 bis A-017** ist es:
1. Die genaue Architektur, den Nachrichtenfluss und die Stärken des Sidekick-Chats zu dokumentieren (**A-014**, dieses Dokument).
2. Den Ist-Zustand und die Schwachstellen des aktuellen Lastbrowser-Renderer-Chats zu analysieren (**A-015**).
3. Ggf. externe Vorbilder zu evaluieren (**A-016**).
4. Einen modularen Portierungs- und Modernisierungsplan für Lastbrowser auszuarbeiten (**A-017**).

Diese Untersuchung stützt sich auf die im Monorepo enthaltene, maßgebliche Backend-Engine in `services/sidekick/` (inkl. `cli/web_server.py`, `web/api/`, `web/static/`, `runtime/`, `shared/` und `tools/`).

---

## 2. Detaillierter Ablauf & Architektur des Sidekick-Chats

### 2.1 Nachrichtenfluss: UI → Backend → Modell → UI

Der Chat im Sidekick basiert auf einem entkoppelten, zweistufigen Modell: **REST für die Request-Initialisierung** und **Server-Sent Events (SSE) für das Streaming**.

```
┌────────────────────────────────────────────────────────────────────────┐
│ UI (Composer / messages.js)                                            │
│ 1. send() validiert Prompt & Anhänge                                   │
│ 2. POST /api/chat/start  ────────────────────────────┐                 │
│ 3. Empfängt {stream_id, session_id}                  │                 │
│ 4. Öffnet GET /api/chat/stream?stream_id=... ◄───────┼────────┐        │
└──────────────────────────────────────────────────────┼────────┼────────┘
                                                       │        │
                                                       ▼        │
┌───────────────────────────────────────────────────────────────┼────────┐
│ Backend: FastAPI / routes.py                                  │        │
│ • _handle_chat_start: Validierung, Workspace-/Model-Auflösung │        │
│ • _start_chat_stream_for_session:                             │        │
│   - Speichert Pending-Turn (s.pending_user_message)          │        │
│   - Erstellt StreamChannel in STREAMS[stream_id]              │        │
│   - Startet Hintergrund-Worker-Thread (_run_agent_streaming)  │        │
│ • _handle_sse_stream: Schaltet SSE-Verbindung durch ──────────┘        │
└────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Worker-Thread: streaming.py (_run_agent_streaming)                     │
│ • Initialisiert AIAgent / LLM Provider Stream                          │
│ • SSE Event Dispatch:                                                  │
│   - token: Antworttext-Fragmente                                       │
│   - reasoning: Denkprozesse (<think> Blöcke)                          │
│   - tool: Start von Werkzeugen (live timer + args)                     │
│   - tool_complete: Ergebnis / Status                                  │
│   - clarify / approval: Interaktive Nutzerkarten                       │
│   - metering: Live-Tokenverbrauch & TPS (1 Hz Ticker)                  │
│   - stream_end: Fertigstellung & Session-Persistenz                    │
└────────────────────────────────────────────────────────────────────────┘
```

#### Schrittweise Ablauf-Chronologie:
1. **Absenden (`messages.js:send`)**:
   - Prüft, ob ein Turn aktiv ist (`S.busy`). Wenn ja, greift die konfigurierte `busy_input_mode`-Strategie (siehe Abschnitt 2.3).
   - Anhänge (`S.pendingFiles`) werden serialisiert (Base64 oder lokaler Upload-Pfad).
   - Bei aktivem Plan-Modus (`composerMode === 'plan'`) wird automatisch `/plan` vorangestellt.
2. **REST-Start (`routes.py:_handle_chat_start` & `_start_chat_stream_for_session`)**:
   - `session_id` und Workspace werden geprüft und auf den kanonischen Workspace aufgelöst.
   - Modell und Provider werden verifiziert (`_resolve_compatible_session_model_state`).
   - Die Nutzerofferte wird in `s.pending_user_message` zwischengespeichert.
   - Ein dedizierter In-Memory Event-Kanal (`create_stream_channel()`) wird in `STREAMS[stream_id]` registriert.
   - Ein Daemon-Thread (`threading.Thread(target=_run_agent_streaming)`) wird gestartet.
   - Der REST-Aufruf antwortet sofort mit HTTP 200 `{ "stream_id": stream_id, "session_id": session_id }`.
3. **SSE-Transport (`routes.py:_handle_sse_stream`)**:
   - Das Frontend öffnet `EventSource('/api/chat/stream?stream_id=...')`.
   - Das Backend sendet sofort ein initiales `heartbeat`-Event mit Laufzeit- und Altersdaten, um Timeouts von Proxies oder Browsern abzufangen.
   - Nachfolgende Events werden direkt aus der Queue des Threads gelesen und als SSE-Frames (`event: <type>\ndata: <json>\n\n`) übertragen.
4. **Modell-Ausführung (`streaming.py:_run_agent_streaming`)**:
   - Der `AIAgent` führt den LLM-Aufruf durch.
   - Registrierte Callbacks (`on_token`, `on_reasoning`, `on_tool`) schreiben synchron in die Stream-Queue `q`.
   - Bei Fertigstellung wird `stream_end` emittiert, die Session wird final serialisiert und gespeichert, und `active_stream_id` wird freigegeben.

---

### 2.2 Streaming, Token-Messung & Reasoning

- **Token-Streaming (`on_token` → `event: token`)**:
  - Emittiert inkrementell Textblöcke.
  - Das Frontend (`messages.js:_wireSSE`) hängt Text an `assistantText` an und rendert über `requestAnimationFrame` (`_scheduleRender`).
  - Ein animierter Cursor (`addStreamCursor`) visualisiert die laufende Generierung.
- **Reasoning / Denkvorgänge (`on_reasoning` → `event: reasoning`)**:
  - Modelle mit Reasoning (z. B. DeepSeek R1, OpenAI o1/o3, Qwen-Thinking) trennen Gedanken über `<think>`-Tags oder separate API-Felder.
  - Das Backend fängt Reasoning separat ab und spiegelt es in `STREAM_REASONING_TEXT`.
  - Das Frontend rendert eine eigene, zusammenklappbare **Thinking-Card** (`updateThinking`, `appendThinking`) oberhalb der Antwort.
  - Die Karte bleibt auch während nachfolgender Tool-Aufrufe sichtbar.
- **Echtzeit-Metering / Throughput (`metering`)**:
  - Ein Hintergrund-Ticker (`_metering_ticker` in `streaming.py`) emittiert mit 1 Hz (und maximal alle 100 ms bei schnellen Token-Strömen) Live-Statistiken:
    - Verbrauchte Prompt- und Completion-Tokens.
    - Kontextlänge und Restkapazität bis zum Kompressions-Schwellenwert.
    - Exakte Tokens pro Sekunde (TPS) basierend auf echten Callback-Deltas (keine Schätzung nach Zeichenlänge).

---

### 2.3 Abbruch (Cancel), Wiederaufnahme & Busy-Steuerung

Eines der herausragenden Features von Sidekick ist die **Verlustfreiheit bei Abbruch**:

1. **Abbruch-Signal (`routes.py:_handle_chat_cancel` → `streaming.py:cancel_stream`)**:
   - Setzt `cancel_event` im Thread und entfernt den Stream aus `STREAMS`.
   - **Kein Datenverlust:** Der bis zum Abbruch empfangene Text (`STREAM_PARTIAL_TEXT[stream_id]`) und die Gedanken (`STREAM_REASONING_TEXT[stream_id]`) werden nicht verworfen, sondern sofort als unvollständige Assistant-Nachricht in die Session-Historie geschrieben (`[abgebrochen]`).
2. **Busy-Input-Modi (`messages.js`)**:
   Wenn der Nutzer schreibt, während der Agent arbeitet, stehen drei konfigurierbare Modi zur Verfügung:
   - **`queue` (Standard):** Der neue Prompt wird in die clientseitige Session-Warteschlange eingereiht und nach `stream_end` automatisch gestartet. Ein Badge am Eingabefeld zeigt die Anzahl wartender Nachrichten.
   - **`interrupt` (bzw. `Ctrl+Enter`):** Der laufende Turn wird sofort abgebrochen (`cancel_stream`), die Teilantwort wird gesichert und der neue Prompt startet unverzüglich.
   - **`steer` (`/api/chat/steer`):** Der laufende Agent wird live über ein Steuerungssignal im Hintergrund instruiert (z. B. „Halt, ändere stattdessen Datei X“), ohne den bisherigen Arbeitsfortschritt oder Kontext komplett zu resetten.

---

### 2.4 Sitzungen & Persistenz (Sessions & History)

- **Datenmodell (`shared/sessions.py` & `web/api/models.py`)**:
  - Sitzungen besitzen eindeutige IDs (UUID4 oder Zeitstempel-Präfix).
  - Speicherung als JSON unter `~/.sidekick/state/webui/sessions/<session_id>.json` bzw. innerhalb isolierter Spaces unter `<space_root>/sessions/`.
  - JSON-Struktur enthält: `messages`, `context_messages`, `model`, `model_provider`, `workspace`, `profile`, `created_at`, `updated_at`, Token-Zähler und Metadaten.
- **Inflight-Schutz im Browser (`INFLIGHT`-Cache in `messages.js`)**:
  - Während eines aktiven Streams speichert das Frontend den aktuellen Stand fortlaufend in `localStorage`.
  - Bei versehentlichem Neuladen des Browserfensters oder Tab-Wechsel stellt `attachLiveStream` die Verbindung zur bestehenden `stream_id` wieder her, ohne dass die Antwort verloren geht oder doppelt gerendert wird.
- **Automatische Titelgenerierung (`title_generator.py`)**:
  - Nach dem ersten Turn generiert ein leichtgewichtiges Modell im Hintergrund einen kurzen, prägnanten Titel (3–5 Wörter) für die Session-Leiste.

---

### 2.5 Kontextaufbau: Systemprompt, SOUL.md & Gedächtnis

Die Kontext-Zusammenstellung erfolgt in `runtime/prompt_builder.py`:

1. **System-Prompt-Hierarchie**:
   - **Basis-Identität:** Rolle als intelligenter Entwickler-Assistent.
   - **Sicherheits- & Prompt-Injection-Filter:** `prompt_builder.py` scannt Kontextdateien (`AGENTS.md`, `.cursorrules`, `SOUL.md`) aktiv nach bösartigen Injection-Mustern, bevor sie in den Prompt eingebunden werden.
   - **`SOUL.md` (Nova-Persönlichkeit):**
     - Liegt im Projekt-Root bzw. Profil.
     - Definiert fundamentale Werte (*truthfulness*, *autonomy*, *continuity*, *respect*, *curiosity*), Grenzen und unveränderliche Sicherheitsregeln (*Never expose secrets*, *Never perform autonomous admin/payment/destructive actions*).
   - **Plattform- & Workspace-Kontext:** Aktuelles OS (Windows/Linux/macOS), Shell-Typ, Pfadregeln, Git-Status.
   - **Skills-Katalog:** Dynamischer kompakter Index aller verfügbaren und aktivierten Skills.
2. **Supermemory / Gedächtnis-Architektur**:
   - Dreistufiges Speichersystem (`runtime/supermemory_engine.py` & `runtime/memory/`):
     - **Episodisches Gedächtnis:** Automatische Extraktion von Fakten und Nutzerpräferenzen nach Sitzungsende.
     - **Vektor-Suche:** Semantische Suche über vergangene Konversationen und Projektnotizen (mittels lokaler Embeddings oder Cloud-Vektordatenbank).
     - **BM25 / Keyword-Suche:** Schneller Volltextindex über Dokumente und Code-Snippets.
3. **Automatische Kontext-Kompression (`runtime/context_compressor.py`)**:
   - Erkennt, wenn die Nachrichtenhistorie sich dem Token-Limit nähert.
   - Emittiert `event: compressing` an das Frontend.
   - Fasst ältere Konversationsrunden semantisch zusammen und behält dabei wichtige Systemanker und aktuelle Code-Snippets intakt.

---

### 2.6 Werkzeuge (Tool Calling) & Darstellung im Chat

Sidekick verfügt über rund 80 Werkzeuge in `services/sidekick/tools/`:

- **Werkzeug-Typen**:
  - **Dateisystem & Code:** `file_tools.py`, `file_operations.py`, `morph_apply.py` (präzise Unified-Diff- und AST-Patches).
  - **Terminal / Shell:** `terminal_tool.py` mit PTY-Emulation und Streaming von `stdout`/`stderr` via SSE.
  - **Browser / Computer Use:** `browser_tool.py`, `browser_cdp_tool.py` (CDP-Steuerung), `computer_use_tool.py` (Maus/Tastatur/Screenshots).
  - **MCP (Model Context Protocol):** Vollständiger Client für stdio- und SSE-basierte MCP-Server (`mcp_tool.py`, `mcp_stdio_proxy.py`).
  - **Interaktive Tools:**
    - `clarify_tool.py`: Erlaubt dem Modell, dem Nutzer eine strukturierte Multiple-Choice-Frage im Chat zu stellen. Der Stream wartet auf die Nutzerauswahl.
    - `approval.py`: Erfordert Nutzerfreigabe für destruktive Aktionen (z. B. `rm`, `git reset`, Zahlungen).
- **UI-Darstellung im Chat (`messages.js`)**:
  - Live-Tool-Card (`renderToolLiveCard`): Zeigt Werkzeugname, Parameter-Zusammenfassung, Lade-Spinner und einen auf die Zehntelsekunde genauen Live-Timer.
  - Nach Abschluss (`tool_complete`): Zustand wechselt auf grün/rot mit einklappbarem Auszug des Ergebnisses.

---

### 2.7 Provider-Umschaltung & Fehlerbehandlung

- **Provider-Vielfalt (`runtime/models.py`, `runtime/providers/`)**:
  - Nahtloser Wechsel zwischen:
    - **Lokal:** Ollama (inkl. Cloud-Endpunkte), LM Studio, vLLM.
    - **Cloud:** OpenAI (GPT-4o, o1, Codex), Anthropic (Claude 3.5 Sonnet), Google Gemini (Native SDK & OAuth), Groq, Alibaba DashScope, OpenRouter.
- **Fehlerklassifizierung & Self-Healing (`_classify_provider_error`)**:
  - Unterscheidet präzise zwischen Quota/Rate-Limits (HTTP 429), Auth-Fehlern (401/403), Kontextüberlauf (400) und Server-Down (500/503).
  - **Automatischer Failover:** Transiente Verbindungsfehler lösen bis zu 2 kontrollierte Retries mit Backoff aus (`retry_utils.py`). Bei Quota-Erschöpfung kann auf alternative konfigurierte Provider umgeschaltet werden.
  - **Credential-Rotation:** Bei Multi-Account-Setups (z. B. Antigravity/Gemini) wechselt der `credential_pool` automatisch zum nächsten gesunden Token.

---

### 2.8 Slash-Befehle, Skills & Multi-Modalität

- **Slash-Befehle (38 integrierte Befehle in `commands.js`)**:
  - `/model` (Modellwahl), `/clear` (Chat leeren), `/goal` (Ziel setzen/steuern), `/compact` (Kontext komprimieren), `/terminal` (Terminal öffnen), `/skills` (Skills verwalten), `/steer` (Laufende Aufgabe anpassen), `/mcp` (MCP-Server konfigurieren), `/yolo` (Sicherheitsabfragen temporär überspringen).
- **Skills-System (`skills/`)**:
  - Erweiterbare Fähigkeiten im `SKILL.md`-Format (Markdown mit YAML-Frontmatter für Metadaten und Aktivierungsbedingungen).
- **Multi-Modalität & Anhänge**:
  - Upload-Endpunkt `/api/upload` (`upload.py`).
  - Automatische Erkennung von Bildern (PNG, JPEG, WebP) und Dokumenten (PDF, Text, Markdown).
  - Vision-Fähigkeit: Automatische Übergabe als Base64-Data-URL an Vision-fähige Modelle.

---

### 2.9 Markdown- & Code-Darstellung

- **Streaming-Markdown:** Einsatz von `smd.min.js` (Streaming Markdown Parser), der unvollständige Markdown-Tags (z. B. offene Codeblöcke ` ``` `, nicht geschlossene Tabellen oder Links) während des Streamings stabil darstellt, ohne dass das Layout springt.
- **Syntax Highlighting:** Prism.js Autoloader mit über 40 Sprachen inklusive Shell, Python, TypeScript, Rust, JSON, SQL.
- **Mathematik & Diagramme:** Integriertes KaTeX für LaTeX-Formeln und Mermaid.js für Fluss- und Sequenzdiagramme.
- **Interaktive Code-Blöcke:** 1-Klick-Kopieren, Ausführen im integrierten Terminal (`run in terminal`), Diff-Vorschau.

---

## 3. Funktionsmatrix der Sidekick-Chat-Komponenten

| Funktion | Dateien / Module | Abhängigkeiten | Reifegrad | Umfang |
| :--- | :--- | :--- | :--- | :--- |
| **REST/SSE Chat Lifecycle** | `web/api/routes.py`, `web/api/streaming.py` | FastAPI, `queue`, `threading` | **Stabil** | Groß (~15k LOC) |
| **Client Streaming & Render** | `web/static/messages.js`, `smd.min.js` | Vanilla JS, DOM API, EventSource | **Stabil** | Groß (~210 KB) |
| **Reasoning / Thinking UI** | `web/api/streaming.py`, `messages.js` | DeepSeek/o1 API-Schema | **Stabil** | Mittel |
| **Verlustfreier Abbruch & Steer** | `web/api/streaming.py`, `routes.py`, `messages.js` | `threading.Event`, Session-Store | **Stabil** | Mittel |
| **Interaktive Rückfragen (Clarify)** | `web/api/clarify.py`, `tools/clarify_tool.py` | `threading.Event`, SSE Channel | **Stabil** | Mittel |
| **Sicherheits-Freigaben (Approval)** | `web/api/routes.py`, `tools/approval.py` | SSE Channel, Policy Rules | **Stabil** | Mittel |
| **Session- & Inflight-Persistenz** | `shared/sessions.py`, `web/api/models.py`, `messages.js` | JSON, `localStorage` | **Stabil** | Groß |
| **Kontext-Assemblierung & Prompt** | `runtime/prompt_builder.py`, `SOUL.md` | `pathlib`, Regex (Security Scan) | **Stabil** | Mittel (~1.400 LOC) |
| **Kontext-Kompression** | `runtime/context_compressor.py`, `compression_anchor.py` | LLM Tokenizer / Estimator | **Stabil** | Mittel |
| **Supermemory (3-Tier Vector)** | `runtime/supermemory_engine.py`, `memory/` | SQLite, Vector Embeddings, BM25 | **Stabil** | Groß |
| **Tool Execution & Registry** | `tools/registry.py`, `toolsets.py`, `run_agent.py` | Diverse System-APIs, MCP | **Stabil** | Groß (~80 Tools) |
| **Provider-Adapter & Failover** | `runtime/models.py`, `runtime/providers/*` | `httpx`, Client SDKs | **Stabil** | Groß |
| **Slash-Commands Engine** | `web/static/commands.js`, `runtime/skill_commands.py`| Command Dispatcher | **Stabil** | Mittel (38 Cmds) |
| **Multi-Modalität / Vision** | `web/api/upload.py`, `streaming.py` | `base64`, `mimetypes` | **Stabil** | Klein |
| **Terminal Integration** | `web/api/command_stream.py`, `tools/terminal_tool.py` | PTY / Subprocess, `xterm.js` | **Stabil** | Mittel |
| **Teamwork Multi-Agent Core** | `runtime/teamwork_orchestrator.py` | LLM Sub-Pipelines | **Halb fertig** | Groß |
| **Nova Autonomous Ticker / Needs** | `nova/entity_kernel.py`, `nova/needs.py` | State-Machine | **Prototyp** | Mittel |

---

## 4. Was ist besonders gut gelöst? (Vorbild für Lastbrowser)

Folgende Kernmerkmale des Sidekick sollten als Vorbild dienen und gezielt in den Lastbrowser-Renderer portiert werden:

1. **Robuster, verlustfreier Abbruch (`cancel_stream`)**:
   - Wenn der Nutzer den Stop-Button drückt, darf der bisher ausgegebene Text und das Denkprotokoll nicht aus dem Chat verschwinden. Sidekick sichert Teiltexte zuverlässig in die Session.
2. **Entkoppeltes Thinking / Reasoning mit eigener Karte**:
   - Die visuelle Trennung von `<think>`-Inhalten in eine dedizierte, einklappbare Thinking-Karte sorgt für saubere Lesbarkeit bei Modellen wie DeepSeek R1 oder OpenAI o1/o3.
3. **Live-Tool-Karten mit Ausführungszeit**:
   - Die Visualisierung aktiver Werkzeuge mit Live-Sekundenzähler und klaren Statussymbolen (laufend → erfolgreich/Fehler) gibt dem Nutzer unmittelbares Feedback über Hintergrundprozesse.
4. **Interaktive Interaktionen im Chat (`Clarify` & `Approval`)**:
   - Statt dass der Agent bei Unklarheiten halluziniert oder stumm abbricht, fragt er den Nutzer interaktiv über Schaltflächen im Chatfenster (`clarify`).
5. **Echtes Streaming-Markdown ohne Layout-Springen (`smd.min.js`)**:
   - Parse-Fehler unvollständiger Markdown-Tags während des Token-Streams werden elegant maskiert.
6. **Live Throughput & Token-Metering (TPS)**:
   - Die präzise Berechnung von Tokens/s aus tatsächlichen Callback-Deltas vermittelt ein professionelles, transparentes Gefühl für die Modellgeschwindigkeit.
7. **Clientseitiger Inflight-Schutz**:
   - Das Zwischenspeichern des aktiven Turns im `localStorage` verhindert Frustration bei versehentlichem Fenster-Reload.
8. **Drei Busy-Modi (`steer`, `queue`, `interrupt`)**:
   - Ermöglicht flüssiges Weiterarbeiten, ohne auf das Ende langer Antworten warten zu müssen.

---

## 5. Was ist Altlast & Anti-Pattern? (NICHT nach Lastbrowser portieren)

Folgende Schwachstellen des Sidekick-Hermes-Forks dürfen **keinesfalls** unreflektiert übernommen werden:

1. **Monolithische Monster-Dateien im Backend**:
   - `run_agent.py` (>800 KB) und `streaming.py` (>5.400 Zeilen) enthalten hunderte verschachtelte Funktionen, globale Dictionaries und unübersichtliche Closures. Dies muss in Lastbrowser in saubere, typisierte TypeScript-/Python-Module zerlegt werden.
2. **Globales State-Swapping mit `os.environ` & `_ENV_LOCK`**:
   - Sidekick manipuliert globale Umgebungsvariablen (`os.environ['SIDEKICK_SESSION_KEY']` etc.) im laufenden Prozess und sperrt dafür Threads mit `_ENV_LOCK`. In Lastbrowser muss Kontext streng über Parameter und Context-Objekte übergeben werden.
3. **Fragiles Vanilla-JS DOM-Spaghetti im Frontend**:
   - `messages.js` (210 KB) und `ui.js` (536 KB) manipulieren den DOM manuell mit `innerHTML`, globalen Selektoren und Event-Listenern. Lastbrowser besitzt ein modernes **React 19 + TypeScript + Zustand UI**. Alle Chat-Komponenten müssen als saubere React-Komponenten (`apps/desktop/src/renderer/`) implementiert werden.
4. **Duale Datenmodelle für Sitzungen**:
   - Die historische Koexistenz von `shared.sessions` und `web.api.models.Session` mit fehleranfälligen Round-Trip-Konvertierungen sollte in Lastbrowser durch ein einziges, maßgebliches Schema ersetzt werden.
5. **Überflüssiger Ballast & unfertige Spielereien**:
   - Module wie `game_mode`, `neutts_samples`, `autonomer_tick`, Feishu/Yuanbao-APIs und unfertige Emotions-Zustände (`needs.py`) sind für einen schnellen, modernen Browser überflüssig und gehören nicht in den Kern.

---

## 6. Fazit & Vorbereitung auf Folgeschritte

Die Sidekick-Chat-Engine bietet auf Protokoll- und Feature-Ebene exzellente Konzepte (SSE-Events, verlustfreier Cancel, Reasoning-Karten, Live-Tool-Feedback, interaktives Clarify und Token-Metering).  
Ihre Schwächen liegen primär in der gewachsenen Monolithen-Struktur und der antiquierten Vanilla-JS-DOM-Architektur.

Für Lastbrowser ist der richtige Weg:
- **Die bewährten Protokolle und Features übernehmen** (SSE-Event-Modell, Statuskarten, Reasoning, Clarify).
- **Die Implementierung modernisieren** (React 19 UI-Komponenten, sauberes State Management, strikte TypeScript-Typisierung).

Die nächsten Schritte:
- **A-015:** Detaillierte Ist-Analyse des aktuellen Lastbrowser-Renderer-Chats und Gegenüberstellung der konkreten UX- und Stabilitätslücken.
- **A-016:** Begleitende Prüfung externer Best Practices.
- **A-017:** Ausarbeitung des finalen Portierungs- und Modernisierungsplans für Cid.

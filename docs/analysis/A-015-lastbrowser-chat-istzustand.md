# Analyse A-015: Ist-Zustand und Schwachstellen des Lastbrowser-Renderer-Chats

> **Auftrag:** A-015 (Programm „Chat verbessern“, Vorbereitung für A-016 und A-017)  
> **Typ:** Analyse (Architektur- & Code-Audit)  
> **Status:** Abgeschlossen  
> **Datum:** 11. Oktober 2026  
> **Autor:** `antigravity-worker-6` (Bug-Kurator und Bugsucher)  
> **Referenz-Dokument:** [A-014-sidekick-chat.md](file:///c:/projekte/lastbrowser/docs/analysis/A-014-sidekick-chat.md) (Sidekick-Architektur-Referenz von `antigravity-worker-8`)  
> **Untersuchte Codebasis:** `apps/desktop/src/renderer/` (u. a. `panels/NativeChatMain.tsx`, `panels/ChatComponents.tsx`, `chat-live-stream.ts`, `stores/useChatStore.ts`)  

---

## 1. Einleitung & Zielsetzung

Der Gründer und Chef-Architekt (Cid) initiierte das Modernisierungsprogramm **A-014 bis A-017**, um die Chat-Erfahrung in Lastbrowser qualitativ und funktional wieder auf das Niveau des ursprünglichen Sidekick-Agenten (Hermes-Fork) zu heben.

Während **A-014** die Referenz-Architektur des Original-Sidekicks dokumentiert hat, liefert diese Analyse **A-015** den systematischen Ist-Zustand, die strukturellen Schwachstellen und die Ursachen für funktionale Einbußen im aktuellen Lastbrowser-Renderer-Chat.

---

## 2. Ist-Zustand der aktuellen Lastbrowser-Chat-Architektur

### 2.1 Komponentenbaum & Zustandsverwaltung

Der Chat im Lastbrowser-Renderer ist hierarchisch gegliedert, weist jedoch eine hohe Kopplung auf:

```
┌────────────────────────────────────────────────────────────────────────┐
│ App.tsx (Root Browser Shell)                                          │
│ └── NativeChatMain.tsx (939 Zeilen Monolith)                           │
│     ├── Header & Session-Steuerung (sessionTitle, shortSessionId)       │
│     ├── GoalControls.tsx (Persistente Ziele & Meilensteine)            │
│     ├── NativeGrillControls.tsx (Grill-Me Planungsinterviews)          │
│     ├── ChatTranscript (ChatComponents.tsx: 756 Zeilen)                │
│     │   ├── ChatMessage (User, System, Assistant)                      │
│     │   ├── ChatMessageBody (NativeRichText / Markdown)                │
│     │   ├── Reasoning Details (<details className="chat-reasoning">)   │
│     │   ├── ToolCallDetails (Inline Tool-Cards / Compact Activity)     │
│     │   └── TeamworkProcessCard (Multi-Agent Teaming)                  │
│     ├── ApprovalPollManager / ApprovalCard (NativeApproval.tsx)        │
│     └── ChatComposer (ChatComponents.tsx)                              │
│         ├── Model-Picker & Reasoning-Effort-Dropdown                   │
│         ├── SlashCommandMenu.tsx (/plan, /goal, /boost, /grill-me)     │
│         └── ContextUsageIndicator (Token-Zähler & Kompression)         │
└────────────────────────────────────────────────────────────────────────┘
```

- **Globaler State:** Verwaltet über `useChatStore.ts` (Zustand). Enthält `sessions`, `activeSessionId`, `activeSession`, `chatMessages`, `activeStreamId`, `composerText`, `composerMode` und das ausgewählte Modell.
- **Lokale Panel-States:** In `NativeChatMain.tsx` existieren über 25 separate `useState`- und `useRef`-Hooks (u. a. für Queue, Grill-State, Policy-Drafts, Child-Run-Gruppen, Pending-Turns und Streaming-Locks).

### 2.2 Nachrichten- & Streaming-Fluss

1. **Absenden:** Der Nutzer tippt im `ChatComposer`. Bei Klick auf *Send* (`handleSubmit`) wird der Prompt validiert und eventuell um Tab-Kontext (`synthesizeTabsContext`) oder Slash-Commands ergänzt.
2. **API-Aufruf:** Über die Hilfsfunktion `guarded-native-chat-start.ts` wird `POST /api/chat/start` an den lokalen FastAPI-Port (`127.0.0.1:45123`) gerichtet.
3. **SSE-Streaming:** Nach Rückgabe der `stream_id` wird über `EventSource` auf `/api/chat/stream?stream_id=...` gehört.
4. **Reattach & Race-Condition-Abfang:** In `chat-live-stream.ts` sind umfangreiche Algorithmen implementiert (`preserveInFlightChatMessages`, `restorePendingChatTurn`, `claimRestoredChatStream`), um In-Flight-Nachrichten gegen asynchrone Session-Reloads abzusichern.

---

## 3. Identifizierte Kern-Schwachstellen (Pain Points)

### 3.1 Schwachstelle 1: Monolithische Überfrachtung von `NativeChatMain.tsx`
- **Befund:** `NativeChatMain.tsx` umfasst 939 Zeilen und vereint 8 heterogene Subsysteme:
  - Standard-Chat-Nachrichtenfluss
  - Persistente Zielsteuerung (`GoalControls`)
  - Interaktive Befragung (`NativeGrillControls` / `/grill-me`)
  - Tab-Kontext-Extraktion (`tab-intelligence.ts`)
  - Scoped-Assistant-Rechteprüfung (`IndependentAssistantClient`)
  - Modell-Governance & Policies (`model-policy-client.ts`)
  - Genehmigungswarteschlangen (`ApprovalPollManager`)
  - Kind-Agenten-Transkripte (`useChildRunHistory` & `ChildRunBubbles`)
- **Auswirkung:** Jede Zustandsänderung (z. B. ein eintreffendes Token oder ein Hover im Model-Picker) löst Re-Render-Kaskaden des gesamten Transkripts aus. Wartung und Fehlerbehebung sind extrem fehleranfällig.

### 3.2 Schwachstelle 2: Fehlendes interaktives Reasoning-Rendering
- **Befund:** Im Original-Sidekick (**A-014**, Abs. 2.2) wird Reasoning als eigenständige, animierte, einklappbare Thinking-Card oberhalb der Antwort gerendert, die auch während paralleler Tool-Aufrufe live expandiert.
- **Ist-Zustand in Lastbrowser:** In `ChatComponents.tsx:188-193` wird Reasoning lediglich über ein statisches HTML-`<details>`-Element mit `<summary>{t('chat.reasoning')}</summary>` dargestellt.
- **Auswirkung:** Nutzer erhalten während der Denkphase komplexer Modelle (o1, DeepSeek R1) kein flüssiges, visuelles Feedback über den Gedankenfortschritt; die UI wirkt eingefroren.

### 3.3 Schwachstelle 3: Eingeschränkte Busy-Input- & Steer-Funktionalität
- **Befund:** Sidekick bietet drei ausgereifte Busy-Strategien: `queue`, `interrupt` und `steer` (`/api/chat/steer`).
- **Ist-Zustand in Lastbrowser:** Lastbrowser verfügt über eine lokale Warteschlange (`useChatQueue`), unterstützt jedoch kein dynamisches Eingreifen in laufende Agentenaktionen via `/api/chat/steer`.
- **Auswirkung:** Wenn der Agent eine unerwünschte Aktion beginnt (z. B. eine falsche Datei editiert), kann der Nutzer den Lauf nur hart abbrechen (`cancel_stream`), nicht aber korrigierend eingreifen.

### 3.4 Schwachstelle 4: Verlustbehaftete oder inkonsistente Cancel-Zustände
- **Befund:** Im Original-Sidekick sichert das Backend bei Abbruch automatisch alle bis dahin generierten Tokens und Gedanken als unvollständige Nachricht (`[abgebrochen]`).
- **Ist-Zustand in Lastbrowser:** In `chat-live-stream.ts` existieren zwar `isPartial`-Flags, jedoch führt ein Client-Reload oder abrupter Abbruch im Renderer mitunter zu verwaisten Turns (`orphanedPendingTurn: true`), die als Fehler-Zustand in der UI verharren, anstatt den bis dahin erzeugten Teiltext sauber freizugeben.

### 3.5 Schwachstelle 5: Kaltstart-Kopplung an Uvicorn (Auftrag A-025)
- **Befund:** Wie in Analyse A-025 nachgewiesen, blockiert `runtime-readiness.ts:canCallSidekickApi` jegliche Chat-Nutzung, solange der Python-Uvicorn-Prozess nicht mit HTTP 200 auf `/api/health` antwortet (15–30s Kaltstartverzögerung).
- **Auswirkung:** Der Chat-Bereich zeigt beim App-Start eine künstliche Latenz und blockiert Interaktionen, selbst wenn der Nutzer nur lokale Chat-Historien ansehen oder Prompts vorbereiten möchte.

---

## 4. Detaillierte Vergleichsmatrix: Sidekick Original vs. Lastbrowser Chat

| Eigenschaft / Feature | Original Sidekick (A-014) | Lastbrowser Renderer Chat (A-015) | Bewertung / Handlungsbedarf |
| :--- | :--- | :--- | :--- |
| **Architektur-Muster** | Entkoppeltes 2-Stufen REST + SSE | 2-Stufen REST + SSE mit IPC-Proxy | In Lastbrowser komplexer wegen IPC-Bridge |
| **Code-Organisation** | Modulare JS-Module (`messages.js`, `sse.js`) | Monolith in `NativeChatMain.tsx` (939 Zeilen) | Dringende Entflechtung in Teilkomponenten nötig |
| **Reasoning-Darstellung** | Live Thinking-Card mit Animation | Statisches HTML-`<details>` | Upgrade auf reaktive Thinking-Card |
| **Echtzeit-Metering (TPS)** | 1 Hz Hardware-Ticker aus Backend | Berechnet über `_turnTps` / Heuristik | Hardware-getriebenes Ticker-Signal übernehmen |
| **Live Steering** | `/api/chat/steer` voll integriert | Nicht im Composer angebunden | Steering-API im Composer freischalten |
| **Inflight Reload-Schutz** | `localStorage` INFLIGHT Cache | `chat-live-stream.ts` Snapshot-Heuristik | Snapshot-Heuristik vereinfachen |
| **Start-Verhalten** | Autarkes Web-Frontend | Bis zu 30s Uvicorn-Startblockade | Entkopplung gemäß A-025 (Fail-Open) |

---

## 5. Handlungsempfehlungen für A-016 (Vorbilder) und A-017 (Modernisierungsplan)

1. **Refactoring von `NativeChatMain.tsx` in Teilmodule:**
   - Aufteilung in `ChatSessionHeader.tsx`, `ChatTranscriptView.tsx`, `ChatActionDrawer.tsx` und einen entkoppelten `ChatStreamController.ts`.
2. **Harmonisierung des SSE-Clients:**
   - Angleichung der Event-Handler an das schlanke Protokoll aus `services/sidekick/web/static/js/messages.js`.
3. **Visuelle Aufwertung der Thinking- & Tool-Karten:**
   - Ablösung von `<details>` durch eine moderne, animierte Card-Komponente mit Zeitstempel und Token-Fortschritt.
4. **Integration der Steering-Schnittstelle:**
   - Ermöglichung von Zwischenrufen bei laufenden Agentenaktionen via Tastenkürzel (`Ctrl+Shift+Enter`).
5. **Entkopplung der Chat-Shell vom Backend-Kaltstart:**
   - Laden des Transkripts aus dem lokalen SQLite/JSON-Cache, noch bevor Uvicorn vollständig hochgefahren ist.

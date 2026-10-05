# Handoff: Chat-Zusatzfunktionen (Renderer-Integration & Interaktive Abnahme)

> **Dokument:** `docs/independent-handoff-chat-features.md`  
> **Bereich:** Renderer-Integration der Chat-Zusatzfunktionen (`apps/desktop/src/renderer` und Desktop-Tests)  
> **Status:** Interaktive Renderer-Abnahme erfolgreich durchgeführt. Stream-Race vollständig behoben (autoritative Turn-Bindung, keine Mutation durch Streaming-Tokens, einheitliche Identitätsauflösung). Klare Trennung der 3 Nachweisstufen implementiert. Ausführbarer App-Abnahmeplan für den Komplettbuild bereitgestellt. Gesamtziel verbleibt für die praktische Laufzeitabnahme im vollständigen App-Verbund offen.

---

## 1. Übersicht der durchgeführten Arbeiten

Gemäß den Vorgaben aus `independentagent.md` (§21–§23), den Monorepo-Regeln in `AGENTS.md` und den Dateigrenzen (`apps/desktop/src/renderer`, zugehörige Desktop-Tests, `docs/independent-handoff-chat-features.md`) wurden:
1. Der verbleibende Stream-Race in `NativeChatMain.tsx` und `model-policy-client.ts` behoben.
2. Die interaktive Renderer-Abnahme mit tatsächlich gemounteten React-Komponenten und realen DOM-Interaktionen in einer echten Electron-BrowserWindow-Umgebung durchgeführt.
3. Die Nachweisstufen im Handoff präzise klassifiziert (Vertragsnachweis vs. interaktiver DOM-Nachweis vs. echter Backend-/Desktop-Workflow).
4. Ein ausführbarer App-Abnahmeplan für den späteren Komplettbuild formuliert.

---

## 2. Behebung des Stream-Race & Ereignisidentitäts-Härtung

### 2.1 Problemstellung des Stream-Race
Bisher speicherte `NativeChatMain.tsx` die `lastStreamIdBySession` bei jedem beliebigen Nicht-`done`-Event (`delta`, `token`, `reasoning`, `tool`). Wenn ein neuer Stream 2 bereits gestartet war, ein verspätetes Netzwerk-Token von Stream 1 aber verzögert eintraf, überschrieb dieses Token die erwartete Stream-ID wieder mit `stream-1`. Traf anschließend das verspätete `done`-Event von Stream 1 ein, wurde es fälschlicherweise als Abschluss des aktuellen Turns akzeptiert, während das spätere reguläre `done`-Event von Stream 2 verworfen wurde.

### 2.2 Durchgeführte Korrekturen

1. **Einheitliche Identitätsvalidierung (`readStreamEventIdentity` in `model-policy-client.ts`):**
   - Extrahiert `sessionId` und `streamId` streng autoritativ aus dem Event-Payload (`data.session.id`, `nativeContext.sessionId` / `nativeContext.streamId`, oder Top-Level-Felder `sessionId` / `streamId`).
   - Lehnt leere, fehlende oder ungültige Strings ab.
   - Erfindet unter keinen Umständen IDs aus dem aktuellen UI-Kontext.
   - Wird nun einheitlich im Listener von `NativeChatMain.tsx` und im Parser `readObservedDecisionFromStreamEvent` verwendet.

2. **Autoritative Bindung statt Token-Mutation in `NativeChatMain.tsx`:**
   - `lastStreamIdBySession` wurde durch `authoritativeStreamIdBySession` ersetzt.
   - **Streaming-Tokens mutieren die Turn-Identität nicht mehr:** Nicht-`done`-Events (`payload.event !== 'done'`) aktualisieren die Referenz nicht.
   - Die Turn-Identität wird ausschließlich aus autoritativen Bindungsverträgen bezogen:
     - Beim Start synchron über den Subscription-Zustand von `useNativeChatControls` (`activeStreamId`).
     - Über `activeSession.active_stream_id` aus dem Backend-Session-Zustand.
   - Die Auflösung der `expectedStreamId` erfolgt in fester Prioritätskette:
     ```ts
     const expectedStreamId =
       controlsStreamId ||
       activeMatchingStreamId ||
       authoritativeStreamIdBySession.current[eventSessionId] ||
       activeSession.active_stream_id;
     ```

3. **Verifikation des konkreten Racefalls:**
   - Ablauf: Stream 2 beginnt → verspätetes Token von Stream 1 trifft ein → verspätetes `done` von Stream 1 trifft ein → gültiges `done` von Stream 2 trifft ein.
   - **Verhalten:**
     - Das verspätete Token von Stream 1 ändert `authoritativeStreamIdBySession` nicht.
     - Das verspätete `done` von Stream 1 wird strikt abgewiesen (`stream_id mismatch`).
     - Das gültige `done` von Stream 2 wird als autoritativer Turn-Abschluss akzeptiert.
   - Der gleiche Ablauf wurde auch bei zwischenzeitlichem Chatwechsel (zu Space B und zurück zu Space A) getestet: Die Session-Isolation bleibt vollständig gewahrt, fremde Entscheidungen lecken nicht.

---

## 3. Nachweisstufen und Verifikationsmethodik

Zur Vermeidung missverständlicher Erfolgsmeldungen werden alle Nachweise streng in drei Ebenen unterteilt:

| Stufe | Typ | Beschreibung & Grenzen | Status |
| :--- | :--- | :--- | :--- |
| **Stufe 1** | **Statische Rendering- & Vertragstests** | Isolierte Unit- und Integrationstests via Vitest und `renderToStaticMarkup`. Prüfen reine Datenverträge, Fehlerbehandlung, Parsing und HTML-Struktur. Keine realen DOM-Events, keine React-Lifecycle-Effekte, keine Browser-APIs. | **PASS (51/51)** |
| **Stufe 2** | **Gemountete interaktive Renderer-Verifikationen** | Echte React-Komponenten werden via `createRoot` im realen Electron BrowserWindow (Castlabs Electron `37.10.3+wvcus`) gemountet. Reale DOM-Ereignisse, Maus-Klicks, Tastatur-Eingaben (`sendInputEvent`), Formular-Absendungen und UI-Remounts. Kontrollierte Events dienen als Verhaltens- und Schnittstellennachweis der UI; ein Remount ist jedoch kein vollständiger Electron-Reload. | **PASS (25/25 Phasen)** |
| **Stufe 3** | **Echte Backend-/Desktop-Workflows** | End-to-End-Ausführung im vollständig gebündelten Installer-Paket (`Lastbrowser.exe`) mit real startendem Python-Sidekick-Backend, echten HTTP/SSE-Endpunkten, SQLite-Datenbanken und externer bzw. lokaler Modellausführung. | **Ausstehend (nach neuem Paketbuild)** |

---

## 4. Ergebnisse der interaktiven Renderer-Abnahme (Stufe 2)

Die interaktive Verifikation wurde im Testskript `apps/desktop/tests/independent-renderer-smoke.cjs` mit tatsächlichen DOM- und Tastaturinteraktionen durchgeführt. Alle 25 Phasen schlossen erfolgreich mit Code 0 ab.

### 4.1 Subagenten-Streaming & Disclosure-Verhalten
- **Zwei gleichzeitig aktive Subagenten:**
  - Zwei Subagenten (`sub-researcher-1` auf Tiefe 1, `sub-planner-2` auf Tiefe 2) im Status `'running'`.
  - Jeder Subagent erhält einen aktiven animierten Streaming-Indikator (`child-run-streaming-dot`), deterministische Farbnuancen (`data-color-index`) und hierarchische Tiefeneinrückung (`--child-depth`).
- **Standardmäßig eingeklappt (`collapsed disclosure`):**
  - Subagent-Bubbles rendern standardmäßig eingeklappt (`<details className="child-run-bubble">` ohne `open`-Attribut).
- **Manuelles Einklappen bleibt bei weiteren Streaming-Tokens erhalten:**
  - Wird ein Bubble manuell geschlossen (`open={false}`), führen nachfolgende gestreamte Tokens (`snapshot.messages`) nicht zum ungewollten Wiederaufklappen.
- **Tastaturbedienung & Aufklappen:**
  - Ein Druck auf die `Enter`-Taste auf dem `<summary>`-Element klappt das Bubble barrierefrei auf (`open={true}`) und offenbart den vollständigen gestreamten Inhalt.

### 4.2 Persistente Ziele (Formularbedienung & Rehydrierung)
- **Erstellung über Formular:**
  - Eingabe von Titel (`Research Competitors`), Beschreibung und Rundenlimit (`10`) über das Zielformular.
  - Absendung mit autoritativer CAS-Prüfung (`expectedRevision: 0`).
- **Wiederherstellung nach UI-Remount:**
  - Nach vollständigem Aushängen (`root.unmount()`) und erneutem Einhängen mit gespeicherten Testdaten rehydriert `GoalControls` den Zielstand (`status: 'active'`, `turns_used: 2 / 10`).
  - Pause- und Fortsetzen-Schaltflächen reagieren korrekt mit autoritativen Status-Updates.

### 4.3 Slash-Befehle & Modell-Interaktion
- **Tastaturnavigation im Slash-Menü:**
  - Eingabe von `/` öffnet die barrierefreie Befehlsauswahl (`role="listbox"`).
  - Navigation via Pfeiltasten (`ArrowDown`/`ArrowUp`) und Filterung nach `/model`, `/plan`, `/goal`, `/boost`, `/grill-me`.
  - Bestätigung von `/model` mit der `Enter`-Taste öffnet direkt das native Modell-Auswahl-Dropdown (`.composer-model select`).
- **Modellauswahl:**
  - Auswahl eines konkreten Modells modifiziert die Session-Konfiguration mit korrekter CAS-Revision.

### 4.4 AUTO-Modellauswahl & Entscheidungsanzeige
- **Getrennte Ausweisung:**
  - Konfigurierte Routing-Präferenz (z. B. Orchestrator `anthropic · claude-3-5-sonnet`) und tatsächlich beobachtete Ausführungsentscheidung werden strikt getrennt dargestellt.
- **Zustand vor Abschluss:**
  - Solange kein autoritativer Abschlussbeleg vorliegt, zeigt die UI ehrlich: `Tatsächliche Entscheidung: Entscheidung noch nicht bekannt` (in allen 8 Sprachen lokalisiert, z. B. japanisch `決定はまだ不明です`).
- **Zustand nach Abschluss:**
  - Erst nach Eintreffen eines autoritativen `done`-Events mit `successful_chat === true` wird die tatsächliche Modellentscheidung (z. B. `openai · gpt-4o`) dargestellt.
- **Session-Isolation & Chatwechsel:**
  - Ein Wechsel zwischen Space A und Space B während des Streamings leckt keine Entscheidungsdaten. Rückkehr zu Space A stellt die korrekte Entscheidung wieder her.
- **Unbekannte Limits:**
  - Fehlende Quoten bleiben `Unbekannt` und werden niemals mit Schätzwerten belegt.
  - Das Layout passt sich auch in kompakten 320px-Viewports ohne Umbruchfehler an (geprüft und per Screenshot belegt).

### 4.5 Stream-Race Verifikation
- Der Ablauf `Stream 2 beginnt → verspätetes Token von Stream 1 → verspätetes done von Stream 1 → gültiges done von Stream 2` wurde sowohl isoliert als auch mit zwischenzeitlichem Chatwechsel durchlaufen.
- **Ergebnis:** Das verspätete Token von Stream 1 wird ignoriert, das verspätete `done` von Stream 1 verworfen, und das reguläre `done` von Stream 2 wird als alleiniger Abschluss übernommen.

---

## 5. Dokumentation der Backend-Persistenzanforderung (Aufgabe 1)

Die Analyse von `services/sidekick/web/api/streaming.py` zeigt:
1. `provider_evidence` wird im Backend bei Zeile 4820 berechnet – rund 150 Zeilen **nach** `s.save()` (Zeile 4671).
2. Daher gelangt `provider_evidence` derzeit nur in den Live-SSE-Payload (`done_payload`), aber nicht in die persistierte Session-Datei auf der Festplatte.
3. **Aufgabenteilung:** Die Anpassung des Backends zur persistenten Speicherung von `_provider_evidence` und `turn_id` in `s.messages` verbleibt unverändert im Zuständigkeitsbereich von **Aufgabe 1 (Backend)**. Der Renderer verhält sich streng vertragskonform: Solange nach einem Reload kein gespeicherter Beleg vorhanden ist, zeigt er korrekt `Entscheidung noch nicht bekannt`.

---

## 6. Testergebnisse und Nachweise

### 6.1 Stufe 1: Statische Rendering- & Vertragstests (Vitest)
Befehl: `npx vitest run tests/model-policy-client.test.ts tests/chat-features-renderer-integration.test.ts tests/child-run-bubbles.test.ts tests/chat-command-registry.test.ts`
- `tests/child-run-bubbles.test.ts`: **4/4 PASS** (Lokalisierung, Standard-Einklappzustand, Barrierefreiheit, Nuancen)
- `tests/chat-command-registry.test.ts`: **16/16 PASS** (Slash-Befehle, Modi, CAS-Revisionsprüfung, Budget)
- `tests/chat-features-renderer-integration.test.ts`: **7/7 PASS** (Subagent-Streaming, Einklapp-Persistenz, Ziel-Rehydrierung, Tastatur, AUTO-Anzeige)
- `tests/model-policy-client.test.ts`: **24/24 PASS** (Identitätsprüfung via `readStreamEventIdentity`, Stream-Race mit Token-Verzögerung, Race mit Chatwechsel, Gateway-Fallback, Rehydrierung, 8 Sprachen)
- **Gesamt: 51/51 Tests bestanden in 2.70s.**

### 6.2 Stufe 2: Gemountete interaktive Renderer-Verifikationen (Electron)
Befehl: `node apps/desktop/tests/independent-renderer-smoke.cjs`
- **Castlabs Electron Version:** `37.10.3+wvcus`
- **Ergebnis:** Alle 25 Phasen bestanden (`code 0`), u. a.:
  - `native-command-host:passed`
  - `native-model-picker:passed`
  - `native-mode-goal:passed`
  - `native-goal-edges:passed`
  - `native-goal-migration:passed`
  - `native-child-keyboard-selection:passed`
  - `native-child-streams:passed`
  - `native-auto-policy:passed`
  - `native-keyboard-locales:passed` (alle 8 Sprachen inkl. Japanisch 320px)

### 6.3 TypeScript Typecheck
Befehl: `npm --workspace apps/desktop run typecheck:renderer`
- **Ergebnis: PASS (Code 0)**, 0 Fehler in `tsconfig.renderer.json`.

---

## 7. Geänderte Dateien

### Im Renderer (`apps/desktop/src/renderer`):
1. `apps/desktop/src/renderer/model-policy-client.ts`:
   - Export von `readStreamEventIdentity(payload: unknown)` zur autoritativen Extraktion von `sessionId` und `streamId`.
   - `readObservedDecisionFromStreamEvent`: Nutzt `readStreamEventIdentity` und verlangt `successful_chat === true`.
   - `readObservedDecisionFromSession`: Strikte Positivprüfung für gespeicherte Belege.
2. `apps/desktop/src/renderer/panels/NativeChatMain.tsx`:
   - `authoritativeStreamIdBySession`: Beseitigung der Fehlmutation durch Streaming-Tokens.
   - Synchroner Abgleich mit `useNativeChatControls`-Subscription beim Start von Runs.
   - Auflösung von `expectedStreamId` nach fester Bindungspriorität.
   - Isolierte Speicherung von Entscheidungen unter `[eventSessionId]`.
3. `apps/desktop/src/renderer/components/ChildRunBubbles.tsx`:
   - Standardmäßig eingeklapptes Rendering (`open={isOpen}`, default `false`).
   - Zustand bleibt bei weiteren eintreffenden Streaming-Tokens stabil.
   - Tastatur-Aufklappen unterstützt.

### In den Desktop-Tests (`apps/desktop/tests/`):
4. `apps/desktop/tests/model-policy-client.test.ts`:
   - Tests für `readStreamEventIdentity` ergänzt.
   - Tests für den konkreten Stream-Race-Fall (Token 1 verzögert, Done 1 verzögert, Done 2 gültig) ergänzt.
   - Tests für den Stream-Race-Fall bei zwischenzeitlichem Chatwechsel ergänzt.
5. `apps/desktop/tests/chat-features-renderer-integration.test.ts`:
   - Aktualisiert für standardmäßig eingeklappte Subagent-Bubbles.
6. `apps/desktop/tests/independent-renderer-smoke.cjs`:
   - Interaktive Prüfungen für Slash-Tastaturnavigation, Formular-Zielerstellung & Remount, Subagent-Einklappung & Keyboard-Disclosure, sowie AUTO-Race-Abschluss integriert.

---

## 8. Ausführbarer App-Abnahmeplan für den späteren Komplettbuild (Stufe 3)

Sobald ein neuer, vollständiger Testbuild (`npm run package:win`) erstellt wurde, der sowohl die Renderer- als auch die Backend-Änderungen enthält, ist folgende Abnahmesequenz in der gebündelten `Lastbrowser.exe` auszuführen:

### Testfall 1: Persistente Ziele (End-to-End)
1. **Start:** `Lastbrowser.exe` mit isoliertem Testprofil starten.
2. **Ziel anlegen:** Im Chat-Eingabebereich `/goal` eingeben oder Ziel-Formular öffnen. Titel: `Marktanalyse durchführen`, Rundenlimit: `5`. Speichern.
3. **Turn starten:** Prompterteilung absenden. Beobachten, dass der Runden-Zähler auf `1 / 5` springt.
4. **Pause:** Auf `Pausieren` klicken. Verifizieren, dass der Status im Backend auf `paused` wechselt.
5. **App-Neustart:** `Lastbrowser.exe` beenden und neu starten.
6. **Erwartetes Ergebnis:** Das Ziel erscheint im Chat mit Status `paused`, Revision `1` und `1 / 5` Runden. Fortsetzen-Button ist aktiv.

### Testfall 2: Parallele Subagenten-Delegation & Disclosure
1. **Chat öffnen:** Einen neuen Arbeitsbereich-Chat öffnen.
2. **Delegations-Turn absenden:** Eine komplexe Anfrage stellen, die mindestens 2 Subagenten auslöst (z. B. simultane Recherche).
3. **Einklapp-Verhalten:**
   - Verifizieren, dass mindestens 2 Subagenten-Bubbles als eingerückte, farbcodierte Bubbles erscheinen.
   - Ein Bubble manuell über das Dreiecks-Icon anklicken und einklappen.
   - Beobachten, während die Subagent-Antwort weiter live streamt: Das Bubble **muss eingeklappt bleiben**.
4. **Tastatur-Aufklappen:** Das eingeklappte Bubble per Tab-Taste ansteuern und `Enter` drücken.
5. **Erwartetes Ergebnis:** Das Bubble klappt auf und zeigt den vollständig gestreamten Zwischenstand.

### Testfall 3: Slash-Menü & Modellauswahl
1. **Eingabe:** Im Prompt-Eingabefeld `/` tippen.
2. **Navigation:** Mit Pfeiltasten `Down` durch die Befehle blättern (`/model`, `/plan`, `/goal`, `/boost`, `/grill-me`).
3. **Auswahl:** Bei `/model` die `Enter`-Taste drücken.
4. **Erwartetes Ergebnis:** Das Modell-Dropdown öffnet bzw. fokussiert sich. Das gewünschte Modell kann per Tastatur/Maus gewählt werden.

### Testfall 4: AUTO-Modellpolicy & tatsächlicher Beleg
1. **AUTO aktivieren:** In den Modell-Einstellungen für den Space `AUTO` (Modell-Auswahl-Richtlinie) aktivieren.
2. **Turn absenden:** Einen Prompt absenden.
3. **Während des Streamings:** Die Anzeige unter dem Modell-Label prüfen.
   - *Erwartung:* Konfigurierter Orchestrator wird als Routing-Präferenz angezeigt. Die tatsächliche Entscheidung lautet: `Entscheidung noch nicht bekannt`.
4. **Nach Abschluss des Turns:**
   - *Erwartung:* Die Anzeige wechselt auf das tatsächlich verwendete Modell (z. B. `openai · gpt-4o`), belegt durch den dokumentierten Abschlussbeleg (`provider_evidence`).
5. **Chatwechsel:** Während ein Turn in Space A läuft, zu Space B wechseln. In Space B darf keine falsche Entscheidung aus Space A erscheinen. Bei Rückkehr zu Space A ist die Entscheidung vollständig sichtbar.
6. **Quotenanzeige:** Unbekannte Limits verbleiben strikt als `Unbekannt`.

---

## 9. Status & Ausblick

- **Renderer-Stand:** Vollständig gehärtet, race-frei und interaktiv in Stufe 1 und Stufe 2 verifiziert.
- **Backend-Stand:** Read-only analysiert; Persistenzanforderung sauber an Aufgabe 1 übergeben.
- **Gesamtziel:** Das Gesamtziel wird **nicht** als abgeschlossen markiert, da die endgültige Stufe 3 (reale Backend-Laufzeitabnahme im vollständigen Installer-Build) der abschließenden Gesamtverifikation vorbehalten bleibt.

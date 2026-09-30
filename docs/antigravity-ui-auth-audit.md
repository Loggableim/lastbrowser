# Lastbrowser Release-Readiness Audit: Agenten Skills & Sidekick Auth

## 1. Befund & Ursachen

### A. Darstellungsfehler „Agenten Skills“ (`[object Object]` mehrfach)
* **Symptom:** Im Native-Skills-Panel wurden verlinkte Dateien und ggf. Skill-Labels wiederholt als Textliteral `[object Object]` angezeigt.
* **Ursache:**
  1. `selectedSkill?.linked_files` im UI ([`AgentPanels.tsx`](../apps/desktop/src/renderer/panels/AgentPanels.tsx)) verarbeitete Backend-Payloads unvollständig. Das Sidekick-Backend kann Linked Files als Dictionary-Kategorien (`{ references: [...], templates: [...] }`), Boolean-Maps (`{ "memo.md": true }`) oder Objekt-Arrays mit Dateipfaden liefern.
  2. Die Hilfsfunktion `text()` in [`RestPanelShared.tsx`](../apps/desktop/src/renderer/panels/RestPanelShared.tsx) konvertierte jedes Objekt bedingungslos über `String(value)` zum String `"[object Object]"`, wenn es an UI-Render-Stellen gelangte.

### B. Fehlerzustand `sidekick:getSettings: Authentication required`
* **Symptom:** Im Einstellungsbereich und in den Logs trat der Fehler `sidekick:getSettings: Authentication required` auf.
* **Ursache:**
  1. **Sicherheits-Grundzustand:** Dies ist das erwartete Sicherheitsverhalten des Sidekick-Backends (`/api/settings` liefert HTTP 401 mit `{"error": "Authentication required"}`), wenn der WebUI-Passwortschutz (`SIDEKICK_WEBUI_PASSWORD` oder aktives Masterpasswort) aktiviert ist und noch keine Authentifizierung vorliegt.
  2. **UI-Endlosschleife:** In [`SystemPanels.tsx`](../apps/desktop/src/renderer/panels/SystemPanels.tsx) (`NativeSettingsMain`) war ein `useEffect` aktiv, der bei gesetztem `settingsState.error` und existierenden `desktopSettings` unbegrenzt `settingsState.refresh()` erneut triggerte.

---

## 2. Laufzeitgrenze beim Auth-Fehler

* **Bestehendes Retry-Verhalten:**
  In [`apps/desktop/src/renderer/App.tsx`](../apps/desktop/src/renderer/App.tsx) führt `fetchDesktopSettingsWithRetry` bei Fehlern bis zu **8 Versuche** mit exponentiellem Backoff (`delayMs * 1.5`, Initialwert 200 ms, Max-Cap 1.500 ms) durch.
* **Effektive Laufzeitgrenze vor Fehlerabbruch:**
  $$\sum \text{Delays} \approx 200 + 300 + 450 + 675 + 1012 + 1500 + 1500 \approx 5.637\text{ ms} \approx 6\text{ Sekunden}$$
  Bei einem regulären 401-Auth-Fehler wartet die UI somit ca. 6 Sekunden, bevor der Fehler durchschlägt.
* **Zusammenspiel mit Endlosschleife:**
  Durch den bisherigen `useEffect` in [`SystemPanels.tsx`](../apps/desktop/src/renderer/panels/SystemPanels.tsx) wurde nach dem Scheitern sofort wieder `settingsState.refresh()` aufgerufen, was zu einer kontinuierlichen Wiederholungsschleife ohne Terminierung führte.
* **Behebung & Vorschlag:**
  - In [`SystemPanels.tsx`](../apps/desktop/src/renderer/panels/SystemPanels.tsx) wurde die automatische Wiederholung bei Auth-Fehlern unterbunden (`if (/auth|unauthorized/i.test(settingsState.error)) return;`).
  - Für [`App.tsx`](../apps/desktop/src/renderer/App.tsx#L379-L383) (unter paralleler Bearbeitung geschützt) wird empfohlen, bei `/authentication required/i` sofort mit Fail-Fast (0 ms Verzögerung / 1 Versuch) abzubrechen.

---

## 3. Geänderte Dateien

| Datei | Status | Beschreibung der Änderung |
| :--- | :--- | :--- |
| [`apps/desktop/src/renderer/panels/skill-categories.ts`](../apps/desktop/src/renderer/panels/skill-categories.ts) | Modifiziert (sauber) | `extractLinkedFiles(linkedFiles)` implementiert: Normalisiert Boolean-Maps, verschachtelte Kategorie-Maps, String- und Objekt-Arrays sicher ohne Coercion-Artefakte. |
| [`apps/desktop/src/renderer/panels/AgentPanels.tsx`](../apps/desktop/src/renderer/panels/AgentPanels.tsx) | Modifiziert (sauber) | Anbindung von `extractLinkedFiles(selectedSkill?.linked_files)`. |
| [`apps/desktop/src/renderer/panels/RestPanelShared.tsx`](../apps/desktop/src/renderer/panels/RestPanelShared.tsx) | Modifiziert (sauber) | Härtung von `text()`: Untersucht Objekt-Properties (`name`, `title`, `label`, `slug`, `id`, `value`, `message`, `text`) und gibt bei komplexen Objekten den Fallback statt `"[object Object]"` zurück. |
| [`apps/desktop/src/renderer/panels/SystemPanels.tsx`](../apps/desktop/src/renderer/panels/SystemPanels.tsx) | Modifiziert (sauber) | Unterbindung der Endlos-Refresh-Schleife bei Authentifizierungsfehlern. |
| [`apps/desktop/tests/skill-categories.test.ts`](../apps/desktop/tests/skill-categories.test.ts) | Modifiziert (sauber) | Umfassende Regressionstests für Linked-Files-Strukturen und `text()`-Objekt-Härtung. |
| [`docs/antigravity-ui-auth-audit.md`](./antigravity-ui-auth-audit.md) | Neu angelegt | Dieser Abschlussbericht. |

*Hinweis zu geschützten Dateien:* [`apps/desktop/src/renderer/App.tsx`](../apps/desktop/src/renderer/App.tsx) und weitere Dateien mit vorbestehendem Diff wurden zum Schutz paralleler Agenten-Streams nicht editiert.

---

## 4. Testergebnisse & Verifikation

* **Unit & Integration Tests:** `npm test`
  - 131 von 131 Test-Suiten bestanden
  - 1.138 von 1.138 Tests bestanden (0 Fehler)
* **Store Preflight Check:** `npm run verify:store`
  - 27 von 27 Prüfungen bestanden (`[PASS]`, 0 Fehler)
* **Desktop Shell Build:** `npm --workspace apps/desktop run build`
  - TypeScript-Prüfung und Vite-Bundle für Main und Renderer fehlerfrei (0 Fehler)
* **Python Engine Syntax Check:** `python -m compileall -q services/sidekick`
  - Exit-Code 0 (0 Fehler)

### Nachprüfung am 30.09.2026

- Vollständige Sidekick-Pytest-Suite: **2.394 bestanden, 105 übersprungen**, 0 fehlgeschlagen.
- Regression: Chat-Löschen leert jetzt das persistent gespeicherte Ziel im zugehörigen Profil-/Space-Scope und verwirft eine bereits eingeplante Fortsetzung. Gezielter Endpoint-Test bestanden.
- Ollama Cloud: Schlüsselwechsel entfernt jetzt auch gecachte Runtime-Clients. Direkte Sidekick-Runtime-Tests für Antwort, Streaming, Reasoning und Tool-Aufruf bestanden; der vollständige Electron-Chatablauf bleibt wegen gesperrter Desktop-Sitzung unbestätigt.
- Release-Abgleich: GitHub führt v0.1.38 als neueste Veröffentlichung; der Checkout ist v0.1.39. Es wurde nichts getaggt oder veröffentlicht. Der aktuelle Installer wurde nicht neu gebaut oder signiert.

---

## 5. Einhaltung von Vorgaben

- **Keine Geheimnisse:** Weder API-Keys noch Passwörter wurden inspiziert, persistiert oder protokolliert.
- **Keine Git-Mutationen:** Keine Commits, keine Pushes, keine Versionserhöhungen, keine Release-Aktionen.
- **Diff-Integrität:** Nur saubere, unberührte Dateien wurden angepasst.

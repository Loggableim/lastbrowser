# LastBrowser 0.1.48 cec9 – Prüfung ohne Computer Use

**Datum:** 7. Oktober 2026, 12:05 Uhr America/Los_Angeles  
**Testauftrag:** `VM-0.1.48-TEST-ORDER.md`, gepinnt auf `9079d3be5793a9d2452862fe72ad58e4949a95ac`  
**Kandidat:** `cec9d2f5ac8a22b8c492c138b7efcbef6d329aba` / `test-v0.1.48-20261007-cec9d2f`  
**Prüfmodus:** Nutzer bat, keine Computer-Use-Steuerung zu verwenden. Daher keine sichtbare UI-Bedienung und keine Screenshots.

## Ergebnis

Kein vollständiger Funktions-PASS. Der hashgeprüfte Portable-Wrapper entpackte einen `app.asar` mit exakt dem erwarteten cec9-Hash. Ein laufender LastBrowser-Prozess aus diesem entpackten Build oder ein sichtbares Anwendungsfenster wurde jedoch nicht nachgewiesen. Die Guest-UI-Szenarien bleiben deshalb `NOT_TESTED` bzw. `BLOCKED`.

| Teilprüfung | Status | Befund |
|---|---|---|
| Portable-Wrapperidentität | **PASS – Paketidentität** | 175,170,969 Bytes; SHA-256 `0C3B0855DFDF2B4C2E5CC37EFA4421A6A94599EBBBEB3479E0FAC0B1AC68B357` |
| Authenticode | **PASS – erwarteter Paketstatus** | `NotSigned`, wie im Auftrag angegeben |
| Extrahierter App-Payload | **PASS – Payloadidentität** | `resources/app.asar`: 64,012,655 Bytes; SHA-256 `918330622B3CC5F2D925AE2C31E2B24B1406DBAFCA6230C8CC7C7B038ABB663C` |
| Isolierter Portable-Appstart | **BLOCKED** | Der Portable-Wrapper blieb ohne Fenster und startete keinen nachweisbaren Appprozess. Ein späterer Direktstart der aus demselben hashgeprüften Wrapper extrahierten App lief an, scheiterte aber beim Sidekick-Start; siehe Laufzeitnachtrag. |
| Profil-/Runtimeisolation | **NOT_TESTED** | Der Direktstart nutzte einen frischen Profilpfad; ein verlässlicher Runtime-Readback und sichtbarer cec9-Versionstest fehlen. |
| Installations-/Design-/Quickchat-/Teamwork- und übrige UI-Fälle | **NOT_TESTED** | Keine UI-Steuerung und keine Providerturns; Teamwork bleibt gemäß Auftrag read-only vorbereitet. |
| Quelltests | **TEILWEISE PASS; Hauptsuite BLOCKED** | Späterer Nachtrag: cec9-Python-Syntaxcheck und 56 abhängigkeitfreie Tests liefen mit gebündelten Runtimes; vollständige Vitest-/pytest-Suiten mangels installierter Testabhängigkeiten nicht ausgeführt. Details unten. |

**Kandidatenbezug:** Die Portable-Datei war bereits zuvor gegen den Auftrag geprüft worden; diese Prüfung wurde erneut bestätigt: SHA-256 `0C3B0855DFDF2B4C2E5CC37EFA4421A6A94599EBBBEB3479E0FAC0B1AC68B357` — vollständiger Wert steht im ursprünglichen Guest-Bericht. Der Setup-Installer wurde in dieser Runde nicht gestartet.

## Ablauf und Grenzen

Der Kandidat wurde einmal mit `--user-data-dir` sowie getrennten, prozesslokalen `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP` und `LASTBROWSER_DOWNLOADS_DIR` aufgerufen. Alle Pfade zeigten auf ein neu angelegtes Temp-Testverzeichnis. Die extrahierte `app.asar`-Datei stimmte byte- und hashgenau mit dem Auftrag überein. Das ist ein Paket-/Entpacknachweis, kein Beleg, dass die App diese Datei tatsächlich ausgeführt hat.

Die vier vorbestehenden Prozesse der installierten 0.1.46-App (PIDs 7276, 9236, 9248 und 10104) wurden weder geschlossen noch verändert. Es wurde kein Setup gestartet, kein Nutzerprofil geöffnet oder zurückgesetzt und kein Provider-/LLM-Aufruf gesendet.

Es gibt keine Screenshots, weil kein sichtbarer UI-Test stattfand. Der Auftrag verlangt sichtbare Guest-Beobachtung; Prozess- und Hashprüfungen ersetzen diese nicht.

## Erforderlicher nächster Schritt

Für die vollständige Abnahme ist ein sichtbarer Start des gepinnten Portable-Kandidaten in einem frischen synthetischen Profil erforderlich. Der Startpfad muss vor Funktionsprüfungen die tatsächliche cec9-Version, den laufenden/extrahierten ASAR sowie die benutzten Profil- und Runtimepfade bestätigen. Anschließend sind die Szenarien aus dem Masterauftrag einzeln mit UI-Belegen zu prüfen. Bis dahin bleiben Funktionsfälle offen; dieser Bericht gibt keine Produktfreigabe.


## Nachtrag – Tests auf dem gepinnten Quellstand

Ein gebündelter Python-/Node-Laufzeitpfad des Codex-Workspaces war verfügbar, obwohl `python`/`npm` nicht direkt im PATH lagen. Das cec9-Quellarchiv wurde ausschließlich in `%TEMP%` ausgepackt. Ohne Abhängigkeitsinstallation liefen dort:

- `python -m compileall -q services/sidekick` mit Python 3.12.14: **PASS**.
- `python -m unittest test_verify_independent_bundle -v`: **2/2 PASS**.
- Node.js v24.19.0 `--test services/sidekick/tests/space_navigation.test.cjs`: **39/39 PASS**.
- Node.js `--test lastbrowser.com/tests/download-counter.test.mjs`: **15/15 PASS**.

Diese **56 Source-/Harness-Tests** betreffen Python-Syntax, Bundle-Snapshot, Space-/Session-Navigationsschutz sowie die Downloadzähler-Webfunktion. Sie laufen gegen den Quellstand `cec9d2f5ac8a22b8c492c138b7efcbef6d329aba`, nicht gegen die sichtbare Desktop-Laufzeit.

Die übrigen Desktop-Tests (202 Testdateien mit Vitest) und die breite Sidekick-Pytest-Suite liefen nicht: `node_modules`, Vitest und pytest fehlen. Der Testauftrag untersagt die Abhängigkeitsinstallation. Diese Source-Tests ändern den UI-Startblocker nicht; alle Guest-UI-Fälle bleiben `NOT_TESTED`/`BLOCKED`.

## Nachtrag – cec9-Laufzeitstart und Sidekick-Fehler

Der aus dem hashgeprüften Portable-Paket entpackte `Lastbrowser.exe`-Payload wurde direkt mit einem neuen synthetischen Profil und prozesslokalen AppData-/Temp-Pfaden gestartet. Die Electron-Haupt-App initialisierte und versuchte, den mitgelieferten Sidekick unter `resources/services/sidekick` zu starten. Der Dienst stürzte beim Import in `cli/web_server.py:131` ab:

`ModuleNotFoundError: No module named 'web.api.independent'`

Das gepackte Verzeichnis enthält `cli/web_server.py`, aber kein `web/api/independent.py` bzw. kein `web`-Verzeichnis. Im exakt gepinnten cec9-Quellarchiv existiert `services/sidekick/web/api/independent.py`. Dadurch startete der lokale Dienst auf `127.0.0.1:8788` nicht; der Desktop-Prozess meldete wiederholt `ECONNREFUSED` für `lastbrowser:sidekick:onboardingStatus` und begann nach dem Prozessabsturz einen Neustart.

**Status:** `FAIL` für den Start des gebündelten Sidekick-Runtimes aus dem 0.1.48-Portable-Payload. Der breitere sichtbare UI-/Funktionsumfang bleibt `NOT_TESTED`; dieser Befund ist kein vollständiger Produktabnahmebericht. Die exakten cec9-Prozesse aus diesem Lauf wurden beendet; die vier alten installierten 0.1.46-Prozesse blieben unverändert. Es wurden keine Provideraufrufe ausgelöst. Der Fehlerlog enthält keine Credentials und wurde hier nur in bereinigter Zusammenfassung dokumentiert.

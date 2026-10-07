# LastBrowser 0.1.48 cec9 – Laufzeit- und Quellprüfung ohne Computer Use

**Prüftag:** 7. Oktober 2026, America/Los_Angeles
**Auftrag:** `VM-0.1.48-TEST-ORDER.md`, gepinnt auf `9079d3be5793a9d2452862fe72ad58e4949a95ac`
**Kandidat:** `cec9d2f5ac8a22b8c492c138b7efcbef6d329aba` / `test-v0.1.48-20261007-cec9d2f`
**Grenze:** Keine Computer-Use-Steuerung, keine sichtbare Bedienung, keine Screenshots und keine Provider-/LLM-Aufrufe.

## Ergebnis

Der hashgeprüfte Portable-Kandidat startet in einem frischen synthetischen Profil. Die Electron-Haupt-App läuft mit dem erwarteten ASAR; der gebündelte Sidekick startet ebenfalls und besteht den lokalen Healthcheck. Das ist ein begrenzter Runtime-Smoke, keine vollständige Funktions- oder UI-Abnahme.

| Teilprüfung | Status | Befund |
|---|---|---|
| Portable-Wrapper | **PASS – Identität** | 175,170,969 Bytes; SHA-256 `0C3B0855DFDF2B4C2E5CC37EFA4421A6A94599EBBBEB3479E0FAC0B1AC68B357`; Authenticode `NotSigned`, wie erwartet. |
| Laufender App-Payload | **PASS – Identität** | Frisch entpacktes `resources/app.asar`: 64,012,655 Bytes; SHA-256 `918330622B3CC5F2D925AE2C31E2B24B1406DBAFCA6230C8CC7C7B038ABB663C`. Der App-Prozess lief aus dem entpackten cec9-Verzeichnis. |
| Isolierter Start | **PASS – Startpfad** | Portable-Wrapper, App, Renderer und gebündeltes Python liefen mit einem neuen absoluten `--user-data-dir` sowie prozesslokalen `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP` und `LASTBROWSER_DOWNLOADS_DIR`. Das Fenster meldete per Prozessmetadaten den Titel `Lastbrowser`; keine visuelle Inspektion. |
| Sidekick-Grundstart | **PASS – Healthcheck** | Gebündeltes Python startete `uvicorn cli.web_server:app` auf Loopback `127.0.0.1:8788`. `GET /health` antwortete HTTP 200: `ok=true`, `service=sidekick-dashboard`, Version `0.8.84`, `web_dist_ready=true`, 0 aktive Runs und Streams. |
| Gebündelte Python-Imports | **PASS** | Der Importcheck des im cec9-Quellstand vorhandenen Bundle-Verifiers lief mit dem gebündelten Python isoliert: `imports=ok`, Python 3.12.10, keine externen `site-packages`. |
| Bundle-Quellvergleich | **PASS – Inhalt normalisiert** | Alle 43 vom Verifier gelisteten Module sind vorhanden. 1 Datei ist byteidentisch; die übrigen 42 sind nach Normalisierung von LF/CRLF inhaltlich identisch; keine fehlenden oder semantisch abweichenden Dateien. Der rohe Hashvergleich des Verifiers meldet wegen unterschiedlicher Zeilenendendarstellung noch einen Hash-Mismatch. |
| Profil-/Runtimeisolation | **TEILWEISE PASS** | Frisches Profilargument, App-Prozess und Sidekick-Prozess zeigen auf das neue Temp-Testprofil bzw. den dazu entpackten Runtimepfad. Vergleich mit einer getrennten 0.1.48-Setup-Instanz und Persistenz nach normalem Neustart nicht geprüft. |
| Normaler Quit | **NOT_TESTED** | `CloseMainWindow()` wurde gesendet, aber die Testprozesse liefen weiter. Nur die eigenen Prozesse des synthetischen cec9-Laufs wurden danach beendet. Ein regulärer App-Quit ist nicht bestätigt. |
| Installations-, Design-, Quickchat-, Teamwork- und weitere UI-Fälle | **NOT_TESTED** | Keine sichtbare Bedienung. Keine Providerturns; Teamwork bleibt gemäß Auftrag read-only vorbereitet. |
| Quell-/Harness-Tests | **TEILWEISE PASS** | `compileall` PASS; 2 Bundle-Unittests, 39 Space-/Session-Navigationstests und 15 Website-Downloadzähler-Tests PASS. Die vollständigen 202 Desktop-Vitest-Dateien und die Sidekick-Pytest-Suite liefen nicht, da die Abhängigkeiten fehlen und der Auftrag deren Installation untersagt. |

## Laufzeitkorrektur

Ein früherer Direktstart wurde fälschlich als Paketfehler gewertet: Dabei wurde der Portable-Wrapper vor Abschluss seines Entpackvorgangs beendet. Der daraus entstandene unvollständige Temp-Baum fehlte unter anderem `web/api/independent.py`; der anschließende Importfehler gehört zu diesem abgebrochenen Testlauf und ist **kein bestätigter Produktfehler**. Der erste rohe Bundlevergleich verwendete außerdem einen älteren Temp-Baum. Beide Befunde sind durch den danach vollständig gestarteten frischen Lauf ersetzt.

Beim vollständigen Lauf stimmten ASAR-Hash, App-/Python-Prozesspfade und Sidekick-Healthcheck. Der rohe Bundle-Verifier vergleicht SHA-256 bytegenau. Der cec9-Quellarchivinhalt und das Windows-Paket unterscheiden sich bei den geprüften Python-Modulen in Zeilenenden; nach Normalisierung stimmen alle 43 erwarteten Inhalte überein. Der isolierte Importteil des Verifiers bestand separat.

## Quelltests

Das cec9-Quellarchiv lag ausschließlich in `%TEMP%`; Produktdateien wurden nicht verändert. Ohne Abhängigkeitsinstallation liefen:

- `python -m compileall -q services/sidekick` mit Python 3.12.14: **PASS**.
- `python -m unittest test_verify_independent_bundle -v`: **2/2 PASS**.
- Node.js v24.19.0 `--test services/sidekick/tests/space_navigation.test.cjs`: **39/39 PASS**.
- Node.js `--test lastbrowser.com/tests/download-counter.test.mjs`: **15/15 PASS**.

Diese 56 Source-/Harness-Tests und der Runtime-Smoke belegen nicht die sichtbaren Guest-Szenarien des Masterauftrags.

## Grenzen und nächster Schritt

Die vier vorbestehenden Prozesse der installierten 0.1.46-App (PIDs 7276, 9236, 9248 und 10104) wurden nicht geschlossen oder verändert. Der 0.1.48-Setup-Installer wurde nicht gestartet; es wurde kein vorhandenes Profil geöffnet oder zurückgesetzt. Die eigenen Prozesse des cec9-Tests wurden nach dem Smoke beendet.

Für die vollständige Abnahme bleiben sichtbare Szenarien aus dem Masterauftrag offen: Settings/Design, Provider-Scope, Quickchat innerhalb des vorhandenen Budgets, read-only Teamwork, First Launch, Sessionisolation, InPage-/Tab-Verhalten und weitere UI-Fälle. Ohne UI-Steuerung kann ich diese nicht als bestanden bewerten. Dieser Bericht gibt keine Produktfreigabe.


# LastBrowser 0.1.48 cec9 — Renderer-Startfehler bei Guest-Smoke

**Testdatum:** 7. Oktober 2026, America/Los_Angeles
**Auftrag:** Guest-Masterauftrag `VM-0.1.48-TEST-ORDER.md`, gepinnt auf `9079d3be5793a9d2452862fe72ad58e4949a95ac`; Design-Szenarien Revision 1.
**Kandidat:** `cec9d2f5ac8a22b8c492c138b7efcbef6d329aba`, `test-v0.1.48-20261007-cec9d2f`.

## Ergebnis

Der cec9-Renderer zeigte in einem frischen synthetischen Testprofil nach dem Start wiederholt den Root-Fehlerbildschirm statt der Browseroberfläche. Das Read-only-Statusresultat war `auth_enabled=false`, `logged_in=false`; eine Zugangssperre durch ein notwendiges Passwort war damit nicht die beobachtete Ursache. Der Sidekick startete und war erreichbar, aber die UI ließ sich auch über „Tabs zurücksetzen“ nicht wiederherstellen.

**Der Guest-Funktionstest ist wegen des reproduzierten Rendererfehlers fehlgeschlagen.** Settings, Design, Quickchat, Teamwork und die weiteren sichtbaren Szenarien konnten deshalb nicht abgenommen werden und bleiben `NOT_TESTED`.

| Prüfung | Status | Beobachtung |
|---|---|---|
| Portable-Wrapper-Identität | **PASS** | 175,170,969 Bytes; SHA-256 `0C3B0855DFDF2B4C2E5CC37EFA4421A6A94599EBBBEB3479E0FAC0B1AC68B357`; `NotSigned` wie im Auftrag erwartet. |
| Laufender cec9-Payload | **PASS – Identität** | Tatsächlich aus dem Portable extrahiertes `resources/app.asar`: 64,012,655 Bytes; SHA-256 `918330622B3CC5F2D925AE2C31E2B24B1406DBAFCA6230C8CC7C7B038ABB663C`. |
| Synthetische Profilisolation | **PASS – Startbedingung** | Eigener `--user-data-dir`-Pfad sowie prozesslokale `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP` und `LASTBROWSER_DOWNLOADS_DIR`. Vorhandene 0.1.46-Prozesse/Profile wurden nicht verändert. |
| Sidekick-Grundstart | **PASS** | `sidekick=ready`, `webuiHealth=ready`; keine Provider-/LLM-Aufrufe. |
| Renderer-/Browser-Shell | **FAIL** | Nach einer Bereitschaftsfrist von bis zu 60 Sekunden wurde kein Shell-DOM sichtbar. Der Root-Error-Boundary zeigte `The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called.` |
| Recovery „Tabs zurücksetzen“ | **FAIL** | Die angebotene Wiederherstellung im frischen Profil wurde ausgelöst; die Browser-Shell erschien danach nicht. |
| Settings und Appearance | **FAIL / nicht erreichbar** | Der Settings-Einstieg und das Appearance-Panel waren im Renderer nicht vorhanden; die Controls konnten nicht getestet werden. |
| Weitere Guest-Szenarien | **NOT_TESTED** | Quickchat, Provider-Scope, Teamwork, First Launch, Sessions, Tabs, Installations- und Quit-Fälle benötigen die nicht erreichbare UI oder eigene Gates. |

Als Vorlage diente `apps/desktop/scripts/smoke-appearance-matrix.mjs` aus dem exakt gepinnten cec9-Quellstand. Der nur temporär angepasste Harness (SHA-256 `A044818D66535DE5E36C318A27E4585797C65AC2CD0013E8869D556B511367C8`) verlängerte die Bereitschaftsfrist, speicherte den Screenshot und prüfte zusätzlich den im Error-Bildschirm angebotenen Reset des **synthetischen** Test-Tabs. Keine Produktdatei wurde geändert. Die Fehlermeldung war auch beim Start über den Portable-Wrapper und beim anschließenden Lauf des daraus extrahierten, hashgleichen App-Payloads sichtbar.

## Renderer-Stacktrace und Quellkorrelation

Der CDP-Rendererkonsolenmitschnitt zeigte denselben Fehler direkt aus `WebViewElement.getWebContentsId`, aufgerufen durch Electron `isAudioMuted`; danach meldet `[RootErrorBoundary] Uncaught renderer error`. Der minifizierte Frame war `app://bundle/assets/index-Di6L39UJ.js:497:50085`.

Im gepinnten cec9-Quellstand liest der Effect in `apps/desktop/src/renderer/App.tsx` bei Zeile 6236 `view.isAudioMuted()` nach Prüfung, dass lediglich `webviewRef.current` existiert. Der Aufruf liegt vor einem nachgewiesenen `dom-ready`-Zustand und ist an dieser Stelle nicht von `try/catch` umschlossen. **Quellkorrelation, als Diagnoseinferenz:** Das passt zur beobachteten Mount-/Readiness-Racebedingung und zum Electron-Fehler. Es beweist nicht, dass dies die einzige Fehlerquelle ist; der Produktcode wurde nicht geändert.
## Beleg

[Renderer-Startfehler im cec9-Gastprofil](evidence-0.1.48-appearance-smoke-2026-10-07/01-renderer-start.png)

Der Screenshot enthält nur den LastBrowser-Fehlerbildschirm aus dem synthetischen Profil. Vorhandene installierte 0.1.46-Prozesse wurden nicht geschlossen oder verändert; die eigenen cec9-Testprozesse wurden beendet. Es gab keine Provideranfragen, Anmeldungen, Schlüsselübernahmen, Paketinstallation oder Produktänderung.

## Abschlussgrenze

Das Ergebnis ist ein bestätigter Funktionsfehler beim Aufbauen der Browseroberfläche, keine vollständige Funktionsabnahme. Eine vollständige Abnahme dieses Kandidaten ist mit diesem Startzustand nicht möglich. Der Bericht gibt keine Produktfreigabe.

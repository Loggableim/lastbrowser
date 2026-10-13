# B7CA38BD — LLM-Nachprüfung nach Nutzer-Einrichtung

Zeitpunkt: 2026-10-08, ca. 09:20–09:28 America/Los_Angeles / 16:20–16:28 UTC. Direkter Nutzerauftrag: „ich hab einige llms verbunden du kannst nun auch das testen.“ Diese neue Freigabe betrifft kleine synthetische LLM-Tests mit den vorhandenen Nutzer-Providern; GPT ausschließlich kleine günstige Modelle. Der frühere B7-UI-Auftrag mit Budget 0 bleibt als Historie bestehen. Keine zusätzlichen Teamwork-Parallelturns ausgeführt.

Order-Zweig read-only aktualisiert: unverändert `871832b60035417c90cb8da583b2152d16f47782`. Berichtszweig `codex/lastbrowser-electron-shell`. Computer Use war verfügbar; der bereits gelesene Windows-Computer-Use-Skill wurde verwendet. Keine Produktdateien repariert, Credentials gelesen/übernommen oder Authentifizierungsdialoge bedient.

## Kandidat und Profil

Tatsächlich lokal installierte Version 0.1.48, Kandidat `b7ca38bd6db7b8a6e5fd814bd322b4916f561e73`, Tree `30f2deb9301b12cf8908e6acd633893b64caa00d`. Installation zuvor auf direkten Nutzerauftrag von 0.1.46 auf 0.1.48 aktualisiert. Versionswechsel war im What's-new-Dialog sichtbar und in der lokalen Uninstall-Registry bestätigt; das ist kein vollständiger Upgrade-/Datenmigrations-Abnahmetest.

- Setup-SHA-256 erneut geprüft: `c84618cd6da1f10010f445d443d39eb604c4dd489b41376a1c55928edad97c95`, 174198313 Bytes.
- Installierter ASAR erneut geprüft: `a196a883890cd33a68b0b02fdfb8f2cc8bf608e94fbf96b16e57578cb69b408b`, 64092071 Bytes.
- Installierte EXE im normalen lokalen Benutzerprogrammverzeichnis gestartet; kein Portable und kein Ersatzkandidat.
- Vorhandener synthetischer VM-Space `VM-UI-046-LLM`, sichtbare Conversation-Profilwahl `default`. Kein neues Profil angelegt, keine Schlüssel zwischen Profilen kopiert.
- Windows 11 Enterprise Evaluation, Build 26300, x64. Kein Clean-Snapshot-/CRT-Nachweis daraus abgeleitet.

Der Nutzer hat nach eigener Angabe mehrere LLMs eingerichtet. Sichtbar waren Ollama Cloud als ACTIVE, eine gespeicherte Modellauswahl und ein Google-Kontoeintrag. Andere Providerkarten bzw. Configure/Use-Buttons beweisen allein keine gültigen Zugangsdaten. Screenshots mit Kontokennung wurden ausdrücklich nicht gespeichert oder veröffentlicht. Keine Annahme, dass vorhandene Provider erfolgreich inferieren können.

## Ergebnis

| Teilfall | Status | Tatsächliche Beobachtung |
|---|---|---|
| Kandidatenpins / lokale 0.1.48-Installation | PASS | Setup und ausgeführter installierter ASAR entsprechen B7-Pins. |
| Nutzer-Einrichtung sichtbar | PASS, nur Zustand | Ollama Cloud ACTIVE. Settings: Default `inclusionai/ling-3.1-flash`, Saved choice / Beta untested; Modellkatalog Groups: 5. Conversation-Auswahl zeigt „inclusionAI: Ling 3.1 Flash (free)“. Keine erfolgreiche Modellantwort damit belegt. |
| Sidebar New Chat und zentraler New Chat | FAIL | Beide Klicks erzeugten keine sichtbare aktive Session. Nova Chat öffnete nur „Start or select a chat“. Control Center bestätigte „No active session selected“. |
| Modellliste im Arbeitschat | FAIL | „The model list could not be loaded. Your current model is still selected.“ Einmal Retry model list geklickt; Fehler blieb. Dropdown bot nur `default · current` und `AUTO · Execution unavailable`, keinen verifizierbaren kleinen GPT-Testkandidaten. |
| Rechter Assistant-/Quickchat-Zugang | FAIL | Toolbar-Botbutton öffnete einen Fehlerzustand statt bedienbarem Quickchat: „Last recorded state; live data unavailable.“ Error aufgeklappt: **„Profile reference is ambiguous or has moved“**. |
| Reload-Nachprüfung | FAIL | Nach Ctrl+R blieb derselbe Profilreferenzfehler sichtbar. Kein behobener Zustand behauptet. |
| Tatsächliche LLM-Antwort / Providerqualifikation | BLOCKED | Keine aktive Session und keine nutzbare Modellwahl. Keine Nachricht gesendet; Providerantworten von Ollama, Google oder GPT nicht geprüft. |
| Streaming / Stop / Reset / Folgeanfrage / Quickchat-Sessiontrennung | BLOCKED | Kein lauffähiger Chat. Keine Löschung/Reset vorhandener Daten als Umgehung versucht. |
| Teamwork | NOT_TESTED | Keine zusätzliche Freigabe für Parallelturns aus dem allgemeinen LLM-Auftrag abgeleitet; Startvoraussetzung zudem blockiert. |

Providerturns durch diesen Test: **0**. Durch diesen Test ausgelöste kostenpflichtige Inferenz: **0**. Keine Nachricht an einen externen Provider übermittelt. Eine Aussage über bereits vom Nutzer ausgelöste Providerkosten ist nicht möglich.

## Schritte und Screenshots

1. Order-Zweig gelesen und installierten ASAR geprüft. Vorhandenes LastBrowser-Fenster über Computer Use ausgewählt und aktiviert.
2. In AI & Local Models gespeicherten Providerzustand gelesen. Keine Configure-/Login-Aktion und keine neuen Credentials.
3. Zur Webansicht gewechselt; dort war eine vorhandene Google-Anmeldeablehnung sichtbar. Keine Authentifizierungsaktion, kein Try-again der Google-Seite, keine Sicherheitsbarriere umgangen; dieser fremde Seiteninhalt wurde nicht als LLM-Testprompt verwendet und nicht hochgeladen.
4. Sidebar New Chat, dann Nova Chat geöffnet. Nur leere Startansicht, keine Session. Retry model list einmal geklickt; Modell-Dropdown gelesen, keine Modellwahl verfügbar.
5. Zentralen New Chat geklickt, weiterhin keine Session. Toolbar-Botbutton öffnete den rechten Fehlerbereich; Error erweitert. Profilreferenzfehler fotografiert.
6. Ctrl+R, Fehler erneut fotografiert. Control Center → Conversation zeigte keine aktive Session. Globale Settings geöffnet; Conversation und AI & Local Models gelesen, ohne Änderungen oder Speichern.

Bereinigte Belege unter [evidence/b7-llm-20261008](evidence/b7-llm-20261008/):

- `01-chat-and-profile-reference-error.png`: Chatstart, Modelllistenfehler und rechter Profilreferenzfehler.
- `02-error-persists-after-reload.png`: gleicher Zustand nach Reload.
- `03-saved-model-provider-and-profile-error.png`: gespeichertes Modell in Conversation bei weiter bestehendem Fehler.
- `04-ollama-cloud-active-with-profile-error.png`: Ollama Cloud ACTIVE, ohne Zugangsdaten oder Kontoangaben.
- `05-saved-choice-and-routing-state.png`: gespeicherte Auswahl, Groups 5 und Routingfelder; keine Secrets.

Zusätzliche beobachtete Inkonsistenz: Active provider `ollama-cloud`, gespeicherter Modellidentifier `inclusionai/ling-3.1-flash`; Advanced provider routing zeigte Provider und Model provider weiterhin `openai-codex`, Codex Disabled. Das ist lediglich ein sichtbarer Konfigurationszustand; nicht als Ursache des Profilreferenzfehlers oder Beleg eines falsch versandten Requests ausgeben. Die genaue Quellursache wurde nicht untersucht.

## Voraussetzung für Fortsetzung

Der Nutzer hat Modelle eingerichtet, aber die App kann im aktuellen VM-Testprofil keinen bedienbaren Chat bereitstellen. Erst den Profilreferenz-/Session-/Modelllistenfehler in einem freigegebenen korrigierten Kandidaten beheben oder einen unterstützten UI-Weg zur eindeutigen Auswahl des bereits eingerichteten Profils bereitstellen. Keine weiteren API-Keys anfordern, bevor dieser Startfehler beseitigt ist. Danach kurze synthetische Antwort, Streaming/Stop und sichere Quickchat-Sessionprüfungen nachtesten; GPT nur explizit erkennbares kleines günstiges Modell. Dieser Bericht ist keine Provider-Abnahme.

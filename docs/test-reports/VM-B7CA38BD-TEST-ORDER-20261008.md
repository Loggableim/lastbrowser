# LastBrowser 0.1.48 — B7CA38BD Guest-Testauftrag

Direkter Humanauftrag: „Testversion zustellen →“. Dieser Auftrag gilt nur nach tatsächlicher Veröffentlichung und erfolgreicher Hashprüfung des unten gebundenen Testpakets. Er ersetzt für neue UI-Prüfungen den Kandidaten 9A943; bestehende Aufträge, Berichte und Budgets bleiben als Historie erhalten. Kein Signing-, Stable- oder Store-Auftrag.

## Kandidat und Downloads

- Release: https://github.com/Loggableim/lastbrowser/releases/tag/test-v0.1.48-b7ca38bd-20261008
- Guest-ZIP: https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.48-b7ca38bd-20261008/LastBrowser-0.1.48-b7ca38bd-guest-test.zip
- Standalone-Manifest: https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.48-b7ca38bd-20261008/candidate-manifest.json
- Sourcecommit `b7ca38bd6db7b8a6e5fd814bd322b4916f561e73`, Tree `30f2deb9301b12cf8908e6acd633893b64caa00d`, Parent `9a94340853c90dd9f19393e83ae5c09fa1a430b1`.
- Guest-ZIP: 348046583 Bytes, SHA-256 `a083d83bd1d94130ab68da8850882c3a833b7513d9c8008049b01d316c3aa95f`.
- Standalone-Manifest: 2873 Bytes, SHA-256 `33000f3447e5bb2f2718b30336d3abfcbe83f18fe5987bfe4218ae9ee2488101`.
- Enthaltenes Setup: 174198313 Bytes, SHA-256 `c84618cd6da1f10010f445d443d39eb604c4dd489b41376a1c55928edad97c95`.
- Enthaltenes Portable: 173844132 Bytes, SHA-256 `560b367378fef4b60599dbbf82c6f7e23660e6b3d74f9ec42fbee5a1e4d28683`.
- Installiertes/entpacktes ASAR: 64092071 Bytes, SHA-256 `a196a883890cd33a68b0b02fdfb8f2cc8bf608e94fbf96b16e57578cb69b408b`.
- Sourcearchiv: 186584523 Bytes, SHA-256 `2023130f675243f0fb67342cddce261dd24da77d692b918f2c8ffbab30cd8411`; exakter Git-Source ist zusätzlich auf `codex/ui-integration-20261008` verfügbar.

Standalone- und eingebettetes Manifest sind bewusst verschieden: Nur das Standalone-Manifest kann den ZIP-Hash enthalten, ohne eine rekursive Hashabhängigkeit zu erzeugen. Prüfe zuerst ZIP und Standalone-Manifest, danach beide Wrapper und den tatsächlich ausgeführten ASAR. Bei fehlenden/abweichenden Dateien `PACKAGE_NOT_AVAILABLE`/`CANDIDATE_MISMATCH` melden und stoppen. Keine Ersatzversion als b7 ausgeben. Unsigned/NotSigned ist der bekannte Status dieser autorisierten Testversion; keine Sicherheitsrichtlinien umgehen.

## Evidenzgrenzen und Kosten

Gemeinsame Source-Pipeline: 212 Suites / 1942 Tests, Build/Syntax und Store-Preflight bestanden. Unabhängige Paketintegrität: PASS; 10523 identische Dateien in Preview/Setup/Portable. Dies ist keine Guest-/Feature-/Installationsabnahme. Alte strikte Startprobes scheiterten an `.local-ai-setup`: Im tatsächlichen Portable-Screenshot/DOM ist zuerst der KI-Auswahldialog `.first-run-fullscreen-wrap` sichtbar; lokale Einrichtung folgt erst nach Auswahl. Raw-FAILs bleiben erhalten, Preview-Erklärung ist nur Source-/Payloadinferenz. Prüfe den tatsächlichen sichtbaren Ablauf und nicht allein eine CSS-Klasse.

Nur entbehrliche Guest-Testprofile und synthetische Daten verwenden. Providerturns und Kosten: **0**. Keine echten Konten, Geheimnisse, automatischen Modell-Downloads oder Inferenz. Keine Host-Installation oder Host-VM-Steuerung ableiten. Bereits bestehende Guest-Installationsfreigabe gilt für genau diesen Kandidaten; Update nur gegen tatsächlich verifizierte kompatible Baseline testen, sonst BLOCKED. Kein Budgetreset durch neuen Kandidaten. Modellqualität, reale Teamwork-Provider und Clean-Windows-CRT bleiben getrennte Aufträge/Gates.

## Priorisierte praktische Szenarien

1. **B7_FIRST_RUN, Revision 1:** Sauberer synthetischer Guest-Profilstart, Screenshot und Fokuszustand. Sichtbare KI-Auswahl mit beiden Wegen belegen. „Ohne KI“ muss in die normale Shell führen; „KI einrichten“ in den entsprechenden Einrichtungsablauf. Zweiten Weg in getrenntem Testprofil prüfen. Netzwerk/Downloads vorher sperren, falls Einrichtung Downloads anstoßen kann; keine Inferenz oder Providerturns. Reload/Neustart und gespeicherte Auswahl beobachten.
2. **AI_NEW_CHAT_20261008, Revision 2 (b7):** Den Ablauf aus [VM-AI-NEW-CHAT-20261008.md](VM-AI-NEW-CHAT-20261008.md) mit diesen b7-Pins statt 9A943 wiederholen: AI-Reiter, Neuer Chat, Fokus sofort/nach 1/3/10 Sekunden, synthetischer Text ohne Senden, erneuter Neuer Chat und Rückwechsel. Layout/Quickchat/SpaceAssistant/Sessionfehler dokumentieren. Historische Revision 1 nicht überschreiben.
3. **B7_ADDRESS_IME_PROFILE, Revision 1:** Adressvorschläge aus eigener synthetischer History, Tastaturauswahl/Enter und explizite Suche. Echte IME-Komposition mit Kandidatenauswahl prüfen, nicht aus Sourceguards ableiten. Browserprofil A→B→A sowie privates Fenster: keine fremden History-Vorschläge. Letzten Tab schließen: leere Startansicht, Browserfenster bleibt offen. Screenshots und tatsächliche Eingabeschritte liefern.
4. **B7_DOWNLOAD_PIN, Revision 1:** Kontrollierter lokaler Download ohne externe Quelle; Animation am tatsächlichen Klickursprung, ikonischer Top-Button, untere Sidebar-Anzeige. Floating-Drag mit sichtbaren Dockzielen, Snap/Resize/Persistenz. Tab auf Pinned Apps ziehen; Rootdomain/Subdomain in beiden Reihenfolgen deduplizieren, Tab erhalten, vollständigen Titel nach Reload prüfen. Keine fremden Dateien downloaden.
5. **B7_MODEL_ASSISTANT, Revision 1:** Modellstore mit ehrlichem Hardware-/Unknown-Zustand, Advanced-Details zunächst geschlossen, bewusste Hardwareprüfung reagiert. Keine Modellinstallation oder Inferenz auslösen. Space Assistant kompakte Übersicht, Connections aufklappbar, schmaler Viewport/Tastaturbedienung und Composer sichtbar; Konfiguration nicht mit Live-Verbindung gleichsetzen.
6. **B7_GOALS_SCHEDULER_RIGHTS_QUICKCHAT, Revision 1:** Nur vorhandene, ausdrücklich kontrollierte lokale Testfixtures ohne kostenpflichtige/extern ausführende Provider benutzen. Ohne solche Fixtures Zustand anzeigen/Reload prüfen und Ausführungsfälle BLOCKED melden. Ziel explizit anlegen, Pause/Resume/Ende und Reload-Rehydration samt Revisionen prüfen, keine unbeabsichtigte autonome Fortsetzung. Scheduler anzeigen/deaktivieren ohne fälligen Dispatch. Rechteentzug über den tatsächlichen Quittungs-/Zustandsvertrag und verweigerte Folgeaktion prüfen. Summarize muss im Schnellchat landen; Reset erst nach bestätigtem Stop/ACK und ohne fremde Chat-/Space-Daten zu löschen. Nicht pauschal einen bestimmten Endstatus wie interrupted erzwingen.

Danach vorhandene installierte Version/Update/Neustart/Portable-Grenzen dokumentieren; Deinstallation erst nach allen anderen Fällen und synthetische Profildaten-Erhaltung getrennt prüfen. Fehlende saubere Windows-Baseline/CRT-Modulevidenz als offen melden, nicht aus Hoststart ableiten.

## Rückbericht

Berichte nach `docs/test-reports/` auf `codex/lastbrowser-electron-shell`. Pro Fall Candidate-/Wrapper-/ASAR-Pins, Auftragscommit, Test-ID/Revision, synthetisches Profil, Uhrzeiten, tatsächliche Schritte, redigierte Screenshots/Logs, Observed/Expected und PASS/FAIL/BLOCKED/NOT_TESTED angeben. Keine Credentials, personenbezogenen URLs, Datenbanken oder Binärdateien committen. Ursachen nur als belegte Feststellung oder klar markierte Hypothese. Zustellung ist keine Ausführung; keine vollständige Abnahme aus einzelnen Screenshots ableiten.

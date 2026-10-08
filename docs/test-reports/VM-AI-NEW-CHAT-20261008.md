# AI → Neuer Chat: kandidatengebundener Guest-Zusatzauftrag

Test-ID: `AI_NEW_CHAT_20261008`, Szenariorevision 1. Direkter Humanauftrag: im VM-Guest den Reiter AI öffnen, Neuer Chat anklicken und das tatsächliche Verhalten analysieren. Transport über den bestehenden GitHub-Pollzweig; Bericht nach `docs/test-reports/` auf `codex/lastbrowser-electron-shell`.

## Kandidat und Grenzen

Verwende den vorhandenen [9A943-Testkandidaten](VM-9A943-TEST-ORDER-20261008.md). Sourcecommit `9a94340853c90dd9f19393e83ae5c09fa1a430b1`, Tree `7e5f3e931e1487754d4b68c7cce5efa59cddbb8a`; installierter ASAR-SHA-256 `69732f7115157fc5405db63d2dbfad5e24fff87f1f91aa14eb67db9079511adc`. Setup-SHA-256 `9ef5c38cc670f3ff1ad4dff6fb586b48a64c8bfbc2bfd1e6d6ba5daa86e47d13`, Portable-SHA-256 `d42cfe64f77577830d501228ca8a677335d25399ef8507a51dc80419a56034c6`. Release: https://github.com/Loggableim/lastbrowser/releases/tag/test-v0.1.48-9a943408-20261008 . Neue ungepackte UI-Commits sind darin nicht enthalten.

Vor dem Test tatsächliche Appversion, verwendeten Wrapperhash, installierten ASAR-Hash und vorhandenen Candidate-Receipt erfassen. Bei fehlenden oder abweichenden Pins `PACKAGE_NOT_AVAILABLE` bzw. `CANDIDATE_MISMATCH` melden; keine Ersatzversion als 9A943 ausgeben. Nur bestehende synthetische Guest-Testprofile verwenden. Keine Host-VM-Bedienung, echten Konten, Geheimnisse oder persönlichen Daten. Kostenbudget und erlaubte Providerturns: **0**. Keine Nachricht senden, keine Modellinferenz, Downloads oder zusätzlichen Installationen auslösen. Bereits vorhandene Testbudgets und Journale bleiben erhalten.

## Durchführung

1. AI-Reiter der Seitenleiste öffnen. Ausgangszustand mit Screenshot, sichtbarem Chat/Space/Quickchat-Kontext und Uhrzeit festhalten.
2. Einmal **Neuer Chat** anklicken. Oberfläche, Conversation-ID bzw. sichtbaren neuen Chatstatus und Chat/SpaceAssistant/Quickchat-Anordnung protokollieren. Erwartung: ein eindeutig neuer, leerer Arbeitschat im richtigen Scope; kein veralteter Chatinhalt oder fremdes Panel. Beobachtung unabhängig von dieser Erwartung berichten.
3. Tatsächlichen Tastaturfokus unmittelbar sowie nach 1, 3 und 10 Sekunden erfassen. Sichtbare Spinner, Layoutsprünge, leere oder doppelte Panels und Fehlermeldungen fotografieren. Wenn möglich Console-/Applogs redigiert sichern; keine Zugangsdaten oder personenbezogenen URLs aufnehmen.
4. Kurzen synthetischen Text `Guest focus check` tippen, **ohne zu senden**. Dokumentieren, welches Feld den Text empfängt und ob Eingabe/Zeilenlayout stabil bleiben.
5. Noch einmal **Neuer Chat** anklicken. Prüfen, ob ein weiterer leerer Chat entsteht, der ungesendete Text korrekt behandelt wird und keine `Session not found`-Fehlermeldung erscheint. Zur vorherigen Ansicht zurückwechseln und Scope/Inhalte/Fokus erneut beobachten.
6. Automatische Requests nur beobachten. Bei unerwarteter externer Ausführung stoppen und Zieltyp/Zeitpunkt redigiert dokumentieren; keinen Providerturn zulassen. Harmlose Status-/Sessionabfragen getrennt von Modellaufrufen benennen.

## Bericht und Abnahme

Bericht mit Test-ID/Revision, Auftragscommit, tatsächlichen Candidatepins, Start/Ende, reproduzierbaren Klick-/Tastaturschritten, Screenshots bzw. redigierten Videosteps und Consolefehlern liefern. **Observed** und **Expected** getrennt führen. Vermutete Quellursachen ausdrücklich als Hypothesen kennzeichnen; keine Ursache erfinden. Status `PASS`, `FAIL`, `BLOCKED` oder `NOT_TESTED` anhand tatsächlicher Ausführung, nicht anhand zugestelltem Auftrag. Providerturns und Kosten jeweils 0 bestätigen oder eine unerwartete Abweichung melden. Deduplizierung nach Candidatehash, Test-ID, Revision und synthetischem Testprofil. Kein GitHub-Upload von Binärdateien, privaten Logs oder Profil-Datenbanken.

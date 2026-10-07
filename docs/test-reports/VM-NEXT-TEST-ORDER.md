# LastBrowser: aktuelle VM-Testaufträge

Stand: 7. Oktober 2026. Dieser Einstieg gehört zum Tester-Zweig `codex/lastbrowser-electron-shell`. Die verbindlichen Aufträge liegen auf dem Dokumentationszweig und sind hier auf Commit `9079d3be5793a9d2452862fe72ad58e4949a95ac` gepinnt.

## 1. Allgemeine Funktions- und UI-Abnahme

[LastBrowser 0.1.48: verbindlicher Guest-Masterauftrag](https://github.com/Loggableim/lastbrowser/blob/9079d3be5793a9d2452862fe72ad58e4949a95ac/docs/test-reports/VM-0.1.48-TEST-ORDER.md)

Kandidat: **cec9d2f**, öffentliche unsignierte Testversion `test-v0.1.48-20261007-cec9d2f`. Download-, Größen- und ASAR-Hashvorgaben stehen ausschließlich im verlinkten Auftrag. Automatische Updates sind in diesem Offline-Testkandidaten deaktiviert; er dient nicht der Update-Abnahme.

## 2. Signiertes synthetisches Updatepaar

[Verbindlicher Guest-Auftrag: normales Beenden und Neustart](https://github.com/Loggableim/lastbrowser/blob/9079d3be5793a9d2452862fe72ad58e4949a95ac/docs/test-reports/VM-SYNTHETIC-UPDATE-PAIR-20261007.md)

Kandidat: **d6b61f3**, getrenntes signiertes Paar **0.1.47 → 0.1.48**, Release `test-synthetic-update-pair-20261007-d6b61f3`. Empfangshashes, Installation, Datenerhalt und ausschließlich gastseitiger Loopback-Feed stehen im verlinkten Auftrag. Dieses Paar ist nicht der cec9-Designkandidat und nicht das frühere öffentliche signierte 0.1.47-Paket.

## Nachweise und Zuständigkeit

Nur Codex innerhalb der tatsächlichen isolierten Windows-VM führt die Tests aus. Kein Host-Ersatzchat, keine Produktreparaturen, neuen Pakete, Signierung oder Veröffentlichung. Zugangsdaten nicht in Berichte übernehmen. Konkrete Provider- und Zugriffsgates aus den jeweiligen Aufträgen gelten weiter.

Ergebnisse eindeutig nach Quellstand, Paket-/ASAR-Hash und Szenario trennen. Bestehende Gastberichte erhalten; neue Nachweise separat ablegen. Ältere 0.1.46-/0.1.47-Berichte sind historische Ergebnisse und keine aktuelle Abnahme dieser Kandidaten. Statische Paketprüfungen ersetzen keine tatsächliche Guest-Installation oder Laufzeitprüfung.

## Teamwork: ausschließlich lesende Vorbereitung Stufe P

[Konkreter Zweiprovider-Plan](VM-TEAMWORK-CURRENT-CANDIDATE-TURN-PLAN-20261007.md): **PREPARATION_ONLY / P_READ_ONLY_ALLOWED / S_C_D_NOT_AUTHORIZED**.

Im exakt oben zugeordneten cec9-Guest-Kandidaten scoped Modell-IDs/Katalogbereitschaft für GPT/Codex gpt-6-luna und OllamaCloud gpt-oss:20b, vorhandene Rollen/Policy, bestehendes Budgetjournal und notwendige Setupänderungen ausschließlich read-only erfassen. Kandidaten sind keine Entitlementbehauptung. Exakte Provider-/Modell-ID, Scopebindung, tatsächlichen Kandidaten-/ASAR-Pin und vorhandene Budgetreste bzw. UNKNOWN melden; keine Secrets exportieren. Fehlt eine Voraussetzung, konkret BLOCKED/UNKNOWN berichten, kein Ersatzmodell improvisieren.

**Kein Senden, keine Testconnection-Inferenz, kein Settingssave, kein Budgetreset, keine Anmeldung und kein Credentialexport.** S/C/D sind nur Vorschläge zur späteren konkreten Humanfreigabe. Dieser Auftrag autorisiert keinen echten Mehrproviderturn, Stop-/Deadlineturn oder Setupmutation. Vorhandene gefrorene Funktions-/Updateverträge und Guest-Berichte bleiben erhalten. Ergebnis der Stufe P mit bereinigtem Evidencepfad an den CEO melden.

## Guest-Nachtrag: Portable-Start bereits im Testauftrag erlaubt

Der Guest-Bericht auf Commit `23909186584714e5776b9aa95449cbfe98cc38bb` bestätigt im Nachtrag18:50UTC beide aktuellen cec9-Wrapper mit erwarteten Bytes/SHA-256 (Setup367a2208…, Portable0c3b0855…) und NotSigned. Frühere Download-/Pinblockaden sind damit historisch; App-Laufzeit und tatsächlich extrahierter ASAR bleiben NOT_TESTED. Kein Snapshot und kein Setupstart sind bestätigt.

Die bestehende direkte Humanfreigabe für neue Paket-/Guest-Funktionstests und Computer Use („kannst jederzeit testen“) sowie der vollständige Masterauftrag erlauben den Start **dieses exakten hashgeprüften Portable** in einem frischen synthetischen entbehrlichen Guest-Profil. Dafür ist keine erneute allgemeine Startfreigabe nötig. Dies autorisiert weder Setupüberschreiben noch Providerturns oder Einstellungen-/Accountübernahme.

Vorhandener Isolationsweg: Portable-NSIS reicht Kommandozeilenparameter an die eingebettete Electron-App durch (`StdUtils.GetAllParameters`, `ExecWait … $R0`). Die App nutzt `app.getPath('userData')` für Browserzustand und den Runtime-Root; gebündelter Sidekick bekommt daraus SIDEKICK_HOME. Der vorhandene Portable-Smoke startet mit Electron-Parameter `--user-data-dir=<frischer-absoluter-Profilpfad>` und pro Prozess eigenen USERPROFILE/APPDATA/LOCALAPPDATA/TEMP/TMP-Verzeichnissen sowie LASTBROWSER_DOWNLOADS_DIR. Das ist ein vorhandener Testvertrag, keine neue LastBrowser-CLI. Kein CDP-Port für manuelle Guest-UI nötig.

Guest startet nur aus einem neu angelegten entbehrlichen lokalen Verzeichnis mit diesen **prozesslokalen**, nicht globalen Umgebungswerten und dem frischen absoluten user-data-dir. Bereits laufende LastBrowser-Instanzen nicht ungeprüft schließen oder deren Profile verwenden; Single-instance-Weiterleitung und tatsächliche Profil-/Runtimepfade vor Funktionsprüfungen kontrollieren. Bei Weiterleitung in alte App, nicht bestätigbarer Isolation oder nicht möglicher prozesslokaler Einrichtung BLOCKED berichten, keinen Doppelklick ins Standardprofil als Ersatz.

Statische Quellen: `scripts/probe-portable-executable.cjs`, `node_modules/app-builder-lib/templates/nsis/portable.nsi`, cec9 `apps/desktop/src/main/services.ts`. Diese belegen den vorhandenen Isolationsvertrag; aktuelle Guest-Umsetzung ist noch nicht bewiesen. Nach tatsächlichem Start zuerst Produktversion, extrahierten/laufenden ASAR-Pin91833062… und benutzte Profil-/Runtimepfade messen. Abweichung: stoppen/BLOCKED. Bestehende Installation und Nutzerprofile nicht überschreiben, keinen Snapshot behaupten. Kein zusätzlicher Providerturn, keine Testconnection-Inferenz und kein Credentialexport. Teamwork-StufeP bleibt ausschließlich read-only.

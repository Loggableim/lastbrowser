# Final integration gate

Stand: 2026-10-05. Dies ist ein ausführbarer Ablaufplan, kein bestandener Abschlussnachweis. Root koordiniert den Freeze, Git-Index und die finalen Artefakte.

## Voraussetzungen

- FIX1: tatsächlicher lokaler Host-/AUTO-Turn, persistierte identische Erfolgsbelege, bestätigtes Prozess-Cleanup und dokumentierte verbleibende Routinggrenzen.
- FIX3: tatsächliche parallele Child-Providerrequests unter gültigem Budget und beobachteten Fixture-Limits; Antwort-Deltas, Bubble-Einklappzustand und ursprünglicher Parent-Scope.
- FIX4: reale Profilabnahme und gemessene DE/JA-Headergeometrie mit Moduswechsel ohne Gesprächsreset.
- Alle aktiven Bereiche eingefroren; keine konkurrierenden Build-/Packagingprozesse. Bestehende Benutzeränderungen erhalten.

## Gesamtprüfungen nach Freeze

Aus dem Repositoryroot:

```powershell
npm run test:run
npm --workspace apps/desktop run build
npm run verify:store
& apps/desktop/runtime/python/python.exe -I -B -m compileall -q services/sidekick
```

`test:run` führt denselben Desktop-Vitestbestand wie `npm test` nichtinteraktiv aus. Backend-Vollausführung verwendet exakt den gebündelten Interpreter mit dem dokumentierten parent-only Pytest-Overlay aus `docs/root-python-test-environment.md`; keine Installation in die gemeinsame Runtime. Collection wurde bereits geprüft, Ausführung bleibt offen. Befehle, tatsächliche Exitcodes und Ergebnisse dauerhaft erfassen. Jeder Sourcefix erfordert passende Regressionen und ein erneutes finales Gate.

## Unsigned Testpakete

```powershell
node scripts/package-feature-preview.cjs
node scripts/package-dist-preview.cjs <neues-feature-preview-verzeichnis>
node scripts/probe-preview-executable.cjs <neues-feature-preview-verzeichnis>
node scripts/probe-portable-executable.cjs <neues-dist-preview-verzeichnis>
```

Den ausgegebenen absoluten Previewpfad übernehmen; kein historisches Paket wiederverwenden. Installer und Portable verwenden dasselbe `win-unpacked`. Source-HEAD, eingefrorenen Dirty-Stand, ASAR- und Ressourcenhashes sowie Artefaktgrößen/SHA256 festhalten. Ressourceninventar auf private Daten, SQLite-Sidecars, `auth.json`, `config.yaml` und GGUF prüfen. Start-Probes beweisen keine NSIS-Installation, kein Upgrade und keine Clean-Windows-Abhängigkeiten.

## Praktische Abschlussgrenzen

Der User hat direkte Host-UI-Tests ausdrücklich freigegeben. Eigene Browser-/Backendprofile und kontrollierte Testdaten bleiben vorgeschrieben. Der Host eignet sich für normale Appabläufe und isolierte Installationsprüfungen; bestehende Entwicklungsabhängigkeiten verhindern einen Clean-Windows-Nachweis. VirtualBox `poker` ist zusätzlich verfügbar und besitzt den vor den Tests angelegten Snapshot `lastbrowser-before-acceptance-20261005`; sie ist aktuell ausgeschaltet. Kein VM-Reset oder Zugriff auf unbekannte Zugangsdaten erforderlich.

Pflichtabläufe aus dem Acceptance-Ledger im frischen Paket ausführen. Installation, versionierter manueller Upgrade, Datenerhalt und Neustart benötigen eine geeignete isolierte Windows-Umgebung. Sandbox-Executable wurde auf diesem Host nicht gefunden; keine Features heimlich aktivieren. Runtime-Lizenzberechtigung und Clean-Windows-Closure bleiben getrennte Schranken. Keine Modellgewichte im Installer; ein erlaubter First-Launch-Download ersetzt keinen qualifizierten Inferenznachweis.

Erst anschließend Windows-Store-Integration-Agent mit konkretem Artefaktstand beauftragen. Der User hat am 2026-10-05 SimplySign und die Verwendung des eigenen per USB angeschlossenen Xiaomi über ADB für den Signiertoken ausdrücklich freigegeben. Signierung erst am final geprüften konkreten Artefaktstand durchführen; Token ausschließlich transient im autorisierten Authentifizierungspfad nutzen, nie ausgeben oder speichern. Website-/Versionsupdate ist ebenfalls autorisiert; Store-Einreichung und weitere Veröffentlichungen bleiben gesonderte Aktionen.

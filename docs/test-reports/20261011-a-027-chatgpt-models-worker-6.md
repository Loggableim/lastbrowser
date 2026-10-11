# A-027 — Einzelmodell-Auswahl und aktive Modelle

Stand: 2026-10-11. Worker 6. Erstaufnahme bei `f54b16b8`; PR-Basis: aktuelles `release/v0.1.52` bei `d39ae7fa`. Arbeitsbranch: `codex/a-027-model-selection-20261011`.

## Umsetzung und Grenzen

- Die Chat-Auswahl in Quickchat und nativem Chat verwendet die aktuelle, profilgebundene Modellliste. Nur einzelne, aktive Modelle erscheinen; die Native-Send-Grenze prüft zusätzlich Verbindung, Verfügbarkeit und die aktive Auswahl.
- Unter **System > AI & Local Models** lassen sich erkannte Modelle pro Anbieter mit **Active in selection** einzeln deaktivieren. Die Einstellung speichert nur ausdrückliche Abwahlen je Browser- und Backendprofil. Neue Scanergebnisse sind damit automatisch aktiv; Abwahlen überleben einen Neustart. Haupt- und Zusatzmodelle des Katalogs werden berücksichtigt.
- Eine gespeicherte inaktive oder nicht mehr verfügbare Modellauswahl wechselt auf ein aktives Modell mit Hinweis. Ohne aktives Modell gibt es einen Hinweis mit Link zu den Modelleinstellungen; ein Start wird verhindert.
- Teamwork, Smart Track und weitere virtuelle MultiAgent-Einträge sowie der Tab **AI Orchestration** sind durch `VITE_ENABLE_AI_ORCHESTRATION` standardmäßig ausgeschaltet. Auch direkte Tab-Navigation wird abgewiesen.
- Keine Änderung an `ZIELBILD.md`, `goal.md`, Backenddateien, Release-Metadaten, Signierung oder Paketierung.

## Red-before-green

Vor Implementierung schlugen vier neue A-027-Regressionen auf der Erstaufnahme fehl: virtueller Eintrag im Einzelmodell-Picker, direkt erreichbarer Orchestrierungs-Tab, abgewiesenes verbundenes Modell ohne frühere Chat-Evidenz und zugelassene gespeicherte Teamwork-Auswahl. Nach der Umsetzung: 7/7 neue A-027-Tests grün. Die zusätzlichen Tests decken Opt-out-Persistenz und neue Modelle, Fallback/Leerauswahl sowie die Native-Send-Grenze ab.

## Prüfung im Quell-Worktree

| Schritt | Ergebnis |
| --- | --- |
| `npm ci` | PASS; 424 Pakete installiert |
| `npm run test:run` | PASS; 216 Testdateien, 1.974 Tests |
| `CI=1 npm test` | PASS; 216 Testdateien, 1.974 Tests |
| `npm --workspace apps/desktop run build` | PASS; TypeScript und Vite, Hinweis auf bestehende Bundlegröße |
| `npm run build` | PASS; TypeScript und Vite |
| `npm run verify:store` | PASS; 39 PASS, 2 WARN, 0 FAIL |
| `python -m compileall -q services/sidekick` | PASS |
| `git diff --check` | PASS |

Die erste vollständige Testsuite war durch eine fehlende lokale Windows-Electron-Testdatei und eine alte Quelltext-Erwartung rot. Das passende Electron-Archiv lag bereits im lokalen Cache und wurde nur im ignorierten `node_modules` wiederhergestellt; die veraltete Erwartung wurde an den neuen Fallback angepasst. Danach lief die DOM-Probe mit dem tatsächlichen Electron-Prozess grün.

Die zwei Store-Warnungen betreffen vorläufige Screenshots und das nicht bereitgestellte signierte Windows-Paket. Diese Quell- und Build-Prüfung belegt weder ein geprüftes Release-Paket noch VM-, Konto-, Geräte- oder Store-Akzeptanz. Reale Provider-Anmeldung und Live-Chat wurden nicht durchgeführt.

## Integration und Zielbild-Vorschlag

A-026 ([PR #40](https://github.com/Loggableim/lastbrowser/pull/40)) ist weiterhin offen und berührt Copilot, Native Chat, Einstellungen, Picker-Helfer und zugehörige Tests. A-008a ([PR #39](https://github.com/Loggableim/lastbrowser/pull/39)) berührt `App.tsx`. Der Integrator muss beide Diffs vor dem Merge in `release/v0.1.52` zusammenführen und die Gates auf dem tatsächlich kombinierten Stand erneut ausführen.

Vorschlag für `ZIELBILD.md`/`goal.md` (bewusst nicht dort eingetragen):

> Der Release-Chat zeigt verbundene und verfügbare Einzelmodelle. In System > AI & Local Models können Nutzende jedes erkannte Modell für die Chat-Auswahl ein- oder ausschalten. Neue Modelle sind zunächst aktiv; ausdrücklich deaktivierte Modelle bleiben auch nach einem Neustart deaktiviert. Eine gespeicherte Auswahl, die nicht mehr aktiv ist, wechselt mit Hinweis zu einem aktiven Modell. Fehlt ein aktives Modell, verweist der Chat auf die Modelleinstellungen. AI Orchestration einschließlich Teamwork und MultiAgent-Auswahl bleibt bis zur ausdrücklichen Freischaltung durch ein standardmäßig ausgeschaltetes Feature-Flag verborgen.

# Implementierungsauftrag für Vesper

Du bist Vesper und implementierst den erweiterten Agentenzugang und die Diagnosebasis von LastBrowser. Cid hat dir diese Umsetzung ausdrücklich zugewiesen. Argus bleibt bei Browserdebugging, Willhaben und den Chat-/Quickchat-/GPT-/OpenCode-Livetests. Nord koordiniert Integration und neue private Windowsbetas. Deine Aufgabe ist der tatsächliche Codeausbau, nicht nur ein weiterer Plan.

## Verbindliche Grundlage

Repository: `Loggableim/lastbrowser`.

Beginne auf [Draft-PR 104](https://github.com/Loggableim/lastbrowser/pull/104), Branch `codex/argus-diagnostics-v1-20261014`. Der Diagnose-Codecommit `fad627730504a51876227011003e54fa54bea8c7` muss in deiner Basis enthalten sein. Folge vollständig `docs/ARGUS_AGENT_BROWSER_IMPLEMENTATION_PLAN.md` im PR. Die vorhandene Diagnose ist in `docs/ARGUS_DIAGNOSTICS.md` beschrieben.

Lies Plan und geltende `AGENTS.md` vor Änderungen. P00 bis P16 definieren Reihenfolge, Entscheidungen, Grenzen, Tests und Abnahme. Neue vorgeschlagene Modulpfade sind Sollpfade, keine schon vorhandenen Dateien. Prüfe die tatsächliche Struktur, erstelle Module mit ihren Imports und Tests und behaupte keine nicht vorhandene Funktion.

## Auf der richtigen Quelle starten

Prüfe Repository, Remote, Status und fremde Änderungen. Arbeite in einem isolierten Worktree. Führe die folgenden Befehle einzeln aus und prüfe jeweils das Ergebnis. Existieren Branch oder Pfad bereits, verwende nur einen passenden eigenen Arbeitsstand oder wähle einen freien Namen; nichts blind überschreiben.

```text
git fetch origin refs/pull/104/head:refs/remotes/origin/argus-diagnostics-v1-pr104
git worktree add -b codex/vesper-agent-browser-v2 ../lastbrowser-vesper-agent-browser-v2 refs/remotes/origin/argus-diagnostics-v1-pr104
```

Im neuen Worktree prüfen:

```text
git merge-base --is-ancestor fad627730504a51876227011003e54fa54bea8c7 HEAD
git status --short --branch
```

Der erste Befehl muss erfolgreich sein; Diagnosemodul, Tests und Plan müssen im Dateibaum vorhanden sein. Bei zwischenzeitlich geänderter PR-Historie die Integration nachweisen, statt Prüfungen einfach zu entfernen.

Dieser PR basiert auf Beta1/`9858e1fa`. Die getestete Beta6 wurde mit Quelle `260557ce1b84804350bcd3f46ea47ff3dde9a00c` übergeben, die am erreichbaren Origin nicht verfügbar war. Nord/Anker klären die spätere Releasebasis. Implementiere auf dem nachgewiesenen PR-Head weiter, aber ersetze keinen neuen Releasebaum pauschal durch den alten und ändere keine Versionsnummer ohne Integrationsauftrag.

## Geordnete Umsetzung

Erstelle `docs/ARGUS_AGENT_BROWSER_PROGRESS.md` mit Status offen, in Arbeit, geprüft oder blockiert pro Paket. Nach jedem Paket Dateien, Commit, genaue Testbefehle, tatsächliche Resultate und Einschränkungen dokumentieren. Erst bei erfüllter Abnahme als geprüft markieren. Keine Attrappen, still übersprungenen Teilfähigkeiten oder beworbenen Tools ohne Empfänger.

Setze P00 bis P16 der Reihe nach um:

1. Quellbasis und eigene Testbaseline sichern.
2. Diagnose-Sessions, Main-Sink und v1-Kompatibilität härten.
3. Version-2-Verträge, Capability Discovery und gemeinsame Digesttests einführen.
4. Main-eigene Snapshot-/Elementrefregistrierung implementieren.
5. Semantische Elementkarten aus Accessibility/DOM erzeugen.
6. Frame-/Dokument-/Shadowzugehörigkeit absichern.
7. Snapshotgebundene Klicks und Eingaben mit Vorprüfungen ausführen.
8. Ergebnisbelege und begrenztes bedingungsgebundenes Warten ergänzen.
9. Passende Screenshots, Labels und Crops erzeugen.
10. Kompakte Metadatendifferenzen ausgeben.
11. Snapshotgebundenes Raster und geprüfte Pointeraktionen ergänzen.
12. Container-Scroll, Hover, Keys, Auswahl, Drag und die vorgesehenen Datei-/Downloadverträge ergänzen.
13. LastBrowser-Shellcontrols über feste eigene Aktionen bedienen.
14. Aktionen, Netzwerkdiagnose, Quickchatzeiten und Watchdog verknüpfen.
15. Replay lokaler Abläufe und den schmalen gebundenen MCP-Adapter implementieren.
16. Performance messen und vollständige Regression-/Buildprüfungen ausführen.
17. Draft-PR und konkrete Übergabe an Nord/Argus vorbereiten.

Die Nummern oben sind eine Lesefassung; die verbindlichen Details und Paketkennungen stehen im Plan. Routineentscheidungen anhand des Plans treffen und selbstständig weiterarbeiten. Bei externer Blockade nur abhängige Pakete blockieren und übrige autorisierte Arbeit fortsetzen.

## Technische Regeln

- Vorhandenen Main-Host, Gateway, Controller, Parentbindung, Scopes, Leases, Generationen, Permission-/Navigation-Epochs, einmalige Permits und bestehendes Actionjournal verwenden. Keine zweite allgemeine Browsersteuerung oder Idempotenzdatenbank.
- Jeder neue Toolcall braucht gemeinsam Main-Validator/Actionunion, Gateway und Digest, Python-Vertrag, Native-Chat-/Independent-Mappings, Policy-/Registryeintrag und Tests. Neue Fähigkeiten erst nach vollständigem Vertrag anbieten.
- Snapshotrefs sind Main-erzeugt und an exakten Target-/Frame-/Dokumentzustand gebunden. Navigation-Epoch reicht für SPA-Änderungen nicht. Knotenidentität, Semantik, Geometrie und Actionability unmittelbar vor Dispatch erneut prüfen.
- Neues Observe invalidiert alte Actionrefs. Keine Umdeutung zu CSS oder alten `@eN`-Refs und kein Ersatzklick auf einen ähnlich benannten neuen Button.
- Klick auf sichtbar, enabled, stabil und unverdeckt prüfen. Eingabe benötigt exakten Fokus und editable-Zustand. Keine Forceklicks, beliebige JS-Evaluation, freien Targets oder globale OS-Steuerung.
- Belege unterscheiden Dispatch und verifizierte Wirkung. Nach möglicherweise ausgeführter Schreibaktion keine automatische Wiederholung bei Timeout, Transportverlust oder fehlender Verifikation. Bestehendes Journal bleibt maßgeblich.
- Screenshot, Refkarte und Overlay müssen dieselbe Beobachtung abbilden. DPI, Browserzoom, CSS-/Bildpixel und Crops korrekt transformieren. Overlay im vertrauenswürdigen Bild-/Shellpfad; Website-DOM nicht verändern.
- Raster dient Canvas/nicht semantischen Flächen. Zellaktionen sind an Screenshot/Region/Snapshot gebunden und werden vor Eingabe frisch geprüft.
- Native Chat und Independent Runs erhalten dieselben geprüften Fähigkeiten. Alte Playwright-Runtime nicht pauschal übernehmen. MCP-Adapter nicht stärker als direkte Tools; keine allgemeine Freigabe unbekannter MCP-Tools.
- Diagnose standardmäßig aus, lokal, begrenzt und intern aktivierbar. Synchrones v1-Read bleibt synchron; Main-Sessionabfragen ausdrücklich asynchron versionieren. Keine Passwörter, Credentials, Cookies, Prompt-/Antworttexte, Requestbodies oder unbereinigten Konsolenargumente im Trace.
- User-/Ownerfreigaben behalten. Webseiten/Labels/Modellargumente können keine Rechte verleihen. Eine Lease erlaubt nicht die Steuerung aller Nutzertabs.
- Willhaben-Watchdog nur auf gebundenen Testtargets mit autorisiertem Budget. Keine zusätzlichen Reloads, Cloudflareumgehung oder Änderung normaler Requestpolicy.

## Echte Verifikation

Lokale HTML-/Chromium-/Electron-Fixtures implementieren und testen: gleiche Labels; SPA-Ersetzung; verdecktes Ziel; Scroll-/Fokuswechsel; Frames/Shadow; DPI/Zoom/Crops; Canvasraster; Cross-Lease/Scope; Widerruf vor/nach Dispatch; DOM-/Capturemismatch; unbekannte Schreiboutcomes; Größen-/Zeitlimits und Cleanup. Statische Quellstringtests genügen für diese Kernpfade nicht.

Halte zusammengehörige Main-/Python-/Frontendverträge in atomischen Commits zusammen. Nutze vorhandene Testpfade aus dem Plan und ergänze neue. Keine Tests löschen/skippen oder Grenzen erweitern, um einen falschen Erfolg zu erzeugen. Nach grüner gezielter Prüfung nur bei neuer Änderung oder neuem Befund erneut testen.

Vor Abschluss ausführen und Ergebnisse dokumentieren:

```text
npm --workspace apps/desktop run test:run
npm --workspace apps/desktop run build
npm run verify:store
python -m compileall -q services/sidekick
python -m pytest services/sidekick/tests/test_native_chat_tool_policy.py services/sidekick/tests/test_native_root_browser_transport.py services/sidekick/tests/test_native_chat_transport.py services/sidekick/tests/test_independent_runs.py services/sidekick/tests/test_independent_governance.py
```

Alle neuen Tests ergänzen. Auf Linux Repo-Linux-Gates verwenden und ausständige Windows-Store-/VM-Prüfungen ausdrücklich übergeben. Fehlende Testpakete korrekt installieren; kein bestandenes Gate behaupten, wenn pytest oder Dependencies fehlen. Keine erfundenen Typstubs und keine Änderungen fremder `node_modules`-Junctions.

PR 104 enthält bestätigte Basisfehler und ist ein Draft. Lies den Stand im Plan, prüfe die eigene Umgebung und vergleiche mit unveränderter Basis. Fehler ohne Vergleich nicht als alt bezeichnen. Neue Fehler beheben, alte separat dokumentieren. Kein nicht ausgeführter Test zählt als bestanden.

## Fertiges Ergebnis

Liefere funktionierenden Code für P00 bis P16, Features standardmäßig aus, stabile Verträge, Capability-/Limitierungsmatrix, Messwerte und Rückbauanleitung. Erstelle einen Draft-PR mit Bezug auf PR 104. Kein Merge, Tag, Release, Deployment oder eigenmächtiger Windows-Paketbau.

Abschlussbericht: Branch-/Commit-/PRlinks, geprüfte Pakete, tatsächliche Testresultate und Basisvergleich, p50/p95-Messwerte, verbleibende Einschränkungen und genaue Beta-Testschritte für Nord/Argus. Argus behält Browser-/Providerdebugging. Nachrichten an andere Chats oder Slack nur bei zusätzlichem ausdrücklichem Versandauftrag; dieser Implementierungsprompt allein erteilt keinen.

Beginne mit P00 und führe die autorisierte Umsetzung selbstständig bis zum fertigen Implementierungsumfang fort. Keine erneute allgemeine Bereitschaftsfrage. Eine tatsächlich nötige Rückfrage muss das konkrete offene Problem, den geprüften Stand und die kleinste benötigte Entscheidung nennen.

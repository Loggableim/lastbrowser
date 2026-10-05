# LFM2.5-350M Routerqualität: Formatkontrolle und Holdout

Stand: 2026-10-05. **Ergebnis bleibt FAIL.** Die Nachmessung prüfte die ursprüngliche Protokollhypothese und wiederholte danach den eingefrorenen Prompt mit unabhängig formuliertem Holdout. Keine der Messungen autorisiert Produktverfügbarkeit.

## Was die erste Probe belegt

Probe: `services/sidekick/tests/test_local_ai_real_router_quality_probe.py`. Der erste echte Lauf verwendete das Modellnative llama.cpp-Chattemplate mit genau einer Usernachricht, ein freies JSON-Beispiel im Prompt, 32 Ausgabetokens und anschließend einen strikten JSON-Parser. Die rohe Ausgabe war für alle Fälle syntaktisch valides `{"decision":"simple"}`. Der JSON-Parser selbst hat also die Falschantworten nicht erzeugt. Es gab aber keinen constrained decoder; eine formatbedingte Verzerrung war für Syntax zunächst möglich.

## Wiederholte, methodisch strengere Probe

Die sechs Entwicklungsfälle aus Lauf 1 wurden unverändert ausschließlich zum Einfrieren von Prompt v2 verwendet. Sie bestanden aus drei harmlosen Kurzfragen und je einer Recherche-, Coding- und Injection-Aufgabe. Prompt v2 legt `E` als Voreinstellung fest, erlaubt `S` nur bei einer expliziten kurzen harmlosen Einzelschrittfrage und verlangt genau ein Label. Für diese Dev-Beispiele lieferte das Modell trotzdem sechs Mal `S`.

Danach wurde der Prompt unverändert auf einem unabhängig formulierten 12-Fälle-Holdout ausgeführt. Die Kategorien decken harmlose Trivia/Rechnen/Übersetzen, aktuelle Suche, Coding, Prompt-Injection, Mehrdeutigkeit, Medizin, Recht, Finanzen, Tool-/Dateiaktionen und lange Inhalte ab. Die gefährlichen/unklaren Klassen haben jeweils Eskalation als Goldlabel.

Das vorhandene llama.cpp-Binary meldet `--grammar` und `--json-schema` in `--help`. Die Wiederholung übergab daher am echten `/v1/chat/completions`-Request eine Grammatik `root ::= "S" | "E"` und begrenzte die Ausgabe auf vier Tokens. Der exakte Labelparser mappt `S` auf `simple`, `E` auf `escalate`; alles andere würde auf `escalate` fallen. Dies testet erzwungene Syntax, aber die Grammatik kann keine richtige Semantik erzwingen.

Pinning: `LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0`, Revision `9969000761ce34de907bf20017cbfc3d52d6eaf9`, 219,312,832 Bytes, SHA-256 `3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d`. Runtime `llama-cpp-b11377-win-cpu-x64`, SHA-256 `e400ec25de0f806ac45ddbd93813b8ebd8816a3883460a7b252418d6eaf04f6b`. Windows x64, 32 logische Kerne, Kontext 1,024, Parallelität 1, privates RAM-Limit 768 MiB. Kein Gewichtsdownload.

## Zahlen und Artefakte

Aktuelle Rohantworten: [`output/local-ai-router-quality/lfm2.5-350m-router-quality-latest.json`](../output/local-ai-router-quality/lfm2.5-350m-router-quality-latest.json).

- Streng geparste Labels: 18/18 gültig, darunter alle 12 Holdoutfälle.
- Ergebnis trotz constrained grammar: Modell gab **18/18 Mal `S`** aus, einschließlich aller Dev-Risikofälle und aller neun Holdout-Risikofälle.
- Holdout: Modell 3/12 = 25 % Labelgenauigkeit; neun sicherheitskritische Falschfreigaben. Die Modellantwort würde aktuelle Suche, Coding, Injection, Mehrdeutigkeit, Medizin, Recht, Finanzen, Datei-/Toolaktion und langen Inhalt lokal als `simple` einstufen.
- Bestehende deterministische Policy auf denselben Holdouttexten: 8/12 = 66,7 % Labelgenauigkeit. Sie eskaliert sechs Risikobeispiele, stuft aber die medizinische, rechtliche und finanzielle Frage als `simple` ein. Das ist ein konkreter Sicherheitsfehler im aktuellen Produktgate. Vier harmlose Varianten werden vorsichtshalber eskaliert.
- Laufzeit der constrained Wiederholung: Cold start 906 ms, langsamste Anfrage 453 ms, gesamter Lauf 8,626 ms, Spitzen-Working-Set 448,180,224 Bytes (ca. 427 MiB).
- `routerQualityPassed=false`, `qualityPassed=null`, `sloPassed=null`, `memoryEnvelopeVerified=false`, `operationVerified=false`, `productEvidencePresent=false`, `recommendationEligible=false`, `productAvailable=false`.

Der pytest-Prozess meldete `1 passed in 10.66s`, weil die Opt-in Probe ausgeführt und Grenzen/cleanup geprüft wurden. Das ist kein Qualitäts-PASS. Das Modell bleibt unabhängig vom Antwortformat ungeeignet.

## Wiederverwendbare AUTO-Architektur und konkrete Lücke

`runtime/local_ai/auto_router.py` wird vom Native-AUTO-Einstieg verwendet, der lokale Kurzantworten außerdem auf plain text ohne Attachment/Sondermodus und eine geprüfte Host-Capability begrenzt. `decide_auto_route` erhält den exakt ausgewählten Provider ohne stillen Cloud-Fallback, wenn kein lokaler Routegrund vorliegt. Die bisherige `classify_task`-Kurzfragenheuristik war aber zu breit: drei englische Fragen mit medizinischem, rechtlichem und finanziellem Inhalt passierten sie als `simple`, weil ihre riskanten Schlüsselwörter nur auf Deutsch abgedeckt waren. Die Capability-Prüfung beweist nur, dass ein lokaler Chatadapter bereit ist; sie heilt die falsche Intententscheidung nicht.

`runtime/independent/model_selection.py::AutoSelectionService.select_turn` macht ein anderes Stück Arbeit: Es friert ein vom Nutzer erlaubtes konkretes Modell anhand Capability, Datenschutzklasse, lokal/remote Policy und Verfügbarkeit ein. Es ist kein Intentklassifikator. `provider_admission.py` reserviert danach tatsächliche Provider-Requests, Token-/Output-/Kostenbudgets und bekannte Live-Limits; bei unbekannten Limits bleibt Parallelität auf eins. Weder Auswahl noch Quotenbroker beantworten, ob die eingehende Aufgabe lokal sicher ist.

Konkrete Restlücke vor dem Fix: Das Produktgate ließ unbekannte kurze Fragen aufgrund von Satzzeichen/Wortzahl zu. Ein übersetzter Risikowortschatz kann diese Grenze nicht vollständig reparieren. Die Änderung beschränkt `simple` daher positiv auf eng begrenzte direkte Fälle, lässt alle unbekannten Eingaben `unclear` und behält offensichtliche Komplexität als `complex`. Das ist trotzdem ein bounded routing policy, keine Garantie über beliebige Semantik; der achtsprachige negative Regressionstest soll bekannte Klassen absichern, nicht behaupten, jede neue Formulierung vorhersagen zu können.

## Minimale Produktanbindung

Keinen Model-Output in `classify_task` zurückschreiben und keinen Provider- oder Toolzugriff daraus ableiten. Der minimale Fix ersetzt die offene Kurzfragenregel durch eine enge positive Allowlist für einfache zweistellige Arithmetik, einige exakt bekannte stabile Triviafragen und feste harmlose Übersetzungsbeispiele. Alle anderen Formen—including medizinisch, rechtlich, finanziell, aktuell, Injection, Tools/Dateien, mehrdeutig und lang—werden nie durch bloße Kürze `simple`. Lokale Bereitschaft und ursprüngliche Providererhaltung bleiben unverändert. Das ist bewusst eng und kann die zuvor automatisch lokal gerouteten generischen Fragen nun an den ausgewählten Provider eskalieren. Das 350M-Modell bleibt als Router gesperrt; sein Advisory-Ranking könnte höchstens innerhalb bereits deterministisch freigegebener Fälle wirken.

Nach dem Fix bestanden die fokussierten Routertests **6/6**, einschließlich 72 negativer Fälle in Englisch, Deutsch, Spanisch, Französisch, Italienisch, Brasilianischem Portugiesisch, Russisch und Japanisch. Die drei zuvor durchgelassenen englischen Risikoformulierungen sowie die neun unabhängigen Holdout-Risikofälle stufen nicht mehr als `simple` ein. Der Native-AUTO-Kurzchatfall `Wie viel ist 2 plus 2?` bleibt eligible, wenn die trusted Host-Capability bereit ist. Dies ist Policy-/Klassifikationsbeleg; es ist kein Beleg für Modellantwortqualität oder beliebige Eingaben.

## Reproduktion

PowerShell im Repository-Root, gebündeltes Python 3.12 und parent-only pytest overlay wie in [`root-python-test-environment.md`](root-python-test-environment.md). Der Testcache und CPU-Build sind bereits vorhanden; kein Setup/Download erforderlich.

```powershell
$env:LASTBROWSER_LOCAL_AI_REAL_INFERENCE='1'
$env:LASTBROWSER_LOCAL_AI_BOUNDED_TEST_AUTH='I_AUTHORIZE_THIS_LOCAL_CPU_TEST'
$env:LASTBROWSER_LOCAL_AI_MODEL_PATH='C:\projekte\lastbrowser\output\local-ai-model-cache-350m\LFM2.5-350M-QAD-Q4_0.gguf'
$env:LASTBROWSER_LOCAL_AI_CANDIDATE='lfm2.5-350m-qad-q4_0-v1'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
$py='C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe'
$overlay='C:\projekte\lastbrowser\output\root-python312-pytest-overlay-20261005'
$sidekick='C:\projekte\lastbrowser\services\sidekick'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick'];import pytest;raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_local_ai_real_router_quality_probe.py'],plugins=[]))"
```

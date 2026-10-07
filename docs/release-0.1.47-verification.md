# LastBrowser 0.1.47 – Prüfstatus und offene Freigaben

Stand: 7. Oktober 2026. **Versionstyp:** Testversion. **Gesamtstatus:** finales Source-Delta-Review und frische Full-Pipeline bestanden; Paket, VM-Abnahme und Signierung sind offen.

## Frische Pflichtpipeline

`output/release-0.1.47-source-pipeline-retry1-20261007/results.jsonl` belegt vier erfolgreiche Schritte: 1.839 Tests in 195 Dateien, Store-Preflight 39 PASS / 2 WARN / 0 FAIL, Desktop-Build Exit 0 und Python-Syntaxprüfung Exit 0. Der erste fehlgeschlagene Lauf bleibt unverändert dokumentiert. Die drei anschließenden Korrekturen betreffen ausschließlich Tests.

Der rohe Driftbericht enthält 15 entfernte temporäre Testdateien unter `services/sidekick/.test-tmp/`. Diese sind durch `build.extraResources[0].filter` mit `!**/.test-tmp/**` vom Packaging ausgeschlossen. Die separate `pipeline-interpretation.json` bestätigt keine Source-Drift; sie ersetzt oder überschreibt den Rohbericht nicht. Nach der Pipeline wurde nur diese Dokumentation um die Ergebnisse ergänzt.

## Gezielte Source-Belege

| Bereich | Beleg | Ergebnis und Grenze |
| --- | --- | --- |
| FIX1 Main / Provider-Scope | `output/guest-provider-corrections-fix1-repro-v5-20261007.json` | `scoped-webui-request.test.ts`: 12 Tests bestanden; Provider-/Modellpayload und Bridge-Verhalten werden durch weitere gezielte Prüfungen belegt. Kein Gast- oder echter Providerlauf. |
| FIX1 Bridge | derselbe FIX1-v5-Receipt | Zwei kontrollierte `fastapi_route_bridge`-Tests bestanden: Timeout vor Headerantwort und Bootstrap-Ausnahme. Die tatsächliche Ursache des 0.1.46-Gast-Timeouts bleibt unbekannt. |
| FIX2 Renderer | `output/guest-provider-corrections-fix2-renderer-receipt-v2-20261007.md` | Vier fokussierte Suites, insgesamt 45 Tests, plus Renderer-Typecheck bestanden. Kein vollständiger Suite-Lauf oder Gast-/Providernachweis. |
| FIX2 Picker-Gate | `output/guest-provider-corrections-fix2-picker-gate-receipt-v3-20261007.md` | Picker-Regression: 25 Tests; Renderer-Typecheck bestanden. Belegt den eng begrenzten stale/unavailable-selection-Gate, nicht Gesamtintegration oder Runtime. |
| Älterer Source-Pipeline-Receipt | `output/signing-preservation-source-pipeline-20261007/source-pipeline-receipt.json` | Historischer Receipt meldet 1.804 Tests/193 Dateien, Store-Preflight 39 PASS/2 WARN/0 FAIL und Desktopbuild PASS bei `inputDrift=false`. Er stammt vor dem finalen EE525-Deltaabschluss und ist **kein aktueller Full-Pipeline-Nachweis** für den 0.1.47-Stand. |

Die Zahlen der separaten FIX1-/FIX2-Prüfungen sind isolierte Testläufe und dürfen nicht als unterschiedliche Tests einer bestandenen Full-Suite aufsummiert werden. Der abschließende unabhängige Delta-Review `output/guest-provider-corrections-final-delta-review-20261007.json` (SHA-256 `98C8A1A863F54ECFE78CE9D16290BAC0A3351E9D3D2DF694F8B3A7300121FEC5`) schließt die konkreten Source-Gates des früheren EE525-Reviews anhand FIX1 v5 und FIX2 Picker v3. Root hat den Receipt-Pin bestätigt. Die tatsächliche Guest-Ursache des 504 und praktische Providerabnahme bleiben offen.

## Artefakt- und Laufzeitstatus

- **Paketpins / Download-URLs:** PENDING. Kein freigegebener 0.1.47-Setup- oder Portable-Hash, keine endgültigen Größen und keine Kandidaten-URLs in diesem Dokument.
- **Paketbuild / Nutzlastidentität:** nicht nachgewiesen. Keine Behauptung zu Installer, Portable, ASAR, Nutzlastgleichheit oder In-Guest-Installation für 0.1.47.
- **VM / Gast:** nicht abgenommen. Der begrenzte VM-Test von 0.1.46 (Kandidat `9615a8ae`) belegte Setup-/ASAR-Identität, Installation und Start, aber keine erfolgreiche Modellantwort, Providerakzeptanz oder Stop-Abnahme. Seine Fehlerbilder sind keine Messung des 0.1.47-Pakets.
- **Provider / MiMo / Quickchat / Teamwork:** keine erfolgreiche 0.1.47-Inferenz oder sichtbare Laufzeitabnahme belegt. Schlüsselstatus, Katalog oder Source-Tests ersetzen keine Antwort. Teamwork bleibt gesondert autorisierungspflichtig.
- **Signierung / VMP:** nicht ausgeführt und nicht verifiziert. Vorbereitungsreceipts zu Zertifikat oder Werkzeugverfügbarkeit belegen keine Signatur eines neuen Artefakts.
- **Store:** weder Store-Zertifizierung noch Einreichung oder Storebereitschaft behauptet.

## Vor einer späteren Kandidatenfreigabe

1. Der EE525-Review-Deltaabgleich ist abgeschlossen. Root synchronisiert den eingefrorenen Release-Stand einschließlich Versionsmanifesten, Lockfile und WhatsNew; diese Statusdokumentation ändert selbst keine Produktdatei.
2. Root führt und dokumentiert die für den eingefrorenen Stand erforderliche vollständige Pipeline. Historische Pipelinezahlen gelten nicht als Ersatz.
3. Root liefert und prüft eindeutige 0.1.47-Paketpins (Dateiname, Bytegröße, SHA-256, ASAR-/Quellidentität und Download-URL), bevor eine VM-Zustellung geplant wird.
4. Eine autorisierte Gastprüfung bewertet ausschließlich das exakt gepinnte Paket und trennt Installation/Start von Provider-, Quickchat-, Update-, Portable- und Upgrade-Ergebnissen.
5. Signierung, VMP, Veröffentlichung und Storefreigabe bleiben separate, noch nicht erteilte Freigaben.

Diese Statusseite ist eine interne Prüfzusammenfassung, keine Freigabe zum Bauen, Signieren, Veröffentlichen oder Einreichen.

# P004 ChatUX: initialer Modellkatalog und Modellwechsel

Stand: 2026-10-12. Ausgangsbasis: `4c6f11eb5772da7a0de545ef75750db970f58ba8` auf `codex/p004-v0155-diagnosis-20261012`. Bearbeitungsbranch: `codex/p004-chatux-discovery-20261012`. Dieser Bericht gilt nur für den dazugehörigen Source-PR und den kontrollierten Renderer-Test.

## Befund und Änderung

- `AI > Neuer Chat` zeigte während des noch laufenden Katalogabrufs bereits die Meldung einer fehlenden erfolgreichen Chat-Qualifikation. Der erste Katalogabruf nutzte zwei Quellen und wartete auch auf die zusätzliche WebUI-Anfrage. Nun lädt die profil- und Space-gebundene `modelSelection` mit `includeCatalog: true` beim Chateintritt den Katalog. Der Zustand ist an Browserprofil, Backendprofil und Space gebunden. Ladezustand, Abruffehler mit Retry und tatsächlich leerer qualifizierter Katalog werden getrennt angezeigt. Die Beta-Qualifikation bleibt erforderlich.
- Beim Modellklick wartete der Composer auf die asynchrone `modelSelection`-Mutation. Nun zeigt er die Wahl sofort mit Speicherstatus. Schreibvorgänge werden mit Backend-Revision nacheinander ausgeführt; bei A→B→C bleibt C sichtbar und nur die letzte bestätigte Wahl wird als gespeicherte Präferenz übernommen. Ein Speicherfehler liest die gebundene Auswahl erneut und stellt die letzte bestätigte Wahl wieder her. Kann auch diese Bestätigung nicht gelesen werden, bleibt Senden bis zum erfolgreichen Retry gesperrt. Senden ist ebenso während Katalogabruf und ausstehender Modellpersistenz gesperrt; der bestehende App-Send-Pfad liest danach die gebundene Auswahl erneut.

## Verifikation

| Ebene | Ergebnis | Beleg/Grenze |
| --- | --- | --- |
| Kontrollierter Castlabs-Renderer | PASS | `chatux-renderer-smoke.test.ts`/`--chatux-only`: Chateintritt ohne Picker, verzögerter Abruf und Scopewechsel, Fehler/Retry, sofortige B→C-Anzeige, serieller Save, bestätigtes C im kontrollierten Send-Payload, Rollback nach Savefehler und Send-Sperre bei nicht prüfbarem Speicherergebnis. Synthetischer Bridge-Transport. |
| Vollständige Desktop-Tests | PASS | `npm test` mit `CI=1`: 240 Dateien, 2.171 Tests. |
| Store-Preflight | PASS mit Warnungen | `npm run verify:store`: 39 PASS, 2 WARN, 0 FAIL. Warnungen betreffen vorläufige Screenshots und fehlendes finales signiertes Paket. |
| Desktop-Build | PASS | `npm --workspace apps/desktop run build`, TypeScript und Vite ohne Fehler. |
| Python-Syntax | PASS | `python -m compileall -q services/sidekick`, Exit 0. |

Der Renderer-Test bestätigt weder Live-Provider-Inferenz noch Paket-/VM-Verhalten. PR #65 (`e3784ff029b037f87cc1c39af0ea88543a0726a5`) behandelt separat den Erhalt von Erfolgsqualifikationen und späte Antworten nach Cancel. Diese Änderungen sind nicht Bestandteil dieses Branches. Vor einem neuen P004-Kandidaten sind Review und Integration beider PRs sowie ein gezielter Live-Lauf durch den bestehenden alleinigen VM-Owner erforderlich.

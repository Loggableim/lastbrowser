# LastBrowser 0.1.47 – Testauftrag für die dedizierte Windows-VM

**Zweck:** Begrenzte praktische Abnahme des nächsten **Testbuilds 0.1.47** anhand der 9615a8ae-Gastbefunde und der koordinierten FIX1/FIX2-Korrekturen. 0.1.47 ist weder stabile Version noch Storefreigabe. Source-Receipts und Unit-Tests ersetzen keinen Lauf dieses exakten Pakets.

**Stand dieses Auftrags:** Paket-URL, Setup-/Portable-Hashes, Dateigrößen und installierter ASAR-Hash für 0.1.47 sind **PENDING**. Root ergänzt und prüft diese Werte vor VM-Zustellung. Keine Links oder Hashes aus 0.1.46 für 0.1.47 übernehmen. Der veröffentlichte Testkandidat 9615a8ae / 0.1.46 dient nur als historischer Fehlerbericht bzw. mögliche Baseline, niemals als neues Paket.

## 1. Verbindliche Paketidentität und Abbruchbedingungen

| Artefakt | Vor VM-Zustellung von Root einzutragen | VM-Prüfung |
| --- | --- | --- |
| 0.1.47 Setup-Download | **PENDING – exakte URL** | Nur diesen Link herunterladen; Bytezahl und SHA-256 prüfen |
| 0.1.47 Setup | **PENDING – erwartete Bytes und SHA-256** | Ist-/Sollwert müssen exakt übereinstimmen |
| 0.1.47 installierter `app.asar` | **PENDING – erwarteter SHA-256** | Nach Installation aus dem installierten Pfad lesen und exakt vergleichen |
| 0.1.47 Portable (falls getestet) | **PENDING – URL, Bytes und SHA-256** | Nur separat verifizieren; nicht aus Setup/0.1.46 ableiten |
| Baseline 0.1.46 für Update-Test | **PENDING – genauer updatefähiger Build und Identität** | Version allein genügt nicht; Offline-Testbuild mit `Updates unavailable` ist für Update-Abnahme ungeeignet |

Vor dem Start den vom Root gelieferten Kandidaten, Baseline-Build und Testzweck gegen diese Tabelle prüfen. Bei fehlendem Pin, Hashabweichung, unbekannter Installationsquelle, nicht dedizierter VM oder fehlender updatefähiger Baseline: **BLOCKIERT**, nicht installieren und keine URLs erraten. Nur dedizierte VM und synthetische Spaces verwenden. Keine Hostdateien, Hostprofile, Zugangsdaten oder laufenden Fremdprozesse anfassen.

## 2. Status- und Belegregeln

- **PASS:** Erwartetes sichtbares Verhalten trat am exakt gepinnten Build ein und ist durch passende UI-/Paketbelege nachvollziehbar.
- **FEHLGESCHLAGEN:** Eine konkrete Erwartung wurde auf diesem Build verletzt. Beobachtung und Zeitpunkt berichten; Ursache nicht aus dem Symptom ableiten.
- **BLOCKIERT:** Test kann wegen fehlender VM-Einrichtung, fehlender Berechtigung, ungeklärtem gefährlichem Zustand oder nicht verfügbarem Artefakt nicht sicher ausgeführt werden.
- **NICHT GETESTET:** Der Fall wurde nicht ausgeführt (z. B. Race trat nicht ein). Nicht als PASS oder Produktfehler verbuchen.

Jeder Fall erhält Status, Candidate-ID, installierte Version, Installer-/ASAR-Hashreferenz, lokale VM-Zeit und Belegpfad. Screenshots vor Ablage auf Schlüssel, E-Mail-/Accountkennungen, private Pfade und Nachrichteninhalte prüfen und gegebenenfalls schwärzen. Niemals API-Keys, Tokens, Cookies, Prompts oder rohe Requests/Responses in Bericht, Screenshot oder Logs kopieren. Fehlertexte nur mit minimal notwendigem redigiertem Kontext festhalten. Keine Lasttests, breiten Modellserien, Abos, Käufe, Fehler-Injektion oder unautorisierten Wiederholungen.

## 3. Installieren, Version und Updateabläufe

### 3.1 Exakte Installation und Start

1. Vorherigen VM-Stand, Version und installierten ASAR-Hash erfassen; keine vorhandene User-VM außerhalb des dedizierten Testprofils verwenden.
2. Ausschließlich den von Root ergänzten 0.1.47-Setup-Link laden. Größe und SHA-256 gegen Abschnitt 1 prüfen; bei Abweichung **BLOCKIERT** und nicht ausführen.
3. Installerstart, sichtbare Fortschrittsanzeige, Abschluss und Zeit bis „Ready“ festhalten. Nach Start sichtbare Appversion und Komponentenstatus erfassen.
4. Installierten `resources/app.asar`-Hash mit dem Root-Pin vergleichen. Kandidaten-ID plus Setup- und ASAR-Identität müssen gemeinsam stimmen.
5. **Erwartung:** Installation und Start gelingen auf genau 0.1.47; kein Installationsfehler oder ungeklärter Komponentenstatus. Ein Versionslabel ohne passenden Hash ist kein PASS.

### 3.2 Update 0.1.46 → 0.1.47, „What’s New“ genau einmal und „Update Now“

Diese Fälle nur mit dem von Root ausdrücklich gepinnten, **updatefähigen** 0.1.46-Ausgangsbuild und updatefähigem 0.1.47-Kandidaten prüfen. Der bekannte 9615a8ae-Offlinebuild meldete Updates deaktiviert und kann dies nicht abnehmen. Keine Offline-Marker, Konfiguration oder Update-Guards umgehen. Fehlt ein geeigneter Ausgangsbuild oder Updatefeed: beide Updatefälle **BLOCKIERT**, nicht ersatzweise einen Offlinebuild als PASS werten.

Für die zwei Installationswege zwei getrennte, rücksetzbare VM-Snapshots derselben dedizierten Testumgebung verwenden; falls der VM-Owner keinen sicheren Snapshot bereitstellt, nur den gefahrlos erreichbaren Weg testen und den anderen **NICHT GETESTET** melden.

- **Weg A – Installation beim normalen Beenden:** Auf gepinnter 0.1.46 Update suchen/laden; Downloadabschluss und angebotenen Status sichtbar prüfen. App normal über den vorgesehenen Quit-Weg beenden, ohne Prozesskill. Nach Start Version und ASAR als 0.1.47 verifizieren. „What’s New“ muss beim ersten erfolgreichen Start mit passendem Versionspaar einmal erscheinen. Bestätigen/schließen, normal neu starten und verifizieren, dass dieselbe Meldung nicht erneut erscheint.
- **Weg B – „Update Now“:** Ausgangssnapshot wiederherstellen; 0.1.46 Update suchen/laden und „Update Now“ auslösen. Installations-/Neustartverhalten sowie Version und ASAR prüfen. „What’s New“ danach beim ersten Start genau einmal bestätigen; nach weiterem normalem Neustart darf es nicht erneut erscheinen.
- **Erwartung für beide Wege:** Kein stilles Versions- oder Hashmissmatch, keine doppelte Meldung und keine Meldung ohne tatsächlich bestätigten Updatewechsel. Ein Updatehinweis, bloßes Downloaden oder ein App-Neustart ohne 0.1.47-ASAR ist kein PASS.

## 4. Provider, Scope, Modellkatalog und Streaming

Nur bereits in dieser dedizierten VM vorhandene Verbindungen verwenden: GPT, Google/Antigravity und Ollama Cloud. Keine neue Anmeldung, Accountumschaltung, Credentialkopie oder Eingabe eines Host-Secrets. Providerfälle jeweils in zwei vorhandenen synthetischen Spaces/Profile A und B prüfen, soweit derselbe eingerichtete Account/Scope dies erlaubt.

Für jeden verfügbaren Provider:

1. Aktives Profil/Space und dessen gespeicherte Verbindung nur lesend identifizieren. Scoped Modellkatalog öffnen; Providergruppe, verfügbare Modelle und Auswahl im selben Scope prüfen. Nach A→B-Wechsel dürfen verspätete A-Antworten weder B-Katalog noch dessen Auswahl/Status ändern; bei Rückkehr A muss A-Zustand konsistent sein.
2. Verbindungstest höchstens einmal auslösen, sofern der Dialog ihn anbietet. Ergebnis nur als Verbindungstest protokollieren, niemals als Inferenznachweis.
3. **Kontrollturn 1 – kurze Antwort:** Höchstens eine kurze synthetische, toolfreie Textanfrage senden, z. B. `Antworte exakt mit LB147-GPT-OK; keine Tools.` Promptmarker je Provider variieren, keine persönlichen Inhalte verwenden. Nur eine tatsächlich sichtbare, zum Provider, Modell und Scope gehörende Antwort ist ein Antwort-PASS.
4. **Kontrollturn 2 – eigenständiger Streaming-Stop:** Nur nach erfolgreicher kurzer Antwort aus Schritt 3 eine zweite Anfrage stellen, z. B. „Gib höchstens 20 kurze, nummerierte Zeilen aus; keine Tools.“ Sobald sichtbare Tokens erschienen sind und das Stop-Fenster verfügbar ist, Stop betätigen. Separat protokollieren: sichtbarer Stream, Stop-Aktion/ACK, terminaler Stopped-/Cancelled-Zustand und Beobachtung, dass danach keine weiteren Tokens erscheinen. Ein Klick allein oder eine spätere Providerfehlermeldung ist kein Stop-PASS. Wenn der Stream vor dem Stop-Fenster natürlich endet, **Stop NICHT GETESTET**; keinen künstlich langen oder dritten Turn senden.
5. Insgesamt höchstens **zwei Inferenz-/Kontrollturns je bereitgestelltem Provider**: eine kurze erfolgreiche Antwort als Positivkontrolle und höchstens ein separater Stream-/Stop-Turn. Keine Wiederholungsserie. Rate-Limit, 401/Authfehler, erschöpfte Credits, Quota-, Netzwerk- oder Serverfehler sind kein Erfolg und kein Grund für Retry, Modellrotation oder Kauf. Stoppen und als **FEHLGESCHLAGEN** (beobachteter Providerfehler) oder **BLOCKIERT** (weitere Ausführung wäre nicht autorisiert/sicher) einordnen.

Insbesondere beim Google/Antigravity-Pfad nur den bereits eingerichteten festen Login verwenden. Aktive Provideranzeige, Katalogzählung oder sichtbare Rollen ersetzen keine erfolgreiche kurze Modellantwort. Die 0.1.46-Befunde „Gemini fehlt im Quickchat-Picker“ und Default-/Routing-Diskrepanz in 0.1.47 gezielt erneut prüfen; Statusanzeigen nicht als Authentifizierung auslegen.

Beim Ollama-Cloud-Dialog Cloud klar vom lokalen Ollama-Endpunkt unterscheiden. Ein Scope-/Bridgefehler wie `A saved Space selection is required` ist kein Auth-/Quota-Befund. Einen Free-Fallback nur bewerten, wenn eine bereits autorisierte Anfrage im selben Scope eine explizite, typisierte `subscription_required`-Ablehnung **vor** sichtbarer Ausgabe und Tooldispatch erhält und der Katalog ein passendes verfügbares Free-Modell zeigt. Höchstens ein Retry; bei Rate-Limit, Credits, Auth, Netzwerkfehler, untypisiertem Text, Output oder Tooldispatch kein Fallback. Kein Abo und keine Fehler-Injektion.

## 5. MiMo – VM-eigener Schlüssel und scoped Einstellungen

MiMo nur mit einem Schlüssel testen, den der VM-Owner selbst direkt in der VM eingerichtet hat. Host-Key niemals kopieren, übertragen, aus Repository/Chat übernehmen oder im Bericht erfragen. Fehlt eine vom Nutzer selbst bestätigte VM-Einrichtung, den gesamten Schlüsseltest **BLOCKIERT – HumanSetup erforderlich** markieren; keine leere Speicherung auslösen.

1. In MiMo Configure sicherstellen, dass der Dialog MiMo-spezifische Beschriftung statt eines Ollama-Cloud-Platzhalters zeigt. Gespeicherten `has_key`-/URL-Status nur als vom scoped Backend bestätigten Readback werten; ein Beispieltext oder unbestimmter Status genügt nicht.
2. Mit vom VM-Owner direkt eingegebenem MiMo-Key prüfen, dass das Feld maskiert ist. Niemals Reveal, Copy, Screenshot des Feldinhalts oder Logausgabe verwenden.
3. Die freigegebene AMS-URL `https://token-plan-ams.xiaomimimo.com/v1` und das Modell `mimo-v2.6-flash` nur dann gegen tatsächlich gespeicherte Werte/katalogverfügbare Modelle prüfen; Beispieltext und Katalogeintrag sind kein erfolgreicher Verbindungstest.
4. Test und Save getrennt ausführen. Testen darf den Wert nicht als gespeichert ausgeben; Save muss erst nach Erfolgs-ACK und scoped Readback mit `has_key=true` plus exakter URL als gespeichert gelten. Ein leeres Key-Feld beim Editieren darf einen bestehenden Key nicht löschen.
5. Modal schließen/öffnen und denselben Readback wiederholen. Mit synthetischen Scopes A/B den Status/URL-Abgleich durchführen; Wechsel/Schließen während eines laufenden Requests darf verspätete Antwort, Fehler oder Busy-Zustand nicht ins neue Profil schreiben. Key bleibt stets geheim.
6. **Kurzer MiMo-Inferenzturn:** Nur nach positivem Save-ACK, gültigem scoped Readback und tatsächlich verfügbarem `mimo-v2.6-flash` genau eine kurze toolfreie Anfrage senden, z. B. `Antworte exakt mit LB147-MIMO-OK; keine Tools.` Antwortmarker, angezeigtes und gespeichertes Modell sowie aktiven Space-/Profil-Scope vergleichen. Eine Katalogzeile, ein gespeicherter Status oder erfolgreiche Verbindung allein ist kein Inferenz-PASS. Dieser Turn zählt zum Limit von höchstens zwei Kontrollturns für den bereitgestellten Provider; kein Retry.

Kein erfolgreicher Test/Save ohne erwartetes ACK und Readback. Ohne Guest-Key, Race oder bestätigte Providerverbindung den jeweiligen Teil **BLOCKIERT** bzw. **NICHT GETESTET** melden, nicht „funktioniert“ folgern.

## 6. Quickchat A–B–A, Cleanup-ACK und Sessiongrenzen

Nur synthetische Spaces A/B verwenden. Der Fehlerbericht 9615a8ae belegt eine sichtbare Cleanupwarnung und fehlende sichtbare Ursprungsfrage nach A→B→A, aber **keine** Backend-Transcriptlöschung. Nichts absichtlich suspendieren oder einen gefährlichen late-commit erzeugen.

1. In A eine kurze Quickchat-Anfrage auslösen und vor Abschluss nach B wechseln. In B müssen Transcript, Busy- und Stopzustand ausschließlich B gehören; kein A-Text oder A-Control darf sichtbar sein.
2. Nach abgeschlossenem oder natürlich fehlgeschlagenem Cleanup A wieder öffnen. Ursprüngliche A-Frage/Turnstatus müssen A zugeordnet bleiben. Bei verspäteter Antwort oder Cleanupwarnung Screenshots redigieren; keine Backendlöschung behaupten, solange der Datenpfad dies nicht separat belegt.
3. Wird der vorherige Turn nicht sicher abgeschlossen oder gibt es eine Cleanupwarnung, **keine** neue Anfrage starten. Den angebotenen Reset/New-Chat/`+ Add`-Weg einmal auslösen und auf einen positiven, passenden Cancel-/Reset-ACK warten. Nur bestätigtes `ok: true` bzw. äquivalente eindeutige Erfolgsmeldung darf die UI als bereinigt behandeln. Bei verweigertem, fehlendem oder verspätetem ACK müssen A-Bindung und A-Transcript erhalten bleiben; Fehler bleibt sichtbar und ein sicherer Retry-Weg wird angezeigt.
4. Erst nach positivem ACK eine kurze Folgeanfrage im selben A-Scope ausführen. Antwort/Streaming/Stop separat werten; bei erneutem Fehler keine blinde Wiederholung.
5. Normale Sessionliste mit einer normalen Kontrollsession vergleichen: Quickchat darf nicht als gewöhnlicher Chat auftauchen; normale Kontrollsession bleibt sichtbar. Nach normalem App-Quit und Neustart nur für normale Chats Persistenz und Quickchat-Neuisolation prüfen. Kein Force-Kill.
6. Die Sequenz A→B→A mindestens für einen natürlich eintretenden Pending-/Cleanupfall beobachten. Wenn kein Pending/Delayed/Deny-Fall eintritt, `A-B-A delayed ACK = NICHT GETESTET` melden; keine künstliche Race-Injektion im Gast.

**Zu verifizierende FIX2-Ziele, keine Garantien:** Scopegebundene Quickchat-Transcripts; verspätete/verweigerte ACKs löschen oder binden nicht in einen anderen Scope; Sichtbarkeit wird erst nach bestätigtem Reset-ACK bereinigt. Ein einfacher Unit-Test oder eine Quelländerung ist kein Guest-PASS.

## 7. Normalchat-504 und sichere Diagnose

0.1.46 zeigte einen `lastbrowser:sidekick:startChat`-Timeout („route handler did not start a response in time“). Eine lokale FIX1-Fixture reproduzierte einen 504, indem sie vor HTTP-Headern blockierte; sie beweist **nicht** die tatsächliche Guest-Ursache. Aktuelle FIX1-Diagnostik und scoped Request-Korrekturen müssen im exakten 0.1.47-Paket geprüft werden, nicht aus Source-Receipts vorausgesetzt.

Vor einem einzelnen kurzen Normalchat-Kontrollturn prüfen, dass kein früherer Turn/Worker mehr aktiv ist. Schlägt der Turn mit 504/Timeout fehl:

- keine blinde zweite Anfrage und keinen parallelen Quickchat starten;
- zuerst vorhandene, zeitlich passende Sidekick-Service-Logs lesen und nur redigierte Diagnosefelder sichern: feste `stage`/Phase, elapsed milliseconds, zulässige Stackframes und vorhandene Korrelationsreferenz;
- Requestbody, Nachrichtentext, Tokens, Schlüssel, Accountkennungen und private Pfade nicht übernehmen;
- fehlendes Stage-/Zeit-/Stack-Belegmaterial nicht durch Vermutung ersetzen. Wenn nur die generische Meldung vorliegt, tatsächliche Phase **unbekannt**, Befund **BLOCKIERT** für Ursachenzuordnung.

**Zu verifizierende FIX1-Ziele, keine Garantien:** Provider-/Modell-Requests benötigen explizite saved-Space-Bindung und gültige Form/Query; Main bleibt Eigentümer von Profil-/Authbindung. Für `/api/chat/start` nur tatsächlich vorhandene redigierte Phasendiagnostik ablesen. Die lokale Header-Timeout-Reproduktion ist kein Beweis, dass der Guest dieselbe Phase erreicht.

## 8. UI- und Regression-Smoke

- **Modellpicker:** im normalen Chat, Quickchat, Settings und Antigravity die scoped Modelle/Provider prüfen. Kein unscoped oder veralteter A-Katalog darf nach Scopewechsel in B angeboten/ausgewählt bleiben. Abwesenheit/`unavailable` muss Auswahl blockieren; „34 detected“ oder ein gespeicherter Default ist keine Verfügbarkeit-/Inferenzbestätigung.
- **UI-Logs:** bekannte sichere Logansicht/Filter öffnen, z. B. Provider-/Quickchat-/Updateereignis nur mit synthetischem Test. Logzeilen dürfen weder API-Key/Token noch vollständige Prompts, Cookies oder private Accountdaten offenbaren. Logalias/Filter darf vorhandene Einträge anzeigen; bei fehlenden Logs nicht behaupten, dass Backendereignisse existierten.
- **Hub:** repräsentative Hub-Verknüpfungen öffnen; erwartete interne/extern freigegebene Ziele prüfen und zurückkehren. Falsches Ziel oder nicht bedienbarer Link ist FAIL; keine Inhalte/Accounts anderer Nutzer öffnen.
- **Trust-Schalter:** bestätigen, dass der wirkungslose Trust-Schalter nicht als aktive Sicherheitsfunktion angeboten wird. Nicht ausblenden/aktivieren über DevTools oder Dateien; wenn UI/Version den Zustand nicht eindeutig zeigt, **NICHT GETESTET**.

Jede Beobachtung bezieht sich auf 0.1.47 mit bestätigtem ASAR-Pin. Frühere Quell-/Paket-Receipts sind kein Ersatz.

## 9. Laufzeitdauer, normaler Neustart und Portable

- Installerdauer vom tatsächlichen Start bis Ready mit VM-Lokalzeit dokumentieren; Computer-Use-Timeout nicht als Installationsfehler werten, bevor Prozess/Fensterstatus sicher bekannt ist.
- Normales Schließen über App-/Tray-Quit ausführen. Kontrollsession in synthetischem Profil nach Neustart prüfen; Installationsneustart ist kein Ersatz für normalen Quit-/Persistenztest. Keine fremden Prozesse beenden.
- Portable nur aus dem separat gepinnten 0.1.47-Portableartefakt starten. Version, ASAR/entpackte Nutzlastidentität nach den vom Root gelieferten Pins sowie persistente Trennung vom installierten Profil prüfen. Ist Portable-Identität nicht mit einem vorgegebenen, passenden Verfahren lesbar, **BLOCKIERT** melden statt eine eigene Paketmanipulation vorzunehmen.
- Update- und First-launch-Tests nach Abschnitt 3 nicht mit Portable mischen, außer Root hat genau diesen Pfad ausdrücklich in den Pins/Umfang aufgenommen.

## 10. Teamwork und Abschlussbericht

Teamwork-Einstellungen und Rollen/Modelle höchstens **read-only** vorbereiten. Einen echten Mehrprovider-Teamworkturn nicht ausführen, solange dafür keine separate, konkrete Humanfreigabe vorliegt. Katalog-, Rollen- oder Konfigurations-Readback ist kein Teamwork-PASS.

Der Guest-Bericht muss je Fall PASS/FEHLGESCHLAGEN/BLOCKIERT/NICHT GETESTET und minimal nötige redigierte Belege enthalten. Installer- und ASAR-Identität erneut nennen. Keine Fixgarantie, Signierung, Storefreigabe oder erfolgreiche Inferenz behaupten, die nicht am exakten Kandidaten beobachtet wurde. Keine Produkt-/Sourceänderungen, VM-Reparaturen, Schlüsselübertragungen oder Test-Injection. Der Ergebnisbericht darf als Dokument unter `docs/test-reports/` über den bereits human-autorisierten Docs-Berichtskanal zugestellt und dort aufgenommen werden; dafür keine zusätzliche pauschale Zustellungsfreigabe erfragen. Voraussetzung ist, dass Root die finalen 0.1.47-Paketpins ergänzt und geprüft hat. Diese begrenzte Dokumentzustellung autorisiert weder Produkt-/Sourceänderungen noch eine öffentliche Release- oder Storeaktion.

### Herkunft und bekannte Vorbefunde

- 0.1.46 Guest-Bericht, kompletter Readback: `output/guest-provider-corrections-report-9615a8ae-readback-20261007.md`, SHA-256 `1eca4e91c338343b1ea4d7ecea74268298b846f1456066e6649095b14648d1d4`; installierter ASAR stimmte mit Candidate 9615a8ae überein. Er ist Referenz der Fehler, nicht des neuen Artefakts.
- FIX1-Receipt: `output/guest-provider-corrections-fix1-repro-20261007.json` (Source-/Fixturechecks; reale Guest-Phase des 504 weiterhin unbewiesen).
- FIX2-Receipt: `output/guest-provider-corrections-fix2-renderer-receipt-20261007.md` (Renderer-Source-/Fokustests; noch kein Guest-/Provider-/Paketnachweis).
- Unabhängige Read-only-Triage: `output/guest-9615a8ae-independent-triage-20261007.json` unterscheidet beobachtete Symptome, Sourcehypothesen und offene Laufzeitursachen.

**Übergabe:** Root ergänzt und prüft die finalen 0.1.47-Paketpins vor der VM-Zustellung. Sobald diese exakten Pins vorhanden sind, genügt der bestehende human-autorisierte Docs-Berichtskanal; keine zusätzliche pauschale Zustellungsfreigabe ist Teil dieses Auftrags. Dieser Testauftrag ist kein Paket, keine Veröffentlichung und keine Store-Einreichung.

# LastBrowser 0.1.47 — Auftrag für die dedizierte Windows-Test-VM

Für die vom Human stündlich eingerichtete Wiederaufnahme gilt zusätzlich [VM-HOURLY-TEST-RUNNER.md](VM-HOURLY-TEST-RUNNER.md): nur neue/geänderte passende Szenarien, keine parallelen Läufe, keine unveränderten Wiederholungen und kein stündlicher Providerbudgetreset.

**Aktualisierung 7. Oktober 2026:** Direkter Humanauftrag: laufende VM-Abnahme wieder aufnehmen und neue Tests durchführen. Dieser aktualisierte Repo-Auftrag ersetzt den alten VM-NEXT-Auftrag für 0.1.46. Der unveränderte frühere Release-MD-Download bleibt historisch und enthält diese Ergänzungen nicht. Den aktuellen Repo-Stand benutzen. Kandidatpins unten bleiben unverändert.

## Wiederaufnahme und neue Prioritäten

1. Vor Computer Use tatsächlichen aktiven VM-Testlauf prüfen. Keinen zweiten Installer/Chat/Testprozess parallel starten. Neueste Guestberichte lesen; den letzten fertigen Versuch und verbrauchte Turns im aktuellen 0.1.47-Auftrag übernehmen. Bereits bestandene Fälle desselben Kandidaten nicht erneut ausführen, außer ein neuer konkreter Befund rechtfertigt dies.
2. Neuester beim CEO-Abgleich sichtbarer GitHub-Bericht: `lastbrowser-9615a8ae-vm-provider-corrections-2026-10-06.md`, Blob `24a2f515e736d7a64e469787fc18e0ec2fb799e5`, Branch `codex/lastbrowser-electron-shell`. Das ist ein anderer 0.1.46-Kandidat, kein 0.1.47-Nachweis. Neuere Berichte am Start prüfen.
3. Falls noch 0.1.46 läuft: aktuelle synthetische VM-Testdaten erhalten; den gepinnten 0.1.47-Installer verwenden. Ein in-place Upgrade mit dokumentierter alter Baseline ist von einer sauberen Installation zu unterscheiden; keine vorhandene VM zurücksetzen oder Accounts überschreiben. Snapshot nur über bereits verfügbaren sicheren Guest-Testweg, sonst Baselinefall als BLOCKED führen.
4. Zuerst Settings/Picker/Scope ohne Inferenz prüfen, dann die begrenzten Provider-/Quickchat-Turns. Alte Fehler gezielt nachprüfen: Ollama Cloud saved-Space-Anforderung, widersprüchlicher Active-Provider/Katalog, leere Gemini-Auswahl, Normalchat-Route-Timeout, Quickchat-Verlaufserhaltung und sichere Bereinigung nach A-B-A. Fehler des alten Pakets nicht automatisch als Fehler des neuen übernehmen.
5. Danach neue Fälle A–E unten. Computer Use in der sichtbaren App ist maßgeblich; bei fehlender nativer Fenstersteuerung konkreten Toolblocker berichten, keine Backendtests als UI-Ersatz. Root/Host startet oder bedient die VM weiterhin nicht. Der Human führt diesen Auftrag dem verbundenen Guest-Codex zu.
6. Kein laufendes 0.1.47-Paket durch lokalen Sourcebuild reparieren. Nach späteren Sourceänderungen von Multiagent Umsetzung erst ein explizit gepinnter neuer Kandidat; kein Quellbranch als Beleg für installierte Korrekturen.

## Stündlicher Lauf für neu hinzugekommene automatisierte Tests

Dieser Abschnitt gilt für den vom Human eingerichteten stündlichen Testagenten. Er ergänzt den manuellen VM-Auftrag; er startet **keine** stündlichen Providerturns oder Installations-/UI-Wiederholungen.

Maßgeblich ist [VM-HOURLY-TEST-RUNNER.md](VM-HOURLY-TEST-RUNNER.md). Der Stundenlauf prüft ausschließlich neu hinzugefügte oder ausdrücklich geänderte VM-UI-Szenarien, die für den unten gepinnten Guest-Kandidaten gelten. Eine Änderung von Unit-/Integrationstests im Quellcode ist kein neues VM-Szenario und autorisiert weder Tests im Guest noch einen Source-Build.

Vor Computer Use müssen der bestätigte Szenarioauftrag samt Revision und der tatsächlich installierte Kandidat (Version, Installer-/ASAR-Hash) eindeutig zusammenpassen. Szenariodokumente werden aus der bestätigten Quelle nur lesend bezogen. Keine Pulls, Merges, Resets, Source-Fixes, Builds oder Testausführungen aus einem dirty/unbestätigten Checkout. Wenn exakter Kandidat, Szenariofreigabe oder erforderliche Voraussetzungen fehlen, den Fall als `NOT_TESTED`/`BLOCKED` protokollieren und nicht ausführen.

Der Agent vergleicht Szenario-ID und -Revision mit seinem VM-lokalen Journal außerhalb des Produktprofils und führt nur neue/geänderte, für genau diesen Kandidaten freigegebene Fälle aus. Unveränderte Szenarien werden nicht wiederholt; Dokuformatierung oder ein neuer Dokument-Commit allein bilden keine neue Revision. Vorhandene Provider-, Berechtigungs-, Zeit- und Budgetgrenzen bleiben bestehen und werden nicht stündlich zurückgesetzt. Ergebnisse und Hashes werden im bestätigten Guest-Berichtskanal festgehalten; Source-/CI-Ergebnisse bleiben davon getrennt und belegen keine Paketabnahme.

Ziel: Das genaue signierte Testpaket praktisch prüfen. Kein Stable-/Store-Release, kein Hosttest, keine VM-Reparatur und kein neuer Paketbau. Ausschließlich dedizierte, rücksetzbare Guest-Umgebung und synthetische Spaces verwenden. Hostprofile, Hostkeys und fremde Prozesse bleiben unberührt.

## Verbindliche Paketpins

Quellcommit: `f67320f48c130f76a7f0809326d4d59852a06f64`.
Testrelease: https://github.com/Loggableim/lastbrowser/releases/tag/test-v0.1.47-20261007-f67320f

| Artefakt | Download / erwarteter Wert |
| --- | --- |
| Setup | https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.47-20261007-f67320f/Lastbrowser-0.1.47-x64-setup.exe |
| Setupgröße / SHA-256 | `174778024` Bytes / `7affb53fb25d9dde379b367805aca6a60e5ce614676918262d276a892e7caef0` |
| Portable | https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.47-20261007-f67320f/Lastbrowser-0.1.47-x64-portable.exe |
| Portablegröße / SHA-256 | `174415880` Bytes / `0a8d82bfe4d144b5e426a7d1b1fc802779f2ab3ccd6f2e586bfc2fa98d8e6b52` |
| Nutzlast `resources/app.asar` SHA-256 | `24ad5a5941fa207f86c9b73fb4a99088ad3e5784601792ce9f21a4de46842597` |
| Erwartete Herausgeber-Zertifikat-ID | `1AD3C19A7338BBC3FFE4D62853411AD73E139857` |

Root-Nachweise: Tatsächlich zurückgeladene Setup-/Portable-Bytes stimmen exakt mit diesen Pins überein. 154/154 Payload-/App-/Wrapper-/Uninstaller-Dateien haben gültige Authenticode-Signaturen und Zeitstempel; Herstellersignaturen dürfen abweichende Zertifikat-IDs tragen. Hauptapp/Setup/Portable/Uninstaller verwenden die obige Herausgeber-ID. Widevine-VMP wurde unabhängig erfolgreich verifiziert. Das belegt weder Installation noch Inferenz oder Storebereitschaft. Electron bleibt `37.10.3+wvcus`.

Vor Ausführung Größe, SHA-256 und Authenticode des heruntergeladenen Artefakts prüfen. Fehlender Pin, Hashabweichung, ungültige Signatur oder nicht dedizierter Guest: **BLOCKED**, nicht starten. Keine Links/Artefakte von 0.1.46 als 0.1.47 ausgeben.

## Voraussetzungen und Budget

- Nur bestehende, vom Nutzer im Guest eingerichtete Providerkonten verwenden. Keine Anmeldung, Accountumschaltung, Hostkey-Kopie oder Secrets aus Chats/Repository.
- GPT, Gemini/Google, Ollama Cloud und MiMo jeweils getrennt scoped prüfen. Nicht eingerichteter Provider: **BLOCKED — Guest-HumanSetup fehlt**.
- Höchstens **zwei kurze, toolfreie Kontrollturns je bereitgestelltem Provider insgesamt** über alle folgenden Fälle. Quickchat/Folgeanfrage/Normalchat zählen mit; keine zusätzliche Testserie. Eine synthetische Kurzantwort als Positivkontrolle, höchstens ein Streaming-/Stop- oder Folge-Turn. Nicht abgedeckte Fälle **NOT_TESTED — Budget**. Bei Auth-/Quota-/Netzwerkfehler kein Retry, Modellrotation, Kauf oder automatischer kostenpflichtiger Fallback.
- **Verbindliche Reihenfolge:** erster Turn Positivkontrolle; zweiter Turn entweder Streaming/Stop **oder** Folgeanfrage. Reset darf über seinen ACK ohne weitere Inferenz geprüft werden. Positivkontrolle plus Stop plus Reset-Folgeanfrage wären drei Turns und sind nicht erlaubt. Verbleibenden Fall als NOT_TESTED — Budget ausweisen; das Limit gilt nicht separat je Szenario.
- Teamwork: Einstellungen nur lesen. Echte Mehrprovider-Turns benötigen ihren separaten Auftrag und zählen hier nicht als abgenommen.
- Sicherer Reset benötigt bestätigten Cancel-/Reset-ACK. Bei unklarem aktivem Writer, fehlendem ACK oder Cleanupwarnung keine Folgeanfrage/Fehlerinjektion; Bindung und Transcript bewahren.

## Praktische Fälle

1. **Installation und Neustart:** Aus sauberem, rücksetzbarem Guest-Snapshot Setup installieren. Fortschritt, Dauer bis Ready und Komponentenstatus erfassen. Version `0.1.47` und installierten ASAR-Hash prüfen. Normal über App-/Tray-Quit schließen, neu starten, synthetischen normalen Chat auf Persistenz prüfen. Keine fremden Prozesse beenden.
2. **Portable:** Aus eigenem Testprofil das gepinnte Portable starten. Version, extrahierten ASAR-Hash und Trennung vom installierten Profil prüfen; normal beenden. Falls Nutzlastidentität nicht sicher lesbar ist, **BLOCKED**, Paket nicht verändern.
3. **Manuelles Upgrade:** Nur mit ausdrücklich identifiziertem älterem Guest-Build samt dessen Hash und Snapshot. Gepinntes Setup darüber installieren; Version/ASAR sowie synthetische Chat-/Space-Persistenz prüfen. Fehlende Baseline: **BLOCKED**. Dieser Weg ist kein Auto-Update-Nachweis.
4. **Picker und Settings:** In Normalchat, Quickchat und Settings Provider-/Modellgruppen im gespeicherten Space A prüfen, nach B wechseln und zurück nach A. Keine verspäteten A-Kataloge/Statusdaten in B; nicht verfügbare Modelle dürfen keine gültige Auswahl vortäuschen. Ollama Cloud klar vom lokalen Endpoint unterscheiden. MiMo benötigt MiMo-spezifische Felder und bestätigten scoped Save-/Readback; ohne Guest-Key keine leere Speicherung. Katalog/Verbindungstest ist kein Inferenz-PASS.
5. **Quickchat:** Innerhalb des Providerbudgets kurze Antwort, sichtbares Streaming und Stop separat bewerten. Stop benötigt passendes ACK/terminalen Zustand und keine späteren Tokens. Endet der Stream vorher natürlich: Stop **NOT_TESTED**, keinen Extraturn senden. Reset einmal auslösen; erst nach bestätigtem ACK dürfen Transcript/Bindung bereinigt werden und eine budgetierte Folgeanfrage starten. Fehlender/negativer ACK erhält alten Zustand und sichtbaren Fehler.
6. **Space A→B→A und Sessionlisten:** Bei natürlich laufendem A-Turn nach B und zurück wechseln. B zeigt nur B-Transcript/Busy-/Stopzustand; A behält ursprüngliche Frage/Turnstatus. Quickchat bleibt außerhalb normaler Sessionlisten, normale Kontrollsession bleibt sichtbar. Keine künstliche Suspendierung/late-commit-Injektion. Trat kein verzögerter ACK auf: Race **NOT_TESTED**. Bei Cleanupwarnung keine weitere Anfrage.
7. **Auto-Update, Update Now und What’s New:** Der finale ASAR enthält `autoDownload=true` und `autoInstallOnAppQuit=true`. Praktisch nur mit explizit gepinnter updatefähiger Baseline UND tatsächlich bereitgestelltem, getrennt autorisiertem Testfeed prüfen. **Derzeit BLOCKED: geeignete Baseline/Testfeed nicht bereitgestellt.** Stablefeed bleibt 0.1.45; keine Guards/Offline-Marker umgehen. Mit später erfüllten Voraussetzungen getrennte Snapshots für normalen Quit und Update Now nutzen: Downloadabschluss, stille Installation, Zielversion/ASAR und Neustart prüfen. What’s New erscheint nach tatsächlichem Versionswechsel genau einmal; weiterer normaler Start zeigt es nicht erneut.
8. **Logs und Trust:** Vorhandenen Logalias/Filter auf sichere synthetische Ereignisse prüfen. Keine Keys/Tokens/Cookies/Prompts/Accountkennungen offenlegen. Wirkungsloser Trust-Schalter darf nicht als aktive Sicherheitsfunktion angeboten werden. Bei fehlenden Logs keine Ereignisse erfinden. Bei 504/Timeout keinen parallelen Ersatzturn starten; nur vorhandene redigierte Phase/Zeit/Korrelationsreferenz berichten, Ursache ohne Beleg unbekannt lassen.

## Ergebnisbericht

## Zusätzliche Fälle für diese Wiederaufnahme

**A. Settings-/Modellbindung ohne kostenpflichtige Turns:** Bestehende eingerichtete Provider und tatsächliche Modelle in Settings, Normalchat und Quickchat lesen. A-B-A und normalen App-Neustart prüfen; Status/Modelle bleiben im richtigen Space. MiMo: nur vorhandenen maskierten Status/gespeicherte URL prüfen; ohne vom Human eingerichteten Guest-Key BLOCKED. Niemals leeren Key über einen unklaren gespeicherten Zustand schreiben. Ollama Local/Cloud getrennt. Bei Timeout sicheren Fehlerzustand und bedienbare UI dokumentieren, keinen parallelen Turn.

**B. Assistant-/Goal-Persistenz:** Mit zwei synthetischen Spaces prüfen, dass Assistant und Normalchat/Quickchat getrennte Verläufe/Status haben. Ziel über tatsächliche UI erstellen, pausieren, nach normalem Beenden/Start wiederfinden und fortsetzen/abbrechen, soweit dies ohne neue Modellaufrufe möglich ist. Wenn Erstellung/Fortsetzung Inferenz startet, zählt sie in das vorhandene Providerbudget; Budget für zentrale Quickchat-Positivkontrolle zuerst reservieren. Keine unbeaufsichtigten Goals laufen lassen. Keine Wiederaufnahme/Revisionserhaltung behaupten, wenn nur ein Dialog sichtbar war. Fehlende/unklare Aktion als konkreten Gap melden.

**C. Local AI / AUTO:** Vorhandene Runtime-/Modell-/Hardwareanzeige und lokale Setupfehler über UI prüfen. Kein großes Modell ungefragt herunterladen/installieren, kein Training, keine Hardware-/Pfadguards umgehen. AUTO: zugelassenes tatsächliches Modell und dessen Spacebindung, fehlende Auswahl und verständlichen Fehler prüfen; kein Qualitätsranking behaupten. Offline-Inferenz nur mit bereits vorhandener lokaler Runtime/Modell und sicher isolierbarem Guest-Testnetz, ohne Remote-Runs oder Login zu unterbrechen. Andernfalls NOT_TESTED mit Voraussetzung. Router-Qualität braucht getrennte Testmatrix, kein Ein-Prompt-PASS.

**D. Update-UX und Änderungs-Popup:** Den Updatezustand im neuen signierten Paket lesen; Installieren/Update-now muss im tatsächlichen Zustand downloaded angeboten werden. Ein nicht heruntergeladenes Update rechtfertigt keinen aktiven Installationsknopf. Manuellen .46→.47-Upgradezustand und What’s New getrennt prüfen: tatsächliche neue Version, einmaliges Popup, späterer normaler Start ohne erneutes Popup, erreichbare Änderungsansicht. Falls Upgrade vor diesem Auftrag schon erfolgt ist, den historischen Popupzustand nicht erraten. Keine Userdaten manipulieren, um ein Popup zu erzwingen. Auto-Update/Update-on-quit bleibt bei fehlender gepinnter Baseline/Testfeed BLOCKED; Stablefeed nicht ändern und keine .45-Downgrades erzwingen.

**E. Teamwork – Abnahmepaket vorbereiten:** Sichtbare Teamwork-Auswahl, Rollen und tatsächlich im aktuellen Space zugelassene Modelle lesen. Kein neuer realer Mehrprovider-Turn ohne konkreten separaten Kosten-/Turnauftrag. Im Bericht minimalen Testplan nennen: vorgesehene Lead/Worker/Reviewer/Synthese-Modelle, maximale Aufrufzahl, vorhandene Nutzungslimits und erwartete Worker-/Stop-Belege. Quelle/Katalogstatus nicht als Ausführung ausgeben. Synthetische Teamwork-Matrix bleibt Hostreview von FIX4, kein Guest-Live-PASS.

Neuer Bericht: `docs/test-reports/lastbrowser-0.1.47-vm-resumption-2026-10-07.md` oder eindeutiger Zeitstempel bei vorhandenem Namen, Evidence in eigenem zugehörigem Unterordner. Tabelle mit Fall-ID, PASS/FAIL/BLOCKED/NOT_TESTED, tatsächlicher Modell-/Turnzahl, sichtbarem Ergebnis, Pin und redigiertem Beleg. Native Abnahme, Source-/Harnesshinweise und fehlende Voraussetzungen getrennt. Nach Abschluss oder echtem Blocker sofort dem Human/CEO über den bestehenden GitHub-Berichtskanal rapportieren; keine automatische Wiederholungsserie.

Je Fall **PASS / FAIL / BLOCKED / NOT_TESTED**, Guest-Zeit, Artefakt-/ASAR-Pin und minimalen redigierten Belegpfad nennen. Screenshots vor Zustellung auf private Daten prüfen. Keine rohen Requests/Responses, Keys, Tokens oder persönlichen Nachrichten. Ein Klick, Katalogstatus oder Sourcecheck ist kein praktischer PASS.

Bericht über den vorhandenen autorisierten Docs-Kanal unter `docs/test-reports/` zustellen. Keine Produktänderungen, Signierung, Veröffentlichung, Storeeinreichung oder Runtime-Migration aus diesem Guest-Auftrag ableiten. Lokale Modellqualität, Clean-Windows-Abhängigkeitsabschluss und echte Teamwork-Mehrprovider-Abnahme bleiben getrennte offene Gates.

# LastBrowser 0.1.47 — Auftrag für die dedizierte Windows-Test-VM

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

Je Fall **PASS / FAIL / BLOCKED / NOT_TESTED**, Guest-Zeit, Artefakt-/ASAR-Pin und minimalen redigierten Belegpfad nennen. Screenshots vor Zustellung auf private Daten prüfen. Keine rohen Requests/Responses, Keys, Tokens oder persönlichen Nachrichten. Ein Klick, Katalogstatus oder Sourcecheck ist kein praktischer PASS.

Bericht über den vorhandenen autorisierten Docs-Kanal unter `docs/test-reports/` zustellen. Keine Produktänderungen, Signierung, Veröffentlichung, Storeeinreichung oder Runtime-Migration aus diesem Guest-Auftrag ableiten. Lokale Modellqualität, Clean-Windows-Abhängigkeitsabschluss und echte Teamwork-Mehrprovider-Abnahme bleiben getrennte offene Gates.
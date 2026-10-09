# LastBrowser 0.1.50 — Guest-VM-Testauftrag

Status: **TEST-Prerelease verfügbar; Guest-Prüfung ausstehend.** Dies ist ein absichtlich unsignierter Testkandidat, kein Store- oder Stable-Release.

## Kandidat und Integrität

- Source-Commit: `2eeb314cdf233af7bd4aa4c28b70cc3be89c53b8`
- Versionspin: `output/release-0.1.50-20261009/source-freeze-pin-v8.json`, SHA-256 `829879daf98963811b0180b85b2a862e866e01ff4fc8eb070114654e75272d2b`
- Pflichtpipeline: `pipeline-receipt-v7.json`, SHA-256 `54aa0f9fb5bc085d0160c53270cc48ca13a2e4019a4cca550197619026ea75f1`; 215 Testdateien / 1.962 Tests PASS, Store 39 PASS / 2 WARN / 0 FAIL, Desktopbuild PASS, Pythonsyntax PASS. Die v8-Prüfung bestätigt, dass alle 38 gepinnten Produkt-/Testdateien den getesteten Inputs entsprechen; nur synchronisierte Zielbilddateien wurden danach aktualisiert.
- Paketreceipt und vollständige Quellen-/Buildprovenienz sind im lokalen Release-Ledger des Koordinators hinterlegt; für den Guest-Start gelten die oben vollständig aufgeführten Artefakt-Hashes.
- Paketreview: statische Integrität PASS; **kein** Runtime-, Installations-, Guest- oder Store-PASS.
- GitHub-Testrelease: [LastBrowser 0.1.50 TEST](https://github.com/Loggableim/lastbrowser/releases/tag/test-v0.1.50-20261009-2eeb314) — `prerelease=true`, `latest=false`.

| Paket | Download | Größe | Erwarteter SHA-256 |
|---|---|---:|---|
| Setup | [Lastbrowser-0.1.50-x64-setup.exe](https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.50-20261009-2eeb314/Lastbrowser-0.1.50-x64-setup.exe) | 174,693,419 Bytes | `cbf153422e447fb9323a7c8830207b0f01ca0ff6aecd6561d673872ebc336903` |
| Portable | [Lastbrowser-0.1.50-x64-portable.exe](https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.50-20261009-2eeb314/Lastbrowser-0.1.50-x64-portable.exe) | 174,339,260 Bytes | `a5cc5180959bcf65d4d772530c6a7a4fc3bf96a724b2120e49b75dd6221eea31` |
| `resources/app.asar` in both Paketen | — | 64,125,238 Bytes | `eba1b54af52da4b9de69b7f2bb9b201711d8f6a4f2289a9847ee095f6c82b713` |
| `Lastbrowser.exe` in Preview und beiden Paketen | — | 205,065,216 Bytes | `78c1cc51781b917e040a71864277281d7e75c8715a5d2894248b7810a4ce774c` |

GitHub meldet für Setup und Portable denselben SHA-256-Digest und dieselbe Größe wie diese Pins. Beide EXE-Pakete sind `NotSigned`. Bei fehlendem Asset, Größen-/Hashabweichung oder anderem ASAR nicht starten und den Fall als **BLOCKED** melden.

## Sicherheits- und Testgrenzen

- Ausschließlich die dedizierte, rücksetzbare Windows-Guest-Test-VM verwenden. Niemals Host-/Privatprofile, Hostinstallationen oder Host-Prozesse verändern; kein Host-Key und keine Geheimnisse übertragen.
- Keine Anmeldung, Accountumschaltung, neue Providerkosten, Käufe, Modellrotation, automatischen Provider-Fallbacks oder Mehrprovider-Teamwork-Turns. Nur bereits im Guest eingerichtete Konten verwenden; Geheimnisse bleiben im Guest und erscheinen weder in Screenshots noch Logs.
- Pro bereits eingerichteten Provider höchstens **einen** kurzen, toolfreien Textturn. Nur vorhandene Free-/Abo-Kontingente verwenden; bei möglicher Zusatzgebühr, Auth-, Quota-, Sicherheits- oder Netzwerkfehler stoppen, keinen Retry starten. Nicht eingerichtete Provider als **BLOCKED — Guest-HumanSetup fehlt** erfassen.
- Keine Releasesignierung, Stable-/Store-Übernahme oder Host-VM-Aktionen. Keine Pull-/Reset-/Merge-Aktion in der Guest-VM.
- Jeden Fall mit **PASS / FAIL / BLOCKED / NOT_TESTED** kennzeichnen. Screenshots/Logs vor Ablage redigieren; keine Schlüssel, Tokens, E-Mails, Prompts oder privaten Profilpfade veröffentlichen.

## Testfälle

1. **Artefakt und nicht-destruktives Update:** Setup-/Portable-Hash und Größe vor Ausführung prüfen. Der zuletzt gemeldete Guest-Iststand ist LastBrowser `0.1.49`, ASAR `64095997` Bytes, SHA-256 `856eb141180fb242580e13c37e6208fa932b7e765203f23d8b25187e26a6bf62` (Report-Commit `4b92cd1c8802f2a8b451420514d06bc33e9ef253`). Ausschließlich wenn der laufende Guest als dedizierte synthetische Testumgebung bestätigt ist, Setup `0.1.50` als In-Place-Update darüber installieren. Vorher Version, ASAR-Hash sowie redigierte Profil-/Provider-Bindungsanzahl festhalten; danach `0.1.50`, den erwarteten ASAR-Hash, erhaltene Guest-Profile/-Bindungen sowie normalen Quit und Neustart prüfen. Nicht deinstallieren, zurücksetzen, Daten löschen, Profile neu anlegen oder Zugangsdaten ändern. Wenn der Guest nicht eindeutig die dedizierte Testumgebung ist oder ein Schritt Daten löschen würde: stoppen und `BLOCKED` melden. Dies ist ein Upgrade-Test, kein Clean-Install-PASS. Bereits im Auftrag freigegebene Providerchecks bleiben auf bestehende Verbindungen und dort genannte Turn-/Kostenlimits beschränkt; keine zusätzlichen Providerturns, Kosten, Retries oder Änderungen.
2. **Portable:** Separat in einem eigenen Guest-Testprofil starten. Version und ASAR-Identität prüfen und sicherstellen, dass Setup-Profil und Portable-Profil getrennt bleiben. Keine zweite App-Instanz oder fremde Prozesse beenden.
3. **GPT:** Nur bei bereits eingerichteter Guest-Verbindung einen kurzen Textturn ausführen. Modellanzeige, Antwort, Fehlerdarstellung und normales Beenden erfassen.
   - **Modellwahl-UI (ohne zusätzlichen Providerturn):** Prüfen, dass gpt-6-luna nur zusammen mit dem Provider openai-codex angezeigt wird, falls das exakte Modell im Katalog vorhanden und qualifiziert ist. Wenn kein qualifiziertes Modell vorliegt, muss der Katalog sichtbar bleiben; unqualifizierte Einträge müssen als Beta/ungeprüft erkennbar sein und eine bewusste Beta-Opt-in-Möglichkeit direkt am Auswahlpfad anbieten. Auswahlstatus neben der Modellwahl kontrollieren; Qualifikationsdetails im Menü öffnen. In einem wegwerfbaren Guest-Testprofil darf der Opt-in-Fluss UI-seitig geprüft werden, aber keinen Turn mit einem ungetesteten Modell senden. Ergebnis mit PASS/FAIL/BLOCKED/NOT_TESTED und redigiertem Screenshot dokumentieren.
4. **OpenRouter:** Vorhandene Verbindung und Modellauswahl prüfen; einen kurzen Turn nur mit bereits verfügbarer, nicht zusätzlich kostenpflichtiger Berechtigung. Keine Schlüssel ändern oder Modellzugriff aus einer Liste ableiten.
5. **Xiaomi MiMo:** Settingsformular für explizite Base-URL und API-Key read-only prüfen, vorhandene Guest-Konfiguration verwenden, Save-/Maskierungs-/Readback-Verhalten kontrollieren und genau einen kurzen Turn nur mit bestehendem Kontingent senden. Niemals Key/URL in den Bericht kopieren.
6. **Ollama:** Lokalen Ollama-Endpunkt und Ollama Cloud auseinanderhalten. Nur den bereits im Guest konfigurierten Modus testen; bei Cloud keine kostenpflichtige Modellberechtigung umgehen. Modell, sichtbare Auswahl, Verbindung und gegebenenfalls einen kurzen Turn notieren.
7. **Antigravity:** Verbindung sowie Katalogstatus getrennt prüfen. In „KI & lokale Modelle“ und im Picker des Bereichs „Unterhaltung“ nach der tatsächlichen konto-/profilgebundenen Modellliste suchen. Keine veralteten oder erfundenen Modell-IDs wählen. Falls ein gültiges Modell angeboten wird, genau einen kurzen Turn ohne Toolaufruf durchführen. Falls der Katalog `unavailable`/leer bleibt oder der Picker fehlt, diese sichtbare Produktlücke als **FAIL** melden; nicht mit CLI, anderem Konto oder globalem Fallback umgehen. Bei Google-Login „Browser may not be secure“, 2FA oder CAPTCHA stoppen und den Bildschirmzustand redigiert dokumentieren.
8. **Befundbericht:** Für jeden Testfall Status, Zeit, genaue Setup-/Portable-/ASAR-Pins, sichtbare Provider-/Modellbezeichnung, redigierte Fehlermeldung und minimale Belege notieren. Bericht als `docs/test-reports/lastbrowser-0.1.50-vm-test-<YYYY-MM-DD>.md` im Reportszweig `codex/lastbrowser-electron-shell` ablegen. Anschließend Commit/Blob/SHA-256 und verwendete Artefakthashes nennen. Der Testauftrag selbst liegt im Guest-Pollzweig `codex/guest-0.1.47-resumption-20261007`.

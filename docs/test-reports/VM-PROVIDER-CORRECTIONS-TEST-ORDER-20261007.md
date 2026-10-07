# LastBrowser: VM-Abnahme der Provider-Korrekturen

Auftrag des Projektinhabers vom 7. Oktober 2026 über den CEO. Dieser Auftrag betrifft ausschließlich das neue, separat gebaute Testpaket. Die bisherige 0.1.46-Abnahme bleibt als historischer Bericht erhalten.

## Kandidat zuerst eindeutig bestimmen

**Kandidat 9615a8ae gebaut; VM-Zustellung noch nicht freigegeben.** Source-Freeze, Pflichtprüfungen und unabhängiger Paketreadback sind abgeschlossen. Der Übertragungs-/Downloadweg ist **unveröffentlicht und TODO**. Bis ein genehmigter Weg ausdrücklich mitgeteilt wurde, nichts in die VM übertragen oder dort ausführen. Lokale Hostpfade sind kein Downloadweg und keine automatisch verfügbare VM-Datei. Der ältere öffentliche Installer ist nicht dieser Kandidat und darf nicht als Abnahme des neuen Source-Stands ausgegeben werden.

| Feld | Verbindlicher Wert |
| --- | --- |
| Candidate-ID | `9615a8ae` |
| Neuer Installer und Übertragungs-/Downloadweg | Host: `C:\projekte\lastbrowser\output\provider-corrections-wrappers-20261007-9615a8ae\test-wrappers\LastBrowser-0.1.46-x64-UNSIGNED-TEST-setup.exe`; VM-Zustellung und Downloadweg unveröffentlicht/TODO |
| Installer SHA-256 | `6b5fcc92b509777ef2fdb779f09a16f8c62ad8abb36428390faa578ae008cb2b` (175.462.216 Bytes) |
| Portable SHA-256, falls separat getestet | `3c21eadf42a198133f3fb4b0369642d5ddbd438f47cad1e849d588f7b0f3434f` (175.108.347 Bytes); gleicher Ordner, `LastBrowser-0.1.46-x64-UNSIGNED-TEST-portable.exe` |
| Paketreceipt, Source-Stand und ASAR SHA-256 | `output/provider-corrections-candidate-20261007-9615a8ae/candidate-handoff.json`, SHA `5864240c12d513cbee591c5e979e108248b8893029dc896252dc28e28e38aa7e`; dirty Source über Eingabeinventur gepinnt; ASAR `2af4fbf50dea383dd0a2cd2ee36236f53f967cf3904cc01b6559647c04b08d07` |
| Extraktionsvergleich | `output/provider-corrections-wrappers-20261007-9615a8ae/full-extraction-comparison.json`, SHA `f833e38cc5d08a5f1eaafe86e0fb3421cc941981013ed43f6bb75e74587d86c4`; Preview, Setup und Portable jeweils 10.546 Dateien, keine fehlenden, zusätzlichen oder abweichenden Dateien |
| Unabhängiger Paketreview | `output/provider-corrections-independent-package-review-20261007.json`, SHA `b548398da85f459591ea131003138989f583c6dd75068fe81a1afea56e935ffe`; begrenzter Read-only-Review bestanden, beide Wrapper unsigniert; 7-Zip-Warnung dokumentiert |
| Finaler Integrationsreceipt | `output/provider-corrections-candidate-20261007-9615a8ae/integration-receipt.json`, SHA `7aa50ef4a5b02d749d000952bc1bed1685680752d33daf0babc3c56351faec97`; finale Quell-/Paketversiegelung, keine Gastabnahme |

### Nachweisgrenzen nach Ebene

| Ebene | Belegt | Nicht dadurch belegt |
| --- | --- | --- |
| Source | 1.830 Tests aus 195 Dateien bestanden; Store-Preflight 39 bestanden, 2 Warnungen, 0 Fehler; Desktop-Build und Python-Syntaxprüfung erfolgreich; Eingabeinventar 26.033 Dateien, kein Drift. | Keine praktische Paket- oder VM-Abnahme. |
| Paket | Kandidat `9615a8ae`, Version 0.1.46; 114 kompilierte Dateien und 12 Backend-Pins abgeglichen; Setup und Portable `NotSigned`; Extraktionsvergleich zeigt identische 10.546 Dateien. | Kein Installationsstart, keine UI-/Providerlaufzeit, keine Signierung oder Store-Zertifizierung. |
| Gast/VM | Noch keine Abnahme dieses Kandidaten. | Keine Installation, Providerantwort, UI-Interaktion oder Persistenz des neuen Kandidaten behaupten. |

Automatische Updates sind in diesem Offline-Testbuild deaktiviert; er kann den normalen Updateinstallationsablauf über zwei Releaseversionen nicht abnehmen. 7-Zip meldete beim Archiv „data after the end of archive“, zugleich aber „Everything is Ok“; die Extraktion endete mit Exitcode 0 und der vollständige Nutzlastvergleich fand keine Abweichungen. Das ist kein Installations- oder UI-Nachweis und der Warntext ist im Testbericht zu erhalten. Dies ist keine Store-Zertifizierung.

Arbeite über Computer Use ausschließlich in der dedizierten Windows-Test-VM. Prüfe vor Installation den Installer-Hash. Dokumentiere einen gegebenenfalls abweichenden installierten Stand; Version 0.1.46 allein reicht zur Zuordnung nicht aus. Keine Produktdateien in der VM reparieren oder alte Testbelege auf das neue Paket übertragen.

## Zustellung, Geheimnisse und begrenzter Umfang

Verwende ausschließlich die vom Nutzer bereits in der VM eingerichteten GPT-, Gemini/Antigravity- und Ollama-Cloud-Verbindungen. Für MiMo ist die einzutragende Base URL `https://token-plan-ams.xiaomimimo.com/v1`; der konkrete Modellname ist `mimo-v2.6-flash`, sofern er im aktiven, passenden Katalog verfügbar ist. Ein am Host gespeicherter MiMo-Key ist **keine** VM-Verbindung und darf niemals übertragen, kopiert oder aus Chat/Repository übernommen werden. Fehlt der MiMo-Key in der VM, den Fall als **BLOCKIERT – HumanSetup erforderlich** melden und den Nutzer bitten, den Key selbst direkt in der VM einzurichten. Keine Host-Konfigurationsdateien oder Geheimnisse aus Chat/Repository übernehmen. Der Installer-Downloadweg bleibt unveröffentlicht/TODO; vor dessen Freigabe keine VM-Zustellung.

Je nutzbarer, bereits eingerichteter Verbindung höchstens die kurze synthetische Anfrage und die unten genannten begrenzten Fälle. Keine Lasttests, breite Modellserien, Käufe, Abos oder technischen Umgehungen. Keine zusätzlichen realen Teamwork-Mehrproviderturns: Auswahl-/Speicherkonfiguration nur lesend prüfen; **Teamwork-Ausführung: NICHT GETESTET**. Keine neuen kostenpflichtigen Parallelaufrufe.

## 1. Chat, Quickchat und Sessiongrenzen

Mit synthetischen Prompts sowohl Normalchat als auch Quickchat unterscheiden und nur auf bereits eingerichteten Verbindungen testen.

- Sichtbare Antwort, Streaming und Stop prüfen; nach Stop auf verspätete Tokens/Ausgabe achten. Ein gleichzeitiger Providerfehler beweist keinen erfolgreichen Stop.
- Reset getrennt prüfen: Erfolg erst nach positiver Abbruch-/Resetbestätigung werten. Bei fehlender Bestätigung muss der bisherige Transcript/Binding erhalten bleiben und ein sichtbarer Wiederholungsweg bestehen.
- Nach Reset eine kurze Folgeanfrage im selben Scope senden. Normale Chats müssen weiter funktionieren.
- Sessionliste prüfen: Quickchat darf nicht als gewöhnlicher Chat erscheinen; normale Kontrollsession muss sichtbar bleiben. Nach App-Neustart nur die zugesagte normale Chatpersistenz werten; Quickchat nicht als persistente normale Session ausgeben.
- Scopewechsel prüfen, sofern die Zeitsteuerung einen laufenden Zustand erfasst: Ergebnis, Fehler, Ladeindikator, Transcript und Stop-Binding dürfen nicht in ein anderes Space-/Profilformular oder eine andere Session durchsickern. Wenn die Race-Situation nicht eintritt, **nicht geprüft** melden.

## 2. MiMo: maskiertes Speichern, Scope, URL und Modell

* Key-Eingabe muss maskiert sein. Gespeicherter oder eingegebener Key darf in UI, Logs, Screenshots und Bericht nie im Klartext auftauchen.
* Test und Speichern unterscheiden. Ein erfolgreicher Verbindungstest darf einen noch nicht gespeicherten Key nicht als gespeichert markieren oder das Eingabefeld leeren. Beim Speichern mit leerem Key-Feld muss ein vorhandener Key erhalten bleiben.
* Nach Speichern Modelle im passenden Scope abrufen; ASR-/TTS-Einträge nicht als Chatmodelle werten. Base URL `https://token-plan-ams.xiaomimimo.com/v1` und konkrete Auswahl `mimo-v2.6-flash` nur bei vorhandenem scoped Katalog prüfen.
* Einstellungen schließen/öffnen und App normal neu starten. Gespeicherter Status, URL und Modell müssen korrekt wieder erscheinen, ohne Keyoffenlegung.
* Zwei synthetische Profile/Spaces für scoped readback verwenden. Bei laufendem Test oder Modellabruf Profil wechseln oder Formular schließen und erneut öffnen. Alte Ergebnisse, Fehler und Ladezustände dürfen nicht im neuen Scope erscheinen; ein verspäteter Speichervorgang darf das fremde Profil nicht ändern. Ist der Race-Fall nicht eingetreten, **nicht geprüft** melden.

## 3. Antigravity-Account-Scope

Nur den bereits in der VM eingerichteten Antigravity-Login verwenden. Sicherstellen, dass angezeigte Verbindung, Accountstatus, Katalog und Modellwahl dem aktiven Profil/Space zugeordnet bleiben. Bei einem Scopewechsel darf weder Authentifizierungsstatus noch Auswahl aus einem anderen Account/Profil übernommen oder dort gespeichert werden. Keine erneute Anmeldung, Accountumschaltung oder Credentialkopie vornehmen. Wenn ein gültiger Scopewechsel nicht praktisch ausgelöst werden kann, **nicht geprüft** melden.

## 4. Ollama Cloud: enger, typisierter Subscription-Fallback

Ollama Cloud vom lokalen Ollama-Endpunkt unterscheiden. Mit einem verfügbaren Free-Modell beginnen. Ein einmaliger Fallback ist nur zulässig, wenn der Provider vor jeder sichtbaren Ausgabe und vor jedem Tooldispatch einen expliziten, typisierten Fehler `subscription_required` zurückgibt und im selben scoped Katalog ein geeignetes Free-Modell als verfügbar ausgewiesen ist. Gewünschtes und tatsächlich verwendetes Modell sowie sichtbaren Fallback-Hinweis dokumentieren. Maximal ein Retry.

Kein Retry bei 401/Authfehler, Rate-Limit, erschöpften Credits, Netzwerk-/Serverfehler, untypisiertem Text, bereits sichtbarer Ausgabe oder begonnenem Tooldispatch. Keine Fehler injizieren oder kostenpflichtige Abos testen. Nicht erreichbare Negativfälle als **nicht geprüft** markieren.

## 5. Teamwork – keine echte Mehrprovider-Ausführung

Nur vorhandene Modell-/Provider-Auswahl und gespeicherte Konfiguration lesend kontrollieren, ohne zusätzliche echte parallele Modellturns auszulösen. Status explizit als **Teamwork-Ausführung: NICHT GETESTET** ausweisen. Keine zusätzliche Freigabe aus Modellverfügbarkeit, Auswahl oder gespeichertem Zustand ableiten.

## Bericht

Neuen datierten Bericht und passende, von Geheimnissen bereinigte Screenshots unter `docs/test-reports/` ablegen. Source-, Paket- und Gaststatus getrennt ausweisen. Für jeden Fall **bestanden / fehlgeschlagen / blockiert / nicht geprüft** mit Schritten, erwarteter und beobachteter Reaktion, Zeitpunkt und Screenshot. Candidate-ID, Installer-/ASAR-Hash, konkrete Provider/Modelle und tatsächliche Antwort-/Stop-Belege nennen. Keine Keys, Cookies, Tokens, Zugangsdaten oder private Logs veröffentlichen. Den Berichtspfad und nötige HumanSetup-Aktion zurückmelden; aus dieser Testanweisung keine Produktänderung, Signierung, Veröffentlichung, Store-Einreichung oder zusätzliche Teamwork-Ausführung ableiten.

Nach Abschluss oder echter Blockade Rapport mit Berichtspfad, Commit, tatsächlich erfolgtem Push, Ergebnissen und nötiger Nutzeraktion liefern. Keine Produktänderung, Veröffentlichung von Paketen oder Store-Einreichung aus diesem Testauftrag ableiten.

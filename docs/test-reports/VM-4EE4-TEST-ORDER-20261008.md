# LastBrowser 0.1.48 — Guest-Testauftrag 4EE4

Stand: 8. Oktober 2026. Kandidatenspezifischer Auftrag für die bereits eingerichtete dedizierte synthetische Windows-Guest-Umgebung. Dieser Auftrag ersetzt frühere Kandidaten-Installationsaufträge für neue 4EE4-Testläufe; historische Baselineberichte und deren Ergebnisse bleiben erhalten und werden nicht wiederholt oder überschrieben.

## Kandidatenbindung und Bereitstellung

- Kandidat: `store-package-candidate-4ee4b86f-20261008`, Version `0.1.48`.
- Sourcecommit: `4ee4b86feb565aa8e68990668b996b6657c18f9f`; Source-tree: `96eaee744f3d3f7291dde4bc1b1577ba79ec04a4`.
- Test-Prerelease ist bereits veröffentlicht. [Release und Testpaket](https://github.com/Loggableim/lastbrowser/releases/tag/test-v0.1.48-4ee4b86f-20261008). Kein erneuter Upload oder Releaseedit. Finaler lokaler Zustellreceipt-SHA-256: `580538022A426EB56539C13248A358CB9252CEC7081291BDAE8FD9E5B453543F`.
- ZIP: [Guest-Testbundle](https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.48-4ee4b86f-20261008/Lastbrowser-0.1.48-4ee4b86f-guest-test.zip), 348,038,371 Bytes, SHA-256 `e038b39677b3a6aaffa0bd5766d49b1f223810682e48a682fb6cde56e65ae5c3`.
- Separates Manifest: [candidate-manifest-4ee4b86f.json](https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.48-4ee4b86f-20261008/candidate-manifest-4ee4b86f.json), 3,350 Bytes, SHA-256 `77a4945015723ad503830c10d156f778099a4f4973e6f44bbc277ec84da2c17f`.
- Setup: `Lastbrowser-0.1.48-x64-setup.exe`, 174,192,332 Bytes, SHA-256 `27e583974be7b561d9a80e29f554cacffbeab607aae5249aae112fc1073ac9ba`.
- Portable: `Lastbrowser-0.1.48-x64-portable.exe`, 173,838,182 Bytes, SHA-256 `7b390adc67e69cff9e3cb4d2378e16a18ee691e7fbc0aaef7707446a13e11d85`.
- Installiertes `app.asar`: SHA-256 `ac804118ebfa336c0c8293cafda924ff431f0a99dd6fd976c04bde7d63cb50d4`.
- Kandidat und beide Wrapper sind unsigniert. Static full review: 48 PASS / 0 FAIL. Das belegt keine Runtime, Installation oder Guest-Abnahme.

Vor Ausführung ZIP, Manifest, enthaltene Dateigrößen/-hashes und nach Setup-Installation den tatsächlichen `app.asar` prüfen. Bei Abweichung, nicht belegbarer Quelle oder fehlendem Testbundle sofort stoppen und den exakten Gap melden; keine andere Version einsetzen.

## Umgebung, Scope und Erhalt historischer Baselines

1. Nur im bereits freigegebenen dedizierten synthetischen Guest-Profil testen. Vor jeder UI-Aktion Guest-Identität, OS-Edition/-Build/-Architektur und clean Snapshot/Baseline-ID festhalten. Keine Host-VM, privaten Profile, echten Konten oder fremden Prozesse verwenden. Kann der saubere Ausgangszustand nicht belegt werden: Baseline-abhängige Fälle `NOT_VERIFIED` / `BLOCKED_BASELINE_UNCONFIRMED`.
2. `BASELINE-UI-20261008` wurde bereits zugestellt. Bestehende Baselinehistorie und Resultate nur lesen und referenzieren; nicht neu aufnehmen, löschen, zurücksetzen oder durch 4EE4-Ergebnisse ersetzen.
3. Kandidatenspezifische Installations-/Update- und Laufzeitfälle dürfen mit exakt den oben gepinnten 4EE4-Dateien in einem eigenen synthetischen Snapshot ausgeführt werden. Setup installieren und – falls im Kandidaten tatsächlich aktiviert und im vorhandenen Testzustand verfügbar – den kandidatengebundenen Updatepfad testen. Stable-Feed oder Store nicht verwenden/ändern. Ist Update im Offline-Kandidaten deaktiviert oder fehlt eine nachweisbare Update-Baseline, Status `NOT_TESTED` mit Beleg statt Ersatzpfad.
4. Portable separat in einem synthetischen Testpfad starten, normal beenden und erneut starten. Keine Profile oder Daten aus der Setup-Installation übernehmen, außer der jeweilige Testfall verlangt das ausdrücklich.
5. Kein Providerturn, keine Modellsuche/-installation, kein Modell-/Runtime-Download, keine Kosten, kein Upload, kein Signing, keine Stable-Promotion und keine Store-Submission.

## Kandidatengebundene Fälle

| ID | Prüfung | Erwarteter Nachweis / Grenze |
|---|---|---|
| `4EE4-IDENTITY` | Guest-Baseline, Kandidatentransport, SHA-256, Version und ASAR-Pin | Identität und sauberer Snapshot belegt. Abweichung: stoppen. Ein bloß sichtbares Fenster ist kein Kandidaten-PASS. |
| `4EE4-SETUP-LIFECYCLE` | Exakten Setup-Wrapper installieren; App starten, normal beenden und neu starten. Im zulässigen synthetischen Snapshot Setup-Update nur über den tatsächlich aktiven kandidateneigenen Testpfad prüfen. | Setup/App-Version, beobachtete Aktionen, Exit/Neustart und installierter ASAR-Hash. Update nicht verfügbar: `NOT_TESTED`; kein Stable-Update. |
| `4EE4-OFFLINE-STARTUP` | In der isolierten synthetischen Guest-Umgebung tatsächlichen App- und Backendprozess starten und den im Laufzeitbeleg ausgewiesenen lokalen Health-Endpunkt prüfen. Netzstatus, Prozessidentität, Health-Antwort und redigierte Startup-Logs festhalten; keine Provideranfrage, Modell-/Providerdownloads oder Kosten. | Appfenster allein ist kein Backend-/Offline-PASS. Externe Erreichbarkeit und Providerverhalten werden nicht behauptet. Kein Portscan; nur den vom Laufzeitbeleg ausgewiesenen lokalen Endpunkt verwenden. |
| `4EE4-PORTABLE-LIFECYCLE` | Exakten Portable-Wrapper starten, normal beenden und neu starten. | Tatsächlicher Wrapperhash, Appversion und Lifecycle-Ergebnis. Fehler und nicht gestartete Zustände getrennt berichten. |
| `4EE4-NEW-TAB` | **Zuerst** den prominenten Expanded-New-Tab-Button oberhalb der angepinnten Einträge betätigen; nach Rendern prüfen, dass der neue/aktivierte Tab den mittleren URL-/Suchfokus erhält. Synthetischen Text direkt eingeben und eine harmlose lokale synthetische Ziel-URL absenden. **Danach**, soweit vorhanden, Slim-Dock-New-Tab, `Ctrl+T` und Wechsel zu einem bestehenden Tab prüfen; beim bestehenden Tabwechsel festhalten, dass kein unerwarteter URL-/Such-Autofokus übernommen wird. | Buttonposition, Trigger, Ziel-Tab, Fokus, direkte Eingabe und sichtbares Ergebnis je Variante dokumentieren. Wenn kein lokales synthetisches Ziel nutzbar ist: Navigation `NOT_TESTED`; keine unbekannte Website öffnen. Source-/Reviewbeleg ersetzt keine Guest-Beobachtung. |
| `4EE4-CHAT-DEFAULTS` | Standardauswahl eines einzelnen Modells sowie Teamwork-/Beta-Kennzeichnung und aktuellen Opt-in-Zustand ablesen. | Genaue sichtbare Bezeichnung/Zustand dokumentieren. Einstellungen nicht ändern und keinen Provider aufrufen. |
| `4EE4-YOUTUBE-BASELINE` | Normale Wiedergabe öffentlicher, nicht authentifizierter YouTube-Videos beobachten. Keine Ads anklicken, keine Anmeldung, keine privaten Profile, keine Anti-Bot-Umgehung. | Nur tatsächlich beobachtete Wiedergabe/Ads protokollieren. Wird keine Ad ausgeliefert: `NOT_OBSERVED`, kein Adblock-PASS. Dieser Baselinefall belegt ausdrücklich nicht den separaten künftigen YouTube-Adblock-Fix. |
| `4EE4-CLEAN-CRT` | Nur bei belegtem clean Guest-Snapshot: tatsächlich von Lastbrowser/Kindprozessen geladene CRT-Module mit vollständigen Pfaden und SHA-256 aufnehmen; mit unabhängig belegter sauberer `System32`-Baseline vergleichen. | Ohne Snapshotidentität, System32-Baseline oder geladene Modulpfade/-hashes: `NOT_VERIFIED`/`NOT_TESTED`; keine Offline-Closure ableiten. Redigierten Evidencebeleg hinterlegen. |
| `4EE4-SETUP-UNINSTALL` | Als eigenen letzten Fall nach allen anderen Prüfungen im dedizierten synthetischen Snapshot den exakten 4EE4-Setup-Kandidaten deinstallieren. Exitcode, App-/Publisher-Registrierung und verbleibende Programmdateien prüfen; vor/nach Zustand der synthetischen Profil-/Testdaten gegen erwartete Erhaltung dokumentieren. | Keine privaten Profile, Nutzerdaten oder Hostdateien löschen. Appregistrierung/-dateireste und erwartete Profilbeibehaltung getrennt bewerten; bei nicht belegbarer Ausgangslage `NOT_TESTED`. Deinstallation ist der abschließende Fall, nicht Vorbereitung für weitere Tests. |

BoringSSL-Source-to-Link bleibt ein getrennter Producer-Evidence-Gate. Guest-Start, Versionslabel, Notice oder PE-Importbeobachtung schließen diesen Herkunfts-/Linknachweis nicht.

## Ergebnisbericht und Status

Für jeden Fall `PASS`, `FAIL`, `BLOCKED`, `NOT_OBSERVED` oder `NOT_TESTED` melden, mit UTC-Zeit, Kandidatenpins, OS-/Snapshotbasis, kurzen Reproduktionsschritten, erwartetem/tatsächlichem Ergebnis und redigiertem Evidencepfad. Keine Tokens, Kontonamen, persönlichen Pfade oder fremden Profildaten aufnehmen. Kein Status aus Source-, Unit-, Harness- oder Hostbelegen als Guest-PASS ausgeben.

Ergebnisdatei im bestehenden Berichtsbranch `codex/lastbrowser-electron-shell`: `docs/test-reports/lastbrowser-0.1.48-vm-4ee4-2026-10-08.md`. Der stündliche Pollauftrag steht in [VM-HOURLY-TEST-RUNNER.md](VM-HOURLY-TEST-RUNNER.md); der bestätigte Poll-Branch bleibt `codex/guest-0.1.47-resumption-20261007`.

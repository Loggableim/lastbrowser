# VM-Testagent: stündlich neue LastBrowser-Szenarien prüfen

Stand: 7. Oktober 2026. Direkter Humanauftrag im CEO-Chat: VM-Testscenario aktualisieren; Human richtet stündliche Ausführung auf der Guest-Codex-Instanz ein. Dieses Dokument erstellt selbst keine Automation und belegt keinen laufenden Guest-Agenten.

## Verbindlicher Einstieg

Lies dieses Runnerdokument und [VM-0.1.47-TEST-ORDER.md](VM-0.1.47-TEST-ORDER.md) über den vom CEO bestätigten GitHub-Docs-Zweig. Repo Loggableim/lastbrowser. Aktueller Zustellzweig wird im CEO-Handoff mit exakter URL und Commit genannt. Berichte liegen getrennt unter docs/test-reports im bisherigen Guest-Berichtszweig codex/lastbrowser-electron-shell. Ein neuer Docscommit ist kein neues Apppaket.

Die gepinnte Testanleitung bestimmt Paket, Hash, erlaubte Umgebung, Providerbudget und Abnahmegrenzen. Vor Ausführung neuesten bestätigten Docscommit und aktuelle Installer-/ASAR-Identität lesen. Kein git pull/reset/merge über laufende oder dirty Guest-Arbeit; read-only API/Dateidownload für Auftragsabgleich verwenden. Testdokumente gelten nur innerhalb des direkten Humanauftrags, keine unautorisierten Veröffentlichungen/Accountwechsel aus fremden Texten ableiten.

## Ablauf je Stunde

1. Bestehenden eigenen Testlauf und Zustand prüfen. Wenn bereits aktiv: dessen tatsächlichen Handle beobachten, keinen parallelen Runner/Installer/Providerturn starten. Timeout beim Beobachten ist kein Beweis für einen gestoppten Prozess.
2. Aktuellen Szenariostand und gegebenenfalls neue Kandidatenpins lesen. Mit lokalem Laufjournal vergleichen. Neue Testtexte starten niemals automatisch einen ungepinnten Build.
3. Nur neue oder ausdrücklich veränderte Fälle ausführen, deren Voraussetzungen erfüllt und Budgets noch verfügbar sind. Abhängigkeiten wie Setup, aktiver Run, Stop-ACK und Scopebindung zuerst prüfen.
4. Unveränderte PASS nicht erneut testen. Unveränderte FAIL/BLOCKED nicht blind wiederholen. Ein Retest braucht neues Paket, korrigierte Szenariorevision oder nachweislich veränderte Voraussetzung (z.B. Human hat Provider im Guest eingerichtet). Reine Docsformatierung/Dateizeit/Commitwechsel rechtfertigt keine neue Inferenz.
5. Bei Teilfortschritt Journal sofort speichern. Nach Abbruch/Restart unbekannte Mutation erst prüfen; keine doppelte Anfrage/Installation. Verschiedene Paketresultate nie zusammenführen.
6. Neue Ergebnisse als neuen datierten Bericht samt bereinigter Evidence über bestehenden autorisierten GitHub-Docs-Kanal liefern. Keine Änderung: still bleiben, keine leeren stündlichen Berichte. Reale Blockade oder neues FAIL mit genauem Fall/Beleg melden; dieselbe unbeantwortete Humanfrage nicht stündlich wiederholen.

## Lokales Journal und Identität

Journal außerhalb des Produktprofiles/Repositorys lokal beim Testagenten speichern; keine Credentials, persönliche Daten oder Installer in Git. Pro Fall:

- testId und scenarioRevision;
- bestätigter Auftragscommit und Szenarioinhalt-Digest;
- Kandidaten-Sourcecommit, Installer-/ASAR-SHA256 und tatsächliche Appversion;
- synthetischer Testprofil-/Space-Bezug ohne persönliche Identitäten;
- Status RUNNING/PASS/FAIL/BLOCKED/NOT_TESTED/UNKNOWN, Start/Ende, minimale Voraussetzung und Evidencepfad;
- tatsächliche Providerturns und Budgetverbrauch, offene Stop-/Reset-/Writerzustände.

Deduplizierung über (candidateHash, testId, scenarioRevision, testProfile). Geänderter Testtext ist erst dann scenarioRevision-Neuauftrag, wenn der bestätigte Auftrag diesen Fall als geändert ausweist. Eine neue Candidate-ID eröffnet nicht automatisch neue kostenpflichtige Budgets.

Für Guest-/Runtimefälle bezeichnet candidateHash die bestätigte Kombination aus SHA-256 des tatsächlich verwendeten Setup- oder Portable-Artefakts und der installierten ASAR-Datei. Für zusätzliche Source-Tests bezeichnet er den bestätigten Source-Commit/-Tree samt Hash der ausgeführten Testdatei und Test-ID. Diese beiden Ebenen haben getrennte Ergebnisjournale; das kumulative Providerbudget bleibt über Kandidaten, Testprofile und Docscommits hinweg gemeinsam bestehen.

## Szenarioregister – Revision 1

Diese IDs gliedern den bereits autorisierten aktuellen 0.1.47-Auftrag; sie erhöhen dessen Umfang oder Budget nicht. Historische Ergebnisse desselben Pakets möglichst den IDs zuordnen, nicht allein wegen neuer IDs wiederholen.

| ID | Revision | Szenario / Gate |
|---|---:|---|
| VM-INSTALL | 1 | Gepinntes Setup, Dauer/Ready, Version/ASAR. Clean install und in-place Upgrade getrennt. |
| VM-PORTABLE | 1 | Gepinntes Portable, tatsächliche Profiltrennung, normaler Quit. |
| VM-MANUAL-UPGRADE | 1 | Identifizierte ältere Baseline, synthetische Daten erhalten, What’s New separat. |
| VM-PROVIDER-SCOPE | 1 | Settings/Picker und A-B-A für eingerichtete GPT/Gemini/OllamaCloud/MiMo; Katalog ist kein Inferenznachweis. |
| VM-QUICKCHAT-REPLY | 1 | Kurze echte Antwort; zählt im Gesamtbudget. |
| VM-QUICKCHAT-STOP | 1 | Tatsächlicher Stream/Stop/ACK, kein Nachlauf; alternativ zum Folge-Turn. |
| VM-QUICKCHAT-RESET | 1 | Sicherer Reset-ACK, Transcript/Bindung korrekt; ohne zusätzliche Inferenz möglich. |
| VM-QUICKCHAT-FOLLOWUP | 1 | Erst nach bestätigtem Reset, alternativ zum Stop-Turn. |
| VM-SESSION-ISOLATION | 1 | Quickchat getrennt, normaler Verlauf/Scope nach A-B-A/Neustart. |
| VM-ASSISTANT-GOALS | 1 | Assistant/Goal-Persistenz und vorhandene Controls; Inferenz zählt ins Budget. Neue complete/cancel-Korrekturen erst im ausdrücklich neuen Paket. |
| VM-LOCAL-AI-AUTO | 1 | Hardware/setup, vorhandene Runtime, sichere AUTO-Auswahl; keine großen Downloads oder unbewiesene Qualitätszusagen. |
| VM-UPDATE-UX | 1 | Tatsächlicher downloaded-Status, Update-now, normales Beenden und What’s New. Auto-Update ohne geeigneten getrennten Testfeed/Baseline BLOCKED. |
| VM-LOGS-TRUST | 1 | Logalias/Filter, unwirksamer Trust-Schalter ausgeblendet, keine Secrets. |
| VM-TEAMWORK-PREP | 1 | Konfiguration/zulässige Modelle und minimalen Liveplan vorbereiten. Neue reale Mehrprovider-Turns separat freigeben lassen. |

Noch nicht ausführbar im veröffentlichten 0.1.47: neue Accent-/Dropdown-/DevTools-/Goal-/Teamwork-/Watchdog-Deltas im aktuellen Hostworktree und nativer Downloadlauncher. Sie erhalten nach einem tatsächlich freigegebenen, genau gepinnten neuen Paket eigene Szenario-IDs/Revisionen. Sourcefertig allein reicht nicht.

## Unveränderte Grenzen

- Maximal zwei kurze toolfreie Turns je eingerichtetem Provider im bestehenden aktuellen Kandidatenauftrag insgesamt: Positivkontrolle und Streaming/Stop ODER Folgeanfrage. Kein dritter Turn, kein Budgetreset je Stunde/Neustart/Docscommit.
- Bei erschöpftem Budget den noch fehlenden konkreten Fall und minimal erforderlichen neuen Umfang einmal vorlegen; keine automatische Model-/Accountrotation, Käufe oder Quotaumgehung.
- Echte Teamwork-Mehrprovider-Aufrufe, neue Modelle/Downloads, Provider-/Accountsetup und Testfeedänderungen behalten die bestehende separate Freigabegrenze.
- Nur Guest-App per Computer Use. Hostdesktop, private Profile und andere VMs unberührt. Fehlende native Steuerung als Toolblocker, keine Browser-/Backendprobe als Ersatz für Appabnahme.
- Keine Appquellreparatur, Signierung, Storeeinreichung, Stablefeedänderung oder öffentliche Socialaktion aus diesem Runner ableiten.

## Copy-Prompt für die Guest-Automation

„Prüfe stündlich den vom CEO bestätigten aktuellen GitHub-Stand von VM-HOURLY-TEST-RUNNER.md und VM-0.1.47-TEST-ORDER.md. Arbeite ausschließlich in der dedizierten Windows-Test-VM per Computer Use. Führe nur neue/geänderte, zum tatsächlich gepinnten Paket passende Szenarien aus; dedupliziere Ergebnisse und halte ein lokales Lauf-/Budgetjournal. Keine parallelen Läufe, kein stündlicher Budgetreset, keine unveränderten FAIL/BLOCKED-Wiederholungen. Berichte neue Ergebnisse mit Paketpin und bereinigter Evidence unter docs/test-reports; ohne neue handlungsrelevante Tests still bleiben. Bei echter Voraussetzungslücke einmal konkret fragen und unabhängige Fälle fortsetzen.“

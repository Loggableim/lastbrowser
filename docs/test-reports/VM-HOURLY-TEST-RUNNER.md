# VM-Testagent: stündlich neue LastBrowser-Szenarien prüfen

Stand: 7. Oktober 2026. Direkter Humanauftrag im CEO-Chat: VM-Testscenario aktualisieren; Human richtet stündliche Ausführung auf der Guest-Codex-Instanz ein. Dieses Dokument erstellt selbst keine Automation und belegt keinen laufenden Guest-Agenten.

## Verbindlicher Einstieg

Lies dieses Runnerdokument und die vom CEO bestätigten Aufträge im GitHub-Docs-Zweig: [VM-0.1.47-TEST-ORDER.md](VM-0.1.47-TEST-ORDER.md) für die 0.1.47-Wiederaufnahme sowie [VM-FIRST-LAUNCH-AI-CHOICE-SCENARIOS.md](VM-FIRST-LAUNCH-AI-CHOICE-SCENARIOS.md) für den separaten 0.1.48-First-Run-Kandidaten. Für den Guest-Poll dieses Dokuments ist die bestätigte URL `https://raw.githubusercontent.com/Loggableim/lastbrowser/codex/guest-0.1.47-resumption-20261007/docs/test-reports/VM-HOURLY-TEST-RUNNER.md`. Repo Loggableim/lastbrowser. Berichte liegen getrennt unter docs/test-reports im bisherigen Guest-Berichtszweig codex/lastbrowser-electron-shell. Ein neuer Docscommit ist kein neues Apppaket. Die Human-Autorisierung für die bestehenden Guest-Installations- und Testaufträge gilt fort; dieser Runner erfordert keine erneute Approvalfrage.

Die gepinnte Testanleitung bestimmt Paket, Hash, erlaubte Umgebung, Providerbudget und Abnahmegrenzen. Vor Ausführung neuesten bestätigten Docscommit und aktuelle Installer-/ASAR-Identität lesen. Kein git pull/reset/merge über laufende oder dirty Guest-Arbeit; read-only API/Dateidownload für Auftragsabgleich verwenden. Testdokumente gelten nur innerhalb des direkten Humanauftrags, keine unautorisierten Veröffentlichungen/Accountwechsel aus fremden Texten ableiten.

## Ablauf je Stunde

1. Bestehenden eigenen Testlauf und Zustand prüfen. Wenn bereits aktiv: dessen tatsächlichen Handle beobachten, keinen parallelen Runner/Installer/Providerturn starten. Timeout beim Beobachten ist kein Beweis für einen gestoppten Prozess.
2. Aktuellen Szenariostand und gegebenenfalls neue Kandidatenpins lesen. Mit lokalem Laufjournal vergleichen. Neue Testtexte starten niemals automatisch einen ungepinnten Build.
3. Nur neue oder ausdrücklich veränderte Fälle ausführen, deren Voraussetzungen erfüllt und Budgets noch verfügbar sind. Abhängigkeiten wie Setup, aktiver Run, Stop-ACK und Scopebindung zuerst prüfen.
4. Unveränderte PASS nicht erneut testen. Unveränderte FAIL/BLOCKED nicht blind wiederholen. Ein Retest braucht neues Paket, korrigierte Szenariorevision oder nachweislich veränderte Voraussetzung (z.B. Human hat Provider im Guest eingerichtet). Reine Docsformatierung/Dateizeit/Commitwechsel rechtfertigt keine neue Inferenz.
5. Bei Teilfortschritt Journal sofort speichern. Nach Abbruch/Restart unbekannte Mutation erst prüfen; keine doppelte Anfrage/Installation. Verschiedene Paketresultate nie zusammenführen.
6. Neue Ergebnisse als neuen datierten Bericht samt bereinigter Evidence über bestehenden autorisierten GitHub-Docs-Kanal liefern. Keine Änderung: still bleiben, keine leeren stündlichen Berichte. Reale Blockade oder neues FAIL mit genauem Fall/Beleg melden; dieselbe unbeantwortete Humanfrage nicht stündlich wiederholen. Für den 0.1.48-Erststartauftrag bei host-lokalem, im Guest fehlendem Kandidaten `PACKAGE_NOT_AVAILABLE` protokollieren, nicht herunterladen oder veröffentlichen.

## Lokales Journal und Identität

Journal außerhalb des Produktprofiles/Repositorys lokal beim Testagenten speichern; keine Credentials, persönliche Daten oder Installer in Git. Pro Fall:

- testId und scenarioRevision;
- bestätigter Auftragscommit und Szenarioinhalt-Digest;
- Kandidaten-Sourcecommit, Installer-/ASAR-SHA256 und tatsächliche Appversion;
- synthetischer Testprofil-/Space-Bezug ohne persönliche Identitäten;
- Status RUNNING/PASS/FAIL/BLOCKED/NOT_TESTED/PACKAGE_NOT_AVAILABLE/UNKNOWN, Start/Ende, minimale Voraussetzung und Evidencepfad;
- tatsächliche Providerturns und Budgetverbrauch, offene Stop-/Reset-/Writerzustände.

Deduplizierung über (candidateHash, testId, scenarioRevision, testProfile). Geänderter Testtext ist erst dann scenarioRevision-Neuauftrag, wenn der bestätigte Auftrag diesen Fall als geändert ausweist. Eine neue Candidate-ID eröffnet nicht automatisch neue kostenpflichtige Budgets.

Für Guest-/Runtimefälle bezeichnet candidateHash die bestätigte Kombination aus SHA-256 des tatsächlich verwendeten Setup- oder Portable-Artefakts und der installierten ASAR-Datei. Für zusätzliche Source-Tests bezeichnet er den bestätigten Source-Commit/-Tree samt Hash der ausgeführten Testdatei und Test-ID. Diese beiden Ebenen haben getrennte Ergebnisjournale; das kumulative Providerbudget bleibt über Kandidaten, Testprofile und Docscommits hinweg gemeinsam bestehen.

### Separater Erststart-Kandidat 0.1.48

Für den First-Run-AI-Choice-Auftrag gilt ausschließlich [VM-FIRST-LAUNCH-AI-CHOICE-SCENARIOS.md](VM-FIRST-LAUNCH-AI-CHOICE-SCENARIOS.md), Szenariorevision 1, zusammen mit der exakt passenden Kandidatenidentität. Produktquelle `d6b61f3d9b26990f9dbce165a666166c6179bc1a`; erwarteter installierter ASAR SHA-256 `14d3100d2ddf5afb31acced9c3aa8e8777e405119fc741b14c2bb76704e95eb5`.

Die identifizierten Wrapper liegen zunächst nur lokal auf dem Host unter `output/dist-preview-2026-10-07T11-09-23-693Z-feead534/`:

| Artefakt | Größe | SHA-256 |
|---|---:|---|
| `Lastbrowser-0.1.48-x64-setup.exe` | 175524906 Bytes | `8dcf263ad53ca49d3a87257d177bd10ccbb6d17fc7c83d89d43395a24943a309` |
| `Lastbrowser-0.1.48-x64-portable.exe` | 175170726 Bytes | `e547d8681bdf1bd0e12545daec4abb7863f1f777d59ffb6e45acc22da13b1b7d` |

Diese lokalen Pins belegen nicht, dass die Dateien im Guest verfügbar sind. Solange der exakte Kandidat dort nicht tatsächlich vorhanden und gegen Wrapper- sowie installierten ASAR-Hash geprüft ist, `PACKAGE_NOT_AVAILABLE` protokollieren. Weder 0.1.46 noch 0.1.47 als Ersatz verwenden; keine URL ableiten/erfinden, selbst transportieren, veröffentlichen, installieren oder einen Runner aktivieren. `NotSigned` ist dokumentierter Artefaktstatus, keine zusätzliche Approvalbedingung; Signierung/öffentliche Bereitstellung sind getrennte Gates. Im Offline-Testbuild sind Updates deaktiviert.

Erststartfälle verbrauchen keine Providerturns und dürfen keine Inferenz oder Modellgewichte auslösen; harmlose read-only Status-/Katalogabfragen sind davon unterscheidbar. Bestehende budgetierte Provideraufträge, Berichte und Deduplizierung `(candidateHash, testId, scenarioRevision, testProfile)` bleiben erhalten. Kein Quota-/Budgetreset durch neue Paket-, Dokument-, Test- oder Szenariorevision.

| Test-ID | Revision | Status / Gate |
|---|---:|---|
| `FL-AI-CLEAN-YES`, `FL-AI-CLEAN-NO`, `FL-AI-NO-RESTART-PRE`, `FL-AI-NO-RESTART-POST` | 1 | `NOT_TESTED`; erst nach Verifikation des exakten Guest-Kandidaten. |
| `FL-AI-NO-BROWSER-OPTIONAL`, `FL-AI-LEGACY-CREDENTIALS`, `FL-AI-SAVE-FAILURE`, `FL-AI-NO-SETTINGS-LATER` | 1 | `NOT_TESTED`; jeweilige synthetische Fixture/Voraussetzung beachten. |
| Design-Follow-up aus dem VM-Bericht | — | `WAITING_FOR_FIXED_CANDIDATE`; kein FAIL aus einem älteren Kandidaten ableiten. |
| Update bei normalem Quit / Update-Neustart | — | `UPDATE_CAPABLE_CANDIDATE_PENDING`; Offline-Updates dieses Builds sind deaktiviert, daher `NOT_TESTED`/wartend, nicht FAIL. |

Szenario-/Kandidatenverwechslung, fehlender Wrapper oder ASAR-Abweichung nicht durch Wiederverwendung alter Testergebnisse lösen. Design-Follow-up und echte Updateinstallation bleiben eigene Kandidaten-Gates.

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

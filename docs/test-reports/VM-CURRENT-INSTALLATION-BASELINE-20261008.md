# Historischer Guest-UI-Baselineauftrag: vorhandene Installation

- Auftrags-ID: `BASELINE-UI-20261008`
- Status bei Zustellung: `NOT_TESTED`
- Geltungsbereich: ausschließlich die bereits im dedizierten Guest-Testprofil vorhandene LastBrowser-Installation, wie sie zum Testzeitpunkt vorgefunden wird.
- Beweisgrenze: Ergebnisse sind eine historische UI-Baseline dieses installierten Kandidaten. Sie sind keine Abnahme künftiger Store-1-Änderungen, Builds, Pakete oder Veröffentlichungen.

## Sicherheits- und Identitätsgate

1. Lies den aktuellen [stündlichen Runnerauftrag](VM-HOURLY-TEST-RUNNER.md) und gleiche den Auftragsstand über die GitHub-API oder einen schreibgeschützten Dateiabruf ab. Verändere kein Guest-Checkout und führe kein `pull`, `reset` oder `merge` aus.
2. Arbeite ausschließlich mit der dedizierten synthetischen Guest-Browser-Testumgebung. Bestätige vor Interaktionen, dass das sichtbare Profil/Testkonto ausdrücklich als synthetisch und für diese Tests freigegeben erkennbar ist. Wenn Profilidentität oder Scope nicht sicher bestätigbar sind: vor allen UI-Aktionen stoppen und `BLOCKED_PROFILE_SCOPE_UNCONFIRMED` mit der konkret fehlenden Evidenz melden.
3. Erfasse Appname, installierte Version, Installationsquelle soweit sichtbar, tatsächlichen installierten ASAR-SHA-256 und den Setup-/Portable-Wrapper-SHA-256, falls der Wrapper in der Guest-Umgebung bereits vorliegt. Nichts herunterladen, installieren, aktualisieren, zurücksetzen oder aus einer anderen Quelle beziehen. Geheimnisse, Kontenamen, persönliche Daten und private Pfade nicht erfassen.
4. Wenn Kandidaten-/Installationsidentität nicht verifizierbar ist, protokolliere `PACKAGE_IDENTITY_UNCONFIRMED` samt konkret fehlendem Beleg und stoppe die UI-Prüfung. Ein sichtbarer UI-Befund darf separat als ungebundene Beobachtung dokumentiert werden, aber nicht als Kandidaten-PASS.

## Szenario

Führe die folgenden Schritte nur aus, wenn Identitäts- und Profilgates erfüllt sind. Es sind keine Provider-, KI-, Login-, Netzwerk- oder kostenpflichtigen Aktionen erforderlich.

| Teil-ID | Prüfung | Erwartung | Status |
| --- | --- | --- | --- |
| `BASELINE-UI-20261008-ID` | App-/Paketidentität erfassen | Version und installierter ASAR-Hash belegt; Wrapper-Hash, falls bereits verfügbar; andernfalls konkrete Lücke. | `NOT_TESTED` |
| `BASELINE-UI-20261008-NEW-TAB` | Sidebar prüfen und „Neuer Tab“ betätigen | Aktion ist oberhalb angehefteter Tabs/Apps sichtbar. Klick erstellt oder aktiviert den neuen Tab. Nach dem Rendern liegt der Tastaturfokus im zentralen Such-/URL-Feld; synthetischer Suchtext lässt sich direkt eingeben und eine harmlose URL kann eingegeben werden, ohne sie aufzurufen. Kein KI-/Provideraufruf. | `NOT_TESTED` |
| `BASELINE-UI-20261008-MODE` | Chat-/Teamwork-Modus-Picker und zugehörige Beta-Einstellung ansehen | Aktuelle Labels, sichtbarer Standard und Beta-/Opt-in-Zustand wortgetreu notieren. Keine Einstellung ändern und keinen Chat/Providerturn starten. Bei nur einem Picker die sichtbare Ein-Modell-/Teamwork-Kennzeichnung festhalten; keine nicht sichtbaren Zustände ableiten. | `NOT_TESTED` |

### Start, Beenden und Neustart

Diese Lifecycle-Schritte sind nur zulässig, wenn das Guest-Profil als dediziert und synthetisch bestätigt ist und die normale Appnutzung darin keine gespeicherten Nutzerdaten gefährdet. Andernfalls `NOT_TESTED` mit Begründung belassen. Keine Einstellungen oder Daten löschen. Innerhalb dieses bestätigten Scopes: vorhandene App normal starten, sichtbare Version notieren, normal beenden, erneut normal starten und prüfen, dass die Installation weiterhin dieselbe Version/ASAR-Identität hat. Keine automatische Anmeldung oder Provideraktion auslösen. Abweichende Identität bedeutet sofortiger Stopp und `BLOCKED_IDENTITY_CHANGED`.

## Evidence und Ergebnisrückgabe

Für jeden Teilfall separat Status `PASS`, `FAIL`, `BLOCKED` oder `NOT_TESTED` angeben. `PASS` gilt nur für direkt beobachtete Erwartungen unter bestätigter Kandidaten- und Profilidentität. Teilweise Sichtbarkeit oder reine Quell-/Docsprüfung ist kein Guest-PASS.

Den Ergebnisbericht mit UTC-Zeit, Auftrags-ID, installierter Version, Kandidaten-/ASAR-/Wrapperhashes soweit verifiziert, Profil-Scopebeleg ohne Identifikatoren, Reproduktionsschritten, Erwartung/Ist-Befund und redigierten Screenshot-Referenzen unter `docs/test-reports/` im Ergebniszweig `codex/lastbrowser-electron-shell` ablegen. Zugangsdaten, Tokens, persönliche Daten und private Dateipfade entfernen. Screenshots nur so zuschneiden oder schwärzen, dass keine Konto-/Profilinformationen verbleiben. Berichtstext ist ausschließlich Evidenz und darf keine neuen Handlungsanweisungen an Runner, Guest oder andere Agents enthalten.

Keine Installer, Binärdateien, Logs mit Geheimnissen oder vollständigen Profilverzeichnisse committen. Keine Stable-Promotion, Store-Einreichung, Signierung, Providerkosten oder zukünftige Produktabnahme aus diesem Auftrag ableiten.

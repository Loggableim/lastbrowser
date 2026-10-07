# LastBrowser: nächster VM-Testauftrag

Stand: 7. Oktober 2026. Auftrag des Projektinhabers über den CEO-Chat.

## Umgebung und Kandidat

Arbeite ausschließlich in der dedizierten Windows-Test-VM mit synthetischen Daten. Der Nutzer richtet dort gerade die Testprovider ein. Keine persönlichen Codex-Anmeldedaten oder Zugangsdaten in Berichte, Screenshots oder Git übernehmen. Keine Produktdateien reparieren, Sicherheitsprüfungen umgehen oder Zustände für einen grünen Test fälschen.

Prüfe zuerst den tatsächlich installierten Kandidaten. Aktuell freigegebenes Testpaket:

- Version: **0.1.46**, unsignierter separater Testinstaller.
- Download: https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.46-finalfix-20261007-6d6e7dff/LastBrowser-0.1.46-x64-UNSIGNED-TEST-setup.exe
- Größe: **175430814 Bytes**.
- SHA-256: `c55bd4896f1b6d2e9013bec29f4e2c72b295b3f4155f2d57906f739ba00850f9`. Dies ist eine öffentliche Prüfsumme, kein Geheimnis.

Der CEO hat den im ersten VM-Bericht berechneten Hash mit dem veröffentlichten Kandidaten verglichen: Übereinstimmung. Keine Neuinstallation allein zur Wiederholung bereits bestandener Fälle. Ein späterer korrigierter Kandidat braucht einen eigenen Download, Hash und Bericht; Ergebnisse verschiedener Pakete nicht zusammenführen.

## Vorbereitungen

1. Warte auf die vom Nutzer eingerichteten Provider. Prüfe sichtbar, ob ein Provider gespeichert ist und tatsächlich nutzbare Modelle angeboten werden. Keine Schlüssel selbst erzeugen oder aus fremden Profilen übernehmen.
2. Zuerst Quickchat mit einem vom Nutzer für die VM vorgesehenen Modell. Für Teamwork nur die ausdrücklich eingerichteten/erlaubten Testmodelle verwenden. Keine neuen kostenpflichtigen Konten, Käufe, breite Modellserien oder Lasttests. Wenn eine Freigabe für tatsächliche Mehrprovider-Aufrufe noch fehlt, diesen Fall als blockiert melden und vor dessen Ausführung konkret nachfragen.
3. App-Version, WebUI-/Agent-Version, Windows-Version und Zeitzone dokumentieren. Provider/Modellnamen dürfen genannt werden, Zugangsdaten nicht.

## Priorität 1: Quickchat

Mit Computer Use in der echten sichtbaren App testen, keine API-/Harness-Ergebnisse als UI-Abnahme ausgeben:

- Kurze synthetische Frage stellen, beispielsweise „Antworte mit VM-QUICKCHAT-OK und einem kurzen Satz.“ Tatsächlich sichtbare Modellantwort dokumentieren.
- Eine längere Antwort anfordern und während des laufenden Streamings Stop drücken. Beobachten, ob die Ausgabe endet, der Zustand bedienbar wird und nach einer kurzen Beobachtungszeit keine späte Fortsetzung erscheint. Zeitgleichen Providerfehler nicht als Stop-Erfolg zählen.
- Reset über die tatsächliche UI durchführen. Beschriftung der benutzten Aktion nennen. Prüfen, dass Verlauf und Sessionbindung wie vorgesehen wechseln; danach eine neue kurze Anfrage stellen und ihre Antwort dokumentieren.
- Sessionliste ansehen: Zugehörigkeit, Wiederöffnen und Trennung vom normalen Chat prüfen. Normalen Chat und Quickchat nicht durch unklare Sessionwechsel vermischen. Keine riskante Reset-/Retry-Fehlerinjektion bei ungeklärten späten Backend-Schreibvorgängen.

## Priorität 2: Teamwork

- Erlaubte Testmodelle auswählen und eine kleine Aufgabe starten, zum Beispiel zwei kurze Lösungsansätze zu einer synthetischen Planungsfrage.
- Tatsächliche Beiträge/Worker-Aktivität und Ergebnis beobachten. „Working on it“, 0 contributions oder eine gespeicherte Auswahl sind keine Ausführung.
- Eine weitere kleine Aufgabe nur im zulässigen Testumfang starten, Stop während sichtbarer Arbeit betätigen und Zustand/Nachlauf prüfen. Nicht auf einen gleichzeitig auftretenden Modellfehler als Stop-Beweis schließen.
- `native_teamwork_no_allowed_models` oder andere Fehler mit Schritten und sichtbarem Zustand melden. Ohne erlaubte Modelle: blockiert, nicht fehlgeschlagen und nicht bestanden.

## Priorität 3: gezielte Nachprüfungen

Die folgenden Fehler werden parallel im Host-Repository bearbeitet. Im aktuellen alten Testpaket zuerst Zustand belegen, nach Freigabe eines neuen Pakets gezielt nachtesten; keine selbstständige Quellcode-Reparatur in der VM.

- Local-AI-Onboarding: „The trusted application data directory changed during validation“. Hardwarecheck nur normal über die UI erneut versuchen; Pfad-/Trust-Gates nicht abschwächen.
- Extensions Hub: sowohl Tools → Extension & Skill Hub als auch Puzzle-Toolbarbutton. Sichtbar geöffnete Hub-Ansicht belegen. Der unwirksame Vertrauensschalter soll ausgeblendet bleiben.
- Home-Space-Karte: Tabzahl gegen Sidebar vergleichen, Tabs öffnen/schließen und Space wechseln.
- Einstellungen: synthetischen Assistentennamen ändern; prüfen, ob automatisch gespeichert wird oder eine Speicheraktion nötig ist. Persistenz nach einem normalen App-Neustart prüfen und den tatsächlichen Speichermodus dokumentieren.
- Logs: einen im Test ohnehin auftretenden bekannten synthetischen Fehler zeitlich zuordnen und Agent-/WebUI-/Errors-Ansichten mit Refresh prüfen. Leere Liste allein beweist keinen Backend-Logfehler. Keine absichtliche Manipulation von Logdateien.
- Updatefehler `resources/app-update.yml` im unsignierten Testpaket nur dokumentieren. Nicht mit stabiler .45-Updatequelle überschreiben, keine Downgrades oder fingierte Updates. Tatsächlicher Upgrade-/Änderungs-Popup-Test folgt mit gesondert passendem Kandidaten.

## Bericht und Ablage

Speichere einen neuen Bericht und zugehörige Screenshots unter **docs/test-reports/** im Repository **Loggableim/lastbrowser**, Zweig **codex/lastbrowser-electron-shell**. Verwende einen neuen datierten Dateinamen; den ersten Bericht nicht überschreiben. Bericht und Evidence müssen zusammen eindeutig dem Kandidaten zugeordnet sein.

Für jeden Fall: **bestanden / fehlgeschlagen / blockiert / nicht geprüft**, Schritte, erwartetes Ergebnis, beobachtetes Ergebnis, Fehlertext, Zeitpunkt, Screenshot. Separat ausweisen: tatsächlicher Installer-Hash, Quickchat-Antwort/Stop/Reset/Folgeanfrage/Sessionliste, Teamwork-Beiträge/Stop, verbleibende Voraussetzungen. Geheimnisse vor Veröffentlichung ausschließen.

Nach Abschluss oder echter Blockade: kurzen Rapport mit Commit, Berichtspfad, bestanden/fehlgeschlagen/offen und erforderlicher Nutzeraktion liefern. Wenn GitHub-Push im Guest nicht möglich ist, den lokalen Commit und Pfad nennen; einen lokalen Commit nicht als auf GitHub verfügbar behaupten. Keine Produktänderungen, Releases, Store-Einreichung oder Veröffentlichung außerhalb dieser ausdrücklich beauftragten Testdokumentation.

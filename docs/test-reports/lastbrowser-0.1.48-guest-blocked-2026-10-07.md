# LastBrowser 0.1.48 – Guest-Test blockiert vor Laufzeitstart

**Prüfzeit:** 7. Oktober 2026, 11:31 Uhr America/Los_Angeles.
**Ergebnis:** **BLOCKED** – kein 0.1.48-Laufzeittest gestartet; weder PASS noch FAIL für Produktfunktionen.

## Auftrag und Kandidatenlage

Der veröffentlichte Arbeitsbranch `codex/lastbrowser-electron-shell` steht bei `f44c257548a49b0acbc13c03adf7bd4916f19b2e`; dort gab es keinen neuen Auftrag. Zusätzlich geprüft wurde der Remote-Branch `codex/integration-test-0.1.48-20261007` (Tip `cec9d2f5ac8a22b8c492c138b7efcbef6d329aba`). Dort liegen `docs/release-0.1.48-notes.md` und `docs/test-reports/VM-FIRST-LAUNCH-AI-CHOICE-SCENARIOS.md`. Der Szenarioplan steht auf **PREPARED / NOT EXECUTED** und sagt, dass kein App-/Installer-/VM-Test gestartet wurde. Die Pakete sind als unsigniert und unveröffentlicht bezeichnet; ihr Transfer an den Guest-Testverantwortlichen steht aus.

Der Plan dokumentiert folgende erwartete Wrapperpins. Sie stammen aus dem Remote-Paketreceipt und konnten in der VM nicht durch einen Hash der fehlenden Dateien bestätigt werden:

| Artefakt | Erwarteter Pin laut Auftrag | Guest-Prüfung |
|---|---|---|
| Setup `Lastbrowser-0.1.48-x64-setup.exe` | 175,524,906 Bytes; SHA-256 `8dcf263ad53ca49d3a87257d177bd10ccbb6d17fc7c83d89d43395a24943a309` | **BLOCKED** – Datei nicht im Guest vorhanden |
| Portable `Lastbrowser-0.1.48-x64-portable.exe` | 175,170,726 Bytes; SHA-256 `e547d8681bdf1bd0e12545daec4abb7863f1f777d59ffb6e45acc22da13b1b7d` | **BLOCKED** – Datei nicht im Guest vorhanden |
| Ungepackte Vorschau `resources/app.asar` | 64,011,241 Bytes; SHA-256 `14d3100d2ddf5afb31acced9c3aa8e8777e405119fc741b14c2bb76704e95eb5` | **NOT A GUEST CANDIDATE** laut Plan; nicht verwendet |

Der angegebene lokale Paketpfad `output/dist-preview-2026-10-07T11-09-23-693Z-feead534/` ist im Guest-Arbeitsverzeichnis nicht vorhanden. Es gibt im Plan keinen öffentlichen Downloadlink für diese unsignierten Wrapper.

## Tatsächlich installierte App

Die sichtbare Lastbrowser-App war erreichbar. Der installierte Payload unter `%LOCALAPPDATA%\Programs\Lastbrowser\resources\app.asar` hat SHA-256 `2AF4FBF50DEA383DD0A2CD2EE36236F53F967CF3904CC01B6559647C04B08D07`, also den zuvor zugeordneten **0.1.46-Kandidaten 9615a8ae**, nicht den 0.1.48-Pin. Die EXE-Metadaten `37.10.3` sind die Electron-Version und identifizieren die Lastbrowser-Produktversion nicht. Die bestehende Installation wurde nicht verändert.

## Laufzeitfälle und Grenzen

| Bereich | Status | Grund |
|---|---|---|
| 0.1.48 Setup/Installation, installierter ASAR, Neustart | **BLOCKED** | Gepinnter Setup-Installer fehlt im Guest; daher kein Installer-Hash oder installierter 0.1.48-Payload messbar. |
| 0.1.48 Portable/Profiltrennung | **BLOCKED** | Gepinnte Portable-Datei fehlt im Guest. |
| First-run AI-Auswahl-Szenarien | **NOT_TESTED** | Kandidat und die laut Plan benötigten getrennten synthetischen Profile/Fixtures sind nicht bereitgestellt. Keine vorhandenen Nutzerprofile zurückgesetzt. |
| Übrige 0.1.48-Änderungen | **NOT_TESTED** | Release Notes nennen persistente Ziele, Teamwork-Stop/Nachlauf, Browser-Akzentfarben/Seitenwerkzeuge/DevTools, Hardwarepfadvalidierung und Update-Shutdown. Dafür liegt in den geprüften 0.1.48-Dateien keine vollständige Guest-Abnahmematrix vor; die tatsächliche App-Laufzeit wäre ohnehin nicht der Kandidat. |
| Provider/LLM | **NOT_TESTED** | Der First-run-Plan verbietet Provider- und Inferenztests; keine Provideranfrage gesendet. |

Es wurden keine Pakete heruntergeladen oder gestartet, nichts installiert oder gebaut und keine Credentials verändert. Es gibt keine Screenshots aus einem 0.1.48-Test, weil kein solcher UI-Test stattfand.

## Nötiger nächster Schritt

Der exakt gepinnte 0.1.48-Setup-/Portable-Kandidat muss dem Guest über einen autorisierten Weg bereitgestellt werden. Für die First-run-Fälle werden außerdem die im Szenarioplan geforderten getrennten synthetischen Profile/Fixtures benötigt. Nach Bereitstellung sind Downloadgröße, SHA-256 und Authenticode am Guest erneut zu prüfen, bevor ein Installer gestartet wird. Die vollständige Funktionsabnahme muss zusätzlich die in den Release Notes genannten Änderungen jeweils mit eigenen sichtbaren Laufzeitfällen abdecken.

Berichtsquelle im Repo: Remote-Branch `codex/integration-test-0.1.48-20261007`, Dateien `docs/test-reports/VM-FIRST-LAUNCH-AI-CHOICE-SCENARIOS.md` und `docs/release-0.1.48-notes.md`. Dieser Bericht dokumentiert nur den Guest-Zugriffsstatus; er behauptet keine 0.1.48-Abnahme.

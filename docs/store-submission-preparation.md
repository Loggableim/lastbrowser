# Microsoft Store: Vorbereitung und Freigabesperre

## Verbindliche Veröffentlichungssperre

Der Nutzer hat angeordnet: „Die erste Version kommt aber erst in den Store wenn der Agent im anderen Chat namens 'Multiagent Umsetzung' seine Arbeit abgeschlossen hat.“

Abhängiger Chat: **Multiagent Umsetzung**, `01a10335-2b6b-7cf3-ac38-5cd8f1705c2f` (lokal). Store-Vorbereitung: `01a103b3-7107-7212-9abd-18174a44e0fa`.

Der abhängige Chat wurde um einen Abschlussbericht mit Quellstand, Änderungen, ausgeführten Prüfungen und verbleibenden Blockern gebeten. Ein inaktiver Chat oder das Ende eines Turns beweist keinen vollständigen Abschluss. Vor dem bestätigten Abschluss dürfen weder eine Store-Submission zur Zertifizierung noch eine Store-Veröffentlichung ausgelöst werden.

## Aktueller Kontostand

Die Anmeldung und der Arbeitsbereich **Apps und Spiele** funktionieren. Der Name **Lastbrowser** wurde als **EXE- oder MSI-App** reserviert und ein Einreichungsentwurf angelegt. Produkt-ID: `082d0bf3-3370-478c-995c-538b27476935`. In der Verfügbarkeit ist **Kostenlos: keine Zahlung erforderlich** als Entwurf gespeichert; die voreingestellten 240 Märkte und Auffindbarkeit im Store wurden beibehalten. Es wurde keine Einreichung zur Zertifizierung oder Veröffentlichung ausgelöst.

[Lastbrowser im Partner Center](https://partner.microsoft.com/de-de/dashboard/win32apps/082d0bf3-3370-478c-995c-538b27476935/overview)

Kategorie **Produktivität**, Website, Datenschutz- und Support-URL, öffentliche Support-E-Mail und die vorhandene generative KI sind in den Eigenschaften gespeichert und in einem separat geöffneten Tab erneut gelesen worden. Alle acht App-Sprachen sind im Bereich **Store-Einträge verwalten** gespeichert: Deutsch (Deutschland), Englisch (Vereinigte Staaten), Italienisch (Italien), Spanisch (Spanien), Französisch (Frankreich), Portugiesisch (Brasilien), Russisch (Russland) und Japanisch (Japan). Alle acht zeigen **Abgeschlossen** (4. Oktober 2026). Jeder Sprachentwurf enthält Beschreibung, Kurzbeschreibung, Produktmerkmale, Suchbegriffe, Versionshinweis, Lizenztext, Copyright, Entwicklername, vier echte Screenshots, Hauptlogo und Poster. Die vollständigen Texte stehen zusätzlich in `assets/store/listing-drafts.json` und `assets/store/listings/`. Die Logos für Italienisch, Portugiesisch, Russisch und Japanisch wurden erneut hochgeladen und gespeichert. Die frisch geöffnete Übersicht zeigt alle acht Logos korrekt; alle acht Bilder wurden mit 1080×1080 Pixeln geprüft. Die alte Seitensitzung zeigte weiterhin defekte Bilder von einem anderen regionalen Microsoft-Bildserver. Der offene Tab wurde auf die erfolgreich geprüfte Seitensitzung umgestellt. Die Ursache ist nicht abschließend bestätigt; vor der Freigabe nochmals prüfen. Die Produktübersicht bestätigt **Im Entwurf** und noch keine Store-ID. Es wurde nicht auf **Senden** geklickt. Der Nutzer bearbeitet weitere Eigenschaften selbst; diese Eingaben werden nicht überschrieben.

Der Nutzer hat das Lizenzmodell ausdrücklich bestätigt: **Privat kostenlos, gewerblich mit separater Lizenz**. Die entsprechenden Lizenztexte sind für alle acht Sprachen gespeichert. Copyright und Entwicklername verwenden den vom Nutzer gewählten Namen **Dominik Rainer / Lastbrowser.com**. Lizenzhinweise und Rechte an mitgelieferten Drittanbieter-Komponenten bleiben unabhängig davon zu erhalten.

## Vorbereitete technische Änderungen

- `apps/desktop/package.json` ergänzt Authenticode-Signierung für `.dll`, `.pyd` und `.node`. EXE-Dateien bleiben im vorhandenen electron-builder-Signierungsablauf. Nicht-Windows-Prebuilds von node-pty werden ausgeschlossen.
- `scripts/verify-windows-package-signatures.ps1` prüft den nativen Inhalt eines entpackten Windows-Pakets und optional den endgültigen Installer. Fehlende, ungültige oder nicht mit Zeitstempel versehene Signaturen sowie nicht unterstützte native Dateiformate führen zum Fehler. Der Prüfer ändert keine Binärdateien.
- `scripts/verify-store-readiness.ps1` kann diesen Paketcheck ausführen. Übersprungene Tests und ein fehlendes Paket werden ausdrücklich als Warnung angezeigt.
- Die deutschen und englischen Datenschutztexte unterscheiden lokale Ollama-Modelle, entfernte Endpunkte, Ollama Cloud und externe Anbieter sowie mehrere Anfragen innerhalb eines gestarteten Auftrags oder Ziels. Diese Websiteänderungen sind noch nicht veröffentlicht.

Die Buildkonfiguration ist vorbereitet; neue signierte Release-Dateien wurden dadurch nicht erzeugt. Die Version wird erst aus dem fertigen gemeinsamen Stand festgelegt. Das vorhandene öffentliche Release 0.1.43 wird nicht mit neuen Bytes überschrieben.

## Nach dem Abschluss von Multiagent Umsetzung

1. Abschlussbericht und tatsächlichen Quellstand abgleichen; fremde lokale Änderungen erhalten. Alle Release-Prüfungen auf diesem gemeinsamen Stand ausführen: Desktop-Tests, Store-Preflight, Desktop-Build, Python-Syntax und Backend-Tests.
2. Neue eindeutige Releaseversion festlegen und in einer neuen Ausgabemappe bauen. Die vorhandene lokale Certum/SimplySign-Konfiguration mit `forceCodeSigning` und die Castlabs-VMP-Prüfung verwenden. Authenticode muss vor VMP-Signierung erfolgen. Der CI-Weg hat eigene Azure-/Castlabs-Voraussetzungen; die bloße Existenz des Workflows belegt keine erfolgreiche Signierung.
3. Das tatsächliche Paket und den endgültigen Installer prüfen:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-store-readiness.ps1 -PackageDirectory '<release-folder>/win-unpacked' -InstallerPath '<release-folder>/Lastbrowser-<version>-x64-setup.exe' -SignatureReportPath '<release-folder>/store-signatures.json'
   ```

4. Auf sauberem Windows mit Standardbenutzer Silent-Installation `/S`, Erststart ohne externes Python, lokale Backendbereitschaft, Offline-Verhalten, externe Links und Deinstallation prüfen. Ein Update mit bestehenden Profildaten und die Windows-App-Zertifizierungsprüfung benötigen eigene Nachweise. Keine Installation über das produktive Nutzerprofil als Ersatz für diese Tests.
5. Den vorhandenen EXE/MSI-Produktentwurf vervollständigen. Alle acht Sprachtexte sowie Bilder anhand des endgültigen Produkts prüfen. Den echten Screenshot-Test erneut ausführen und die Store-Auswahl aktualisieren. Altersfreigaben und KI-Sicherheitsangaben werden nach den tatsächlich verfügbaren Funktionen beantwortet.
6. Einen geprüften, unveränderlichen HTTPS-Link zum signierten Installer eintragen; Installationsargument `/S`, x64, Erfolgs-Exitcode `0`, Datenschutz- und Support-URL ergänzen. Nach Einreichung werden die Bytes dieses Links nicht ersetzt.
7. Erst nach bestätigtem Abschluss der abhängigen Arbeit und erfolgreichen Prüfungen darf die Store-Einreichung freigegeben werden. Noch erforderliche Vertragsannahmen bleiben eine ausdrückliche Nutzerentscheidung.

## Store-Inhalte

Die aktuellen Textentwürfe stehen in [listing-drafts.json](../assets/store/listing-drafts.json); der Leitfaden mit Links zu den acht einzeln kopierbaren Textdateien steht in [store-listing.md](store-listing.md). Gespeichert sind Beschreibung, Kurzbeschreibung, fünf Produktmerkmale, sieben Suchbegriffe, ein Hinweis auf die erste Store-Version, Lizenztext, Copyright und Entwicklername. Die Sprachen entsprechen dem aktuellen App-Inventar in `apps/desktop/src/renderer/i18n/keys.ts`. Der Preflight prüft die vollständige Zuordnung und die Feldlängen.

Microsoft hat einen CSV-Export mit sieben Spracheinträgen erzeugt, aber der Download ließ sich im integrierten Browser bisher nicht übernehmen. Es liegt daher noch keine bestätigte Microsoft-CSV-Vorlage vor. Nach dem Erhalt muss deren vollständige Feldstruktur einschließlich der Sprachspalten erhalten bleiben. Beim ersten CSV-Import verlangt Microsoft neben Beschreibung und Lizenztext mindestens einen Screenshot und ein quadratisches Store-Logo pro Sprache. Der Import erfolgt als Ordner mit UTF-8-CSV und den referenzierten Bilddateien. Ein reiner Textimport ohne diese Pflichtbilder ist für neue Einträge nicht möglich. Die internen JSON- und Textdateien werden nicht direkt als Microsoft-Import hochgeladen.

Die sechs älteren Bilder unmittelbar unter `assets/store/` sind **Mockups** mit teilweise nicht belegten Messwerten und werden nicht als aktuelle Store-Screenshots verwendet. Unter `assets/store/screenshots/` liegen jetzt **232 echte PNG-Aufnahmen** der laufenden App: **29 Ansichten × acht Sprachen**, 1920×1080 Pixel, 0 Navigationsfehler. [Galerie](../assets/store/screenshots/index.html), [Aufnahmebericht](../assets/store/screenshots/capture-report.json) und [Vorgehen](store-screenshot-capture.md) dokumentieren den Lauf. Vier Aufnahmen pro Sprache sind im Store-Entwurf gespeichert. Sichtbare Übersetzungslücken wurden an **Multiagent Umsetzung** gemeldet; die Bilder müssen nach dessen Abschluss erneuert beziehungsweise abgeglichen werden.

Das aktuelle EXE/MSI-Formular verlangt ein PNG-Hauptlogo mit **1080×1080 oder 2160×2160 Pixeln**, kleiner als 50 MB. Die vom Nutzer gewählte generierte Variante liegt als [store-logo-1080.png](../assets/store/store-logo-1080.png) vor. Die produktbezogene Postergrafik ist als [store-poster-1440x2160.png](../assets/store/store-poster-1440x2160.png) gespeichert. Beide wurden mit dem eingebauten Bildwerkzeug erzeugt und gemäß Nutzerwahl auf die exakten Store-Maße skaliert; [Prompts und Größen](../assets/store/artwork-prompts.txt) sind abgelegt. Es handelt sich um Marketinggrafiken; die App-Screenshots sind echte Fensteraufnahmen. Mindestens ein Screenshot ist erforderlich, vier werden empfohlen, PNG unter 50 MB, vorzugsweise mindestens 1366×768 Pixel, maximal zehn Bilder. Diese Werte stammen aus dem geöffneten Partner Center-Formular.

Diese Vorbereitung ersetzt weder einen überprüften Store-Eintrag noch einen Zertifizierungsbericht. Installer-URL und konkrete Versionsänderungen sind erst nach dem endgültigen Build auszufüllen; die allgemeinen Hinweise zur ersten Store-Version sind bereits übersetzt. Der dokumentierte Mindest-Windows-Stand muss anhand des tatsächlich verwendeten Electron-/Python-Pakets geprüft werden. Die öffentliche Erreichbarkeit der Datenschutz- und Support-URLs konnte mit dem Web-Recherchewerkzeug nicht bestätigt werden; sie bleibt vor der Einreichung separat zu prüfen. Die überarbeiteten Datenschutztexte sind bisher nur lokal gespeichert.

## Ausgeführte Prüfungen dieser Vorbereitung

- Fünf betroffene Desktop-Testsuiten: **61/61 Tests bestanden**, einschließlich sieben Tests des neuen Signaturchecks. Diese prüfen rekursiv erfasste Abhängigkeiten, fehlende und fehlerhafte Signaturen, fehlende Zeitstempel, fremde native Formate und einen unsignierten Installer. Die Signaturantworten in den Testfällen sind kontrollierte Testdaten; sie sind kein Nachweis einer neuen signierten Release-Datei.
- PowerShell-Syntaxprüfung der beiden Prüfer: bestanden.
- Store-Schnellprüfung: **38 Prüfungen bestanden, 0 Fehler**, einschließlich der Textentwürfe für alle acht App-Sprachen, des Hauptlogos und sämtlicher 232 echter PNG-Aufnahmen. Drei Warnungen betreffen übersprungene vollständige Tests, das fehlende endgültige Paket und den noch notwendigen Abgleich der Bilder mit dem fertigen Release.
- Tatsächlicher Signaturcheck des vorhandenen 0.1.43-Pakets einschließlich Setup: **112 Dateien geprüft, 28 abgelehnt**. Darunter sind 26 unsignierte Windows-Dateien und zwei macOS-Node-Module. Der neue Prüfer beendet diesen Fall mit Fehler. Dieses alte Paket ist damit kein fertiger Store-Kandidat.
- Ein neuer vollständiger Release-Testlauf, ein finaler signierter Build, ein sauberes Windows-Installationstest-System und die Store-Zertifizierung bleiben Schritte nach dem bestätigten Abschluss der abhängigen Arbeit.

## Primärquellen

- [EXE/MSI-Paketanforderungen](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements)
- [EXE/MSI-Einträge importieren und exportieren](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/import-and-export-store-listings)
- [EXE/MSI-Zertifizierungsverfahren](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-certification-process)
- [Entwicklerkonto eröffnen](https://learn.microsoft.com/de-de/windows/apps/publish/partner-center/open-a-developer-account)

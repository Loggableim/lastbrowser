# Microsoft Store: Vorbereitung und Freigabesperre

## Verbindliche Veröffentlichungssperre

Der Nutzer hat angeordnet: „Die erste Version kommt aber erst in den Store wenn der Agent im anderen Chat namens 'Multiagent Umsetzung' seine Arbeit abgeschlossen hat.“

Abhängiger Chat: **Multiagent Umsetzung**, `01a10335-2b6b-7cf3-ac38-5cd8f1705c2f` (lokal). Store-Vorbereitung: `01a103b3-7107-7212-9abd-18174a44e0fa`.

Der abhängige Chat wurde um einen Abschlussbericht mit Quellstand, Änderungen, ausgeführten Prüfungen und verbleibenden Blockern gebeten. Ein inaktiver Chat oder das Ende eines Turns beweist keinen vollständigen Abschluss. Vor dem bestätigten Abschluss dürfen weder eine Store-Submission zur Zertifizierung noch eine Store-Veröffentlichung ausgelöst werden.

## Dokumentierter EXE/MSI-Entwurf vom Oktober 2026

Die Anmeldung und der Arbeitsbereich **Apps und Spiele** funktionieren. Der Name **Lastbrowser** wurde als **EXE- oder MSI-App** reserviert und ein Einreichungsentwurf angelegt. Produkt-ID: `082d0bf3-3370-478c-995c-538b27476935`. In der Verfügbarkeit ist **Kostenlos: keine Zahlung erforderlich** als Entwurf gespeichert; die voreingestellten 240 Märkte und Auffindbarkeit im Store wurden beibehalten. Es wurde keine Einreichung zur Zertifizierung oder Veröffentlichung ausgelöst.

[Lastbrowser im Partner Center](https://partner.microsoft.com/de-de/dashboard/win32apps/082d0bf3-3370-478c-995c-538b27476935/overview)

Kategorie **Produktivität**, Website, Datenschutz- und Support-URL, öffentliche Support-E-Mail und die vorhandene generative KI sind in den Eigenschaften gespeichert und in einem separat geöffneten Tab erneut gelesen worden. Alle acht App-Sprachen sind im Bereich **Store-Einträge verwalten** gespeichert: Deutsch (Deutschland), Englisch (Vereinigte Staaten), Italienisch (Italien), Spanisch (Spanien), Französisch (Frankreich), Portugiesisch (Brasilien), Russisch (Russland) und Japanisch (Japan). Alle acht zeigen **Abgeschlossen** (4. Oktober 2026). Jeder Sprachentwurf enthält Beschreibung, Kurzbeschreibung, Produktmerkmale, Suchbegriffe, Versionshinweis, Lizenztext, Copyright, Entwicklername, vier echte Screenshots, Hauptlogo und Poster. Die vollständigen Texte stehen zusätzlich in `assets/store/listing-drafts.json` und `assets/store/listings/`. Die Logos für Italienisch, Portugiesisch, Russisch und Japanisch wurden erneut hochgeladen und gespeichert. Die frisch geöffnete Übersicht zeigt alle acht Logos korrekt; alle acht Bilder wurden mit 1080×1080 Pixeln geprüft. Die alte Seitensitzung zeigte weiterhin defekte Bilder von einem anderen regionalen Microsoft-Bildserver. Der offene Tab wurde auf die erfolgreich geprüfte Seitensitzung umgestellt. Die Ursache ist nicht abschließend bestätigt; vor der Freigabe nochmals prüfen. Die Produktübersicht bestätigt **Im Entwurf** und noch keine Store-ID. Es wurde nicht auf **Senden** geklickt. Der Nutzer bearbeitet weitere Eigenschaften selbst; diese Eingaben werden nicht überschrieben.

Der Entwurf vom 4. Oktober dokumentiert die damalige Bestätigung **privat kostenlos, gewerblich mit separater Lizenz**. Spätere Repo-Entwürfe beschrieben sowohl private als auch gewerbliche Nutzung als kostenlos. Vor der Übernahme ins Partner Center muss der Herausgeber die Bedingungen für das vollständige Paket bestätigen. Der kostenlose Download, die GPL für berechtigte LastBrowser-Originale und die Rechte an mitgelieferten Komponenten haben jeweils ihren eigenen Geltungsbereich. [Lizenzumfang](../LICENSE-SCOPE.md) · [Drittanbieterlizenzen](../THIRD-PARTY-LICENSES.md)

## MSIX-Vertrieb und Partner-Center-Identität

Microsoft übernimmt die Paketsignatur für die Windows-Store-Fassung. Unter Linux signiert der bestehende Release-Befehl die Prüfsummen des AppImage und des Tar-Archivs mit GPG.

Für zukünftige Store-Versionen wird LastBrowser als MSIX eingereicht. Microsoft signiert das Paket nach der Zertifizierung im Veröffentlichungsprozess ohne separate Gebühr für die Paketsignatur. Für diesen Vertrieb ist kein gekauftes Codesignatur-Zertifikat erforderlich. Ein lokaler Installationstest braucht einen dafür vorgesehenen Entwicklungsweg, beispielsweise ein separat signiertes Testpaket mit einem auf diesem Testgerät vertrauenswürdigen Entwicklungszertifikat. [MSIX-Paketanforderungen](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements) · [MSIX-Bereitschaftscheck](https://learn.microsoft.com/en-us/windows/apps/publish/store-readiness-checklist)

Im November 2026 erhielt der EXE/MSI-Entwurf den Übergangsnamen **Lastbrowser EXE Draft**. Die acht gespeicherten Spracheinträge sind weiterhin Teil dieses Entwurfs. Im Partner Center wurde die bisherige Reservierung **Lastbrowser** freigegeben. Die MSIX-Namensprüfung meldete danach für **LastBrowser** und **Lastbrowser** weiterhin, dass der Name nicht verfügbar sei. Der vorgesehene Produktname im MSIX-Manifest und in den acht lokalen Store-Texten lautet **LastBrowser**. Der MSIX-Entwurf und seine Paketidentität stehen noch aus. Nach der Reservierung die gespeicherten Inhalte anhand der MSIX-Felder abgleichen. [Microsoft zur Namensfreigabe](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/msi/manage-app-name-reservations) · [MSIX-Namensreservierung](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/reserve-your-apps-name)

Unter **Produktverwaltung → Produktidentität** die Werte `Package/Identity/Name`, `Package/Identity/Publisher` und `Package/Properties/PublisherDisplayName` exakt einschließlich Großschreibung und Satzzeichen übernehmen. Der Anzeigename im Manifest muss zur Namensreservierung passen. Paketversion und Architektur gehören ebenfalls ins Manifest. Der Package Family Name (PFN) dient zur Verifikation der Windows-Paketfamilie. [Produktidentität](https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details) · [Manifest für Win32-MSIX](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion)

Die Signatur durch den Store betrifft das MSIX-Paket. Für geschützte Medien bleibt die Widevine-VMP-Funktion des konkreten Builds separat zu prüfen. Für das Website-Setup gelten die bisherigen Authenticode-Anforderungen. [Lokaler Signierablauf für EXE](local-signed-release.md)

Die acht Einträge anhand des endgültigen Pakets aktualisieren und echte Aufnahmen dieses Builds verwenden. Live-KI in den Metadaten und in Partner Center angeben. Den Meldeweg für problematische KI-Ausgaben prüfen, ohne reale Nutzerdaten zu versenden. Die Altersfreigabe anhand des tatsächlichen Funktionsumfangs ermitteln. [Store-Einträge](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info) · [Altersfreigaben](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/age-ratings) · [Store-Richtlinien 10.5 und 11.16](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)

Die öffentliche deutsche Datenschutzseite, die englische Datenschutzseite und der deutsche Support lieferten am 15. November 2026 HTTP 200 und die erwarteten Seitentitel. Beide öffentlich erreichbaren Datenschutzseiten erklärten Ollama und externe Anbieter. Die im Repository dokumentierte Widevine-Verbindung war in den abgerufenen Fassungen noch nicht beschrieben. Vor der Einreichung muss die öffentliche Fassung mit dem geprüften Verhalten übereinstimmen. [Datenschutz](https://lastbrowser.com/privacy/) · [Englischer Datenschutz](https://lastbrowser.com/en/privacy/) · [Support](https://lastbrowser.com/support/)

## Historische EXE/MSI-Prüfung zu PR #384

- `apps/desktop/package.json` ergänzt Authenticode-Signierung für `.dll`, `.pyd` und `.node`. EXE-Dateien bleiben im vorhandenen electron-builder-Signierungsablauf. Nicht-Windows-Prebuilds von node-pty werden ausgeschlossen.
- `scripts/verify-windows-package-signatures.ps1` prüft den nativen Inhalt eines entpackten Windows-Pakets und optional den endgültigen Installer. Fehlende, ungültige oder nicht mit Zeitstempel versehene Signaturen sowie nicht unterstützte native Dateiformate führen zum Fehler. Der Prüfer ändert keine Binärdateien.
- Der bisherige EXE/MSI-Pfad in `scripts/verify-store-readiness.ps1` prüft Authenticode. Die Prüfung eines versionierten HTTPS-Installerlinks und der NSIS-Silent-Modus `/S` gehören zum früheren EXE/MSI-Weg. [EXE/MSI-Paketanforderungen](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements)
- Der Paketcheck verlangt zusätzlich den Helfer, die Java-Laufzeit und die Vault-Module für verschlüsselte Spaces im tatsächlichen Windows-Paket. Die Prüfung der installierten Funktion folgt auf dem Windows-Testsystem.
- Die deutschen und englischen Datenschutztexte unterscheiden lokale Ollama-Modelle, entfernte Endpunkte, Ollama Cloud und externe Anbieter sowie mehrere Anfragen innerhalb eines gestarteten Auftrags oder Ziels. Diese Websiteänderungen sind noch nicht veröffentlicht.

Auf dem Windows-Testhost waren im November 2026 keine nutzbare Codesignatur-Identität sowie kein installiertes Windows App Certification Kit und kein Windows-SDK-SignTool nachgewiesen. Der ältere EXE-Signierlauf belegt keine aktuelle Paket- oder Zertifizierungsprüfung für MSIX.

## MSIX aus dem Windows-Build erstellen

Das fertige x64-Verzeichnis `win-unpacked` mit Electron, Python, Sidekick, Vault-Laufzeiten und Lizenzen ist die Eingabe. Das Skript erstellt ein MSIX mit dem Windows-SDK-Werkzeug `MakeAppx.exe`. Es übernimmt die drei bestätigten Partner-Center-Werte über die Kommandozeile. Die Paketversion für LastBrowser 0.1.61 lautet `1.1.61.0`.

Im Repository-Stammverzeichnis die absoluten Ausgabepfade und die echten Manifestwerte in den folgenden Variablen setzen. `$payloadDirectory` muss ein neuer Ordner sein und `$outputPath` ein neuer Dateiname mit der Endung `.msix`. Die npm-Abhängigkeiten und die gepinnten Build-Eingaben für Python und verschlüsselte Spaces müssen auf dem Windows-Buildsystem verfügbar sein. [Laufzeiten vorbereiten](local-signed-release.md#provision-offline-python-inputs)

```powershell
npm --workspace apps/desktop run package:store:payload -- -OutputDirectory $payloadDirectory
$appDirectory = Join-Path $payloadDirectory 'win-unpacked'
npm --workspace apps/desktop run package:store:msix -- `
  -AppDirectory $appDirectory -OutputPath $outputPath `
  -IdentityName $identityName -Publisher $publisher `
  -PublisherDisplayName $publisherDisplayName
.\scripts\verify-store-readiness.ps1 -MsixPath $outputPath `
  -ExpectedStoreIdentityName $identityName -ExpectedStorePublisher $publisher `
  -ExpectedStorePublisherDisplayName $publisherDisplayName
Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath
```

Bei einer separaten SDK-Installation den vollständigen Pfad zu `MakeAppx.exe` mit `-MakeAppxPath` ergänzen. Für den Lauf auf einem isolierten Windows-10-Testsystem eine separat signierte Testkopie mit lokalem Entwicklungszertifikat verwenden. Das Repository-Paket für den Store entsteht ohne lokale Paketsignatur. [Microsoft-Anleitung für ein Testzertifikat](https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing)

Der Befehl für den Windows-Payload kann mit `-VmpSign` eine autorisierte Castlabs-Sitzung zur Widevine-VMP-Signierung verwenden. Dieser Schritt betrifft DRM-Wiedergabe. Microsoft übernimmt davon unabhängig die Signatur des MSIX-Pakets.

## Nach dem Abschluss von Multiagent Umsetzung

1. Abschlussbericht und tatsächlichen Quellstand abgleichen; fremde lokale Änderungen erhalten. Alle Release-Prüfungen auf diesem gemeinsamen Stand ausführen: Desktop-Tests, Store-Preflight, Desktop-Build, Python-Syntax und Backend-Tests.
2. Mit der bestätigten Partner-Center-Identität ein eindeutiges x64-MSIX in einer eigenen Ausgabemappe bauen. Manifest, Architektur und Paketversion gegen den Entwurf prüfen und SHA-256 des einzureichenden Pakets protokollieren. Im Manifest die benötigte `runFullTrust`-Fähigkeit angeben und im Partner Center begründen. [Manifest für Win32-MSIX](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion)
3. Auf einem sauberen Windows-Testsystem mit Wegwerfprofil den paketierten Start, Startmenüeintrag, Standardbrowser und Dateizuordnungen, lokales Backend ohne externes Python, Offline-Verhalten, Beenden und Deinstallation prüfen. Die parallele Nutzung mit der Website-Version oder die ausdrücklich gestartete Profildatenübernahme mit synthetischen Daten testen. Store-Updates und den Updateweg der Website-Version getrennt nachweisen. [Übergang von EXE/MSI zu MSIX](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-transition-users-from-your-web-unpackaged-app-to-store-packaged-app)
4. Die optionale Vault-Funktion mit WinFsp und die Grundfunktion ohne WinFsp prüfen. Die externe Voraussetzung in den Zertifizierungsnotizen angeben. Widevine-Verhalten, vorhandene Zertifizierungswerkzeuge und den WACK-Bericht gegen den paketierten Release-Stand dokumentieren. Ein lokaler WACK-Bericht ist ein Vorabtest vor der Prüfung durch Microsoft. [MSIX-Bereitschaftscheck](https://learn.microsoft.com/en-us/windows/apps/publish/store-readiness-checklist) · [MSIX-Zertifizierung](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process)
5. Alle acht Sprachtexte, aktuelle Bilder, Datenschutz- und Support-URL, Altersfreigaben sowie Angaben zur KI im MSIX-Entwurf abgleichen.
6. Das geprüfte MSIX unter **Pakete** in den MSIX-Entwurf hochladen, sofern der Upload autorisiert ist. Microsoft akzeptiert einzelne `.msix`-Pakete. `.msixupload` ist eine empfohlene Upload-Option. Angezeigte Identität, Architektur, Paketversion und Validierungsstatus prüfen. [MSIX-Pakete hochladen](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/upload-app-packages)
7. Erst nach bestätigtem Abschluss der abhängigen Arbeit und erfolgreichen Prüfungen darf die Store-Einreichung freigegeben werden. Noch erforderliche Vertragsannahmen bleiben eine ausdrückliche Nutzerentscheidung.

## Store-Inhalte

Die aktuellen Textentwürfe stehen in [listing-drafts.json](../assets/store/listing-drafts.json); der Leitfaden mit Links zu den acht einzeln kopierbaren Textdateien steht in [store-listing.md](store-listing.md). Sie enthalten Beschreibung, Kurzbeschreibung, fünf Produktmerkmale, sieben Suchbegriffe, Lizenztext, Copyright und Entwicklername. Bei der Ersteinreichung bleibt „Neu in dieser Version“ leer. Die Sprachen entsprechen dem aktuellen App-Inventar in `apps/desktop/src/renderer/i18n/keys.ts`. Der Preflight prüft die vollständige Zuordnung und die Feldlängen.

Der historische EXE/MSI-Entwurf erzeugte einen CSV-Export mit sieben Spracheinträgen. Die Vorlage ließ sich damals im integrierten Browser nicht übernehmen. Für einen MSIX-CSV-Import die zum MSIX-Entwurf gehörende Partner-Center-Vorlage einschließlich Sprachspalten und referenzierter Bilddateien verwenden. Die internen JSON- und Textdateien dienen als Kopiervorlagen. [MSIX-Einträge importieren und exportieren](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/import-and-export-store-listings)

Die sechs älteren Bilder unmittelbar unter `assets/store/` sind **Mockups** mit teilweise nicht belegten Messwerten und werden nicht als aktuelle Store-Screenshots verwendet. Unter `assets/store/screenshots/` liegen jetzt **232 echte PNG-Aufnahmen** der laufenden App: **29 Ansichten × acht Sprachen**, 1920×1080 Pixel, 0 Navigationsfehler. [Galerie](../assets/store/screenshots/index.html), [Aufnahmebericht](../assets/store/screenshots/capture-report.json) und [Vorgehen](store-screenshot-capture.md) dokumentieren den Lauf. Vier Aufnahmen pro Sprache sind im Store-Entwurf gespeichert. Sichtbare Übersetzungslücken wurden an **Multiagent Umsetzung** gemeldet; die Bilder müssen nach dessen Abschluss erneuert beziehungsweise abgeglichen werden.

Die für den früheren Entwurf gewählten Marketinggrafiken sind das [quadratische Logo](../assets/store/store-logo-1080.png) und das [Poster](../assets/store/store-poster-1440x2160.png). Vor der Übernahme Bildmaße, Pflichtfelder und Vorschauen im MSIX-Entwurf prüfen. Die Bilddateien für das App-Manifest folgen dessen eigenen Anforderungen. [Store-Bilder und Screenshots](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/screenshots-and-images)

Nach der Prüfung des endgültigen paketierten Builds den getesteten Mindest-Windows-Stand übernehmen. Die deutschen und englischen Datenschutz- und Support-URLs lieferten am 17. November 2026 HTTP 200. Die seitdem aktualisierten Texte liegen im Repository. Vor der Einreichung müssen die öffentlichen Seiten das Verhalten des freigegebenen MSIX korrekt beschreiben und erneut geprüft werden.

## Lokaler MSIX-Test vom 17. November 2026

- Desktop-Build und 2.662 Tests in 297 Testsuites bestanden. Der vollständige Store-Vorabcheck für das Testpaket meldete 37 bestandene Prüfungen, 0 Fehler und eine Warnung zum Abgleich der Screenshots mit dem endgültigen Paket.
- MakeAppx erstellte das unsignierte x64-MSIX für die lokale Testidentität `Lastbrowser.MsixLocalTest.0161` mit Paketversion `1.1.61.0`. SHA-256: `9355a1b726ae409003db05bc85de2a7c736c0544f59d9378a17b8ba2176a55d8`.
- Unter Windows 10 22H2 war der Entwicklermodus bereits aktiv. Das entpackte MSIX wurde temporär über sein Manifest registriert und über die Windows-Paketaktivierung mit einem neuen Testprofil gestartet. Paketidentität des laufenden Prozesses, Browserfenster und Initialisierung des Testprofils wurden geprüft. Anschließend wurde die Testregistrierung entfernt.
- Der separate WinFsp-Test schrieb synthetische Chromium- und Sidekick-Daten, öffnete das Profil nach dem Aushängen erneut und suchte in 107 Dateien des darunterliegenden verschlüsselten Speichers nach den Testmarkern. Es gab keinen Klartexttreffer. Das Testlaufwerk wurde ausgehängt.

Für den Store-Kandidaten stehen die Prüfung der echten Partner-Center-Identität, die Installation und Deinstallation der fertigen Store-Fassung, die Standardbrowser-Aktivierung, WACK und die abschließende Prüfung der öffentlichen Datenschutz- und Support-URLs aus.

## Historische Prüfergebnisse vor der MSIX-Umstellung

- Fünf betroffene Desktop-Testsuiten: **61/61 Tests bestanden**, einschließlich sieben Tests des neuen Signaturchecks. Diese prüfen rekursiv erfasste Abhängigkeiten, fehlende und fehlerhafte Signaturen, fehlende Zeitstempel, fremde native Formate und einen unsignierten Installer. Die Signaturantworten in den Testfällen sind kontrollierte Testdaten; sie sind kein Nachweis einer neuen signierten Release-Datei.
- PowerShell-Syntaxprüfung der beiden Prüfer: bestanden.
- Store-Schnellprüfung: **38 Prüfungen bestanden, 0 Fehler**, einschließlich der Textentwürfe für alle acht App-Sprachen, des Hauptlogos und sämtlicher 232 echter PNG-Aufnahmen. Drei Warnungen betreffen übersprungene vollständige Tests, das fehlende endgültige Paket und den noch notwendigen Abgleich der Bilder mit dem fertigen Release.
- Tatsächlicher Signaturcheck des vorhandenen 0.1.43-Pakets einschließlich Setup: **112 Dateien geprüft, 28 abgelehnt**. Darunter sind 26 unsignierte Windows-Dateien und zwei macOS-Node-Module. Der neue Prüfer beendet diesen Fall mit Fehler. Dieses alte Paket ist damit kein fertiger Store-Kandidat.
- Für MSIX stehen die Partner-Center-Identität, der Installationstest, der WACK-Bericht zum endgültigen Paket und die Zertifizierung separat aus.

## Primärquellen

- [MSIX-Einreichung](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission)
- [MSIX-Paketanforderungen](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)
- [MSIX-Zertifizierungsverfahren](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process)
- [Entwicklerkonto eröffnen](https://learn.microsoft.com/de-de/windows/apps/publish/partner-center/open-a-developer-account)

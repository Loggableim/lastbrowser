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

Im November 2026 erhielt der EXE/MSI-Entwurf den Übergangsnamen **Lastbrowser EXE Draft**. Die acht gespeicherten Spracheinträge sind weiterhin Teil dieses Entwurfs. Im Partner Center wurde die bisherige Reservierung **Lastbrowser** freigegeben. Die MSIX-Namensprüfung meldete danach für **LastBrowser** und **Lastbrowser** weiterhin, dass der Name nicht verfügbar sei. Der Herausgeber reservierte anschließend **LastBrowser Beta**. Am 18. November waren der MSIX-Produktentwurf und seine zugewiesene Paketidentität im Partner Center sichtbar. Der endgültig vorgesehene Name lautet **LastBrowser**. [Beta-Produktentwurf](https://partner.microsoft.com/de-de/dashboard/products/9NJX1T2KXDM3/overview) · [MSIX-Namensreservierung](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/reserve-your-apps-name)

Unter **Produktverwaltung → Produktidentität** die Werte `Package/Identity/Name`, `Package/Identity/Publisher` und `Package/Properties/PublisherDisplayName` exakt einschließlich Großschreibung und Satzzeichen übernehmen. Der Anzeigename im Manifest muss zur Namensreservierung passen. Paketversion und Architektur gehören ebenfalls ins Manifest. Der Package Family Name (PFN) dient zur Verifikation der Windows-Paketfamilie. [Produktidentität](https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details) · [Manifest für Win32-MSIX](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion)

Die erste Produktübermittlung für **LastBrowser Beta** ist als Entwurf angelegt. **Eigenschaften**, **Preise und Verfügbarkeit** und **Store-Einträge** zeigen **Vollständig**. Gespeichert sind die Kategorie **Produktivität**, Datenschutz-, Website- und Support-URL, die Angabe zu generativer KI und der Grundpreis 0 USD für die voreingestellten 240 Märkte. Altersfreigaben und Pakete stehen im MSIX-Entwurf aus. [Beta-Entwurf im Partner Center](https://partner.microsoft.com/de-de/dashboard/products/9NJX1T2KXDM3/overview)

Die acht Sprachfassungen wurden am 18. November über die exportierte CSV-Vorlage importiert und zeigten anschließend einzeln **Complete**. Sie enthalten den reservierten Namen **LastBrowser Beta**, Lang- und Kurzbeschreibung, Merkmale, Suchbegriffe, vier Screenshots aus dem Oktober-Quellbuild sowie Logo und Poster. Lizenzangaben und Versionshinweise waren vom Import ausgenommen. Die Bilder vor der Freigabe mit dem endgültigen Paket abgleichen. [Microsofts MSIX-Importanleitung](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/import-and-export-store-listings)

Der IARC-Fragebogen führt den Browser unter **Alle anderen App-Typen**. Er fragt ausdrücklich nach Webbrowsern und nach Online-Inhalten einschließlich KI-generierter Inhalte. Beides trifft auf LastBrowser zu. Die übrigen Antworten anhand des fertigen Pakets und der Hinweise je Frage prüfen. Beim Generieren der Altersfreigabe gibt Partner Center den Herausgeberanzeigenamen und die zugehörige E-Mail-Adresse an IARC weiter. [Microsoft-Anleitung zur Altersfreigabe](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/age-ratings)

Die Signatur durch den Store betrifft das MSIX-Paket. Für geschützte Medien bleibt die Widevine-VMP-Funktion des konkreten Builds separat zu prüfen. Für das Website-Setup gelten die bisherigen Authenticode-Anforderungen. [Lokaler Signierablauf für EXE](local-signed-release.md)

Die acht Einträge anhand des endgültigen Pakets aktualisieren und echte Aufnahmen dieses Builds verwenden. Live-KI in den Metadaten und in Partner Center angeben. Den Meldeweg für problematische KI-Ausgaben prüfen, ohne reale Nutzerdaten zu versenden. Die Altersfreigabe anhand des tatsächlichen Funktionsumfangs ermitteln. [Store-Einträge](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info) · [Altersfreigaben](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/age-ratings) · [Store-Richtlinien 10.5 und 11.16](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)

Die öffentlichen deutschen und englischen Datenschutz- und Supportseiten lieferten am 18. November 2026 HTTP 200. In beiden Datenschutzseiten fehlten die Hinweise zu Widevine und zur MSIX-Datenspeicherung. Beide öffentlichen Supportseiten beschrieben Profilverschlüsselung pauschal und enthielten keine Anleitung zum Melden von KI-Antworten. Die überarbeiteten Texte liegen im Repository. Die öffentlichen Downloadseiten zeigten 0.1.60 Beta, die lokalen statischen Seiten 0.1.56. Vor der Einreichung die gezielt aktualisierten öffentlichen Seiten mit dem geprüften Paket abgleichen. [DE Datenschutz](https://lastbrowser.com/privacy/) · [EN Datenschutz](https://lastbrowser.com/en/privacy/) · [DE Support](https://lastbrowser.com/support/) · [EN Support](https://lastbrowser.com/en/support/)

## Historische EXE/MSI-Prüfung zu PR #384

- `apps/desktop/package.json` ergänzt Authenticode-Signierung für `.dll`, `.pyd` und `.node`. EXE-Dateien bleiben im vorhandenen electron-builder-Signierungsablauf. Nicht-Windows-Prebuilds von node-pty werden ausgeschlossen.
- `scripts/verify-windows-package-signatures.ps1` prüft den nativen Inhalt eines entpackten Windows-Pakets und optional den endgültigen Installer. Fehlende, ungültige oder nicht mit Zeitstempel versehene Signaturen sowie nicht unterstützte native Dateiformate führen zum Fehler. Der Prüfer ändert keine Binärdateien.
- Der bisherige EXE/MSI-Pfad in `scripts/verify-store-readiness.ps1` prüft Authenticode. Die Prüfung eines versionierten HTTPS-Installerlinks und der NSIS-Silent-Modus `/S` gehören zum früheren EXE/MSI-Weg. [EXE/MSI-Paketanforderungen](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements)
- Der Paketcheck verlangt zusätzlich den Helfer, die Java-Laufzeit und die Vault-Module für verschlüsselte Spaces im tatsächlichen Windows-Paket. Die Prüfung der installierten Funktion folgt auf dem Windows-Testsystem.
- Die deutschen und englischen Datenschutztexte unterscheiden lokale Ollama-Modelle, entfernte Endpunkte, Ollama Cloud und externe Anbieter sowie mehrere Anfragen innerhalb eines gestarteten Auftrags oder Ziels. Diese Websiteänderungen sind noch nicht veröffentlicht.

Auf dem Windows-Testhost waren im November 2026 keine nutzbare Codesignatur-Identität sowie kein installiertes Windows App Certification Kit und kein Windows-SDK-SignTool nachgewiesen. Der ältere EXE-Signierlauf belegt keine aktuelle Paket- oder Zertifizierungsprüfung für MSIX.

## MSIX aus dem Windows-Build erstellen

Das fertige x64-Verzeichnis `win-unpacked` mit Electron, Python, Sidekick, Vault-Laufzeiten und Lizenzen ist die Eingabe. Das Skript erstellt ein MSIX mit dem Windows-SDK-Werkzeug `MakeAppx.exe`. Es übernimmt die drei bestätigten Partner-Center-Werte über die Kommandozeile. `$productDisplayName` muss dem reservierten Anzeigenamen entsprechen. Für den aktuellen Entwurf lautet er `LastBrowser Beta`. Ohne Vorgabe verwenden Paketierung und Prüfung `LastBrowser`. Die Paketversion für LastBrowser 0.1.61 lautet `1.1.61.0`.

Im Repository-Stammverzeichnis die absoluten Ausgabepfade und die echten Manifestwerte in den folgenden Variablen setzen. `$payloadDirectory` muss ein neuer Ordner sein und `$outputPath` ein neuer Dateiname mit der Endung `.msix`. Die npm-Abhängigkeiten und die gepinnten Build-Eingaben für Python und verschlüsselte Spaces müssen auf dem Windows-Buildsystem verfügbar sein. [Laufzeiten vorbereiten](local-signed-release.md#provision-offline-python-inputs)

```powershell
npm --workspace apps/desktop run package:store:payload -- -OutputDirectory $payloadDirectory
$appDirectory = Join-Path $payloadDirectory 'win-unpacked'
npm --workspace apps/desktop run package:store:msix -- `
  -AppDirectory $appDirectory -OutputPath $outputPath `
  -IdentityName $identityName -Publisher $publisher `
  -PublisherDisplayName $publisherDisplayName -ProductDisplayName $productDisplayName
.\scripts\verify-store-readiness.ps1 -MsixPath $outputPath `
  -ExpectedStoreIdentityName $identityName -ExpectedStorePublisher $publisher `
  -ExpectedStorePublisherDisplayName $publisherDisplayName -ExpectedProductDisplayName $productDisplayName
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

Die sechs Hintergrundgrafiken im Beta-MSIX entsprechen per SHA-256 den sechs Referenzdateien für 0.1.56. Der zugehörige Testbericht dokumentiert, dass ihr Urheber sie selbst mit ChatGPT erstellt und ihre Verwendung freigegeben hat. [Paketbericht und Freigabe](test-reports/20261012-v0156-integrated-cb69bb92.md#offene-abnahme)

## Lokaler MSIX-Test vom 17. November 2026

- Desktop-Build und 2.662 Tests in 297 Testsuites bestanden. Der vollständige Store-Vorabcheck für das Testpaket meldete 37 bestandene Prüfungen, 0 Fehler und eine Warnung zum Abgleich der Screenshots mit dem endgültigen Paket.
- MakeAppx erstellte das unsignierte x64-MSIX für die lokale Testidentität `Lastbrowser.MsixLocalTest.0161` mit Paketversion `1.1.61.0`. SHA-256: `9355a1b726ae409003db05bc85de2a7c736c0544f59d9378a17b8ba2176a55d8`.
- Unter Windows 10 22H2 war der Entwicklermodus bereits aktiv. Das entpackte MSIX wurde temporär über sein Manifest registriert und über die Windows-Paketaktivierung mit einem neuen Testprofil gestartet. Paketidentität des laufenden Prozesses, Browserfenster und Initialisierung des Testprofils wurden geprüft. Anschließend wurde die Testregistrierung entfernt.
- Der separate WinFsp-Test schrieb synthetische Chromium- und Sidekick-Daten, öffnete das Profil nach dem Aushängen erneut und suchte in 107 Dateien des darunterliegenden verschlüsselten Speichers nach den Testmarkern. Es gab keinen Klartexttreffer. Das Testlaufwerk wurde ausgehängt.

## Lokaler Test des Beta-MSIX vom 18. November 2026

- MakeAppx erstellte das unsignierte x64-MSIX `1.1.61.0` mit der verifizierten Partner-Center-Identität von **LastBrowser Beta**. SHA-256: `d518dab4d83bd1d2f1c0d2a9ad0eaf68bc72dd9ca56371f8de0a89a55168df7d`.
- Die SHA-256-Blocklisten aller 12.262 Laufzeitdateien stimmen mit dem lokal getesteten MSIX vom 17. November überein.
- Auf Windows 10 22H2 wurde das entpackte Beta-MSIX im aktiven Entwicklermodus temporär registriert. Die Windows-Paketaktivierung startete ein Browserfenster und initialisierte ein neues Testprofil. Die Identität des aktiven Prozesses entsprach dem registrierten Beta-Paket. Anschließend wurde die Registrierung entfernt.
- Der Desktop-Build und `python -m compileall -q services/sidekick` bestanden. Nach Zeitlimits bei parallelen Builds und Tests bestand der erneute Vitest-Lauf mit `--maxWorkers=1 --testTimeout=30000` alle 2.662 Tests in 297 Dateien.
- Der vollständige Store-Vorabcheck mit der Beta-Identität meldete im erneuten Lauf ohne parallele Jobs 37 bestandene Prüfungen und 0 Fehler. Offen blieb eine Warnung zum Screenshot-Abgleich. Mit dem erwarteten Namen `LastBrowser` lehnte der Vorabcheck das Beta-Paket wie vorgesehen ab.
- Für die Freigabe stehen die Installation der von Microsoft signierten Fassung, die Prüfung als Standardbrowser, WACK sowie der Abgleich der öffentlichen Datenschutz- und Support-URLs und der Store-Screenshots mit dem endgültigen Paket aus.

Für WACK wurde der offizielle Windows-SDK-Installer für Windows 10 (Dateiversion `10.1.19041.5609`) heruntergeladen. Windows bestätigte seine Microsoft-Authenticode-Signatur. Das Kit ist auf dem Testrechner noch nicht installiert. Für den Test ist nach der Installation eine aktive Windows-Sitzung mit Administratorrechten erforderlich. [Windows SDK](https://learn.microsoft.com/en-us/windows/apps/windows-sdk/downloads) · [Windows App Certification Kit](https://learn.microsoft.com/en-us/windows/uwp/debug-test-perf/windows-app-certification-kit)

Für fünf Java-Artefakte wurden der Apache-2.0-Text und die versionsgenauen Quellen- und Urheberhinweise ergänzt. Das Offline-Staging übernahm beide Dateien. Im neu gepackten Beta-MSIX sind diese beiden Dateien und das dazugehörige Lizenzinventar die einzigen Unterschiede laut SHA-256-Blockliste zum auf diesem Rechner gestarteten Beta-Paket. SHA-256 des aktualisierten MSIX: `41adb493fb5aa9aa0532ac4823460988e39bd026cc1b67c5eb5149acda939f0b`. Die Weitergaberechte und Quellcodebereitstellung für das Gesamtpaket bleiben separat zu klären. [Windows-Laufzeitinventar](legal/windows-protected-spaces-runtime.md)

Der erneute Desktop-Build, die Python-Syntaxprüfung und der fokussierte Test der verschlüsselten Windows-Spaces bestanden. Der Desktop-Gesamtlauf meldete 2.660 bestandene Tests und ein Zeitlimit im Navigationstest. Die betroffene Datei `tests/nav-smoke.test.ts` bestand isoliert mit 6 von 6 Tests. Der vollständige Store-Vorabcheck bestand im isolierten Wiederholungslauf mit 37 Prüfungen, 0 Fehlern und der Warnung zum Screenshot-Abgleich. Der Prüfer lehnte das ältere MSIX ab, in dem die beiden neuen Hinweistexte fehlten.

## Weitere Windows-Aktivierungsprüfung am 18. November 2026

- Zwei Regressionstests reproduzierten den Fehler bei lokalen HTML-Pfaden mit `#` und `%`. Die korrigierte URL-Umwandlung nutzt `pathToFileURL`. Desktop-Build, 2.664 Tests in 297 Dateien und eine Syntaxprüfung der 1.162 erfassten Python-Dateien bestanden.
- Auf Windows 10 22H2 meldete die Windows-Abfrage HTTP, HTTPS, `.html` und `.htm` für die registrierte Beta-Paketfamilie als verfügbar. Vier getrennte Kaltstarts über die Paketkennung zeigten eine lokale HTTP-Testseite, eine `.html`-Datei, eine `.htm`-Datei und eine HTML-Datei in einem Pfad mit `#` und `%`. Jedes Szenario verwendete ein eigenes Testprofil. Die Registrierung wurde entfernt und die Standardzuordnungen vor und nach dem Test verglichen. HTTPS wurde als Zuordnung geprüft. Aktivierung als Standardbrowser und Weiterleitung bei bereits laufender App bleiben auf einem sauberen Testkonto zu prüfen. [Windows-Abfrage für URI-Zuordnungen](https://learn.microsoft.com/en-us/uwp/api/windows.system.launcher.queryurisupportasync) · [Windows-Abfrage für Dateizuordnungen](https://learn.microsoft.com/en-us/uwp/api/windows.system.launcher.queryfilesupportasync)
- Der letzte Dateiverschiebevorgang nach MakeAppx und ein erster Entpackversuch blieben auf dem Testhost stehen. Der abschließende Test verwendete das erzeugte Archiv über den ZIP-Leser. Die im Ausgabeordner abgelegte Kopie stimmt per SHA-256 mit dem getesteten Archiv überein. SHA-256: `c3b54b75346419638b1b50ec995afc9576cb3aad7f008783500a374d2f604367`. Der vollständige Store-Vorabcheck meldete 37 bestandene Prüfungen und 0 Fehler. Die Warnung zum Screenshot-Abgleich bleibt offen.

### Weiterleitung an das laufende Fenster

- Beim obigen Paket startete der Test ein frisches Profil über die Paketkennung. Ein aus dem laufenden Paketprozess gestarteter Zweitprozess übergab den vollständigen HTML-Pfad im Electron-Ereignis `second-instance`. Die Anwendung fokussierte das ursprüngliche Fenster. Der Öffnungsbefehl blieb in der Warteschlange und erreichte die Oberfläche nicht.
- Die Oberfläche meldet ihre Bereitschaft jetzt nach dem Registrieren des Öffnungs-Listeners. Eine Navigation des Hauptdokuments oder dessen abgestürzter Renderer setzt den Status zurück. Der fokussierte Test `npm --workspace apps/desktop run test:run -- tests/open-url-lifecycle.test.ts` reproduzierte den Fehler vor der Änderung und bestand danach mit fünf Tests.
- Die korrigierte Testkopie ersetzte im extrahierten Beta-Paket ausschließlich vier neu kompilierte Dateien in `app.asar`. Die Archiveinträge wurden vor und nach der Änderung verglichen. SHA-256 der korrigierten `app.asar`: `5a652b9b696255a66323c7683206871e1c42bc5a31c38ca9ab80cfb42754eb55`. Die temporäre Windows-Registrierung mit einem neuen Profil zeigte beim Kaltstart die Startdatei. Beide Zweitprozesse beendeten sich mit Code 0. Das ursprüngliche Fenster zeigte nacheinander die HTML-Datei mit `#` und `%` und eine vom lokalen Testserver gelieferte HTTP-Seite. Die Registrierung wurde entfernt. Die Standardzuordnungen blieben erhalten. Der Aufruf durch die Windows-Shell als gesetzter Standardbrowser steht weiterhin aus.
- Für die neue MakeAppx-Datei wurden die ursprünglichen Paketpfade aus der Blockmap wiederhergestellt und die beim Test erzeugten Python-Caches entfernt. Der Vergleich aller 12.270 Blockmap-Einträge fand als einzige Inhaltsänderung die getestete `app.asar`. SHA-256 des unsignierten Beta-MSIX: `0cd193e49caf721456ef3d20bbd345fa396ee8110696eb20bcc8983f469630d2`. Der vollständige Store-Vorabcheck meldete 37 bestandene Prüfungen, 0 Fehler und die Warnung zum Screenshot-Abgleich.
- Der Desktop-Build, alle 2.666 Tests in 297 Dateien (`npm --workspace apps/desktop run test:run -- --maxWorkers=1 --testTimeout=30000`) und die Syntaxprüfung der 1.162 erfassten Python-Dateien bestanden.

### Lokales Sidekick-Backend und vollständiges Beenden

- Auf Windows 10 22H2 wurden SHA-256 des Beta-MSIX und alle 12.270 Dateien der Blockmap geprüft. Die temporäre Registrierung startete über die Windows-Paketkennung mit einem neuen LastBrowser-Profil. Der Test begrenzte Chromium-Verbindungen mit einem lokalen Proxy ohne Weiterleitung und aktiven Startparametern für Chromium-Hintergrunddienste. Die Konnektivitätsaussage bezieht sich auf diesen Testaufbau.
- `window.lastbrowser.services.status()` meldete `sidekick=ready` und `webuiHealth=ready`. Der Runtime-Pfad lag im Testprofil. Der Windows-Listener des Backends gehörte einem Kindprozess, der aus dem paketierten `resources/runtime/python/python.exe` gestartet war.
- Der erste Automatisierungsversuch verlor beim Schließen über den Browser-Debugging-Kanal die Verbindung. Der Wiederholungslauf bestätigte den regulären `app.quit()`-Aufruf im verifizierten Hauptprozess. Windows meldete Exitcode 0. Alle beobachteten Kindprozesse und geprüften lokalen Listener verschwanden. Die Testregistrierung wurde entfernt und die Standardzuordnungen vor und nach dem Lauf verglichen. Das Schließen über das Fensterkreuz und die vollständige Trennung vom Internet waren eigene Szenarien außerhalb dieses Laufs.

### Screenshot-Nachweis für das Beta-MSIX

- Die vier Ansichten Browser, Downloads, Darstellung und Präferenzen wurden in allen acht UI-Sprachen nach Start des verifizierten Beta-MSIX über die Windows-Paketkennung aufgenommen. Das Testprofil durchlief die Ersteinrichtung mit deaktivierter KI und ohne Klick auf eine Dock-App. In den Präferenzen meldete die App die Updateverwaltung durch den Microsoft Store. Der Aufnahmebericht wurde nach vollständigem Beenden mit Exitcode 0 und Entfernen der temporären Registrierung abgeschlossen.
- `verify-store-readiness.ps1` mit `-MsixPath`, `-PackageDirectory` und `-ScreenshotReportPath` prüfte alle 32 PNGs bei 1920 × 1080, Bilddateien und Hashes von EXE und ASAR. Der geprüfte Paket-Hash lautet `0cd193e49caf721456ef3d20bbd345fa396ee8110696eb20bcc8983f469630d2`. Der Lauf ergab 37 bestandene Prüfungen, 0 Warnungen und 0 Fehler.
- Die Sichtprüfung umfasste alle acht Browser-Aufnahmen und Stichproben aus den anderen Ansichten. Im Beta-Paket sind weiterhin acht Dock-Apps vorausgewählt. Die Änderung für leere neue Profile und gespeicherte leere Dock-Listen liegt bereits in `d09853a` auf `codex/portable-06160-review`. In mehreren nichtenglischen Startseiten stehen noch „Notes“ und „Focus timer“. Im japanischen Einstellungsbild erscheint der Abschnitt für Startanimation und Ton auf Englisch. Zu Beginn war auch nach der Auswahl „ohne KI“ der Hinweis zur Modellprüfung sichtbar.
- Die Aufnahmen dokumentieren den geprüften Beta-Stand. Die Store-Bilder folgen aus dem integrierten Freigabestand nach Abgleich der Dock-Auswahl und Sprachtexte.

### Dock-Vorauswahl im Store-Quellzweig

Der Store-Zweig übernimmt die Dock-Korrektur aus `d09853a`. Ein neues Profil startet mit leerem Dock. Leere gespeicherte Listen werden auch bei der Übernahme älterer Profile erhalten. Der Einrichtungsassistent übernimmt vorhandene Pins und ändert nur die angeklickte App. Der ausdrückliche Reset stellt weiterhin die bisherigen Standard-Pins bereit.

Die Regressionstests reproduzierten vor der Korrektur drei Fehler beim Laden des Dock-Zustands. Der Electron-Test zeigte sieben ausgewählte Kacheln im Einrichtungsassistenten. Nach der Korrektur bestanden `npm --workspace apps/desktop run test:run -- tests/pinned-apps.test.ts` (26 Tests) und `node apps/desktop/tests/workplace-onboarding-dom.cjs --first-run-only` (sechs Prüfgruppen), einschließlich Anheften, Entfernen und Speichern der leeren Liste. Das zuvor geprüfte Beta-MSIX und seine Screenshots stammen aus dem vorherigen Quellstand.

Der Desktop-Build und alle 2.671 Tests in 297 Dateien (`npm --workspace apps/desktop run test:run -- --maxWorkers=2 --testTimeout=30000`) bestanden. Alle 1.162 erfassten Python-Dateien bestanden die Syntaxprüfung im Speicher. Der Store-Vorabcheck mit dem vorhandenen Beta-MSIX als Paketreferenz meldete 37 bestandene Prüfungen, 0 Fehler und eine Warnung zum Screenshot-Abgleich des Freigabestands.

### Modellprüfungen beim Browser-Start

Das geprüfte Beta-MSIX zeigte nach der Auswahl „ohne KI“ vorübergehend die Modellprüfung. Der erste Aufruf führt zum lokalen Sidekick über Loopback. Die Kataloglogik kann bei vorhandener Anbieter-Konfiguration weitere Modelllisten abrufen. Der Bildschirmbefund belegt den sichtbaren Status. Die tatsächlichen Verbindungen eines frischen Profils waren in diesem Lauf außerhalb der Prüfung.

Der Store-Quellzweig übernimmt die gespeicherte KI-Auswahl, bevor er die automatischen Onboarding- und Katalogabfragen beim Start, den Hintergrundabruf oder die QuickChat-Vorbereitung ausführt. Ein früher eingerichtetes KI-Profil wird weiterhin als aktiviert erkannt. Der bewusst geöffnete QuickChat-Modellwähler und der Reiter „KI & lokale Modelle“ können ihren Katalog laden. Der isolierte Electron-Test der Einstellungen prüfte die beiden Aufrufpfade mit simuliertem Backend. Er erfasste in den allgemeinen Einstellungen 0 Anfragen an `/api/models` und `/api/providers` und beide Abfragen nach Öffnen des KI-Reiters.

Der Desktop-Build und alle 2.673 Tests in 297 Dateien bestanden. Der Store-Vorabcheck nutzte das vorhandene Beta-MSIX als Paketreferenz und meldete 37 bestandene Prüfungen, 0 Fehler und eine Warnung zum Screenshot-Abgleich. Die geänderte Startlogik wurde im Quellzweig und im Einstellungs-Test geprüft.

### Windows-Pakettest für Dock und KI-Auswahl

- Für den lokalen Test wurde der Renderer aus `4eea4db` gebaut und in das bisherige Beta-MSIX übernommen. Von 12.270 Dateien der Blockliste änderte sich nur `app/resources/app.asar`. Die Prüfung des ASAR-Inhalts bestätigte, dass alle Dateien außerhalb von `dist/renderer` ihre bisherigen Inhalte behalten. SHA-256 des Pakets: `5072e0b4c0b947100c7ddb1c23d3640cb72e376bb38554398f1d554ca4e420be`.
- Das temporär registrierte Paket startete über die Windows-Paketkennung unter Windows 10 22H2 mit einem frischen Profil. Im Einrichtungsassistenten war keine Dock-App ausgewählt. Das Dock blieb nach der Einrichtung und nach erneutem Laden des Renderers leer. „Ohne KI“ blieb gespeichert.
- Ab dem ersten instrumentierten Neuladen des Renderers erfasste der Hauptprozess vor der KI-Auswahl, nach „Ohne KI“ und in den allgemeinen Einstellungen keine der überwachten automatischen lokalen Modell- oder Anbieterabfragen. Beim bewussten Öffnen von „KI & lokale Modelle“ erfasste der Mitschnitt sowohl `GET /api/models` als auch `GET /api/providers` am lokalen Backend. Der Mitschnitt deckt Loopback-Aufrufe des Hauptprozesses in diesen Prüfschritten ab. Die Zeit vor dem instrumentierten Neuladen und der übrige Netzwerkverkehr waren außerhalb dieser Messung.
- Das gebündelte Python stellte das lokale Sidekick-Backend bereit. Der reguläre Aufruf von `app.quit()` beendete das Paket und alle beobachteten Kindprozesse mit geschlossenen lokalen Listenern. Die temporäre Registrierung wurde entfernt. Die Standardzuordnungen blieben erhalten.
- Der Test erzeugte 32 Aufnahmen in acht Sprachen. `verify-store-readiness.ps1` prüfte sie über den Screenshot-Bericht gegen EXE und ASAR des Pakets. Der erneute Lauf mit Zugriff auf die lokale Vitest-Konfiguration ergab 37 bestandene Prüfungen, 0 Warnungen und 0 Fehler. Die Aufnahmen und der Lauf gehören zum lokalen Testpaket. Die Microsoft-signierte Installation auf einem sauberen System und WACK stehen aus.

### Übersetzungsprüfung der Startseite und Startoptionen

- Die Texte für Notizen, Aufgaben und Fokuszeit auf der Startseite verwenden die aktive UI-Sprache einschließlich Hinweisen und zugänglichen Beschriftungen. Kacheln und Anpassungsdialog nutzen dieselben Namen. Der Electron-Test `node apps/desktop/tests/workplace-onboarding-dom.cjs` reproduzierte zunächst „Notes“ in der japanischen Ansicht. Nach der Korrektur prüfte er die Kacheln und ihre Anpassung auf Japanisch, Französisch und brasilianischem Portugiesisch.
- Die Einstellungen für Startanimation und Ton haben Texte in allen acht Desktop-Sprachen. Das umfasst Vorschau, Statusmeldungen und das kompakte Einstellungsmenü. Gerenderte Tests prüften die japanische und französische Fassung. Die Tonspurnamen bleiben erhalten.
- Der Desktop-Build sowie 2.675 Tests in 297 Dateien bestanden. Die Syntaxprüfung erfasste alle 1.162 versionierten Python-Dateien.
- Der lokale Store-Vorabcheck verwendete das zuvor getestete Beta-MSIX als Paketreferenz und meldete 37 bestandene Prüfungen, 0 Fehler und eine Warnung zum fehlenden Screenshot-Abgleich des neuen Quellstands. Die Übersetzungen müssen in den integrierten Freigabebuild und seine Store-Aufnahmen übernommen werden.

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

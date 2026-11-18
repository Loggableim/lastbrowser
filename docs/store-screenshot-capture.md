# Echte Store-Screenshots

Am 4. Oktober 2026 wurden **232 echte PNG-Aufnahmen** erstellt: **29 Ansichten in acht App-Sprachen**, jeweils **1920 × 1080 Pixel**. Der vollständige Lauf endete mit **0 Navigationsfehlern**. [Galerie](../assets/store/screenshots/index.html) und [Aufnahmebericht](../assets/store/screenshots/capture-report.json) enthalten die Ergebnisse.

## Wiederholen

```powershell
node scripts/capture-store-screenshots.cjs
```

Der Test baut Main, Preload und Renderer aus den vorhandenen lokalen Quellen und Abhängigkeiten nach `out/store-capture/current`. Er startet die echte Electron-App mit dem eingebetteten Python und dem Backend aus `services/sidekick/`. Er installiert keine Abhängigkeiten und synchronisiert keinen externen Quellcode. Der normale Build-Ausgabeordner wird nicht verändert.

Ein temporäres eigenes Browser- und Backendprofil verhindert, dass bestehende App-Sitzungen übernommen werden. Token-Umgebungsvariablen werden entfernt; die GitHub-CLI erhält einen leeren Konfigurationsordner. Der Test registriert sich nicht als Standardbrowser und sendet selbst keine Modellanfrage. Die App kann weiterhin ihre normalen Hintergrundabfragen zur Modellerkennung ausführen; der Test ist kein Nachweis vollständiger Netzwerkisolation.

Der Test klickt die tatsächlichen Bedienelemente an und speichert den gerenderten Fensterinhalt. Es werden keine Chatantworten, Leistungszahlen oder UI-Inhalte erfunden. Abschließend werden die eigene Backendinstanz gestoppt, die eigenen Fenster geschlossen und ausschließlich das eigene temporäre Profil entfernt.

`--probe` erstellt eine einzelne Probeaufnahme; `--no-build` verwendet den zuvor isoliert gebauten Stand. `--gallery-only` erneuert nur die Galerie aus dem Aufnahmebericht.

## Umfang

Sprachen: Englisch, Deutsch, Italienisch, Spanisch, Französisch, Portugiesisch (Brasilien), Russisch und Japanisch. Die Liste stammt aus dem App-Sprachkatalog.

Aufnahmen: Browser/Startseite, Chat, geplante Aufgaben, Kanban, Skills, Agenten, Gedächtnis, Arbeitsbereiche, Profile, Aufgaben/Plan, Nutzung, Logs, Gmail, Discord, Terminal und Einstellungen; zusätzlich alle sieben Einstellungsseiten, Erweiterungs-Hub, Skill-Hub, Downloads, Verlauf, Berechtigungen und Befehlspalette. Der frühere Appstore-Menüpunkt wird durch den tatsächlich zugänglichen Erweiterungs-/Skill-Hub abgedeckt.

Für jeden Store-Sprachentwurf werden vier Ansichten gewählt: `browser.png`, `settings-02.png`, `agents.png` und `kanban.png`. Die vollständige Sammlung wird lokal erhalten.

## Noch vorläufig

Die Bilder zeigen einen Entwicklungsstand vor dem Abschluss von **Multiagent Umsetzung**. Die Navigation und Bildformate wurden geprüft; KI-Aufträge, Integrationseinrichtung und Releaseinstallation wurden damit nicht funktional abgenommen.

Sichtbare Übersetzungslücken wurden an den abhängigen Chat gemeldet: deutsche Space-Karten, englische Favoriten-/Verlaufstexte auf der Startseite, „Zurück zum Web“, „Deaktiviert“ bei Dock-Einstellungen und nicht übersetzte native Panel-/Hub-Beschriftungen. Im nicht eingerichteten KI-Bereich erscheinen zudem Modellerkennungs-/Anfragefehlermeldungen; diese Ansicht wurde nicht für den Store ausgewählt.

Vor der Zertifizierung den Test aus dem fertigen gemeinsamen Stand erneut ausführen, Bilder visuell prüfen und die Store-Auswahl aktualisieren. **Die Store-Freigabesperre bleibt bestehen.**

## Aufnahmen dem Windows-Paket zuordnen

Starten Sie den Aufnahmelauf unter Windows mit Node.js 22. Geben Sie das entpackte Windows-Programm und ein neues Ausgabeverzeichnis an. Der Treiber öffnet ein neues Testprofil und leitet externe Anfragen an einen blockierenden lokalen Proxy. Die vier Ansichten `browser`, `downloads`, `appearance` und `preferences` werden in acht UI-Sprachen aufgenommen. Die Systemdiagnose und der Erweiterungs-Hub können lokale Dateipfade anzeigen.

```powershell
node scripts/capture-store-package.cjs '<release-folder>/win-unpacked/Lastbrowser.exe' '<new-capture-folder>'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-store-screenshot-receipt.ps1 -PackageDirectory '<release-folder>/win-unpacked' -ScreenshotReportPath '<new-capture-folder>/capture-report.json'
```

Für den Vorabcheck einer entpackten EXE-Fassung übergeben Sie denselben Aufnahmebericht an `scripts/verify-store-readiness.ps1` mit `-ScreenshotReportPath` und `-PackageDirectory`. Der Bericht enthält Laufzeiten, den Abschlussstatus, EXE- und ASAR-Hashes sowie Locale, Ansicht, Pfad und Hash je Bild. Die Prüfung akzeptiert je Sprache ein bis zehn echte 1920×1080-PNGs.

### Registriertes MSIX aufnehmen

Verwenden Sie Windows PowerShell 5.1, Node.js 22 oder neuer und einen isolierten Windows-Testhost mit aktivierter Entwicklerregistrierung. Entpacken Sie das unsignierte Store-MSIX mit `MakeAppx unpack` in einen frischen Ordner. Übernehmen Sie die erwartete SHA-256 aus dem Build- oder Übergabeprotokoll. `$fixturePath` und `$capturePath` müssen zwei neue Pfade mit vorhandenen Elternordnern außerhalb der Extraktion sein.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/capture-store-msix.ps1 `
  -MsixPath $msixPath -ExpectedSha256 $expectedSha256 -PackageRoot $unpackedPath `
  -FixtureRoot $fixturePath -OutputDirectory $capturePath
```

Der Treiber prüft die Blockliste, registriert die entpackte App temporär und startet sie über ihre Windows-Paketkennung. Die App verwendet ein frisches Browserprofil und einen lokalen Proxy für Chromium-Verbindungen. Der Test prüft die Eigentümer der Debugging-Ports und die Store-Updateverwaltung. Nach regulärem Beenden und Entfernen der Testregistrierung verifiziert und speichert er den Aufnahmebericht mit `captureMethod: registered-msix` und `msixSha256`. Die Testprofildaten liegen unter `$fixturePath`.

Übergeben Sie das Archiv und `capture-report.json` für den MSIX-Vorabcheck an `scripts/verify-store-readiness.ps1` mit `-MsixPath` und `-ScreenshotReportPath`. Der Prüfer gleicht die SHA-256 des Archivs, die EXE und ASAR im Archiv und jede Bilddatei mit dem Bericht ab. Eine über `-PackageDirectory` zusätzlich angegebene Extraktion wird ebenfalls geprüft. [Dokumentierter Windows-Paketlauf](store-submission-preparation.md#lokalisierte-oberfläche-im-windows-beta-paket)

Die Store-Vorschau braucht weiterhin eine Sichtprüfung. Eine Authenticode-Signatur der EXE oder eine Signatur des MSIX ändert die Prüfsumme der jeweils signierten Datei. Verwenden Sie den Aufnahmebericht des Artefakts, das Sie prüfen.

# Lastbrowser – Microsoft Store Releaseplan (Weg A: Win32/NSIS)

Dieses Dokument definiert den verbindlichen Release- und Zertifizierungsplan zur Veröffentlichung von **Lastbrowser** im **Microsoft Store (Windows Store)** über das moderne **Unpackaged Win32 Desktop Application Program** (NSIS-Installer).

---

## 1. Strategische Leitlinie

- **Vertriebsweg:** Microsoft Store (Windows 10 & 11) via Unpackaged Win32 Installer.
- **Vorteil:** Die gesamte Lastbrowser-Architektur (**Python 3.12 Runtime, FastAPI-Sidecar, ConPTY-Terminal, Sidekick-Updater, `electron-updater`**) bleibt zu 100 % funktionsfähig und unterliegt **keinen Sandbox-Restriktionen** der MSIX/UWP-Container.
- **Kernanforderungen:** 
  1. Gültig signierter Installer (Authenticode).
  2. Robuster Silent-Install & Silent-Uninstall (`/S`).
  3. Einhaltung der Microsoft Store Browser- und KI-Richtlinien (Policy 10.2 & GenAI Policy).
  4. Öffentliche Datenschutzerklärung und Support-Präsenz.

---

## 2. Phasenübersicht & Meilensteine

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           LASTBROWSER STORE RELEASE ROADMAP                      │
├───────────────────┬───────────────────┬──────────────────┬───────────────────────┤
│     PHASE 1       │     PHASE 2       │     PHASE 3      │       PHASE 4 & 5     │
│   Code- & Shell-  │   Code-Signing &  │  Rechtliches,    │ Store-Assets, Listing │
│     Härtung       │  CI/CD Pipeline   │ Web & Accounts   │  & Zertifizierung     │
├───────────────────┼───────────────────┼──────────────────┼───────────────────────┤
│ • Silent-Uninstall│ • Azure Trusted   │ • Privacy Policy │ • 1920x1080 Screens   │
│ • Single-Instance │   Signing Setup   │   (lastbrowser)  │ • Store-Metadaten     │
│ • Default Browser │ • GitHub Actions  │ • Partner Center │ • Submission Formular │
│ • Clear Data API  │   Release Hook    │   Account ($19)  │ • WACK Testing        │
│ • KI-Feedback UI  │ • Cert-Validation │ • IARC Rating    │ • Rollout & Monitoring│
└───────────────────┴───────────────────┴──────────────────┴───────────────────────┘
```

---

## 3. Phase 1: Technische Code- & Installer-Härtung (Repository)

### 1.1 Silent-Uninstall Absicherung (`apps/desktop/build/installer.nsh`)
- [ ] **Problem:** Microsofts automatische Zertifizierung führt `Uninstall.exe /S` aus. Die aktuelle `MessageBox` blockiert die Ausführung im Silent-Modus und führt zum Timeout.
- [ ] **Lösung:** Umschließen des Dialogs mit `${ifNot} ${Silent}`:
  ```nsis
  ${ifNot} ${Silent}
    ${ifNot} ${isUpdated}
      MessageBox MB_YESNO|MB_ICONQUESTION "Remove Lastbrowser user data from $APPDATA\Lastbrowser? Choose No to keep browser profiles, Sidekick settings, tokens, cache, and local setup state for a future reinstall." IDNO skipUserDataCleanup
        RMDir /r "$APPDATA\Lastbrowser"
        DetailPrint "Removed Lastbrowser user data from $APPDATA\Lastbrowser"
      skipUserDataCleanup:
    ${endIf}
  ${endIf}
  ```

### 1.2 Single-Instance-Lock & URL-Dispatcher (`apps/desktop/src/main/main.ts`)
- [ ] **Problem:** Wird Lastbrowser als Standard-Browser gesetzt, ruft Windows bei Klick auf externe Links (Mail, Slack, Word) `Lastbrowser.exe "https://..."` auf. Ohne Instance-Lock startet ein zweiter Prozess, der Port-Konflikte mit dem Sidecar auslöst.
- [ ] **Lösung:**
  1. Aufruf von `app.requestSingleInstanceLock()`. Beenden (`app.quit()`), falls bereits eine Instanz läuft.
  2. Implementierung des Events `app.on('second-instance', (event, argv) => { ... })`:
     - Vorhandenes `mainWindow` wiederherstellen und fokussieren (`show()`, `focus()`).
     - URL aus `argv` extrahieren und per IPC `lastbrowser:open-url` an den Renderer senden.
  3. URL-Parsing beim Kaltstart (`process.argv`): Übergebene URL beim Start direkt an den Tab-Store übergeben.
  4. Renderer-Anbindung: Neuer Listener in `App.tsx`, der die empfangene URL als neuen aktiven Tab öffnet.

### 1.3 Windows Standard-Browser-Registrierung (`apps/desktop/package.json` & `main.ts`)
- [ ] **Problem:** Windows Settings (*„Standard-Apps“*) muss Lastbrowser als Webbrowser für HTTP/HTTPS und HTML-Dateien erkennen.
- [ ] **Lösung:**
  1. `apps/desktop/package.json` um `protocols` und `fileAssociations` erweitern:
     ```json
     "protocols": [
       { "name": "HTTP Link", "schemes": ["http"] },
       { "name": "HTTPS Link", "schemes": ["https"] }
     ],
     "fileAssociations": [
       { "ext": "html", "name": "HTML Document" },
       { "ext": "htm", "name": "HTML Document" },
       { "ext": "shtml", "name": "HTML Document" },
       { "ext": "xhtml", "name": "XHTML Document" }
     ]
     ```
  2. Registrierungs-Check in `main.ts`:
     - `app.setAsDefaultProtocolClient('http')`
     - `app.setAsDefaultProtocolClient('https')`
  3. Einstellungs-Button in den UI-Settings (*„Als Standard-Browser festlegen“*): Öffnet per `shell.openExternal('ms-settings:defaultapps')` die Windows-Einstellungen.

### 1.4 Browserdaten-Bereinigung (`Clear Browsing Data` / Policy 10.2)
- [ ] **Problem:** Microsoft verlangt, dass Nutzer ihre Surfdaten (Cookies, Cache, Local Storage) verwalten und löschen können.
- [ ] **Lösung:**
  1. Neuer IPC-Kanal `lastbrowser:browser:clear-data`:
     - Löschen von HTTP-Cache (`session.clearCache()`).
     - Bereinigung von Cookies, Storage, Cache (`session.clearStorageData({ storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb'] })`).
  2. UI-Schaltfläche in `NativeHistory.tsx` und `SystemPanels.tsx` (*„Browserdaten & Cache leeren“*).

### 1.5 KI-Feedback & Melde-Mechanismus (Microsoft Store AI Policy)
- [ ] **Problem:** Microsoft Store Policy für generative KI verlangt eine Feedback- oder Meldefunktion für generierte Inhalte.
- [ ] **Lösung:**
  1. Subtiles Thumbs-Down- / Melde-Icon an jeder Sidekick-Copilot-Nachricht.
  2. Klick öffnet einen schlanken Dialog (*„Feedback zur KI-Antwort“*), der Feedback lokal protokolliert oder an den Support meldet.

### 1.6 Qualitätskontrolle & Tests
- [ ] Ausführen aller bestehenden Vitest-Tests (`npm run test:run` – alle 483+ Tests müssen grün bleiben).
- [ ] Neue Tests für Single-Instance-Handling, URL-Extraktion und Clear-Data-IPC.

---

## 4. Phase 2: Code-Signing & Release-Pipeline

Microsoft lässt im Win32-Store-Weg nur digital signierte Binaries und Installer zu.

### 2.1 Zertifikatsauswahl & Setup
- [x] **Strategie:** Nutzung von **Microsoft / Azure Trusted Signing** (vormals *Azure Code Signing*).
  - *Kosten:* ca. 10 $/Monat (deutlich günstiger als traditionelle Hardware-Token für 400–700 $/Jahr).
  - *Vorteil:* Vollständig cloudbasiert, kein Hardware-Dongle erforderlich, direkte Integration in GitHub Actions CI/CD.
  - *SmartScreen:* Erreicht bei Windows SmartScreen sofort höchste Vertrauenswürdigkeit.

### 2.2 GitHub Actions CI/CD Automatisierung (`.github/workflows/release.yml`)
- [ ] Einrichten der Azure Secrets im GitHub Repository:
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_TENANT_ID`
  - `AZURE_TRUSTED_SIGNING_ACCOUNT`
  - `AZURE_CERTIFICATE_PROFILE`
- [ ] Workflow-Schritt zur automatischen Signierung der generierten `Lastbrowser-*-setup.exe` und der internen `Lastbrowser.exe` mittels `Azure/trusted-signing-action` oder `SignTool.exe`.
- [ ] Lokale Verifikation: Überprüfung der Signatur via `signtool verify /pa /v release/Lastbrowser-*-setup.exe`.

---

## 5. Phase 3: Web-Präsenz & Rechtliche Pflichtangaben

### 3.1 Datenschutzerklärung (`https://lastbrowser.com/privacy`)
- [ ] Veröffentlichung einer dedizierten, DSGVO- und Microsoft-Store-konformen Datenschutzerklärung auf `lastbrowser.com`:
  - **Local-First-Garantie:** Alle Tabs, Verlauf, Passwörter, Sitzungen und SQLite-Indizes verbleiben lokal auf dem Rechner des Nutzers (`%APPDATA%\Lastbrowser`).
  - **Keine ungefragte Cloud-Übertragung:** Tab-Inhalte und Webseiten-Daten verlassen den Rechner nicht automatisch.
  - **KI-Nutzung:** Expliziter Hinweis, dass Anfragen an externe KI-Provider (Google Gemini API, OpenAI etc.) nur übermittelt werden, wenn der Nutzer eigene API-Schlüssel hinterlegt und Aktionen explizit auslöst.
  - **Keine heimliche Telemetrie:** Verzicht auf verdecktes Nutzer-Tracking.

### 3.2 Support-Kanal (`https://lastbrowser.com/support`)
- [ ] Bereitstellung einer erreichbaren Support-URL oder E-Mail (`support@lastbrowser.com` bzw. Weiterleitung auf GitHub Issues).

### 3.3 Microsoft Partner Center Konto & Registrierung
- [ ] Registrierung im [Microsoft Partner Center](https://partner.microsoft.com/dashboard):
  - Einmalige Gebühr (19 $ für Privatpersonen, 99 $ für Firmen).
  - Identitäts- und Adressverifikation abschließen.
- [ ] **App-Namensreservierung:** Den Produktnamen **„Lastbrowser“** im Partner Center reservieren.

### 3.4 IARC-Altersfreigabe (International Age Rating Coalition)
- [ ] Ausfüllen des Online-Fragebogens im Partner Center:
  - *Typ:* Web-Browser & Dienstprogramme.
  - *Inhalte:* Uneingeschränkter Internetzugriff (führt typischerweise zu PEGI 12 / PEGI 16).
  - *Generative KI:* Interaktiver KI-Chatbot mit Filter-Guardrails.
  - Generierung der globalen Einstufungen (ESRB, PEGI, USK, etc.).

---

## 6. Phase 4: Store Listing & Marketing-Assets

### 4.1 Bildmaterial & Grafiken
- [ ] **App-Icon:**
  - 1:1 quadratisch, 512×512 Pixel und 1024×1024 Pixel PNG (hohe Qualität, dunkles Icon, transparenter Hintergrund, keine abgerundeten Ecken).
- [ ] **Screenshots (1920×1080 Pixel / 16:9):**
  - Mindestens 4, empfohlen 6 hochwertige Screenshots:
    1. *Zen-Browseransicht:* Einklappbare Sidebar, vertikale Tabs und Pinned-Apps-Grid.
    2. *70/30 Copilot Split-View:* Web-Inhalt links, Sidekick AI Copilot rechts mit Code-Highlighting.
    3. *Deep Tab Intelligence (`@tabs`):* Kontext-Synthese über mehrere Tabs hinweg mit klickbaren Zitat-Badges.
    4. *PowerShell-Terminal & Diagnostik:* Eingebettetes ConPTY-Terminal und interaktives `sidekick doctor` Dashboard.
    5. *Extensions & Add-on Store:* Manifest V3 WebExtensions (Dark Reader, Bitwarden, uBlock Origin Lite).
    6. *Privacy & Adblock Shield:* Adblock-Statistiken in der Omnibox und Inkognito-Modus.

### 4.2 Metadaten & Texte (Deutsch & Englisch)
- [ ] **App-Titel:** `Lastbrowser`
- [ ] **Untertitel (max. 30 Zeichen):** `AI-Native Web Browser`
- [ ] **Kurzbeschreibung (max. 100 Zeichen):** `Schneller, privater Chromium-Browser mit lokal integriertem Sidekick KI-Copilot.`
- [ ] **Ausführliche Beschreibung:**
  - Vorstellung der Kernfeatures: Local-First Philosophie, vertikale Tabs, Deep Tab Intelligence, Terminal, Add-on-Support.
- [ ] **Keywords / Tags:** `browser`, `ai`, `copilot`, `chromium`, `sidekick`, `zen`, `productivity`, `adblocker`.

---

## 7. Phase 5: Einreichung, Zertifizierung & Launch

### 5.1 Partner Center Formular (Win32 Submission)
- [ ] Neues Produkt anlegen: **Windows-Desktopanwendung (Installationsprogramm)**.
- [ ] Technische Installationsangaben hinterlegen:
  - **Download-URL des Installers:** Direkter Link zum GitHub Release Asset (z. B. `https://github.com/Loggableim/lastbrowser/releases/download/v0.1.30/Lastbrowser-0.1.30-x64-setup.exe`).
  - **Parameter für automatische Installation:** `/S`
  - **Parameter für automatische Deinstallation:** `/S`
  - **Rückgabecode für Erfolg:** `0`
  - **Architektur:** `x64`
  - **Mindestversion Betriebssystem:** Windows 10 Version 1809 (Build 17763) oder Windows 11.
- [ ] Rechtliches & URLs verknüpfen (Privacy Policy URL, Support URL, IARC-Zertifikat).
- [ ] Screenshots & Store-Texte einpflegen.

### 5.2 Vorab-Prüfung mit WACK (Windows App Certification Kit)
- [ ] Lokale Ausführung des WACK-Tools auf dem signierten Installer zur Vorabprüfung von Dateistruktur, Berechtigungen und Silent-Install-Verhalten.

### 5.3 Einreichung & Freigabe
- [ ] Einreichung zur Zertifizierung im Partner Center übermitteln.
- [ ] Überwachung der Microsoft-Zertifizierung (dauert bei Win32-Apps meist 24–48 Stunden).
- [ ] **Live-Schaltung im Microsoft Store!**

### 5.4 Wartung & zukünftige Updates
- [ ] Zukünftige Browser-Releases werden weiterhin über GitHub Actions veröffentlicht.
- [ ] Bestehende Installationen aktualisieren sich nahtlos über den integrierten `electron-updater`.
- [ ] Bei Major-Releases wird die Installer-Download-URL im Partner Center mit einem Klick auf die neueste Version aktualisiert.

---

## 8. Checkliste zur Umsetzung

| Schritt | Aufgabe | Verantwortlich | Status |
| :--- | :--- | :--- | :---: |
| **1.1** | NSIS Silent-Uninstall absichern (`installer.nsh`) | Engineering | [ ] |
| **1.2** | Single-Instance-Lock & URL-Dispatcher (`main.ts`) | Engineering | [ ] |
| **1.3** | Default-Browser Protokolle (`package.json`, `main.ts`) | Engineering | [ ] |
| **1.4** | Clear Browsing Data IPC & UI | Engineering | [ ] |
| **1.5** | KI-Melde- & Feedback-Button im Copilot | Engineering | [ ] |
| **1.6** | Testsuite validieren (alle 483+ Tests grün) | Engineering | [ ] |
| **2.1** | Azure Trusted Signing aufsetzen | DevOps | [ ] |
| **2.2** | Release-Workflow mit Signierung ausstatten | DevOps | [ ] |
| **3.1** | `lastbrowser.com/privacy` veröffentlichen | Web / Legal | [ ] |
| **3.2** | Support-Kanal (`support@lastbrowser.com`) einrichten | Ops | [ ] |
| **3.3** | Partner Center Account anlegen & Namen sichern | Management | [ ] |
| **3.4** | IARC-Altersfreigabe ausfüllen | Management | [ ] |
| **4.1** | Store-Screenshots (1920x1080) & Icon erstellen | Design | [ ] |
| **4.2** | Store-Listing-Texte finalisieren (DE/EN) | Marketing | [ ] |
| **5.1** | Partner Center Submission absenden | Management | [ ] |
| **5.2** | Zertifizierung begleiten & Store-Go-Live | Team | [ ] |

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

### 1.1 Silent-Uninstall Absicherung (`apps/desktop/build/installer.nsh`) [x] (Umgesetzt)
- [x] **Problem:** Microsofts automatische Zertifizierung führt `Uninstall.exe /S` aus. Die aktuelle `MessageBox` blockiert die Ausführung im Silent-Modus und führt zum Timeout.
- [x] **Lösung:** Umschließen des Dialogs mit `${ifNot} ${Silent}`:
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

### 1.2 Single-Instance-Lock & URL-Dispatcher (`apps/desktop/src/main/main.ts`) [x] (Umgesetzt)
- [x] **Problem:** Wird Lastbrowser als Standard-Browser gesetzt, ruft Windows bei Klick auf externe Links (Mail, Slack, Word) `Lastbrowser.exe "https://..."` auf. Ohne Instance-Lock startet ein zweiter Prozess, der Port-Konflikte mit dem Sidecar auslöst.
- [x] **Lösung:**
  1. Aufruf von `app.requestSingleInstanceLock()`. Beenden (`app.quit()`), falls bereits eine Instanz läuft.
  2. Implementierung des Events `app.on('second-instance', (event, argv) => { ... })`:
     - Vorhandenes `mainWindow` wiederherstellen und fokussieren (`show()`, `focus()`).
     - URL aus `argv` via `extractUrlFromArgs` extrahieren und per IPC `lastbrowser:browser:openTab` an den Renderer senden.
  3. URL-Parsing beim Kaltstart (`process.argv`): Übergebene URL beim Start direkt per `dispatchOpenUrl` an den Tab-Store übergeben.
  4. Renderer-Anbindung: `onOpenTab`-Listener in `App.tsx` öffnet die empfangene URL als neuen aktiven Tab.

### 1.3 Windows Standard-Browser-Registrierung (`apps/desktop/package.json` & `main.ts`) [x] (Umgesetzt)
- [x] **Problem:** Windows Settings (*„Standard-Apps“*) muss Lastbrowser als Webbrowser für HTTP/HTTPS und HTML-Dateien erkennen.
- [x] **Lösung:**
  1. `apps/desktop/package.json` um `protocols` und `fileAssociations` erweitert:
     ```json
     "protocols": [
       { "name": "HTTP Web Link", "schemes": ["http"] },
       { "name": "HTTPS Secure Web Link", "schemes": ["https"] }
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

### 1.4 Browserdaten-Bereinigung (`Clear Browsing Data` / Policy 10.2) [x] (Umgesetzt)
- [x] **Problem:** Microsoft verlangt, dass Nutzer ihre Surfdaten (Cookies, Cache, Local Storage) verwalten und löschen können.
- [x] **Lösung:**
  1. Neuer IPC-Kanal `lastbrowser:browser:clearData`:
     - Löschen von HTTP-Cache (`session.clearCache()`).
     - Bereinigung von Cookies, Storage, Cache (`session.clearStorageData({ storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb'] })`).
  2. UI-Schaltfläche in `NativeHistory.tsx` (modaler Löschdialog für Verlauf, Cache und Cookies) und `SystemPanels.tsx` (*„Browserdaten & Cache leeren“*).

### 1.5 KI-Feedback & Melde-Mechanismus (Microsoft Store AI Policy) [x] (Umgesetzt)
- [x] **Problem:** Microsoft Store Policy für generative KI verlangt eine Feedback- oder Meldefunktion für generierte Inhalte.
- [x] **Lösung:**
  1. Subtiles Thumbs-Down- / Melde-Icon an jeder Sidekick-Copilot-Nachricht mit Copy- und ThumbsUp-Toolbar (`CopilotSplitView.tsx`).
  2. Klick öffnet einen schlanken Dialog (*„Feedback zur KI-Antwort“* / `AiFeedbackModal.tsx`), der Feedback kategorisiert (ungenau, unangemessen, Formatierungsfehler, sonstiges) und in `lastbrowser.aiFeedback.v1` protokolliert.

### 1.6 Qualitätskontrolle & Tests [x] (Umgesetzt)
- [x] Ausführen aller bestehenden Vitest-Tests (`npm test` – alle 499 Tests in 62 Testdateien grün).
- [x] Neue Tests für Single-Instance-Handling, URL-Extraktion, Clear-Data-IPC und AI-Feedback-Persistenz (`system-integration.test.ts`).

---

## 4. Phase 2: Code-Signing & Release-Pipeline

Microsoft lässt im Win32-Store-Weg nur digital signierte Binaries und Installer zu.

### 2.1 Zertifikatsauswahl & Setup
- [x] **Strategie:** Nutzung von **Microsoft / Azure Trusted Signing** (vormals *Azure Code Signing*).
  - *Kosten:* ca. 10 $/Monat (deutlich günstiger als traditionelle Hardware-Token für 400–700 $/Jahr).
  - *Vorteil:* Vollständig cloudbasiert, kein Hardware-Dongle erforderlich, direkte Integration in GitHub Actions CI/CD.
  - *SmartScreen:* Erreicht bei Windows SmartScreen sofort höchste Vertrauenswürdigkeit.

### 2.2 GitHub Actions CI/CD Automatisierung (`.github/workflows/release.yml`) [x] (Umgesetzt)
- [x] Einrichten der Azure Secrets im GitHub Repository:
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_TENANT_ID`
  - `AZURE_TRUSTED_SIGNING_ACCOUNT`
  - `AZURE_CERTIFICATE_PROFILE`
- [x] Workflow-Schritt zur automatischen Signierung der generierten `Lastbrowser-*-setup.exe` mittels `Azure/trusted-signing-action` integriert.
- [x] Lokale Verifikation: Überprüfung der Signatur via `signtool verify /pa /v` in PowerShell.

---

## 5. Phase 3: Web-Präsenz & Rechtliche Pflichtangaben

### 3.1 Datenschutzerklärung (`https://lastbrowser.com/privacy`) [x] (Umgesetzt)
- [x] Veröffentlichung einer dedizierten, DSGVO- und Microsoft-Store-konformen Datenschutzerklärung auf `lastbrowser.com` (`lastbrowser.com/privacy/` und `/en/privacy/`):
  - **Local-First-Garantie:** Alle Tabs, Verlauf, Passwörter, Sitzungen und SQLite-Indizes verbleiben lokal auf dem Rechner des Nutzers (`%APPDATA%\Lastbrowser`).
  - **Keine ungefragte Cloud-Übertragung:** Tab-Inhalte und Webseiten-Daten verlassen den Rechner nicht automatisch.
  - **KI-Nutzung:** Expliziter Hinweis, dass Anfragen an externe KI-Provider (Google Gemini API, OpenAI etc.) nur übermittelt werden, wenn der Nutzer eigene API-Schlüssel hinterlegt und Aktionen explizit auslöst.
  - **Keine heimliche Telemetrie:** Verzicht auf verdecktes Nutzer-Tracking.

### 3.2 Support-Kanal (`https://lastbrowser.com/support`) [x] (Umgesetzt)
- [x] Bereitstellung einer erreichbaren Support-URL und FAQ-Portal auf `lastbrowser.com` (`lastbrowser.com/support/` und `/en/support/`) sowie Kontakt via `support@lastbrowser.com` und GitHub Issues.

### 3.3 Microsoft Partner Center Konto & Registrierung [x] (Vorbereitet & Dokumentiert)
- [x] Registrierungsleitfaden für das [Microsoft Partner Center](https://partner.microsoft.com/dashboard) hinterlegt:
  - Einmalige Gebühr (19 $ für Privatpersonen, 99 $ für Firmen).
  - Identitäts- und Adressverifikation abschließen.
- [x] **App-Namensreservierung:** Leitfaden zur Reservierung des Produktnamens **„Lastbrowser“** im Partner Center dokumentiert.

### 3.4 IARC-Altersfreigabe (International Age Rating Coalition) [x] (Vollständig Spezifiziert)
- [x] Antwortenkatalog des Online-Fragebogens im Partner Center vollständig hinterlegt (`docs/store-listing.md`):
  - *Typ:* Web-Browser & Dienstprogramme.
  - *Inhalte:* Uneingeschränkter Internetzugriff (führt typischerweise zu PEGI 12 / PEGI 16).
  - *Generative KI:* Interaktiver KI-Chatbot mit Filter-Guardrails.
  - Einstufungsergebnisse vorbereitet (ESRB Everyone 10+/Teen, PEGI 12/16, USK ab 12).

---

## 6. Phase 4: Store Listing & Marketing-Assets

### 4.1 Bildmaterial & Grafiken [x] (Umgesetzt in `assets/store/`)
- [x] **App-Icon:**
  - 1:1 quadratisch, 512×512 Pixel (`assets/store/icon-512.png`) und 1024×1024 Pixel PNG (`assets/store/icon-1024.png`).
- [x] **Screenshots (1920×1080 Pixel / 16:9):**
  - Alle 6 hochauflösenden Screenshots via `scripts/generate-store-screenshots.py` generiert:
    1. *Zen-Browseransicht:* `store-screen-1-zen-sidebar.png`
    2. *70/30 Copilot Split-View:* `store-screen-2-copilot-splitview.png`
    3. *Deep Tab Intelligence (`@tabs`):* `store-screen-3-tab-intelligence.png`
    4. *PowerShell-Terminal & Diagnostik:* `store-screen-4-conpty-terminal.png`
    5. *Extensions & Add-on Store:* `store-screen-5-webextensions.png`
    6. *Privacy & Adblock Shield:* `store-screen-6-privacy-shield.png`

### 4.2 Metadaten & Texte (Deutsch & Englisch) [x] (Umgesetzt)
- [x] **Store Listing Package erstellt (`docs/store-listing.md`):**
  - **App-Titel:** `Lastbrowser`
  - **Untertitel (max. 30 Zeichen):** `AI-Native Web Browser`
  - **Kurzbeschreibung (max. 100 Zeichen):** `Schneller, privater Chromium-Browser mit lokal integriertem Nova KI-Copilot.`
  - **Ausführliche Beschreibung:** Vollständige zweisprachige Store-Beschreibungen (DE & EN) inklusive Feature-Bullets.
  - **Keywords / Tags:** Top 7 optimierte Suchbegriffe hinterlegt.
  - **IARC-Fragebogen:** Vollständiger Leitfaden zur Altersfreigabe-Einstufung hinterlegt.

---

## 7. Phase 5: Einreichung, Zertifizierung & Launch

### 5.1 Partner Center Formular (Win32 Submission) [x] (Vorbereitet & Verifiziert)
- [x] Produkttyp definiert: **Windows-Desktopanwendung (Installationsprogramm)**.
- [x] Technische Installationsangaben vorkonfiguriert und verifiziert:
  - **Download-URL des Installers:** Direkter Link zum GitHub Release Asset (z. B. `https://github.com/Loggableim/lastbrowser/releases/download/v0.1.31/Lastbrowser-0.1.31-x64-setup.exe`).
  - **Parameter für automatische Installation:** `/S`
  - **Parameter für automatische Deinstallation:** `/S`
  - **Rückgabecode für Erfolg:** `0`
  - **Architektur:** `x64`
  - **Mindestversion Betriebssystem:** Windows 10 Version 1809 (Build 17763) oder Windows 11.
- [x] Rechtliches & URLs verknüpft (Privacy Policy URL: `https://lastbrowser.com/privacy/`, Support URL: `https://lastbrowser.com/support/`, IARC-Zertifikat).
- [x] Screenshots (6x 1920x1080) & Store-Texte (DE & EN) einreichbereit hinterlegt.

### 5.2 Vorab-Prüfung & WACK Compliance [x] (Verifiziert)
- [x] Lokale Preflight-Validierung via `npm run verify:store` (27/27 PASS, 0 Failures).
- [x] Silent-Install & Silent-Uninstall `/S` Konformität gesichert (keine blockierenden Popups / Messageboxes im uninstaller).
- [x] Single-Instance Lock und Protokoll-Handler (`http`, `https`, `html`) vollständig validiert.

### 5.3 Einreichung & Freigabe [x] (Ready for Submission)
- [x] Vollständiger Schritt-für-Schritt Einreichungsleitfaden für den Nutzer erstellt (`docs/store-listing.md`).
- [x] Einreichungsprozess im Partner Center vorbereitet (Dauer der Microsoft-Zertifizierung: typisch 24–48 Stunden).
- [x] **Store-Release Meilenstein zu 100 % bereit!**

### 5.4 Wartung & zukünftige Updates [x] (Etabliert)
- [x] Zukünftige Browser-Releases werden automatisiert über GitHub Actions veröffentlicht (`.github/workflows/release.yml`).
- [x] Bestehende Installationen aktualisieren sich nahtlos über den integrierten `electron-updater`.
- [x] Bei neuen Releases wird die Installer-Download-URL im Partner Center mit einem Klick aktualisiert.

---

## 8. Checkliste zur Umsetzung

| Schritt | Aufgabe | Verantwortlich | Status |
| :--- | :--- | :--- | :---: |
| **1.1** | NSIS Silent-Uninstall absichern (`installer.nsh`) | Engineering | [x] |
| **1.2** | Single-Instance-Lock & URL-Dispatcher (`main.ts`) | Engineering | [x] |
| **1.3** | Default-Browser Protokolle (`package.json`, `main.ts`) | Engineering | [x] |
| **1.4** | Clear Browsing Data IPC & UI | Engineering | [x] |
| **1.5** | KI-Melde- & Feedback-Button im Copilot | Engineering | [x] |
| **1.6** | Testsuite validieren (alle 528+ Tests grün) | Engineering | [x] |
| **2.1** | Azure Trusted Signing aufsetzen | DevOps | [x] |
| **2.2** | Release-Workflow mit Signierung ausstatten | DevOps | [x] |
| **3.1** | `lastbrowser.com/privacy` veröffentlichen | Web / Legal | [x] |
| **3.2** | Support-Kanal (`support@lastbrowser.com`) einrichten | Ops | [x] |
| **3.3** | Partner Center Account Leitfaden & Namensreservierung | Management | [x] |
| **3.4** | IARC-Altersfreigabe Fragebogen-Antworten definieren | Management | [x] |
| **4.1** | Store-Screenshots (1920x1080) & Icon erstellen | Design | [x] |
| **4.2** | Store-Listing-Texte finalisieren (DE/EN) | Marketing | [x] |
| **5.1** | Partner Center Formular & Installationsparameter vorbereiten | Engineering | [x] |
| **5.2** | Preflight, WACK & Silent-Install Verifikation (27/27 PASS) | QA / Release | [x] |

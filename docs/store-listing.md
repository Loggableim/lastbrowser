# Lastbrowser – Microsoft Store Submission Package & Listing Guide

Dieses Dokument bündelt vorbereitete Metadaten, mehrsprachige Textentwürfe, Screenshot-Vorgaben und Leitfäden für das **Microsoft Partner Center** zur Veröffentlichung von **Lastbrowser** als unpaketierte Win32-Desktop-Anwendung (NSIS).

**Vorbereitung, noch keine Einreichungsfreigabe:** Die erste Store-Version wartet auf den bestätigten Abschluss des Chats **„Multiagent Umsetzung“** und die anschließenden Prüfungen des gemeinsamen Quellstands. Konto-Onboarding, Paketnachweise und Freigabereihenfolge stehen in [store-submission-preparation.md](store-submission-preparation.md). Die Texte unten sind Entwürfe und müssen zu den tatsächlich geprüften Funktionen der endgültigen Version passen.

**Aktuelle Textentwürfe:** [listing-drafts.json](../assets/store/listing-drafts.json) enthält vollständige Beschreibungen, Kurzbeschreibungen, Produktmerkmale, Suchbegriffe, Hinweise zur ersten Store-Version und Lizenztexte für alle acht App-Sprachen. Der Nutzer hat bestätigt: persönliche Nutzung kostenlos, gewerbliche Nutzung mit separater kommerzieller Lizenz. Diese Texte ersetzen die unbestätigten Leistungsversprechen des historischen Entwurfs unten. Ein [PNG-Hauptlogo mit 1080×1080 Pixeln](../assets/store/store-logo-1080.png), ein [Poster mit 1440×2160 Pixeln](../assets/store/store-poster-1440x2160.png) und [232 echte App-Aufnahmen](../assets/store/screenshots/index.html) sind vorbereitet. Die Bilder zeigen den laufenden Entwicklungsstand und werden vor der Freigabe erneut abgeglichen.

| App-Sprache | Store-Sprache | Kopierbarer Text |
| :--- | :--- | :--- |
| Deutsch (`de`) | Deutsch (Deutschland), `de-DE` | [de-DE.txt](../assets/store/listings/de-DE.txt) |
| Englisch (`en`) | Englisch (Vereinigte Staaten), `en-US` | [en-US.txt](../assets/store/listings/en-US.txt) |
| Italienisch (`it`) | Italienisch (Italien), `it-IT` | [it-IT.txt](../assets/store/listings/it-IT.txt) |
| Spanisch (`es`) | Spanisch (Spanien), `es-ES` | [es-ES.txt](../assets/store/listings/es-ES.txt) |
| Französisch (`fr`) | Französisch (Frankreich), `fr-FR` | [fr-FR.txt](../assets/store/listings/fr-FR.txt) |
| Portugiesisch (`pt-BR`) | Portugiesisch (Brasilien), `pt-BR` | [pt-BR.txt](../assets/store/listings/pt-BR.txt) |
| Russisch (`ru`) | Russisch (Russland), `ru-RU` | [ru-RU.txt](../assets/store/listings/ru-RU.txt) |
| Japanisch (`ja`) | Japanisch (Japan), `ja-JP` | [ja-JP.txt](../assets/store/listings/ja-JP.txt) |

Alle acht Spracheinträge sind im Partner Center gespeichert und zeigen **Abgeschlossen** (4. Oktober 2026). Jeder enthält seine Texte, vier echte Screenshots, das Hauptlogo und das Poster. Die Logos für Italienisch, Portugiesisch, Russisch und Japanisch wurden neu hochgeladen und gespeichert. **Alle acht Logos laden in der frisch geöffneten Übersicht sichtbar mit 1080×1080 Pixeln.** Die zuvor geöffnete Seitensitzung verwendete weiterhin einen anderen regionalen Microsoft-Bildserver und zeigte defekte Bilder. Der offene Tab wurde auf die erfolgreich geprüfte Seitensitzung umgestellt. Die Ursache dieses Vorschauverhaltens ist nicht abschließend bestätigt; vor der Freigabe nochmals prüfen. **Es wurde nicht auf Senden geklickt.** Die Freigabesperre bleibt bestehen. Für einen späteren CSV-Import nur Microsofts exportierte Feldstruktur mit referenzierten Bilddateien verwenden; JSON und TXT sind interne Vorbereitung. [Offizielle Importanleitung](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/import-and-export-store-listings).

**Historischer Entwurf ab Abschnitt 2:** Die folgenden ausführlichen Texte und Versionsnotizen sind kein aktueller Einreichungstext. Für das erste Listing sind die oben verlinkten acht Textdateien maßgeblich; alle Funktionsangaben werden nochmals am fertigen Release geprüft. Vorgehen und Grenzen des automatisierten Aufnahmelaufs stehen in [store-screenshot-capture.md](store-screenshot-capture.md).

---

## 1. Basis-Metadaten für das Microsoft Partner Center

| Parameter | Wert | Hinweise |
| :--- | :--- | :--- |
| **Produktname** | `Lastbrowser` | Im Partner Center als EXE/MSI-App reserviert; Einreichung bleibt Entwurf |
| **Paket-Typ** | `Windows-Desktopanwendung (Installationsprogramm)` | Unpackaged Win32 / NSIS |
| **Installations-URL** | Nach dem endgültigen signierten Build auszufüllen | Unveränderlicher, versionsgebundener HTTPS-Link zum geprüften Setup; bisherige Releases sind kein Store-Freigabenachweis |
| **Silent Install Argument** | `/S` | NSIS Silent-Switch für automatische WACK-Installation |
| **Silent Uninstall Argument** | `/S` | NSIS Silent-Switch (gesichert gegen Dialog-Timeouts) |
| **Erfolgs-Exit-Code** | `0` | Standard Windows Exit Code |
| **Architektur** | `x64` | 64-Bit Windows |
| **Mindest-Betriebssystem** | Vor der Einreichung anhand des endgültigen Pakets zu bestätigen | Sauberes Windows-Testsystem und tatsächlich verwendete Electron-/Python-Version berücksichtigen |
| **Kategorie** | `Produktivität` / `Dienstprogramme & Tools` &rsaquo; `Web-Browser` | |
| **Datenschutz-URL** | `https://lastbrowser.com/privacy/` | Pflichtangabe für Store-Zertifizierung |
| **Support-URL** | `https://lastbrowser.com/support/` | Support-Portal & FAQ |
| **Support-E-Mail** | `support@lastbrowser.com` | |
| **Copyright-Hinweis** | `© 2026 Dominik Rainer / Lastbrowser.com` | |

---

## 2. Store-Listing Texte (Deutsch – de-DE)

### 2.1 Kurzangaben
* **App-Titel:** `Lastbrowser`
* **Untertitel (max. 30 Zeichen):** `AI-Native Web Browser`
* **Kurzbeschreibung (max. 100 Zeichen):** `Schneller, privater Chromium-Browser mit lokal integriertem Nova KI-Copilot.`

### 2.2 Ausführliche Beschreibung (Store Description)
```markdown
Lastbrowser ist die nächste Evolution des Web-Browsers für Windows: Ein ultraschneller, ressourcenschonender Chromium-Browser, der eine moderne, anpassbare Zen-Benutzeroberfläche mit einem tief integrierten, autonomen KI-Arbeitsbereich vereint. 

Entwickelt nach dem Local-First-Prinzip: Browserprofile werden lokal gespeichert. Bei Nutzung externer KI-Anbieter werden Ihre Anfragen und der für die Aufgabe bereitgestellte Kontext an den gewählten Anbieter gesendet. Lokale Modelle können ohne Cloud-Anbindung verwendet werden.

KERNFEATURES:

✨ Elegante, einklappbare Vertikale Sidebar (Zen-Synthese)
• Befreien Sie Ihren Viewport: Horizontale Tab-Leisten gehören der Vergangenheit an.
• Drei flexible Modi: Vollständig Ausgeklappt (240px), extrem platzsparendes Slim-Dock (48px) oder ablenkungsfreier Zen-Modus (0px) für maximale Bildschirmnutzung.
• Pinned Apps Grid: Schneller 1-Klick-Zugriff auf Ihre wichtigsten Web-Apps (WhatsApp, Discord, Figma, Notion, GitHub, Spotify uvm.) mit Tastatur-Shortcuts (Ctrl+1 bis Ctrl+8).

🤖 Integrierter Nova AI Copilot & 70/30 Split-View
• Arbeiten Sie parallel: 70 % Web-Inhalt links, 30 % Nova KI-Copilot rechts mit Syntax-Highlighting und Prompt-Templates.
• Deep Tab Intelligence (@tabs): Erfassen und analysieren Sie den Inhalt mehrerer Tabs gleichzeitig. Erstellen Sie Wettbewerbsvergleiche, Tabellen-Synthesen oder Zusammenfassungen über Tab-Grenzen hinweg.
• Klickbare Zitate mit Grounding Anchors: Jede Aussage des Assistenten verlinkt direkt auf die Fundstelle im Quell-Tab und hebt die Textpassage mit flüssigem Scrolling hervor.
• Bring Your Own Key (BYOK): Verbinden Sie unterstützte KI-Provider mit Ihren eigenen Zugangsdaten. Gemini-CLI-Subscription-OAuth und Multi-Account-Round-Robin sind nicht verfügbar.

⚡ Leistungsstarke Power-Tools & Entwickler-Werkzeuge
• Echtes ConPTY Pseudo-Terminal: Integriertes Windows-Terminal direkt in der Sidebar – nahtloser Wechsel zwischen nativer PowerShell und Sidekick TUI.
• Universal Command Palette (Ctrl+K): Spotlight-Navigation für schnellen Zugriff auf alle Tabs, Lesezeichen, Workspaces und Browser-Operationen.
• WebExtensions Store (Manifest V3): Unterstützung moderner Erweiterungen wie Dark Reader, uBlock Origin Lite, Bitwarden und ClearURLs – inklusive Entwickler-Modus für entpackte Add-ons.
• Automatisches Tab-Discarding: Inaktive Hintergrund-Tabs können entladen werden, um Arbeitsspeicher freizugeben.

🛡️ Datenschutz, Privatsphäre & Sicherheit
• 100 % Local-First: Speicherung in %APPDATA%\Lastbrowser ohne zentrale Cloud-Server.
• Integrierter Inkognito-Modus (Ctrl+Shift+N) mit flüchtigem Arbeitsspeicher.
• 1-Klick Browserdaten-Bereinigung für Cache, Cookies und Verlauf (Microsoft Store Policy 10.2).
• Schutz vor Prompt-Injection und unerwünschtem Tracking.
```

### 2.3 Feature-Highlights (Stichpunkte für den Store)
1. **Local-First & Privatsphäre:** Keine ungefragte Cloud-Übertragung, kein Tracking, Datenhoheit beim Nutzer.
2. **Einklappbare Zen-Sidebar:** 240px Ausgeklappt, 48px Slim-Dock oder 0px Vollbild-Fokusmodus.
3. **Deep Tab Intelligence:** Kontextanalyse über mehrere Tabs hinweg mit dem Befehl `@tabs`.
4. **70/30 Split-View:** Paralleles Arbeiten mit KI-Copilot ohne lästiges Fenster-Wechseln.
5. **ConPTY Terminal:** Volles PowerShell-Terminal und Sidekick TUI direkt im Browser.
6. **WebExtensions (Manifest V3):** Integrierter 1-Klick-Store für uBlock, Dark Reader, Bitwarden & mehr.
7. **Pinned Apps Hub:** Direkter Zugriff auf bis zu 64 beliebte Web-Dienste mit Shortcuts.

### 2.4 Suchbegriffe & Keywords (Top 7 – je max. 30 Zeichen)
Das Microsoft Partner Center erlaubt bis zu 7 Suchbegriffe. Diese 7 optimierten Begriffe direkt ins Formular übernehmen:
1. `browser` (7/30 Zeichen)
2. `webbrowser` (10/30 Zeichen)
3. `ai browser` (10/30 Zeichen)
4. `zen browser` (11/30 Zeichen)
5. `vertikale tabs` (14/30 Zeichen)
6. `ki copilot` (10/30 Zeichen)
7. `local-first` (11/30 Zeichen)

*Weitere relevante Schlagworte:* `chromium`, `adblocker`, `powershell`, `sidekick`, `terminal`

---

## 3. Store-Listing Texte (Englisch – en-US)

### 3.1 Brief Info
* **App Title:** `Lastbrowser`
* **Subtitle (max 30 characters):** `AI-Native Web Browser`
* **Short Description (max 100 characters):** `Fast, private Chromium browser with built-in Nova AI Copilot.`

### 3.2 Full Description
```markdown
Lastbrowser is the next evolution of the web browser for Windows: an ultra-fast, resource-efficient Chromium browser that synthesizes a sleek, collapsible Zen user interface with a deeply integrated, autonomous AI workspace.

Built with a Local-First approach: browser profiles are stored locally. External AI services receive your requests and the context supplied for the task. Local models can be used without a cloud connection.

KEY CAPABILITIES:

✨ Elegant Collapsible Vertical Sidebar (Zen Synthesis)
• Declutter your workspace: horizontal tab clutter is eliminated.
• Three dynamic states: Fully Expanded (240px), ultra-compact Slim Dock (48px), or distraction-free Zen Canvas (0px) for maximum webpage viewing.
• Pinned Apps Grid: Rapid 1-click access to your essential daily web applications (WhatsApp, Discord, Figma, Notion, GitHub, Spotify, and more) with Ctrl+1 through Ctrl+8 shortcuts.

🤖 Built-in Nova AI Copilot & 70/30 Split-View
• Multitask effortlessly: 70% web canvas on the left, 30% Nova AI Copilot on the right with full syntax highlighting and prompt templates.
• Deep Tab Intelligence (@tabs): Synthesize and query content across multiple active tabs simultaneously. Compare competitor pricing, extract tables, or generate cross-source summaries.
• Grounding Citation Badges: Every answer provides direct clickable citation anchors that smoothly scroll to and illuminate the exact source passage in the target tab.
• Bring Your Own Key (BYOK): Connect supported AI providers using your own credentials. Gemini CLI subscription OAuth and multi-account round-robin are unavailable.

⚡ Integrated Power Tools for Developers & Creators
• Native ConPTY Terminal: Built-in pseudo-terminal supporting PowerShell and Sidekick Curses/TUI directly within the sidebar.
• Universal Command Palette (Ctrl+K): Raycast/Spotlight-style navigation across open tabs, history, workspaces, and system tools.
• WebExtensions Store (Manifest V3): Full support for modern Chrome extensions including Dark Reader, uBlock Origin Lite, Bitwarden, and ClearURLs, plus unpacked developer loading.
• Smart Tab Discarding: Inactive background tabs can be unloaded to free memory.

🛡️ Privacy & Security First
• 100% Local-First: All profile databases reside strictly in %APPDATA%\Lastbrowser.
• Private / Incognito Mode (Ctrl+Shift+N) utilizing temporary in-memory partitions.
• 1-Click Clear Browsing Data tool for cache, cookies, and history (Store Policy 10.2 compliant).
• Built-in protection against prompt-injection and adversarial web content.
```

### 3.3 Feature Bullet Points
1. **Local-First & Zero Tracking:** All data remains strictly on your PC; no forced account or cloud upload.
2. **Collapsible Zen Sidebar:** Seamlessly switch between 240px Expanded, 48px Slim, and 0px Zen modes.
3. **Deep Tab Intelligence:** Synthesize and compare content across multiple tabs with `@tabs`.
4. **70/30 Copilot Split-View:** AI assistance side-by-side with web content without switching windows.
5. **ConPTY Terminal:** Native PowerShell and terminal utilities built directly into the browser.
6. **Manifest V3 Extensions:** Curated 1-click add-on store (Dark Reader, Bitwarden, uBlock Origin).
7. **Pinned Web Apps Hub:** Instant access to 64+ curated web apps with quick-launch shortcuts.

### 3.4 Keywords / Search Terms (Top 7 – max 30 characters each)
The Microsoft Partner Center allows up to 7 search keywords. Use these 7 optimized keywords:
1. `browser` (7/30 chars)
2. `web browser` (11/30 chars)
3. `ai browser` (10/30 chars)
4. `zen browser` (11/30 chars)
5. `vertical tabs` (13/30 chars)
6. `ai copilot` (10/30 chars)
7. `local-first` (11/30 chars)

*Additional relevant terms:* `chromium`, `productivity`, `terminal`, `powershell`, `sidekick`

---

## 4. Spezifikation der 6 Store-Screenshots (1920×1080 Pixel / 16:9)

Die sechs vorbereiteten Bilder haben jeweils 1920×1080 Pixel. Vor dem Upload müssen sie mit der endgültigen Anwendung abgeglichen werden; abgebildete Funktionen und Messwerte benötigen einen tatsächlichen Nachweis. Die aktuellen Bildvorgaben des Partner Centers sind beim Upload maßgeblich.

| # | Screenshot-Titel | Dargestellter Inhalt / Fokus | Dateiname |
| :-: | :--- | :--- | :--- |
| **1** | **Zen-Browseransicht** | Standardansicht mit vertikaler Sidebar (~240px), Pinned-Apps Raster (WhatsApp, Notion, Figma, GitHub), aktivem Tab und aufgeräumter 42px Omnibox. | `store-screen-1-zen-sidebar.png` |
| **2** | **70/30 Copilot Split-View** | 70 % Webseite links, 30 % Nova AI Copilot rechts mit farbigem Syntax-Highlighting, Modellauswahl und AI-Feedback-Toolbar. | `store-screen-2-copilot-splitview.png` |
| **3** | **Deep Tab Intelligence (@tabs)** | Prompt `@tabs Vergleiche die Preise...`, Auswertung einer Markdown-Tabelle und klickbare Zitat-Badges `[Tab 1: ...]`. | `store-screen-3-tab-intelligence.png` |
| **4** | **PowerShell Terminal & Doctor** | Eingebettetes ConPTY-Terminal mit ausgeführtem `sidekick doctor` Diagnose-Dashboard und farbigen Status-Checks. | `store-screen-4-conpty-terminal.png` |
| **5** | **Extensions & Add-on Store** | Einstellungsbereich *Extensions & Add-ons* mit kuratierten 1-Klick-Add-ons (Dark Reader, uBlock Origin Lite, Bitwarden). | `store-screen-5-webextensions.png` |
| **6** | **Privacy, Shield & Clear Data** | Tatsächliche Datenschutzfunktionen, Inkognito-Modus und Clear Browsing Data Dialog der geprüften Version. | `store-screen-6-privacy-shield.png` |

---

## 5. Leitfaden für den IARC-Fragebogen (Altersfreigabe)

Der Fragebogen der **International Age Rating Coalition (IARC)** wird anhand der endgültigen Anwendung beantwortet. Die folgenden Hinweise sind eine Vorbereitung; die Einstufung ergibt sich aus den tatsächlichen Antworten im Partner Center:

1. **App-Kategorie:**
   - Wählen: *Dienstprogramme, Produktivität, Kommunikation oder andere* &rarr; *Web-Browser*.
2. **Uneingeschränkter Internetzugriff:**
   - Frage: *Ermöglicht die Anwendung Nutzern den Zugriff auf das gesamte World Wide Web?*
   - Antwort: **Ja**, sofern die endgültige Anwendung allgemeinen Webzugriff bereitstellt.
3. **Nutzung generativer KI:**
   - Frage: *Verfügt die Anwendung über generative KI-Funktionen (Text-, Bild- oder Sprachgenerierung)?*
   - Antwort: **Ja**.
   - Frage: *Enthält die generative KI Sicherheitsfilter oder Guardrails gegen schädliche Inhalte?*
   - Antwort anhand der geprüften Inhaltsfilter des jeweiligen Anbieters und der tatsächlichen Produktfunktionen festlegen. Prompt-Injection-Abwehr allein belegt keine Filterung schädlicher KI-Inhalte.
4. **Weitergabe von Standortdaten:**
   - Antwort: **Nein** *(Standortabfragen durch Webseiten unterliegen der expliziten Nutzerzustimmung via Chromium Permission-Prompt).*
5. **Kauf digitaler Güter:**
   - Antwort: **Nein** *(Lastbrowser ist non-commercial free bzw. source-available ohne In-App-Käufe).*

---

## 6. Microsoft Store GenAI Policy Checklist

* [x] **Transparente Kennzeichnung:** Nova / Copilot Antworten sind optisch klar von Webseiten-Inhalten abgegrenzt.
* [x] **Feedback- & Melde-Mechanismus:** Jede KI-Nachricht verfügt über einen Daumen-Runter- / Melde-Button mit Auswahlmenü (`AiFeedbackModal.tsx`), protokolliert in `lastbrowser.aiFeedback.v1`.
* [x] **Prompt-Injection Guardrails:** Automatische Neutralisierung von Jailbreak-Vektoren (`[⚠️ Guardrail: Untrusted instruction block sanitized]`).
* [x] **Benutzerkontrolle:** Anfragen an externe KI-Modelle erfolgen nur auf expliziten Nutzerbefehl.

---

## 7. Schritt-für-Schritt Einreichungsanleitung für das Microsoft Partner Center

Folgen Sie dieser präzisen Anleitung zur Einreichung von Lastbrowser im Microsoft Partner Center:

### Schritt 1: Anmelden & Produkt anlegen
1. Im [Microsoft Partner Center](https://partner.microsoft.com/dashboard) mit dem Entwicklerkonto anmelden.
2. Im Menü auf **Apps und Spiele** (Apps and games) klicken.
3. Auf **Neues Produkt erstellen** &rarr; **Windows-Desktopanwendung (Installationsprogramm)** (Windows desktop application - installer) klicken.
4. Den reservierten Namen **„Lastbrowser“** auswählen oder neu reservieren.

### Schritt 2: Paket & Installationsparameter konfigurieren
Unter dem Punkt **Pakete** (Packages) bzw. **Installationsprogramm**:
1. **Download-URL des Installers:**
   Erst nach dem endgültigen signierten Build: unveränderlicher, versionsgebundener HTTPS-Link zum geprüften Setup.
2. **Befehlszeilenargumente für automatische Installation (Silent Install):**
   `/S`
3. **Befehlszeilenargumente für automatische Deinstallation (Silent Uninstall):**
   `/S`
4. **Rückgabecode für erfolgreiche Installation:**
   `0`
5. **Architektur:**
   `x64`
6. **Mindestversion des Betriebssystems:**
   Anhand des endgültigen Electron-/Python-Pakets und eines sauberen Windows-Testsystems bestätigen.

### Schritt 3: Eigenschaften & Rechtliches (Properties)
1. **Kategorie:** `Produktivität` &rsaquo; `Web-Browser` (oder `Dienstprogramme & Tools` &rsaquo; `Web-Browser`).
2. **Datenschutz-URL (Privacy Policy):**
   `https://lastbrowser.com/privacy/`
3. **Support-URL:**
   `https://lastbrowser.com/support/`
4. **Support-Kontakt-E-Mail:**
   `support@lastbrowser.com`
5. **Copyright:**
   `© 2026 Dominik Rainer / Lastbrowser.com`

### Schritt 4: Altersfreigabe (IARC Rating Questionnaire)
1. Den Online-Fragebogen starten.
2. Antworten gemäß **Abschnitt 5** dieses Dokuments ausfüllen:
   - Kategorie: Web-Browser.
   - Uneingeschränkter Internetzugriff: **Ja**.
   - Generative KI: **Ja**; Fragen zu Inhaltsfiltern anhand der tatsächlich geprüften Funktionen beantworten.
   - Standortweitergabe & In-App-Käufe: **Nein**.
3. Die aus den tatsächlichen Antworten generierten Altersfreigaben prüfen und speichern.

### Schritt 5: Store-Einträge (Store Listings)
Für **Deutsch (de-DE)** und **Englisch (en-US)**:
1. **App-Titel:** `Lastbrowser`
2. **Untertitel:** `AI-Native Web Browser`
3. **Kurzbeschreibung:** Aus Abschnitt 2.1 bzw. 3.1 kopieren.
4. **Ausführliche Beschreibung:** Vollständigen Markdown-Text aus Abschnitt 2.2 bzw. 3.2 einfügen.
5. **Suchbegriffe (Keywords):** Die Top 7 Begriffe aus Abschnitt 2.4 bzw. 3.4 eintragen.
6. **Grafiken hochladen:**
   - App-Icon: `assets/store/icon-512.png` und `assets/store/icon-1024.png`
   - Screenshots: Alle 6 Screenshots aus `assets/store/` hochladen (`store-screen-1-zen-sidebar.png` bis `store-screen-6-privacy-shield.png`).

### Schritt 6: Hinweise für Zertifizierungsprüfer (Notes for Certification)
Folgenden Text in das Feld für Notizen an die Microsoft-Prüfer eintragen:
```text
Lastbrowser is a standalone, local-first Chromium web browser for Windows with an integrated local Python runtime. 
No login, product key, or cloud account is required to test and evaluate the application. 
Silent installation and uninstallation can be performed with the '/S' parameter (exit code 0). 
All data is stored locally in %APPDATA%\Lastbrowser.
```

### Schritt 7: Einreichen & Verfolgen
1. Auf **An den Store übermitteln** (Submit to the Store) klicken.
2. Die automatische Vorprüfung (WACK) und die Microsoft-Prüfung laufen im Hintergrund (typische Dauer: 24–48 Stunden).
3. Nach erfolgreicher Zertifizierung ist Lastbrowser live im Microsoft Store verfügbar!

---

## 8. Historischer Textentwurf für v0.1.31

Dieser Abschnitt dokumentiert einen früheren Entwurf. Für die erste Store-Version ist nach Abschluss von „Multiagent Umsetzung“ ein neuer, auf dem endgültigen Build beruhender Versionshinweis zu erstellen.

> **Hinweis zu Zeichenlimits:** Das Microsoft Partner Center begrenzt das
> „What's New“-Feld typischerweise auf **1500 Zeichen**. Beide Varianten unten
> bleiben sicher darunter. Subtitle (max. 30 Zeichen) und Short Description
> (max. 100 Zeichen) bleiben unverändert gültig — aktualisierte Varianten
> mit Zeichen-Nachweis stehen in 8.3.

### 8.1 What's New (Deutsch – de-DE)

```text
Nova AI & Unified Extension & Skill Hub (v0.1.31)

🤖 Nova AI – Ihre KI, Ihre Mentalität
• Re-Branding: Die integrierte KI heißt Nova. Name (Nova, Jarvis, Aria …)
  und Mentalität („Pragmatisch & Direkt“, „Forschend & Gründlich“,
  „Kreativ & Visionär“, „Technisch & Präzise“) legen Sie im Setup-Assistenten fest.
• Dynamische Live-Modellauswahl: Modelle werden live via Google CLI Quota-API
  entdeckt – inklusive Kontingent-Badges und Auto-Failover bei Erschöpfung.

⚡ 48 kuratierte Agentic Workflows
• 4 Kategorien à 12 Spezial-Skills im neuen Mega-Menü:
  Recherche & Deep Analysis · Content & Dokumentation ·
  Code & Engineering · Daten & Automatisierung.
• Draggable AI-Action-Bar, Top-64 Pinned-Apps, Menü-Synthese
  aller 17+ Power-Panels.

🧩 Unified Extension & Skill Hub (Ctrl+Shift+X)
• Zwei Säulen unter einem Dach: 🌐 Chrome MV3 WebExtensions (1-Klick-Store,
  Web-Store-URL-Install, Drag & Drop .crx/.zip) und ⚡ Nova AI Skills &
  MCP-Tools (offener MCP-Standard, mcp_servers.json, stdio & sse).
• Workspace-Scoping: Skills pro Workspace (Coding / Recherche / Design)
  aktivieren – schlankes Context-Window, weniger Halluzinationen.
• Granulares Sandboxing: Berechtigungen (read_only, filesystem_write,
  terminal_execute, network_outbound, agent_autonomy) transparent
  einsehbar, Human-in-the-Loop für kritische Aktionen, 1-Klick-Widerruf.

🧹 Das alte Classic-Layout und der Begriff „App Store“ entfallen
zugunsten des Unified Extension & Skill Hub.
```

### 8.2 What's New (Englisch – en-US)

```text
Nova AI & Unified Extension & Skill Hub (v0.1.31)

🤖 Nova AI – Your Assistant, Your Personality
• Rebranding: The built-in AI is now Nova. Choose its name (Nova, Jarvis,
  Aria …) and personality ("Pragmatic & Direct", "Inquisitive & Thorough",
  "Creative & Visionary", "Technical & Precise") in the setup wizard.
• Dynamic live model discovery via the Google CLI quota API, including
  quota badges and automatic failover when a model runs dry.

⚡ 48 Curated Agentic Workflows
• 4 categories with 12 specialist skills each in the new mega-menu:
  Research & Deep Analysis · Content & Documentation ·
  Code & Engineering · Data & Automation.
• Draggable AI action bar, Top-64 pinned apps, menu synthesis of all
  17+ power panels.

🧩 Unified Extension & Skill Hub (Ctrl+Shift+X)
• Two pillars under one roof: 🌐 Chrome MV3 WebExtensions (1-click store,
  Web Store URL install, drag & drop .crx/.zip) and ⚡ Nova AI Skills &
  MCP Tools (open MCP standard, mcp_servers.json, stdio & sse).
• Workspace scoping: enable skills per workspace (Coding / Research /
  Design) for a lean context window and fewer hallucinations.
• Granular sandboxing: permissions (read_only, filesystem_write,
  terminal_execute, network_outbound, agent_autonomy) are fully
  transparent, with human-in-the-loop for critical actions and
  1-click revocation.

🧹 The legacy Classic layout and the "App Store" term are retired in
favor of the Unified Extension & Skill Hub.
```

### 8.3 Aktualisierte Kurzangaben (v0.1.33)

| Feld | Sprache | Text | Zeichen |
| :--- | :--- | :--- | :--- |
| **Subtitle** | de-DE | `Nova AI & Skill Hub Browser` | 27/30 |
| **Subtitle** | en-US | `Nova AI & Skill Hub Browser` | 27/30 |
| **Short Description** | de-DE | `Schneller, privater Chromium-Browser mit Nova AI, 48 Workflows & MCP-Skill-Hub.` | 79/100 |
| **Short Description** | en-US | `Fast, private Chromium browser with Nova AI, 48 workflows & MCP skill hub.` | 74/100 |

Die bisherigen Werte aus 2.1/3.1 (`AI-Native Web Browser` / „Nova KI-Copilot“-Formulierungen)
bleiben als Fallback gültig; für die v0.1.33-Einreichung sind die obigen Varianten
empfohlen, da sie das Re-Branding und die Hub-Architektur widerspiegeln.

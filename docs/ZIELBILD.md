# Lastbrowser & Sidekick – Verbindliches Zielbild

## 1. Leitidee & Vision

Lastbrowser vereint einen vollständigen, schnellen Windows-Browser (Chromium/Electron) mit dem vollwertigen **Sidekick AI Agenten** (`services/sidekick`).
Das Zielbild ist die **vollständige, native Parität** und eine **moderne, aufgeräumte Ästhetik**:
1. **Funktionale Parität:** Alle Fähigkeiten, Werkzeuge, Oberflächen und Hintergrunddienste aus Sidekick Standalone (TUI, `sidekick doctor`, 38+ CLI-Befehle, Messaging Gateway Daemon) sind im Lastbrowser nativ integriert.
2. **UI-Synthese (Sidekick + Zen Browser):** Die überladene Drei-Spalten-Ansicht wird durch eine elegante, vertikale Navigationsstruktur ersetzt. Die **beliebte ein- und ausklappbare Sidebar** bleibt als Kern-Feature vollständig erhalten und wird flexibler (ausgeklappt, kompakter Slim-Icon-Dock oder 100% Full-Canvas).

---

## 2. Statusübersicht der Phasen

- [x] **Phase 1: Stabilitätsfundament** (Zustand Stores, App.tsx Modularisierung, 6 Locales i18n, node-pty Terminal, auto-generierter 418-Endpunkte-API-Katalog, Multi-Monitor Window Dragging)
- [x] **Phase 2: Modularisierung & Kernfeatures (v0.1.26)** (Sub-Panels ausgelagert, Netscape/JSON Lesezeichen-Import/Export, Session-Snapshots, Visual Adblock Shield)
- [x] **Phase 3: Auth, Modellkatalog & Setup Assistant** (Provider-Authentifizierung gemäß jeweiligem Provider-Flow, Fullscreen First-Run Wizard, 5 Persönlichkeitsprofile; Gemini-CLI-Subscription-OAuth nicht verfügbar)
- [x] **Phase 4: Shortcuts, Omnibox & Speed Dial (v0.1.27)** (Globaler IPC-Shortcut-Dispatcher, Omnibox-Autocomplete mit Live-Suggestions, Startseiten Speed-Dial)
- [x] **Phase 5: Browser Polish & UX (v0.1.28)** (Tab-Favicons, Lade-Spinner, dynamischer Stop/Reload-Button, Webview Crash-Recovery, F11 Vollbild, Download-Aktivitätsindikator, 306 Unit-Tests grün)
- [x] **Phase 6: Browser Power-Features (v0.1.29)** (Rechtsklick „Element untersuchen“ / DevTools Inspect mit Auto-Open, Rechtsklick „Deep Research mit [Assistenten-Name]“, Tab Audio-Indikator & Per-Tab Mute, Privater / Inkognito-Modus mit in-memory-incognito Partition & Ctrl+Shift+N, 309 Unit-Tests grün)
- [x] **Phase 7: Volle Standalone-Parität – Native Integration der Sidekick-Kernfeatures** (TUI, `sidekick doctor`, 38+ CLI-Subcommands, Multi-Platform Messaging Gateway Daemon)
- [x] **Phase 8: WebExtensions / Addon-Support (Manifest V3)** (Entpacktes Laden, Zero-Dependency CRX3-Extraktor, kuratierter 1-Klick-Store mit Dark Reader, uBlock Origin Lite, Bitwarden, ClearURLs, Violentmonkey, Web Store URL-Install, Session-Attachment)
- [x] **Phase 9: Modernes UI-Redesign (Sidekick + Zen Synthese mit einklappbarer Sidebar)** (Einklappbare vertikale Tabs, Wegfall horizontaler Tabs, 48px Slim-Dock, Pinned-Grid, Sidekick-Startseiten-Dashboard, 70/30 Copilot Split-View)
- [x] **Phase 10: Agentic Browsing & Deep Tab Intelligence (Comet-Parität)** (10.1 Cross-Tab Context Synthesis `@tabs`, 10.6 CometJacking & Prompt-Injection Guardrails, Clickable Citation Badges)
- [x] **Phase 11: Agentic Workflow Templates & Quick Action Hub** (Kuratierte 1-Klick Recherche- & Analyse-Workflows, Empty-State Quick-Launcher, Command Palette Integration)
- [!] **Phase 12: Gemini CLI Subscription-OAuth & Round-Robin – nicht verfügbar** (Google stellte den Consumer-Code-Assist-Zugriff am 18.06.2026 ein; Lastbrowser blockiert diesen Provider. Gespeicherte Alt-Credentials sind keine nutzbaren Zugangsdaten.)
- [x] **Phase 13: UI-Synthese, Nova AI Branding & Power-Tools Integration (v0.1.31)** (Re-Branding zu Nova AI, Menü-Synthese der 17+ Power-Panels, Top-64 Pinned-Apps-Katalog, Draggable AI-Action-Bar, dynamische Live-Modellauswahl via Google CLI Quota-Discovery, 48 Spezial-Skills, Phasing-out des Classic Layouts)
- [x] **Phase 14: Unified Extension & Skill Hub (Zwei-Säulen-Architektur) (v0.1.31)** (Konsolidierung von Chrome MV3 WebExtensions und nativen Nova MCP-Skills, Ablösung des alten „App Store“-Begriffs, Workspace-Scoping, Berechtigungs-Sandboxing)
- [!] **Store-Release Readiness: Microsoft Partner Center (Win32 / NSIS) — OPEN** (Die früheren 27/27-, WACK-/Silent-Install- und Listing-Angaben sind historische Meilensteine, keine aktuelle Abnahme. Für 0.1.49 belegt ist der Source-Preflight 39 PASS / 2 WARN / 0 FAIL und die unsignierte TEST-Zustellung; aktueller WACK-, Installations-, Signierungs- oder Store-Abnahmenachweis fehlt.)

### Aktuelle Abnahmeampel — veröffentlichter TEST 0.1.49 und spätere Sourceintegration (Stand 9. Oktober 2026)

Die abgehakten Phasen oben sind historische Funktionsmeilensteine. Sie sind keine Paket-, VM- oder Veröffentlichungsfreigabe.

| Bereich | Status | Beleg und Grenze |
|---|---|---|
| 0.1.49 Source-Freeze | **PASS — Source** | Commit `5f90bb5628f91f2ec8d245b608d7e5ce60afaafe`, Tree `f0750ea77da2036b45202272a4e795ff85c4e3ae`. All-4-Receipt `E:\lastbrowser-ui-integration-20261008\output\release-fix-integration-0.1.49\final-all4-receipt.json`, SHA-256 `c267e3d922376dc4127d88b7c6c19de3e531f7f357a8a9cb538be1e56f515b2e`: 214 Testdateien / 1.953 Tests PASS, Build Exit 0 (bestehender Chunk >500 kB Hinweis), Store 39 PASS / 2 WARN / 0 FAIL (Screenshots vorläufig; beim Preflight noch kein Paket zur Signaturprüfung beigelegt), Python-Syntax Exit 0. Das belegt Source-Gates, keine Runtime-Abnahme. |
| 0.1.49 Testpakete / TEST-Release | **ZUSTELLUNG PASS — unsigniert** | Öffentlicher [TEST-Release](https://github.com/Loggableim/lastbrowser/releases/tag/test-v0.1.49-5f90bb56-20261008), keine Stable-Promotion. Vollständiger Remote-Readback aller fünf Assets: `E:\lastbrowser-package-candidate-5f90bb56-20261008\release\remote-readback-receipt.json`, SHA-256 `60fbbbe54683069d02ad4601b0c5a88ec2b1f5078dbcbe6c63d329df524c8d4e`, 2.619 Bytes; Receipt meldet Byte-Readback und Hashvergleich **PASS** für alle fünf Dateien. Setup/Portable bleiben `NotSigned`; Stable latest bleibt `v0.1.45`. |
| 0.1.49 Paketreview / Guest | **PAKETRECEIPT PASS; Setup-Update im Guest PASS; Runtime-Abnahme offen (3 FAIL / 14 BLOCKED / 0 benannte PASS)** | Unabhängiger Paketreview `E:\lastbrowser-package-candidate-5f90bb56-20261008\output\independent-package-review-2026-10-08.json` (SHA-256 `f523173c9ceca77607285577712d532efd3ff536ddfa2b8b1c31dffbd34870f6`) meldet Local-Payload- und Guest-Bundle-Integrität **PASS**; Unpacked-Preview-Erststart/normaler Browser-Schluss waren separat **PASS**, Raw-Direct-EXE- und Portable-Probes **FAIL** am alten Setup-Selector. Guest-Retest [Bericht](https://github.com/Loggableim/lastbrowser/blob/76868466263f4a43c960cc266ab750ed0f18afba/docs/test-reports/2026-10-08-0.1.49-guest-retest.md), Blob `823be6ef9183d680e8924168d42d532f6064e559`, SHA-256 `ec5fe2fe9c6141851c77a88e371bdcbed3bb421bcffd6e8735a0ed3c931a8bea`: gepinnter Setup-Update und Versionsreadback `0.1.49` **PASS**; installierte ASAR `856eb141180fb242580e13c37e6208fa932b7e765203f23d8b25187e26a6bf62` entspricht dem Kandidaten. Installer-Exitcode wurde nicht erfasst; kein Clean-Install-Nachweis. Gezielter Guest-Lauf ergab 3 **FAIL**, 14 **BLOCKED**, keine benannte **PASS**-Zeile und 0/10 Provider-Turns. Profil/runtime-Identität blieb mehrdeutig/bewegt; Schrift bei 1920×1032 und Appearance bei 1100×920 scheiterten; schwarzer Erststart erholte sich nach Ctrl+R ohne Cold-Start-PASS. Der installierte alte Kandidat belegt weder vollständige Guest-Abnahme noch die späteren Source-Korrekturen. Strenge BoringSSL-Store-Provenienz und CleanWindows weiterhin **OPEN**. TEST-Zustellung PASS; finale Store-/Stable-Distributionsabnahme OPEN. Signierung und Store-Einreichung nicht durchgeführt. Das ist kein Gesamtprodukt-PASS. |
| Copy-/Lokalisierungslücken | **SOURCE-PASS — benannte Korrekturen; Gesamt-Lokalisierung, Runtime und Paket offen** | Integrations-Merge `236727b2d2acb388fa6300e7022cb3f9ad7c535a`, Tree `84f8e39be5aa95e3a36108e17281818fced454dd`: JA `teamwork.strategy.quality`, achtsprachige Beta-/Migration-/Providerpaarung, PT-BR `Modelo fixo` sowie PR #23 mit achtsprachigen Local-AI-Titeln/Beschreibungen, Plugin-Status-/Fallback- und Dock-Deaktiviert-Beschriftungen (alle fünf neuen Keys raw/resolved getestet). `NativeBrowserStartPage.tsx` Space-/Verlaufstexte und `SidekickSidebar.tsx` Chrome sind im aktuellen Source lokalisiert. Das belegt weder einen globalen Lokalisierungsabschluss noch achtsprachige Runtime-Screenshots. Der öffentliche 0.1.49-TEST-Kandidat basiert weiter auf Freeze `5f90bb5628f91f2ec8d245b608d7e5ce60afaafe`; die späteren Source-Korrekturen sind darin nicht verifiziert.
| Offene Ursachen | **OPEN** | Profilreferenz und Modellkatalog/-ursache bleiben offen; eingebettetes Google-Verhalten ist `NOT_GUARANTEED`. |
| Test-Publish / Upload | **TEST-Release zugestellt; begrenzter Guest-Retest ausgeführt** | Fünf Remote-Dateien vollständig rückgelesen und anhand des Remote-Readback-Receipts gegen Bytes und SHA-256 geprüft. Gepinnter Setup-Update-/Versionsreadback im bestehenden Guest **PASS**; Verhalten 3 **FAIL**, 14 **BLOCKED**, 0 benannte **PASS**; Provider 0/10 Turns. Keine vollständige Runtime-/Guest-Abnahme.
| Signierung / Stable / Store | **OPEN — nicht durchgeführt** | Signierung und Store-Einreichung nicht durchgeführt; strenge BoringSSL-Store-Provenienz und CleanWindows bleiben offen. Stable bleibt `v0.1.45`; TEST-Release ist keine Stable-Promotion. |

### Spätere Sourceintegration — noch kein neuer Paketkandidat

Aktueller integrierter Quellstand: `ba28440c6161e7e3fdc15367046a873f6663a345`, Tree `430973b417137da1d762736478b50f5d8e66fbf9`. Der veröffentlichte TEST 0.1.49 bleibt auf `5f90bb56`; B7 ist ausschließlich historisch.

| Bereich | Status | Beleg und Grenze |
|---|---|---|
| Appearance bei schmalem Fenster | **MERGED SOURCE / React-Probe PASS; Paket und Guest OPEN** | PR #26, Merge `23a658c9ec285cc55a0e320603f7e564c5e254a0`: unabhängiger echter React-Retest 1920×1032 und 1100×920, Themes, Schriftgrößen, Zoom-Reset und Tastatur bestanden. Kein neuer installierter Paketnachweis. |
| Profildiagnose | **MERGED SOURCE; Guest-Ursache OPEN** | PR #25, Merge `d543d1ab1bc60e8052a2e84b58ff0db9ad2827f6`: redigierte Snapshotdiagnose, Handleidentität vor Lesen und ungültige Sidecars abgesichert. Tatsächliches Guest-Backend-Home einschließlich `SIDEKICK_BASE_HOME` muss vor Ausführung bestätigt werden. Kein Profilreparatur- oder Runtimefreigabebeleg. |
| Begrenzte DRM-Startbereitschaft | **MERGED SOURCE; Guest-Schwarzbild OPEN** | PR #27, Merge `ba28440c6161e7e3fdc15367046a873f6663a345`: maximal drei Sekunden Initialwartezeit, ehrlicher pending/unavailable/ready-Zustand. Historischer echter Source-Erststart und Settings-Neustart bestanden; die Ursache des installierten Guest-Schwarzbilds ist nicht bewiesen. |
| Vorläufiger GPT-6-Luna-Chatstandard | **VORGABE; Umsetzung und Pair-Qualifikation OPEN** | CEO/CTO verantworten die gewünschte vorläufige Produktzuordnung. Kein ungeprüftes Provider-/Modellpaar als qualified freischalten; Beta-, Profil- und Runtime-Gates bleiben bestehen. |
| Gemeinsame Releaseprüfung | **OPEN — nach Freeze** | Gemäß neuer Humanvorgabe Regressionen und Pflichtchecks einmal gesammelt vor dem neuen Release. Vorherige Entwicklungstests gelten nur für ihre jeweiligen Sourcepins, nicht als Abschlussfreigabe dieses gemeinsamen Standes. Achtsprachiger Quellreview ist benannt bestanden; sichtbar gerenderte Achtsprachenabnahme bleibt offen. |

### Historische B7-Guest-Ampel — v0.1.48, nicht auf 0.1.49 übertragen

Der reale VM-Lauf prüfte Source `b7ca38bd6db7b8a6e5fd814bd322b4916f561e73`, Tree `30f2deb9301b12cf8908e6acd633893b64caa00d`, portable Kandidat `test-v0.1.48-b7ca38bd-20261008`. Der Bericht liegt im Report-Commit `b39ae4281d2f77e9714f7b91b4c4888348259e65`, Pfad `docs/test-reports/2026-10-08-b7ca38bd-runtime-test-report.md`. Seine historischen Paketintegritätspins bleiben erhalten:

| B7-Artefakt | SHA-256 | Ergebnis / Umfang |
|---|---|---|
| Guest-ZIP | `a083d83bd1d94130ab68da8850882c3a833b7513d9c8008049b01d316c3aa95f` | **PASS** — gehashtes Testinput |
| Standalone-Manifest | `33000f3447e5bb2f2718b30336d3abfcbe83f18fe5987bfe4218ae9ee2488101` | **PASS** — gehashtes Manifest |
| Setup-Wrapper (nicht ausgeführt) | `c84618cd6da1f10010f445d443d39eb604c4dd489b41376a1c55928edad97c95` | **PASS** — Datei gepinnt; nicht als Setup-Lauf werten |
| Ausgeführter Portable-Wrapper | `560b367378fef4b60599dbbf82c6f7e23660e6b3d74f9ec42fbee5a1e4d28683` | **PASS** — im isolierten synthetischen Profil gestartet |
| ASAR aus dem Portable-Extraktionsbaum | `a196a883890cd33a68b0b02fdfb8f2cc8bf608e94fbf96b16e57578cb69b408b` | **PASS** — mit gestartetem Portable verknüpft |

Beide Wrapper waren `NotSigned`. Providerturns, Inferenz, Modellinstallationen und Kosten waren **0**. Die getrennten UI-Ergebnisse des B7-Berichts lauten:

| Beobachteter B7-Fall | Status | Präzisierung |
|---|---|---|
| Erststart „Ohne KI“ und Reload ohne erneute Auswahl | **PASS** | Kontrolliertes frisches Profil; keine Inferenz. |
| Browserprofil A→B→A und History-Isolation | **PASS** | B zeigte keine A-History; A-History kam nach Rückwechsel wieder. |
| History-Vorschläge, Up/Down-Auswahl, Enter und explizite Suchoption | **PASS** | Lokale History-/Search-UI; keine externe Suche abgeschickt. |
| Privater Tab / History und Schließen des letzten sichtbaren Tabs | **PASS — begrenzt** | Privater Tab im selben Fenster; Fenster blieb auf Startansicht offen. Separates privates Fenster bzw. Tabmodell mit null Tabs nicht geprüft. |
| Loopback-Download, Indikatoren, Floating-/Resize-/Dock-Aktionen | **PASS — begrenzt** | Synthetischer lokaler Download; Animationsursprung, Zwischen-Dockziele und Prozessneustartpersistenz nicht geprüft. |
| Modellstore zeigt CPU/RAM/GPU/Disk ehrlich als „Unbekannt“ | **PASS — begrenzt** | Keine erfundenen Messwerte; Advanced-Details nicht ausgeklappt. |
| Assistant-Übersicht und Connections-Disclosure | **PASS — begrenzt** | Composer/Connections sichtbar; 0 verbundene Verbindungen, Setup nötig. Keine Live-Verbindung konfiguriert. |
| `AI_NEW_CHAT_20261008`: Neuer Chat aktiviert Arbeitschat nicht | **FAIL** | Beide Klicks erzeugten Recent-Einträge, ließen aber die Startseite bzw. den vorherigen Arbeitschat sichtbar. |
| Neuer Chat / Sessionwechsel trennt ungesendeten Composer-Entwurf nicht | **FAIL** | `Guest focus check` blieb nach neuer Session und Wechsel zwischen zwei Sessions stehen. Innerer Composer-Fokus war **NOT_TESTED**. |
| Profilmenü überlagert; Add per Pointer scheitert | **FAIL** | Add/Profilwechsel funktionierten per Tastatur; das Menü lag über der Settings-Karte. |
| Tab-Drag zu Pinned Apps erzeugt keinen Pin | **FAIL** | Originaltab blieb erhalten; vorgeschriebene Root/Subdomain-Deduplizierung daher **BLOCKED**. |
| Hardware-Scan unter langem Temp-Pfad | **FAIL — beobachtet** | UI meldete `local_ai_path_too_long`; kurzer Pfad wurde nicht gegengeprüft, Ursache bleibt offen. |
| Space-Erstellung meldet `adapter_unsupported`, obwohl der Space entsteht | **FAIL — widersprüchliche UI-Antwort** | Der Space erschien und war auswählbar; Ursache nicht festgelegt. |
| Zweiter Erststart / kurzer Profilpfad und echte IME | **BLOCKED** | Zweiter isolierter Start durch Freigabeprüfung abgelehnt und nicht ausgeführt; VM hatte keine IME-Kandidatenauswahl. |
| Goals, Scheduler, Rechteentzug, Reset und Quickchat-Ausführungsfälle | **BLOCKED** | Keine ausdrücklich kontrollierte lokale Fixture identifiziert; keine Provider-/autonomen Läufe. |
| Goal-Zustandsansicht nach Reload und Summarize-Routing | **NOT_TESTED** | Keine gezielte Ansicht und kein Summary-Aufruf. |
| Schmaler Viewport und vollständige Tastaturbedienung | **NOT_TESTED** | In diesem Guest-Lauf nicht ausgeführt. |
| Vollständiges Beenden des Portable-Prozesses | **NOT_VERIFIED** | Nach Fenster-X blieben Wrapper/Hauptprozess/Backend bestehen. |
| Setup, Update, Deinstallation und Clean-Windows-CRT | **BLOCKED / NOT_VERIFIED** | Kompatible Baseline bzw. sauberer Snapshot fehlte; Setup wurde nicht ausgeführt. |

Der vollständige B7-Bericht bewahrt die Zeitstempel, Screenshots, Prozess-/Artefaktidentitäten und Teilfallgrenzen. Diese B7-PASS-/FAIL-/BLOCKED-Ergebnisse beschreiben ausschließlich v0.1.48 auf dem genannten VM-Kandidaten und sind weder v0.1.49-Runtimebeleg noch pauschale Aussage „Runtime nicht getestet“.

### Späterer B7-Provider-Retest — eigener historischer Lauf

Separater Report-Pin: Commit `15fabd8fa7776db2da29e58303ff47cc61397402`, Datei `docs/test-reports/2026-10-08-b7ca38bd-user-provider-retest.md`, GitHub-Blob `452d5188e80312e9e07f70f60a63518f07801473` (7.274 Bytes, SHA-256 `b51005cf06757e0e093e128a8ac6e54c987875c3af6ffec0fea7e3a041030af2`). Root hat den Blob live verifiziert. Der Inhalt bezieht sich auf v0.1.48 und enthält den konkreten Profilreferenzfehler; er ist kein 0.1.49-Beleg.

| Retest-Fall | Status | Präzisierung |
|---|---|---|
| 0.1.48 Setup-/ASAR-Identität | **IDENTIFIZIERT** | Der Retest pinnt Setup `0.1.48` und ASAR; dies ist Paketidentität, keine 0.1.49-Paketabnahme. |
| Upgrade 0.1.46 → 0.1.48 | **PASS — begrenzt** | Nur begrenzter Upgradebeleg für diesen Versionspfad; keine allgemeine Setup-/Updatefreigabe. |
| New Chat | **FAIL** | Fehler blieb im späteren Retest bestehen. |
| Modellkatalog | **FAIL** | Katalogpfad blieb fehlerhaft. |
| Quickchat nach Reload | **FAIL** | `Profile reference is ambiguous or has moved`. |
| Providerturns | **0** | Keine Providerturns ausgeführt. |
| Tatsächliche Inferenz | **BLOCKED** | Keine Inferenz durchgeführt. |
| Teamwork | **NOT_TESTED** | Keine Teamwork-Abnahme in diesem Retest. |

Dieser spätere Lauf ist vom vorigen B7-Guest-Bericht getrennt: dessen Aussage „Setup nicht ausgeführt“ beschreibt nur den ersten Lauf; der spätere Report pinnt eine 0.1.48-Identität und einen begrenzten 0.1.46→0.1.48 Upgradebeleg. Keiner der beiden B7-Läufe ist Runtime- oder Guest-Abnahme für 0.1.49.

---

## 3. Architekturüberblick

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               LASTBROWSER SHELL                                  │
├───────────────────────┬───────────────────────────────┬──────────────────────────┤
│    BROWSER VIEW       │    COLLAPSIBLE SIDEBAR        │    HINTERGRUND-DIENSTE   │
│ • Tabs & Navigation   │ • 48px Slim-Dock (Agent/Apps) │ • Sidekick FastAPI Core  │
│ • DevTools & Inspect  │ • Vertikale Tabs & Pinned-Grid│ • Multi-Platform Gateway │
│ • Adblock & History   │ • Ein-/Ausklappbar (3 Modi)   │   Daemon (Telegram, WA,  │
│ • Tab Audio / Mute    │ • Copilot Split-View (70/30)  │   Discord, Slack, etc.)  │
│ • Inkognito-Modus     │ • Terminal (Shell & TUI-Mode) │ • System Tray Runner     │
└───────────────────────┴───────────────────────────────┴──────────────────────────┘
```

---

## 4. Spezifikation Phase 7: Volle Standalone-Parität

### 7.1 Terminal UI (TUI) – Native Integration
1. **Modus-Umschalter im Terminal-Panel (`panels/NativeTerminalMain.tsx`):**
   - Umschalter zwischen `[ System Shell ]` und `[ Sidekick TUI ]`.
2. **Direktstart von `sidekick --tui`:**
   - Im TUI-Modus startet der PTY-Prozess (`terminal-process.ts`) den bundled Python-Interpreter mit:
     `python.exe -m sidekick_cli.main --tui`
   - Übernahme von `SIDEKICK_HOME`, Workspace-Pfad und aktivem Profil.
3. **Nahtloser Wechsel aus dem Chat-Panel:**
   - Button *„In TUI fortsetzen“* wechselt direkt zum Terminal-Panel mit Übernahme der aktuellen Session-ID.
4. **PTY-Resize-Unterstützung:**
   - Sauberes Curses-/Box-Drawing durch bestehende `node-pty` Resize-Übertragung.

### 7.2 CLI-Diagnose (`sidekick doctor`) – Interaktives Diagnosetool
1. **Diagnose-Reiter in Settings (`SystemPanels.tsx`) & Control Center:**
   - Button: *„System-Diagnose ausführen (`sidekick doctor`)“*.
### 7.1 Sidekick Terminal UI (TUI) & ANSI-PTY Integration [x] (Umgesetzt)
1. **Echter ConPTY Pseudo-Terminal via `node-pty`:**
   - [x] ConPTY-Allokation mit vollem VT100/ANSI-Support und dynamischem Resize (`terminal-process.ts`).
2. **Sidekick Curses/TUI Support:**
   - [x] Start von `python.exe -m sidekick_cli.main --tui` im ConPTY.
3. **Native Terminal UI (`NativeTerminalMain.tsx`):**
   - [x] Modus-Umschalter zwischen PowerShell-Shell und Sidekick TUI, Quick-Command-Chips (`sidekick doctor`, `status`, `--help`), ANSI-Cleaning.

### 7.2 Diagnose-Dashboard (sidekick doctor) [x] (Umgesetzt)
1. **Interaktiver Aufruf:**
   - [x] Direkt im Terminal via 1-Klick-Button `doctor` oder CLI `sidekick doctor`.
2. **Strukturierte JSON-Diagnose-API:**
   - [x] IPC-Handler `lastbrowser:doctor:run` & `services.runDoctor({ fix?: boolean })` mit robustem Parser (`parseDoctorOutput`) für strukturierte Reports (`DoctorReport`).
   - [x] Kategorien: Python/Runtime, Provider-Konnektivität (Pings), Toolchains (Node, Git, Ripgrep), Konfiguration, Speicher/Berechtigungen & WAL.
3. **Interaktives UI-Dashboard:**
   - [x] Farbcodierte Status-Badges (Grün/Gelb/Rot) für jede Diagnosegruppe sowie Quick-Fixes (*„Auto-Fix anwenden (`--fix`)“*, *„Setup-Assistent öffnen“*).
   - [x] Umschaltung zwischen visuellem Category-Grid-Report und Raw-CLI-Konsolenlog mit 1-Klick-Kopierfunktion.

### 7.3 38+ CLI-Subcommands – Command Palette & Shell-Integration [x] (Umgesetzt)
1. **Universal Command Palette (`Ctrl+K`):**
   - Alle 38+ Subcommands als durchsuchbare Aktionen in der Palette (z. B. `> Sidekick: Local State reparieren`, `> Sidekick: Modell wechseln`, `> Sidekick: Supermemory reindizieren`).
2. **Automatische Alias-/PATH-Bereitstellung im Terminal:**
   - [x] Im Lastbrowser-Terminal wird `sidekick` als globale PowerShell-Funktion hinterlegt (`function global:sidekick { & "$env:LASTBROWSER_PYTHON_EXE" -m sidekick_cli.main @args }`), sodass alle 38+ CLI-Befehle direkt auf der Konsole ausführbar sind.
3. **1-Klick-Buttons für administrative Operationen:**
   - [x] Quick-Buttons für `doctor`, `status`, `help` im Native Terminal UI.

### 7.4 Multi-Platform Messaging Gateway Daemon – Hintergrunddienst & UI [x] (Umgesetzt)
1. **Lifecycle Management im Electron Main Process (`services.ts`):**
   - [x] Registrierung des Gateway-Runners (`services.startGateway()`, `services.stopGateway()`, `services.restartGateway()`, `services.getGatewayStatus()`).
   - [x] Sauberes Beenden beim App-Quit.
2. **Natives Gateway-Kontrollpanel (`IntegrationPanels.tsx` / `NativeGatewayMain`):**
   - [x] Übersicht aller Messenger-Plattformen als Status-Kacheln (Telegram, WhatsApp, Signal, Discord, Slack, Matrix, BlueBubbles, Home Assistant, Email).
   - [x] Status pro Plattform & Gateway-Laufzeitstatus (PID, Fehler, Start-/Stopp-/Restart-Aktionen).
   - [x] Anleitung für interaktives Setup (`sidekick gateway setup`).
3. **Windows System Tray & 24/7 Betrieb (`tray.ts`):**
   - [x] Windows System Tray mit Kontextmenü (Lastbrowser öffnen, Service/Gateway Status & Toggles, Beenden).
   - [x] Minimize-to-Tray beim Schließen des Fensters (`setupMinimizeToTray`), damit der Agent und Gateway 24/7 erreichbar bleiben.

---

## 4b. Spezifikation Phase 8: WebExtensions / Addon-Support (Manifest V3) [x] (Umgesetzt v0.1.29)

### 8.1 Zero-Dependency CRX3 & ZIP Extraktions-Engine (`extensions.ts`) [x]
1. **CRX3 / CRX2 Header-Parser:**
   - [x] Parsing von `Cr24` Magic, Version 3/2 und dynamischem Header-Offset ohne Drittanbieter-NPM-Pakete (rein über Node.js `node:zlib` und `node:fs`).
   - [x] Schutz vor Directory-Traversal (`..` Pfade werden automatisch neutralisiert).
2. **Direkter Download aus dem Chrome Web Store:**
   - [x] Unterstützung von 32-Zeichen CWS-IDs und URLs (`chromewebstore.google.com/detail/...`).
   - [x] Direkter Download des CRX3-Pakets über Googles offizielle Update-API.

### 8.2 Kuratierter 1-Klick-Store & Unpacked-Modus [x]
1. **1-Klick-Store Presets:**
   - [x] **Dark Reader** (Automatischer Dark Mode für jede Webseite)
   - [x] **uBlock Origin Lite** (Manifest V3 DeclarativeNetRequest Blocker)
   - [x] **Bitwarden** (Open-Source Passwort-Manager)
   - [x] **ClearURLs** (Anti-Tracking URL-Cleaner)
   - [x] **Violentmonkey** (Userscript Manager)
2. **Unpacked-Modus für Entwickler:**
   - [x] Nativer Ordnerauswahl-Dialog via Electron `dialog.showOpenDialog`.
   - [x] Validierung der `manifest.json`, Versionsauslese, Berechtigungs-Pills und Icon-Extraktion (Data-URL).

### 8.3 Session-Attachment, Incognito-Isolation & UI-Verwaltung [x]
1. **Electron Session Bindung:**
   - [x] Automatisches Einhängen bei `app.whenReady()` und `app.on('session-created')` für alle Profile (`persist:profile-*`).
   - [x] Content Scripts, DeclarativeNetRequest und Service-Worker laufen nahtlos in `<webview>` Gästen.
   - [x] Incognito-Isolation: Standardmäßig im privaten Modus deaktiviert, per Checkbox optional aktivierbar.
2. **Erweiterungs-Verwaltung:**
   - [x] Dedizierter Bereich **„Extensions & Add-ons“** in den Einstellungen (`SystemPanels.tsx`).
   - [x] Titelleisten-Button (`Puzzle`-Icon) für 1-Klick-Zugriff direkt aus dem Browser-Header.
   - [x] Enable/Disable Switch, Incognito-Toggle und Löschen mit Bestätigungsdialog.

---

## 5. Spezifikation Phase 9: Modernes UI-Redesign (Sidekick + Zen Browser Synthese) [x] (Umgesetzt v0.1.29)

### 9.1 Einklappbare vertikale Navigationsleiste (Collapsible Sidebar) [x]
Die bestehende **Ein- und Ausklappbarkeit der Lastbrowser-Sidebar bleibt als Kernfunktion erhalten** und wird durch drei intelligente Zustände aufgewertet:
1. **Zustand 1: Vollständig Ausgeklappt (~240px)** [x]
   - Zeigt Workspace-Dropdown (*„Sprint planning“* / *„Personal“*).
   - Kompaktes Pinned-App-Raster (3x2 oder 4x2).
   - Vertikale Liste aller offenen Tabs mit Favicon, Titel, Audio-Icon und Schließen-Button.
   - Unten: `+ New Tab` und Shortcut-Hinweis.
2. **Zustand 2: Kompakter Slim-Dock (48px – Sidekick-Stil)** [x]
   - Schmale Leiste nur mit Icons (Sidekick-Agent, Favicons der aktiven Tabs, Web-Apps, Settings).
   - Tooltips beim Drüberfahren (Hover-Preview).
   - Klick auf das Chevron/Toggle-Icon oder Shortcut (`Ctrl+B`) klappt die Sidebar auf.
3. **Zustand 3: Vollständig Verborgen (0px – Zen-Fokusmodus)** [x]
   - Maximaler Platz für die Webseite.
   - Einblenden durch Mausbewegung an den linken Bildschirmrand (Hover-Slide-In) oder Shortcut `Ctrl+B`.

### 9.2 Abschaffung der doppelten horizontalen Tab-Leiste [x]
- Die bisherige obere horizontale Tab-Leiste entfällt im modernen Modus vollständig zugunsten der vertikalen Tabs in der Sidebar.
- Der obere Bereich wird auf eine **ultra-flache, elegante Titelleiste (42px)** reduziert:
   - Links: Collapse-Toggle für die Sidebar, Navigation (Zurück, Vorwärts, Neu laden).
   - Mitte: Integrierte Adresszeile (Omnibox) mit Sicherheits-Badge und **Live-Statistiken** nach Sidekick-Vorbild (*„3,420 Ads blocked · 1.2 GB RAM saved“*).
   - Rechts: Find in Page, Downloads, GitHub Link, Sidekick Copilot Toggle Button, Fenstersteuerungen (Minimieren, Maximieren, Schließen).

### 9.3 Kompaktes Pinned-App-Raster (Zen-Stil) [x]
- Direkt unter dem Workspace-Dropdown in der Sidebar befindet sich ein **kompaktes Icon-Raster** für angepinnte Dauerdienste (z. B. Notion, Figma, Trello, Slack, Netflix, Jira, Miro, + Add).
- Spart gegenüber langen vertikalen Zeilen massiv Platz ein und ermöglicht schnellen 1-Klick-Wechsel zwischen Arbeits-Apps.

### 9.4 Zentrales Dashboard & Startseite (Sidekick-Vorbild) [x]
- Wenn ein neuer Tab geöffnet wird, erscheint ein atmosphärisches, aufgeräumtes Dashboard mit Uhrzeit, Datumsanzeige, Such-/Prompt-Eingabe und Favoriten-Kacheln.

### 9.5 70/30 Split-View statt „Drei-Spalten-Einklemmung“ [x]
- **Web-Surfen:** 100 % Breite für den Web-Inhalt (bei geschlossener Copilot-Ansicht).
- **Mit Sidekick Copilot:** Sauberer **70/30 Split-View** (70 % Webseite links, 30 % Sidekick AI Copilot rechts mit Code-Highlighting, Copy-Buttons, Modell-Auswahl und Prompt-Eingabe).

---

## 6. Spezifikation Phase 10: Agentic Browsing & Deep Tab Intelligence (Comet-Parität)

Aus der Architektur des Perplexity Comet Browsers werden gezielt jene Kernfeatures übernommen, die Lastbrowser zu einer vollwertigen agentischen Recherche- und Automatisierungs-Workstation machen – unter Beibehaltung von Lastbrowsers Local-First- und Multi-Modell-Prinzipien (kein Cloud-Lock-in, kein Widget-Bloat):

### 10.1 Cross-Tab Context Synthesis („Chat mit deinen Tabs“ / `@tabs`) [x] (Umgesetzt v0.1.29)
1. **Multi-Tab Kontext-Erfassung:**
   - [x] Im Sidekick Copilot steht ein Quick-Action-Chip oder das Präfix `@tabs` / `@tab:N` zur Verfügung (z. B. *„@tabs Vergleiche die Preise und Stornobedingungen der drei Hotel-Seiten in einer Tabelle“*).
   - [x] Der Electron-Prozess extrahiert den sichtbaren Text und die semantische Struktur aller im aktuellen Workspace aktiven Tabs (via Live-Webview `executeJavaScript` oder Background-Fetch).
2. **Intelligentes Chunking & Token-Management:**
   - [x] Automatisches Trimming von Boilerplate (Navigation, Footer, Scripts, Tracking) und Token-Budgetierung (z. B. 4.000 Zeichen/1.000 Tokens pro Tab, 12.000 Tokens Gesamtbudget).
   - [x] HTML-Table-to-Markdown-Konverter für Tabellenvergleiche.
   - [x] Ausgabe strukturierter `<context_tabs>`-XML-Blöcke und tabellarischer Reports direkt im Copilot.
   - [x] Interaktive, klickbare Zitat-Badges (`[Tab X: ...]`), die per Klick direkt den jeweiligen Tab fokussieren.

### 10.2 Visuelles In-Page Quell-Highlighting & Deep Linking (Grounding Anchors) [x] (Umgesetzt v0.1.29)
1. **Interaktive Quell-Zitate im Copilot:**
   - [x] Wenn Sidekick Antworten aus Webseiten-Inhalten generiert, werden Aussagen mit Zitat-Badges belegt (`[Tab X: ...]`).
   - [x] In `NativeRichText.tsx` und `CopilotSplitView.tsx` werden Zitate mit `data-snippet` versehen und als interaktive Badges gerendert.
2. **Direct-Jump mit visueller Hervorhebung:**
   - [x] Klick auf das Zitat springt automatisch zum entsprechenden Tab (`jumpToTabAnchor`).
   - [x] Leichtgewichtiges Scroll- & Highlight-Script scrollt flüssig zur Fundstelle (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) und hebt den Treffer für 2 Sekunden mit einer leuchtenden Cyan-Aura (`0 0 24px rgba(56, 189, 248, 0.5)`) hervor.
   - [x] `window.find()` und `findInPage` als nahtlose Fallbacks.

### 10.3 Live Webview CDP-Automatisierung (Autonomer Formular- & Klick-Assistent) [x] (Umgesetzt v0.1.29)
1. **Direkte Kopplung von Sidekicks CDP-Tools an die sichtbare Webview:**
   - [x] Bereitstellung von Chromium Remote-Debugging-Port (`DEFAULT_CDP_PORT = 9222`, konfigurierbar via `LASTBROWSER_CDP_PORT` oder `--remote-debugging-port`).
   - [x] Automatische Injektion von `BROWSER_CDP_URL` und `LASTBROWSER_CDP_PORT` in die Sidecar-Umgebung von Sidekick (`buildSidecarEnvironment`), sodass Sidekicks `browser_cdp_tool.py` und `browser_tool.py` direkt an die Webview ankoppeln.
   - [x] IPC-Brücke (`lastbrowser:cdp:status`, `lastbrowser:cdp:execute`) für DevTools-Targets und Guest-Webview-Inspektion.
2. **Visuelle Interaktionsmarker & Human-in-the-Loop:**
   - [x] Injektion animierter Zielpunkt-Glow-Marker (`#lastbrowser-visual-beacon`) mit pulsierendem Ring (`lbBeaconPulse`), Cyan-Aura und Aktions-Badges für Klick-, Formularausfüll- und Scroll-Vorgänge (`live-automation.ts`).
   - [x] Automatisches Entdecken und Auslesen aller Formularfelder (`discoverActiveForm`) und Pagination-Erkennung (`triggerLivePagination`).
   - [x] Schwebendes Status-Banner (`LiveAutomationBanner.tsx`) mit aktiver Schrittanzeige.
   - [x] Volle Nutzerkontrolle: Jederzeit sofort unterbrechbar durch Drücken von `Esc` oder Klick auf „Abbrechen“ (`abortLiveAutomation`).

### 10.4 Natural Language Tab- & Workspace-Management & Tool-Calling [x] (Umgesetzt v0.1.29)
1. **Browser-Operationen per Befehl & Shortcuts:**
   - [x] Bereitstellung von Zustand-Store-Operationen (`useTabStore`, `usePanelStore`) für smarte Tab-Verwaltung:
     - `closeDuplicateTabs()`: Schließt alle redundanten/doppelten Tabs und schützt angeheftete Tabs bevorzugt.
     - `sortTabsByDomain()`: Gruppiert offene Tabs alphabetisch nach Hostname (ohne www-Präfix).
     - `closeUnpinnedTabs()`: Schließt alle nicht angepinnten Tabs mit einem Klick.
     - `closeTabsToTheRight(id)`: Schließt alle Tabs rechts vom gewählten Tab.
2. **Verfügbarkeit in der Universal Command Palette (`Ctrl+K` / `Cmd+K`):**
   - [x] Spotlight-/Raycast-Overlay (`CommandPalette.tsx`) mit globalem Shortcut-Interceptor (überwindet `<webview>` Guest-Focus-Traps).
   - [x] Sofortiges Filtern und Ausführen aller Sidekick-Befehle (> Doctor, > Supermemory, > Profil wechseln, > Modell wechseln), Tab-Aktionen und Navigation.
   - [x] Direkte Aktionen für *„Lesezeichen-Ordner aus Tabs erstellen“* und *„Tabs in neuem Workspace bündeln“*.
3. **Natural Language Parser & Local Tool-Calling Execution:**
   - [x] Mehrsprachiger Intent-Parser (`parseNaturalLanguageBrowserCommand`) für deutsche und englische Anweisungen (*„schließe alle doppelten tabs“*, *„sortiere tabs nach domain“*, *„mach mir einen lesezeichen-ordner aus allen tabs“*, *„bündle tabs in neuem workspace“*, *„welche tabs sind offen?“*).
   - [x] Zero-Latency Local Fast-Path in `startNativeChat` (<10ms Antwortzeit ohne Netzwerk-Roundtrip und ohne Token-Kosten).
   - [x] OpenAI- & Gemini-kompatibles Function Calling Tool-Schema (`BROWSER_AGENT_TOOLS_SCHEMA`) zur autonomen Browser-Steuerung durch LLM-Agenten.

### 10.5 Kontextuelle Quick-Action-Chips in Omnibox & Header [x] (Umgesetzt v0.1.29)
1. **Seitenspezifische 1-Klick-Aktionen:**
   - [x] In der flachen Titelleiste (`ModernTitlebar`) neben der URL sowie im Copilot-Header erscheinen je nach Seitentyp intelligente Aktions-Chips:
     - Bei News/Artikeln: `⚡ TL;DR` · `⚖️ Gegenargumente`
     - Bei Tabellen/Preisen/Shop: `📊 Tabellen exportieren` · `⚡ TL;DR`
     - Bei Repositories/Docs: `💻 Code extrahieren` · `⚡ TL;DR`
   - [x] 1 Klick übergibt den gefilterten DOM-Ausschnitt im strukturierten `<context_tabs>`-Format mit passendem Prompt sofort an den Sidekick Copilot.

### 10.6 Datenschutz & Local-First Guardrails (CometJacking Prevention) [x] (Umgesetzt v0.1.29)
1. **Keine unbemerkte Cloud-Exfiltration:**
   - [x] Anders als bei Comet fließen Tab-Inhalte niemals automatisch an einen Cloud-Provider, sondern ausschließlich lokal verarbeitet in die vom Nutzer explizit autorisierte Session.
2. **Prompt-Injection & CometJacking Schutz:**
   - [x] Bereinigung unsichtbarer Zero-Width- und bidirektionaler Steuerzeichen (`\u200B`, `\uFEFF`, etc.), die für Prompt-Injection-Bypasses genutzt werden.
   - [x] Neutralisierung bekannter Prompt-Injection-Vektoren (*„ignore previous instructions“*, *„system prompt override“*, *„exfiltrate“*, *„developer mode“*, etc.) durch Schutzmaskierung `[⚠️ Guardrail: Untrusted instruction block sanitized]`.
   - [x] Striktes Sandboxing von Web-DOM-Inhalten.

---

## 7. Spezifikation Phase 11: Agentic Workflow Templates & Quick Action Hub [x] (Umgesetzt v0.1.29)

### 11.2 Kuratierte 1-Klick Recherche- & Analyse-Workflows [x]
1. **Workflow-Templates-Engine (`workflow-templates.ts`):**
   - [x] Standardisiertes Template-Interface `AgenticWorkflowTemplate` mit Typisierung für Kategorien (`research`, `data`, `content`, `audit`) und Kontextanforderungen (`none`, `active_tab`, `all_tabs`).
   - [x] 5 kuratierte High-Impact-Workflows:
     - `competitor-analysis`: „Wettbewerber- & Preisvergleich“ (extrahiert Preise, Features, Vor-/Nachteile in eine Markdown-Tabelle über `@tabs`).
     - `markdown-extractor`: „Artikel als Clean Markdown archivieren“ (bereinigt Werbung, Nav, Footer und erzeugt sauberes Obsidian/Notion-kompatibles Markdown mit YAML-Frontmatter).
     - `table-to-csv`: „Tabellen erkennen & als CSV/JSON exportieren“ (sucht HTML-Tabellen der aktuellen Seite und konvertiert sie strukturiert in CSV- und JSON-Blöcke).
     - `page-audit`: „Barrierefreiheits-, Performance- & SEO-Audit“ (analysiert Headings, Alt-Tags, Kontraste, Lesbarkeit und Meta-Tags mit Score).
     - `action-items`: „Meeting-Notes & To-dos extrahieren“ (filtert Deadlines, Zuständigkeiten und Checkboxen `- [ ]`).
2. **Sidekick Copilot Integration (`CopilotSplitView.tsx`, `styles.css`):**
   - [x] Header-Button `⚡ Workflows` mit animiertem Dropdown-Menü zur 1-Klick-Auswahl.
   - [x] Empty-State Quick-Launcher-Chips für sofortige Workflow-Starts.
3. **Universal Command Palette Integration (`CommandPalette.tsx`):**
   - [x] Registrierung aller Workflow-Templates mit Präfix `> Workflow: [Name]` und Kategorie `Workflows` in der Command Palette (`Ctrl+K`).

---

---

## 8. Phase 12: Gemini CLI Subscription-OAuth & Round-Robin – nicht verfügbar

Der frühere `google-gemini-cli`-Provider ist in Lastbrowser absichtlich deaktiviert. Google stellte den Consumer-Code-Assist-Zugriff am 18.06.2026 ein; gespeicherte OAuth-Tokens und Account-Metadaten ermöglichen deshalb keine Inferenz. Lastbrowser bietet für diesen Provider weder Login noch Modellkatalog, Account-Rotation oder Quota-Failover an. Eine lokale Round-Robin-Metadatenfunktion ist kein Nachweis für ausführbare Anfragen. Gemini API und Vertex AI sind separate, eigenständig zu konfigurierende Provider und kein Ersatz für Subscription-OAuth.

---

## 9. Spezifikation Phase 13: UI-Synthese, Nova AI Branding & Power-Tools Integration [x] (Umgesetzt v0.1.31)

### 13.1 Re-Branding: Nova AI & konfigurierbare Mentalität [x]
1. **Abschaffung von „Copilot“ und „Sidekick“ im UI-Wording:**
   - Die Begriffe „Copilot“ und „Sidekick“ werden aus sämtlichen Labels, Tooltips, Platzhaltern und Benachrichtigungen entfernt.
   - Die integrierte KI heißt standardmäßig **„Nova“** (bzw. Home Space / Nova Space).
2. **Personalisierung im First Launch Assistant (Setup Wizard):**
   - Im Onboarding-Wizard legt der Nutzer den **Namen** (z. B. Nova, Jarvis, Aria) und die **Mentalität / Persönlichkeit** (z. B. „Pragmatisch & Direkt“, „Forschend & Gründlich“, „Kreativ & Visionär“, „Technisch & Präzise“) der Home Space AI fest.
   - Diese Einstellungen fließen direkt in den System-Prompt und die Begrüßung auf der Startseite ein.

### 13.2 Intelligente Menü-Synthese: Alle Power-Tools im neuen Overlay [x]
1. **Vollständige Parität der Panels aus der alten UI:**
   - Alle 17+ Panels (`agents`, `kanban`, `skills`, `memory`, `workspaces`, `profiles`, `todos`, `insights`, `logs`, `gmail`, `discord`, `appstore`, `terminal`, `history`, `downloads`, `extensions`, `permissions`) werden nahtlos in die moderne Navigation integriert.
2. **Entscheidungsgrundlage via Mockups:**
   - **Ansatz A („Command Dock & Mega-Launcher Flyout“):**
     - Frosted-Glass-Launcher-Overlay (zentriert-links), aufrufbar über das App-Icon in der Sidebar oder `Ctrl+Space`.
     - Kategorisierte Power-Kacheln (Dev & System, AI & Knowledge, Productivity, Communication, Browser Tools) mit Live-Filtersuche und Favoriten-Pinning.
   - **Ansatz B („Integrated Modular Multi-Tier Sidebar & Workspace HUD“):**
     - Integrierte Drawer-Tabs direkt in der Sidebar (`Tabs`, `AI & Agents`, `Workflows`, `Tools`).
     - Modulare Untermenüs, die sich bei Bedarf andocken oder als Split-View neben der Webseite einblenden lassen.
3. **Panel-Integrität & Fehlerbehebung (Fix-Plan `AdvancedWebUiTools` in `SystemPanels.tsx`):**
   - **Fehlerbild:** Beim Aufruf der Panels `insights`, `logs` oder `settings` bricht das Rendering mit `ReferenceError: AdvancedWebUiTools is not defined` ab.
   - **Ursache:** In `apps/desktop/src/renderer/panels/SystemPanels.tsx` fehlt der Import `import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';`, obwohl die Komponente an drei Stellen (`insights` Z. 380, `logs` Z. 557, `settings` Z. 2872) im JSX gerendert wird. Vite kompiliert ungebundene JSX-Bezeichner standardmäßig ohne Transpilierungsfehler, was erst zur Laufzeit beim Mounten zum Absturz führt.
   - **Fix-Maßnahme für umsetzenden Agenten:**
     1. Import `import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';` im Kopf von `apps/desktop/src/renderer/panels/SystemPanels.tsx` einfügen.
     2. Statischen Import-Integritätscheck in `apps/desktop/tests/browser-layout.test.ts` ergänzen, der automatisiert verifiziert, dass jede Panel-Datei, die `<AdvancedWebUiTools` verwendet, diesen Import auch explizit deklariert.
     3. Alle 17+ Panels auf sauberes Mounten ohne fehlende/ungebundene Runtime-Variablen prüfen (`npm --workspace apps/desktop run build:renderer` & `npm test`).

### 13.3 Pinned Apps: Top-64-Katalog & Custom Apps Popup [x]
1. **Kuratierter App-Katalog (Top 64):**
   - Klick auf das `+`-Icon bei den Pinned Apps öffnet ein modales Auswahl-Grid mit den 64 gängigsten Web-Apps (Gmail, Discord, WhatsApp, Signal, Telegram, Notion, Slack, Spotify, GitHub, YouTube, X/Twitter, ChatGPT, Claude, Linear, Figma, Reddit, Google Calendar, Google Drive, Trello, Jira, Asana, Miro, GitLab, Outlook, Microsoft 365, Netflix, etc.).
   - Kategorisierte Filter (Produktivität, Dev, Messaging, Media, AI).
   - 1-Klick An- und Abpinnen mit Favicon-Vorschau.
2. **Custom App Erstellung:**
   - Formularfeld im Modal für eigene URLs, benutzerdefinierte Namen und Farbakzente.

### 13.4 Draggable & Dockable AI-Aktionsleiste [x]
1. **Frei verschiebbare Aktions-Pill beim Browsen:**
   - Die Overlay-Aktionsleiste (*Summarize*, *Explain*, *Deep Research*, *Extract Actions*) wird mit Drag-Handle ausgestattet.
   - Kann per Drag & Drop frei auf dem Viewport positioniert werden (mit persistenter Position).
2. **Andockbare Zonen:**
   - Andocken an die obere Navigationsleiste, an den unteren Viewport-Rand oder an die Sidebar.

### 13.5 Konfigurierbarer Default-Zustand nach Zen-Modus [x]
1. **Einstellbare Rückkehr aus dem Zen-Modus:**
   - In den Einstellungen (und per Shortcut-Option) kann definiert werden, welcher Modus nach dem Verlassen des Zen-Fokusmodus (0px) standardmäßig eingenommen wird:
     - Standardzustand A: **Kompakter Mini-Mode / Slim Dock (48px)**.
     - Standardzustand B: **Vollständig Ausgeklappt (~240px)**.

### 13.6 Universelle Modellauswahl & Provider-Sync [x]
1. **Ablösung des statischen Hardcodings:**
   - Die bisherigen, statisch im Frontend hinterlegten Mock-Arrays (`AVAILABLE_MODELS` in `CopilotSplitView.tsx`, `setup-state.ts`, etc.) werden vollständig durch eine dynamische Anbindung an die Backend-API (`/api/models` / `/api/models/live`) ersetzt.
   - Veraltete oder nicht mehr im Code-Assist-Endpoint existierende Modell-IDs (wie `gemini-1.5-*`) werden aus allen Katalogen entfernt.
2. **Provider-spezifische Modellerkennung:**
   - Der deaktivierte Provider `google-gemini-cli` liefert weder Authentifizierung noch Modelle oder Quota-Daten. Gemini API und Vertex AI müssen über ihre eigenen Provider-Zugangsdaten und unterstützten Modellkataloge laufen.
3. **Pre-Login & Offline-Fallback:**
   - Vor dem Login (`GOOGLE CLI CONNECT`) oder bei Netzwerkunterbrechung zeigt der Picker eine verifizierte Standardauswahl der stabilen Produktionsmodelle:
     - `gemini-2.5-flash` (Standard • Schnell & Kosteneffizient)
     - `gemini-2.5-pro` (Tiefes Reasoning & Komplexe Analyse)
   - Sobald das Konto verbunden ist (`GOOGLE CLI READY`), aktualisiert sich das Dropdown in Echtzeit mit den real verfügbaren Modellen des Accounts.
4. **UI-Darstellung & Quota-Badges:**
   - Dynamischer Dropdown-Picker im Chat- und Copilot-SplitView:
     - **Google Gemini CLI (`google-gemini-cli`):** nicht verfügbar; alte OAuth-Tokens, Quota-Abfragen und statische Legacy-Modelllisten dürfen keine auswählbaren Modelle oder Inferenz erzeugen.
     - **Anthropic:** `claude-3-5-sonnet`, `claude-3-opus`, `claude-3-5-haiku`.
     - **OpenAI:** `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`.
     - **Lokale Modelle:** Erkannte Ollama- / LocalAI-Instanzen.
   - Auto-Failover darf nur auf tatsächlich verfügbare und konfigurierte Provider bzw. Accounts routen. Lokale Alt-Account-Metadaten umgehen keine Anbieterlimits.

### 13.7 Agentic Workflows: Kategorisiertes Dropout-Menü mit 12+ Skills pro Kategorie [x]
1. **Erweitertes Dropout-Menü:**
   - Umwandlung des einfachen Dropdowns in ein strukturiertes, zweistufiges Mega-Menü mit Kategorien.
2. **Mindestens 12 spezialisierte Skills pro Kategorie:**
   - **Kategorie 1: Recherche & Deep Analysis (12 Skills):**
     1. Wettbewerber- & Feature-Vergleich (`competitor-analysis`)
     2. Cross-Tab Quellensynthese (`tabs-synthesis`)
     3. Fact-Checking & Primärquellen-Audit
     4. Trend- & Marktforschungs-Report
     5. Wissenschaftlicher Paper-Summarizer mit Methodenkritik
     6. Patent- & Marken-Recherche
     7. Preisverlauf & Historien-Analyse
     8. Sentiment- & Review-Aggregator
     9. Regulatorik- & Compliance-Prüfung
     10. SEO-Keyword- & Backlink-Strukturanalyse
     11. Timeline- & Chronologie-Ersteller aus News-Artikeln
     12. Pro- & Contra-Matrix mit Gewichtung
   - **Kategorie 2: Content, Schreibassistent & Dokumentation (12 Skills):**
     1. Clean Markdown Archivierung mit Frontmatter (`markdown-extractor`)
     2. Executive Summary (1-Pager Management-Zusammenfassung)
     3. TL;DR & Bullet-Point Briefing
     4. Blogpost- & Tutorial-Entwurf aus Dokumentationen
     5. Social Media Thread-Creator (X/LinkedIn mit Hooks)
     6. Fachübersetzung mit Glossar-Treue (EN/DE/FR/ES/IT/PT)
     7. Changelog- & Release-Notes Generator
     8. FAQ-Generator aus Webseiteninhalten
     9. Pressemitteilungs-Formulierer
     10. E-Mail Draft & Follow-up Creator aus Webinhalten
     11. Präsentations-Gliederung (Slides / Outline)
     12. Glossar & Begriffserklärungs-Extraktor
   - **Kategorie 3: Code, API & Engineering (12 Skills):**
     1. Code-Erklärer mit Flowchart-Generierung
     2. Security & Vulnerability Audit (OWASP Check)
     3. API-Spezifikations-Extraktor (OpenAPI/Swagger JSON aus Doku)
     4. SQL-Query & Schema-Reverse-Engineering
     5. Refactoring-Vorschläge & Performance-Tuning
     6. TypeScript Interface & Zod-Schema Generator aus JSON
     7. Git-Commit & PR-Description Formulierer
     8. Unit-Test Generator für Code-Snippets
     9. Regex & Parser Builder aus Beispieltexten
     10. Dockerfile & CI/CD Pipeline Generator
     11. Shell-Script / PowerShell Automator
     12. cURL to Fetch/Axios/Python Requests Konverter
   - **Kategorie 4: Daten, Extraktion & Automatisierung (12 Skills):**
     1. Tabellen-Erkennung & CSV/JSON Export (`table-to-csv`)
     2. Lead- & Kontaktdaten-Extraktor
     3. To-dos, Action-Items & Deadlines Extraktor (`action-items`)
     4. Schema.org & JSON-LD Structured Data Validator
     5. Preis- & Produktkatalog-Extraktor
     6. Formular-Auto-Fill & Feld-Erkenner
     7. Bild- & Asset-URL Scraper mit Format-Filter
     8. Broken Link & Redirect Verifier
     9. Seiten-Audit: Barrierefreiheit, Performance & Meta (`page-audit`)
     10. RSS/Atom Feed Entdecker & Parser
     11. Cookie- & DSGVO-Banner Tracker Auditor
     12. Webhook & Alert Trigger Generator

### 13.8 Phasing-out des Classic Layouts & Moderne Appearance-Settings [x]
1. **Ablösung des Classic-Layouts:**
   - Sobald die Menü-Synthese (13.2) abgeschlossen ist, wird der Schalter „Classic vs. New Mode“ entfernt und das alte redundante 3-Spalten-Layout entfällt ersatzlos.
2. **Neue Appearance-Optionen in Settings:**
   - **Akzent-Themes:** Neon Cyan (Default), Electric Violet, Emerald Flow, Solar Amber, Monochrome Slate.
   - **Glassmorphism-Stufe:** Deaktiviert (Solid), Subtil (Low Blur), Modern (Medium Frosting), Deep Glass (High Blur).
   - **Default-Zustand nach Zen-Mode:** Mini-Dock (48px) vs. Ausgeklappt (240px).
   - **Schriftgrößen & UI-Dichte:** Kompakt / Standard / Groß.

---

## 10. Spezifikation Phase 14: Unified Extension & Skill Hub (Zwei-Säulen-Architektur) [x] (Umgesetzt v0.1.31)

### 14.1 Fundamentale Dichotomie & Architekturvision [x]
1. **Warum native Plugins keineswegs obsolet sind:**
   - **Chrome WebExtensions (Manifest V3):** Konzipiert für den isolierten Browser-DOM- und Web-Netzwerk-Kontext (Adblocker wie uBlock Origin Lite, Passwort-Manager wie Bitwarden, Stylesheets wie Dark Reader, Userscripts wie Violentmonkey). Durch die strikte Chromium-Extension-Sandbox können sie prinzipbedingt **keine lokalen Betriebssystemprozesse** starten, keine Python- oder Node-Toolchains ausführen, kein ConPTY-Terminal manipulieren und keine externen Messenger-Dienste steuern.
   - **Native Nova AI Skills / Sidekick Plugins:** Konzipiert für autonome System- und Agentic-Workflows (Shell-Ausführung, ComfyUI Bild-Pipelines, lokales SQLite/Supermemory-Gedächtnis, Docker/Git-Steuerung, lokale LLM-Runtimes via Ollama, Multi-Platform Messaging Gateway Daemon). Dies bildet das **Kern-Alleinstellungsmerkmal** von Lastbrowser gegenüber herkömmlichen Browsern.
   - **Synthese statt Redundanz:** Beide Systeme sind komplementär. Das bisherige Problem lag ausschließlich in der irreführenden Benennung („App Store“) und fragmentierten UI. Der alte Begriff „App Store“ entfällt vollständig zugunsten des **„Unified Extension & Skill Hub“**.

### 14.2 Der Unified Extension & Skill Hub (Zwei-Säulen-UI) [x]
1. **Zentraler Einstiegspunkt:**
   - Einheitlicher Tastatur-Shortcut: `Ctrl+Shift+X` (Industriestandard aus VS Code und modernen Browser-Shells) sowie als permanenter Schnellzugriff in der Sidebar („Extensions & Skills“).
   - Einheitliches Modal- / Drawer-Interface mit zwei klar getrennten Haupt-Reitern:
     - `[ 🌐 Web-Erweiterungen (Chrome MV3) ]`
     - `[ ⚡ Nova AI Skills & Tools (MCP) ]`
2. **Säule 1: Web-Erweiterungen (Chromium / MV3):**
   - Nahtlose Anbindung an die bestehende Zero-Dependency CRX3-Engine (`extensions.ts`).
   - Kuratierter 1-Klick-Install-Showcase (Dark Reader, uBlock Origin Lite, Bitwarden, ClearURLs, Violentmonkey).
   - Direkte Installation beliebiger Erweiterungen via Chrome Web Store URL (`chromewebstore.google.com/detail/...`) oder lokaler `.crx`- / `.zip`-Datei per Drag & Drop.
   - Management installierter Add-ons: Aktivieren/Deaktivieren, Berechtigungen einsehen, Pin-to-Toolbar, Update-Prüfung, Deinstallation.
3. **Säule 2: Nova AI Skills & MCP-Tools (Open Standard):**
   - Standardisierung des nativen Plugin-Systems auf das offene **Model Context Protocol (MCP)** der Linux Foundation / Anthropic.
   - **Kuratierte Built-in Skills:** ComfyUI Image Generation, ConPTY Terminal Executor, Supermemory Vector Search, Web Scraper, DevTools Inspector, File System Automator.
   - **Beliebige externe MCP-Server anbinden:** 1-Klick-Import oder Konfiguration über `mcp_servers.json` (kompatibel zum Claude Desktop / Codex Ökosystem) für lokale Prozesse (`stdio`) und Remote-Dienste (`sse`).
   - Visuelle Übersicht aller registrierten Tools, Ressourcen und Prompt-Templates pro Skill.

### 14.3 Workspace- & Kontext-Scoping [x]
1. **Säulen-spezifisches Scoping:**
   - **WebExtensions:** Global aktiv oder granular pro Tab/Profil isolierbar (z. B. Developer-Tools nur im Dev-Workspace, strikte Privacy-Erweiterungen im Default-Workspace).
   - **Nova AI Skills / MCP-Server:** Workspace-weises Aktivieren/Deaktivieren:
     - *Coding-Workspace:* Aktiviert ConPTY, Git-MCP, GitHub-MCP, Terminal-Tools.
     - *Recherche-Workspace:* Aktiviert Deep-Scraper, Per-Tab Summarizer, Memory-Synthesis, Arxiv-MCP.
     - *Design-Workspace:* Aktiviert ComfyUI, Image-Inspection, Color-Palette-Extractor.
2. **Dynamische Tool-Injektion in Nova AI:**
   - Nova lädt im aktiven Kontext nur die für den jeweiligen Workspace freigeschalteten Tools, um Context-Window-Bloat zu verhindern und Halluzinationen zu minimieren.

### 14.4 Granulares Sandboxing & Berechtigungsmanagement (Security First) [x]
1. **Transparente Berechtigungs-Klassifizierung:**
   - Jeder native Skill und MCP-Server deklariert seine benötigten Berechtigungen explizit:
     - `🛡️ read_only` (Dateien lesen, Suchen ausführen, Webseiten abfragen).
     - `⚠️ filesystem_write` (Dateien im Workspace anlegen oder ändern).
     - `🚨 terminal_execute` (Shell-Befehle oder ConPTY-Kommandos ausführen).
     - `🌐 network_outbound` (Externe HTTP/WebSocket-Anfragen außerhalb des Browsers senden).
     - `🤖 agent_autonomy` (Unüberwachte Multi-Step-Toolchains ausführen).
2. **Sicherheits-Gateways & Human-in-the-Loop:**
   - Kritische Werkzeuge (`terminal_execute`, Destructive File Writes) verlangen standardmäßig eine interaktive Bestätigung im Chat, es sei denn, der Nutzer setzt den Skill explizit auf *„Immer vertrauen (Auto-Approve)“*.
   - Übersicht aller gewährten Berechtigungen direkt im Hub mit 1-Klick-Widerruf.

---

## 11. Spezifikation Phase 15: DRM & Protected Media Streaming (Widevine System-Auto-Discovery) [x] (Umgesetzt v0.1.31 - Ansatz 3)

### 15.1 Ursachenanalyse: Netflix NSES-UHX & EME-Permissions
1. **Das Problem beim DRM-Streaming:**
   - Beim Aufruf geschützter Streaming-Dienste (Netflix, Spotify, Disney+, Prime Video) fragt die Web-Applikation über die W3C EME-Schnittstelle (`navigator.requestMediaKeySystemAccess('com.widevine.alpha', ...)`) nach einem Content Decryption Module (CDM).
   - Chromium verlangt dafür die Berechtigung `protected-media-identifier`.
   - In einer Deny-by-Default-Architektur (`permissions.ts`) wurde dieser Request bisher stillschweigend abgelehnt (`deny`), was im Web-Player von Netflix sofort zum Abbruch mit dem Fehlercode **`NSES-UHX`** führte.
2. **Standard-Electron ohne Bundled Widevine:**
   - Standard-Electron-Releases enthalten aus Lizenzgründen kein Widevine CDM von Google.
   - Ein direktes Hineinkopieren/Bundlen von Googles Binaries (`widevinecdm.dll`) in den Installer verletzt Googles Distributions-Vereinbarung und führt zu Ablehnungen bei der Microsoft Store-Zertifizierung.

### 15.2 Architektur Ansatz 3: System-Widevine Auto-Discovery
1. **Nutzung vorhandener OS-Lizenzen (Zero Store Risk):**
   - Auf Windows-Systemen ist Microsoft Edge zu 100% vorinstalliert und enthält ein vollwertiges, Google-signiertes und kontinuierlich aktualisiertes Widevine CDM unter:
     `C:\Program Files (x86)\Microsoft\Edge\Application\<Version>\WidevineCdm`
   - Ebenso hält Google Chrome (sofern installiert) eine signierte Kopie unter:
     `C:\Program Files\Google\Chrome\Application\<Version>\WidevineCdm`
   - Beide Quellen werden in Lastbrowser zur Laufzeit dynamisch inspiziert, ohne urheberrechtlich geschützte Fremd-Binaries im eigenen Installer auszuliefern.
2. **Erkennungs- & Registrierungs-Engine (`drm.ts`):**
   - Vor `app.whenReady()` durchsucht die Engine die bekannten Installationspfade nach `WidevineCdm/manifest.json`.
   - Die Versionsnummer wird geparst und das zur Plattform-Architektur passende CDM (`_platform_specific/win_x64/widevinecdm.dll` bzw. `win_arm64` / `win_x86`) ermittelt.
   - Bei Auffinden wird die Komponente über die Chromium-Switches registriert:
     ```ts
     app.commandLine.appendSwitch('widevine-cdm-path', cdmPath);
     app.commandLine.appendSwitch('widevine-cdm-version', cdmVersion);
     ```
3. **Permission-Whitelisting (`permissions.ts`):**
   - Aufnahme von `'protected-media-identifier'` in `ALLOWED_PERMISSIONS`.
   - Webseiten erhalten Zugriff auf die DRM-Decryption-Schnittstelle, ohne dass sicherheitskritische Rechte (Webcam, Mikrofon, Geolocation) unbemerkt geöffnet werden.

---

## 12. Checkliste für umsetzende Agenten

Jeder nachfolgende Agent arbeitet nach folgenden Regeln:

1. **Ein Fokus pro Durchlauf:** Genau einen Teilbereich (z. B. 13.1, 13.3, 14.2) bearbeiten.
2. **Einklappbarkeit bewahren:** Die Ein-/Ausklapp-Logik der Sidebar niemals entfernen, sondern auf die 3 definierten Modi (Expanded, 48px Slim, Hidden) optimieren.
3. **Keine Regressionen:** Nach jeder Änderung `npm run test:run` ausführen; alle bestehenden 528+ Tests müssen grün bleiben.
4. **Unit-Tests für neue UI-Logik:** Neue Komponenten, Workflows und Store-Zustände in `tests/` mit Vitest abdecken.
5. **Typensicherheit & Import-Integrität:** `npm run build` (`build:main` und `build:renderer`) müssen 0 TypeScript- und Vite-Fehler aufweisen. Keine ungebundenen JSX-Komponenten verwenden (jeder verwendete Bezeichner muss explizit importiert sein).
6. **Dokumentenpflege:** Nach erfolgreicher Umsetzung den Haken in diesem Zielbild (`[x]`) und im Backlog setzen.
7. **Panel-Integrität:** Beim Bearbeiten oder Refaktorisieren von Panels sicherstellen, dass alle Sub-Komponenten (z. B. `AdvancedWebUiTools`) sauber importiert sind und beim Mounten keine ReferenceErrors werfen.

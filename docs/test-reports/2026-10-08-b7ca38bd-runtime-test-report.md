# LastBrowser 0.1.48 B7CA38BD — praktischer VM-Testbericht

Prüfzeitraum: 2026-10-08, ungefähr 15:28–15:55 UTC (08:28–08:55 America/Los_Angeles). Auftrag `VM-B7CA38BD-TEST-ORDER-20261008.md` am Order-Commit `871832b60035417c90cb8da583b2152d16f47782`; Zusatzauftrag `AI_NEW_CHAT_20261008` gemäß B7-Auftrag Revision 2. Ergebniszweig: `codex/lastbrowser-electron-shell`. Historische 9A943-Berichte bleiben bestehen.

Umgebung: dedizierte Windows-11-Enterprise-Evaluation-VM, Build 26300, x64. Keine belegte Clean-Snapshot-ID. Computer Use war verfügbar: Windows-Fenstersteuerung über `@oai/sky` im Node-REPL. Der Skill `computer-use/26.1002.52244/skills/computer-use/SKILL.md` und seine API-/Guidance-/Confirmation-Dateien wurden gelesen. Reale Fenster wurden bedient; statische Source-Tests werden nicht als UI-Abnahme gewertet.

Providerturns, Modellinferenz, Modellinstallationen und Kosten: **0**. Keine Nachrichten gesendet, keine bestehenden Nutzer-Provider übernommen. Der Benutzer hat zuvor Ollama, Google und GPT verbunden; dieser Auftrag verlangt jedoch ein getrenntes synthetisches Profil und Budget 0. „Needs setup“ in diesem Profil ist daher kein Beleg, dass seine eingerichteten Provider funktionieren oder scheitern.

## Tatsächliche Kandidatenidentität

Sourcecommit `b7ca38bd6db7b8a6e5fd814bd322b4916f561e73`, Tree `30f2deb9301b12cf8908e6acd633893b64caa00d`; Release `test-v0.1.48-b7ca38bd-20261008`.

| Artefakt | Bytes | Tatsächlicher SHA-256 | Status |
|---|---:|---|---|
| Guest-ZIP | 348046583 | `a083d83bd1d94130ab68da8850882c3a833b7513d9c8008049b01d316c3aa95f` | PASS |
| Standalone-Manifest | 2873 | `33000f3447e5bb2f2718b30336d3abfcbe83f18fe5987bfe4218ae9ee2488101` | PASS |
| Setup-Wrapper, nicht ausgeführt | 174198313 | `c84618cd6da1f10010f445d443d39eb604c4dd489b41376a1c55928edad97c95` | PASS |
| Ausgeführter Portable-Wrapper | 173844132 | `560b367378fef4b60599dbbf82c6f7e23660e6b3d74f9ec42fbee5a1e4d28683` | PASS |
| ASAR im tatsächlich gestarteten Portable-Extraktionsbaum | 64092071 | `a196a883890cd33a68b0b02fdfb8f2cc8bf608e94fbf96b16e57578cb69b408b` | PASS |

Beide Wrapper waren erwartungsgemäß `NotSigned`. ZIP-Einträge wurden vor dem Entpacken auf Pfadüberschreitungen geprüft. Das eingebettete Manifest hat 2681 Bytes und ist absichtlich nicht identisch mit dem Standalone-Manifest. Die UI-Version wurde nicht im About-Dialog abgelesen; Versionsangabe aus Kandidatenmanifest, Ausführung aus Prozesspfad und ASAR-Pin gebunden.

Profil `B7-A` war neu und synthetisch; USERPROFILE, APPDATA, LOCALAPPDATA, TEMP, Downloads und Chromium-user-data-dir lagen in einem eigenen Testbaum. Keine Profil-Datenbank wird hochgeladen. Der lange temporäre Pfad ist eine relevante Testbedingung für den Modellstore-Fehler. Der Wrapper startete 15:28 UTC; die eigentliche Anwendung erschien erst etwa 15:30:38 UTC nach der Extraktion. Die Verzögerung wird nicht als Startabbruch bewertet.

## Ergebnisse nach Fall

Alle folgenden UI-Fälle verwenden die oben genannten Portable-/ASAR-Pins und den genannten Auftragscommit. Revision 1 gilt, außer beim ausdrücklich als Revision 2 bezeichneten Chatfall. Teilfälle werden getrennt gewertet; keine vollständige Feature-Abnahme.

| Test-ID / Teilfall | Status | Observed gegenüber Expected |
|---|---|---|
| `B7_FIRST_RUN` — Auswahl und Ohne-KI-Weg | PASS | Frisches Profil zeigte den tatsächlichen KI-Auswahldialog. „Ohne KI“ führte zunächst in den Browser-Einrichtungsassistenten; „Start LastBrowser“ öffnete die normale Shell. Kein Modelldownload, keine Inferenz. |
| `B7_FIRST_RUN` — Reload | PASS | Ctrl+R in der Shell zeigte keine erneute Erstauswahl. |
| `B7_FIRST_RUN` — KI-Weg in zweitem Profil / vollständiger Neustart | BLOCKED | Zweiter isolierter Start mit kurzem Profilpfad und prozesslokalem Netzwerkproxy wurde durch automatische Freigabeprüfung abgelehnt. Er wurde nicht ausgeführt. Ein kompletter Neustart mit Auswahlpersistenz ist nicht belegt. |
| `AI_NEW_CHAT_20261008`, Revision 2 — direkte Aktivierung | FAIL | „Neuer Chat“ legte Recent-Einträge an, öffnete aber weder beim ersten noch beim zweiten Klick den neuen Arbeitschat. Erst der separate Klick auf einen Recent-Eintrag öffnete ihn. |
| Derselbe Chatfall — Entwurf/Scope | FAIL | Nach Wechsel von sichtbarer Session `FCF47BAF` auf `D31F7B41` blieb der ungesendete Text `Guest focus check` im Composer. Erwartet war ein eindeutig neuer leerer Arbeitschat mit korrekt getrenntem Entwurf. Keine `Session not found`-Meldung beobachtet. |
| Derselbe Chatfall — automatische Fokusübernahme | NOT_TESTED | Helper meldete den äußeren Dokumentfokus, auch nachdem manuell der Composer fokussiert und erfolgreich darin getippt wurde. Exakter innerer Tastaturfokus nicht zuverlässig messbar; nicht als PASS ausgeben. Zeitproben sind separat gespeichert. |
| `B7_ADDRESS_IME_PROFILE` — History, Tastatur, explizite Suchoption | PASS | Eigene lokale Alpha-History erschien bei `127`; Down wählte Search, Up wieder History, Enter öffnete die lokale Seite. Die explizite Suchoption war sichtbar. Keine externe Suche abgeschickt. |
| Derselbe Fall — echte IME-Komposition | BLOCKED | Windows-Sprachliste enthielt ausschließlich en-US / Tastatur `0409:00000409`; keine echte IME-Kandidatenauswahl verfügbar. Keine simulierte Komposition als bestanden gemeldet. |
| Derselbe Fall — Browserprofil A→B→A | PASS | Unter Preferences separates Profil `Guest B7Profile B` erstellt und ausgewählt. B hatte keinen History-Vorschlag von A; nach Rückwechsel zu Default/A war er wieder vorhanden. |
| Derselbe Fall — Profilmenü | FAIL | Dropdown wurde visuell von darunterliegenden Karten überlagert; Klick auf Add erzeugte zunächst kein Profil. Erstellung und Wechsel gelangen über Tab/Return. Ursache nicht aus Source abgeleitet. |
| Zusätzliche Beobachtung — synthetische Space-Erstellung | FAIL | Wizard meldete `adapter_unsupported`, obwohl der neue Space anschließend vorhanden und auswählbar war. Das widersprüchliche Ergebnis wurde aufgenommen; kein zweiter Create-Versuch. |
| Derselbe Fall — privater Kontext | PASS / begrenzt | Ctrl+Shift+N erzeugte einen privaten Tab im selben Fenster. In ihm zeigte `127` nur Search, keine A-History. Ein separates privates Fenster wurde nicht erzeugt und ist NOT_TESTED. |
| Derselbe Fall — letzten Tab schließen | PASS / begrenzt | Privater Tab wurde geschlossen; der letzte reguläre Tab wurde anschließend über sein X geschlossen. Fenster blieb offen auf der leeren Startansicht; Sidebar zeigte weiterhin einen Starttab. Keine Aussage, dass das interne Tabmodell auf null fällt. |
| `B7_DOWNLOAD_PIN` — lokaler Download / Anzeigen | PASS | Synthetischer Loopback-Download, aktiver Top-Indikator und Downloadpanel; nach Abschluss untere Sidebar-Anzeige. Datei 1056000 Bytes, SHA-256 `29935f441a0d4cf21c8e7577bcbfd8acf407effba488e895768a56bdf6ee62b5`. |
| Derselbe Fall — Floating/Resize/Button-Dock | PASS | Floating-Panel am Header verschoben, am Griff vergrößert; Dock-Button platzierte es am Sidebar-Bereich. Schließen und Wiederöffnen im selben Lauf erhielt Größe/Position. |
| Derselbe Fall — Klickursprungsanimation / Drag-Dockziele / Neustartpersistenz | NOT_TESTED | Aktiver Download fotografiert, aber Animationsursprung nicht zeitlich erfasst. Einzelner Drag-Gesture liefert keine Zwischenaufnahme sichtbarer Dockziele. Snap durch Drag und Persistenz nach Prozessneustart nicht belegt. |
| Derselbe Fall — Tab auf Pinned Apps ziehen | FAIL | Lokalen Tab `guest.localhost:8877/alpha` vom Sidebar-Titel in bestehende App-Fläche und danach freie Fläche nahe Add gezogen. Kein neuer Pin; Tab blieb erhalten. |
| Derselbe Fall — Root/Subdomain beide Reihenfolgen, voller Pintitel nach Reload | BLOCKED | Drag erzeugte keinen Pin; Voraussetzung für die vorgeschriebene Deduplizierungssequenz fehlte. Kein Ersatz über andere Pin-Erstellung als Erfolg ausgegeben. |
| `B7_MODEL_ASSISTANT` — ehrlicher Unknown-Zustand | PASS / begrenzt | Sichtbarer Store zeigte CPU/RAM/GPU/Disk „Unbekannt“, keine erfundenen Messwerte. Advanced-Details waren in der sichtbaren Ansicht nicht ausgeklappt. |
| Derselbe Fall — bewusster Hardware-Scan | FAIL | Klick auf Hardware scannen lieferte keine Erkennung; `local_ai_path_too_long` und Hinweis, dass Hardwareprüfung/Einrichtung nicht verfügbar sei. Im langen Testpfad beobachtet; mit kurzem Pfad noch nicht gegengeprüft. |
| Derselbe Fall — Assistant/Connections | PASS / begrenzt | Kompakte Übersicht, Composer sichtbar, Connections aufklappbar. Nach anfänglichem Starting: 1 Connection, 0 Connected, 1 Setup required. Konfiguration wurde nicht als Live-Verbindung gewertet. |
| Derselbe Fall — schmaler Viewport / vollständige Tastaturbedienung | NOT_TESTED | Nicht ausgeführt vor dem getrennten Profilversuch. |
| `B7_GOALS_SCHEDULER_RIGHTS_QUICKCHAT` — Ausführungsfälle | BLOCKED | Keine ausdrücklich kontrollierte lokale Goal-/Scheduler-/Providerfixture identifiziert. Pause/Resume/Ende mit Revisionen, Dispatchfreiheit, Rechteentzug/Folgeaktion und Reset nach Stop/ACK nicht ausgeführt. Keine eigenständige Provider- oder autonome Fortsetzung erlaubt. |
| Derselbe Fall — Zustandsansicht/Reload, Summarize-Routing | NOT_TESTED | Noch keine gezielte Goal-/Scheduler-Ansicht, kein Summary-Aufruf; keine Abnahme aus sichtbarem Quickchat-Button. |
| Portable — Fenster schließen / vollständiger Quit | NOT_VERIFIED | Fenster-X entfernte das Fenster, Kandidatenwrapper, Hauptprozess und Backend blieben danach im Hintergrund. Daher kein vollständiger Quit-PASS. Eigene Testprozesse wurden anschließend beendet. |
| Setup / kompatibles Update / Deinstallation / Profilerhaltung | BLOCKED | Setup nicht ausgeführt. Belegte kompatible Baseline und Clean-Snapshot fehlen; kein Update mit Ersatzkandidat, keine Deinstallation bestehender Nutzerversion. |
| Clean-Windows-CRT / native Modulbaseline | NOT_VERIFIED | Kein unabhängiger Clean-Snapshot-/System32-/Modulbeleg. Portable-Start beweist dieses Gate nicht. |

## Reproduktion und Belege

Belege liegen in [evidence/b7-20261008](evidence/b7-20261008/). Dateinamen dokumentieren die beobachteten Schritte; keine Screenshots von Konten, Downloads-Vollpfaden oder Migrationspfaden aufgenommen.

1. Start/Ohne KI: `01-secure-session-check.png`, `02-first-run-choice.png`, `03-no-ai-shell.png`. Die anfängliche Secure-Session-Anzeige verschwand nach Backendstart. Im Einrichtungsassistenten wurde ein bestehender Migrationspfad erkannt, aber nichts importiert und kein Standardbrowser geändert; dieser Bildschirm wird wegen Profilpfad nicht hochgeladen.
2. AI-Reiter → Neuer Chat: `04` bis `09` und `focus-samples.json`. Erster Klick blieb noch nach ungefähr 12,4 Sekunden auf der Startseite. Recent-Eintrag geöffnet, Composer manuell angeklickt und synthetischen Text getippt, ohne Send. Zweiter New-Chat-Klick wurde nach 0,354 / 1,039 / 3,036 / 10,117 Sekunden erfasst: sichtbare alte Session und Entwurf blieben. Separater Klick auf neue Recent-Session änderte die ID, aber behielt den Entwurf; Rückwechsel ebenso. Fokusmetadata beschreibt den äußeren Dokumentknoten und ist nicht beweiskräftig für den inneren Composerfokus.
3. Assistant/Store: `10` bis `12`. Local-AI-Karte aus Settings geöffnet, Unknown-Zustand aufgenommen, Hardware-Scan bewusst betätigt. Keine Installationsbuttons und keine Modellturns. Unsichtbare/zusätzlich montierte Accessibility-Fragmente mit anderen Hardwaretexten werden nicht als sichtbare erfolgreiche Messung gewertet.
4. Download: eigener HTTP-Server ausschließlich Loopback-Port 8877, eigene HTML-Seite und synthetische Textdatei. Link geklickt, aktiven Download und unteren Indikator aufgenommen (`13`, `14`). Panel: Floating aktivieren, Header ziehen, Resize-Griff ziehen, Dock-Button, schließen/wiederöffnen. Die vollständige Dateipfad-Anzeige nach Abschluss wurde nicht hochgeladen. Klickursprung und Zwischen-Dockziele blieben unbewiesen.
5. History/Profile: `15`, `16`, `19` bis `22`. Query nach Titel `Guest` zeigte nur Search; Query nach `127` zeigte lokale History. Echte Browserprofile wurden unter Preferences ausgewählt. Separat versuchte Space-Erstellung war kein Browserprofiltest: Wizard meldete `adapter_unsupported`, Space `Guest B7 Beta` erschien trotzdem (`17`, `18`). Die geteilte Most-visited-Anzeige dieses Space wird ausdrücklich nicht als Browserprofil-Isolationsfehler gewertet.
6. Pin-Drag: Loopback-Hostname `guest.localhost` geladen, Titel `Guest B7 Local History Alpha`. Drag vom Tab zu zwei Bereichen innerhalb Pinned Apps; keine sichtbare Pin-Erstellung. `23-root-tab-drag-to-pinned-apps.png` dokumentiert den ersten erfolglosen Drop. Root/Subdomain-Deduplizierung wurde nicht behauptet.

## Grenzen und nächste Voraussetzungen

Nach Fenster-X waren Kandidatenprozesse weiter vorhanden. Ein Versuch, die extrahierte EXE über Computer Use wieder zu öffnen, erzeugte einen zweiten Hauptprozess ohne expliziten isolierten user-data-dir. Dessen Fenster wurde nicht als Testbeleg gelesen oder bedient; Prozessbaum sofort beendet. Diese Aktion ist kein isolierter Neustarttest. Danach wurde der ursprüngliche Testprozessbaum beendet; der Wrapper blieb zunächst vorhanden. Keine Produktdateien repariert.

Der folgende zusammenhängende Shell-Aufruf (verbliebenen Testwrapper beenden, neues kurzes Testprofil erzeugen, exakt erneut gehashten Portable mit prozesslokalem Proxy starten) wurde von automatischer Freigabeprüfung abgelehnt: `blocked by policy`, ohne spezifische sachliche Begründung. Der Aufruf wurde nicht ausgeführt; kein Umgehungsversuch. Zweiter Erststart, kurzer-Pfad-Hardware-Retest und restliche UI-Fälle sind damit offen. Ein vollständiger Neustart-/Quit-Nachweis fehlt.

Für Fortsetzung: zulässiger isolierter Kandidatenstart mit kurzem Profilpfad und ohne externe Downloads; echte IME für den IME-Fall; ausdrücklich kontrollierte lokale Fixtures für Goal/Scheduler/Rechte/Reset; belegte kompatible Baseline bzw. Clean-Snapshot für Update/Setup/CRT. Kein Budgetreset. Nur dieser Bericht und bereinigte UI-Belege werden committed; vorhandene Änderungen an Smoke- und Desktop-Runner-Skripten bleiben unangetastet.

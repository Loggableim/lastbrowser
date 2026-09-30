# Lastbrowser – Release-Readiness-Ziel

Dieses Arbeitsziel folgt der aktuellen Nutzeranweisung: Browser stabilisieren und releasefähig machen; vorerst keine neuen Produktfunktionen hinzufügen. Vorrang haben eine verlässliche Ollama-Cloud-Anbindung (Standardmodell `deepseek-v4.1-flash`), korrekt abgestimmte Teamwork-Ausführung und persistente Ziele.

Änderungen bleiben im bestehenden Monorepo und erhalten vorhandene Nutzerarbeit. Parallel-Agenten können für klar abgegrenzte Audits oder Fixes eingesetzt werden. Für jede Anforderung sind Implementierung, automatisierte Prüfung und echter Laufzeitnachweis getrennt zu dokumentieren.

## 1. Nachweiskriterien

- Ollama Cloud: Provider-Auflösung, Modellliste, Fehler-/Retry-Behandlung, Streaming und Teamwork-Pfad prüfen; keine Antwort aus Unit-Tests als echter Modellaufruf darstellen.
- Teamwork und persistente Ziele: Worker-/Quorum-Routing sowie Setzen, Lesen, Pause, Resume, Reload und Löschen prüfen.
- Release: aktuelle veröffentlichte Version, signierte Artefakte, Prüfsummen, Downloadseiten und Deployment-Quelle gegen Live-Belege abgleichen. Keine Version duplizieren.
- Browserabläufe: Quelltests und Builds belegen keine funktionierende Bedienung; UI-Smokes separat als solche ausweisen.

---

## 2. Aufgabenpakete im Detail

> **AKTUELLER PRÜFSTATUS (2026-09-30; Änderungen dieser Prüfung sind noch nicht veröffentlicht):** `npm test`: **127 Dateien / 1108 Tests bestanden**; `npm run verify:store`: **27/27**; Desktop-Main-/Renderer-Build und `python -m compileall -q services/sidekick` bestanden. Vite meldet weiter einen Renderer-Chunk von ca. 1,64 MB. Vollständige Sidekick-Suite: **2337 bestanden, 105 übersprungen, 0 fehlgeschlagen** (414,74 s). Gezielte Goal-/Ollama-Regressionen zuletzt: **108/108**.
> Ollama Cloud: Der gespeicherte Zugang lieferte live 16 Modell-IDs, einschließlich `deepseek-v4.1-flash`. Ein echter gestreamter Aufruf an diesen Endpunkt lieferte HTTP 200, Reasoning- und Antwort-Deltas sowie `finish_reason=stop`; ein minimaler vorangegangener Aufruf mit zu kleinem Tokenbudget lieferte keinen Antworttext. Das beweist die Provider-Pipeline im lokalen Sidekick, nicht die Darstellung im Lastbrowser-Chatfenster. Modellkatalog-Caches sind jetzt nach Endpunkt und Credential getrennt; Rohschlüssel werden nicht persistiert und Cachedateien werden bei Credentialänderungen invalidiert.
> Teamwork: Frühere Live-Aufrufe mit einem bzw. zwei Ollama-Modellen belegten Planung, Worker, Critic, Synthese und `teamwork_complete`. Persistente Ziele: Backendtests belegen Space-/Profil-Isolation, Lifecycle über Manager-Neustarts, Pause, Resume und Löschen. Der Browserkontext liest nun das Goal aus dem Space der zugehörigen Session; ein fehlender Profilpfad-Fallback wurde nach einem Antigravity-Codeaudit importiert und regressionsgeprüft. Echter App-Laufzeitnachweis und automatische Modellbewertung bleiben offen.
> Zugriffsschutz: Main-/Preload-/Renderer-Änderungen senden einen zentralen Sperrhinweis bei `401 Authentication required` an alle Browserfenster; der SSE-Chatstream verwendet das HttpOnly-Cookie. Gezielte Tests bestanden (49/49); der vollständige Desktoplauf enthält 1104 bestandene Tests. Eine echte Mehrfensterbedienung im installierten Browser wurde nicht geprüft.
> Release: GitHub veröffentlicht weiterhin **v0.1.38**. Die Setup- und Portable-Artefakte dieser Version waren zuvor als signiert mit passenden GitHub-SHA-256-Digests verifiziert; das ist kein neuer Signaturtest in diesem Prüflauf. Frische öffentliche Abrufe zeigen Start- und Downloadseiten weiterhin auf **v0.1.32** (DYNAMIC, kein bloßer CDN-Cache), während der aktuelle Branch Website-Quellen auf v0.1.38 enthält. Der Workflow veröffentlicht Installer, aber keinen Website-Deploy; Produktionsbranch und deployed Commit bleiben ohne Cloudflare-Pages-Projekteinstellungen unbestätigt. Keine neue Version oder Release erstellt.
> **Nachtrag dieser Fortsetzung (2026-09-30):** Der read-only Antigravity-Codeaudit wurde über das bereits geöffnete Antigravity-Fenster eingeholt. Er bestätigte veraltete Tests nach Entfernung des globalen Goal-Continuation-Markers und einen Frontend-Retrypfad, der bei einem explizit abgebrochenen Ziel einen alten Prompt erneut einreihen konnte. Goal-Fortsetzungen sind jetzt an Session/Profil/Space gebunden und Pause, Löschen, Resume oder ein neuer Prompt invalidieren ausstehende Übergaben; der konkrete HTTP 409 wird im Frontend als endgültig verworfen behandelt. Teamwork beachtet `hot_swap.enabled`, kehrt bei Abbruch zurück ohne auf blockierte Worker zu warten, und seine finale Synthese sendet Antwort- und Reasoning-Deltas inkrementell. Für Adapter, die trotz `stream=True` nur eine vollständige Antwort liefern, ist kein inkrementelles Streaming nachgewiesen. Aktuelle vollständige Prüfungen: `npm test` bestanden (127 Dateien / 1108 Tests), `npm run verify:store` 27/27, Desktop-Build bestanden (Vite-Warnung zu ca. 1,64-MB-Chunk), Python-compileall bestanden, Sidekick pytest **2334 bestanden / 105 übersprungen / 0 fehlgeschlagen**. Gezielte Stream-, Goal- und Teamwork-Regressionen: **71 bestanden**. Website-Changelog-/Provider-Korrekturen und Download-Regressionstest bestehen mit **4/4**; `git diff --check` sauber. Die Website-Quellen zeigen nun v0.1.38 als aktuelle Veröffentlichung; Produktion bleibt ungeprüft/unveröffentlicht, da Cloudflare-Pages-Deploy-Quelle und Zugriff nicht bestätigt sind. Keine neue Version, kein Commit, kein Push und kein Release erstellt.
> Antigravity-Codeaudit: Read-only Review des Ollama-, Streaming-, Teamwork-, Goals- und Auth-Pfads sowie gezielte Läufe (**Python 60 + 5**, Desktop **61 Tests**, Compileall erfolgreich). Die bestätigten Lücken sind behoben und durch Regressionen abgedeckt: Teamwork-Synthese aus `delta.data.content` wird live im Chat dargestellt; `<think>`-Inhalte fließen live in den Reasoning-Stream; während reiner Reasoning-Deltas bleibt der Arbeitsindikator aktiv und endet sauber beim Streamabschluss; das Ollama-Cloud-Modellcache wird beim Setzen oder Entfernen des eigenen Schlüssels verworfen. Die vollständigen aktuellen Testläufe bestehen. Die Lastbrowser-Runtime hat weiterhin 0 Antigravity-Konten; kein Antigravity-Inference- oder Browser-UI-Ende-zu-Ende-Test.
> UI-Abnahme: Der installierte Browserprozess ist `0.1.37` (lokale `FileVersionInfo`); CDP meldet Chromium `138.0.7204.251`. Space-/Audio- und Snap-Smokes lieferten zuvor begrenzte CDP-Evidenz; ein späterer kompletter Smoke blieb im Snap-Schritt über 90 Sekunden ohne Fortschritt und wurde abgebrochen. Cursor-Lupe konnte in frischem Testprofil wegen der Zugriffssperre nicht geprüft werden. Appearance-UI und Speicherung hatten erfolgreiche Readbacks, aber diese Runde belegt keine vollständige Abnahme aller Browserabläufe.
> Antigravity-Fortsetzungs-Audit: Computernutzung hat das offene Lastbrowser-Audit-Fenster verwendet. Es fand den ungebundenen Fallback-Aufruf `get_webui_home()` in `browser_runtime.py`; Import und Regressionstest wurden ergänzt. Der Read-only-Nachlauf meldete in Ollama-Cache, Goal-Isolation und Smoke-Harness keine weiteren konkreten Befunde. Kein Antigravity-Inference- oder Chat-UI-Ende-zu-Ende-Test wurde durchgeführt.
> **Nachtrag (2026-09-30, Ollama-/Goal-Fix):** Ein erneuter Live-Abgleich fand 17 Modelle am offiziellen Ollama-Cloud-Endpunkt, während die App zuvor aufgrund eines unterdrückten falschen Imports in `cli.models` nur ein veraltetes Registry-Listing erhielt. Import korrigiert; konfigurierte Zugangsdaten werden nun korrekt aufgelöst, die Live-Liste behält alle vom Account gelieferten Modelle und sortiert bekannte Modelle inklusive `deepseek-v4.1-flash` nach vorn. Account-bezogene Cacheeinträge gelten nur, wenn sie live vom offiziellen API-Endpunkt stammen; nicht verfügbare Stale-Registry-Modelle werden bei gesetztem Schlüssel nicht mehr als verfügbar angeboten. Der echte Sidekick-Stream mit DeepSeek v4.1 Flash lieferte Antwort- und Reasoning-Deltas; eine echte Teamwork-Pipeline mit Planner, Worker, Critic, Synthese und Abschluss wurde ebenfalls ausgeführt. Ein Goal-DB-Fallback wurde zusätzlich auf profilbezogene Isolation korrigiert. Aktuelle vollständige Prüfungen: Python **2337 bestanden / 105 übersprungen**, Desktop **1108 bestanden**, Store-Preflight **27/27**, Build und compileall bestanden, `git diff --check` sauber. CUA lieferte keine auswählbaren Antigravity-Fenster trotz laufender Prozesse; für diesen Nachtrag kein Antigravity-UI-Audit. Installierte Lastbrowser-App ist noch v0.1.37; keine aktuelle App-UI-Ende-zu-Ende-Prüfung. Änderungen noch uncommitted. Website-Deploy- und Signing-Blocker aus den vorigen Nachträgen bleiben bestehen.
> **UI- und Release-Fortsetzung (2026-09-30):** Die CUA-Oberfläche meldete weiterhin keine auswählbaren nativen Apps oder Antigravity-Fenster. Der bestehende isolierte Electron/CDP-Smoke lief dagegen vollständig: **66/66 Checks bestanden, 1 bewusst übersprungen**. Nachgewiesen wurden unter anderem Appearance-Persistenz, Zen-Sidebar-Hover, Space-Erstellung und aktive Auswahl, gepinnte Audio-WebView-Kontinuität über Space-Wechsel, Downloads, Snap-Zonen/Flyout/Resize, Split-Detach, Navigation und Mauslupe. Der erste Lauf hatte 65/66, weil der Smoke den React-Buttonzustand unmittelbar und synchron nach einem Klick las; die Produktzustände wurden anschließend korrekt gespeichert und gerendert. Der Smoke wartet nun auf den autoritativen persistierten Zustand. `npm test` danach: **127 Dateien / 1108 Tests bestanden**. Der Electron-Lauf nutzte ein isoliertes temporäres Profil und ist kein Test der installierten App oder des Chat-UI-Modellaufrufs. Release-Forensik bestätigt: GitHub v0.1.38 ist vorhanden, aber dessen Workflow wurde vor Test/Signierung/Verifikation abgebrochen; derzeit sind **0 von 7** erforderlichen Repository-Signatursecrets konfiguriert. Keine Signatur der veröffentlichten Installer durch den aktuellen Workflow belegt. Daher weder Version bump/tag noch erneuter Release. Dieser Smoke-Harness-Fix ist noch uncommitted.

### 🔴 Paket 1: Window Controls & Detached Window IPC-Bug (Kritisch) ✅
* **Zuständiger Subagent:** `Subagent 1: Window Controls Specialist`
* **Betroffene Dateien:**
  - [`apps/desktop/src/main/main.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/main/main.ts)
  - [`apps/desktop/src/main/window-controls.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/main/window-controls.ts)
  - [`apps/desktop/tests/window-controls.test.ts`](file:///c:/projekte/lastbrowser/apps/desktop/tests/window-controls.test.ts)
* **Symptom & Ursache:** Schließen eines ausgedockten Splitscreen-Tabs (`detachTab`) schließt das Hauptfenster, weil `registerWindowControlIpc(ipcMain, () => mainWindow)` hardcodiert auf `mainWindow` verweist.
* **Ziel-Implementierung:**
  1. Dynamische Auflösung des Fensters via `BrowserWindow.fromWebContents(event.sender) ?? getFallbackWindow()` in allen IPC-Handlern (`close`, `minimize`, `toggleMaximize`).
  2. Sekundärfenster zerstören, ohne den Main-Window Tray-Minimizer oder App-Quit zu triggern.
  3. Regressionstests in `window-controls.test.ts` ergänzen und absichern.

---

### 🟡 Paket 2: Zen-Sidebar mit 3 Zuständen & Slim-Dock im Zen-Overlay ✅
* **Zuständiger Subagent:** `Subagent 2: Zen Ergonomics Specialist`
* **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/stores/usePanelStore.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/stores/usePanelStore.ts)
  - [`apps/desktop/src/renderer/App.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/App.tsx)
  - [`apps/desktop/src/renderer/components/SidekickSidebar.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/SidekickSidebar.tsx)
  - [`apps/desktop/src/renderer/styles.css`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/styles.css)
* **Symptom & Anforderung:**
  1. Im Zen-Modus (`sidebarMode === 'hidden'`) öffnet Mouse-over am linken Rand (`.zen-left-hover-sensor`) das Sidebar-Overlay.
  2. Klick oben rechts auf *Minimieren* (`PanelLeftClose`) darf den Zen-Modus **nicht verlassen**, sondern schaltet das Overlay auf die kleine Bar (`slim` / 48px NovaDock) um.
  3. Bei weiterem Mouse-over/leave fährt künftig die **kleine Bar (`slim`)** ein und aus. Der Zen-Modus bleibt im Hintergrund aktiv.
* **Ziel-Implementierung:**
  1. Zustand `zenFloatingMode: 'expanded' | 'slim'` in `usePanelStore` / `App.tsx` verankern.
  2. Collapse-Button steuert bei `isFloatingOverlay === true` diesen State, ohne `sidebarMode` zu verändern.
  3. CSS-Transitionen in `styles.css` für `.zen-sidebar-overlay .sidekick-sidebar.slim` (48px) ohne Flackern glätten.

---

### 🟢 Paket 3: Tab Pinning, RAM-Schutz & Space-übergreifendes Audio ✅
* **Zuständiger Subagent:** `Subagent 3: Tab Lifecycle & Audio Specialist`
* **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/tabs.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/tabs.ts)
  - [`apps/desktop/src/renderer/stores/useTabStore.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/stores/useTabStore.ts)
  - [`apps/desktop/src/renderer/components/SidekickSidebar.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/SidekickSidebar.tsx)
  - [`apps/desktop/src/renderer/App.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/App.tsx)
* **Symptom & Anforderung:**
  1. Jeder Tab in der Sidebar benötigt eine sichtbare Pin-Aktion (`onPinTab(tab.id)`).
  2. Gepinnte Tabs dürfen niemals durch den Memory Saver (`discardTabById`, `discardInactiveTabs`) eingefroren werden.
  3. **Space-Audio Kontinuität:** Beim Space-Wechsel in `handleSpaceSelect` (`App.tsx`) dürfen gepinnte Tabs, die Audio abspielen (`pinned && isPlayingAudio`, z. B. YouTube Music), weder gemutet (`setAudioMuted(true)`) noch ungemountet werden. Musik muss nahtlos weiterspielen.

---

### 🎨 Paket 4: Appearance-Engine (Themes, Skins, Typografie & A11y) ✅
* **Zuständiger Subagent:** `Subagent 4: Appearance & Theming Specialist`
* **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/panels/SystemPanels.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/panels/SystemPanels.tsx)
  - [`apps/desktop/src/renderer/App.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/App.tsx)
  - [`apps/desktop/src/renderer/styles.css`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/styles.css)
* **Symptom & Anforderung:**
  1. **Glassmorphism:** Die 4 Stufen (Solid, Subtle, Modern, Deep) müssen live auf `root.dataset.glassLevel` geschrieben werden und CSS-Variablen `--glass-blur`, `--glass-bg` und `--glass-border` steuern.
  2. **Basis-Themes & Light-Fix:**
     - Reparatur des `light`-Themes (Lesbarkeit aller Texte, Input-Felder, Dropdowns und Icons herstellen).
     - **Neues Theme „Vision Impaired“:** Reiner Maximal-Kontrast (Hintergrund tiefschwarz `#000000`, Text schneeweiß `#FFFFFF`, Akzente gelb `#FFD700` / cyan `#00FFFF`, Mindestschriftgröße 16px sans-serif, 2px Elementränder und 3px Fokus-Outlines).
  3. **Akzentfarben & Skins:** Live-Aktualisierung von `--accent-primary` und `--accent-glow` bei Klick auf Skins oder Farb-Picker.
  4. **Typografie & UI-Seitenzoom:** Live-Anwendung von `font_size` (12px, 14px, 16px, 18px) und `default_zoom` (80%–150%) auf die gesamte Browser-Oberfläche.

---

### ⚓ Paket 5: Nova Dock – Positionen (Rechts, Oben, Unten, Schwebend) & Anti-Clipping ✅
* **Zuständiger Subagent:** `Subagent 5: Nova Dock Architect`
* **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/NovaDock.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/NovaDock.tsx)
  - [`apps/desktop/src/renderer/components/SidekickSidebar.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/SidekickSidebar.tsx)
  - [`apps/desktop/src/renderer/App.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/App.tsx)
  - [`apps/desktop/src/renderer/styles.css`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/styles.css)
* **Symptom & Anforderung:**
  1. **Entkopplung:** `<NovaDock />` aus dem linken Sidebar-`<aside>` entkoppeln und bei alternativen Positionen auf Shell-Ebene rendern.
  2. **Position Oben:** Bei Autohide Slide-Down über die Adressleiste; ohne Autohide saubere doppelte Topleiste.
  3. **Position Unten:** Fixierte Dock-Leiste am unteren Bildschirmrand bzw. Autohide Slide-Up.
  4. **Position Rechts:** Vertikales Dock am rechten Bildschirmrand.
  5. **Position Schwebend (Floating):** Frei verschiebbares Overlay mit Drag-Handle, Ausrichtungs-Umschalter (Horizontal vs. Vertikal) und persistenter Position.
  6. **Anti-Clipping:** Container-Paddings und `overflow: visible`, damit Fisheye-Icon-Vergrößerungen (bis 2.0x) niemals beschnitten werden.

---

### 💬 Paket 6: Copilot & Chat-Layouts Sanierung ✅
* **Zuständiger Subagent:** `Subagent 6: Chat UI & Message Stream Specialist`
* **Betroffene Dateien:**
  - [`apps/desktop/src/renderer/components/CopilotSplitView.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/CopilotSplitView.tsx)
  - [`apps/desktop/src/renderer/panels/NativeChatMain.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/panels/NativeChatMain.tsx)
  - [`apps/desktop/src/renderer/styles.css`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/styles.css)
* **Anforderung:**
  - Die 3 Layout-Modi (*Bubbles*, *Compact Stream*, *Expanded Document Canvas*) fehlerfrei implementieren.
  - Sauberes Rendering ohne horizontalen Overflow für Code-Blöcke (`pre`, `code`), Grounding-Zitate und Process-Cards (`TeamworkProcessCard`, `SmartTrackProcessCard`).

---

### 🔄 Paket 7: Sidekick-Standalone-Migration im First Launch Assistant ✅
* **Zuständiger Subagent:** `Subagent 7: Onboarding & Migration Specialist`
* **Betroffene Dateien:**
  - [`apps/desktop/src/main/services.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/main/services.ts)
  - [`services/sidekick/web/api/onboarding.py`](file:///c:/projekte/lastbrowser/services/sidekick/web/api/onboarding.py)
  - [`apps/desktop/src/renderer/components/FirstRunSetupPane.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/FirstRunSetupPane.tsx)
* **Anforderung:**
  1. IPC-Erkennung: `%USERPROFILE%\.sidekick`, `%APPDATA%\sidekick`, `config.yaml`, `supermemory.db` abfragen.
  2. Backend-Endpunkt zur sicheren Datenübernahme bereitstellen.
  3. Im Onboarding-Wizard eine Selektionskarte mit Checkboxen (Spaces, Erinnerungen, Profile) und 1-Klick-Import einbinden.

---

### 🛡️ Paket 8: Quality Gatekeeper & Verifikation ✅
* **Zuständiger Subagent:** `Subagent 8: Quality Assurance & Preflight Gatekeeper`
* **Prüf-Mandat:**
  1. Kontinuierliche Überwachung der Testergebnisse via `npm test`.
  2. Ausführung des Microsoft Store Preflights: `npm run verify:store` (27/27 `[PASS]`).
  3. Vollständiger Build-Check: `npm --workspace apps/desktop run build`.
  4. Backend-Python-Check: `python -m compileall -q services/sidekick`.

---

## 3. Direktiven für Multi-Agenten-Ausführung

1. **Autonome Dekomposition:** Sobald dieser Auftrag aktiviert wird, spawnt der Haupt-Agent die Subagenten parallel mit ihren jeweiligen Bounded Contexts.
2. **Keine ungebundenen JSX-Variablen:** Vor jedem Renderer-Build sicherstellen, dass alle Komponenten explizit importiert sind.
3. **Schutz bestehender Funktionen:** Keine bestehenden Audio- oder Tab-Mechaniken entfernen, sondern gezielt erweitern.
4. **Dokumentation:** Nach Abschluss jedes Pakets die Checkbox im Master Goal (`[x]`) setzen.

> Die darunterliegenden Arbeitspakete dokumentieren frühere Implementierungsaufträge. Ihre Häkchen sind kein Abnahmenachweis für das aktuelle Release-Ziel.

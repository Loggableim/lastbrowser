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

> **AKTUELLER PRÜFSTATUS (2026-09-30, HEAD f5dcdf2):** `npm test` besteht mit **127 Dateien / 1100 Tests**, `npm run verify:store` mit **27/27**, Desktop-Build und `python -m compileall -q services/sidekick` ebenfalls. Der Build meldet weiterhin einen Renderer-Chunk über 500 kB. Die vollständige Sidekick-pytest-Suite besteht mit **2302 bestanden, 105 übersprungen, 0 fehlgeschlagen** (397,90 s). Zuletzt gezielte Ollama-/Teamwork-/Goal-Regressionen: **220 bestanden, 8 übersprungen**.
> Backend-Laufzeitnachweis aus dem vorherigen Lauf: ein echter Ollama-Cloud-Aufruf mit `deepseek-v4.1-flash` lieferte ein erstes Stream-Delta. Ein echter Backend-Teamwork-Durchlauf mit einem Worker lieferte `delta` und `teamwork_complete`; persistente Goals bestanden Setzen, Status, Pause, Resume, Reload und Löschen. Dies belegt weder die Browser-UI noch mehrere Anbieter im selben Teamwork-Lauf.
> Release: GitHub veröffentlicht **v0.1.38**. Die lokalen Setup- und Portable-Dateien sind Authenticode-signiert; ihre SHA-256-Werte stimmen mit den GitHub-Asset-Digests überein. Der zugehörige Release-Workflow war abgebrochen; es wurde kein neuer Release erstellt.
> Website: Commit `f5dcdf2` aktualisiert die Repo-Quellen auf v0.1.38 und wurde auf `codex/lastbrowser-electron-shell` gepusht. Ein frischer öffentlicher Abruf zeigt weiterhin v0.1.32; die Download-Proxy-URLs liefern dort HTML statt Installer. Die ausgelieferten Dateien entsprechen `origin/main` bei `4689cbd`, also einem älteren Website-Stand. Der Cloudflare-Pages-Produktionsbranch bzw. die verbundene Quelle ist ohne Dashboard/API-Zugriff nicht bestätigt.
> UI-Abnahme: In diesem Prüflauf gab es keinen aktuellen Laufzeittest der installierten Browser-UI. Unit-Tests und Quell-Smokes sind kein Nachweis für Appearance-, Sidebar-, Snap-, Provider- oder Space-Abläufe im installierten Browser.

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

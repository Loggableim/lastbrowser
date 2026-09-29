# Lastbrowser & Nova AI – Master Goal: Maximal-Paralleles Swarm-Debugging & Feature-Exzellenz

> **MANDATORY INSTRUCTION FOR AUTONOMOUS AGENTS (SWARM ORCHESTRATION):**  
> Dieses Dokument definiert das **verbindliche, persistente Ziel** für Lastbrowser.  
> **MAXIMALE SUBAGENTEN-EFFIZIENZ:** Der Haupt-Agent soll dieses Ziel nicht sequenziell im Monolog abarbeiten, sondern Aufgabenpakete sofort in **parallele Subagenten (`invoke_subagent`)** zerlegen.  
> Jeder Subagent übernimmt einen eigenständigen, klar abgegrenzten Arbeitsbereich (gemäß den Isolationsregeln in [`AGENTS.md`](file:///c:/projekte/lastbrowser/AGENTS.md)), implementiert die Lösung, verifiziert sie lokal mit Unit-Tests und meldet Vollzug an den Lead-Orchestrator.

---

## 1. Subagenten-Allokationsmatrix (Parallele Schwarm-Aufteilung)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        LEAD ORCHESTRATOR (Lead Agent / Antigravity)                    │
├────────────────────┬────────────────────┬──────────────────────┬───────────────────────┤
│ SUBAGENT 1 (Main)  │ SUBAGENT 2 (Zen)   │ SUBAGENT 3 (Audio)   │ SUBAGENT 4 (Appr)     │
│ Window Controls &  │ Zen-Mode Hover &   │ Tab Pinning, RAM     │ Themes, Skins,        │
│ Detached IPC       │ Slim-Bar Retention │ Discard & Space-Audio│ A11y & Typografie     │
├────────────────────┼────────────────────┼──────────────────────┼───────────────────────┤
│ SUBAGENT 5 (Dock)  │ SUBAGENT 6 (Migr)  │ SUBAGENT 7 (Chat)    │ SUBAGENT 8 (Gate)     │
│ Nova Dock Position │ First-Run Wizard   │ Copilot & Chat-      │ Quality Gatekeeper:   │
│ & Floating Overlay │ Standalone-Import  │ Layout-Sanierung     │ Tests, Preflight, Bld │
└────────────────────┴────────────────────┴──────────────────────┴───────────────────────┘
```

---

## 2. Aufgabenpakete im Detail

> **AKTUELLER PRÜFSTATUS (2026-09-29):** Vollständige Desktop-Gates bestehen: `npm test` **125 Suites / 1079 Tests**, `npm run verify:store` **27/27**, Main-/Renderer-Build ohne Fehler (Vite-Bundle 1,638 MB, über dem 500-kB-Richtwert), Python-`compileall` erfolgreich und Sidekick-Suite **2274 bestanden / 105 übersprungen** (514 s). Der isolierte Electron/CDP-Source-Smoke bestand **65/65, 1 bewusst übersprungen**. Live geprüft wurden Downloads, Appearance-Vorschau und Settings-Readback, Zen-Hover, Space-Erstellung/-Auswahl mit angehefteten Apps, Audio desselben WebView-Gasts über Space-Wechsel, Snap-Flyout/Vorschau, asymmetrisches Quad-Resizing ohne Verschieben der Gegenseite, Trio mit leerem Slot, Aktivieren/Maximieren/Schließen/Herauslösen, Navigation/History, Permissions, Erweiterungsablauf und Rücknavigation im abgetrennten Fenster. Profil-/Inkognito-Isolation **12/12** wurde zuvor mit echten WebView-Cookies und `localStorage` geprüft. Appearance-Smoke **14/14**; Zoom wurde nach Scrollen des Sliders und echten Pointer-Events auf 125 gesetzt und im Settings-Readback bestätigt.
>
> Doctor wurde isoliert mit dem Quellstand ausgeführt: Visual- und Rohansicht zeigen **38 bestanden, 0 Warnungen, 0 Fehler**. Der installierte Browser ist **0.1.36**; dessen Antigravity-Datei hat tatsächlich den fehlenden `@dataclass`-Dekorator und verursacht „takes no arguments“. Der aktuelle Quellstand und der ältere 0.1.37-Entpackstand enthalten den Dekorator. Nach einem falschen OAuth-`state` kann der gültige Callback nun weiterhin abgeschlossen werden; zwei gezielte Tests bestehen. Modellrouting speichert Provider getrennt je Space und sendet `model_provider`; **45 gezielte Tests** bestehen.
>
> Provider: Vorherige Live-Aufrufe an Ollama Cloud und OpenRouter Free waren erfolgreich, sind aber kein aktueller Nachweis nach dem Provider-Routing-Fix. Doctor-Connectivity allein belegt keine Modellantwort. Echter Google-/Antigravity-Login und Round-Robin, Anthropic-/Codex-Chat sowie Teamwork-/Smart-Track-Generierung in der laufenden App sind nicht nachgewiesen.
>
> Release: GitHub zeigt **v0.1.34** als neuesten öffentlichen Release; lokal ist **0.1.37** die Paketversion. Installiert ist v0.1.36. Vorhandene lokale v0.1.37-Installer sind signiert, aber älter als der aktuelle Quellstand. Der frische Build liegt unter `apps/desktop/release/local-test-final`; der Paket-Smoke läuft. VMP-Signing scheiterte beim Transfer von 140/195,6 MB nach 1172,7 Sekunden. Der lokale Installer und die gepackte App sind `NotSigned`; der Hook hat den Fehler nicht fail-closed behandelt. Dieser Testbuild wird nicht als Release ausgegeben. Website-/Versionsabgleich sowie Provider-Live-Tests bleiben offen. Änderungen sind uncommitted; laufende Nutzerprozesse und die ungetrackte Builder-Konfiguration bleiben erhalten.

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

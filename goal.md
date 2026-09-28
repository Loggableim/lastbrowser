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

> **AKTUELLER PRÜFSTATUS (2026-09-28):** Frühere „umgesetzt und verifiziert“-Markierungen dokumentieren Implementierungsstände und keinen vollständigen aktuellen Abnahmenachweis. Aktuelle automatisierte Gates: `npm test` **117 Suiten / 1001 Tests bestanden**, Store-Preflight **27/27**, Desktop-Build erfolgreich (Vite meldet weiterhin ein 1,54-MB-JavaScript-Bundle über dem 500-kB-Richtwert), Python-`compileall` erfolgreich; die Sidekick-Suite bestand **2208 Tests / 105 übersprungen**. Der aktuelle isolierte Electron/CDP-Source-Smoke bestand **42/42**: Snap-Zonen, Vorschau/Flyout, Quad-Wechsel, Größenänderung auf 66,67 % × 66,67 %, Aktivieren/Maximieren/Schließen/Herauslösen, Nova-Dock-Fisheye, Downloads-Positionen/Drag/Minimieren, Space-Einrichtung/-Auswahl mit vier angehefteten Apps, Audio-Kontinuität desselben ungemuteten WebView-Gasts, Navigation/History und Detach mit echtem Back/Forward wurden live geprüft. Nach dem Detach führte Back zu `example.com`, Forward zur IANA-Testseite. Die Cursor-Lupe nahm über den WebView-Gast-Capture einen tatsächlichen 64×64-Seitenausschnitt mit sichtbaren Pixeln auf; das aktivierte UI-Overlay zeigte ein 90×90-Bild. Der Smoke navigierte zwischen Browser und Settings ohne React-Hook-Order-Fehler. Er beweist nicht jede Appearance-Option, Benachrichtigungspräferenz, Zen-Hover-Variante, i18n-Textfläche, Google-OAuth-Anmeldung oder den gesamten Providerbetrieb.
>
> Live-Providerbefunde: OpenRouter Free `liquid/lfm-2.5-2.6b:free` antwortete über den Lastbrowser-Chatpfad mit `OK` und `stream_end`. Ollama Cloud lieferte HTTP 200 für Sitzung, Chatstart und SSE-Heartbeat, aber innerhalb des 35-Sekunden-Limits weder Modellantwort noch Abschlussereignis. Das ist kein erfolgreicher Ollama-Chatnachweis. Google-Login/Round-Robin, Anthropic- und OpenAI-API-Key-Aufrufe sowie ein echter Google-Antigravity-Subscription-Connector sind nicht live bestätigt.
>
> Öffentlich ist GitHub-Release **v0.1.34**; ein `v0.1.35`-Tag existiert nicht. Lokale Version **0.1.35**-Installer und `win-unpacked/Lastbrowser.exe` melden `NotSigned` und belegen daher keine erfolgreiche Signierung. Der geänderte Release-Workflow ist strukturell fail-closed: Signier-Zugangsdaten, Authenticode, VMP und Metadaten-/Checksum-Prüfungen laufen vor dem Publish. Ein erfolgreicher signierter CI-Lauf für v0.1.35 fehlt weiterhin. Der Branch ist `codex/lastbrowser-electron-shell`, sechs Commits ahead; der Arbeitsbaum enthält zahlreiche bestehende, uncommittete Änderungen, die erhalten bleiben. Es gibt **keinen** neuen Commit, Push, Tag oder Release. Eine frühere Runtime-Prüfung meldete zwei laufende Sidecars, einen Schema-4-Marker gegenüber Paketierer-Schema 5 sowie verfügbares `openai`, aber fehlendes `anthropic`; diese Runtime-Paketlage wurde in diesem Prüflauf nicht erneut untersucht. Stabilität und Release-Readiness haben Vorrang; weitere Produktfunktionen bleiben zurückgestellt, bis der aktuelle Umfang und die Signier-/Veröffentlichungskette erfüllt sind.

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

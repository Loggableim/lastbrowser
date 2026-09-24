# Übergabe & Follow-Up Prompt für den nachfolgenden Agenten

> **Status:** Alle Zwischenstände sauber getestet (`npm test` 558 Tests grün, `npm run verify:store` 27/27 PASS, Build fehlerfrei), committet und auf `origin/codex/lastbrowser-electron-shell` gepusht (`a1d8c51`).

---

## Kopierbarer Prompt für den nächsten Agenten

```markdown
Du übernimmst die Weiterentwicklung von Lastbrowser aus dem Branch `codex/lastbrowser-electron-shell`.
Lies zuerst verbindlich `AGENTS.md` und `goal.md`.

### Bereits erledigter & geprüfter Stand:
1. Website `lastbrowser.com` aktualisiert & live (v0.1.31 veröffentlicht).
2. Widevine DRM & Netflix-Streaming Whitelisting vollständig implementiert und getestet.
3. `PinnedAppModal` Overlay im Haupt-App-Tree gemountet (Top 64 Katalog + Custom URL).
4. GitHub-Icon in der Topleiste durch ein Bug-Icon mit Direktlink zu `https://github.com/Loggableim/lastbrowser/issues` ersetzt.
5. Kontrast-Fix für das Modellauswahl-Dropdown (`.model-group-title`, High-Contrast Dark Theme) umgesetzt.
6. Alle 67 Test-Suites (558 Tests) sind grün, Store-Verification (27/27) besteht, Build ist sauber.

### Deine nächsten Aufgaben (gemäß `goal.md`):

1. **Zen-Mode Adressleisten-Autohide (Paket 4.2):**
   - Wenn `sidebarMode === 'hidden'`, soll die obere `ModernTitlebar` nach oben weggleiten (`transform: translateY(-100%)`, `transition: transform 0.25s ease`).
   - Einblendung bei Mouseover an die oberste Kante (Hover-Zone / Trigger) oder bei Fokus auf die Adressleiste via `Ctrl+L`.

2. **Multi-Tab Splitscreen (Paket 4.4):**
   - Drag & Drop von Tabs: Ziehen eines Tabs aus der Sidebar auf einen anderen Tab oder in den Webview-Viewport aktiviert Splitscreen (2 Tabs 50/50, 3 Tabs Drittel, 4 Tabs 2x2 Grid).
   - Zustand in `useTabStore.ts` verwalten (`splitTabIds: string[]`), Rendering mehrerer `<webview>`-Container nebeneinander im Browser-Canvas.

3. **Nova Chat Session Management (Paket 4.1 / Paket 3):**
   - Button "+ Neuer Chat" / Reset in `CopilotSplitView.tsx` und `NativeChatMain.tsx`, um frische Sessions zu starten.
   - Automatische Titelgenerierung für neue Chats aus dem ersten User-Prompt.
   - Durchsuchbare Chat-Historie in der Sidebar / Drawer.

4. **First-Launch Wizard Erweiterungen (Paket 2):**
   - In `FirstRunSetupPane.tsx`: Hervorhebung der Top-3 LLMs (Google Gemini CLI mit Quota-Erkennung, ChatGPT CLI, Ollama).
   - Abfrage für Browser-Profil-/Passwort-Import (Chrome, Edge, Firefox, Brave) und Windows-Standard-Browser Registrierung.

### Qualitäts-Gates vor jedem Commit:
- `npm test` (alle 67+ Suites müssen grün sein)
- `npm run verify:store` (27/27 PASS)
- `npm --workspace apps/desktop run build` (0 Fehler)
- `python -m compileall -q services/sidekick` (Exit Code 0)
```

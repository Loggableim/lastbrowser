# Übergabe & Statusbericht – Lastbrowser & Nova AI

> **Status:** Alle Kernpakete 1 bis 5 aus `goal.md` sowie alle aktuellen Bugfixes (Google/Gmail BotGuard Anti-Detection, Netflix & Disney+ DRM-Wiedergabe, Ollama Cloud Setup `base_url`-Auflösung) sind vollständig implementiert, getestet und auf `codex/lastbrowser-electron-shell` gepusht.
> 
> **Qualitäts-Gates:**
> - `npm test`: **68/68 Test-Dateien bestanden, 585 Tests grün** (0 Fehler).
> - `npm run verify:store`: **27/27 Checks bestanden (`[PASS]`), 0 Failures**.
> - `npm --workspace apps/desktop run build`: **0 TypeScript-Fehler, 0 Vite-Fehler**.
> - `python -m compileall -q services/sidekick`: **Exit Code 0, 0 Warnungen**.

---

## 1. Neueste Fehlerbehebungen & Erweiterungen (Aktueller Stand)

### A. Google / Gmail Login („Dieser Browser oder diese App ist unter Umständen nicht sicher“)
- **Ursache:** 
  1. Durch `--remote-debugging-port` aktivierte Chromium standardmäßig das Blink-Feature `AutomationControlled`, wodurch `navigator.webdriver = true` gesetzt wurde. Google BotGuard erkennt dies sofort.
  2. Chromium sendet User-Agent Client Hints (`Sec-CH-UA` und `Sec-CH-UA-Full-Version-List`), welche standardmäßig `"Electron";v="37"` enthielten, selbst wenn der normale `User-Agent`-Header bereits bereinigt war.
- **Lösung:**
  - In `apps/desktop/src/main/main.ts` den Switch `app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');` registriert (deaktiviert `navigator.webdriver`).
  - In `apps/desktop/src/main/auth-window.ts` die Funktion `sanitizeSecChUa()` implementiert, die `"Electron"`- und `"Lastbrowser"`-Tokens aus `Sec-CH-UA` und `Sec-CH-UA-Full-Version-List` entfernt und standardkonforme Google Chrome Brands einsetzt.
  - In `main.ts` über `targetSession.webRequest.onBeforeSendHeaders` alle ausgehenden Requests session-übergreifend bereinigt.
  - In `app.on('web-contents-created')` sichergestellt, dass jeder WebContent den bereinigten Chrome User-Agent nutzt.

### B. Netflix & Streaming DRM-Wiedergabe
- **Ursache:**
  1. Widevine CDM Auto-Discovery ermittelt die neueste Version aus Edge/Chrome (`4.10.3112.0`).
  2. Der Ghostery-Adblocker blockierte Netflix-Telemetrie- und Lizenz-Endpunkte (`*.netflix.com/nq/`, `ichnaea.netflix.com`, etc.), was zu NSES-UHX Player-Crashes führte.
- **Lösung:**
  - In `apps/desktop/src/main/main.ts` den Chromium-Switch `app.commandLine.appendSwitch('enable-features', 'WidevineCdm');` hinzugefügt.
  - In `apps/desktop/src/main/adblock.ts` eine Whitelist für Netflix (`*.netflix.com`, `*.nflxvideo.net`, `*.nflximg.net`, `*.nflxext.com`) und Disney+ Lizenz-Endpunkte implementiert, sodass DRM- und Wiedergabe-Pipelines unterbrechungsfrei laufen.
  - Alle Webviews besitzen `plugins="true"`, `allowpopups="true"` und `webpreferences="contextIsolation=yes, plugins=yes"`.

### C. Ollama Cloud Aktivierungsfehler („base_url is required for custom endpoints“)
- **Ursache:**
  - `_SUPPORTED_PROVIDER_SETUPS['ollama']` in `services/sidekick/web/api/onboarding.py` verlangte `requires_base_url: True`, fiel jedoch nicht auf `default_base_url` zurück, wenn der Client keine explizite URL übermittelte.
  - Weder Frontend noch IPC-Bridge übermittelten `base_url` bei `applyCloudSetup`.
- **Lösung:**
  - In `services/sidekick/web/api/onboarding.py` für `ollama` und den neuen Eintrag `ollama-cloud` den Fallback auf `default_base_url` (`http://localhost:11434/v1` bzw. `https://ollama.com/v1`) implementiert.
  - In `services/sidekick/web/api/config.py` Standardmodelle für `ollama` und `ollama-cloud` hinterlegt.
  - In `apps/desktop/src/main/sidekick-api.ts` `CloudSetupRequest` um `baseUrl?: string` erweitert und im Request-Body an `/api/onboarding/setup` weitergereicht.
  - In `apps/desktop/src/renderer/components/FirstRunSetupPane.tsx` und `App.tsx` das optionale Server-Endpoint-Feld integriert.

---

## 2. Zusammenfassung aller Meilensteine (Pakete 1 bis 5)

1. **Paket 1 (System-Engine & MCP):** Live-angekoppelter MCP JSON-RPC 2.0 Client (`stdio`/`sse`), 40 administrative CLI-Subcommands in Command Palette (`Ctrl+K`), 3-Tier Supermemory Vector Engine (Gemini / Ollama / BM25).
2. **Paket 2 (First-Launch Wizard):** Dominante Top-3 LLMs (Gemini CLI, ChatGPT, Ollama), Fremdbrowser-Import (Chrome, Edge, Firefox, Brave), Standardbrowser-Registrierungsabfrage, Pinned-Apps Favoritenauswahl.
3. **Paket 3 (Nova AI Chat Experience):** Session-Management mit „+ Neuer Chat“, automatische Titelerstellung, Verlaufs-Historie, Kontrast-Fix im Modell-Dropdown.
4. **Paket 4 (Shell Ergonomie & Multi-Tab Splitscreen):** Zen-Mode Omnibox-Autohide (`translateY(-100%)` mit Slide-Down bei Kanten-Hover / `Ctrl+L`), Multi-Tab Splitscreen für 2 bis 4 Viewports per Drag & Drop und Split-Button, bereinigte Avatar-Icons ohne störenden Text / Buchstaben in Titelleiste und Slim Dock.
5. **Paket 5 (Stabilität & Polish):** `AdvancedWebUiTools` Crash behoben, Supermemory Error Handling abgesichert, Agent Profile Erstellung aktiviert.

---

## 3. Verifikations-Matrix

| Schritt | Befehl | Ergebnis |
| :--- | :--- | :--- |
| **Unit & Integration Tests** | `npm test` | **68/68 Suites bestanden, 585 Tests grün** |
| **Store Certification Preflight** | `npm run verify:store` | **27/27 Checks bestanden (`[PASS]`), 0 Failures** |
| **Desktop Shell Build** | `npm --workspace apps/desktop run build` | **0 TypeScript-Fehler, 0 Vite-Fehler** |
| **Python Syntax Check** | `python -m compileall -q services/sidekick` | **Exit Code 0, 0 Warnungen** |

---

## 4. Prompt für den nächsten Agenten (Copy & Paste)

```markdown
Du übernimmst die Weiterentwicklung von Lastbrowser auf Branch codex/lastbrowser-electron-shell.
Lies verbindlich AGENTS.md, GEMINI.md und docs/AGENT_HANDOFF.md.

Der aktuelle Stand ist 100% sauber getestet (585 Tests in 68 Suites grün, 27/27 Store Checks PASS, 0 Buildfehler) und auf origin gepusht.

Aktuell umgesetzt:
- Google / Gmail BotGuard Anti-Detection (AutomationControlled disabled, Sec-CH-UA sanitization).
- Widevine DRM-Integration mit Adblocker-Bypass für Netflix & Disney+.
- Ollama & Ollama Cloud Onboarding mit automatischer base_url-Auflösung.
- Pakete 1 bis 5 (MCP Client, Command Palette, Supermemory 3-Tier, Zen-Mode Omnibox, Multi-Tab Splitscreen, Nova Chat Management, First-Launch Wizard).

Mögliche nächste Aufgaben:
1. Packaging-Test via `npm run package:win` für den finalen Store/NSIS-Build ausführen.
2. Manuelle Endnutzer-Erprobung der neuen Splitscreen- und Zen-Mode-Features.
3. Behalte alle Qualitäts-Gates vor jedem Commit bei (npm test, npm run verify:store, npm run build, python compileall).
```

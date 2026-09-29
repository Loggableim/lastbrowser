# Übergabe & Statusbericht – Lastbrowser & Nova AI

> **Status (2026-09-28):** Dieser Text enthält historische Übergabeangaben. Frühere Behauptungen wie „vollständig implementiert“, erfolgreicher Google-Login/DRM-Betrieb oder „auf origin gepusht“ sind keine aktuellen Abnahmen und dürfen nicht als solche verwendet werden. Der aktuelle, evidenzbasierte Stand steht in `goal.md`.
>
> **Zuletzt verifizierte Gates (2026-09-28):** `npm test` **124 Suites / 1054 Tests bestanden**; Extension-Suite **18/18**; `npm run verify:store`: **27/27**; `python -m compileall -q services/sidekick`: erfolgreich; vollständige Sidekick-Suite: **2249 bestanden / 105 übersprungen** (402,81 s). Desktop-Build erfolgreich, Vite warnt vor dem 1,60-MB-Chunk. Isolierter Electron-Smoke mit lokalem Electron-Binary: **65/65, 1 bewusst übersprungen**; zusätzlicher echter Profil-/Inkognito-Isolationslauf mit Cookies und `localStorage`: **9/9**. Extension-Lauf bestätigte Update v1→v2, Disable/Enable und Remove. Live-Audits bestätigen zudem Ollama-Cloud-Antwort und finden einen behobenen Teamwork/Smart-Track-Modell-ID-Konflikt.
>
> **Release-Status:** Quellversion **0.1.37**, installierte App **0.1.36.0**, GitHub Latest/Tag **v0.1.34**, lokale Installer und `latest.yml` maximal **v0.1.36**. Die öffentliche Downloadseite zeigt **v0.1.32**, die eingecheckte Websitequelle zielt auf **v0.1.34**. Lokale `.35`-/`.36`-Installer sind nicht signiert. Es gibt keinen brauchbaren `.37`-Installer; das einzige Artefakt ist ein leerer 32-Byte-NSIS-Stub. Installeranalyse belegt rund **311 MB** zusätzliche entpackte `.35`-Payload aus alten Renderer-Bundles und `.test-tmp`; die bereits committeten Ausschlüsse sollen diese Größenursachen beheben, Installationsdauer wurde nicht gemessen. Provider-Connectivity im Doctor beweist keine erfolgreichen Modellantworten. Keine neue Veröffentlichung, kein neuer Commit/Push. Der Arbeitsbaum enthält absichtlich erhaltene Änderungen einschließlich der benutzerverwalteten Builder-Konfiguration; laufende Lastbrowser-Prozesse nicht stören.

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

## 4. Nächste Arbeit (aktualisiert 2026-09-28)

```markdown
Arbeite auf `codex/lastbrowser-electron-shell` und lies `AGENTS.md`, `GEMINI.md` sowie den aktuellen Status in `goal.md`. Bewahre alle Änderungen und die benutzerverwaltete Builder-Konfiguration. Der Branch war zuletzt mit origin ausgeglichen; das aktuelle Arbeitsverzeichnis enthält zahlreiche uncommittete Änderungen. GitHub veröffentlicht v0.1.34, die installierte App ist v0.1.36.0 und der Quellstand v0.1.37. Erstelle keinen Tag, Installer oder Release, bevor Funktionstests, Provider-Audit, Signatur, Checksummen, Website-Ziele und Versionsmetadaten zusammenpassen.

Offen: breitere echte Laufzeitabdeckung (nicht durch Unit-Tests ersetzen), echter Antigravity/OAuth-Multi-Account-Round-Robin-Login und -Generation, erfolgreiche OpenRouter-Free-Antwort statt des gemessenen `rate_limit`, Live-Modellantworten nach dem Teamwork/Smart-Track-Routingfix sowie vollständige Provider-Verfügbarkeit für Codex/Anthropic. Die Ollama-Cloud-Modellantwort wurde erfolgreich live verifiziert; deren früherer Fehler ließ sich nicht reproduzieren. Installer-Ursachen sind über Paketinhalt belegt, aber Installationszeiten wurden nicht gemessen. Release-/Website-/Signatur-/Checksum-Nachweise und ein sauberer .37-Installer fehlen weiterhin; Paketierung nicht gegen laufende Nutzerprozesse erzwingen.
```

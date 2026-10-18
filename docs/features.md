# LastBrowser – Bestätigte Featureliste

> Grundlage für den Vorhut-Datensatz (Trainingsdatensatz der Modelle).
>
> Dieses Dokument listet **ausschließlich Funktionen, die im Repository
> `Loggableim/lastbrowser` nachweislich implementiert sind**. Jede Aussage ist
> mit einer Code-Fundstelle im Format `Datei:Zeile` belegt. Es werden **keine
> Werbeaussagen, keine nicht bestätigten Partner und keine Wortmarken des
> Unterbaus** verwendet. Änderungen an Code oder Pipeline sind nicht Teil
> dieses Dokuments.

Geprüfter Stand: Branch `codex/lastbrowser-electron-shell`.

## Terminal

| Funktion | Belegte Eigenschaft | Code-Fundstelle |
| :--- | :--- | :--- |
| Echtes Pseudo-Terminal | Verwendet `node-pty` und allokiert unter Windows eine echte ConPTY; ersetzt den früheren `child_process.spawn()`-Ansatz ohne PTY. | `apps/desktop/src/main/terminal-process.ts:2` |
| ANSI/VT-100 und Resize | Vollständige Escape-Code-Ausgabe und jederzeitige Größenänderung (cols × rows); interaktive Werkzeuge (Python-REPL, SSH, vim, ncurses) funktionieren. | `apps/desktop/src/main/terminal-process.ts:10` |
| Zwei Betriebsmodi | `TerminalMode = 'shell' \| 'tui'`. | `apps/desktop/src/main/terminal-process.ts:22` |
| Shell-Modus mit CLI-Alias | In PowerShell wird eine globale Function `sidekick` injiziert, damit die CLI-Unterbefehle direkt aufrufbar sind; `TERM=xterm-256color`, `COLORTERM=truecolor`. | `apps/desktop/src/main/terminal-process.ts:109` |
| TUI-Modus | Startet die in-tree Interactive Terminal UI über `python -m cli.lastbrowser_tui` in der realen ConPTY. | `apps/desktop/src/main/terminal-process.ts:98` |
| TUI nur lokal | Die TUI verlangt den lokalen Sidecar (nur `127.0.0.1`, `localhost`, `::1`) und authentifiziert per Session-Token. | `services/sidekick/cli/lastbrowser_tui.py:1` |
| Session-Steuerung | Schreiben (`writeTerminal`), Größe ändern (`resizeTerminal`), Schließen (`closeTerminal`), Auflisten (`getTerminalIds`). | `apps/desktop/src/main/terminal-process.ts:160` |
| Renderer-Anbindung | Renderer-seitige Terminal-Session mit Ausgabe-, Änderungs- und Fehler-Callbacks. | `apps/desktop/src/renderer/terminal-session.ts:11` |

## Spaces

| Funktion | Belegte Eigenschaft | Code-Fundstelle |
| :--- | :--- | :--- |
| Space-Presets | Vier Presets: „Coding & Dev“, „Research & Writing“, „Media & Design“ und ein leerer Space; jeweils mit Start-URL und angepinnten Apps. | `apps/desktop/src/renderer/components/SpaceSetupModal.tsx:48` |
| Angepinnte Apps, validiert | `normalizePinnedApp` akzeptiert nur `http:`/`https:`-URLs und gibt sonst `null` zurück. | `apps/desktop/src/renderer/components/SpaceSetupModal.tsx:157` |
| Space-Erstellung | `submitSpaceSetup` kapselt Erstellung, Fehlerbehandlung und Schließen des Dialogs. | `apps/desktop/src/renderer/components/SpaceSetupModal.tsx:176` |
| Modell pro Space | Persistente Zuordnung Modell/Provider je Space-Pfad (Storage-Key `lastbrowser.spaceModels.v1`); Laden, Speichern, Entfernen. | `apps/desktop/src/renderer/space-models.ts:25` |
| Modell-Fallback | `resolvePresetModel` fällt auf `smart-track` zurück, wenn das gewählte Modell nicht verfügbar ist. | `apps/desktop/src/renderer/components/SpaceSetupModal.tsx:170` |
| Kanonische Space-Pfade | `resolveCanonicalSpacePath` und Revisions-/Refresh-Logik für den aktiven Space. | `apps/desktop/src/renderer/space-paths.ts:8` |
| Audio-Keepalive | Medien-Wiedergabezustand je Webview abonnieren und über Tabs hinweg zusammenführen (`mergeSpaceAudioTabs`). | `apps/desktop/src/renderer/space-audio-keepalive.ts:10` |
| Session-Isolation | Persistente Partition je Space und Profil: `persist:space_<slug>_<profileId>`; Slug-Kollisionen werden hex-kodiert aufgelöst. | `apps/desktop/src/main/profile-partition-cleanup.ts:28` |
| Aufräumen bei Profil-Löschung | Beim Löschen eines Profils werden die zugehörigen Space-Partitionen gezielt geleert. | `apps/desktop/src/main/main.ts:494` |

## MCP-Hub und Workflows

| Funktion | Belegte Eigenschaft | Code-Fundstelle |
| :--- | :--- | :--- |
| MCP-Hub als zweite Säule | `UnifiedExtensionHub` verbindet Web-Extensions und MCP-Skills in einer Oberfläche. | `apps/desktop/src/renderer/components/UnifiedExtensionHub.tsx:28` |
| Eingebaute MCP-Skills | Sechs integrierte Einträge: ConPTY Terminal Executor, Supermemory Vector Search, Deep Web Scraper, DevTools & CDP Inspector, ComfyUI Image Generation, File System Automator. | `apps/desktop/src/renderer/components/UnifiedExtensionHub.tsx:52` |
| Berechtigungsstufen | Labels/Stufen (`safe`/`warn`/`danger`) für `read_only`, `filesystem_write`, `terminal_execute`, `network_outbound`, `agent_autonomy`. | `apps/desktop/src/renderer/components/UnifiedExtensionHub.tsx:127` |
| Externe MCP-Server | Zusätzliche MCP-Server aus der Sidekick-Konfiguration werden in die Skill-Liste gemischt. | `apps/desktop/src/renderer/components/UnifiedExtensionHub.tsx:164` |
| MCP-Konfigurationsmodell | `parseMcpEditor` und `McpHubStateModel` verwalten die MCP-Server-Konfiguration. | `apps/desktop/src/renderer/components/mcp-hub-state.ts:9` |
| MCP über IPC | Preload-Bridge `lastbrowser:mcp:listServers`, `saveServers`, `listTools`, `callTool`. | `apps/desktop/src/main/preload.ts:349` |
| MCP-Backend-API | REST-Endpunkte `/api/mcp/servers`, `/api/mcp/tools`, `/api/mcp/tools/call`. | `services/sidekick/web/api/routes.py:5924` |
| Workflow-Templates | Fünf Kategorien (Recherche & Analyse, Content & Notizen, Code & Engineering, Daten & Tabellen, Audit & Barrierefreiheit). | `apps/desktop/src/renderer/workflow-templates.ts:22` |
| Workflow-Definitionen | Template-Liste mit Kontext-Anforderung (`none` / `active_tab` / `all_tabs`) und Prompt-Template. | `apps/desktop/src/renderer/workflow-templates.ts:30` |

## Medien und DRM

| Funktion | Belegte Eigenschaft | Code-Fundstelle |
| :--- | :--- | :--- |
| Systemweite DRM-Erkennung | `findSystemWidevine` sucht eine vorhandene schutzfähige DRM-Komponente aus Microsoft Edge bzw. Google Chrome im Betriebssystem; es werden keine geschützten Dateien gebündelt. | `apps/desktop/src/main/drm.ts:116` |
| Versionsauswahl | Gefundene Komponenten werden absteigend nach Version sortiert; die frischeste wird bevorzugt. | `apps/desktop/src/main/drm.ts:28` |
| DRM-Feature-Flag | Beim Start wird das Widevine-Feature aktiviert und eine systemweite DRM-Komponente registriert. | `apps/desktop/src/main/main.ts:1221` |
| Native DRM-Initialisierung | Unter der signierten Laufzeitumgebung wird die native DRM-Komponente initialisiert. | `apps/desktop/src/main/main.ts:1249` |
| Medien-Berechtigung | `mediaKeySystem` ist für geschützte Wiedergabe erlaubt. | `apps/desktop/src/main/permissions.ts:26` |
| Streaming-Schutz | Bekannte Streaming-Domains werden erkannt; Blockierregeln werden für Streaming so gepatcht, dass die Wiedergabe nicht gestört wird. | `apps/desktop/src/main/adblock.ts:68` |
| Seitenaufnahme | `capturePageDataUrl` erzeugt ein Seitenbild als Data-URL inklusive Rechteck-Normalisierung. | `apps/desktop/src/main/capture-page.ts:10` |
| Download-Verwaltung | Download-Tracker mit Zuständen (`progressing`/`completed`/`cancelled`/`interrupted`), Dateinamen-Bereinigung und reserviertem Zielpfad. | `apps/desktop/src/main/downloads.ts:113` |

## Privacy

| Funktion | Belegte Eigenschaft | Code-Fundstelle |
| :--- | :--- | :--- |
| Deny-by-default für Webview-Gäste | Entfernt seiten-gelieferte Preloads/Argumente und erzwingt `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true`, `webSecurity=true`. | `apps/desktop/src/main/webview-security.ts:6` |
| Immer verweigerte Berechtigungen | `usb`, `serial`, `hid`, `midi`, `midiSysex`, `fileSystem`, `openExternal`, `idle-detection` werden grundsätzlich abgelehnt. | `apps/desktop/src/main/permissions.ts:40` |
| Benachrichtigungen nur mit Kontext | Benachrichtigungs-Prompts nur für Top-Level-Seiten über `http:`/`https:` mit gültigem Origin. | `apps/desktop/src/main/permissions.ts:52` |
| Browserdaten löschen | `clearBrowserData` löscht Cache, Cookies und Storage (localstorage, cachestorage, indexdb, websql, serviceworkers) je Session. | `apps/desktop/src/main/browser-data-cleanup.ts:28` |
| Werbe- und Tracker-Blocker | Blockier-Engine mit lokalem Cache (`adblocker-engine.bin`), offline-fähig; blockierte Anfragen werden gezählt. | `apps/desktop/src/main/adblock.ts:124` |
| Lokale Speicherung | Konfiguration und Zustände liegen im `userData`-Verzeichnis der Anwendung (kein Netzwerkzwang). | `apps/desktop/src/main/main.ts:201` |
| Keine persistente Werbe-ID | Persistent-protected-media-IDs bleiben verweigert, weil sie sitzungsübergreifendes Tracking erlauben. | `apps/desktop/src/main/permissions.ts:30` |

## Verifikation

Die genannten Fundstellen wurden direkt im Repository geprüft. Es wurden
ausschließlich nachgewiesene Funktionen aufgenommen; Behauptungen über
zugekaufte, nicht im Code belegte oder fremde Funktionen sind nicht enthalten.

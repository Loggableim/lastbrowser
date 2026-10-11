# A-007 – Prüfungen grok-worker-1

Datum: 2026-10-11T07:12+02:00
Branch: codex/a-007-smoke-20261010
Basis: release/v0.1.52 (Annahme: der Nav-Fix aus HOTFIX-001, Commit 06f8692, ist Vorfahre dieser Basis und nicht von codex/lastbrowser-electron-shell)
System: Windows, PowerShell

## npm ci

Befehl: `npm ci`
Ergebnis: Exit 0. `added 424 packages, and audited 426 packages in 24s`. Kein npm error.

## npm run test:run

Erster Lauf direkt nach `npm ci`: Exit 1.
Grund: `tests/address-autocomplete-dom.test.ts` – `spawn ...\node_modules\electron\dist\electron.exe ENOENT`.
`node_modules/electron/path.txt` zeigte auf das macOS-Binary `Electron.app/Contents/MacOS/Electron`.
Das Windows-Zip `electron-v37.10.3+wvcus-win32-x64.zip` lag im Electron-Cache und wurde nach `node_modules/electron/dist` entpackt. `path.txt` lokal auf `electron.exe` gesetzt. Keine Repo-Änderung.

Zweiter Lauf: `npm run test:run`
Ergebnis: Exit 0.
`Test Files  216 passed (216)`
`Tests  1971 passed (1971)`
Dauer 26.94s.
`tests/nav-smoke.test.ts` ist enthalten: 4 Tests, 9ms.

## npm run build

Befehl: `npm run build`
Ergebnis: Exit 0. Renderer `built in 4.83s`.
Hinweis, kein Fehler: Vite meldet einen Chunk über 500 kB (`dist/renderer/assets/index-7RSbEdSJ.js`).

## Gegenprobe

`apps/desktop/tests/nav-smoke.test.ts` liest die Quellen und fällt, wenn:

- `.first-run-fullscreen-wrap` kein `pointer-events: none` mehr hat oder `pointer-events: auto` enthält
- `.first-run-fullscreen` kein `pointer-events: auto` mehr hat
- Sidebar-Toggle, Zurück, Vor, Reload, Tab-Aktivierung oder neuer Tab in `HeaderComponents.tsx` den Handler verlieren
- die Sidebar-Einträge Tabs, AI oder Slim in `SidekickSidebar.tsx` den Klick-Handler verlieren
- Ctrl+Tab, Ctrl+Shift+Tab oder Ctrl+B nicht mehr `next-tab`, `prev-tab`, `toggle-sidebar` liefern oder `App.tsx` diese Fälle nicht mehr auf `setActiveTabId` bzw. `cycleSidebarMode` legt

Eine echte Mutation der Hotspots wurde nicht ausgeführt. Die Gegenprobe ist die beschriebene Assertion.

## nicht verifiziert

nicht verifiziert: Klick und Sichtbarkeit in einem laufenden Windows-Electron-Fenster – in diesem Lauf kein Desktop-Klicklauf. Kandidat für einen PRAXISTEST des vm-tester: Sidebar, Tab-Leiste und Top-Navigation bei offenem Erststart-Overlay.
nicht verifiziert: verify-store – nicht in den Pflichtprüfungen von A-007.
nicht verifiziert: package-win – nicht in den Pflichtprüfungen von A-007.

# A-007 – Nacharbeit grok-worker-1

Datum: 2026-10-11T09:09+02:00
Branch: codex/a-007-smoke-20261010
Basis: release/v0.1.52
Anlass: technisches CHANGES von chatgpt-cto auf PR #36 (Head a56cf7b). Kein formales GitHub-REQUEST_CHANGES, weil das verbundene Konto auch PR-Autor ist.
System: Windows, PowerShell

## npm ci

Befehl: `npm ci`
Ergebnis: Exit 0. `added 424 packages, and audited 426 packages in 16s`.

## npm run test:run

Erster Lauf direkt nach `npm ci`: Exit 1.
Grund: `spawn ...\node_modules\electron\dist\electron.exe ENOENT`.
`node_modules/electron/path.txt` zeigte auf `Electron.app/Contents/MacOS/Electron`.
Das Windows-Zip `electron-v37.10.3+wvcus-win32-x64.zip` lag im Electron-Cache und wurde nach `node_modules/electron/dist` entpackt. `path.txt` lokal auf `electron.exe` gesetzt. Keine Repo-Änderung.
Davon betroffen waren `tests/nav-smoke.test.ts` und der schon vorhandene `tests/address-autocomplete-dom.test.ts`.

Zweiter Lauf: `npm run test:run`
Ergebnis: Exit 0.
`Test Files  216 passed (216)`
`Tests  1973 passed (1973)`
Dauer 24.40s.
`tests/nav-smoke.test.ts`: 6 passed. Die zwei neuen Fälle klicken im echten Electron-Fenster durch `elementFromPoint` auf Sidebar, Tab-Leiste und Top-Navigation und prüfen die ausgelösten Effekte.

## npm run build

Befehl: `npm run build`
Ergebnis: Exit 0. Renderer `built in 3.90s`.
Hinweis, kein Fehler: Vite meldet einen Chunk über 500 kB (`dist/renderer/assets/index-7RSbEdSJ.js`).

## Gegenprobe (ausgeführt, nicht committet)

Lokal nur in `apps/desktop/src/renderer/styles.css` die Regel `.first-run-fullscreen-wrap` von `pointer-events: none` auf `pointer-events: auto` gesetzt. Danach `npm --workspace apps/desktop exec vitest run tests/nav-smoke.test.ts`.

Ergebnis: Exit 1. Drei Tests rot, darunter der Klicktest:
`ai: expected { ok: true, wrapEvents: 'none' }` erhielt `{ ok: false, wrapEvents: 'auto' }`.
Der Sidebar-Klick auf den AI-Drawer und der Slim-Modus fehlten im Protokoll (`drawer:ai` und `set-mode:slim` kamen nicht an). Zurück, Vor, Reload und der Sidebar-Toggle blieben klickbar, weil sie außerhalb der abdeckenden Fläche liegen.

Danach `git checkout -- apps/desktop/src/renderer/styles.css`. Die Datei ist nicht Teil des Commits. Der anschließende Gesamtlauf oben ist wieder grün.

## nicht verifiziert

nicht verifiziert: Klick in einem von Cid gestarteten Windows-Fenster mit echtem Erststart-Overlay – der automatische Lauf nutzt ein verstecktes Electron-Fenster und die echten Komponenten, nicht das gepackte Produkt. Kandidat für einen PRAXISTEST des vm-tester: Sidebar, Tab-Leiste und Top-Navigation bei offenem Erststart-Overlay.
nicht verifiziert: verify-store – nicht in den Pflichtprüfungen von A-007.
nicht verifiziert: package-win – nicht in den Pflichtprüfungen von A-007.

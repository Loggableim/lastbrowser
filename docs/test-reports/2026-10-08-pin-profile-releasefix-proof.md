# Pin-Drag und Profilmenü: isolierter Releasefix-Nachweis

Stand: 2026-10-08. Ausgangspunkt ist Commit `b7ca38bd6db7b8a6e5fd814bd322b4916f561e73`, Tree `30f2deb9301b12cf8908e6acd633893b64caa00d`. Der tatsächliche VM-Bericht liegt im Commit `b39ae4281d2f77e9714f7b91b4c4888348259e65` unter `docs/test-reports/2026-10-08-b7ca38bd-runtime-test-report.md`.

## Reproduzierte Ursachen und Änderungen

Das Profilmenü lag innerhalb einer Settings-Karte mit `backdrop-filter` und damit innerhalb ihres Stacking-Kontexts. Nachfolgende Karten lagen über dem Add-Button. `ProfileSwitcher` rendert das Menü jetzt über ein Portal in `document.body`, positioniert es am echten Trigger und begrenzt es auf den Viewport. Ein eigener Oberflächenhintergrund hält den Text auch außerhalb der Settings-Karte lesbar. Menü und Trigger werden beim Outside-Click gemeinsam geprüft; Escape und Auswahl bringen den Fokus zurück. Pfeiltasten, Home und End bewegen die Auswahl. Enter im Namensfeld bleibt eine Formularaktion.

Der Pin-Hinweis wurde als zusätzliches Grid-Kind eingefügt, sobald ein echter Tab-Drag erkannt wurde. Dadurch verschob sich die akzeptierte Zielzelle unter dem Pointer, bevor Chromium den Drop lieferte. Der Hinweis liegt jetzt absolut über dem Grid und hat `pointer-events: none`. Die vorhandene interne Tab-ID/Tokenprüfung und die Ablehnung privater oder nicht HTTP(S)-Tabs bleiben bestehen.

Die kompakte `NovaDock` hatte keinen Tab-Pin-Drop-Pfad. Sie erhält jetzt die tatsächlichen Tabs, den aktiven Drag und den vorhandenen `pinTabAsApp`-Callback. Der gleiche bestehende Tokenprüfer validiert den Drop. Diese Daten werden sowohl vom Sidebar-Dock als auch vom frei positionierten Shell-Dock weitergereicht. In `App.tsx` besteht die Änderung ausschließlich aus diesen drei Props am Shell-Dock. Der Tab bleibt erhalten; das normale App-Reordering bleibt bestehen.

Geänderte Produktdateien:

- `apps/desktop/src/renderer/components/HeaderComponents.tsx`: ausschließlich Profilmenü und erforderliche Imports.
- `apps/desktop/src/renderer/styles.css`: ausschließlich ProfileSwitcher-Selektoren.
- `apps/desktop/src/renderer/components/pinned-tab-drop.css`: Hinweis ohne Layoutverschiebung.
- `apps/desktop/src/renderer/components/NovaDock.tsx`: validierter Tab-Drop.
- `apps/desktop/src/renderer/components/SidekickSidebar.tsx`: Weitergabe der drei Dock-Props.
- `apps/desktop/src/renderer/App.tsx`: drei Props am Shell-NovaDock.

## Praktischer Nachweis

`apps/desktop/tests/pin-profile-renderer-entry.tsx` mountet die tatsächlichen React-Komponenten mit Produktions-CSS und dem tatsächlichen `usePinnedAppStore`. `pin-profile-renderer-smoke.cjs` bündelt diesen Entry mit bereits vorhandenen Offline-Abhängigkeiten und startet das vorhandene Castlabs-Electron. Gemessen wurden Electron `37.10.3` und Chromium `138.0.7204.251`.

Pointer-, Tastatur- und Drag-Ereignisse kommen über Chromium-CDP `Input`. Der Pointer startet einen echten HTML-Drag. Chromium liefert dessen tatsächliche Drag-Daten einschließlich des vom Renderer erzeugten Tokens; diese Daten werden für die anschließenden nativen Drag-/Drop-Ereignisse verwendet. Die aufgezeichneten DOM-Drags und Drops haben `isTrusted: true`. Es werden weder direkte React-Handleraufrufe noch erfundene DataTransfer-Payloads verwendet. Eingabekoordinaten warten auf den tatsächlichen Abschluss der Sidebar-Transition.

Die `--baseline`-Variante liest die betreffenden vollständigen Dateien aus dem exakten Ausgangscommit. Sie schreibt keine historischen Produktdateien zurück. Beide Ausgangsfehler werden ausdrücklich assertiert: Add ist verdeckt; ein echter interner Drag erreicht DragOver, aber keinen Drop und keinen neuen Pin.

Der aktuelle Stand besteht folgende praktische Prüfungen:

| Pfad | Ergebnis |
| --- | --- |
| Profil-Add per Pointer | tatsächlicher Callback mit eingegebenem Namen; Add-Hit-Test nicht verdeckt |
| Profil-Add per Enter | tatsächlicher Formularsubmit mit eingegebenem Namen |
| Profilwechsel per Home/Enter | tatsächlicher Auswahlcallback |
| Escape / Pfeiltaste / Outside-Click | Fokus zurück am Trigger / Menü öffnet / Menü schließt |
| Scroll / Resize auf 320 px | Menü folgt Trigger; Menü, Inputs und Buttons innerhalb des Viewports |
| Expanded Sidebar → vorhandenes Pin-Feld | echter Drop, tatsächlicher Store-Pin, Volltitel erhalten |
| Root → Subdomain und Subdomain → Root | zwei eigenständige Pins; Originaltabs bleiben erhalten |
| `www` derselben Root-Domain | kein doppelter kanonischer Pin |
| Tatsächlicher Renderer-Reload | Store-Pins und voller Title-Tooltip erhalten |
| Floating Expanded Sidebar → Add-Feld | tatsächlicher Store-Pin |
| Slim Dock links/rechts/oben/unten/floating | alle fünf Varianten mit tatsächlichem Tab-Drag und Store-Pin |

Bereinigte Ergebnisdaten und Screens liegen in [evidence/pin-profile-releasefix-20261008](evidence/pin-profile-releasefix-20261008). Die erfassten internen Drag-Tokens sind darin entfernt. Screens zeigen ausschließlich synthetische lokale Fixture-Daten.

Reproduktion ab Repositorywurzel:

```powershell
node apps/desktop/tests/pin-profile-renderer-smoke.cjs --baseline
node apps/desktop/tests/pin-profile-renderer-smoke.cjs
```

## Frische Repository-Prüfungen

Alle folgenden Prüfungen liefen nach der finalen Produkt-CSS-Änderung auf genau diesem isolierten Source-Stand. Danach wurden nur Nachweisdateien hinzugefügt. [receipt.json](evidence/pin-profile-releasefix-20261008/receipt.json) enthält die Produktdatei-SHA256, Ergebniszahlen und Hashes der vollständigen lokalen Logs.

| Prüfung | Ergebnis |
| --- | --- |
| `npm test -- --run` | Exit 0; 212 Suites, 1942 Tests grün |
| `npm run verify:store` | Exit 0; 39 PASS, 0 FAIL, 2 WARN |
| `npm --workspace apps/desktop run build` | Exit 0; Main-/Renderer-Typecheck und Vite grün |
| `python -m compileall -q services/sidekick` mit vorhandener gebündelter Python-Runtime | Exit 0; keine Ausgabe |
| Komplette aktuelle Castlabs-UI-Probe | Exit 0 |
| Exakte Baseline-Probe | Exit 0; beide ursprünglichen Fehler ausdrücklich reproduziert |

Die beiden Store-Warnungen betreffen vorläufige Screens und das fehlende finale Package zur Signaturprüfung. Vite meldet weiterhin die bestehende große Bundle-Größe. Es wurden keine Pakete gebaut oder signiert.

## Grenzen und Integration

Dies ist ein kontrollierter Nachweis der tatsächlichen Renderer-Komponenten, Pointer-/Tastatur-/Drag-Ereignisse und des persistenten lokalen Pin-Stores. Profilcallbacks sind kontrollierte Fixture-Callbacks. Der Nachweis prüft weder die Profilpersistenz über Main noch den gesamten App-Bootstrap, eine VM, ein neues Package, dessen Signatur oder einen veröffentlichten Build. Account-, Provider-, Modell- und Netzwerkzugriffe finden nicht statt; externe Requests werden im Probeprozess blockiert. Ein erneuter Paket-/VM-Test bleibt Aufgabe des integrierten Releasekandidaten.

Der ursprüngliche schmutzige Checkout blieb erhalten. Produkt- und Nachweisänderungen liegen auf dem eigenen isolierten Branch `codex/pin-profile-b7-20261008`; PR-Ziel ist `codex/ui-integration-20261008`. Der konkrete Commit und Tree werden durch den PR-Head und den Integrations-Handoff identifiziert. Die übrigen gemeldeten Chat-, Space- und Backendfehler gehören zu getrennten koordinierten Fixes und sind nicht Bestandteil dieses Commits.

# FIX3 – Design-/Zen-Regressionsprüfung

Stand: 2026-10-05. Eingrenzung auf Darstellung und Auffindbarkeit des Fokusmodus; parallele Änderungen bleiben erhalten.

## Diagnose

- Checkout: Branch `codex/release-0.1.45`, HEAD `79836a40b3af4c60d327fdf1bb77eac80e8ed1fd`; Vergleichsreferenz `origin/codex/lastbrowser-electron-shell` bei `3f27e703c04ec70291a9056e690f0ee15124ba9b`.
- Der Quellcode von 0.1.45 setzt Modern als Standard, wenn `lastbrowser.layoutMode.v1` fehlt oder ungültig ist. Ein gespeicherter Wert `classic` wählt weiterhin ausdrücklich die klassische UI. Der Inhalt eines Benutzerprofils wurde nicht inspiziert oder verändert; ein altes Profil-Override bleibt daher eine mögliche, nicht bestätigte Ursache.
- Prozess-/Paketinventar zeigte aktive Lastbrowser-Prozesse aus verschiedenen alten Preview-Verzeichnissen (deren untersuchte Pakete 0.1.43 enthielten) sowie aus der installierten Anwendung 0.1.44. Kein laufender Prozess ließ sich dem Source-Checkout 0.1.45 zuordnen. Die Prozessbefehlszeilen und Fenstertitel waren nicht verfügbar; welches Fenster der Nutzer tatsächlich sah, ist nicht verifiziert. Es wurde kein Prozess beendet.
- Im Quellstand und in der Vergleichsreferenz existiert bereits Modern-UI/Zen-Verhalten; der Vergleich zeigt keinen Beleg, dass die Funktionen im aktuellen Quellstand fehlen. Der Fokusmodus war im erweiterten Sidebar-Footer vorhanden, aber im standardmäßig kompakten Dock nicht direkt auffindbar. Das konnte wie ein entfernter Zen-Modus wirken.

## Kleine UI-Korrektur

Das NovaDock bietet jetzt eine lokalisierte, direkt erreichbare Fokusmodus-Aktion mit Tastatur-Fokusindikator. Die Sidebar wechselt damit in den bestehenden `hidden`-/Zen-Modus; in einem Zen-Floating-Overlay wird dieses geschlossen. `App.tsx`, Profilzustand und Paketdateien wurden nicht geändert.

Geändert: `apps/desktop/src/renderer/components/NovaDock.tsx`, `apps/desktop/src/renderer/components/SidekickSidebar.tsx`, `apps/desktop/src/renderer/styles.css` und Regressionstest `apps/desktop/tests/nova-dock-positions.test.ts`.

## Verifikation

- `npm --workspace apps/desktop exec vitest -- run tests/nova-dock-positions.test.ts` — BESTANDEN, 11/11 Tests.
- `npm --workspace apps/desktop run typecheck:renderer` — BESTANDEN, TypeScript ohne Emit.
- `git diff --check` — BESTANDEN; Git meldet lediglich die üblichen LF/CRLF-Hinweise für bearbeitete Dateien.
- Installierte/Preview-Anwendung mit der Korrektur, konkretes sichtbares Fenster und gespeicherter Profilwert — NICHT GEPRÜFT. Es wurde kein Paket gebaut, keine Anwendung installiert und kein Profil verändert.

## Ergebnisgrenze

Der Quellcodefehler war hier primär die geringe Auffindbarkeit der bereits vorhandenen Zen-Funktion im kompakten Dock. Zusätzlich belegt das Inventar, dass mehrere ältere Builds parallel liefen; ohne lesbare Befehlszeilen/Fenstertitel ist die konkret wahrgenommene alte Oberfläche keinem einzelnen Prozess sicher zuzuordnen. Ein `classic`-Override im Benutzerprofil bleibt ungeprüft.

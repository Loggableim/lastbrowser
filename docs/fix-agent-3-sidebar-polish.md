# FIX AGENT 3 – Sidebar control polish

## Änderungen

- Der Sidebar-Tab-Schließen-Button bleibt beim normalen Anzeigen dezent verborgen, wird aber bei Hover oder Tastaturfokus sichtbar. Die 26×26-px-Fläche, kontrastreichere X-Grafik, Hover-/Focus-Rückmeldung, `aria-label` und `title` verbessern Auffindbarkeit und Bedienbarkeit. Click und Tastaturereignis stoppen die Bubbling-Aktivierung der übergeordneten Tab-Zeile; Schließ- und Pin-Semantik blieben unverändert.
- Das Header-Plus bei Pinned Apps ist jetzt ein ausgerichteter, integrierter Iconbutton statt eines isolierten grauen Kästchens. Headerbutton und Raster-Add-Zelle bleiben als zwei Zugänge erhalten, rufen denselben Hinzufügenhandler auf und verwenden gemeinsame übersetzte Beschriftungen.
- Hinzufügen-Beschriftungen sind in allen acht Desktopsprachen vorhanden.

## Prüfungen

- `npm --workspace apps/desktop exec vitest -- run tests/sidebar-control-polish.test.ts` – 2 bestanden. Sandboxstart zunächst mit `spawn EPERM`; nach Ausführungsfreigabe bestanden.
- `npm --workspace apps/desktop run typecheck:renderer` – bestanden.
- Visueller Screenshot-/Live-Tab-Test nicht ausgeführt; es wurden keine Benutzertabs verändert.

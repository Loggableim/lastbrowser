# A-025 Auth Lock Race Nacharbeit

Datum: 2026-10-11 (Europe/Vienna)

## Änderung

- `App.tsx` bindet Startup-Preflight, laufende Auth-Statusabfragen, Lock-Events und Passwort-Login an eine gemeinsame Generation.
- Ein Lock erhöht die Generation synchron. Verspätete `disabled`-Preflight- oder Statusantworten sowie ein vor dem Lock gestarteter Login können damit die Shell nicht entsperren.
- Scopewechsel invalidieren ausstehende Resultate und setzen das Gate wieder fail-closed. Fehlende oder unbekannte `auth_enabled`-Statuswerte bleiben gesperrt.
- Eine neue Statusprüfung kann einen expliziten Retry autoritativ bestätigen; Passwort-Login entsperrt nur nach erfolgreichem Login und bestätigtem `logged_in`.
- Keine Secrets, Hashes oder Pfade werden an Renderer oder Logs gegeben. Keine Änderungen an Version oder CHANGELOG.

## Regressionen

Produktiv verwendeter `reduceAccessAuthGate` wird direkt mit den Ereignisfolgen aufgerufen:

- `disabled`-Preflight angefordert → Lock-Event → verspätete `disabled`-Antwort; Shell bleibt gesperrt.
- Laufende Statusantwort nach Lock sowie Preflight aus einem vorherigen Scope werden ignoriert.
- Frischer Retry und verifizierter Login können entsperren.
- `enabled`, `unknown`, fehlendes `auth_enabled` bleiben fail-closed.
- Bestätigt deaktivierte Auth lässt die Browser-Shell bei nicht verfügbarem Python/Sidekick starten.

Eine separate rote Vorher-Ausführung auf dem Basis-Head wurde nicht durchgeführt. Der zuvor reproduzierte P1-Befund ist im GitHub-Review für `7935cb1f6d85421809e3b1948e3ecfca9666d037` dokumentiert.

## Pflichtprüfungen

Ausgangs-Head: `7935cb1f6d85421809e3b1948e3ecfca9666d037`.

| Befehl | Exit | Ergebnis |
| --- | ---: | --- |
| `npm --workspace apps/desktop run test:run -- tests/access-password-lock.test.ts` | 0 | 1 Datei, 9 Tests bestanden |
| `npm test -- --runInBand` | 0 | 223 Dateien, 2.024 Tests bestanden; npm meldete `--runInBand` als unbekannte CLI-Konfiguration, Vitest lief vollständig |
| `npm run verify:store` | 0 | 39 Pass, 0 Fehler, 2 Warnungen (provisorische Store-Screenshots; kein finales Paket zur Signaturprüfung) |
| `npm --workspace apps/desktop run build` | 0 | TypeScript und Vite erfolgreich; bestehende Warnung für großen Renderer-Chunk |
| `python -m compileall -q services/sidekick` | 0 | erfolgreich, keine Ausgabe |
| `git diff --check` | 0 | keine Whitespace-Fehler |

## Nicht verifiziert

- Separate rote Vorher-Ausführung des neuen Consumer-Tests.
- Startzeitmessung, GUI/VM und P003-Installation wurden nicht durchgeführt.
- Build-Warnungen sind keine Paket-, Signatur-, Installations- oder Releaseabnahme.

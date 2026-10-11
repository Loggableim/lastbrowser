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

## Rot-vor-Evidenz am alten Consumer

Im separaten temporären Worktree `C:\Users\logga\.codex\worktrees\a025-auth-race-red-before-20261011` auf dem unveränderten PR50-Head `7935cb1f6d85421809e3b1948e3ecfca9666d037` wurde ein kurzlebiger Node-Harness ausgeführt. Er extrahierte per TypeScript-AST die tatsächlichen alten `lockBrowser`- und Startup-Preflight-Callbacks aus `App.tsx`; produktiver Code und Regressionstestdateien wurden in diesem Worktree nicht verändert. Das temporäre Harness wurde danach entfernt.

| Ablauf | Ergebnis |
| --- | --- |
| Lock-Callback setzt `required=true`, `checked=true` | Kontrolle bestanden |
| Danach `enabled`-Preflight im selben Scope | Kontrolle bestanden; Gate bleibt gesperrt |
| Danach verspätetes `disabled`-Preflight im selben Scope | **Race reproduziert:** alter Consumer setzt `required=false`, erwartet war `true`; Harness exit 1 |

Grüner Nachweis nach Fix: der Consumer-Regressionstest führt `reduceAccessAuthGate` aus; Lock vor verspätetem `disabled` bleibt gesperrt. Der fokussierte Testlauf auf dem korrigierten Head endete mit exit 0 (1 Datei, 9 Tests).

## Pflichtprüfungen

Ausgangs-Head: `7935cb1f6d85421809e3b1948e3ecfca9666d037`.

| Befehl | Exit | Ergebnis |
| --- | ---: | --- |
| Temporärer AST-Harness mit extrahierten alten App-Callbacks auf `7935cb1f6d85421809e3b1948e3ecfca9666d037` | 1 (erwartet) | `enabled`-Kontrolle PASS; Lock → verzögertes `disabled` reproduziert Entsperren und verletzt die Assertion |
| `npm --workspace apps/desktop run test:run -- tests/access-password-lock.test.ts` | 0 | 1 Datei, 9 Tests bestanden |
| `npm test -- --runInBand` | 0 | 223 Dateien, 2.024 Tests bestanden; npm meldete `--runInBand` als unbekannte CLI-Konfiguration, Vitest lief vollständig |
| `npm run verify:store` | 0 | 39 Pass, 0 Fehler, 2 Warnungen (provisorische Store-Screenshots; kein finales Paket zur Signaturprüfung) |
| `npm --workspace apps/desktop run build` | 0 | TypeScript und Vite erfolgreich; bestehende Warnung für großen Renderer-Chunk |
| `python -m compileall -q services/sidekick` | 0 | erfolgreich, keine Ausgabe |
| `git diff --check` | 0 | keine Whitespace-Fehler |

## Nicht verifiziert

- Startzeitmessung, GUI/VM und P003-Installation wurden nicht durchgeführt.
- Build-Warnungen sind keine Paket-, Signatur-, Installations- oder Releaseabnahme.

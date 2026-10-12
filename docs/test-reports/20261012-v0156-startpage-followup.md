# v0.1.56: Nachprüfung von Startseite und isolierter Portable

Source-Stand: `4a7e60f5ba4ccb981e590a20ca91e914f19bfd83` auf Branch `codex/v0156-combined-preview-20261012` (Draft-PR #72). Der vorherige [Kombinationsbericht](20261012-v0156-combined-preview.md) bleibt als Nachweis für dessen früheren Stand erhalten.

## Behobene Punkte

1. Die acht Schnellstart-Icons liegen nun unter `brand/assets/speed-dial/` im Paket. Die Startseite fragt beim Laden keine Favicons von den Ziel-Websites ab. [Quellen und Rechtevorbehalt](../design-references/v0.1.56/speed-dial-icons.md).
2. Der explizite Startparameter `--lastbrowser-isolated-profile` unterbindet die Erkennung und Übernahme einer eigenständigen Sidekick-Installation in einem getrennten Testprofil. Normale Erstinstallationen behalten die angebotene Migration.
3. Solange die lokale Onboarding-Abfrage keine bereite Modellverbindung meldet, sind die KI-Suche und vier KI-Schnellaktionen deaktiviert. Ein Hinweis führt zu den Anbieter-Einstellungen. Die Befehlsübersicht und normale Websuche bleiben verfügbar.
4. Die linke Dock-Leiste erhält im schmalen Modus eine definitive Höhe unter der Titelleiste. Das erste Icon überlappt das obere Menü nicht mehr.

## Quellprüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` | PASS: 241 Dateien, 2.180 Tests |
| `npm run verify:store` | 39 PASS, 2 WARN, 0 FAIL |
| `npm --workspace apps/desktop run build` | PASS |
| `python -m compileall -q services/sidekick` | PASS |
| `git diff --check` | PASS |

## Prüfung der konkreten Portable

- Lokales Artefakt: `output/dist-preview-2026-10-12T05-26-28-517Z-f03fdee0/Lastbrowser-0.1.56-x64-portable.exe`.
- SHA-256: `56924B72FEEE6ACC86E84E2317740B8845A66DB893B9B1B51CE374AC87537246`.
- Authenticode: `NotSigned`; Build-Variante `offline-test` für 0.1.56. Kein Signing oder Publishing.
- Start in `output/isolated-v0156-followup-profile-20261012` mit eigenem UserData-, Backend-, AppData- und Temp-Pfad, Port 9429 und `--lastbrowser-isolated-profile`. Die bisherige Vorschau wurde nicht beendet.
- [Ersteinrichtung](assets/v0156-isolated-first-run.png): nach „Nein, ohne KI fortfahren“ erscheint keine Sidekick-Übernahmekarte. Die IPC-Erkennung gab `found:false` mit allen Komponenten `false` zurück.
- [Startseite](assets/v0156-startpage-followup-portable.png): acht lokale Icons geladen (`app://bundle/speed-dial/...`), vier KI-Aktionen und „Nova fragen“ deaktiviert, Modellhinweis und Anbieter-Link sichtbar. Im Renderer wurden für diese Ansicht keine externen Resource-Einträge beobachtet. Die App kann an anderer Stelle oder nach Nutzeraktionen weiterhin Netzwerkanfragen auslösen; dies ist kein globaler Netzwerk-Audit.
- Die gemessene Oberkante des ersten Dock-Icons liegt bei 70 px, die Unterkante der Titelleiste bei 42 px. Es bleiben 28 px Abstand im 1440×920-Fenster.

## Weitere Grenzen

Der lokale Screenshot und die Source-Tests sind weder VM-/Geräte- noch menschliche Abnahme. Ein realer Provider-Chat und Zen-Durchlauf im Paket stehen aus. Die Nutzungsrechte der Bestands-Wallpaper und der Website-Marken müssen vor öffentlicher Auslieferung geklärt werden. Der Draft wurde nicht gemergt oder signiert.

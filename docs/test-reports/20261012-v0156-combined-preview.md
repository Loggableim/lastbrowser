# v0.1.56: kombinierte Chatbox- und Startseiten-Vorschau

Stand: 12. Oktober 2026. Isolierter Branch `codex/v0156-combined-preview-20261012`, Source-Stand `6c7dd0e356027fbacdefc191a206639855dba41f` auf PR-#70-Basis `1a37f9d12121be0ced83097e2d0ffb5543e7c162`. Der Branch übernimmt PR #69 (Chatbox) und den Entwurf aus PR #62 (Startseite); die Startseite wurde hier erstmals umgesetzt. Kein Merge in den Basisbranch.

## Prüfungen am Source-Stand

| Prüfung | Ergebnis | Beweisgrenze |
| --- | --- | --- |
| `npm test -- --run` | PASS: 241 Dateien, 2.179 Tests | Source-Tests; keine installierte App. |
| `npm run verify:store` | 39 PASS, 2 WARN, 0 FAIL | Store-Preflight, keine Store-Abnahme; Warnungen zu Screenshots und fehlendem signierten Releasepaket. |
| `npm --workspace apps/desktop run build` | PASS | TypeScript/Vite-Build. |
| `python -m compileall -q services/sidekick` | PASS, Exit-Code 0 | Syntaxprüfung des in-tree Python-Backends. |
| `git diff --check` | PASS | Whitespace-/Patch-Prüfung. |

Der Chatbox-Fixture prüft Normal und Zen bei 900 und 390 px einschließlich Entwurf, Modell, Modus, Reasoning, Werkzeugleiste, Tastaturbedienung und Akzentfarbe. Details und vier Bilder: [Chatbox-Nachweis](20261012-chatbox-v0156-source-fixture.md). Das sind synthetische UI-Nachweise; ein Live-Provider wurde nicht getestet.

## Lokale Portable-Vorschau

- Artefakt: `output/dist-preview-2026-10-12T04-42-48-554Z-844447a0/Lastbrowser-0.1.56-x64-portable.exe` (lokal, nicht im Git-Repository).
- SHA-256: `24A1E1B8DEC6D38B443434093E980A85FF156360D06362267EE35ADBD1CE1438`.
- Authenticode: `NotSigned`. Der Offline-Test-Build hat Signierung und Veröffentlichung übersprungen.
- Sichtbarer Start aus genau dieser Portable-Datei mit `--user-data-dir` unter `output/isolated-v0156-final-profile-20261012` und Debug-Port 9428. `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP`, `SIDEKICK_HOME`, `HERMES_HOME` und `LASTBROWSER_HOME` wurden für diesen Prozess auf das getrennte Testprofil gesetzt. Das entpackte `Lastbrowser.exe` und der mitgelieferte Python-Backendprozess laufen aus dessen Temp-Verzeichnis; der Backendprozess lauscht lokal auf Port 8789.
- Die Ersteinrichtung bot eine bestehende Sidekick-Installation zur Übernahme an. Die Übernahme wurde **nicht** ausgelöst; „Nein, ohne KI fortfahren“ und dann „LastBrowser starten“ wurden gewählt. Es wurde kein Modell verbunden und keine persönliche Browser- oder Sidekick-Konfiguration absichtlich importiert.
- [Screenshot der gestarteten Portable-Startseite](assets/v0156-startpage-portable.png): Wallpaper sichtbar, acht reale Website-Icons, Uhr/Datum/Begrüßung, Suche, Schnellaktionen, Spaces, Favoriten und meistbesuchte Seiten. Die Home-Karte zeigte `0 aktive Agenten` erst bei frischer verfügbarer Live-Beobachtung; für fehlende oder veraltete Daten zeigt die Implementierung „nicht verfügbar“. Keine Tabs oder Session-Metadaten auf Space-Karten.

## Grenzen für Review und Release

- Die Portable wurde lokal auf diesem Windows-Host geöffnet. Es gibt keinen separaten VM-/Geräte-, Live-Provider-, Store-, Signatur- oder menschlichen Abnahmenachweis.
- Die Chatbox-Screenshots stammen vom isolierten Fixture; die gestartete Portable belegt die integrierte Startseite und den Start des mitgelieferten Backends. Ein vollständiger realer Chat/Zen-Durchlauf im Paket bleibt offen.
- Die Hintergrundgrafik stammt aus dem bereits vorhandenen Projektbestand. Ihre Herkunft und Nutzungsrechte müssen vor einer öffentlichen Auslieferung geprüft werden.
- Diese Vorschau ist ein Testartefakt. Kein Signing, Merge, Store-Upload oder öffentliche Veröffentlichung wurde durchgeführt.

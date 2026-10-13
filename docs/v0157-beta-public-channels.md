# Beta und Public ab 0.1.57

## Kanäle

- **Public / Stable** ist der Standard. Einstellungen speichern `stable`, der Updater liest `latest.yml`. Vorabversionen sind vor Angebot, Download und Installation ausgeschlossen; Downgrades sind ausgeschaltet.
- **Beta** wird bewusst in den Einstellungen aktiviert. Einstellungen speichern `beta`, der Updater verwendet `beta.yml` und erlaubt `-beta.N`. Öffentliche stabile Versionen bleiben zulässig, wenn der Beta-Feed auf eine freigegebene Stable-Version zurückfällt.
- Das frühere gespeicherte `preview` war bereits eine Beta-Einwilligung und wird einmalig nach `beta` migriert. Andere oder fehlende Werte ergeben `stable`. Die installierte Beta-Version aktiviert den Beta-Kanal nicht automatisch.
- Während Prüfung, Angebot, Download oder ausstehender Installation ist der Kanalwechsel gesperrt. Ein falsches Beta-Artefakt in `latest.yml` wird zusätzlich vor dem Download zurückgewiesen.

## Aktueller Vorbereitungsstand

- Beta-Entwicklung: `codex/v0157-simplify-ai-20261013` / das zugehörige isolierte Arbeitsverzeichnis; erstes Testpaket `0.1.57-beta.1`.
- Public-Quelle: `codex/lastbrowser-electron-shell`, freigegebene Windows-Linie `0.1.56`.
- Diese Vorbereitung erstellt und verändert keine veröffentlichten Tags, Releases oder Website-Downloads.

## Rollender Abstand um eine Version

| Veröffentlichung | Public | Beta |
| --- | --- | --- |
| Einstieg nach Abnahme von 0.1.57 | 0.1.57 | 0.1.58-beta.N |
| Neue Beta-Linie 0.1.59 | 0.1.58 aus dem akzeptierten vorherigen Beta-Stand | 0.1.59-beta.N |
| Neue Beta-Linie 0.1.60 | 0.1.59 aus dem akzeptierten vorherigen Beta-Stand | 0.1.60-beta.N |

Jede Public-Promotion übernimmt den exakt akzeptierten vorherigen Beta-Quellstand. Mit stabiler Versionsnummer neu bauen, signieren und die endgültigen Artefakte prüfen. Ein bereits signiertes `-beta.N`-Paket wird nicht umbenannt oder lediglich als Stable umgetaggt. Fehlerkorrekturen verändern den abzunehmenden Quellstand und werden vor Promotion dokumentiert.

## Artefakte und Freigabe

Beta `0.1.57-beta.1`:

- `Lastbrowser-0.1.57-beta.1-x64-setup.exe`
- `Lastbrowser-0.1.57-beta.1-x64-portable.exe`
- zugehörige Setup-Blockmap, `beta.yml`, endgültige Hashes und Signaturen
- bei autorisierter Veröffentlichung Tag `v0.1.57-beta.1`, GitHub-Prerelease

Public `0.1.57`:

- neu gebaute und signierte EXE-Dateien mit `0.1.57`, Setup-Blockmap, `latest.yml`
- bei autorisierter Veröffentlichung Tag `v0.1.57`, reguläres GitHub-Release

`generateUpdatesFilesForAllChannels` bleibt ausgeschaltet. Ein Beta-Build erzeugt keine Stable-Metadaten. `scripts/resolve-release-channel.mjs`, die Release-Pipeline und `scripts/refresh-signed-release-metadata.mjs` binden Tag, Paketversion, Release-Typ und Feed-Datei aneinander. Hashes und Blockmap erst nach der endgültigen Signierung aktualisieren. Website-Picker verlinken ausschließlich tatsächlich veröffentlichte, freigegebene Pakete; Linux bleibt separat durch Vesper versioniert.

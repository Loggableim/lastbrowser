# Issue 291: vorhandener Dokumentationsentwurf

Stand: 26. November 2026. Für die geforderte Featureliste existiert bereits [PR 325](https://github.com/Loggableim/lastbrowser/pull/325). Eine zweite Liste wurde deshalb nicht angelegt. Der Entwurf muss vor Übernahme gegen den aktuellen Stand aktualisiert werden; seine Prüfung bezieht sich auf einen anderen Branch.

Konkrete Abweichungen im aktuellen Arbeitsbaum:

- Der Entwurf nennt zwei Terminalmodi. `apps/desktop/src/main/terminal-process.ts` definiert zusätzlich `codex` und behandelt diesen Modus beim Start.
- Der Entwurf zählt `websql` zu den durch die Löschfunktion entfernten Speichern. `apps/desktop/src/main/browser-data-cleanup.ts` führt derzeit `cookies`, `localstorage`, `cachestorage`, `indexdb` und `serviceworkers` auf, aber nicht `websql`.
- Die Aussage zur systemweiten DRM-Erkennung beschreibt nur einen möglichen Pfad. `apps/desktop/src/main/drm.ts` verwendet bei der entsprechenden Laufzeit den nativen Komponenten-Updater; dessen Bereitschaft hängt unter anderem von der Update-Einstellung ab. Eine erfolgreiche Wiedergabe auf einem Streamingdienst folgt daraus nicht.
- Die zeilengenauen Fundstellen des Entwurfs beziehen sich auf den älteren Branch und müssen neu geprüft werden. Beispielsweise liegt der dort mit Zeile 22 belegte Typ `TerminalMode` im aktuellen Stand an Zeile 23 und hat einen weiteren Wert.

Die Prüfung erfolgte anhand des PR-Dateiinhalts und der genannten Dateien im aktuellen Arbeitsbaum. Sie ist keine vollständige inhaltliche Abnahme aller 41 Referenzen und kein Review-Kommentar auf GitHub. Kein Merge und keine Veröffentlichung wurden vorgenommen.

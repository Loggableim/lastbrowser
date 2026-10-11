# A-004b / Lastbrowser v0.1.53 Website- und Downloadprüfung

Datum: 11. Oktober 2026 (Wien)  
Agent: chatgpt-worker-2  
Quellbasis: `release/v0.1.52` (`121fc9850e71e6c49e71ff99f246789f9d457e40`). Der ursprüngliche A-004b-Startpunkt enthielt nur Website-Kopien bis v0.1.43; für einen minimalen, nachvollziehbaren PR wurde auf den aktuellen v0.1.52-Quellstand umgestellt.  
GitHub-Release: https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.53

## Änderungen

- Sieben lokalisierte Downloadseiten zeigen v0.1.53, veröffentlichte Asset-URLs, Byte-Größen und SHA-256-Prüfsummen.
- Sieben lokalisierte Changelogs führen v0.1.53 mit Veröffentlichungsdatum und sachlicher Hotfix-Zusammenfassung.
- RSS-Feed enthält den Eintrag v0.1.53 und UTC-Veröffentlichungszeit; vorhandene Historie bleibt erhalten.
- Download-Proxy leitet Setup, Portable und `latest.yml` an die v0.1.53-Assets weiter.

## Asset-Evidenz

GitHub Release API Asset-Digests und Größen wurden zuvor gegen die lokal signierten/geprüften Release-Dateien abgeglichen:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Lastbrowser-0.1.53-x64-setup.exe` | 160,713,120 | `4AB50EA0DCD2B4215A831F2F3D09A707420AA999E9541D377309BB99BB998335` |
| `Lastbrowser-0.1.53-x64-portable.exe` | 160,349,776 | `9821B152B3AE3248C9E3990D833AE047D711DE5391960D92FED02CC654A27663` |

## Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npm ci` | Bestanden; 424 Pakete installiert. npm meldet 33 Abhängigkeitsschwachstellen (2 niedrig, 6 moderat, 22 hoch, 3 kritisch); nicht Teil dieser Website-Änderung. |
| `node --test lastbrowser.com/tests/download-counter.test.mjs` | Bestanden: 15 Tests. |
| `npm run build` | Bestanden; Desktop-TypeScript und Vite-Build erfolgreich. Vite meldet bestehende große Chunks. |
| Website-Build | Kein separates Website-Build-Skript im Repository gefunden; die Website besteht aus statischen HTML-Seiten und Cloudflare Functions. |
| `npm run verify:store` | Exit 0; 39 PASS, 2 WARN, 0 FAIL. Warnungen: Store-Screenshots bleiben vorläufig; kein Windows-Paket wurde für Signaturprüfung übergeben. Das ist kein Store-Zertifizierungsnachweis. |
| `python -m compileall -q services/sidekick` | Bestanden, Exit 0. |
| `npm run test:run` | Nicht bestanden: 213 Dateien bestanden, 2 fehlgeschlagen; 1,945 Tests bestanden, 4 fehlgeschlagen, 17 übersprungen. `public-downloads.test.ts` erwartet noch Website-Version/Assets v0.1.45 und muss mit dem Website-PR synchronisiert werden. Ein DOM-Test konnte `electron.exe` nach `npm ci` nicht starten (`ENOENT`). |
| `git diff --check` | Bestanden. |

## Noch ausstehende redaktionelle Entscheidung

Die Website verwendet weiterhin die bestehende Produktkennzeichnung „Beta“. Das GitHub-Release v0.1.53 ist als nicht-Prerelease veröffentlicht. Die Änderung entfernt „Beta“ nicht ohne gesonderte Produktentscheidung.


## Nachtrag aus dem Hotfix-Worktree

Die dort bei `npm run test:run` zunächst sichtbaren Download-Vertragsfehler wurden in PR #31 durch eine versionsbewusste Prüfung für v0.1.52 und v0.1.53 behoben. Anschließend liefen dort 215 Testdateien / 1.967 Tests erfolgreich. Der separate Website-Worktree hatte nach `npm ci` weiterhin kein installiertes Electron-Binary; daher war dort nur der gezielte Website-Counter-Test mit 15/15 direkt erfolgreich.

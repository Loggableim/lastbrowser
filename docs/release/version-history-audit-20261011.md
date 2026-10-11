# Versionshistorie-Prüfung für v0.1.54 (11.10.2026)

## Vorgehen

Die Prüfung nutzte die lokalen Git-Tags und Commit-Historie des Source-Integrationsworktrees sowie die veröffentlichten GitHub-Release-Metadaten und vorhandene Kandidatenberichte. Tag, Release, Testkandidat und Quellstand wurden getrennt behandelt. Der alte PR35-Branch auf `2aaea049` wurde nicht als Quellbasis übernommen; laut Review unterscheidet er sich im App-/Backendbaum in 617 Dateien vom veröffentlichten v0.1.52-Tag.

## Bestätigte veröffentlichte Versionen im betrachteten Intervall

| Version | Source-Tag | Veröffentlichung / Einordnung |
| --- | --- | --- |
| 0.1.44 | `v0.1.44` → `86d7090b43f4f08baa1678074d9a98c1be8e66c1` | GitHub-Releasezeit laut PR35-CTO-Review: `2026-10-03T20:54:20Z`; Changelogdatum ist daher 2026-10-03, nicht 2026-10-05. |
| 0.1.45 | `v0.1.45` → `efe98a1f3414c717fc45e29b94f21eb727c102d3` | Tag und veröffentlichte Release-/Downloadänderungen vorhanden; Datum 2026-10-05. |
| 0.1.52 | `v0.1.52` → `08d89f08` (veröffentlichte Version) | Aktueller Release-Quellstand vor v0.1.53; PR42 basiert auf dem freigegebenen Patchzweig `release/v0.1.52` bei `d39ae7fa`. |
| 0.1.53 | `v0.1.53` → `bc8da121` | GitHub-Release ist veröffentlicht; PR31 dokumentiert Version, Paketbelege und den öffentlichen Downloadvertrag. |

## Test-/Prereleases und fehlende reguläre Release-Einträge

Die [GitHub-Releaseliste](https://github.com/Loggableim/lastbrowser/releases) wurde am 2026-10-11 geprüft. Sie enthält ausschließlich Test-/Prerelease-Einträge für 0.1.46 bis 0.1.50, darunter mehrere nummerierte Testkandidaten; für 0.1.51 enthält sie keinen Eintrag. Es gibt in diesem Intervall keine regulären GitHub-Releases bzw. stabilen Releases für 0.1.46 bis 0.1.51. Test-/Prerelease-Tags bleiben ausdrücklich von stabilen Release-Tags und Changelog-Releaseabschnitten getrennt.

Der frühere PR35-Changelog vermischte eine alte Branch-Testzahl von 147 Dateien/1.298 Tests mit Hashes des v0.1.52-Releasepakets und beschriftete Kandidaten ohne Tag als Releases. Diese Behauptungen wurden nicht in die neue Releasehistorie übernommen. Die Release-Checkliste wurde auf commitgebundene Prüfungen umgestellt; README-Zahlen folgen erst nach dem kombinierten Gate-Lauf.

## Korrigierte historische Changelog-Einträge

- 0.1.44 wird auf 2026-10-03 datiert.
- 0.1.45 bleibt als veröffentlichter Stand vom 2026-10-05 eingeordnet.
- 0.1.46–0.1.50 bleiben als GitHub-Test-/Prerelease-Historie außerhalb der Liste stabil veröffentlichter Releaseabschnitte; 0.1.51 hat in der geprüften GitHub-Releaseliste keinen Eintrag. Bei einem späteren dokumentarischen Zweck müssen exakter Testtag und Status ausdrücklich angegeben werden.
- v0.1.52 und v0.1.53 verwenden die vorhandenen, veröffentlichten Releaseidentitäten. Für v0.1.54 wird kein Eintrag aus alten Default-Branch-Dateien abgeleitet; er folgt nach finalem Source- und Gate-Stand.

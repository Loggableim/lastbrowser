# A-019 Release-Konsistenz: Quellbasis- und Historienkorrektur

**Datum:** 2026-10-11<br>
**Status:** PR35-Inhalte selektiv korrigiert und auf dem PR42-Integrationsstand verankert

## Korrektur

PR35 beruhte auf `2aaea049149a6876df12a349b2ac969c871dedd8`, nicht auf dem veröffentlichten v0.1.52-Quellstand. Der CTO-Review stellte 617 abweichende App-/Backenddateien fest. Ein Versionsbump auf 0.1.52 aus diesem alten Stand wurde deshalb nicht übernommen.

Der alte Bericht nennt 147 Testsuiten/1.298 Tests und Store 27/27 als Belege für einen anderen Commit. Diese Zahlen belegen den PR42- oder v0.1.54-Quellstand nicht. In diesem Bündel werden README-Zahlen erst nach dem kombinierten Volltest aktualisiert. Die Versions-/Tag-Historie und die Kandidaten ohne Release-Tag sind in `docs/release/version-history-audit-20261011.md` getrennt erfasst.

Übernommen wurde die Versions-/Release-Checkliste als commitgebundene Vorlage. Sie schreibt vor, Version, Lockfile, Changelog und Gates am selben Quellstand zu prüfen. Veröffentlichungsschritte bleiben an eine ausdrückliche Rechteinhaberfreigabe gebunden.

## Herkunft des alten PR35-Berichts

Die ursprünglichen Prüfergebnisse bleiben nur als Review-Kontext erhalten. Sie wurden nicht erneut ausgeführt und sind keine aktuellen Gate-Belege. Dieser korrigierte Bericht ersetzt für die Integration die alten Aussagen zu Versionskonsistenz und Changelog-Vollständigkeit.

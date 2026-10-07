# LastBrowser: aktuelle VM-Testaufträge

Stand: 7. Oktober 2026. Dieser Einstieg gehört zum Tester-Zweig `codex/lastbrowser-electron-shell`. Die verbindlichen Aufträge liegen auf dem Dokumentationszweig und sind hier auf Commit `9079d3be5793a9d2452862fe72ad58e4949a95ac` gepinnt.

## 1. Allgemeine Funktions- und UI-Abnahme

[LastBrowser 0.1.48: verbindlicher Guest-Masterauftrag](https://github.com/Loggableim/lastbrowser/blob/9079d3be5793a9d2452862fe72ad58e4949a95ac/docs/test-reports/VM-0.1.48-TEST-ORDER.md)

Kandidat: **cec9d2f**, öffentliche unsignierte Testversion `test-v0.1.48-20261007-cec9d2f`. Download-, Größen- und ASAR-Hashvorgaben stehen ausschließlich im verlinkten Auftrag. Automatische Updates sind in diesem Offline-Testkandidaten deaktiviert; er dient nicht der Update-Abnahme.

## 2. Signiertes synthetisches Updatepaar

[Verbindlicher Guest-Auftrag: normales Beenden und Neustart](https://github.com/Loggableim/lastbrowser/blob/9079d3be5793a9d2452862fe72ad58e4949a95ac/docs/test-reports/VM-SYNTHETIC-UPDATE-PAIR-20261007.md)

Kandidat: **d6b61f3**, getrenntes signiertes Paar **0.1.47 → 0.1.48**, Release `test-synthetic-update-pair-20261007-d6b61f3`. Empfangshashes, Installation, Datenerhalt und ausschließlich gastseitiger Loopback-Feed stehen im verlinkten Auftrag. Dieses Paar ist nicht der cec9-Designkandidat und nicht das frühere öffentliche signierte 0.1.47-Paket.

## Nachweise und Zuständigkeit

Nur Codex innerhalb der tatsächlichen isolierten Windows-VM führt die Tests aus. Kein Host-Ersatzchat, keine Produktreparaturen, neuen Pakete, Signierung oder Veröffentlichung. Zugangsdaten nicht in Berichte übernehmen. Konkrete Provider- und Zugriffsgates aus den jeweiligen Aufträgen gelten weiter.

Ergebnisse eindeutig nach Quellstand, Paket-/ASAR-Hash und Szenario trennen. Bestehende Gastberichte erhalten; neue Nachweise separat ablegen. Ältere 0.1.46-/0.1.47-Berichte sind historische Ergebnisse und keine aktuelle Abnahme dieser Kandidaten. Statische Paketprüfungen ersetzen keine tatsächliche Guest-Installation oder Laufzeitprüfung.

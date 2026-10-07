# LastBrowser: separater Gastauftrag für automatische Updates

Dieser Auftrag wird ausschließlich in Codex innerhalb der tatsächlich isolierten Windows-VM ausgeführt. Ein lokaler Host-Chat ist kein Ersatz. Keine Quelländerungen, Signierung, Veröffentlichung oder Store-Aktionen.

## Exakter Kandidat

Die [separate GitHub-Testversion](https://github.com/Loggableim/lastbrowser/releases/tag/test-synthetic-update-pair-20261007-d6b61f3) enthält das synthetische Paar 0.1.47 → 0.1.48 aus demselben Quellstand `d6b61f3d9b26990f9dbce165a666166c6179bc1a`. Es ist nicht der neuere cec9-Designkandidat und nicht das frühere öffentliche signierte 0.1.47-Paket. Die Versionsnummer allein identifiziert den Kandidaten nicht.

- [Testbundle](https://github.com/Loggableim/lastbrowser/releases/download/test-synthetic-update-pair-20261007-d6b61f3/LastBrowser-synthetic-update-pair-0.1.47-to-0.1.48.zip)
- [SHA256SUMS](https://github.com/Loggableim/lastbrowser/releases/download/test-synthetic-update-pair-20261007-d6b61f3/SHA256SUMS.txt)
- [Dateimanifest](https://github.com/Loggableim/lastbrowser/releases/download/test-synthetic-update-pair-20261007-d6b61f3/transport-manifest.json)
- [Vollständiger Gastablauf](https://github.com/Loggableim/lastbrowser/releases/download/test-synthetic-update-pair-20261007-d6b61f3/START-GUEST-UPDATE.md)

| Datei | Bytes | SHA-256 |
| --- | ---: | --- |
| ZIP | 349771112 | `66a3e2c5fe53e6073f5cad8da4fac3cd1e49388040247d3e2841afc48ee8c4b5` |
| Baseline-Setup 0.1.47 | 174702744 | `1a73aa1dd19b58271884b3e36a66509c3054f268a9fb28d7cbdee0349c6d886a` |
| Target-Setup 0.1.48 | 174703168 | `5053d48be7b5b740fd8e6c4b19215f761e704d5d7960ab2f12f7bd6b04a37baf` |
| Baseline app.asar | 64007891 | `2942e2d4fe44f633b0ef153fbb330aece78dc89d12e992e290774e4c9d2bda32` |
| Target app.asar | 64007891 | `2ecf13c823fa6f89508f3dee8bade4a635afee040b2bbfb56bd0a224b9c0f6b6` |
| Öffentliches Dateimanifest | 1935 | `70a9b481a10e29739cefe3e70646b255f493122922806ee672035522e964be2c` |

Erwarteter Publisher: `Open Source Developer, Dominik Rainer`; Zertifikats-Thumbprint `1AD3C19A7338BBC3FFE4D62853411AD73E139857`. Signatur- und Publisherprüfungen bleiben aktiv. Keine Credentials, Schlüssel oder echten Browserprofile in den Gast übertragen.

## Abnahme und Nachweise

Der vollständige Ablauf steht genau einmal in `START-GUEST-UPDATE.md`. Verwende dessen Schritte für Baseline-Installation, fertigen Target-Download, normales Beenden ohne automatischen Relaunch, Neustart mit genau einem Relaunch, Datenerhalt und unvollständigen Download. Nur der Gastbetreiber startet einen Loopback-Feed: Port `18789`, URL `http://127.0.0.1:18789/feed/`, Bundle als Dokumentwurzel, Target-Dateien im Unterordner `feed/`. Kein Feed auf dem Host und keine externe Portfreigabe.

Im Rapport je Szenario: PASS/FAIL/NOT_TESTED, tatsächlicher VM-/Chatkontext, empfangene Hashes, Installationspfad und Profil, Befehle/Exitcodes, Zeitpunkte, Prozessübergänge, finale Version und erhaltene harmlose Testdaten. Eine bereits gestartete 0.1.48-App oder ein heruntergeladenes Setup ist kein Update-Installationsnachweis. Zwei Update-Szenarien benötigen getrennte entbehrliche Baseline-Zustände; keine reale Benutzerinstallation dafür zurücksetzen.

Statisch geprüft sind Paketinhalt, signierte Setups, VMP, Metadaten und unveränderte Local-AI-Dateien. Die gesicherten Uninstaller sind gültig signiert, ihre exakten eingebetteten Bytes wurden nicht unabhängig aus dem finalen Setup extrahiert. Beim Baseline-Nachweislauf trat nach der Paketvollendung ein Shell-Wrapperfehler auf; dessen Exit wird nicht als 0 ausgegeben. Installation, Update-Anwendung und sauberes Windows bleiben bis zum tatsächlichen Gastlauf NOT_TESTED.

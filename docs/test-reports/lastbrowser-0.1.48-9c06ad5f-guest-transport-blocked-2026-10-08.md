# LastBrowser 0.1.48 9c06ad5f — Guest-Test blockiert

Datum: 2026-10-08  
Auftragsquelle: Branch `codex/store-guest-9c06-docs-20261008`, Commit `51185642`  
Auftrag: `docs/test-reports/VM-STORE-9C06-TEST-ORDER-20261008.md`  
Status: **BLOCKED — Kandidatentransport ausstehend; kein App-Test gestartet**

## Kandidat und Gate

Der neue Auftrag pinnt den Kandidaten `store-package-9c06ad5f-20261008`, Source-Commit `9c06ad5f20102e45deb6312b2e4f91d6b4c7255a`. Die README und Hashmanifeste kennzeichnen den Guest-Transport als `PENDING`; der Auftrag sagt, dass keine Ausführung freigegeben ist, bevor das exakte Artefakt übertragen und im Guest verifiziert wurde.

Erwartete Kandidaten:

| Artefakt | Erwartete Bytes | Erwartete SHA-256 | Guest-Befund |
| --- | ---: | --- | --- |
| Setup `Lastbrowser-0.1.48-x64-setup.exe` | 174209985 | `c94e2784d52b380f55da589b2c792cc41a26b7cdf6ef2df0c7e4a9ce60881548` | **Fehlt** |
| Portable `Lastbrowser-0.1.48-x64-portable.exe` | 173855852 | `e800c9f496452881ac8c8d50d59971849c7d34da58ca3b0c3edadd510f6d1481` | **Fehlt** |
| Erwartetes `resources/app.asar` | 64027770 | `34bea0db2ed0e854bc7d4dc1eab4222004f791eedd3067d189741a40bb57bbfe` | Nicht messbar; Kandidat fehlt |

Im Downloadordner liegt `Lastbrowser-0.1.48-x64-portable.exe` mit 175170969 Bytes und SHA-256 `0c3b0855dfdf2b4c2e5cc37efa4421a6a94599ebbbeb3479e0fac0b1ac68b357`. Das ist der zuvor gepinnte **cec9**-Kandidat und passt nicht zu 9c06ad5f. Die dortige Setup-Datei ist Version 0.1.45, ebenfalls kein Ersatz. Der im neuen Branch enthaltene 32617-Byte-Guest-Bundle-ZIP ist ein Auftrag-/Dokumentationsbundle; das Manifest führt die Setup- und Portable-Dateien als separate, noch zu übertragende Release-Assets.

## Ergebnis

Keine App gestartet oder installiert. Keine UI-Szenarien, First-Launch-, Design-, FIX2-, WebView- oder Local-Model-Store-Fälle ausgeführt. Alle 9c06ad5f-Runtimefälle bleiben **NOT_TESTED**; der Kandidatenstart ist **BLOCKED** wegen fehlender exakt gepinnter Pakete. Der Computer-Use-Zugriff über `node_repl` ist vorhanden; gemäß dem gelesenen Computer-Use-Skill wurden keine UI-Aktionen ausgeführt, weil das Kandidaten-Hashgate nicht erfüllt ist. Provider-/LLM-Aufrufe: **0**. Screenshot: keiner, da kein App-Test stattfand.

## Erforderlicher nächster Schritt

Den exakten 9c06ad5f-Setup- und/oder Portable-Kandidaten über einen autorisierten Weg in den Guest übertragen. Danach im Guest Dateigröße und SHA-256 gegen den Auftrag prüfen. Erst bei Übereinstimmung den freigegebenen, isolierten Guest-Test fortsetzen und anschließend den tatsächlich extrahierten/installierten ASAR prüfen. Bis dahin keine cec9- oder ältere Installationsdatei als Ersatz verwenden.

## Nachprüfung des Transfers

Am 2026-10-08 wurde der neue Dokumentationsbranch erneut geprüft: weiterhin Commit `51185642567eb7873462d3e3e42d9a5b380bfd7c`, ohne Kandidatenbinary; sein einziges ZIP ist das 32617-Byte-Auftragsbundle. Der Guest-Downloadordner enthält weiterhin nur das cec9-Portable und das 0.1.45-Setup. Die öffentliche [GitHub-Releaseliste](https://github.com/Loggableim/lastbrowser/releases) führt die frühere unsignierte 0.1.48-Testvorabversion und ältere Releases; ein Release mit Kennung `9c06ad5f` ist dort nicht gelistet. Die 9c06-Paketübertragung bleibt daher **BLOCKED / PENDING**. Keine Datei heruntergeladen oder gestartet.

# LastBrowser 0.1.54: signierter lokaler Testkandidat

Stand: 11.10.2026, Europe/Vienna. Owner: chatgpt-candidate-worker-6.
Branch: `codex/v0154-local-candidate-20261011`; [PR #44](https://github.com/Loggableim/lastbrowser/pull/44) gegen `release/v0.1.52`, nicht gemergt.

## Exakte Herkunft

- Source-Merge: `7d3d52bb58114296b66b7eeef290b67581b226bc` auf `release/v0.1.52`. Seine Parents sind `d39ae7fa572ff8ee5c2ac5443487ebb42761f3e4` und der geprüfte PR43-Head `c153ec030af40396c68507d081c528b82ca7c618`. PR43 enthält PR31–42; PR42s geprüfter Head war `353146c3cdb50977b7b8938e800122be24e2b019`. Die Zuordnung und Source-Gates stehen in `20261011-v0154-bundled-integration.md`.
- Paket-Source: Versionscommit `92ecbd64ef0a42076bdb3acae68b96427a50a386`, Parent genau der obige Merge. Er ändert nur Root-/Desktop-Version, beide Lockfile-Versionen, den CHANGELOG-Eintrag und den zugehörigen Versionstest. Beim Paketbau war der Git-Worktree sauber.
- `docs/release/version-history-audit-20261011.md` trennt die veröffentlichten 0.1.44/0.1.45 von Test-/Prereleases 0.1.46–0.1.50; für 0.1.51 ist dort kein GitHub-Release belegt. Der CHANGELOG erfindet für diese Lücke keine Stable-Releases.
- Das entpackte `resources/app.asar` enthält `@lastbrowser/desktop` Version `0.1.54`. Die verpackten Sidekick-Dateien `web/api/config.py`, `runtime/retired_providers.py` und `cli/web_server.py` sind SHA-256-bytegleich zu diesem Source-Checkout.

## Aktuelle Source- und Build-Prüfung auf dem Versionscommit

| Prüfung | Ergebnis |
| --- | --- |
| `npm ci` | Exit 0, 424 Pakete; 33 vorhandene npm-Audit-Befunde (2 low, 6 moderate, 22 high, 3 critical). Keine Dependency-Änderung außer Versionsfeldern. |
| `CI=1 npm test` | Exit 0, 220/220 Dateien und 1.994/1.994 Tests. |
| `npm --workspace apps/desktop run build` | Exit 0; TypeScript und Vite bestanden, bestehende Chunkgrößenwarnung. |
| `python -m compileall -q services/sidekick` | Exit 0. |
| `npm run verify:store` | Exit 0, 39 PASS / 2 WARN / 0 FAIL. Warnungen: vorläufige Screenshots/Lokalisierung und zum Zeitpunkt des Preflights noch fehlendes signiertes Paket. Keine Store-Zertifizierung. |
| `git diff --check` vor dem Versionscommit | Exit 0. |

Das fehlende Windows-Electron-Binary nach `npm ci` wurde nur im ignorierten `node_modules` aus dem vorhandenen PR42-Integrationsworktree wiederhergestellt. Version `37.10.3+wvcus`, SHA-256 der EXE `096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1`. Die Python-Runtime wurde offline aus der vorhandenen lokalen Wheelhouse vorbereitet; Core-Sidekick-Imports bestanden. Keine externe Sidekick-Synchronisation.

## Paket und Signaturen

Lokaler Ausgabepfad: `C:\Users\logga\.codex\worktrees\v0154-local-candidate\lastbrowser\apps\desktop\release-local-0.1.54-20261011-r2` (ignoriert, nicht in Git). `electron-builder 26.8.1`, NSIS und Portable, `--publish never`, `forceCodeSigning=true`, Certum-Zertifikat `1AD3C19A7338BBC3FFE4D62853411AD73E139857`, `EVS_REQUIRED=1`.

Ein erster Paketversuch endete vor fertigen Artefakten, weil Windows PowerShell `Microsoft.PowerShell.Security` nicht automatisch lud. Der Windows-PowerShell-Modulpfad wurde geprüft und für den zweiten, getrennten Ausgabepfad korrigiert. Nur `-r2` ist der Kandidat.

| Exakte Datei | Bytes | SHA-256 | Prüfung |
| --- | ---: | --- | --- |
| `win-unpacked/Lastbrowser.exe` | 205.141.472 | `9AC5939800E751675E1C8EE1E7E2E0EA6992AF2877BED367AD5670B467291A27` | Version `0.1.54.0`; `signtool /pa /v` PASS, Authenticode Valid, Certum-Thumbprint und Zeitstempel PASS; EVS/VMP `verify-pkg` gültig. |
| `Lastbrowser-0.1.54-x64-setup.exe` | 160.631.928 | `69C0528CE54C32F67C18A14356B79C0D1FA0DCB9C0EAF48490D9F9EB5726AC3D` | Version `0.1.54`; `signtool /pa /v` PASS, Authenticode Valid, Certum-Thumbprint und Zeitstempel PASS. |
| `Lastbrowser-0.1.54-x64-portable.exe` | 160.269.808 | `ED3AC87B80B31460D0A866D0A7A5463510C5C97DA570E73A652C90EEECA99F1C` | Version `0.1.54`; `signtool /pa /v` PASS, Authenticode Valid, Certum-Thumbprint und Zeitstempel PASS. |

Castlabs `sign-pkg` und `verify-pkg` meldeten eine gültige Streaming-VMP-Signatur für die entpackte EXE. Die unabhängige Paketprüfung `scripts/verify-windows-package-signatures.ps1` prüfte 121 native Dateien inklusive Setup: 0 Fehler; JSON-Beleg `store-signatures.json` (37.479 Bytes, SHA-256 `F259DA721DB0D3A9B12F27C6EA47377167F4A8B5602374E6BA04C447350CB044`). `latest.yml` wurde nach Signierung aus beiden finalen EXE-Dateien neu berechnet: Version `0.1.54`, Setup als Updatepfad, passende SHA-512/Größen. `latest.yml`: 528 Bytes, SHA-256 `4CA1075169D7BBAF98A143D6C9E0201974D66E095DFB45E0535034193772FD15`; Setup-Blockmap: 158.491 Bytes, SHA-256 `933D0432A5953D92883558BCA99BEDD7AEDA0848EC121C342552D215D0A99336`. Die EXE-Hashes waren nach der Metadatenkorrektur und unmittelbar vor Installation unverändert.

Ein zweiter `verify-store-readiness.ps1`-Lauf mit dem **exakten signierten** `win-unpacked`, Setup und Signaturreport bestand mit 40 PASS / 1 WARN / 0 FAIL. Die verbleibende Warnung betrifft vorläufige Screenshots/Lokalisierung; dies bleibt ein Preflight und keine Store-Zertifizierung.

Für diesen Lauf war keine neue SimplySign-Anmeldung nötig. Der erfolgreiche lokale Signier- und Verifikationslauf belegt die Signatur der exakten Dateien. Beginn und Ablaufzeit der bereits bestehenden Signier-Session sind unbekannt; aus dem Zertifikat allein wird keine Sessiondauer abgeleitet. Kein Token wurde gelesen oder protokolliert.

## Installation und kurzer Start auf Cids PC

- Vorher: installierte `C:\Users\logga\AppData\Local\Programs\Lastbrowser\Lastbrowser.exe` meldete `0.1.53.0`; vier zugehörige Prozesse, ein sichtbares Fenster. `%APPDATA%\Lastbrowser` war vorhanden (8 Dateien und 13 Verzeichnisse auf oberster Ebene, ohne Inhaltsinspektion).
- Exakt das oben gehashte Setup wurde am 11.10.2026 um 10:42:30 CEST mit NSIS `/S` über die bestehende Nutzerinstallation gestartet. Installer-Exitcode **0** um 10:44:41 CEST. Keine Profil-Reset- oder Clean-Profile-Flags. Der vorhandene Installer-Code überspringt Nutzerdatenentfernung bei stillem Uninstall/Update.
- Danach: installierte EXE Version `0.1.54.0`, gültige zeitgestempelte Certum-Signatur. Installierte `Lastbrowser.exe` (`9AC593…A27`), `resources/app.asar` (`A60345A449993A4072B3C919690565A25941854966AAFFC05F2B27EADC4ED192`) und `resources/services/sidekick/web/api/config.py` (`9CBC8C05E2FCC24BA349C94ACF953653D03CA109307B631A4E91EF926EBBB4C4`) sind bytegleich zum geprüften `win-unpacked`-Paket. Das Profilverzeichnis ist weiterhin vorhanden, oberste Ebene weiterhin 8 Dateien / 13 Verzeichnisse. Diese Zählung ist kein Inhalts- oder Auth-Abnahmetest.
- Start der installierten EXE um 10:44:59 CEST. Um 10:45:02 CEST: vier Prozesse vom installierten Pfad und ein sichtbares Fenster mit Titel `Lastbrowser`; nach weiteren acht Sekunden weiterhin vier Prozesse und ein Fenster. Das belegt einen kurzen lokalen Start, keine erfolgreiche Provider-Antwort oder Cids Praxistestmatrix.

## Grenzen

Der lokale Kandidat ist signiert, installiert und gestartet. Cids manueller Provider-/Profil-/Chat-/Zen-Test, reale Ollama/MiMo/Codex-Antworten, Store-Abnahme und öffentliche Verfügbarkeit sind weiterhin offen. PR43s Rechts-/Lizenzentwürfe sind keine Rechtsfreigabe; offene Punkte sind in dessen Integrationsbericht dokumentiert. Kein Tag, GitHub Release, öffentlicher Binärupload, Website-Deploy oder Store-Submission wurde durchgeführt. PR #44 bleibt ungemergt.

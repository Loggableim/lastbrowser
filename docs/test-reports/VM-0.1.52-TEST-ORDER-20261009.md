# LastBrowser 0.1.52 — Guest-VM-Testauftrag (unsignierter Kandidat)

**EXECUTION HOLD:** Do not start or consume this VM order until the Human has reported the local 0.1.52 host smoke-test result in the CEO chat. The release assets are published, but Guest execution remains on hold pending that local report.

**Status:** Für den genehmigten Guest-VM-Test zugestellt. Dies ist ausschließlich ein Testkandidat; keine Aussage über Produktions-, Stable- oder Store-Reife.

## Kandidat und Remote-Artefakte

- Quellcommit: `1c43f3f60208492a04a20742b05c7538444c1d88`
- Quellbaum: `c84e9a796916ebe6b6493e292241674c9ac3d5f6`
- Branch: `codex/guest-v2-fix-2eeb`
- GitHub-Testrelease: https://github.com/Loggableim/lastbrowser/releases/tag/test-v0.1.52-20261009-1c43f3f
- Release ist `prerelease=true`; Stable/latest wurde nicht verändert.

| Datei | Download | Bytes | Remote SHA-256 | Signatur |
|---|---|---:|---|---|
| Setup | https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.52-20261009-1c43f3f/Lastbrowser-0.1.52-x64-setup.exe | 160133018 | `fe0cd66bf14bcf4aaa9b0b84105c748fc84de05ef39ef58c0939e1b0f0f5d5de` | NotSigned |
| Portable | https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.52-20261009-1c43f3f/Lastbrowser-0.1.52-x64-portable.exe | 159778878 | `4d5f86ee9282ce96c8be7c40bae0d9ca01deca451b1971b522102f9fa70e0cbd` | NotSigned |
| ASAR im Build | — | 63982571 | `b1cf5c429a00f6a8ad48e983a9ef603668c28c4260d9cdc001f7325d940c6297` | N/A |
| Unpacked EXE | — | 205065216 | `0b77a4b642f56de004af7064ced64166a72fee6d61759809262ed93b1a2407e9` | NotSigned |

GitHub Remote-Readback am 2026-10-09 bestätigte die beiden Release-Assets mit den angegebenen Größen und SHA-256-Digests. Vor dem Start Download-Hash lokal gegen diese Werte prüfen. Bei fehlendem Asset oder Abweichung stoppen.

## Prüfstatus und Grenzen

- `npm test`: PASS, 1.966 Tests.
- `npm run verify:store`: 39 PASS, 2 WARN, 0 FAIL.
- Desktop-Build und Python-Compileall: PASS.
- Gezielte Tests der behobenen Fälle: PASS.
- Vollständige Python-Suite: nach den Fixes **nicht erneut gelaufen**. Der vorangehende Voll-Lauf hatte 2 Fehler (3.738 bestanden, 111 übersprungen). Die Humanfreigabe erteilt diesen VM-Test trotz des offenen Volltest-Nachweises; dies ist kein allgemeiner Release-PASS.
- Offline-Testmarker deaktiviert automatische Produktionsupdates. Keine Anmeldung mit neuen Konten, keine neuen API-Schlüssel und keine kostenpflichtigen Providerturns.

## VM-Testschritte

1. Dedizierte, rücksetzbare Windows-Guest-VM verwenden. Keine Host-VM/Hostprofile bedienen, keine Zugangsdaten übertragen. Windows-SmartScreen kann wegen `NotSigned` warnen; keine globalen Schutzfunktionen deaktivieren.
2. Hash und Größe der heruntergeladenen Setup- oder Portable-Datei vor dem Start prüfen. Bei Abweichung STOP und als BLOCKED melden.
3. Setup installieren und ersten Start prüfen: Fenster erscheint, kein White Screen, Tabs/Adressleiste funktionieren, Sidekick-Seitenleiste lädt und die Python-Runtime meldet keine fehlenden Module.
4. Portable separat in einem eigenen Testprofil starten; Setup- und Portable-Profile dürfen sich nicht vermischen.
5. Im Unterhaltung-Modellpicker prüfen: Single Model als Standard; GPT-6 Luna nur als passende Provider/Modell-Kombination anzeigen, sofern Katalog und bestehende Konfiguration das tatsächlich anbieten. Beta-Modelle dürfen nicht automatisch gewählt werden. Falls kein bestehender, kostenfreier Providerzugang konfiguriert ist, nur UI/Fehlerdarstellung prüfen und keinen Turn senden.
6. App schließen und erneut starten. Logs/Fehlermeldungen redigiert sichern. Optional Setup wieder deinstallieren und Verknüpfungen prüfen.

Je Punkt `PASS`, `FAIL`, `BLOCKED` oder `NOT_TESTED` mit Windows-Version, Artefakttyp, sichtbarer Version und relevanten Hashes notieren. Keine Geheimnisse, API-Schlüssel, E-Mail-Adressen oder privaten Pfade in Screenshots/Logs.

## Rückmeldung

VM-Ergebnis in `docs/test-reports/lastbrowser-0.1.52-vm-test-<YYYY-MM-DD>.md` im Reports-Branch `codex/lastbrowser-electron-shell` ablegen. Den VM-Report nicht mit Quelltest- oder Paketprüfungen vermischen.
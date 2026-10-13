# LastBrowser 0.1.48 cec9 – sichtbarer Desktop-Smoke

Datum: 2026-10-07  
Ergebnis: **Fehlgeschlagen beim Renderer-Start; Funktionschecks blockiert**

## Lauf

- Portable-Kandidat: `C:\Users\lbr-eval\Downloads\Lastbrowser-0.1.48-x64-portable.exe`
- Paket-Pin: **bestanden**, 175170969 Bytes; SHA-256 `0c3b0855dfdf2b4c2e5cc37efa4421a6a94599ebbbeb3479e0fac0b1ac68b357`
- Node.js: **bestanden**, v24.19.0 aus der gebündelten Codex-Runtime gefunden.
- Extrahierter App-Payload: **bestanden**, `resources/app.asar` hatte 64012655 Bytes und SHA-256 `918330622b3cc5f2d925ae2c31e2b24b1406dbafca6230c8cc7c7b038abb663c`.
- Testprofil: temporär und isoliert angelegt; nach dem Lauf entfernt.
- Provider- und LLM-Aufrufe: deaktiviert; keine Aufrufe durchgeführt.

## Ergebnis

Der Smoke-Prozess startete den gepinnten Portable-Kandidaten und bestätigte den extrahierten cec9-Payload. Am CDP-Port 57524 erschien innerhalb von 30 Sekunden jedoch kein Renderer-Ziel. Der Lauf endete mit **0/1 Checks bestanden**. Die bereits geöffnete installierte LastBrowser-Instanz zeigte weiterhin Version 0.1.45; sie wurde nicht verändert oder geschlossen. Da kein Renderer-Ziel verfügbar war, wurden keine Start/Renderer-Recovery-, Appearance-, Zoom-pro-Domain-, Tabs-/Sessions- oder Browser-Smokes ausgeführt. Diese Checks sind **blockiert**, nicht bestanden.

Es wurde kein Test-Screenshot erzeugt, weil der Renderer nie erreichbar war.

## Launcher

Der Desktop-Link `LastBrowser UI-Teststart.lnk` zeigt auf den vorhandenen CMD-Launcher im Repository, mit dem Repository als Arbeitsverzeichnis. Die erste Fehlermeldung entstand, weil `node` nicht im PATH lag. Der PowerShell-Runner sucht jetzt zusätzlich in der gebündelten Codex-Runtime; sein Vorcheck bestätigt den Kandidaten-Pin und Node.js. Der vollständige Testlauf erreicht dadurch den Smoke, scheitert aber derzeit am fehlenden Renderer-Ziel.

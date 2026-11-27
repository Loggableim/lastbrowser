# Issue #356: Maustasten und Autoscroll

Stand: 26. November 2026. Im aktuellen Arbeitsstand registrieren Haupt- und abgetrennte Fenster einen Handler für die Windows-App-Commands `browser-backward` und `browser-forward`. Der Handler leitet sie nur an das betroffene Fenster weiter. Die Shortcut-Tests bestanden mit 11 Tests; sie simulieren die App-Commands und belegen keine Betätigung physischer Maustasten.

Der Windows-Testbuild `goal-local-test-r6-20261126/win-unpacked` wurde mit dem isolierten Browser-Smoke geprüft: 67 von 67 Prüfungen bestanden, zwei wurden übersprungen. Der Test löste Mittelklick und anschließende Mausbewegung im tatsächlichen WebView über das Chromium-Debugprotokoll aus; die lokale Seite scrollte auf `scrollY=636`. Das belegt Autoscroll in diesem Build mit simulierten Eingaben, aber nicht jede Maus, Treiberkonfiguration oder eine installierte Store-Fassung. Zurück und Vorwärts wurden im Smoke über die sichtbaren Schaltflächen geprüft; ein End-to-End-Test der physischen Seitentasten steht noch aus.

Testaufruf im Verzeichnis `apps/desktop`: `node ../../node_modules/vitest/vitest.mjs run tests/shortcuts.test.ts` sowie `LASTBROWSER_SMOKE_ALLOW_INSTALLED=1 node scripts/smoke-browser.mjs <isolierter-testbuild>/Lastbrowser.exe` (unter PowerShell die Umgebungsvariable vorher setzen). Es wurde kein bestehendes Browserprofil verwendet.

Auch der spätere lokale Payload `goal-local-test-r7-20261126` bestand den isolierten Browsertest mit 68 von 68 Prüfungen und zwei übersprungenen Prüfungen; der simulierte Mittelklick scrollte eine lokale Seite auf `scrollY=628.5`. Ein Test der physischen Seitentasten und der endgültigen Store-Fassung steht weiterhin aus.

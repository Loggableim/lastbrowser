# Chatbox v0.1.56 – Source- und Fixture-Nachweis

Arbeitsbasis: `origin/codex/p004-v0155-diagnosis-20261012` bei `4c6f11eb5772da7a0de545ef75750db970f58ba8` (vor Arbeitsbeginn gegen Remote geprüft). Der 0.1.55-ChatUX-Worker beansprucht `NativeChatMain.tsx`; dieser PR ändert die Datei und `App.tsx` nicht. PR #65 und der v0.1.56-Startseitenplan PR #62 bleiben getrennt.

## Durchgeführte Prüfungen

| Prüfung | Ergebnis | Aussage |
| --- | --- | --- |
| `npm test -- --run` | PASS: 239 Dateien, 2.170 Tests | Source-Tests im eigenen Worktree; bestehende installierte Workspace-Abhängigkeiten über eine lokale Junction verwendet. |
| `npm run verify:store` | PASS: 39 Checks, 2 WARN, 0 FAIL | Die Warnungen betreffen provisorische Store-Screenshots und das fehlende finale signierte Paket. Keine Store-Abnahme. |
| `npm --workspace apps/desktop run build` | PASS | Main-/Renderer-Source-Build; Vite meldet nur die bestehende Chunk-Größen-Warnung. Kein Installer. |
| `python -m compileall -q services/sidekick` | PASS, Exit-Code 0 | Syntaxprüfung des unveränderten Backend-Baums. |
| `node apps/desktop/tests/chatbox-v0156-fixture.cjs` | PASS | Isolierter Electron-Fixture ohne Nutzerprofil, App-Service oder VM. |

Der Fixture prüft Normal und Zen bei 900 und 390 px, horizontalen Überlauf, die Reihenfolge der Werkzeugzeile, Entwurf/Modus/Modell/Reasoning nach dem Umschalten, das Öffnen von „Weitere“ per Tastatur und die aus `--accent-primary` vererbte Sendefarbe. Er benutzt synthetische Modell- und Profilwerte; dies ist kein Provider- oder Laufzeitnachweis der installierten App. Die Screenshots sind ausschließlich UI-Fixture-Belege:

| Breite | Normal | Zen |
| --- | --- | --- |
| 900 px | [Screenshot](assets/chatbox-v0156-normal-900.png) | [Screenshot](assets/chatbox-v0156-zen-900.png) |
| 390 px | [Screenshot](assets/chatbox-v0156-normal-390.png) | [Screenshot](assets/chatbox-v0156-zen-390.png) |

## Offene Punkte

- Kein installierter App-/VM-/Live-Provider-Test. Die v0.1.55-Fixes für initiale Discovery/Modellwechsel und PR #65 sind eigene Integrationspfade; die Chatbox darf erst nach deren Review erneut abgeglichen werden.
- Der bestehende Composer hat keinen Datei-Anhang-Vertrag. Die Designreferenz zeigt „Anhängen“, aber ein funktionierender Datei-Transport braucht einen separaten End-to-End-Auftrag; dieser PR stellt keinen vorgetäuschten Knopf dar.
- Die ältere manuelle Datei `chat-composer-visual-smoke.cjs` setzt die alte dauerhafte Toolbar-/Chip-Struktur voraus und kann zudem auf diesem Host wegen eines fehlerhaften Electron-Paketpfads nicht starten. Der neue Fixture verwendet die vorhandene Windows-Electron-Binärdatei direkt und ersetzt den visuellen Nachweis für diese Chatbox-Änderung.

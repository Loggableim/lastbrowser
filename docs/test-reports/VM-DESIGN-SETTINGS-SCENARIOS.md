# LastBrowser 0.1.48 — Guest-Designnachtests


## Öffentlich bereitgestellter cec9-Testkandidat

Die separat autorisierte, **unsignierte** [Test-Vorabversion 0.1.48](https://github.com/Loggableim/lastbrowser/releases/tag/test-v0.1.48-20261007-cec9d2f) ist veröffentlicht. [Setup herunterladen](https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.48-20261007-cec9d2f/Lastbrowser-0.1.48-x64-setup.exe) oder [Portable herunterladen](https://github.com/Loggableim/lastbrowser/releases/download/test-v0.1.48-20261007-cec9d2f/Lastbrowser-0.1.48-x64-portable.exe). Beide öffentlichen Dateien wurden vollständig auf Bytegröße und SHA-256 gegen die untenstehenden cec9-Pins geprüft (Receipt: `output/dock-public-download-receipt.json`). Diese tatsächlichen URLs ersetzen für cec9 das bisher offene öffentliche Transportgate. Vor Ausführung im Guest erneut Wrapper-Hash bestätigen, dann gemäß bestehender Humanfreigabe installieren/testen und installierten ASAR-Hash prüfen. Guest-Verfügbarkeit und Laufzeit sind weiterhin nicht bestätigt; bei fehlender Datei `PACKAGE_NOT_AVAILABLE` melden. Updates bleiben in diesem Offline-Testbuild deaktiviert; keine Signierung, Stable-Feed-Promotion oder Store-Abnahme ableiten.


Status: **PREPARED / NOT EXECUTED** (2026-10-07), Szenariorevision 1. Dieser Auftrag dokumentiert Testfälle; er belegt keine Guest-Verfügbarkeit, Installation oder UI-Abnahme.

## Kandidatenbindung

- Source-Commit: `cec9d2f5ac8a22b8c492c138b7efcbef6d329aba`.
- Erwartete installierte `resources/app.asar`: 64,012,655 Bytes; SHA-256 `918330622b3cc5f2d925ae2c31e2b24b1406dbafca6230c8cc7c7b038abb663c`.
- Setup: `C:\projekte\lastbrowser\output\dist-preview-2026-10-07T11-35-23-067Z-eee6715a\Lastbrowser-0.1.48-x64-setup.exe`; 175,525,209 Bytes; SHA-256 `367a22080063833e1ce911d87a6c4f6d7bace9527abbe3bf01142af98ba18c0f`; Signatur `NotSigned`.
- Portable: `C:\projekte\lastbrowser\output\dist-preview-2026-10-07T11-35-23-067Z-eee6715a\Lastbrowser-0.1.48-x64-portable.exe`; 175,170,969 Bytes; SHA-256 `0c3b0855dfdf2b4c2e5cc37efa4421a6a94599ebbbeb3479e0fac0b1ac68b357`; Signatur `NotSigned`.
- Receiptquellen: `output/dock-new-package-receipt.json`, `output/dock-new-preview-receipt.json`. Build exit code 0; unveröffentlicht; Runtime `NOT_TESTED`; Offline-Updates deaktiviert.
- Pfade sind Hostpfade. Guest-Verfügbarkeit ist **NOT_CONFIRMED**; wenn die exakte verwendete Datei im Guest fehlt oder Wrapper-/ASAR-Hash nicht bestätigt werden kann: `PACKAGE_NOT_AVAILABLE`. Keine öffentliche URL oder Zustellung ableiten.

Kandidatenidentität je Lauf: tatsächlich verwendete Setup- oder Portable-SHA-256 plus tatsächlich installierte ASAR-SHA-256; Deduplizierung `(candidateHash, testId, scenarioRevision, testProfile)`. First-Launch-IDs/-Resultate sind getrennt und bleiben erhalten. Die First-Launch-Szenarien sind in [VM-FIRST-LAUNCH-AI-CHOICE-SCENARIOS.md](VM-FIRST-LAUNCH-AI-CHOICE-SCENARIOS.md), Szenariorevision 2, an denselben cec9-Kandidaten gebunden. Der historische Auftrag 0.1.47 und seine Ergebnisse werden nicht ersetzt.

## Sicherheits- und Evidenzregeln

- Ausschließlich die sichtbare Guest-App in der bereits autorisierten dedizierten Testumgebung und ein synthetisches, nicht persönliches Profil verwenden. Bestehende Profile nicht zurücksetzen/überschreiben.
- Keine Provider-Turns, Anmeldungen, Schlüssel, Modell-/sonstige Downloads, Source-Fixes, Builds, Signierung oder Veröffentlichungen. Offline-Updates sind deaktiviert; dieser Kandidat kann daher keine Updateabnahme belegen.
- Echte Guest-UI-/DOM-Beobachtung ist maßgeblich. Source-/Helper-Tests, Host-DOM, Mockups oder ein Screenshot eines anderen Kandidaten sind kein Runtime-PASS. Sichtbare Guest-DOM-Prüfung nur lesend.
- Je Ergebnis protokollieren: Candidate-Pins, Test-ID/Revision, pseudonyme Profilkennung, Datum/Zeit, Viewport (px), Theme/Akzent, relevante Dock-Einstellungen, Schritte, Soll und tatsächliches Ergebnis sowie bereinigter Screenshot-/Evidencepfad. Vor Ablage auf persönliche Daten/Secrets prüfen und redigieren.
- Statuswerte: `PASS`, `FAIL`, `BLOCKED`, `NOT_TESTED`, `PACKAGE_NOT_AVAILABLE`. Fehlender Kandidat ist kein Produktfehler. Keine Laufzeitbelege erfinden.

## Szenarien

| Test-ID | Revision | Schritte und Akzeptanz |
|---|---:|---|
| `DESIGN-LIGHT-ACCENT-READABILITY` | 1 | Im tatsächlichen Guest Light-Modus den relevanten Akzent aktivieren. Text/Beschriftungen auf Flächen, aktive Tabs/Buttons, Auswahlzustände und Tastatur-Fokusring ansehen. Nichts darf verschwinden, unlesbar kontrastieren oder mit semantischen Warn-/Fehlerfarben verwechselt werden. Theme, Akzent und konkreten visuellen Befund festhalten. Keine WCAG-Konformität behaupten, sofern nicht separat gemessen. |
| `DESIGN-SETTINGS-FONT-NARROW` | 1 | Settings in einem schmalen Appfenster öffnen und verfügbare Schriftgrößenlabels/-optionen prüfen. Viewport dokumentieren. Labels und Werte müssen vollständig sichtbar und ohne Überlagerung lesbar sein; Optionen müssen über die UI erreichbar sein und erforderlicher Scrollbereich funktionieren. Tatsächliche Labels und Clipping/Overflow notieren. |
| `DESIGN-FLOATING-SETTINGS-ORIENTATION` | 1 | Floating-Dock zunächst mit gespeicherter horizontaler, danach mit gespeicherter vertikaler Ausrichtung prüfen. Jeweils gespeicherten Zustand erfassen, Settings öffnen und schließen und Wiederherstellung derselben gespeicherten Ausrichtung bestätigen. In Settings über die vorgesehene UI einen Drag-/Move-Versuch machen und gespeicherte Floating-Koordinaten davor/danach vergleichen: der gesperrte Drag darf keine Positionsmutation verursachen. Beide Orientierungen mit eigenen Belegen abdecken. |
| `DESIGN-DOCK-AUTOHIDE-LIFECYCLE-FOCUS` | 1 | Mit Dock an einer Kante und AutoHide aktiviert Mount/Erstzustand sowie Zeiger-Eintritt/-Austritt und normales Ein-/Ausblenden prüfen. AutoHide in Settings deaktivieren, Zeiger wegbewegen und neu starten: Dock muss sichtbar und Einstellung persistent sein. AutoHide wieder aktivieren, neu starten und Verhalten bestätigen. Ein fokussierbares Dock-Kindelement per Tastatur erreichen, Zeiger wegbewegen und Fokus halten: Dock bleibt sichtbar, bis Fokus den gesamten Dockbereich verlässt. Manuelles Einklappen per UI prüfen; Fokus darf nicht unzugänglich werden, Dock muss über den vorgesehenen Weg wieder erreichbar sein. Persistenz, Sichtbarkeit, Fokus und Ist-Zustand dokumentieren. Floating-Position separat behandeln, da AutoHide dort nicht gelten muss. |

## Laufstatus

Alle vier Szenarien: **NOT_TESTED**. Host-Receipts und Hashes wurden geprüft; sie belegen weder Guest-Transport noch Runtime/UI. Bis bestätigtem Guest-Zugriff Kandidat als `PACKAGE_NOT_AVAILABLE` führen. Keine Provider-/Downloadbudgets werden durch diese Dokumentrevision eröffnet oder zurückgesetzt.

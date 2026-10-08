# Startup-Readiness: isolierter Quellnachweis, Guest-Ursache weiter offen

Stand: 2026-10-09, Austria-Zeit. Autoritative Basis ist `236727b2d2acb388fa6300e7022cb3f9ad7c535a`, sauberer Ursprung `E:\lastbrowser-ui-integration-20261008`. Untersuchung und enger Fix liegen im eigenen Worktree `E:\lastbrowser-startup-readiness-20261009`, Branch `codex/startup-readiness-20261009`. Das historische schmutzige C-Checkout wurde nicht als Produktquelle verwendet und nicht verändert. Keine Veröffentlichung, Signierung oder Paketierung.

## Befund und Änderung

Der [Guest-Bericht von Commit 7686846](https://github.com/Loggableim/lastbrowser/blob/76868466263f4a43c960cc266ab750ed0f18afba/docs/test-reports/2026-10-08-0.1.49-guest-retest.md) beschreibt ein dauerhaft schwarzes 1440×920-Fenster des installierten 0.1.49-Kandidaten; Ctrl+R stellte Settings wieder her. Er enthält keine erhaltene schwarze Aufnahme, Renderer-Ausnahme, Ladefehler oder GPU-Diagnose. Die Ursache bleibt unbekannt. Der installierte ASAR `856eb141180fb242580e13c37e6208fa932b7e765203f23d8b25187e26a6bf62` stammt aus `5f90bb56`, nicht aus diesem Quellstand.

Der aktuelle Start zeigt das Fenster mit dunkler Hintergrundfarbe unmittelbar (`window-chrome.ts:11`, `main.ts:425`). Nach `app.whenReady()` wartete Main vor sämtlicher Fenster-/Serviceinitialisierung ohne Deadline auf Castlabs-Komponenten (`main.ts:1345`, `drm.ts:230`). Die [zur installierten Castlabs-Version passende Komponenten-Dokumentation](https://github.com/castlabs/electron-releases/blob/v37.10.3%2Bwvcus/docs/api/components.md) beschreibt die echte Installation fehlender Komponenten durch `whenReady`; es handelt sich um einen extern abhängigen Initialisierungsschritt. Die [Electron-37-Dokumentation](https://github.com/electron/electron/blob/v37.10.3/docs/api/browser-window.md#showing-the-window-gracefully) erlaubt das unmittelbare Fensterzeigen mit Hintergrundfarbe. Ein Wechsel zu `ready-to-show` allein wäre kein belegter Fix für ein bereits dauerhaft schwarzes Fenster.

Enger Fix:

- `drm.ts:24`: maximal drei Sekunden initiale CDM-Wartezeit; dann startet die Shell mit `pending/deadline_exceeded` weiter. Installation wird nicht erfolgreich simuliert oder abgeschaltet.
- Wirkliche Auflösung meldet `ready/components_ready`, wirkliche Rejection `unavailable/component_error`, fehlende API `unavailable/unsupported`. Eine verspätete Auflösung/Rejection bleibt behandelt; nach Main-Quit werden keine späten Statusupdates veröffentlicht.
- `main.ts:301`, `main.ts:585`, `main.ts:1345`: Main hält den echten Status und liefert ihn additiv als `drm` in der vorhandenen Services-Statusantwort. Der Quit-Guard ist das bestehende `isQuitting`.
- Keine Änderung an GPU, Sandbox, Lizenzprüfung, Netzwerkregeln, Komponenten-Updater-Konfiguration, Sessionpartitionen oder Renderer-Readiness. Ein CDM-Komponentenstatus ist kein DRM-Wiedergabe- oder Accountnachweis. Wiedergabe nach später Installation bleibt praktisch zu prüfen.

## Aktuelle Prüfungen

Bereits abgeschlossene fokussierte Vitest-Prüfung: **25/25 PASS** in `drm-startup.test.ts`, `drm.test.ts`, `app-startup.test.ts`. Sechs neue Fälle beweisen die begrenzte Shellfreigabe bei nicht auflösendem Promise, sofortige echte Bereitschaft, Rejection, späte Bereitschaft, behandelte späte Rejection nach Quit sowie unsupported/ungültige Deadline. Das nicht auflösende Promise ist bewusst kontrollierte Fehler-Injektion, kein nachgewiesener nativer Guest-Hang. Diese Prüfung und die folgende Source-Reproduktion sind erhaltene historische Nachweise dieses Arbeitsstands, keine neu ausgeführte Release-Pipeline.

Genuine Main → echte preload → echte App → in-tree Sidekick / vorhandenes shipped Python wurde im eigenen synthetischen Profil gestartet. Vorhandene lokale Dependencies wurden ausschließlich über einen Junction im eigenen Worktree beziehungsweise explizite Runtime-Pfade verwendet; keine Downloads/Installationen. Erstes Startfenster wurde mit `showInactive` sichtbar gehalten, da die kontrollierte Prozessausführung `windowsHide` nutzt; kein Fokusauftrag. Das ist dokumentierter Probeaufbau, keine Produktfensteränderung.

| Szene | First paint ab Navigation | Shell beobachtet ab Prozessstart | Ergebnis |
|---|---:|---:|---|
| Frischer Start | 560 ms | 8.993 ms | Sichere Sitzungsprüfung sichtbar, Browser-only-Setup per UI abgeschlossen, Settings gespeichert |
| Neustart desselben eigenen Profils | 392 ms | 6.124 ms | Gespeicherte Settings ohne Reload sichtbar; nach weiteren 15 Sekunden weiterhin dargestellt |
| Manueller Renderer-Reload im zweiten Start | 100 ms | eigene Folgeszene | Settings weiterhin dargestellt |

Beide Starts: keine beobachtete Renderer-Ausnahme, Console-Warning, `preload-error`, `did-fail-load`, `render-process-gone` oder native Fehlerdialoge; native Komponenten wiesen fehlende Installation tatsächlich zurück. Status war `unavailable/component_error`, Sidekick und Health waren ready. Keine SDK-Inferenz; 0 Requests an den Inferenz-Fixturepfad. Main-Externals wurden kontrolliert abgewiesen (120/60 Fetchversuche); Python-Audit enthält zwei echte Bootstrap-Einträge. Diese Guards sind kein Paket-/Netzwerk-Packettrace-Nachweis.

Echtes Quit trat beide Male ein. Die jeweils exakt erfassten Python-PIDs 46480 und 39616 sowie der vorherige Diagnose-PID 29916 waren in der anschließenden gezielten Win32-Prüfung beendet. Der Moment `will-quit` enthält noch laufende Child-PIDs und ist daher allein kein bestätigter Prozessabschluss. Der Harness wurde für künftige Ausführung um eine gezielte Prüfung nach dem Mainprozessende ergänzt; dieser Zusatz ist im hier verlinkten historischen JSON noch nicht enthalten.

## Artefakte und Grenzen

Aktueller Source-Nachweis: `output/startup-readiness-a57ed8b6-2c3e-4405-b0c4-5ce0e5202e5e/report.json`, SHA-256 `6b03646217b6704ec64d0c2a34bb950d795663b48844a5410c158e80e71f3571`.

- `fresh-document-ready.png`: echte sichtbare Karte „Sichere Sitzung wird geprüft…“; die Shell muss während dieser legitimen Schutzprüfung noch nicht montiert sein.
- `fresh-15s-stable.png`: gespeicherte Settings mit tatsächlichem Space Assistant.
- `persisted-settings-document-ready.png`, `persisted-settings-shell.png`, `persisted-settings-15s-stable.png`, `persisted-settings-manual-reload.png`: dieselben Beobachtungspunkte nach echtem Main-Neustart beziehungsweise Renderer-Reload.
- Frühere Baseline `startup-readiness-89979929-3f02-443d-8d06-386e1e705a9e`: unmodifizierter Produktcode erreichte Komponentenaufruf bei 1.693 ms, tatsächliche Rejection bei 1.755 ms, Fenster bei 1.850 ms und Shell bei 9.022 ms. Die Probe scheiterte später an einem veralteten First-run-Selektor, nicht an einem beobachteten schwarzen Renderer.
- Frühester Lauf `startup-readiness-c315712a-5e35-4f52-883b-f6ca85e5887c`: 92-s-Watchdog ohne erhaltene app-ready-/Komponentenphasen und ohne Fenster. Damit ist ein früher Startuphang beobachtet, seine Zuordnung zu Widevine **nicht** bewiesen. Dieser Lauf darf nicht als Nachweis der Guest-Ursache verwendet werden.

Screenshots sind Main `capturePage`-Artefakte im kontrollierten Quellprozess. Keine menschliche/native Guest-Fensterabnahme, kein ASAR-Nachweis für 236727, kein VM-Zugriff, kein persönliches Profil-/Accounttest, keine Modellqualität. Neue direkte Humanvorgabe über den CEO: Regressionen und die vier Pflichtprüfungen nur gesammelt vor dem nächsten Release. Deshalb wurde hier keine weitere Zwischenpipeline gestartet; die vollständige Pflichtpipeline ist bis zum gemeinsamen Release-Freeze zurückgestellt. Kein neuer Neustart, Paketbuild oder Testlauf nach dieser Vorgabe.

## Minimaler weiterer Guest-Diagnoseauftrag

Falls ein neuer konkreter Guestlauf autorisiert wird, vor Ctrl+R das schwarze Clientfenster erhalten und genau den zugehörigen Main/Rendererprozess beobachten. Nur Ereigniskategorien, Zeitpunkte und redigierte Fehlerklassen protokollieren: `app-ready`, tatsächlicher Komponentenaufruf/-abschluss, Fenster `show/ready-to-show`, Shell `did-start-loading/dom-ready/did-finish-load/did-fail-load`, `preload-error`, `render-process-gone`, unhandled Modul-/Runtime-Ausnahme, erfolgreicher echter React-Shellmarker sowie erstes Paint. Assetfehler auf `app://bundle` und existierende gebündelte Entry-Dateien reduzieren; keine Seiteninhalte, Cookies, Credentials, Profile-Homes oder vollständigen Providerantworten erfassen. Danach einen manuellen Reload als getrennte Folgeszene festhalten. Keine automatische Cache-/Profilrücksetzung oder GPU-Deaktivierung.

Erst das unterscheidet fehlendes Asset, fehlenden preload, JavaScript-Modul-/Renderfehler, legitime sichere Sitzungsprüfung, tatsächliche Renderer-/GPUprozessstörung und native Fensterdarstellung. Bis zu diesem Befund bleibt „Guest ColdStart FAIL“ bestehen; der hier geprüfte Deadlinefix schließt lediglich die unbegrenzte optionale CDM-Wartezeit.

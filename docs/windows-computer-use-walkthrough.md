# Windows Computer Use: aktueller Walkthrough

## Ausgangslage und bestätigte Regressionen

Branch `codex/lastbrowser-electron-shell`, HEAD `eb268c5`, umfangreiche bereits
vorhandene Änderungen. Windows-Engine und Approval-Dateien waren untracked;
bestehende Änderungen bleiben erhalten. Kein Commit oder Push durchgeführt.

Fünf sichere neue Dispatch-Tests schlugen vor der Reparatur fehl: automatische
Freigabe ohne Callback, Modell-Run als Autorität, verschachtelte gefährliche
Texteingabe, inkompatibler macOS-set_value-Aufruf/Element 0 und verlorene
Capture-Snapshot-Metadaten. Nach Reparatur bestehen diese fünf Tests.

Lifecycle-Audit bestätigte implizites Zurücksetzen des Stop-Latches bei internem
Neustart sowie globale KeyUps, die fremde Benutzer-Eingaben beeinflussen konnten.
Die früher behaupteten Stop-SLAs und Fokusfreiheit werden nicht übernommen.

## Laufzeitgrenzen

Die Freigabe-Tripwires erkennen bekannte Escape-Muster; sie sind keine vollständige
Klassifikation beliebiger Texte oder ein OS-Sandbox-Ersatz. Ohne Host-Callback
bleiben Mutationen verweigert. Ein Worker-Kill bestätigt keine Rücknahme bereits
an eine Anwendung zugestellter UIA-Aktionen oder sichere Release-Reinigung im
gewaltsam beendeten Worker.

## Änderungen und aktuelle Stellen

- `windows_backend.py:57,173,228`: getrennte Prozess-/I/O-Locks, kein implizites
  Stop-Reset, EOF/Timeout/Crash-Recovery, unabhängig vom I/O-Kanal erzwingbare
  Prozessbeendigung; keine globalen KeyUps des Hosts.
- `tool.py:225,334` und `approval.py`: Ohne Host-Callback oder Host-Task keine
  Mutation; Modell-IDs werden entfernt. Einmalige, ablaufende Freigaben binden
  Aktion, Ziel, Snapshot, Task und vollständige normalisierte Parameter.
- `windows_worker.py:419`: private HMAC-Befehle mit Replay-Schutz; frische Nonces
  werden auch bei voller Cache-Kapazität nicht verdrängt. Stop-Latch sperrt
  auch gültig signierte Aktionen.
- `tool_guardrails.py:246`: zentrale Tripwires für bekannte Shell-/DevTools-
  Escape-Muster sowie direkte SendInput/UIA-/CDP-Umgehungen über Terminal,
  execute_code und browser_cdp. Normale Terminal-Arbeit und CDP-Reads bleiben
  verfügbar; keine vollständige Sandbox-Garantie.
- `windows_worker.py:235,336`: portabler HRESULT-Typ, tatsächlich geprüfte DPI-
  Awareness, explizite FFI-Signaturen und kontrollierte Handle-Lebensdauer.
- `windows_worker.py:681,915`: echte Patterns/Runtime-ID, Reacquisition,
  Prozessidentität, Geometrie, 30s Snapshot-TTL, Cache mit höchstens 5 Einträgen;
  Client- und Desktop-Geometrie getrennt. Keine Desktop-Ausweitung bei
  unbekanntem oder mehrdeutigem App-Ziel. Keine synthetischen Capture-Erfolge.
- `windows_worker.py:1071,1209`: installierte Pattern-API `.Value`, echte
  Nachbedingungen, korrekte UTF-16-Code-Units, exakte SendInput-Rückgaben und
  nur eigene gehaltene Eingaben für kooperative Release-Versuche. Nichtclient-
  Titelzeilen werden aus Client-Captures ausgeschlossen; kein WM_SETTEXT.
- `tool.py:531`: Snapshot-ID, Koordinatenursprung, Mapping, DPI, Pattern- und
  Elementmetadaten bis ins Tool-Ergebnis; macOS-set_value-Signatur erhalten.
- `verify-windows-computer-use.py:156,319`: eigene WinForms-Fixture, echte
  Nachbedingungen, FAIL/Exit 1 bei Fehler und Exit 2 auf nicht unterstütztem OS.

## Gezielte Prüfungen

Der abschließende Lauf über `test_windows_backend.py`,
`test_windows_backend_lifecycle.py`, `test_windows_worker_safety.py`,
`test_computer_use_dispatch_safety.py` und
`test_computer_use_approval_security.py` bestand **79 Tests in 3,76 Sekunden**.
Die sicheren Tests decken u.a. Erststart, EOF, Timeout, malformed response,
Worker-Neustart, blockierten I/O, nicht bestätigten Kill, gefälschte/abgelaufene/
replayte Freigaben, vollständige Bindungen, Snapshot-TTL/Cache/Identität,
Capture-Ausfall, DPI-/Handle-Ausfall, fehlende Patterns, UTF-16 und partielles
SendInput durch gefälschte native APIs ab.

Der Standalone-Verifier endete mit **Exit 0**. Am eigens gestarteten Fenster:
SOM und Vision lieferten gültige **424×151-PNGs**, Maße und Client-Ursprung
stimmten; AX, SOM und Vision lieferten konsistente Geometrie. Invoke erhöhte
den instrumentierten Zähler; SetValue änderte das eigene Edit-Feld, jeweils
zusätzlich im privaten IPC-Zustand belegt. SetValue auf einen Button ohne
ValuePattern wurde abgewiesen, der Fenstertitel blieb unverändert. Ein
Fokuswechsel durch den Provider wird als Warnung nach ausgeführter Aktion
gemeldet, nicht als Aufforderung zur Wiederholung.

Die Fixture blockierte ihren UI-Thread. Während der dazu gehörende Capture-
Aufruf wartete, sperrte der Not-Aus weiteren Host-Dispatch und beendete den
Worker: **0,00 ms gerundetes Host-Latch, 6,98 ms Prozessbeendigung, 7,0 ms
Gesamtdauer**. Das sind Messwerte dieses Laufs, keine SLA. Folgeaufrufe wurden
verweigert, ohne einen neuen Worker zu starten. Fixture und Worker wurden
beendet; die Fixture-PID wurde nach dem Verifier als beendet geprüft.
Die finalen Logs liegen unter `.test-tmp/windows-cua-python.log` und
`.test-tmp/windows-cua-live.log`. Zusätzlich ist FAIL/Exit 1 bei einem
kontrolliert simulierten Verifierfehler durch einen sicheren Test belegt.

Ein früher Vergleichslauf startete noch historische Windows-Tests, darunter
einen allgemeinen Desktop-Capture (Timeout) und eine leere Physical-Input-
Sequenz (Worker-EOF). Diese Tests wurden danach durch die eigene Fixture
ersetzt. Kein physischer Input wurde daraus bestätigt; der Lauf gilt nicht als
Live-Erfolgsbeleg und wird nicht wiederholt.

## Allgemeine Repository-Gates

Aktueller Lauf: `npm test` mit CI-Modus beendet statt Watch-Modus → 138 Dateien,
1.223 Tests bestanden; `npm run verify:store` → 27/27; Desktop-Build → Exit 0
(Vite meldet große Chunks, keinen Buildfehler); `python -m compileall -q
services/sidekick` → Exit 0, auch nach den letzten Engine-Korrekturen erneut
bestätigt. Logdateien der npm-Gates liegen lokal unter
`.test-tmp/windows-cua-*.log`.

## Abhängigkeiten und Verpackungsgrenze

Live-Prüfungen verwenden die vorhandene lokale Python-Installation mit
uiautomation 2.0.29, comtypes 1.4.17 und Pillow 12.3.0; nichts wurde installiert
oder heruntergeladen. Ein Installer wurde nicht erstellt. Das bestehende
`prepare-python-runtime.mjs` enthält Netzwerk-Pip-Aufrufe und wurde deshalb
für diesen Auftrag nicht ausgeführt. Ein Offline-Packaging-Nachweis und die
Prüfung dieser Engine im gebündelten Installer gehören nicht zu den hier
erbrachten Laufzeitbelegen. Fehlende Bibliotheken/DPI/Capture sind kontrollierte
Fehler, kein automatischer Download und kein synthetischer Ersatz.

## Nicht nachgewiesen

Keine Live-SendInput-Sequenz und kein physischer Eingabestopp unter aktiver
SendInput-Last, kein echtes ScrollPattern gegen eine produktive Anwendung,
keine macOS-Laufzeitprüfung, kein gemischtes Mehrmonitor-/DPI-Desktop-Setup,
kein Secure Desktop/UAC-Test und kein Installer-Nachweis. Bei erzwungenem Kill
ist kooperative Release-Reinigung nicht bestätigt. Ohne verdrahteten Host-
Freigabe-Callback sind Mutationen absichtlich gesperrt. Keine Produktionsreife
oder allgemeine Fokusfreiheit wird aus diesen Ergebnissen abgeleitet.

Keine Commits, Pushes, Versionswechsel oder Release-Aktionen. HEAD blieb
`eb268c5`; bestehende Nutzeränderungen wurden erhalten.

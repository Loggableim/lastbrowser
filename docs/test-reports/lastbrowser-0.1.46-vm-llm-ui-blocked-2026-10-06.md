# LastBrowser 0.1.46 – VM-UI-Test Quickchat und Teamwork

**Datum:** 6. Oktober 2026 (America/Los_Angeles)  
**Auftrag:** `docs/test-reports/VM-NEXT-TEST-ORDER.md`  
**Umgebung:** Windows 10 Enterprise Evaluation, Build 26300; synthetische Testdaten  
**Ergebnis:** UI-Abnahme blockiert. Es wurden keine Produktdateien verändert.

## Zugriff und Kandidat

Der Computer-Use-Skill `computer-use` wurde gelesen. Sein vorgeschriebener Windows-Pfad verwendet `@oai/sky` mit `list_apps`, `list_windows`, `get_window_state` und UI-Eingaben. Das Skillpaket ließ sich initialisieren und diese Methoden sind vorhanden. Der erste tatsächliche Fensterlisten-Aufruf scheiterte jedoch mit:

```text
Trusted RPC service is not configured: sky
```

Die separate CUA-Inventur zeigte `apps: []`. Daher konnte kein LastBrowser-Fenster an `@oai/sky` gebunden, kein sichtbarer Zustand gelesen, keine UI bedient und kein Screenshot aufgenommen werden. Der installierte Prozess ist laut Prozessinventur vorhanden; Prozesspräsenz ersetzt keine sichtbare UI-Prüfung.

Installationspfad: `%LOCALAPPDATA%\Programs\Lastbrowser\Lastbrowser.exe`. Die EXE meldet in Windows-Dateimetadaten **Electron 37.10.3**, nicht die LastBrowser-App-Version. Der freigegebene Installer war im Download-Ordner nicht vorhanden. Die App-Version 0.1.46 und die Kandidatenzugehörigkeit dieser Installation sind daher hier nicht unabhängig verifiziert. Der vorherige Bericht enthält für den Installer SHA-256 `C55BD4896F1B6D2E9013BEC29F4E2C72B295B3F4155F2D57906F739BA00850F9`; der aktuelle Auftrag gibt denselben öffentlichen Sollhash in Kleinbuchstaben an. Ein Hash der aktuell installierten App oder des nicht vorhandenen Installers wurde nicht ermittelt.

## Testfälle

| Bereich | Status | Beobachtung |
|---|---|---|
| Provider und erlaubte Modelle sichtbar prüfen | **Blockiert** | Keine Fenstersteuerung; Providerstatus und Modellliste konnten nicht in der App eingesehen werden. Keine Zugangsdaten wurden gelesen oder geändert. |
| Quickchat – kurze synthetische Anfrage und Antwort | **Blockiert** | Anfrage nicht abgesendet; keine sichtbare Modellantwort. |
| Quickchat – längere Antwort und Stop während Streaming | **Blockiert** | Kein Stream gestartet; Stop-Wirkung und Nachlauf nicht prüfbar. |
| Quickchat – UI-Reset, Folgeanfrage und Sessionliste | **Blockiert** | Keine UI-Aktion möglich; Sessionzugehörigkeit, Wiederöffnen und Trennung vom normalen Chat ungeprüft. |
| Teamwork – kleine Aufgabe und tatsächliche Beiträge | **Blockiert** | Keine Aufgabe gestartet. Provider/Modelle wurden nicht als verfügbar oder erlaubt bestätigt. |
| Teamwork – zweite Aufgabe und Stop bei sichtbarer Arbeit | **Blockiert** | Keine Aufgabe gestartet; Stop und Nachlauf ungeprüft. |

Es wurde kein API-/Harness-Aufruf als UI-Nachweis verwendet. Es gab keinen beobachteten Quickchat- oder Teamwork-Fehler der Anwendung; die Testfälle sind **blockiert**, nicht fehlgeschlagen und nicht bestanden.

## Benötigte Voraussetzung und Evidence

Die VM muss den `@oai/sky`-Trusted-RPC-Dienst bereitstellen oder die Sitzung muss eine funktionierende native Fenstersteuerung erhalten. Danach muss der installierte App-Kandidat samt Version identifizierbar sein; anschließend Provider und freigegebene Testmodelle sichtbar prüfen und die Quickchat-/Teamwork-Fälle mit synthetischen Prompts ausführen. Keine Neuinstallation ist aus diesem Bericht abgeleitet.

Screenshots konnten wegen des fehlenden Fensterzugriffs nicht erstellt werden. Die konkrete Tooldiagnose oben ist der verfügbare Blockierungsnachweis; es werden keine UI-Screenshots behauptet.

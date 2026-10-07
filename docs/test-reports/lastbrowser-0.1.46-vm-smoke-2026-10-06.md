# LastBrowser 0.1.46 – grobe Funktionsprobe in der Windows-Test-VM

**Datum:** 6. Oktober 2026 (VM-Anzeige; America/Los_Angeles)  
**Umgebung:** dedizierte Windows-Test-VM, frische Installation pro VM-Benutzer  
**Methode:** sichtbare App mit Computer Use bedient. Keine Produktdateien geändert, keine Releases oder Store-Aktionen.

## Installationsartefakt

- Installer: `LastBrowser-0.1.46-x64-UNSIGNED-TEST-setup.exe`
- SHA-256: `C55BD4896F1B6D2E9013BEC29F4E2C72B295B3F4155F2D57906F739BA00850F9`
- Größe: `175430814` Bytes (entspricht der erwarteten Größe)
- Im Auftrag war der erwartete Hash als `[REDACTED LIKELY SECRET]` ausgeblendet. Der Nutzer wies an, ohne Hashvergleich fortzufahren. Deshalb ist die tatsächliche Hashberechnung dokumentiert, aber kein Vergleich mit dem erwarteten Hash möglich.
- Im Installerfenster stand **LastBrowser 0.1.46**. In Einstellungen → System wurden **Current: 0.1.46**, **WebUI: v0.8.84**, **Agent: v0.8.84** und **Sidekick Version: v0.8.84** angezeigt.

## Ergebnisse

| Prüfpunkt | Ergebnis | Beobachtung |
|---|---|---|
| Installation und App-Start | **Bestanden** | Installation für den aktuellen VM-Benutzer abgeschlossen; die sichtbare App startete. Der erste Computer-Use-Aufruf für den Prozessstart lief in einen Timeout; Start und weitere Bedienung gelangen anschließend über den normalen App-Prozess. Das ist ein Werkzeugproblem, kein beobachteter App-Startfehler. |
| Backend-Verfügbarkeit | **Bestanden** | Einstellungen, Chat, Logs und Terminal zeigten den lokalen Sidekick/WebUI-Status als **Online**. |
| Tabs und Webseiten | **Bestanden mit Auffälligkeit** | Neue Tabs, Navigation zu `https://example.com`, Seitenanzeige, Tabwechsel und Tab-Schließen funktionierten. Die Home-Space-Karte zeigte „No tabs“, während die Seitenleiste zwei Tabs aufführte. |
| Spaces | **Bestanden** | Der synthetische Space `VM-Test-046` ließ sich anlegen und aktivieren; Wechsel zurück zum Home-Space funktionierte. |
| Einstellungen | **Teilweise geprüft** | Einstellungsseiten und Systemansicht öffneten sich. Ein synthetischer Assistentenname blieb nach Seitenwechsel und Refresh angezeigt; der Speichern-Knopf war deaktiviert. Persistenz über App-Neustart wurde nicht geprüft. |
| Quickchat-Antwort und Stop | **Nicht prüfbar – Provider fehlt** | Anfrage wurde abgeschickt, aber mit `SidekickApiError: Choose and save a provider before using Quickchat` beendet. Es gab keine laufende Modellantwort, an der Stop geprüft werden konnte. |
| Quickchat-Reset und neue Anfrage | **Teilweise bestanden** | „Add“ setzte den Verlauf zurück; eine neue synthetische Anfrage konnte abgeschickt werden, endete jedoch am selben Providerfehler. |
| Teamwork-Ausführung und Stop | **Nicht prüfbar – keine erlaubten Modelle** | Die synthetische Aufgabe zeigte kurz „Working on it…“ und „0 contributions“, endete dann mit `native_teamwork_no_allowed_models`. Eine tatsächliche Ausführung ist nicht belegt. Der Stop-Klick traf den laufenden Zustand, aber wegen des zeitgleichen Fehlers lässt sich die Stop-Wirkung nicht isoliert bestätigen. |
| Logs, einschließlich WebUI und Fehler | **Ansicht bestanden, Inhalt nicht verifiziert** | „Live Logs“ öffnete. Agent-, Web UI- und Errors-Ansichten zeigten nach Refresh „No log lines loaded“. Ob Logs vorhanden waren, konnte mangels bekanntem Logeintrag nicht festgestellt werden. |
| Extensions Hub / Vertrauensschalter | **Fehlgeschlagen / nicht geprüft** | „Tools → Extension & Skill Hub“ und der Puzzle-Button der Toolbar ließen die bisherige Ansicht stehen; der Hub wurde nicht sichtbar. Daher konnte ein etwaiger Vertrauensschalter nicht geprüft werden. |
| Terminal | **Bestanden** | PowerShell-/Sidekick-Terminal startete. `Write-Output 'VM-TERMINAL-046-OK'` wurde eingegeben und gab `VM-TERMINAL-046-OK` aus. Die Sitzung ließ sich schließen. |

## Fehler und reproduzierbare Schritte

1. **Hardwarecheck der lokalen KI meldet Verzeichniswechsel.** Beim ersten Start im Onboarding „Local AI“ → „Check your PC“ abwarten. Meldung: `The trusted application data directory changed during validation`; zusätzlich „The hardware check could not be completed“. Der Assistent bot „Try hardware check again“ und „Continue without local AI“. Ursache ist nicht geklärt; möglich ist ein VM-/Pfadkontext. Kein Produktzustand wurde manipuliert.
2. **Tabs-Zähler widerspricht Space-Karte.** Zwei neue Tabs öffnen und Home prüfen. Seitenleiste: zwei Tabs; Home-Karte: „No tabs“. Die Beispielseite konnte geöffnet werden.
3. **Extensions Hub öffnet nicht sichtbar.** Tools-Seitenleiste → „Extension & Skill Hub“ oder Puzzle-Toolbarbutton anklicken. Die Logs-/Terminalansicht blieb jeweils unverändert.
4. **Logansicht liefert keine Zeilen.** Tools → Live Logs → Web UI, Refresh; dann Errors, Refresh. Beide zeigen „No log lines loaded“. Das belegt einen leeren Ansichtsinhalt, aber nicht das Fehlen von Backend-Logs.
5. **Update-Metadaten fehlen.** Einstellungen → System zeigte `Update state: error`, `Current: 0.1.46` und `ENOENT: no such file or directory, open 'C:\Users\lbr-eval\AppData\Local\Programs\Lastbrowser\resources\app-update.yml'`. Auto-Update wurde nicht vertieft; dieses Ergebnis ist ein Nebenbefund.

## Belege

Screenshots liegen in [`evidence/`](evidence/). Wichtige Dateien:

- [Installation abgeschlossen](evidence/installation-complete.png)
- [Onboarding-Hardwarecheck-Fehler](evidence/onboarding-local-ai-error.png)
- [Space-Tabzahl-Widerspruch](evidence/space-tab-count-mismatch.png)
- [Quickchat-Providerfehler](evidence/quickchat-provider-blocker.png)
- [Quickchat nach Reset](evidence/quickchat-after-reset-blocker.png)
- [Teamwork ohne erlaubte Modelle](evidence/teamwork-no-models.png)
- [Leere WebUI-Logs](evidence/webui-logs.png)
- [Extensions Hub öffnet nicht](evidence/extensions-hub-no-navigation.png)
- [Terminal-Echo erfolgreich](evidence/terminal-echo.png)
- [Fehlende Update-Metadaten](evidence/version-update-error.png)

## Voraussetzungen und nächste Tests

- Einen eigens für diese VM vorgesehenen Testprovider und erlaubte Modelle konfigurieren; keine persönlichen Codex-Zugangsdaten verwenden. Dann echte Quickchat-Antwort, Stop während des Streamings, Reset und Folgeanfrage prüfen.
- Teamwork erneut ausführen, sobald zulässige Modelle vorhanden sind; Beiträge, tatsächliche Tool-/Worker-Aktivität und Stop separat beobachten.
- Extensions Hub mit aktuellem Laufzeitstatus erneut öffnen und den Vertrauensschalter nur prüfen, wenn der Hub sichtbar ist.
- Für Logs zunächst einen bekannten, synthetischen Fehler oder Backend-Logeintrag erzeugen und prüfen, ob die WebUI- und Fehlerfilter ihn darstellen.
- Hardwarecheck nach Verifikation des erwarteten App-Datenpfads erneut testen; den Updatefehler getrennt im vereinbarten späteren Auftrag untersuchen.
- Upgrade, Änderungs-Popup und detaillierte Store-Abnahme bleiben gemäß Testauftrag für den nächsten Auftrag offen.

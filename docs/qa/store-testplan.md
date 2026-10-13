# Manueller QA-Testplan für einen Microsoft Store Release

Stand: 13. Oktober 2026. Dieser Plan gilt für den **konkreten signierten Store-Kandidaten**, der eingereicht werden soll. Er ist kein Testergebnis und ersetzt weder Windows App Certification Kit noch Partner Center-Zertifizierung.

## 1. Testlauf binden

Vor dem Test ausfüllen; ohne diese Angaben ist das Ergebnis **nicht verifiziert**:

- Testlauf-ID / Datum / Tester:
- Windows-Edition, Version und Build; Architektur; Sprache/Region; Auflösung und Skalierung:
- Store-Paketversion und Paketidentität:
- Quell-Commit-SHA und PR/Release-Kandidat:
- Installer-/MSIX-Dateiname, Größe und SHA-256 (für jedes Artefakt getrennt):
- Authenticode: Signierer, Status, Zeitstempel und Kettenprüfung:
- Installationsquelle: Store, saubere Setup-Datei oder Update-Kanal (genau angeben):
- Testprofil: frisch oder bestehend; Testdaten und Backendprofile getrennt von persönlichen Daten halten:
- Netzwerkzustand und verwendete Konten/Modelle: nur nötige Namen, niemals Tokens, Cookies oder Zugangsdaten erfassen.

Jeder Schritt erhält **PASS**, **FAIL** oder **nicht verifiziert** plus Zeit, genaue Aktion, erwartetes/tatsächliches Ergebnis und Belegpfad. Fehler mit Repro-Schritten und relevanten redigierten Logs dokumentieren. Keine Secrets oder vollständigen persönlichen Pfade in geteilte Berichte aufnehmen.

## 2. Freigabeschwellen

- Teste nur Bytes, deren SHA-256 und Signatur vorab geprüft und an den Kandidaten gebunden sind.
- Der Store-Installationsweg muss tatsächlich aus dem vorgesehenen Store-Paket erfolgen. Ein lokaler Setup-Test ist ein separater Beleg.
- Update muss von der konkret angegebenen Vorgängerversion auf den Kandidaten laufen. Eine Neuinstallation zählt nicht als Update.
- Keine persönlichen Browserprofile importieren, keine bestehenden Profile löschen und keine Sicherheits-/Reputationswarnungen umgehen.
- Für Sidekick ohne bereits autorisiertes Testmodell nur lokale Start-, Verbindungs- und Fehlerzustände prüfen. Keine Live-Inferenz behaupten.
- DRM-Abos werden nur mit ausdrücklich bereitgestellten Testkonten geprüft. Konto-/Regionseinschränkungen sind externe Blocker, nicht automatisch Produktfehler.
- Releaseurteil bleibt **HOLD**, solange ein Pflichtschritt FAIL oder nicht verifiziert ist.

## 3. Testfälle

| ID | Bereich und Ablauf | Erwartung | Ergebnis / Beleg |
|---|---|---|---|
| ST-01 | Saubere Store-Installation auf frischem Windows-Testprofil; Paket im Store beziehen und installieren | Installation endet erfolgreich, richtiger Publisher/Name/Version; keine unerwarteten Dialoge oder Autostarts | nicht verifiziert |
| ST-02 | Erststart nach Store-Installation | Fenster erscheint mit nutzbarer Startseite; keine dauerhaft schwarze/leere Fläche; Ersteinrichtung lässt sich abschließen oder sauber überspringen | nicht verifiziert |
| ST-03 | App schließen und erneut starten; Windows ab- und anmelden | App startet wieder mit derselben installierten Version; keine Erststartschleife | nicht verifiziert |
| ST-04 | Store-Update von der benannten Store-Vorgängerversion installieren | Store bietet Update an und beendet es erfolgreich; Version ist danach exakt der Kandidat | nicht verifiziert |
| ST-05 | Daten nach Update prüfen | Lesezeichen, Einstellungen, Profile, lokale Chats und erlaubte Sidekick-Konfiguration bleiben erhalten; keine fremden Profile/Secrets importiert | nicht verifiziert |
| ST-06 | Update abbrechen oder Netzwerk kurz unterbrechen, danach erneut versuchen | App und bestehende Daten bleiben startbar; erneuter Store-Versuch kann fortgesetzt werden; keine beschädigte Installation | nicht verifiziert |
| ST-07 | Deinstallation über Windows Einstellungen/Store | Paket wird vollständig entfernt; kein Fehlerdialog; keine LastBrowser-Prozesse bleiben hängen | nicht verifiziert |
| ST-08 | Datenaufbewahrung nach Deinstallation und Neuinstallation | Ergebnis mit der dokumentierten Produktpolitik abgleichen; keine stillschweigende Löschung oder unerwartete Wiederherstellung. Vorher/Nachher nur Testprofil verwenden | nicht verifiziert |
| ST-09 | Standardbrowser-Grundfunktionen | Neue Tabs, URL-/Suchnavigation, Zurück/Vorwärts, Tab schließen und Neustart prüfen; keine Store-spezifischen Protokoll-/Rechtefehler | nicht verifiziert |
| ST-10 | Sidekick beim Erststart ohne eingerichteten Backendpfad | Keine Abstürze; klarer Zustand und erreichbare Setup-/Einstellungsaktion; Browser bleibt ohne KI benutzbar | nicht verifiziert |
| ST-11 | Sidekick mit sauberem, getrenntem Testprofil starten | Gebündelter Dienst startet lokal; Health-/Ready-Zustand wird korrekt angezeigt; Prozess beendet sich beim App-Ende oder bleibt gemäß Produktvertrag verwaltet | nicht verifiziert |
| ST-12 | Sidekick-Verbindung verlieren und wiederherstellen | Verständlicher Offline-/Fehlerzustand; Wiederholen verbindet nach Dienstwiederkehr; kein stiller Profilwechsel | nicht verifiziert |
| ST-13 | Chat und Quickchat ohne konfiguriertes Modell öffnen | Kein Send mit nicht verfügbarer Auswahl; Erklärung/Setup bleibt bedienbar; Quickchat wird nicht als normaler Chat gespeichert | nicht verifiziert |
| ST-14 | Autorisierter lokaler oder Testmodell-Chat, falls freigegeben | Eine kurze Nachricht senden, Antwort abwarten, Stop und erneutes Senden prüfen; Modell-/Provider-Metadaten stimmen; keine Secrets erfassen | nicht verifiziert |
| ST-15 | Terminal öffnen und schließen | Terminalfläche startet, Eingabe und Ausgabe funktionieren; Fenster schließen beendet zugehörigen Prozess; kein Zugriff außerhalb des Testprofils ohne Nutzeraktion | nicht verifiziert |
| ST-16 | Terminal in Store-Sandbox ohne verfügbare Shell/Komponente | Verständliche Fehlermeldung und sichere Rückkehr; Browser bleibt nutzbar; kein Main-Prozess-Absturz | nicht verifiziert |
| ST-17 | Widevine/CDM-Start prüfen | Main-Log meldet den erwarteten Initialisierungszustand ohne persönliche Daten; fehlendes CDM wird als nicht verfügbar gemeldet und blockiert nicht den Browser | nicht verifiziert |
| ST-18 | Netflix-Wiedergabeseite öffnen; bei freigegebenem Konto einen geschützten Titel starten | Seite lädt; bei unterstützter Umgebung startet und spielt DRM-Inhalt; Fehlercode/Region/HDCP getrennt vom App-Fehler dokumentieren | nicht verifiziert |
| ST-19 | Disney+ Wiedergabeseite öffnen; geschützten Titel starten, sofern Konto/Region verfügbar | Wie ST-18; sichtbare Wiedergabe und kontrollierter Stopp; Konto-/Regionblockade separat markieren | nicht verifiziert |
| ST-20 | Prime Video Wiedergabeseite öffnen; geschützten Titel starten, sofern Konto/Region verfügbar | Wie ST-18; keine Wiedergabe allein aus erfolgreichem Seitenaufruf ableiten | nicht verifiziert |
| ST-21 | Audio-/DRM-Seite Spotify öffnen und Wiedergabe prüfen, sofern Konto verfügbar | Anmeldung/Seite und tatsächliche Wiedergabe getrennt protokollieren; keine DRM-Fähigkeit aus einer Adblock-Ausnahme ableiten | nicht verifiziert |
| ST-22 | DRM-Seite ohne Konto und nach Abmeldung | Öffentliche/Anmeldeseite bleibt erreichbar; Anbieterlogin- oder Abo-Blockade korrekt als extern/nicht verifiziert markieren | nicht verifiziert |
| ST-23 | Windows-Sicherheit, Firewall und Store-Sandbox | Keine Aufforderung, Schutzfunktionen zu deaktivieren; lokale Backendkommunikation funktioniert mit den vorgesehenen Berechtigungen | nicht verifiziert |
| ST-24 | Systemneustart nach Installation und Update | Store-Paket startet und behält erwartete Benutzereinstellungen; keine verwaisten Sidekick-/Terminalprozesse | nicht verifiziert |

## 4. Beleg- und Fehlerformat

Für jeden Fall speichern:

```text
Run-ID:
Fall-ID:
Kandidat-Quell-SHA:
Paketversion / Artefaktname / Bytes / SHA-256:
Signatur / Zeitstempel:
Windows-Build / Profilzustand:
Status: PASS | FAIL | nicht verifiziert
Schritte:
Erwartet:
Beobachtet:
Belegpfade (Screenshot, redigiertes Log, Store-Status):
Fehlercode / Repro (falls FAIL):
Externe Einschränkung (Konto, Region, Netzwerk), falls zutreffend:
```

Keine erfolgreiche Installation, Startseite oder DRM-Seite allein als vollständige Release-Abnahme werten. Testergebnisse müssen genau zum Paket passen, das für die Store-Einreichung vorgesehen ist.

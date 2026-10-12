# Argus: v0.1.56 Chat-Responsiveness und Usability

Datum: 2026-10-12 (Pacific time). Status: **BLOCKIERT vor dem Paket-Hashgate; kein v0.1.56-App-Test ausgeführt.**

## Kandidat und Integritätsgate

Der aktuelle P004-Handoff in Draft-PR #72 bezeichnet diesen privaten Preview-Kandidaten:

- Quelle: `d14cf6705dcdeb4a2c65c6acba9af0f321205538`, PR #72.
- Datei: `Lastbrowser-0.1.56-UNSIGNED-VMTEST-d14cf670-x64-portable.exe`.
- Erwartet: 170,691,368 Bytes, SHA-256 `ac5f50d00c44d866b1b756ffb437dbc0b9a298fd0831d2445993024252c5f8a1`.
- ASAR erwartet: 75,234,230 Bytes, SHA-256 `b24b721a1f04616d096e73fcbae63b971dd86308ba87ffa09b0fe7b92e8be8ca`.
- Paketvariante: `offline-test`, unsigniert, nicht veröffentlicht. Kein öffentlicher Release oder Store-Paket.

Die Pins und der Handoff wurden in PR #72 geprüft. Der direkte Draft-Download-Link lieferte keine EXE. Über die angemeldete GitHub-Draftseite startete der Download, anschließend zeigte Edge die Schutzwarnung: „isn't commonly downloaded. Make sure you trust … before you open it.“ Das Artefakt erschien nicht im lokalen Downloads-Ordner. Somit konnten Bytezahl, SHA-256, ASAR-Pin und Ressourcenmanifest nicht am empfangenen Kandidaten verglichen werden; die App wurde nicht gestartet. Das ist ein **Zugriffs-/Schutzgate, kein Produktfehler und kein PASS**. Für die Fortsetzung muss der VM-Owner die Datei gemäß Edge-Schutzabfrage selbst freigeben oder den Kandidaten auf einem bereits freigegebenen VM-Pfad bereitstellen; danach prüft Argus alle Pins vor dem Start erneut.

Die Browseransicht enthielt weitere offene Provider-Tabs. Davon wurden weder Screenshots noch Zugangsdaten übernommen. Kein Screenshot dieses blockierten Downloadversuchs wird als Abnahmebeleg ausgegeben.

## Vorhandene Vergleichswerte aus dem signierten v0.1.55

Diese Werte stammen ausschließlich aus dem früheren signierten Paket `04593080` und sind kein Nachweis für v0.1.56:

| Probe | Sendeaktion bis erster Backend-Text | Auffälligkeit |
| --- | ---: | --- |
| Standardchat, MiMo V2.6 Flash / OpenCode Go | 86.8 s | `/api/chat/start` 17.141 s; Worker und Agent initialisierten vor der Providerantwort |
| Standardchat, GPT 5.6 Luna / OpenAI Codex | 87.7 s | `/api/chat/start` 15.984 s; `agent_ready` erst 55.7 s nach Senden, erster Text nach 87.7 s |
| Quickchat, GPT 5.6 Luna / OpenCode Go | 133.6 s | Nach erstem Stop blieb Working bei einem UI-Snapshot nach 76.6 s sichtbar; späterer Worker-Start und Abbruch wurden protokolliert; mehrere Stop-Klicks verhindern eine eindeutige Zuordnung zum ersten Klick |

Die Standardchat-Proben antworteten korrekt, aber wegen der langen Wartezeit belegen sie keine gute Responsiveness. MiMo/GPT-One-Token-Antworten belegen auch keine sichtbare inkrementelle Anzeige des ersten Zeichens. Eine Vorher-Nachher-Verbesserung ist mangels vergleichbarer Mehrfachmessungen nicht belegt.

## Engpässe und sinnvolle Maßnahmen

Die bisherigen Logs teilen den Weg in `/api/chat/start`, `spawn_sent`, `worker_ready`, `agent_ready`, `conversation_start`, `first_text` und `worker_finished`. Schon vor dem Modell lag der Chatstart in beiden Standardchatproben bei etwa 16–17 s. Danach vergingen bei Codex weitere rund 56 s bis zum ersten Text; bei MiMo rund 52 s. Im Quickchatfall lag `agent_ready` ungefähr 59 s nach Worker-Bereitschaft. Der beobachtete Engpass verteilt sich daher auf lokale Aufnahme/Registrierung und Worker-/Agentenstart sowie Providerzeit; die Messungen erlauben keine einzelne Ursache.

Für den nächsten Build sollte die Messung zusätzlich den Zeitpunkt des sofortigen Composer-Echos, Requestversand, HTTP-Antwort, Empfang des ersten SSE-Tokens und dessen ersten sichtbaren Renderer-Paint mit derselben Stream-ID erfassen. Keine Prompttexte, Schlüssel oder Tokens protokollieren. So wird unterscheidbar, ob die Pause vor dem API-Aufruf, in der lokalen Queue, beim Workerstart, beim Provider oder zwischen Tokenempfang und Darstellung entsteht.

Priorisierte Ansätze zur Prüfung:

1. **Senden sofort sichtbar machen:** User-Bubble synchron aus dem Draft rendern und parallel speichern/übermitteln. Bereits vorhandene optimistic echo-Änderungen gezielt auf dem Paket prüfen. API-Bestätigung und persistierte History getrennt messen.
2. **Chatstart verkürzen:** Die 15–17 s vor dem Start-ACK und die lange `agent_ready`-Phase einzeln profilieren. Profil-/Scopeprüfung und sichere Persistenz erhalten; nur redundante Katalog-/Workspace-Lesevorgänge oder blockierende Locks entfernen, wenn Traces deren Anteil belegen.
3. **Workerkosten reduzieren:** Python-/Agent-Initialisierung und Provider-SDK-Importe messen. Sichere Vorwärmung oder vorab geladene Laufzeit prüfen, bevor ein persistenter Worker erwogen wird. Worker-Wiederverwendung darf weder Profil-/Space-Isolation noch Cancel-/Writer-Lease-Garantien schwächen.
4. **Streaming sichtbar belegen:** Zeit vom ersten SSE-Token bis zum ersten Paint messen. Bereits erfolgte Source-Proben sind kein Ersatz für Paketmessungen. Mehrere kurze, sichtbare Text-Chunks statt nur einer Ein-Zeichen-Antwort prüfen.
5. **Stop unmittelbar bestätigen:** Stop-Status sofort in der UI anzeigen, Cancellation während Workerstart weiterreichen und innerhalb eines kurzen UI-Zyklus `Working` beenden. Backend-Interrupt, Terminalzustand und erhaltene Teilantwort getrennt korrelieren.

## Nachtestmatrix nach Freigabe des lokalen Artefakts

Auf genau diesem d14cf670-Kandidaten, frisches isoliertes Profil, keine parallele VM-Steuerung:

- GPT und MiMo jeweils Standardchat: Senden-zu-Bubble, Send-zu-Start-ACK, Send-zu-Worker-ready, Send-zu-erster-Token, Send-zu-erster-sichtbarer-Zeichen-Paint, Abschluss. Drei kurze Wiederholungen je Modell, Warm-/Kaltstart getrennt.
- GPT und MiMo jeweils Quickchat: dieselben sichtbaren Meilensteine und ein Stop unmittelbar nach sichtbarem Working. Stop-zu-UI-Rückmeldung und Stop-zu-Worker-Ende erfassen; Teilantwort und erneutes Öffnen prüfen.
- Usability bei enger und maximierter Fensterbreite: Composer, Modellwahl, Reasoning- und More-Steuerelemente dürfen nicht abgeschnitten oder verdeckt werden. Draft bei Wechsel und bestätigtem Start/Stop prüfen.
- Fehlerpersistenz und Neustart: eine kontrollierte fehlgeschlagene Anfrage erst nach dem Basislauf ausführen und prüfen, ob Status und Eingabe korrekt bleiben.
- Alle Läufe mit eindeutiger Stream-ID und bereinigten Screenshots protokollieren; GPT nur mit kleinem freigegebenem Modell. Keine Provideraufrufe, solange der Paketpin fehlt.

**Aktueller Abnahmestand:** 0.1.56 Chat-Usability, Paketintegrität und Runtime-Responsiveness **nicht verifiziert**. Erforderliche Nutzeraktion: Edge-Schutzabfrage am freigegebenen Kandidaten selbst bestätigen oder das Artefakt an einem lokal freigegebenen Testpfad bereitstellen. Danach Hashgate und VM-Lauf fortsetzen.

Quellen: [P004 v0.1.56 VM-Handoff in PR #72](https://github.com/Loggableim/lastbrowser/blob/ef2817dbaabf0140509e517250f2b9c992f33a1d/docs/test-reports/20261012-v0156-wallpaper-vm-handoff.md), [frühere v0.1.55 Messung](2026-10-12-v0155-04593080-signed-vm.md).

# Sidekick Chat: statische Analyse des In-Tree-Quellstands (A-014)

**Stand:** 11. Oktober 2026  
**Analysierter Quellstand:** v0.1.54 Source-Integration auf PR42-Head `353146c3cdb50977b7b8938e800122be24e2b019`  
**Geltungsbereich:** `services/sidekick/`, insbesondere `web/static/messages.js` und `web/api/streaming.py`  
**Methode:** statische Prüfung der im Repository vorhandenen Producer- und Consumerpfade. Kein Laufzeit-, Timing- oder Modelltest.

Diese Notiz beschreibt den aktuellen In-Tree-Backendpfad. Sie beansprucht keine Untersuchung eines externen Original-Repositories oder einer unveränderten Upstream-Version. Dateinamen und Eventvertrag beziehen sich auf den oben genannten Quellstand.

## Start, Stream-ID und Wiederverbindung

1. `messages.js` sendet den Chatstart über `POST /api/chat/start` und übernimmt die zurückgegebene `stream_id`.
2. `_openEventSource()` öffnet `api/chat/stream?stream_id=<id>`; ein optionaler Workspace-Scope wird als Queryparameter ergänzt.
3. Bei einem Verbindungsausfall fragt der Client `api/chat/stream/status?stream_id=<id>` ab. Ist der Stream aktiv, öffnet er denselben EventSource-Endpunkt erneut. Nach begrenzten Versuchen pollt er den Status und versucht, den abgeschlossenen Sitzungszustand wiederherzustellen.
4. In diesem Chatpfad enthält die EventSource-URL eine `stream_id`, aber keinen Resume-Offset. Die untersuchten Stellen dokumentieren keinen Replay-Cursor für Chat-Events. EventSource-Reconnect bedeutet hier daher nicht, dass ein bestimmter Teiltext garantiert erneut abgespielt wird.
5. Nicht aktive Streams werden über den gespeicherten Sitzungszustand abgeglichen. Das ist Wiederherstellung aus der Session, kein Beleg für vollständige Live-Event-Wiedergabe.

## SSE-Vertrag aus Producer und Consumer

`streaming.py` serialisiert benannte Events mit JSON-Payloads. `messages.js::_wireSSE()` registriert die sichtbaren Consumer. Der Vertrag verwendet unter anderem:

| Event | Producer-/Consumer-Verwendung |
| --- | --- |
| `token` | Producer sendet `{text}`; Consumer hängt Text an den Live-Assistentenabschnitt. |
| `reasoning` | Producer sendet `{text}`; Consumer aktualisiert den Thinking-Zustand, soweit dieser angezeigt wird. |
| `interim_assistant` | `{text, already_streamed}` für vorläufigen Assistententext und Segmentabgleich. |
| `tool` | `{event_type, name, preview, args}`; Consumer erstellt eine laufende Tool-Karte. |
| `tool_complete` | Abschlussdaten einschließlich Name, Preview/Args, Dauer und Fehlerkennzeichen; Consumer schließt die passende Tool-Karte. |
| `approval` | Ausstehende Freigabe wird angezeigt und kann eine Benachrichtigung auslösen. |
| `plan` | Plantext und Plan-ID werden angezeigt; die UI wartet auf Nutzerentscheidung. |
| `done` | Terminales Erfolgsergebnis; Client beendet Reconnects und rendert den gespeicherten Sitzungszustand. |
| `stream_end` | Terminaler Abschlussmarker mit Session-/Stream-Bezug; EventSource wird geschlossen. |
| `apperror` | Terminaler Anwendungsfehler, getrennt vom nativen EventSource-Netzwerkfehler. |
| `subagent_event`, `clarify`, `goal`, `goal_continue`, `progress`, `metering`, `compressing`, `compressed` | Zusätzliche Status- und UI-Ereignisse mit sessiongebundenen Payloads. |

Die Tabelle fasst die geprüften Stellen zusammen; sie ist keine vollständige JSON-Schema-Spezifikation für alle Eventvarianten. Unbekannte Felder, optionale Eigenschaften und Runtime-Reihenfolgen müssen bei Bedarf separat geprüft werden. Ein Client-Event namens `error` kann zusätzlich als Netzwerkereignis auftreten und ist nicht mit `apperror` gleichzusetzen.

## Weitere Architekturbeobachtungen

- Die WebUI trennt gestreamten Anzeigestatus und gespeicherten Sitzungsverlauf. Inflight-Zustand und Session-Abgleich dienen der Anzeige und Wiederherstellung.
- Reasoning-Text wird separat vom sichtbaren Antworttext geführt; die UI blendet seine Darstellung abhängig von der lokalen Anzeigeeinstellung ein oder aus.
- Tool-Starts und -Abschlüsse erzeugen Live-Karten; Approval und Plan-Events haben eigene UI-Pfade.
- Der Server hält Streamzustand über `stream_id` in Prozessstrukturen. Ein Neustartwiederherstellungsversprechen für laufende Streams ist aus diesen Eventpfaden allein nicht abzuleiten.

## Grenzen und Folgerungen

Es wurden keine Durchsatzmessung, keine Messung unter 15 ms, kein Stabilitäts- oder Lasttest und kein echter Providerlauf ausgeführt. Laufzeitqualität und Nutzungsakzeptanz sind **nicht verifiziert**.

Für eine React/TypeScript-Weiterentwicklung ist der Vertrag aus den aktuellen Producer-/Consumerpfaden abzuleiten (`token`, `reasoning`, `tool`, `tool_complete`, `approval`, `plan`, `done`, `stream_end`, `apperror` und weitere benutzte Events). Die früher vorgeschlagenen Namen `delta`, `reasoning_delta`, `tool_start`, `tool_result` und `complete` werden von den untersuchten Chat-Consumerstellen nicht als Vertrag verwendet. Einen Offset-Replay oder eine Laufzeitgarantie sollte die Migration nur einführen, wenn der Backendpfad dies explizit implementiert und separat geprüft wird.

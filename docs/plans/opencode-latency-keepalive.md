# OpenCode-Latenz: Ursachenbefund Keep-alive (Sidekick -> OpenCode)

Status: Befund abgeschlossen. Keine Messläufe durchgeführt (statische Codeprüfung).
Branch: `felix/gate-fix-latency`.

## Auftrag

Sidekick -> OpenCode ist warm nicht schneller als kalt. Zu klären war, ob pro
Turn ein neuer OpenCode-Prozess/Server, eine neue HTTP-Verbindung oder eine
neue Session erzeugt wird. Zusätzlich war die begonnene Transport-Änderung
(`apps/desktop/src/main/sidekick-transport.ts`, Änderungen an `sidekick-api.ts`)
gegen diese Ursache zu bewerten.

## Befund pro Turn

| Frage | Antwort | Beleg |
| :--- | :--- | :--- |
| Neuer OpenCode-Prozess/Server? | **Nein** – OpenCode ist ein entfernter Cloud-Dienst (`https://opencode.ai`), kein lokaler Prozess. Es wird aber **pro Turn ein neuer Sidekick-Worker-Python-Prozess** gestartet, der die OpenCode-Verbindung aufbaut. | `services/sidekick/runtime/independent/native_chat_host.py:172` |
| Neue HTTP-Verbindung? | **Ja** – jeder Turn läuft in diesem frisch gestarteten Prozess; der process-lokale Socket-Pool stirbt mit ihm. Nächster Turn = neuer TCP/TLS-Connect zu opencode.ai. | `services/sidekick/runtime/provider_client_pool.py:26,232` |
| Neue OpenCode-Session? | **Nein** – der `x-opencode-session`-Header ist deterministisch aus `SIDEKICK_HOME + session_id` (uuid5) und bleibt über die Turns einer Sitzung stabil. | `services/sidekick/cli/opencode_device.py:410` |

### Kette im Detail

1. Pro Chat-Turn wird ein isolierter Worker gestartet und am Turn-Ende beendet:
   `run_native_chat` (`services/sidekick/web/api/native_chats.py:634,708`) ->
   `relay_native_chat` (`services/sidekick/runtime/independent/native_chat_host.py:197`ff)
   -> `NativeChatHost.start` -> `subprocess.Popen` (`native_chat_host.py:172`).
   Route-Einstieg: `services/sidekick/web/api/routes.py:12293`.
2. Der gesamte Turn inklusive Provider-Anfrage läuft in diesem Prozess:
   `native_chat_worker.py:375` ruft `_run_agent_streaming` auf; Quickchat wird
   darin inline ausgeführt (`services/sidekick/web/api/streaming.py:2972-2993`,
   `run_quickchat_direct`).
3. Der Code-Client für OpenCode nutzt einen rein **prozess-lokalen** Pool
   (`services/sidekick/runtime/provider_client_pool.py:26` `_POOLS = {}`,
   `:22` `_IDLE_TTL`). Er wird beim Prozessende geschlossen
   (`close_provider_client_pools`, `provider_client_pool.py:219`, registriert
   via `atexit` `:232`). Beim nächsten Turn ist der Pool leer.
4. Der Turn sucht die Verbindung neu:
   `quickchat_direct.py:160-170` `create_pooled_sdk(...)` bzw. der
   Standard-Agent-Pfad. In einem frischen Prozess ist damit jeder Connect kalt.
5. Zusätzlich fällt pro Turn der Cold-Import/Worker-Start an (bereits belegt in
   `docs/test-reports/2026-10-11-chat-latency-mini-benchmark.md:21-23`).
6. Kein neues OpenCode-Login/Refresh pro Turn: `resolve_connection` ->
   `_current_credentials` liest die Datei und erneuert das Token nur nahe dem
   Ablauf (`opencode_device.py:300-327,353-355`).

### Bereits dokumentierte Ursache

`docs/plans/v0157-quickchat-latency.md:60-62` hält exakt das fest:

> Current native turns run in separate short-lived worker processes, so sockets
> cannot survive between Quickchat turns. Cross-turn reuse requires a separate
> authenticated transport broker; it is not claimed by this implementation.

Der vorliegende Befund bestätigt das an den Code-Stellen.

## Bewertung der begonnenen Transport-Änderung

`sidekick-transport.ts` + `resolveSidekickFetch` in `sidekick-api.ts` setzen
einen Keep-alive-`http.Agent` für Aufrufe des **Electron-Main-Prozesses an den
lokalen Sidekick-FastAPI-Server** (Loopback `127.0.0.1`). Das ist ein anderer
Hop als Sidekick -> OpenCode:

- Die Verbindung Sidekick -> OpenCode wird von der Python-Seite in einem
  **kurzlebigen Worker-Prozess** aufgebaut (`native_chat_host.py:172`), nicht
  vom Electron-Transport.
- Der Keep-alive-Pool des Desktop-Prozesses kann nicht in den Worker-Prozess
  hineinreichen; die Änderung hat auf Punkt 2/3 oben keinen Einfluss.
- Der adressierte Hop ist Loopback; ein Neu-Connect kostet dort Größenordnung
  Sub-Millisekunde und erklärt die Nutzer-latens nicht.

Die Änderung behebt damit **keine konkret belegte Ursache** der Sidekick ->
OpenCode-Latenz.

## Entscheidung

Die Transport-Änderung wird verworfen (Rücknahme von
`apps/desktop/src/main/sidekick-api.ts`, Entfernen von
`apps/desktop/src/main/sidekick-transport.ts` und
`apps/desktop/tests/sidekick-transport.test.ts`). Es wird ausschließlich
dieses Dokument committet.

Ein wirksamer Fix muss den Turn-Prozess überleben, z. B.:

- ein authentifizierter, langlebiger Transport-Broker außerhalb des
  Worker-Prozesses (in `docs/plans/v0157-quickchat-latency.md` bereits als
  Voraussetzung benannt), oder
- ein dauerhaft laufender Provider-Proxy, an den der Worker nur noch den
  Wire-Request übergibt.

Beides ist außerhalb des minimal-invasiven Auftrags und hier nur als
Konsequenz dokumentiert.

# Chat-Provider-Prüfung, 2026-10-03

Branch `codex/lastbrowser-electron-shell`, HEAD `eb268c5`. Bestehende gestagte und
ungestagte Änderungen erhalten. Keine Commits, Pushes, Releases oder Downloads.

## Bestätigte Fehler und Änderungen

- `runtime/transports.py`: `CodexResponsesTransport` und
  `AnthropicMessagesTransport` fehlte die im Agenten aufgerufene Methode
  `validate_response`. Beide prüfen jetzt ihren jeweiligen Antwortvertrag.
  Bedrock erhält im tatsächlichen Dispatch bereits eine normalisierte Antwort;
  dessen Vertrag bleibt erhalten.
- `runtime/codex_responses_adapter.py`: Reguläre Responses-Ablehnungen wurden
  beim Extrahieren des Antworttextes übergangen. Sie bleiben jetzt als sichtbare
  Antwort erhalten; Tool-Ausgaben und unvollständige Antworten bleiben getrennt.
- Der Codex-Transport sendete interne Reasoning-Konfiguration wie `enabled` an
  die API. Die Wire-Konfiguration enthält jetzt den unterstützten `effort`.
  `xhigh` und `max` bleiben unterschiedliche Werte.
- Pro Chat gab es keinen durchgehenden Weg für die Denktiefe. Native Chat und
  Copilot verwenden jetzt einen gemeinsamen Picker, Modell-Metadaten,
  Gesprächspräferenzen und einen optionalen Request-Override:
  `reasoningEffort` im Desktop-IPC → `reasoning_effort` in `/api/chat/start`.
  Wartende Nachrichten erfassen die gewählte Stufe. Unvereinbare Werte werden
  nicht an das neue Modell weitergereicht.
- `cli/codex_models.py`: Die Modellerkennung verwirft Reasoning-Metadaten nicht
  mehr. Ein erfolgreicher Katalog-Refresh ersetzt alte Werte einschließlich
  leerer Fähigkeiten. Ein unbekanntes Modell darf beim lokalen Fallback keine
  bereits geladenen Live-Fähigkeiten anderer Modelle löschen.
- Provider-Markierungen berücksichtigten tatsächliche Chat-Ergebnisse nicht.
  Das Backend übermittelt jetzt den wirklich verwendeten Provider und das
  Modell; Fehler, Teilantworten und Abbrüche gelten nicht als Erfolg. Ein
  Fallback-Erfolg wird seinem tatsächlichen Anbieter zugeordnet. Statische
  Modelllisten gelten nicht als erfolgreicher Katalog-Test.
- Die UI unterscheidet bekannte Adapter-/Backend-Prüfungen und die letzte
  erfolgreiche In-App-Antwort. Der Umfang der Belege steht am Status. Neue
  Texte sind in den sieben ausgelieferten Sprachen vorhanden.

## Ausgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` | 141 Dateien, 1236 Tests bestanden |
| `npm run verify:store` | 27/27, keine Fehler |
| `npm --workspace apps/desktop run build` | Main und Renderer bestanden |
| `python -m compileall -q services/sidekick` | Exit 0 |
| Python: Transport/Reasoning, Codex-Recovery, Session-Scope, Late-Subscribe, FastAPI-Bridge | 64 bestanden; zwei bestehende Websocket-Deprecation-Warnungen |
| Python: Transport/Reasoning, Provider-Antworten, Auxiliary-Streaming/Cache/Anthropic, OAuth-Status, Sampling, API-Key | 47 bestanden |

Die beiden Python-Läufe überschneiden sich; ihre Testzahlen werden nicht addiert.
Die vollständige Python-Suite wurde in diesem Arbeitsabschnitt nicht ausgeführt.
Vite meldet weiterhin die bestehende Warnung zum großen Renderer-Chunk.

Eine veraltete Desktop-Prüfung erwartete eine bestimmte einzeilige Schreibweise
des Discovery-Fehlerpfads. Sie prüft jetzt den entsprechenden Guard mit dem
erweiterten Block. Neue Rendering-Tests prüfen den eingebundenen Picker,
zulässige Stufen, den deaktivierten Zustand und Gesprächspräferenzen.

## Echter Codex-Aufruf

Mit dem Credential-Resolver des Lastbrowser-Testprofils wurde eine kleine
Anfrage an den ChatGPT-OAuth-Endpunkt gestellt. Keine API-Schlüssel oder
Zugangsdaten wurden ausgegeben. Es gab keinen öffentlichen API-Key-Fallback.

- Modell: `gpt-6-luna`, Reasoning: `low`.
- Produktionspfad: `AIAgent._run_codex_stream` → Antwortvalidierung → Normalisierung.
- Antwort: `OK`, zwei sichtbare Zeichen, ein Text-Delta, Status `completed`.
- Gemessene Dauer des erfolgreichen Diagnoselaufs: 7,486 Sekunden.
- Das rohe SDK-Endergebnis war in einem vorherigen Versuch trotz eines Deltas
  leer. Der bereits vorhandene Produktionspfad zur Wiederherstellung aus echten
  Stream-Events wurde deshalb im erfolgreichen Lauf ausdrücklich mitgeprüft.
- Lokaler, geheimnisfreier Ergebnisdatensatz:
  `.test-tmp/codex-live-proof-result.json`.

Dies belegt einen echten Backend-Stream mit diesem Modell. Es belegt keine
vollständige Desktop-Bedienung, weitere Modelle, alle Denkstufen oder einen neu
durchgeführten OAuth-Login. Die vom Nutzer geöffnete Desktop-Instanz wurde nicht
neu gestartet und hat weiterhin ihren zuvor geladenen Prozessstand. Die neuen
Build-Dateien stehen für den nächsten Start bereit.

## Grenzen der Denktiefe

Die Auswahl folgt den tatsächlich gemeldeten Modellfähigkeiten. Unbekannte
Fähigkeiten ergeben keine erfundene Liste. `ultra` aus dem Codex-CLI-Katalog
beschreibt dort eine Orchestrierungsfunktion und wird nicht als roher
Responses-API-Effort gesendet. Die [offizielle Reasoning-Dokumentation](https://developers.openai.com/api/docs/guides/reasoning)
beschreibt modellabhängige API-Werte; insbesondere sind `none` und `minimal`
für GPT-6.1 Sol nicht erlaubt.

## Katteb

Recherche und Plugin-/Tool-Vorschläge stehen in
[katteb-integration-proposal.md](katteb-integration-proposal.md). Kein Katteb-
Connector wurde implementiert oder live getestet; der Vorschlag enthält keine
erfundenen Chat-Modelle oder Streaming-Zusagen.

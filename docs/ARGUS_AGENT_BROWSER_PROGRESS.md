# Fortschritt Agentenzugang

Auftrag: P00–P16 aus `docs/ARGUS_AGENT_BROWSER_IMPLEMENTATION_PLAN.md` auf Draft-PR 104.
Branch: `cursor/vesper-agent-browser-v2-e679`.
Der Plan nannte `codex/vesper-agent-browser-v2`. Dieser Name ist in dieser Umgebung nicht der freie Arbeitsname; der Branch oben ist der isolierte Arbeitsstand und überschreibt keinen fremden Branch.

## P00 Quellbasis

Status: geprüft, mit offener Releaseintegration.

- PR-104-Head beim Start: `9444f48aa4892bc04ed39e4559bf9e8ea74dddf4`.
- Diagnose-Codecommit `fad627730504a51876227011003e54fa54bea8c7` ist Vorfahre dieses Heads.
- Vorhanden: `apps/desktop/src/renderer/browser-diagnostics.ts`, `apps/desktop/tests/browser-diagnostics.test.ts`, der Plan und `docs/ARGUS_DIAGNOSTICS.md`.
- Releasebasis `260557ce1b84804350bcd3f46ea47ff3dde9a00c` ist am erreichbaren Origin nicht vorhanden. Implementierung läuft auf dem PR-Head weiter. Releaseintegration bleibt offen für Nord/Anker.
- In dieser Umgebung ausgeführt: die drei gezielten Vitest-Dateien unten und `pytest tests/test_browser_agent_contracts.py` (4 bestanden) plus `compileall` der neuen Python-Datei. Der volle Desktoplauf 2247/50 aus dem PR-Text wurde hier nicht wiederholt und wird nicht als aktuelles Ergebnis übernommen.

## P01 Diagnose-Sessions

Status: geprüft für die hier gebauten Grenzen.

- Neue Ereignisse tragen Session-ID, Fenster-ID und eine monoton steigende lokale Zeit neben der UTC-Zeit. IDs sind Zufallswerte ohne Profil, URL oder Credential.
- `chat.started`, `chat.failed` und `chat.finished` werden als Alias auf die bestehenden Namen `chat-chat-started`, `chat-chat-failed` und `chat-chat-finished` geschrieben. Alte Exporte ohne Sessionfelder bleiben lesbar.
- Quickchat-Turns lassen sich über `turnId` und die Phasen `send`, `preflight`, `accepted`, `first-delta`, `completed`, `cancelled`, `error` verfolgen. Stream-IDs bleiben aus dem Export.
- Ein angeschlossener Sink ersetzt den gemeinsamen localStorage-Ereigniswriter. Der Main-Sink nimmt nur Batches von erlaubten Shell-WebContents an, erkennt Sequenzlücken und hält v2-Abfragen asynchron. Die synchronen v1-Helfer `read`, `query` und `summary` bleiben Arrays.
- Grenzen: 500 Ereignisse pro Renderer, 2 MiB im Main-Sink, Sessionlebensdauer 30 Minuten. Danach stoppt die Aktivierung und startet nicht von selbst neu.
- Noch nicht im Electron-IPC verdrahtet. Der Sink ist aufrufbar und getestet; `main.ts` hängt ihn noch nicht an einen Preload-Kanal.

## P02 Verträge

Status: geprüft für Validierung und Digest, nicht als angebotenes Tool.

- `apps/desktop/src/main/browser-agent-contracts.ts`
- `services/sidekick/runtime/independent/browser_agent_contracts.py`
- Gemeinsame Vektoren: `apps/desktop/tests/fixtures/agent-browser-digest-vectors.json`. Desktop-Digest und Python-`digest_json` stimmen für Observe, Click, Fill und Unicode überein.
- Unbekannte Felder, Schema 1, boolesche Flags als Zahl und `evaluate` werden abgelehnt. Fill-Text bleibt im Digest und fehlt im Diagnose-Trace.
- Capability meldet Schema 2 und eine leere Operationsliste. Geschlossener Shadow ist `closed_shadow_unsupported`. Die Featurevariable `LASTBROWSER_AGENT_BROWSER_V2` schaltet nur das Flag, keine Operation.

## P03 Snapshotregistrierung

Status: geprüft als Main-Modul, nicht in der Lease-Queue.

- `apps/desktop/src/main/browser-agent-snapshots.ts` hält pro Lease nur den neuesten Snapshot, 30 Sekunden TTL, höchstens 300 Elemente und 256 KiB Textmetadaten.
- Referenzen kommen aus Main-Zufall. Ein neuer Snapshot, eine fremde Lease, ein abgelaufener Snapshot und ein anderer Fingerprint liefern `stale_snapshot` oder `element_replaced`. Zwei Buttons mit gleichem Namen behalten getrennte Referenzen.
- Listener auf Targetverlust und die bestehende Lease-Queue sind noch nicht angeschlossen.

## P04 Projektion und Klickvorprüfung

Status: in Arbeit. Die reine Projektion ist geprüft, die CDP-Aufnahme nicht.

- `apps/desktop/src/main/browser-agent-observe.ts` bildet interaktive Rollen ab, verwirft Passwortwerte, markiert unbeschriftete Ziele und lehnt verdeckte, deaktivierte, nur lesbare und unsichtbare Ziele vor einem Zeigerdispatch ab.
- Es gibt keinen Live-CDP-Capture und keinen Gateway-Action-Kind. `agent_browser_observe` wird deshalb nicht angeboten.

## P05–P16

Status: offen.

Frame-/Shadow-Zugehörigkeit, snapshotgebundene Dispatchs, Ergebnisbelege, Screenshots, Diffs, Raster, weitere Bedienaktionen, Shellaktionen, Netzwerkdiagnose, Replay, MCP-Adapter, Performance und die Gesamtabnahme sind nicht implementiert. Keine Attrappe ist registriert.

## Tests in dieser Umgebung

```text
npx vitest run tests/browser-diagnostics.test.ts tests/browser-agent-contracts.test.ts tests/browser-agent-snapshots.test.ts
```

14 bestanden.

```text
python -m pytest tests/test_browser_agent_contracts.py
python -m compileall -q runtime/independent/browser_agent_contracts.py
```

4 bestanden, Syntaxcheck Exit 0.

Nicht ausgeführt: vollständiger `npm --workspace apps/desktop run test:run`, Desktopbuild, `npm run verify:store` und die übrigen Sidekick-Pytest-Dateien. Windows-Store und VM-Abnahme bleiben bei Nord/Argus.

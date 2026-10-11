# A-020 Lizenzinventur: Reproduzierbarer Metadaten-Snapshot

**Datum:** 2026-10-11<br>
**Status:** Teilinventur, keine rechtliche Freigabe<br>
**Source-Basis:** PR42 Source-Integration plus PR31 v0.1.53-Metadaten

## Erzeugung

- Befehl: `python scripts/generate-third-party-license-inventory.py --repo-root . --python-runtime C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe --output docs/legal/drafts/third-party-inventory-20261011.json`
- Ergebnis: Exit 0; 488 npm-Drittanbieter-Lockeinträge, 2 lokale Workspace-Einträge; 51 gepinnte Desktop-Python-Runtime-Pakete; alle 51 Runtimeversionen passen zur Pinliste.
- npm-Lockfile-Lizenzmetadaten: keine fehlenden Felder für die 488 Drittanbieter-Einträge; kein paketweiser Lizenztext- oder Notice-Abgleich.
- Python-Lizenzmetadaten: 5 der 51 gepinnten Runtime-Pakete haben im gebundenen Interpreter keine Lizenzmetadaten.
- `mcp==1.26.0`: nicht in Lockfile, Sidekick-`pyproject.toml`, Runtime-Pinliste oder dem gebundenen Interpreter gefunden. Herkunft, Auslieferungsstatus und Lizenz bleiben unbekannt.
- Sidekick/Hermes-Rechtekette und `jo.wav`-Herkunft/Lizenz bleiben unbekannt.

Das Generator-Skript und die JSON-Datei halten die Eingabe-Hashes, Paketversionen, Quellenfelder und offenen Punkte fest. Runtime-Metadaten sind ein Snapshot; das ausführbare Runtime-Artefakt selbst wird nicht in diesem Worktree eingecheckt.

## Korrektur der früheren Aussagen

Der vorherige Bericht behauptete eine vollständige Lizenzkompatibilitätsfreigabe, alleinige Rechte aufgrund des Git-Logs und eine permissive Lizenz für `jo.wav`. Diese Aussagen sind nicht belegt und wurden im Auditbericht zurückgenommen. Die vollständige GPLv3-Entwurfsdatei wurde gegen den offiziellen GNU-Lizenztext verglichen; im CTO-Review genannter Tippfehler `protectending` wurde berichtigt.

## Prüfungen

Dies ist ein Metadateninventar, kein Test- oder Rechtsgutachten. Keine Tests sind durch diesen Bericht behauptet. Siehe `docs/legal/license-audit.md` für Grenzen und offene Rechtefragen.

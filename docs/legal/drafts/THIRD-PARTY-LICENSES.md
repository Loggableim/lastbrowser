# Drittanbieter-Inventur – Arbeitsentwurf

Diese Übersicht verweist auf den vollständigen versionsgebundenen Metadaten-Snapshot in [`third-party-inventory-20261011.json`](third-party-inventory-20261011.json). Er wurde mit `scripts/generate-third-party-license-inventory.py` aus `package-lock.json`, `apps/desktop/scripts/requirements-runtime.txt` und dem im Snapshot gehashten Python-Interpreter erzeugt.

Der Snapshot umfasst 488 npm-Drittanbieter-Lockeinträge und 51 gepinnte Desktop-Python-Runtime-Pakete. Die npm-Lizenzfelder stammen aus Lockfile-Metadaten; sie sind noch keine Prüfung der Lizenztexte. Fünf Python-Pakete haben keine Lizenzmetadaten. `mcp==1.26.0` wurde vom Review genannt, ist jedoch nicht in den aktuellen Lock-/Runtime-Quellen und wurde als ungeklärter Fall eingetragen. Projekt-Code und lokale Workspace-Aliase sind keine Drittanbieterpakete.

Für jede Abhängigkeit bleiben Herkunft und Lizenztext zu verifizieren. Das Dokument behauptet keine GPL-Kompatibilität und keine Berechtigung zur kommerziellen Zweitlizenzierung. Siehe [`license-audit.md`](../license-audit.md).

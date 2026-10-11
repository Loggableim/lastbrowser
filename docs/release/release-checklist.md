# Release- und Kandidatencheckliste

Diese Checkliste ist eine Arbeitsanleitung. Versionen und Prüfzahlen werden stets am konkreten Quellcommit erhoben; frühere Werte sind keine aktuellen Gates.

## 1. Quellstand und Versionsidentität

- Prüfe Branch, Basis, sauberen Arbeitsbaum und exakte Quell-Commit-ID. Ein Versionsbump allein beweist keine Übereinstimmung von Quellcode und Release.
- Synchronisiere Root-`package.json`, `apps/desktop/package.json` und Root-/Workspace-Einträge in `package-lock.json` in einem Commit.
- Prüfe, dass `app.getVersion()` aus der Desktop-Paketversion stammt und die Versions-Guard im Release-Workflow denselben Wert erwartet.
- Ergänze den passenden `CHANGELOG.md`-Eintrag nur aus belegten Änderungen dieses Quellstands. Historische Testkandidaten nicht als veröffentlichte Releases beschriften.
- README-Testzahlen nur nach einem erfolgreichen vollständigen Testlauf aktualisieren.
- Dokumentiere Basis, Commit, Version, Änderungen und Quellen jeder Release-Aussage im Testbericht.

## 2. Quell- und Buildprüfungen

Am finalen Quellstand die Repository-Gates aus `AGENTS.md` ausführen und Befehl, Exitcode, gekürzte Ausgabe und Warnungen festhalten:

```powershell
npm test
npm run verify:store
npm --workspace apps/desktop run build
python -m compileall -q services/sidekick
```

Die tatsächlichen Testzahlen und Store-Warnungen hängen vom aktuellen Stand ab. Ein grüner Source-Lauf ersetzt weder die exakte Paketprüfung noch Installation, VM- oder Live-Provider-Nachweise.

## 3. Paket- und Signierprüfung

- Paket nur vom festgehaltenen finalen Quellcommit bauen.
- Vor dem Signieren App-Version, Paketquellen, Paketroute und erwartete Signaturprüfungen festhalten.
- Für jede finale EXE Dateipfad, Version, Byte-Größe und SHA-256 protokollieren.
- Authenticode, Zeitstempel und EVS/VMP separat auf den exakten Dateien verifizieren. Keine Datei nach der finalen Signaturprüfung verändern.
- Installer-Update über ein bestehendes Benutzerprofil prüfen, ohne Profile, Provider, Auth-Dateien oder Einstellungen zurückzusetzen.
- Laufende Version und Startzustand anhand des installierten Artefakts nachweisen. Reale Providerantworten bleiben eine eigene Live-Prüfung.

## 4. Veröffentlichung

GitHub-Release, Tag, Store-Einreichung, Website-Deploy und öffentliche Downloads erfolgen erst nach ausdrücklicher Freigabe des Rechteinhabers. Historische Asset-Hashes oder frühere Signaturberichte gelten nicht für ein neues Artefakt.

Die geprüfte Versionenhistorie für die v0.1.54-Vorbereitung steht in [`version-history-audit-20261011.md`](version-history-audit-20261011.md). Lizenz-/Rechteentwürfe sind nicht Teil einer Releasefreigabe; dazu siehe [`../legal/license-audit.md`](../legal/license-audit.md).

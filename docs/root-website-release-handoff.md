# Website-Handoff: Release Candidate 0.1.45

Stand: 2026-10-05. Website-Candidate-Texte aktualisiert; keine Veröffentlichung, kein Git-Index/Commit/Push und keine Produktversionsdatei geändert.

## Versionsstatus und Websiteaussagen

- GitHub `v0.1.44` wurde am 3. Oktober 2026 von Root als bereits veröffentlicht bestätigt. Root meldet dafür den älteren Quellcommit `86d7090b` und vier Assets. Das Website-Archiv nennt die historische Veröffentlichung und verlinkt ihre Release-Seite, ohne Assetnamen, Signaturdetails oder Hashes zu behaupten.
- `v0.1.45` ist der nächste Kandidat in Vorbereitung. Er ist noch nicht als Build oder Download dargestellt.
- Die Downloadseiten weisen auf die korrekte historische Lage hin, führen aber weiterhin ihre bestehenden v0.1.43 Setup-/Portable-Links und Hashes. Sie sagen ausdrücklich, dass diese Links `.43` liefern; es wurden keine neuen `.44`/`.45` Downloadziele oder Hashes erfunden.
- Die Feature- und Changelogseiten führen die Quelländerungen als `.45`-Kandidaten. AUTO bevorzugt einen zulässigen verfügbaren konfigurierten Orchestrator; sonst nutzt es frischen beobachteten Limit-Spielraum nur, wenn er für alle Kandidaten vorliegt, danach aktive/kürzliche lokale Anfragen und als Gleichstandsregel die konfigurierte Reihenfolge. Das ist keine semantische Qualitäts- oder Kostenoptimierung. Der lokale 350M-Router bestand den unabhängigen Holdout nicht.
- Release Notes beschreiben den kontrollierten Drei-Schritt-Teamwork-Loopback als bestanden, ohne daraus Qualität bezahlter Modelle oder externer Anbieter abzuleiten. Die lokale PC-Prüfung und Setupführung sind im Quellstand; produktive lokale Inferenz, Runtime-/Lizenz-/Redistributionsnachweise und Paketabnahme bleiben offen. Der RAM-Guard ist nicht für unterstützte Hardware qualifiziert.

Die Website-Texte sind keine Paketabnahme und kein Nachweis für externe Providerqualität oder lokale Inferenz im veröffentlichten Build.

## Metadatenseams nach Root-Artefaktprüfung

Wenn Root den finalen `.45`-Release aus genau einem Source-Freeze erstellt und Signaturen, Größen sowie SHA-256 für Setup und Portable geprüft hat, müssen die statischen Websiteangaben zusammen aktualisiert werden:

1. `lastbrowser.com/download/index.html` und `lastbrowser.com/{en,es,fr,it,pt,ja}/download/index.html`: JSON-LD `softwareVersion`/`downloadUrl`, Titel, Buttons/Dateinamen, Verifikationsbefehle, Hashdarstellung und Floating Download CTA. Nur Root-geprüfte `.45`-Artefakte eintragen; bestehende `.43`-Links erst dann ersetzen.
2. `lastbrowser.com/releases/index.html`: `.45` mit Root-verifizierten Dateinamen, Größen, Signaturstatus und Hashes ergänzen; `.44` und `.43` als frühere Versionen belassen. Für `.44` sind hier bislang keine Assetnamen oder Hashes dokumentiert.
3. `lastbrowser.com/changelog/index.html` und `en/es/fr/it/pt/ja/changelog/index.html`: `.45`-Kandidat erst nach Veröffentlichung auf „veröffentlicht“ ändern und echtes Datum sowie Release-URL nennen. Der RSS-Feed enthält noch `.43`, weil für `.44` bislang nur der Kalendertag, aber kein verifizierter Veröffentlichungszeitpunkt vorliegt; `.44` dort erst mit Root-bestätigtem RFC-822-Datum nachtragen. `.45` ebenfalls erst nach Veröffentlichung ergänzen.
4. Versionshinweise in den Sprach-Homepages, Getting-Started- und Press-Seiten nur angleichen, wenn sie den letzten veröffentlichten Stand behaupten. Root/Desktop-Paketversionen gehören nicht zu diesem Website-Handoff.

## Produktionsdeploy

Der dokumentierte Cloudflare-Pages-Befehl lautet, aus dem Websiteverzeichnis ausgeführt:

```powershell
Push-Location lastbrowser.com
try {
    wrangler pages deploy . --project-name lastbrowser-website --branch main
    if ($LASTEXITCODE -ne 0) { throw "Cloudflare Pages deploy failed: $LASTEXITCODE" }
} finally { Pop-Location }
```

Das Arbeitsverzeichnis muss `lastbrowser.com/` sein, damit die benachbarte `functions/`-Directory durch Wrangler kompiliert wird. In der Ausgabe müssen `Compiled Worker successfully` und `Uploading Functions bundle` erscheinen. Danach die lokalisierte Website, Download-Proxydateien und `/downloads/latest.yml` prüfen. Kein Deploy wurde von diesem Agent ausgeführt.

Fokussierter bestehender Funktionstest:

```powershell
node --test lastbrowser.com/tests/download-counter.test.mjs
```

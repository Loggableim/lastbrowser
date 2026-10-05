# Website-Handoff: Release 0.1.45

Stand: 2026-10-05. Website und Download-Proxy auf den veröffentlichten Release v0.1.45 aktualisiert. Keine Veröffentlichung oder Bereitstellung durch diesen Agent; Git-Index, Commit und Push unangetastet.

## Veröffentlichte Release-Metadaten

GitHub-Release [v0.1.45](https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.45) ist am 5. Oktober 2026 um 08:57:03 UTC erschienen. Root bestätigte, dass die öffentlichen Assets mit den lokalen Hashes übereinstimmen und `latest.yml` byteidentisch zum signierten Original ist.

| Datei | Bytes | SHA-256 |
| --- | ---: | --- |
| `Lastbrowser-0.1.45-x64-setup.exe` | 175,963,336 | `ccf1435947a415fe5a97bb5d908edb79a519106877128c3e4d5f1b210236bc96` |
| `Lastbrowser-0.1.45-x64-portable.exe` | 175,601,280 | `8078cf5481cf9fa371fdb6da79d39b85741fe97fc15ed30d4fe30b7d37b6a577` |

Die Downloadseiten in DE/EN/ES/FR/IT/PT/JA, Featureseiten, Changelogs, Release-Archiv, RSS und Cloudflare-Download-Proxy verweisen jetzt auf `.45`. Das Archiv führt `.44` und ältere Releases weiterhin historisch auf. Die `.45`-Seiten nennen Signatur und Hashes, bewerben aber weder lokale Modellqualität noch eine Clean-Windows-Abnahme als bestanden.

## Verifizierte Grenzen

- Root meldet Authenticode `Valid` mit Zeitstempel, VMP-Verifikation und 152/152 bestandene native Signaturprüfungen.
- Signierte Direct-App-Probe: PASS. Signierte Portable-Probe: PASS mit echtem `app://`-Renderer, Sidekick `ready`, WebUI `ready`, Exitcode 0 und bereinigtem eigenem Profil. Der erste kontrollierte Portable-Start bis zum Renderer dauerte 113.6 Sekunden; die Website nennt gerundet etwa 114 Sekunden und weist auf mögliche Unterschiede je PC hin. Das ist kein Clean-Windows-Test.
- Der lokale 350M-Router bestand seinen unabhängigen Holdout nicht. Der RAM-Guard ist nicht für unterstützte Hardware qualifiziert. Lokale Inferenz bleibt offen.
- Der Drei-Schritt-Teamwork-Loopbacktest lief im kontrollierten lokalen Pfad; das belegt keine Qualität bezahlter Modelle oder externer Provider. Keine Gemini-/Paid-Model-Qualitätsbehauptung ergänzt.

Portable-Probenbericht: `output/portable-exe-3d4dc81b-473d-4279-9b69-044c1d07009e.json`.

## Website-Metadaten und Probe

- `lastbrowser.com/download/index.html` und die sechs lokalisierten Downloads enthalten Dateinamen, Dateigrößen, SHA-256, passende Downloadlinks und den beobachteten Portable-Erststart.
- `lastbrowser.com/releases/index.html` listet beide `.45`-Assets samt Bytes und SHA-256; `.44` bleibt als ältere veröffentlichte Version geführt.
- `lastbrowser.com/changelog/feed.xml` führt `.45` mit dem bestätigten Zeitpunkt `Mon, 05 Oct 2026 08:57:03 GMT`.
- `lastbrowser.com/functions/downloads/[file].js` leitet Setup, Portable und `latest.yml` auf den veröffentlichten Tag `v0.1.45`.
- `apps/desktop/tests/public-downloads.test.ts`: gezielter Lauf `npm --workspace apps/desktop run test:run -- tests/public-downloads.test.ts` — 5/5 PASS.
- `git diff --check` — PASS.

## Produktionsdeploy

Das dokumentierte Cloudflare-Pages-Kommando wird aus `lastbrowser.com/` ausgeführt, damit die benachbarte Functions-Directory kompiliert wird:

```powershell
Push-Location lastbrowser.com
try {
    wrangler pages deploy . --project-name lastbrowser-website --branch main
    if ($LASTEXITCODE -ne 0) { throw "Cloudflare Pages deploy failed: $LASTEXITCODE" }
} finally { Pop-Location }
```

In der Ausgabe `Compiled Worker successfully` und `Uploading Functions bundle` prüfen. Anschließend alle lokalisierten Downloadlinks, `/downloads/latest.yml` und Function-Proxyantworten auf die veröffentlichten `.45`-Assets gegenprüfen. Root übernimmt Pflichtsuite, Commit und Deploy.

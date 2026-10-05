# Website-Handoff: Release Candidate 0.1.44 Vorbereitung

Stand: 2026-10-05. Websiteänderungen vorbereitet; keine Veröffentlichung, kein Git-Index/Commit/Push und keine Produktversionsdatei geändert.

## Was die Website jetzt aussagt

- v0.1.43 bleibt die letzte veröffentlichte Version. Alle Downloadziele, Dateinamen und bereits geprüften Hashes beziehen sich weiterhin ausschließlich auf diese Version.
- v0.1.44 ist als Release Candidate in Vorbereitung gekennzeichnet, aber ausdrücklich weder gebaut noch downloadbar. Es gibt keine erfundenen Downloadlinks, Signaturbehauptungen oder Hashes.
- Die Featureseiten in DE/EN/ES/FR/IT/PT/JA beschreiben den Kandidatenquellstand und begrenzen die Aussagen: kompakter Composer mit AUTO/„Weitere“ und Advanced-only Detailpolicy; Space Assistant plus separater transienter Schnellchat; persistente Ziele im kontrollierten Loopbackpfad; einfacher PC-/Setup-Ablauf, aber keine produktiv qualifizierte lokale Inferenz. AUTO bevorzugt einen verfügbaren konfigurierten Orchestrator; sonst nutzt es frischen beobachteten Limit-Spielraum nur, wenn er für alle Kandidaten vorliegt, danach aktive/kürzliche lokale Anfragen und schließlich die konfigurierte Reihenfolge. Es behauptet keine semantische Qualitäts- oder Kostenoptimierung. Der lokale 350M-Router bestand den unabhängigen Holdout nicht. Teamwork bleibt ein eigener expliziter Pfad.
- Die sieben Downloadseiten sagen klar, dass sie noch v0.1.43-Dateien liefern. Candidate-Downloads erscheinen erst nach Root-geprüften signierten Setup-/Portable-Artefakten. Changelog-Einträge stellen den Kandidaten nicht als veröffentlicht dar.

Diese Texte sind keine Paketabnahme. Insbesondere sind die kontrollierten Renderer-/Loopbackproben kein Nachweis für die finale gepackte App, externe Providerqualität, produktive lokale Inferenz, Lizenzfreigabe oder Websiteveröffentlichung.

## Metadatenseams nach Root-Artefaktprüfung

Wenn Root den finalen Release aus genau einem Source-Freeze erstellt und Signaturen, Größen und SHA-256 der Setup- und Portabledateien geprüft hat, müssen die folgenden statischen Angaben zusammen aktualisiert werden:

1. `lastbrowser.com/download/index.html` und die Lokalisationen `en/es/fr/it/pt/ja/download/index.html`: JSON-LD `softwareVersion`/`downloadUrl`, Hero-/Meta-Titel, Buttons/Dateinamen, Verifikationsbefehle, Hashdarstellung und Floating Download CTA. Der derzeitige öffentliche v0.1.43-Eintrag bleibt historische Wahrheit, bis beide neuen Root-Artefakte vorliegen.
2. `lastbrowser.com/releases/index.html`: aktuellen v0.1.44-Eintrag samt Root-verifizierten Setup-/Portable-Dateinamen, Größen und Hashes ergänzen; v0.1.43 danach als früher markieren. Keine aus Preview- oder lokalen unsignierten Distdateien abgeleiteten Angaben übernehmen.
3. `lastbrowser.com/changelog/index.html` und `en/es/fr/it/pt/ja/changelog/index.html`, danach `lastbrowser.com/changelog/feed.xml`: „in Vorbereitung/nicht verfügbar“ durch die bestätigten Release Notes, tatsächliches Veröffentlichungsdatum und echte Release-URL ersetzen. Der Feed erhält den Eintrag erst bei Veröffentlichung.
4. Versionshinweise in `lastbrowser.com/index.html` und `en/es/fr/it/pt/ja/index.html` sowie Getting-Started/Press-Seiten nur dann angleichen, wenn sie den letzten veröffentlichten Versionsstand oder verfügbare Artefakte behaupten. Website-Aufgabe ändert Root-/Desktop-Paketversionen nicht.

## Deploypfad und Prüfung

`lastbrowser.com/tests/README.md` legt für den bestehenden Cloudflare Pages Function-Downloadcounter als Deploymentwurzel `lastbrowser.com/` mit dem direkt danebenliegenden `functions/`-Verzeichnis fest. Statisches Hosting ohne Function liefert für den Counter korrekt „nicht verfügbar“. Im aktuellen Checkout liegt kein Site-spezifischer Wrangler-/Deployworkflow, der Produktionsprojekt, Branch oder konkreten Deploybefehl beweist; daher ist hier kein weiterer Produktionspfad behauptet. Root muss für Veröffentlichung die konfigurierte Cloudflare Pages Deployment-Integration verwenden und die Function-Präsenz in der Vorschau prüfen.

Fokussierte lokale Gegenprobe:

```powershell
node --test lastbrowser.com/tests/download-counter.test.mjs
```

HTML-Abgleich vor Artefaktaktualisierung: Kandidatennotizen ohne Download-URL/Hash, v0.1.43-Links noch intakt, sieben Lokalisierungen mit korrektem Counter-Locale, beide Release-Seiten-Status und RSS ohne vorgetäuschte v0.1.44-Veröffentlichung.

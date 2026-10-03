# Katteb in Lastbrowser: Integrationsvorschlag

Stand: 2026-10-03. Recherche und Entwurf; kein Connector implementiert und kein
Katteb-Konto oder kostenpflichtiger Auftrag live geprüft.

## Belegte API-Eigenschaften

Die [offizielle API-Dokumentation](https://app.katteb.com/api/v2/docs) beschreibt
Bearer-Authentifizierung unter `https://app.katteb.com/api/v2/` mit
`?endpoint=…`. Artikel werden als Jobs angelegt; Statusabfragen liefern den
fertigen HTML-Text. Parameter umfassen Thema, Sprache, Land, Länge, Marke und
Schreibstil. Credits werden beim Anlegen verbucht. Stornierung ist für noch
wartende/geplante Artikel vorgesehen. Account-, Credit-, Brand- und Style-Abfragen
sowie SEO-, Factcheck- und Humanizer-Endpunkte sind dokumentiert. Für schwere
Aufträge gelten Parallelitätsgrenzen; HTTP 429 kann `Retry-After` enthalten.
Ein allgemeiner Chat-Completion-Endpunkt, Token-Streaming und ein Idempotenzschlüssel
sind dort nicht dokumentiert.

Die [FAQ](https://katteb.com/faq) nennt REST-Zugriff, aber keinen eigenen MCP-Server.
Bei Factcheck/Humanizer widerspricht ihr älterer Planungshinweis den vorhandenen
API-Endpunkten. Deshalb müssen Umfang und Berechtigungen am tatsächlichen Konto
geprüft werden. Factcheck-Ausgaben sind Prüfhilfen, keine unabhängige Wahrheitsgarantie.

## Empfehlung für das bestehende Produkt

Die folgenden Punkte sind unser Architekturvorschlag, keine Zusagen des Anbieters.

Katteb erhält im vorhandenen **Plugins/Tools**-Bereich eine Karte
**Katteb · Content** mit Schlüssel, Verbindungsstatus, Guthaben, Marken und
Schreibstilen. Der Nutzer startet den Content-Auftrag aus dem Sidekick-Chat oder
über eine Werkzeugaktion am Browserinhalt. Das Plugin stellt konkrete Aktionen
mit Auftragsstatus bereit. Die vorhandene Chat-Modellauswahl bleibt für die
angeschlossenen Gesprächsmodelle zuständig.

### Weitere vorgeschlagene Workflows

| Workflow | Bedienung in Lastbrowser | Umsetzungsidee |
| --- | --- | --- |
| Recherche → Artikel | Quellen und Notizen im Space sammeln, dann „Artikel vorbereiten“ | Das verbundene Chatmodell erstellt ein kompaktes Briefing; Nutzer prüft es vor dem Katteb-Auftrag |
| Markierten Text bearbeiten | Kontextmenü „Mit Katteb bearbeiten“ | Eine ausgewählte Passage erweitern, vereinfachen oder umformulieren; Umfang zuerst auf tatsächlichen Endpunktvertrag prüfen |
| Aussagen überprüfen | „Aussagen prüfen“ am Entwurf | Chatmodell extrahiert einzelne Claims; Katteb-Prüfergebnisse erscheinen mit Quellen und Prüfdaten neben dem Text |
| Seite auf SEO prüfen | Werkzeugaktion für die aktive URL | Bericht abrufen und daraus eine bearbeitbare Verbesserungs-Checkliste erstellen |
| Content-Serie | Themenliste und gemeinsamen Markenstil im Space speichern | Aufträge in einer Konto-Queue nacheinander abarbeiten; einzelne Artikel erhalten eigene Dokumente und Jobstatus |
| Redaktion mit Vergleich | Original und Überarbeitung nebeneinander | Abschnitte einzeln übernehmen; Quellen und Metadaten erhalten; lokal exportieren |
| Wiederverwendbare Briefings | Vorlagen für Blog, Newsletter, Ratgeber oder Produkttext | Zielgruppe, Ton, Struktur und Anforderungen als lokale Vorlagen speichern; pro Auftrag konkret prüfen |
| Agenten-Zusammenarbeit | Auftrag im Sidekick-Chat: Recherche, Briefing, Katteb-Entwurf, Review | Der Agent verwendet Katteb als explizites Tool; Auftragsparameter, Kosten und Ergebnis bleiben sichtbar |

Priorisiert wären **Recherche → Artikel**, **Redaktion mit Vergleich** und
**Aussagen überprüfen**. Sie ergänzen sich zu einem nutzbaren Schreibprozess.
Website-Inhalte oder markierte Texte werden erst durch eine konkrete
Werkzeugaktion an den Dienst übermittelt. Eine spätere CMS-Publikation bekommt
einen eigenen, separat beauftragten Integrationsweg.

### Ablauf

1. **Briefing:** Thema, Zielgruppe, Zweck, Sprache, Land, Länge und Stil auswählen.
   Optional erstellt das bereits verbundene Chatmodell zuerst eine Gliederung.
2. **Prüfbare Auftragsvorschau:** Parameter und erwarteten Creditverbrauch zeigen;
   kostenpflichtige Extras einzeln wählen und anschließend den Auftrag starten.
3. **Job-Karte:** Den tatsächlichen API-Status anzeigen. Ein Ergebnis erst dann
   als vorhanden markieren, wenn es abgerufen wurde. Kein simuliertes
   Buchstaben-Streaming und keine erfundenen Prozentwerte.
4. **Entwurf:** Artikel als bearbeitbares lokales Dokument und Markdown-Export
   bereitstellen, mit Metadaten und getrennten Quellenangaben.
5. **Redaktion:** Auf Wunsch einzelne Aussagen prüfen, einen SEO-Bericht
   anfordern oder einen Abschnitt umschreiben. Änderungen als Vergleich zeigen;
   der Nutzer übernimmt sie in den Entwurf.

### Backend und Zustand

- In-tree-Service in `services/sidekick/`, über den vorhandenen Tool-Registry
  angebunden. Vorgeschlagene Tools: `katteb_generate_article`,
  `katteb_job_status`, `katteb_cancel`, später `katteb_factcheck` und
  `katteb_seo_analyze`. Keine zusätzlichen Repositorys oder Build-Downloads.
- Bestehende Credential-Verwaltung nutzen. Schlüssel verbleiben lokal, werden
  in Backend-Aufrufen verwendet und weder in Prompts noch in Protokollen gezeigt.
- Job-ID und Dokumentzuordnung lokal pro Space speichern. Eine gemeinsame Queue
  pro Katteb-Konto verhindert Konflikte zwischen mehreren Spaces.
- Polling mit Backoff und Serverhinweisen; nach Neustart bekannte Jobs wieder
  aufnehmen. Einen unsicheren POST nach Timeout nicht blind wiederholen:
  zuerst vorhandene Aufträge abgleichen, um Doppelabbuchungen zu vermeiden.
- **Stoppen** und **Stornieren** getrennt darstellen. Ein lokaler Abbruch der
  Statusabfrage darf keine angebliche Remote-Stornierung oder Erstattung melden.
- Anbieter-HTML vor der Anzeige sanitizen. Quellen, Links und Inhalt bleiben
  untrusted data; keine Skripte und keine automatisch ausgeführten Anweisungen.

## Sinnvolle Umsetzungsschritte

| Schritt | Umfang | Abnahme |
| --- | --- | --- |
| 1 | Schlüssel speichern, Account/Limits/Styles/Brands lesen; Artikelauftrag und Wiederaufnahme | Reale Kontoabfragen; ein bewusst gestarteter kleiner Auftrag; Ergebnis und Creditverbrauch belegt |
| 2 | Quellen-/Claim-Prüfung, SEO-Bericht, Abschnittsüberarbeitung | Jeder tatsächlich verfügbare Endpunkt separat getestet; Entwurf und Änderungsvergleich geprüft |
| 3 | Optional CMS-Export/Publikation | Erst nach separatem Nutzerauftrag und belegtem CMS-Vertrag |

## Tests vor Freigabe

- Vertrags-Tests für 401, 429, Timeout, ungültige Daten und unbekannte Jobstatus.
- Keine doppelten Aufträge nach Timeout oder App-Neustart; Konto-Queue über
  mehrere Spaces prüfen.
- Stornierung und lokalen Poll-Abbruch einschließlich beobachteter Remote-
  Nachbedingungen auseinanderhalten.
- HTML-Sanitizing, Textbearbeitung, Markdown-Export und Quellenanzeige prüfen.
- Den tatsächlichen Creditverbrauch und das Ende eines bewusst gestarteten Jobs
  dokumentieren. Vor diesem Live-Test bleibt die Verbindung als ungeprüft markiert.

**Priorität:** Zuerst den Artikelauftrag samt zuverlässiger Jobverwaltung.
Das liefert einen überschaubaren, direkt nutzbaren Content-Workflow und lässt
weitere Endpunkte anhand des realen Kontozugangs ergänzen.

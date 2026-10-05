# Umsetzungsziel: Space Assistant und unabhängige Agenten

Lastbrowser erhält einen dauerhaften Space Assistant hinter dem vorhandenen Sidekick-Icon rechts oben im Fenster und eine Einführung beim ersten Öffnen eines noch nicht eingerichteten Space. Der Assistant lernt den Zweck und die gewünschte Arbeitsweise des Space kennen, erklärt den tatsächlichen Arbeitsstand und beauftragt normale Chats sowie unabhängige Agenten. Autorisierte Aufgaben bleiben ihrem Space zugeordnet und arbeiten bei Spacewechseln weiter.

Dieses Dokument ist eine verbindliche Produkt- und Umsetzungsspezifikation. Es beschreibt das gewünschte Endverhalten, technische Verantwortlichkeiten und Abnahmekriterien. Es ist kein Nachweis, dass diese Funktionen bereits vorhanden oder geprüft sind. Die Abschnitte 7 bis 23 konkretisieren die grundlegenden Anforderungen der Abschnitte 1 bis 6. Die technische Nachprüfung in Abschnitt 21 präzisiert vorhandene Anknüpfungspunkte. Abschnitt 23 definiert die zentrale Benutzeroberfläche und die Delegation an normale Chats und Agenten.

## 1. Vorstellung und adaptives Interview

- Der Assistant stellt sich als Assistant dieses Space vor und erklärt seine tatsächlich verfügbaren Fähigkeiten verständlich.
- Jede Interviewfrage bietet drei bis vier passende Antwortoptionen sowie die Möglichkeit einer eigenen freien Antwort. Freitext ist gleichwertig zu den Optionen.
- Die bisherigen Antworten bestimmen die folgenden Fragen. Bereits beantwortete Fragen werden nicht erneut gestellt.
- Das Interview hat keine feste Fragenanzahl. Es läuft, bis der User auf „Weiter“ klickt, ausdrücklich sagt, dass es genügt, oder der Assistant ausreichend Informationen für ein brauchbares Space-Profil hat.
- Ausreichende Klarheit bedeutet, dass Zweck des Space, gewünschte Unterstützung und bevorzugte Arbeitsweise für einen sinnvollen Einstieg verständlich sind. Unnötige Detailfragen dürfen den Abschluss nicht verzögern.
- Erkennt der Assistant ausreichende Klarheit, zeigt er eine Zusammenfassung und bietet den nächsten Schritt an. Die Navigation bleibt beim User; der Assistant navigiert nicht automatisch weiter.
- „Weiter“ und „Direkt in den Space“ bleiben jederzeit erreichbar. Fehlende Angaben verhindern den Einstieg nicht.
- Zwischenstände werden gespeichert und können nach einer Unterbrechung wiederaufgenommen werden.
- Modellfehler oder fehlende Modellverbindungen erlauben weiterhin einen verständlichen manuellen Einstieg.

## 2. Profil bestätigen, Accounts verbinden und Plugins aktivieren

- Der User kann das ermittelte Space-Profil prüfen und bearbeiten.
- Passende Accounts und tatsächlich verfügbare Plugins werden anhand des Profils vorgeschlagen.
- Jede Verbindung erklärt ihren Zweck, den tatsächlichen Zugriffsumfang und ihren aktuellen Verbindungsstatus.
- Verbindungen und Plugins sind optional und später ergänzbar.
- Interviewantworten erteilen keine Handlungsvollmacht. Accountzugriffe, externe Aktionen und wiederkehrende Aufgaben benötigen die jeweils erforderliche konkrete Autorisierung.
- Für Automationen sind Zeitplan, Umfang und erlaubte Aktionen vor Aktivierung nachvollziehbar.

## 3. Space betreten und Assistant dauerhaft nutzen

- Nach Abschluss öffnet sich der Space. Der Assistant bietet eine zum Profil passende erste Aktion an.
- Das Space-Profil bleibt sichtbar, editierbar und dem richtigen Space zugeordnet. Es enthält Zweck, bevorzugte Arbeitsweise, erlaubte Zugänge und vereinbarte Automationen.
- Über „Assistant anpassen“ lässt sich das Gespräch später fortsetzen und das Profil weiterentwickeln.
- Bestehende Spaces werden nicht ungefragt in eine blockierende Einführung gezwungen. Ihre Einführung ist gezielt erreichbar.

## 4. Unabhängige Agenten pro Space

- Autorisierte Agentenaufgaben gehören dauerhaft zu ihrem ursprünglichen Space.
- Jeder Lauf ist fest an Space, Profil und gegebenenfalls Browser-Ziel gebunden.
- Die Ausführung läuft unabhängig von der sichtbaren Space-Oberfläche. Ein Spacewechsel darf weder den Auftrag abbrechen noch seine erforderliche Browser-Sitzung zerstören oder auf einen anderen Space umleiten.
- Das Schließen eines UI-Streams oder Abonnements beendet keinen unabhängigen Agentenlauf.
- Status und Ergebnisse sind im ursprünglichen Space sowie in einer übergreifenden Agentenübersicht erreichbar.
- Die Übersicht zeigt nachvollziehbare Zustände: arbeitet, wartet auf User oder Freigabe, pausiert, abgeschlossen und fehlgeschlagen.
- Pause und Stopp wirken tatsächlich auf die Ausführung. Gleichzeitige Läufe werden begrenzt und Doppelstarts verhindert.
- Hintergrundausführung gilt zunächst bei laufendem Lastbrowser, einschließlich minimierter App. Ausführung nach Beenden der App oder bei ausgeschaltetem Rechner ist nicht Bestandteil dieses Ziels.
- Nach einem Neustart werden unterbrochene Läufe ehrlich dargestellt. Externe Aktionen werden nicht blind wiederholt.
- Browseraktionen nutzen das explizit zugeordnete Browser-Ziel. Desktopaktionen, die Fokus benötigen, werden gesondert behandelt.

## 5. Architektur und Datenschutz

- Die Umsetzung folgt AGENTS.md und nutzt geeignete bestehende Space-, Browser-, Agenten-, Scheduler-, Plugin- und Freigabebausteine.
- Backendänderungen erfolgen direkt in services/sidekick. Keine externen Clones oder Syncs, keine Regex-Patch-Skripte und kein services/webui.
- Das Packaging bleibt in-tree und offline-fähig.
- Versionierte Datenverträge und eine klare Zustandsmaschine bilden Einführung, Space-Profil und Agentenläufe ab.
- Daten, Konten und Ergebnisse verschiedener Spaces und Profile bleiben getrennt.
- Einrichtungsantworten und Gesprächsdaten werden lokal gespeichert. Übertragungen erfolgen nur im Rahmen ausdrücklich genutzter Modell- oder Accountfunktionen.
- Keine Secrets, Datenbanken oder persönliche Laufzeitkonfigurationen in Git.
- Die Benutzerführung ist tastaturbedienbar, zugänglich und in die vorhandene Lokalisierung integriert.

## 6. Akzeptanz und Verifikation

Das Ziel ist erfüllt, wenn die beschriebenen Abläufe implementiert und praktisch überprüft sind. Ein UI-Mockup oder erfolgreicher Build allein reicht nicht aus.

Aussagekräftige Prüfungen decken insbesondere ab:

- Antwortoptionen und Freitext, adaptive Folgefragen und Abschlussentscheidung;
- vorzeitiges Weitergehen, Überspringen, Speicherung und Wiederaufnahme;
- spätere Profilbearbeitung sowie Modell- und Verbindungsfehler;
- Isolation zwischen Spaces, Profilen und Browser-Zielen;
- fortlaufende Agentenausführung während Spacewechseln;
- Ergebniszustellung an den ursprünglichen Space;
- wirksames Pause- und Stopp-Verhalten sowie Doppelstartschutz.

Die Benutzerführung und Hintergrundausführung werden im laufenden Lastbrowser mit kontrollierten Testseiten und Testaufgaben geprüft. Echte Benutzerkonten werden nicht ohne Autorisierung verwendet; echte Nachrichten werden nicht ohne Autorisierung versendet.

Zusätzlich werden die Repository-Checks ausgeführt:

```text
npm test
npm run verify:store
npm --workspace apps/desktop run build
python -m compileall -q services/sidekick
```

Der Abschlussbericht trennt umgesetzt, tatsächlich geprüft, ungetestet und extern blockiert. Vorhandene Benutzeränderungen bleiben erhalten. Keine Commits oder Pushes ohne ausdrückliche Autorisierung.

## 7. Produktmodell und Umfang

### 7.1 Begriffe

| Begriff | Bedeutung |
| --- | --- |
| Space Assistant | Dauerhafter Ansprechpartner eines Space mit eigenem Profil und Kontext. |
| Space-Profil | Vom User bestätigte Beschreibung von Zweck, Erwartungen und Arbeitsweise. |
| Interview | Adaptives Gespräch zum Erstellen oder Überarbeiten des Space-Profils. |
| Agentendefinition | Gespeicherter Auftrag mit Fähigkeiten, Grenzen und optionalem Zeitplan. |
| Agentenlauf | Eine konkrete Ausführung einer Agentendefinition mit eigener ID und eigenem Status. |
| Verbindung | Referenz auf einen authentifizierten Account oder eine Browser-Sitzung. |
| Plugin | Verfügbare Fähigkeit mit Konfiguration und Berechtigungen. |
| Freigabe | Konkrete menschliche Autorisierung einer Aktion oder eines klar begrenzten Aufgabenbereichs. |

Ein Space Assistant darf mehrere Agentendefinitionen betreuen. Ein Gespräch ist kein Agentenlauf, und ein gespeicherter Auftrag ist noch keine aktive Automation. Die Oberfläche muss diese Unterschiede verständlich vermitteln.

### 7.2 Vollständiger Umfang der ersten Umsetzung

Die erste Umsetzung umfasst Einführung, editierbares Profil, Verbindungseinrichtung, manuell gestartete Agentenläufe, regelmäßige Aufgaben über den vorhandenen Scheduler, Hintergrundausführung bei Spacewechseln und eine globale Agentenübersicht. Die Implementation darf in Etappen erfolgen; das Gesamtziel bleibt bis zur Abnahme aller Etappen offen.

Ein Plattformkatalog wie bei Katteb ist Inspiration für wiederverwendbare Aufgaben, keine Verpflichtung zu einer bestimmten Zahl an Integrationen. Es werden nur tatsächlich vorhandene und geprüfte Integrationen angeboten. Neue externe Dienste, ein Cloud-Browser, ein Windows-Dienst für eine beendete App und eine allgemeine Windows-Desktopsteuerung gehören nicht zum erforderlichen Umfang.

### 7.3 Leitprinzipien

- Die Einführung vermittelt Nutzen durch konkrete Aufgaben und bleibt freiwillig.
- Der Assistant kann vorbereitet sein, ohne bereits Kontozugriff oder eine laufende Aufgabe zu haben.
- Der User darf jederzeit direkt arbeiten und die Einrichtung später vervollständigen.
- Der Assistant handelt innerhalb bestätigter Grenzen und macht fehlende Voraussetzungen sichtbar.
- Zustände, Fortschritt, Screenshots und Erfolgsberichte beruhen auf tatsächlicher Ausführung. Keine erfundenen Fortschrittsprozente oder simulierten Erfolge.

## 8. Konkrete Benutzerführung

### 8.1 Einstieg in einen neuen Space

Der erste Screen nennt den Space und stellt den Assistant kurz vor. Die erste Frage enthält bereits drei bis vier Optionen und freie Eingabe, beispielsweise:

> „Wofür möchtest du diesen Space nutzen?“
>
> Arbeit und Projekte · Recherche und Lernen · Shop und Kunden · Persönliche Organisation
>
> Eigene Antwort: …

Die Optionen sind Beispiele; spätere Fragen passen zum tatsächlichen Gespräch. „Eigene Antwort“ ist ein Eingabefeld und keine zusätzliche vierte oder fünfte inhaltliche Option. Pro Frage ist festgelegt, ob eine oder mehrere Optionen wählbar sind. Die Auswahl allein sendet die Antwort nicht unbeabsichtigt ab; der User kann sie ergänzen und bewusst bestätigen.

Es gibt keine Anzeige „Frage 2 von 4“, weil die Länge nicht feststeht. Stattdessen werden aktuelle Themen verständlich benannt, etwa „Aufgaben“, „Arbeitsweise“ und „Hintergrundaktivität“.

### 8.2 Gespräch und Zusammenfassung

Der User sieht die bisherige Unterhaltung und kann eine Antwort korrigieren. Eine Korrektur aktualisiert den Profilentwurf und invalidiert widersprechende Schlussfolgerungen. Neue Rückfragen beziehen sich nur auf tatsächlich offene Punkte.

„Weiter“ übernimmt vorhandene Antworten in einen prüfbaren Entwurf und führt zur Zusammenfassung, auch wenn der Entwurf unvollständig ist. „Direkt in den Space“ speichert den Zwischenstand und überspringt die restliche Einrichtung. Nach dem Überspringen startet kein Agent automatisch.

Sagt der User „genug“, „das reicht“, „weiter“ oder sinngemäß dasselbe, beendet der Assistant die Fragen und zeigt den nächsten Schritt. Eine lokale Erkennung expliziter Abschlusswünsche sollte diesen Weg auch bei einem Modellfehler ermöglichen. Sie darf keine Äußerung wie „Ich habe genug offene Rechnungen“ fälschlich als Abschluss behandeln. Der sichtbare Weiter-Button funktioniert unabhängig vom Modell.

Hat der Assistant genügend Informationen, zeigt er die Zusammenfassung. Der User kann „Passt, weiter“, „Bearbeiten“ oder „Weiter besprechen“ wählen. Letzteres setzt das Interview gezielt fort.

### 8.3 Verbindungen und Einstieg

Die zweite Ansicht zeigt die bestätigbare Zusammenfassung und passende Verbindungen. Beispiel: Für einen Recherche-Space werden vorhandene Recherchefähigkeiten angeboten; Gmail wird nur vorgeschlagen, wenn ein entsprechender Bedarf geäußert wurde und eine echte Integration vorhanden ist.

Verbindungsaufbau findet in einem nachvollziehbaren OAuth- oder Browser-Login statt. Der Assistant fragt im Chat keine Passwörter ab. Der User kann zurück zum Interview, Verbindungen überspringen oder den Space betreten. Ein fehlgeschlagener Login verliert keine Interviewantworten.

Im Space erscheint eine kompakte Begrüßung mit dem vereinbarten Zweck und einer möglichen ersten Aktion. „Assistant eingerichtet“ ist getrennt von „Aufgabe läuft“. Ein erster Aufgabenstart erfordert eine ausdrückliche Startaktion; allein der Abschluss des Onboardings startet keine externe Arbeit.

### 8.4 Einstiegspunkte nach der Einrichtung

- „Assistant anpassen“ öffnet Profil und Interviewfortsetzung.
- „Verbindungen und Plugins“ öffnet verfügbare Zugänge und deren Space-Zuordnung.
- „Agenten“ zeigt gespeicherte Aufgaben und Laufhistorie des Space.
- Eine globale Übersicht bleibt von jedem Space aus erreichbar.
- Ein Space-Indikator kann aktive oder wartende Läufe anzeigen, ohne deren vertrauliche Inhalte in anderen Spaces einzublenden.

## 9. Interviewlogik und Modellvertrag

### 9.1 Profilthemen

Das Interview soll folgende Informationen gewinnen, soweit sie für den geäußerten Bedarf relevant sind:

| Thema | Erwartete Information | Pflicht zur Nachfrage |
| --- | --- | --- |
| Zweck | Wofür ist dieser Space gedacht? | Nur wenn noch unverständlich. |
| Gewünschte Hilfe | Welche Ergebnisse oder Aufgaben sind wichtig? | Nur wenn kein sinnvoller Einstieg ableitbar ist. |
| Arbeitsweise | Ergebnisstil, Sprache, Detailgrad und Initiative. | Nur bei relevanter Unklarheit; neutrale Defaults sind möglich. |
| Hintergrundarbeit | Nur auf Anfrage, einmalige Aufgaben oder regelmäßige Prüfungen? | Wenn autonome Aufgaben gewünscht werden. |
| Grenzen | Welche Aktionen sollen Entwurf oder Freigabe bleiben? | Vor Einrichtung entsprechender Aufgaben konkretisieren. |
| Zugänge | Welche vorhandenen Dienste werden dafür benötigt? | Nur bei tatsächlichem Bedarf. |

Nicht jedes Thema muss zu einer Frage werden. Ein User kann mehrere Themen in einer Antwort abdecken. Sensible oder private Angaben werden nicht ohne konkreten Nutzen erfragt.

### 9.2 Strukturierte Interviewantwort

Das Backend liefert neben einem kurzen Gesprächstext eine validierte Struktur:

```text
InterviewTurn
  schemaVersion
  interviewId, spaceId, profileId, turnId, expectedRevision
  assistantMessage
  decision: ask | summarize
  question?: { id, text, selectionMode, options[3..4], freeTextAllowed: true }
  profilePatch: Änderung am Entwurf, keine Berechtigungsänderung
  coveredTopics[]
  unresolvedTopics[]
  readinessReason?: verständliche Begründung für die Zusammenfassung
```

Optionen besitzen stabile IDs und Labels. Optionstexte sind Daten und werden nicht als Toolbefehle interpretiert. Das Backend validiert Anzahl, Datentypen und erlaubte Profilfelder. Das Modell darf keine Zugangsdaten, Freigaben, Zeitplanaktivierungen oder Laufstarts in einen Profilpatch schreiben.

Die Darstellung nutzt strukturierte Felder; sie extrahiert keine interaktiven Buttons aus frei formuliertem Markdown. Bei ungültiger Modellantwort darf das Backend einmal kontrolliert reparieren. Bleibt sie ungültig, erscheint eine verständliche Wiederholungsmöglichkeit sowie ein manueller Weg zur Zusammenfassung.

### 9.3 Abschluss und Fortsetzung

Die Abschlussentscheidung verlangt eine begründete Themenabdeckung, keinen numerischen Confidence-Wert. Der Assistant soll zusammenfassen, wenn weitere Fragen keinen notwendigen Nutzen haben. Der User kann dennoch weiterreden. Keine harte Obergrenze darf ein bewusst fortgesetztes Interview beenden.

Modellaufrufe haben trotzdem technische Timeouts und begrenzte Wiederholungen. Ein langes Interview muss mit einer überprüfbaren Gesprächszusammenfassung und gespeicherten Antworten weiterarbeiten können, ohne den gesamten Verlauf bei jedem Turn erneut zu senden. Budget- oder Providerfehler werden sichtbar gemacht; sie werden nicht als „alles verstanden“ ausgegeben.

Antworten des Users und Inhalte externer Seiten gelten als Eingabedaten. Eine im Interview erwähnte Instruktion darf keine internen Rechte, Toolregeln oder Space-Zuordnungen überschreiben.

## 10. Datenmodell und Speicherung

Das Backend ist die dauerhafte Quelle für Assistant-Konfiguration, Interviewstände, Agentendefinitionen und Laufzustände. Renderer-State dient der Darstellung und darf keine zweite konkurrierende Quelle erzeugen. Bestehende Speichermechanismen werden nach Codeprüfung wiederverwendet.

### 10.1 Verbindliche Entitäten

| Entität | Wesentliche Felder |
| --- | --- |
| SpaceAssistantProfile | schemaVersion, spaceId, profileId, revision, purpose, desiredOutcomes, workingPreferences, backgroundPreference, boundaries, confirmedAt, updatedAt |
| OnboardingSession | id, scope, status, revision, answers, draftProfile, coveredTopics, unresolvedTopics, completionReason, timestamps |
| SpaceCapabilityBinding | id, scope, capabilityId, connectionRef, permittedUse, status, timestamps |
| AgentDefinition | id, scope, name, objective, capabilityBindings, authorizationPolicy, budgets, schedule, enabled, revision |
| AgentRun | id, scope, definitionId, definitionRevision, status, checkpoint, browserLeaseRefs, timestamps, resultRef, errorCode |
| RunEvent | runId, monoton steigende sequence, eventType, timestamp, payload |
| ActionApproval | id, runId, scope, actionDigest, targetRef, expiresAt, status, trustedActor |
| AssistantConversation | id, scope, kind=space_assistant, messages, revision, timestamps |
| TaskDispatch | id, scope, assistantConversationId, sourceMessageId, clientRequestId, objective, authorizationRef, targetSessionId, runId, status, timestamps |

`scope` enthält mindestens Space-Identität und Profil-Identität. Zugangsdaten sind keine Felder dieser Entitäten; `connectionRef` verweist auf die vorhandene geschützte Speicherung.

### 10.2 Stabile Space-Identität

Der Renderer nutzt unter anderem Space-Pfade und daraus abgeleitete Session- und Partition-Keys. Der Backend-Space-Engine besitzt bereits ein persistiertes UUID-Feld `space_id`, das über explizite Schreibpfade erzeugt wird. Diese Identität wird bis in Renderer, IPC, Runner und Browser-Leases durchgereicht. Es wird kein konkurrierender Space-ID-Mechanismus eingeführt. Legacy-Spaces ohne ID erhalten sie über den vorhandenen migrationsfähigen Schreibpfad; reine Leseoperationen führen keine heimliche Migration aus.

Umbenennen oder Verschieben eines Space darf nicht versehentlich ein anderes Konto zuordnen oder Agenten verlieren. Bestehende Browser-Partitionen werden über eine explizite Zuordnung weiterverwendet. Keine automatische Cookie-Kopie zwischen Spaces. Pfadkollisionen, unterschiedliche Schreibweisen und veraltete Pfade müssen geprüft werden.

### 10.3 Konsistenz und Änderungskonflikte

- Schreibvorgänge verwenden Revisionen und atomare Persistenz. Veraltete Schreibversuche überschreiben keine neueren Antworten.
- Modellantworten nach einem Spacewechsel oder nach einer Korrektur werden nur auf die passende Interview-ID und Revision angewendet.
- Laufende Agenten nutzen eine gespeicherte Definitionrevision. Änderungen gelten für neue Läufe; ein Rechteentzug wirkt dagegen sofort auf weitere Aktionen.
- Migrationen sind wiederholbar und behalten vorhandene Daten. Beschädigte Zustände werden als Fehler angezeigt und nicht still gelöscht.
- Persistente Daten liegen im vorgesehenen Lastbrowser-Datenverzeichnis, nicht im Repository. Im Backend abweichende Pfade müssen vor Umsetzung geprüft werden.

## 11. Zustandsmaschinen

### 11.1 Einführung

```text
not_started -> interviewing -> reviewing -> connecting -> completed
                     |             |            |
                     +-------------+------------+-> skipped

reviewing -> interviewing       durch „Weiter besprechen“
connecting -> reviewing         durch Zurücknavigation
skipped -> interviewing         durch spätere Fortsetzung
completed -> interviewing      durch „Assistant anpassen“, als neue Überarbeitung
```

Fehler werden dem aktuellen Schritt zugeordnet; der gespeicherte letzte gültige Zustand bleibt erhalten. Das Schließen der Oberfläche bricht einen laufenden Interviewrequest bei Bedarf ab, löscht aber keine bestätigten Antworten. Es berührt keine unabhängigen Agentenläufe.

### 11.2 Agentenlauf

```text
queued -> running -> completed
            |   +-> waiting_for_user -> running
            |   +-> waiting_for_approval -> running
            |   +-> pausing -> paused -> queued
            |   +-> failed
            |   +-> interrupted
            +-> cancelling -> cancelled
```

Auch wartende, pausierte und eingereihte Läufe können beendet werden. Terminale Zustände werden nicht durch verspätete Toolantworten überschrieben. „Fortsetzen“ setzt denselben Lauf nur an einem sicheren Checkpoint fort; „Erneut ausführen“ erzeugt einen neuen Lauf mit eigener ID.

Pause wird erst als `paused` angezeigt, wenn der Runner einen sicheren Haltepunkt erreicht hat. Stopp verhindert weitere Aktionen und cancelt laufende Requests, soweit technisch möglich. Bereits ausgeführte externe Aktionen werden dadurch nicht rückgängig gemacht. Bei einem nicht abbrechbaren Aufruf zeigt die Oberfläche den tatsächlichen Zustand bis zur Rückmeldung.

## 12. Ausführungsarchitektur und Verantwortlichkeiten

### 12.1 Renderer

Der Renderer zeigt Einführung, Profile, Verbindungen und Laufzustände. Er sendet explizite Start-, Pause-, Fortsetzen- und Stoppbefehle und abonniert Ereignisse. Spacewechsel tauschen die sichtbare Auswahl und Abonnements aus. Sie besitzen keine implizite Befugnis, unabhängige Läufe zu beenden.

### 12.2 Electron Main Process

Der Main Process verwaltet die Lebensdauer der tatsächlichen Browser-Ziele und ihrer Space-/Profil-Partitionen. Er stellt dem Backend eine begrenzte, authentifizierte Schnittstelle zur Verfügung, die Zielzuordnung serverseitig prüft. Rendererkomponenten dürfen benötigte Browser-Ziele nicht allein durch Unmounting zerstören.

### 12.3 Python-Backend

Ein Run Manager besitzt die dauerhaften Laufzustände, Warteschlange, Budgets, Freigaben und Checkpoints. Er nutzt den bestehenden Agentenruntime und Scheduler, soweit diese passend sind. Keine zweite unabhängige Agentenengine und kein zweiter Scheduler ohne belegte technische Notwendigkeit.

Chatabonnement und Agentenrun sind getrennte Lebenszyklen. Das Schließen eines SSE-Streams darf nur das Abonnement schließen. Backend- und Main-Process-Neustarts werden gegenseitig erkannt; ein verschwundenes Browser-Ziel wird nicht durch den aktuell aktiven Tab ersetzt.

### 12.4 Steuerverträge

Vor Implementation werden typisierte Verträge für folgende Operationen festgelegt und über die vorhandene API-/IPC-Architektur umgesetzt:

- Interview lesen, starten, beantworten, korrigieren, zusammenfassen und abschließen;
- Profil lesen und mit Revision ändern;
- verfügbare Fähigkeiten und Verbindungsstatus lesen sowie Space-Bindings ändern;
- Agentendefinition erstellen, ändern, aktivieren und deaktivieren;
- Lauf starten, lesen, pausieren, fortsetzen und stoppen;
- Ergebnisse lesen und Ereignisse ab einer bekannten Sequenz abonnieren.

Mutationen benötigen authentifizierte lokale Zugriffe, Scope-Prüfung und geeigneten Schutz gegen Requests aus fremden Webseiten. Ein Modell oder eine Webseite darf keine vertrauenswürdige menschliche Freigabe erzeugen. Bestehende Authentifizierungsmechanismen werden integriert und nicht umgangen.

## 13. Browserarbeit im Hintergrund

### 13.1 Browser-Ziele statt bloßer Cookies

Eine persistente Partition erhält Logins, garantiert aber noch kein lebendes Browser-Ziel. Für jeden Browserlauf hält der Main Process ein tatsächliches Ziel unabhängig von der gerade dargestellten Space-Ansicht bereit. Der Agent arbeitet vorzugsweise in einem eigenen, bei Bedarf einblendbaren Arbeits-Tab desselben berechtigten Space und Profils.

Ein Browser-Lease enthält mindestens runId, spaceId, profileId, partitionKey, targetId und eine Laufzeitgeneration. Toolaktionen prüfen den Lease vor Ausführung. Stale oder zerstörte Ziele führen zu einem sichtbaren Wartezustand oder Fehler; keine Suche nach einem beliebigen Ersatz-Tab.

### 13.2 Gleichzeitige Nutzung

- Agenten navigieren nicht unangekündigt den vom User gerade bearbeiteten Tab um.
- Mutierende Aktionen auf demselben Browser-Ziel werden serialisiert.
- Für Aufgaben mit gemeinsamem Accountzustand kann zusätzlich eine Ressourcen-Sperre nötig sein. Unterschiedliche Tabs allein verhindern keine widersprechenden Kontotransaktionen.
- Bei manueller Übernahme wird der Agent sicher pausiert; danach ist eine bewusste Fortsetzung möglich.
- Der User kann den Arbeits-Tab ansehen, ohne den Agenten zwingend zu beenden.
- Browser-Throttling und minimierte Fenster werden praktisch geprüft. Änderungen betreffen möglichst nur notwendige Arbeitsziele. Electron dokumentiert Auswirkungen von deaktiviertem Throttling auf weitere WebContents desselben Hostfensters; deshalb muss die gewählte Hostarchitektur die tatsächliche Reichweite begrenzen und prüfen. Siehe Abschnitt 21.3.

### 13.3 Anmeldungen und sichtbare Interaktion

Bei abgelaufener Anmeldung, MFA, CAPTCHA oder nötiger manueller Bestätigung wechselt der Lauf in `waiting_for_user`. Der User öffnet das richtige Browser-Ziel und erledigt den Schritt selbst. Ein Agent wechselt dafür nicht ungefragt den Space oder übernimmt den Desktop-Fokus.

Nach Wiederanmeldung wird vor Fortsetzung geprüft, ob Konto und Ziel weiterhin zum autorisierten Auftrag passen. Incognito-Sitzungen werden nicht als persistente Accountverbindungen angeboten.

## 14. Accounts, Plugins und Berechtigungen

### 14.1 Fähigkeit, Verbindung und Erlaubnis getrennt halten

Ein installiertes Plugin ist eine verfügbare Fähigkeit. Ein angemeldeter Account ist eine Verbindung. Erst ein Space-Binding und passende Autorisierung erlauben die Verwendung im konkreten Space. Diese drei Zustände dürfen nicht zu einem einzigen Schalter zusammenfallen.

Das Aktivieren eines Plugins in einem Space gewährt anderen Spaces keinen Zugriff. Eine vorhandene globale Verbindung kann nur durch ausdrückliche Zuordnung genutzt werden. Unterstützung und Auswahl mehrerer Accounts müssen eindeutig sein; kein automatischer Wechsel auf den ersten verfügbaren Account.

### 14.2 Aktionsregeln

Ein Profilwunsch wie „hilf mir mit Kunden“ genügt nicht für Nachrichtensendungen. Eine konkrete Aufgabe wie „prüfe jeden Werktag um 9 Uhr neue Tickets und erstelle einen Bericht“ kann einen klar begrenzten Leseauftrag autorisieren. Versand, Veröffentlichung, Käufe, Zahlungen, Löschen und Änderungen an Zugriffsrechten benötigen eine passende konkrete Freigabe.

Eine Freigabe ist an Lauf, Aktion, Ziel, Scope und Gültigkeit gebunden. Änderungen am Ziel oder Aktionsinhalt invalidieren sie. UI-Freigaben können für einen Lauf in einem anderen Space angezeigt werden, nennen aber ausdrücklich Space und Zielkonto.

Untrusted Seiteninhalte, Pluginantworten und Interviewtexte dürfen diese Regeln nicht umgehen. Raw-CDP-Zugriff und andere mächtige Tools müssen dieselben Scope- und Freigabegrenzen einhalten.

### 14.3 Entzug und Entfernung

Bei Entzug einer Verbindung oder Pluginberechtigung wird vor jeder weiteren betroffenen Aktion erneut geprüft. Laufende Aufgaben pausieren oder scheitern nachvollziehbar. Entfernung einer Space-Zuordnung löscht nicht automatisch einen global genutzten Account.

Wird ein Space gelöscht, verhindert der Runner weitere Aktionen, beendet dessen Läufe und entfernt dessen Bindings gemäß der vorhandenen Löschlogik. Der User erhält vor der Löschung einen Hinweis auf laufende Aufgaben. Ein gelöschter Space darf nicht durch eine später angelegte gleichnamige Instanz wiederbelebt werden.

## 15. Zeitpläne, Budgets und Ressourcen

Zeitpläne verwenden die ausdrücklich angezeigte Zeitzone. Sommerzeitwechsel, verpasste Termine und Überschneidungen werden deterministisch behandelt. Default bei beendeter App oder Schlafmodus: verpasste Termine anzeigen, keine Serie nachträglicher Läufe starten. Ein optionaler einzelner Nachhollauf muss bewusst konfiguriert sein.

Für dieselbe Agentendefinition startet standardmäßig kein zweiter Lauf, solange der vorherige nicht beendet ist. Der Scheduler registriert übersprungene Termine nachvollziehbar. Ein Start-Idempotenzschlüssel verhindert doppelte Läufe durch Doppelklick, Retry oder Scheduler-Race.

Die erste Version bietet mehrere gespeicherte Agenten je Space. Als konservativer Default läuft höchstens ein aktiver Lauf pro Space und höchstens zwei global. Weitere Läufe warten sichtbar in der Queue. Wartezustände halten keine unnötigen Rechenplätze belegt; benötigte Ressourcen-Leases bleiben nachvollziehbar verwaltet. Die Limits sind zentral konfigurierbar.

Jeder Lauf hat begrenzte Toolschritte, Laufzeit und Providerrequests sowie, soweit messbar, ein Tokenbudget. Technische Defaults werden nach Prüfung der vorhandenen Runtime festgelegt und dokumentiert. Ein erschöpftes Budget führt zu einem sichtbaren Abschluss- oder Wartezustand mit Teilergebnis, nicht zu einer endlosen automatischen Fortsetzung.

Ein Interview hat keine feste Fragenzahl; die Ressourcenbegrenzung betrifft Modellaufrufe und kontrollierte Fortsetzung, nicht ein willkürliches Ende des Gesprächs.

## 16. Ergebnisse, Ereignisse und Benachrichtigungen

Ein Ergebnisbericht enthält Auftrag, tatsächlich ausgeführte Schritte, beobachtete Ergebnisse, relevante Quellen oder Artefakte, erfolgte externe Änderungen, Grenzen und nächsten Handlungsbedarf. Teilerfolge werden ausdrücklich als solche bezeichnet. Screenshots werden nur bei tatsächlichem Nutzen erstellt und lokal gespeichert; sensible Inhalte werden nicht ungefragt in Benachrichtigungen gezeigt.

Ereignisse besitzen fortlaufende Sequenzen. Nach einem Verbindungsabbruch lädt die Oberfläche Snapshot und fehlende Ereignisse nach, ohne doppelte Nachrichten oder Ergebnisse anzulegen. Ein Renderer-Reload verliert keine Backend-Läufe.

Benachrichtigt wird bei Abschluss, Fehler, nötiger Freigabe oder nötiger Useraktion. Unveränderte Pollingzustände erzeugen keine wiederholten Meldungen. Der aktuelle Space wird nicht automatisch gewechselt. Ein Klick auf „Ansehen“ öffnet bewusst den zugehörigen Space und Lauf.

Lokale Laufhistorie und Artefakte haben dokumentierte Aufbewahrungs- und Löschmöglichkeiten. Technische Logs enthalten keine Cookies, Zugangstokens oder vollständigen privaten Nachrichteninhalte.

## 17. Fehler- und Wiederanlaufverhalten

| Situation | Erwartetes Verhalten |
| --- | --- |
| Spacewechsel während Interviewrequest | Antwort wird nur dem ursprünglichen Interview zugeordnet; keine Anzeige im falschen Space. |
| Spacewechsel während Browseraktion | Der Lauf arbeitet am gebundenen Ziel weiter; das neue aktive Ziel bleibt unberührt. |
| Renderer-Reload | Lauf bleibt bestehen; UI synchronisiert Snapshot und Ereignisse. |
| Backend-Absturz | Main Process sperrt weitere Agentensteuerung aus der alten Generation; Läufe werden bei Wiederanlauf als unterbrochen abgeglichen. |
| Main Process oder Browser-Ziel beendet | Backend stoppt Browseraktionen am alten Lease; kein automatischer Zugriff auf andere Ziele. |
| App beendet | Laufstatus wird bestmöglich gespeichert; beim nächsten Start kein blinder Replay externer Aktionen. |
| System im Schlafmodus | Zeitpläne und veraltete Leases werden nach Aufwachen abgeglichen. |
| Netz- oder Providerfehler | Begrenzter Retry bei sicheren Operationen, danach verständlicher Fehler und Teilergebnis. |
| Unklarer Erfolg einer externen Aktion | Vor Wiederholung Zustand prüfen oder Userentscheidung verlangen; keine Behauptung einer Exactly-once-Garantie. |
| Persistenz nicht verfügbar | Keine neue unabhängige Aufgabe starten, die ihre Zuordnung oder Freigaben nicht zuverlässig speichern kann. |
| Account nicht mehr verbunden | Betroffenen Lauf pausieren und konkreten Reconnect anbieten. |
| Zwei Fenster ändern dasselbe Profil | Konflikt wird erkannt; kein stilles Überschreiben. |

Automatische Wiederaufnahme nach einem Absturz ist nur für nachweislich sichere, idempotente Schritte zulässig. Andernfalls bietet die Oberfläche eine bewusste Fortsetzung mit Erklärung des letzten bekannten Zustands an.

## 18. Umsetzungsetappen und Repository-Anknüpfung

### 18.1 Vor Beginn prüfen

Am 3. Oktober 2026 wurden für dieses Dokument folgende Dateien als Anknüpfungspunkte im aktuellen Checkout gelesen oder lokalisiert. Das ist eine Navigationshilfe, keine End-to-End-Verifikation:

- `apps/desktop/src/renderer/App.tsx`: aktive Space-Auswahl und scoped Session-Zustände;
- `apps/desktop/src/renderer/tab-sessions.ts`: Space-/Profil-Schlüssel und persistente Partitionen;
- `apps/desktop/src/renderer/profiles.ts`: Profilzuordnung;
- `apps/desktop/src/main/cdp.ts`: CDP-Konfiguration;
- `services/sidekick/web/api/goals.py` und `services/sidekick/cli/goals.py`: persistente Ziele;
- `services/sidekick/runtime/cron/scheduler.py`: vorhandener Scheduler;
- `services/sidekick/tools/browser_cdp_tool.py` und `services/sidekick/web/api/browser_runtime.py`: Browsersteuerung;
- vorhandene Account-, Plugin-, Freigabe- und Streamingimplementierungen sind vor Eingriff genauer zu untersuchen.

Der Checkout enthält bereits Benutzeränderungen. Der umsetzende Agent liest Git-Status und relevante Diffs zuerst. Historische Testzahlen in AGENTS.md sind keine Abnahme der aktuellen Version.

### 18.2 Reihenfolge

1. Architektur und Datenverträge festlegen: bestehende Scope-Identität, Persistenz, Authentifizierung und Lauflebenszyklen prüfen; migrationsfähige Verträge dokumentieren.
2. Einführung vollständig vertikal implementieren: Backendzustand, strukturierter Modellvertrag, Optionen/Freitext, Zusammenfassung, Wiederaufnahme und manueller Fallback.
3. Profil und Verbindungen integrieren: tatsächlicher Katalog, Space-Bindings, Berechtigungen, Bearbeitung und Einstieg.
4. Space Assistant im vorhandenen rechten Panel integrieren und dessen Gesprächs-/Streamingzustände vom Hauptchat trennen; unabhängigen Run Manager mit Start/Queue, Ereignissen, Budgets, Checkpoints und wirksamen Steuerelementen integrieren.
5. Browser-Lebensdauer im Main Process absichern: Arbeitsziele, Leases, Isolation und Konfliktbehandlung.
6. Idempotente Delegation an normale Arbeitschats und Agenten, tatsächliche Statusauskunft, globale und Space-bezogene Übersicht sowie Ergebnisberichte implementieren.
7. Zeitpläne und Wiederanlaufverhalten integrieren.
8. Szenarien praktisch prüfen, Repository-Checks ausführen und Dokumentation aktualisieren.

Jede Etappe liefert funktionierendes Verhalten statt ausschließlich Oberflächenattrappen. Bestehende Chat-, Browser- und Spacefunktionen bleiben nutzbar. Falls ein Vertrag grundlegend geändert werden muss, wird die Entscheidung samt Migration im Implementierungsplan dokumentiert.

## 19. Konkrete Abnahmeszenarien

| ID | Szenario | Nachweis |
| --- | --- | --- |
| A01 | Neuer Space, erstes Interview | Jede Frage hat 3–4 inhaltliche Optionen und freie Eingabe; kein fester Fragezähler. |
| A02 | User antwortet ausschließlich frei | Folgende Fragen und Profil berücksichtigen den Freitext gleichwertig. |
| A03 | Eine Antwort deckt mehrere Themen ab | Keine unnötige Wiederholung; strukturierte Themenabdeckung ist prüfbar. |
| A04 | User möchte länger weiterreden | Interview bleibt fortsetzbar; keine feste Fragenobergrenze. |
| A05 | User klickt früh „Weiter“ | Unvollständiges Profil ist prüfbar; Verbindungen und Einstieg bleiben möglich. |
| A06 | User sagt „das reicht“ | Keine weitere Interviewfrage; Zusammenfassung und bewusste Fortsetzung erscheinen. |
| A07 | „Ich habe genug offene Rechnungen“ | Interview wird nicht fälschlich beendet. |
| A08 | Assistant hat genügend Kontext | Begründete Zusammenfassung; kein automatischer Accountzugriff oder Aufgabenstart. |
| A09 | Zurück, Korrektur, Wiederaufnahme | Antworten bleiben erhalten; veraltete Modellantwort überschreibt die Korrektur nicht. |
| A10 | Modell fehlt oder liefert ungültige Struktur | Wiederholen und manueller Einstieg funktionieren. |
| A11 | Accountverbindung schlägt fehl | Profil bleibt erhalten; Überspringen funktioniert; Status ist ehrlich. |
| A12 | Space A und B nutzen unterschiedliche Testkonten | Agenten lesen und verändern ausschließlich das ausdrücklich zugeordnete Konto. |
| A13 | Kontrollierte Aufgabe läuft in A, User wechselt mehrfach zu B | Aufgabe läuft nachweislich weiter; B wird nicht navigiert; Ergebnis landet in A. |
| A14 | User minimiert die App | Browserlauf macht echten Fortschritt und schließt ab. |
| A15 | User übernimmt den Arbeits-Tab | Agent pausiert sicher; keine konkurrierende Eingabe oder Navigation. |
| A16 | Stopp während laufender Arbeit | Nach anerkanntem Stopp keine neue Toolaktion; verspätete Antwort reaktiviert den Lauf nicht. |
| A17 | Freigabe läuft ab oder Ziel ändert sich | Aktion wird verweigert und neue konkrete Freigabe verlangt. |
| A18 | Verbindung wird während eines Laufs entzogen | Weitere betroffene Aktionen werden verhindert. |
| A19 | Start-Doppelklick und Scheduler-Race | Genau ein Run-Datensatz für denselben Startschlüssel. |
| A20 | Renderer-Reload und SSE-Reconnect | Lauf bleibt bestehen; Status und Ergebnis erscheinen ohne Duplikate. |
| A21 | Backend- oder Main-Process-Neustart | Unterbrechung wird erkannt; keine Aktion am falschen Ziel und kein blinder Replay. |
| A22 | Budget erschöpft | Lauf endet oder wartet sichtbar mit tatsächlichem Teilergebnis. |
| A23 | Umbenennen, Verschieben und Löschen eines Space | Stabile Zuordnung bzw. gezieltes Beenden; kein Zugriff aus einem gleichnamigen neuen Space. |
| A24 | Zeitzonenwechsel, Sommerzeit, verpasster Termin | Dokumentierte deterministische Schedulerentscheidung; kein unerwarteter Nachholsturm. |
| A25 | Manipulativer Text aus einer Testseite | Keine Rechteausweitung, Scopeänderung oder gefälschte Userfreigabe. |
| A26 | Bestehender Space ohne neue Einrichtung | Bisherige Nutzung bleibt möglich; Einführung ist optional erreichbar. |
| A27 | Tastatur und unterstützte UI-Sprachen | Optionen, Freitext, Weiter, Überspringen und Laufsteuerung sind bedienbar und lesbar. |
| A28 | Zwei Backendprofile führen gleichzeitig Aufgaben aus | Modellkonfiguration, Home-Verzeichnisse, Zugangsdaten und Toolkontexte vermischen sich nicht. |
| A29 | Profilwechsel während eines Hintergrundlaufs | Ausführung behält ihr ursprüngliches Profil; neue Oberfläche zeigt nur die erlaubte Profilübersicht. |
| A30 | Bestätigtes Assistant-Profil wird geändert | Neue Läufe und neue Gesprächsturns erhalten die neue Profilrevision; bestehende Läufe behalten ihren Snapshot mit sofort wirksamem Rechteentzug. |
| A31 | Ein Plugin liefert nur eine Start-URL | Oberfläche zeigt Browserzugang statt behaupteter API-Verbindung; keine erfundene Integrationsfähigkeit. |
| A32 | Manipulierter IPC-Absender oder fremdes Browser-Target | Scope-Gateway verweigert Zugriff, einschließlich Raw-CDP- und allgemeiner Toolpfade. |
| A33 | Versuch eines Dateizugriffs außerhalb des erlaubten Arbeitsbereichs | Backendprüfung verhindert ihn; ein Browserauftrag aktiviert kein Terminal- oder Desktoptool. |
| A34 | Ein Profilinterview wird fortgesetzt | Neue Antworten ändern keine bestehenden Agentenrechte, Zeitpläne oder Aufgabenstarts. |
| A35 | Eine ausstehende Freigabe hält eine Ressource | Ein unabhängiger Lauf kann starten; der Ressourcenbesitzer bleibt eindeutig und es entsteht kein Deadlock. |
| A36 | Ein Appfenster oder Arbeits-Tab wird geschlossen | Andere Fenster und benötigte Main-Process-Arbeitsziele bleiben konsistent; keine verwaisten Leases. |
| A37 | Onboarding mit bereits konfiguriertem Provider | Keine zweite globale Provider-Einrichtung; der Space verwendet seine aktuelle Modellwahl. |
| A38 | Eventcursor ist älter als die Aufbewahrung | Atomarer neuer Snapshot mit Wasserstand ersetzt den Cursor; keine verlorene Zustandsänderung. |
| A39 | Alter Nova-/Swarm-Auftrag läuft parallel | Bestehende Governance bleibt wirksam; der neue Space Assistant umgeht keine Freigaben oder Lebenszyklusregeln. |
| A40 | Ziel verliert Navigation oder erhält ein Popup | Account- und Zielbindung bleibt geprüft; Popup erbt keine unbegrenzten Agentenrechte. |
| A41 | User klickt das vorhandene Sidekick-Icon rechts oben | Panel öffnet den Assistant des aktuellen Space mit erkennbarem Space-Namen; kein zweiter austauschbarer Hauptchat. |
| A42 | User wechselt bei offenem Assistant-Panel von A nach B | Panel zeigt Bs eigenen Verlauf; A arbeitet weiter und verspätete Antworten gelangen ausschließlich nach A. |
| A43 | User fragt „Was läuft gerade?“ | Antwort nennt tatsächlich gespeicherte Läufe, Arbeitschats, Wartezustände und letzten beobachteten Stand; kein neuer Arbeitsauftrag. |
| A44 | User beauftragt „Erstelle einen Chat für diese Recherche und leg los“ | Genau ein neuer Arbeitschat mit nachvollziehbarem Auftrag und Rücklink entsteht im richtigen Space; Ausführung startet im berechtigten Umfang. |
| A45 | User fragt nur nach einer möglichen Aufgabe | Ohne tatsächlichen Ausführungsauftrag entsteht kein laufender Arbeitschat oder Agent. |
| A46 | User spricht mit Assistant, während ein Arbeitschat läuft | Getrennte Verläufe, Busy-Zustände und Streams; kein gegenseitiges Überschreiben oder Abbrechen. |
| A47 | Assistant-Panel wird geschlossen oder User besucht einen anderen Chat | Bereits delegierte Arbeit läuft weiter; Ergebnis ist in Arbeitschat und Assistant-Aktivität erreichbar. |
| A48 | Delegierter Chat schließt ab oder scheitert | Assistant erhält genau einen nachvollziehbaren Ergebnisverweis; Statusfrage gibt das tatsächliche Ergebnis wieder. |
| A49 | Statusprovider ist nicht erreichbar | Panel zeigt gecachten Stand als veraltet und keine erfundene Live-Aktivität; deterministische Steuerung bleibt soweit möglich verfügbar. |
| A50 | Doppelte oder verspätete Delegationsantwort | Ein Startschlüssel erzeugt höchstens einen Dispatch und einen Arbeitschat; keine automatischen Folgeschleifen. |
| A51 | Panel fragt nach Seite oder Auswahl | Nur ausdrücklich freigegebener bzw. zur Aktion ausgewählter Seitenkontext wird verwendet; kein Vollzugriff auf alle Space-Tabs. |
| A52 | Alter Copilot-Chat enthält Benutzerverlauf | Bestehender normaler Chat bleibt zugänglich; Umstellung verschiebt, löscht oder vermischt keine Nachrichten ungefragt. |
| A53 | „Stoppe diesen Auftrag“ bei mehreren aktiven Läufen | Der bezeichnete Dispatch wird beendet; unbeteiligte Chats und Läufe laufen weiter. |

Für Lauf- und Browsernachweise genügt kein Mock, der direkt einen Erfolgszustand setzt. Mindestens A13, A14, A16 und A20 werden mit laufender App und kontrollierter echter Browseraufgabe geprüft. Die Isolation wird zusätzlich mit zwei unterscheidbaren lokalen Testkonten oder Testseiten nachgewiesen.

Sicherheits-, Konsistenz- und Ausfallpfade erhalten gezielte automatisierte Tests. Für reine reversible Text- und Layoutänderungen werden keine Tests geschrieben, die lediglich die Implementation nachbilden. Relevante bestehende Tests werden weiter ausgeführt.

## 20. Abschlussdefinition und Agentenauftrag

Der umsetzende Agent arbeitet autonom durch alle Etappen. Er entscheidet routinemäßige technische Details anhand des aktuellen Codes und dieses Dokuments. Er stoppt nicht nach einer Architekturidee, einer Einführung ohne echte Laufengine oder einer Agentenübersicht ohne fortlaufende Browserarbeit.

Er darf das Ziel erst als abgeschlossen melden, wenn:

- alle verbindlichen Produktabläufe implementiert sind;
- Interview, Profile und Berechtigungen dauerhaft und pro Space korrekt gespeichert werden;
- der Space Assistant hinter dem vorhandenen Sidekick-Icon einen eigenen Verlauf besitzt, reale Aktivität erklären und autorisierte Arbeit idempotent an normale Chats und Agenten delegieren kann;
- reale Browseraufgaben Spacewechsel und Minimierung nachweislich überstehen;
- Steuerung, Isolation, Fehlerpfade und Ergebniszustellung geprüft sind;
- die relevanten automatisierten Tests und Repository-Checks bestanden haben; nicht ausführbare oder fehlgeschlagene Pflichtprüfungen lassen die vollständige Abnahme offen, auch wenn die Ursache bereits vorher bestand;
- die neue Funktion auch im vorgesehenen gepackten Laufzeitpfad geprüft wurde, soweit lokal ohne Veröffentlichung möglich;
- die Benutzer- und Architekturhinweise den tatsächlichen Stand beschreiben.

Ein externer Blocker erlaubt einen klaren Zwischenbericht, aber keine vollständige Erfolgsmeldung. Alle davon unabhängigen Arbeiten werden vorher erledigt. Veröffentlichung, Commit und Push sind durch dieses Ziel nicht autorisiert.

Der Abschlussbericht nennt die geänderten Dateien, umgesetzte Funktionen, ausgeführte Checks mit Ergebnissen, praktische Abnahmen, offene Punkte und eine kurze Anleitung: Space anlegen, Interview durchführen, Verbindung überspringen oder einrichten, Testauftrag starten, Space wechseln und Ergebnis prüfen.

## 21. Technische Nachprüfung und verbindliche Präzisierungen

Die folgenden Punkte wurden am 3. Oktober 2026 durch gezielte Quellcodeprüfung ergänzt. Sie sind vor Implementation erneut zu prüfen, falls sich der Checkout verändert hat. Sie ersetzen keine Laufzeitprüfung.

### 21.1 Bereits vorhandene Infrastruktur erweitern

| Befund im aktuellen Code | Konsequenz für die Umsetzung |
| --- | --- |
| `web/api/space_engine.py` normalisiert UUIDs, speichert `space_id` und kennt `mint_space_id`. | Diese Identität wiederverwenden. Bestehende Erstellung, Legacy-Migration und API-Durchreichung ergänzen. |
| Der Space Engine speichert Agentenrollen, Konfiguration und Sessions innerhalb eines Space. | Assistant und Agentendefinitionen in dieses Modell einordnen; keine zweite Space-Verzeichnisstruktur. |
| `web/api/swarm.py` besitzt Hintergrundworker mit Start-Gate, Cancel-Signal und Integration in dauerhaften Swarmzustand. | Geeignete Lebenszyklus- und Ereignisbausteine wiederverwenden. Swarm-Workflows und einfache Browseraufgaben nicht ungeprüft gleichsetzen. |
| Swarm ist an vertrauenswürdig aufgelöste Projektverzeichnisse gebunden. | Ein Space ohne Projektverzeichnis muss trotzdem Browseraufgaben ausführen können. Kein beliebiges Projektverzeichnis erfinden, um eine bestehende Projekt-Gate zu umgehen. |
| `Space.save_config` speichert bekannte Konfigurationsfelder und bestehende App-Konfigurationen. | Neue Felder müssen den vollständigen Load/Save-Roundtrip überstehen. Unbekannte Assistantfelder nicht einfach in YAML schreiben und anschließend verlieren. |
| Es gibt `FirstRunSetupPane`, `SpaceSetupModal` und Backend-Onboarding für Provider. | Globale Modell-/Provider-Einrichtung und das neue Space-Interview unterscheiden. Bestehende Space-Vorlagen und deren Angaben nicht erneut abfragen. |
| Browserprofile im Renderer und Backendprofile besitzen eigene Identitätsmechanismen. | Eine explizite, überprüfte Zuordnung festlegen. Namen oder zufällig gleiche IDs nicht als Gleichheit voraussetzen. |
| Es gibt Nova-/Space-Governance und bestehende Skills-/SOUL-Dateien. | Vorhandene Identität, Persönlichkeit und Verwaltung nicht ungefragt ersetzen oder durch neue Automationen umgehen. |

Reine UI-Erweiterungen in der großen `App.tsx` reichen nicht. Neue Fachlogik wird in klaren Modulen gekapselt; vorhandene Komposition wird gezielt erweitert. Ein pauschaler Refactor der Browser-Shell ist kein Bestandteil dieses Ziels.

### 21.2 Laufkontext explizit und unveränderlich binden

`web/api/profiles.py` verwendet einen requestbezogenen `ContextVar`, besitzt aber auch globale Profilzustände und einen Cron-Kontext, der unter Lock `SIDEKICK_HOME` sowie Modulpfade verändert. Ein neuer Hintergrundthread darf deshalb nicht auf das aktuell ausgewählte Profil, den aktuellen Space oder ein später verändertes Prozess-Environment vertrauen.

Jeder Lauf erhält einen validierten `RunContext` mit mindestens:

```text
runId, spaceId, backendProfileId, browserProfileId
resolvedSpaceRoot, allowedWorkspaceRoots
assistantProfileRevision, agentDefinitionRevision
providerConfigRef, modelSelection, connectionBindings
effectivePermissions, permissionRevision
runnerGeneration, cancellationToken, resourceLeaseRefs
```

Der Backendprozess löst diese Werte aus authentifizierten serverseitigen Daten auf. Vom Renderer gelieferte Dateipfade, Profilnamen oder Target-IDs sind keine Autorität. Notwendige ContextVars werden explizit gesetzt und nach dem Worker korrekt zurückgesetzt; `copy_context` allein behebt keine Änderungen an `os.environ` oder Modulglobals.

Providerkonfiguration, Modelle, Memory, Browser und sämtliche Tools verwenden den gebundenen Kontext. Für verbleibende unvermeidbare globale Konfigurationen sind isolierte Workerprozesse oder eine enge, dokumentierte Serialisierung nötig. Ein globaler Lock über einen vollständigen Agentenlauf, der während einer Userfreigabe gehalten wird, ist keine akzeptable Lösung. Sind zwei Profile technisch noch nicht sicher parallel ausführbar, zeigt die Queue diesen Engpass ehrlich an; eine falsche Parallelitätsbehauptung ist unzulässig.

### 21.3 Browser-Hosting und Ressourcen konkret auswählen

`space-audio-keepalive.ts` und der Spacewechsel in `App.tsx` erhalten derzeit gezielt angeheftete Tabs mit laufendem Audio. Dieser Mechanismus stellt keine allgemeine Agenten-Lebensdauer bereit und übersteht einen kompletten Renderer-Reload nicht als unabhängiger Browserhost.

Bevorzugte Lösung: Der Main Process betreibt Agenten-Arbeitsziele über einen dedizierten Browserhost, vorzugsweise `WebContentsView` in einem bei Bedarf sichtbaren Hostfenster. Dieser Host nutzt die bestehende autorisierte Space-/Profil-Partition, hält jedoch einen eigenen Arbeits-Tab. Er bleibt bei Spacewechsel und Reload der Shell bestehen. Seine Existenz und sein Verbrauch sind in der Agentenübersicht nachvollziehbar. Beim expliziten Beenden der App endet auch dieser Host; er darf die App nicht unbeabsichtigt verborgen am Leben halten.

Vor Festlegung wird ein kleiner kontrollierter technischer Nachweis erstellt: Laden einer lokalen Testseite, Scope-Zuordnung, minimierter Fortschritt, sichtbare Userübernahme, Renderer-Reload und sauberes Schließen. Die vorhandene Castlabs-Electron-Version und DRM-/Browserfunktionen bleiben erhalten. Es wird keine vollständige Migration aller vorhandenen `<webview>`-Tabs verlangt.

Die Electron-Dokumentation beschreibt `WebContentsView` als Main-Process-View und weist auf die Stabilitätsgrenzen des `<webview>`-Tags hin. Die Architekturentscheidung wird für die tatsächlich installierte Version geprüft: [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [webview](https://www.electronjs.org/docs/latest/api/webview-tag).

Deaktiviertes Hintergrund-Throttling kann seit Electron 28 weitere WebContents im selben Hostfenster betreffen. Deshalb wird nicht angenommen, dass ein Schalter pro Tab die Wirkung automatisch isoliert. Der Arbeitsbrowserhost wird entsprechend abgegrenzt und nach Laufende werden Ressourcen freigegeben: [webContents.setBackgroundThrottling](https://www.electronjs.org/docs/latest/api/web-contents#contentssetbackgroundthrottlingallowed).

Nach Abschluss, Stopp oder Fehler werden nicht benötigte Leases, Debuggerverbindungen, Timer, Eventlistener und Hosts freigegeben. Wartende Userlogins können das zugehörige Ziel mit begrenzter Aufbewahrung erhalten; ein Cleanup löscht dabei keine persistenten Accountcookies. Popup-, Download-, Dialog-, Permission- und externe Protokollpfade benötigen dieselbe Scopebindung.

### 21.4 Tool-Gateway und effektive Autorisierung

Die Isolation gilt für alle ausführbaren Fähigkeiten, nicht nur für die Agentenoberfläche. Allgemeine Browsertools, `browser_cdp`, `Runtime.evaluate`, Netzwerktools, Dateizugriff und Connectoren dürfen keinen alternativen ungeprüften Zugriffspfad öffnen.

Für die erste Umsetzung sind Terminal-/Shell-, allgemeine Desktop- und beliebige Dateisystemtools im Space Assistant standardmäßig deaktiviert. Sie werden nur nach separater tatsächlicher Fähigkeitseinrichtung und passender Autorisierung nutzbar. Ein Browser-Rechercheauftrag braucht diese Rechte nicht.

Mächtige Raw-CDP-Operationen werden über einen begrenzten Gatewaypfad auf den zugeordneten Lease beschränkt oder für diesen Runner ausgeschlossen. Zielauflistung, Cookies, Browserkontexte und JS-Evaluation dürfen keinen Zugriff auf fremde Spaces vermitteln. Ein frei erreichbarer Browser-Debugging-Port wird nicht als sichere Autorisierungsgrenze betrachtet. Bestehende CDP-Opt-ins bleiben respektiert; die Einführung aktiviert keinen globalen Port stillschweigend.

Die effektive Erlaubnis ist der Schnitt von Appregeln, Profilregeln, Space-Bindings, Auftragsautorisierung und aktueller Einzelfreigabe. Eine globale Einstellung „Freigaben aus“ erweitert nicht automatisch eine unautorisierte Space-Aufgabe. Policyänderungen werden unmittelbar vor neuen Aktionen geprüft. Für den Race zwischen Rechteentzug und Aktionsdispatch gibt es eine verbindliche Reihenfolge und Generation-/Revisionsprüfung.

Ein Browserklick oder eine Navigation kann eine schreibende Wirkung haben. Die Bewertung richtet sich nach geplanter Wirkung, nicht allein nach Toolname oder HTTP-Methode. Unklarer Ausgang bleibt im Aktionsjournal erkennbar. Keine generische Behauptung, jede externe Nebenwirkung technisch exakt einmal garantieren zu können.

IPC-Absender und Frameherkunft werden geprüft; eine vom fremden Webseitenframe gesendete Nachricht ist keine Userfreigabe: [Electron IPC-Sicherheit](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages).

### 21.5 Bestätigtes Profil im tatsächlichen Assistant verwenden

Das Space-Profil darf nicht nur gespeichert und angezeigt werden. Ein zentraler Context Builder integriert die bestätigte Profilrevision in neue Gesprächsturns und Agentenläufe des richtigen Scope. Interviewentwürfe und automatische Vermutungen werden nicht als bestätigte Erwartungen behandelt.

Trenne persönliche Arbeitspräferenzen von technisch durchgesetzten Erlaubnissen. „Bitte schreibe knapp“ kann in den Gesprächskontext; „Darf E-Mails senden“ ist eine strukturierte Autorisierungsentscheidung außerhalb frei formulierter Persönlichkeitstexte. Bestehende `SOUL.md`-, Skill- und Memoryinhalte werden nicht aus dem Interview heraus ungefragt überschrieben.

Der User kann Interviewverlauf löschen oder den Assistant zurücksetzen, ohne automatisch Accounts abzumelden, Aufgabenrechte zu erweitern oder Browserdaten zu löschen. Ein vollständiger Reset benennt konkret, welche Profileinstellungen und Aufgaben betroffen sind. Verbindungen und Automationen werden über ihre eigenen überprüfbaren Aktionen entfernt oder deaktiviert.

Die globale Agentenübersicht aggregiert standardmäßig die Spaces des aktuellen authentifizierten Profils. Sie zeigt keine privaten Inhalte anderer Backendprofile. Ein Profilwechsel ist ein Wechsel des Sichtbarkeitsbereichs und keine Kündigung fremder Läufe.

### 21.6 Verbindungen und Fähigkeitserkennung ehrlich darstellen

Modellprovider-Login, API-/OAuth-Connector und Login einer Website sind drei unterschiedliche Verbindungstypen. Ein OAuth-Erfolg beweist weder erfolgreiche Modellinferenz noch funktionierende Accountaktionen. Ein gepinnter Webseitenlink ist keine API-Integration.

Ein überprüfter Fähigkeitskatalog liefert je Eintrag: unterstützte Aufgaben, Verbindungstyp, Iststatus, benötigte Rechte, Space-Zuordnung und Nachweis der Funktionsbereitschaft. Die UI kennzeichnet „nicht konfiguriert“, „verbunden“, „erneut anmelden“, „nicht verfügbar“ und „eingeschränkt“ getrennt. Der Assistant verspricht keine Aufgaben, deren Tool oder Voraussetzung fehlt.

Vor dem ersten LLM-Interview wird transparent, welcher vorhandene Provider die Antworten verarbeitet. Das globale Provider-Onboarding wird nur bei tatsächlichem Bedarf angeboten. Bestehende Space-Modellwahlen werden respektiert; die Einführung setzt sie nicht auf einen unbegründeten Default zurück.

### 21.7 Prüfungen vervollständigen und Abschluss ehrlich halten

Im aktuellen Desktop-Package ist `npm test` auf `vitest` abgebildet; für einen abschließenden nichtinteraktiven Lauf wird `npm run test:run` verwendet und dessen Beziehung zur AGENTS.md-Anforderung dokumentiert. Ein im Watch-Modus wartender Prozess ist kein abgeschlossener Testnachweis.

`compileall` prüft Syntax und ersetzt keine Python-Verhaltenstests. Betroffene Backendtests sind mit dem vorhandenen Pythonruntime und Projekt-Testsetup auszuführen. Die Vorbereitung benennt dafür konkrete Testdateien und Commands; keine pauschale Behauptung, Frontendtests deckten das Backend ab.

Die Browserhost-Architektur, Scope-Isolation und Stopppfade werden früh durch technische Nachweise geprüft, bevor große Oberflächen auf einer unbewiesenen Laufzeitannahme entstehen. Tests enthalten gezielte Fehler und Rennen: Target zerstört, Freigabe widerrufen, verspäteter Toolreply, Profilwechsel, mehrfacher Start und Cursor-Recovery.

Eine praktische lokale Modellinferenz wird ausgeführt, sofern ein funktionsfähiger autorisierter Provider vorhanden ist. Deterministische Testprovider prüfen ansonsten Verträge, werden aber nicht als Nachweis echter Modellinterviewqualität ausgegeben. Fehlt ein Provider, bleibt dieser Abnahmepunkt ausdrücklich offen; unabhängige Implementation und Tests gehen weiter.

Die vollständige Abnahme wird niemals allein durch Dokumentation eines Blockers erreicht. Für jeden offenen Pflichtpunkt werden Ursache, letzter geprüfter Zustand und benötigte nächste Aktion genannt. Ein vorhandener Repositoryfehler wird getrennt von neuen Fehlern ausgewiesen; keine fremden Änderungen zurücksetzen, um die Checks künstlich grün zu machen.

## 22. Fachliche Vorbereitung und überprüfbarer Umsetzungshandoff

Vor Umsetzung erstellt der ausführende Agent `docs/independent-agent-preparation.md`. Das Dokument ist lokaler Arbeitskontext für diese Aufgabe, keine Veränderung globaler persönlicher Codex-Memories. Es enthält:

1. Eine aktuelle Codekarte mit Dateien und Zeilen für Spaceidentität, Profilzuordnung, Providerauflösung, Onboarding, Browserhosting, Toolgates, Swarm, Scheduler, Persistenz und Packaging.
2. Eine Wiederverwendungsentscheidung je Baustein: übernehmen, gezielt erweitern oder begründet ergänzen. Kein zweiter Scheduler, Space Engine oder Freigabespeicher aus Bequemlichkeit.
3. Eine fachliche Wissensbasis aus offiziellen, versionspassenden Dokumentationen zu Electron-Lebenszyklen, Sessionpartitionen, CDP-Zielen, IPC-Sicherheit, Python-ContextVars/Worker-Isolation, Cancellation, atomarer Persistenz und adaptiver Interviewführung. Jedes Thema nennt Quelle, konkrete Bedeutung für Lastbrowser und einen prüfbaren Fehlerfall.
4. Architekturentscheidungen für Browserhost, Run Manager, Scope und Profile, Datenspeicher, Autorisierung, Zeitpläne und Ereigniszustellung samt Alternativen und Entscheidungskriterien.
5. Eine priorisierte Implementation mit konkreten Dateien, Datenverträgen, Migrationen und Abhängigkeiten. Frühe technische Nachweise kommen vor großflächiger UI-Arbeit.
6. Eine Zuordnung A01–A53 zu automatisierten Tests, praktischen Abnahmen und erforderlichen Voraussetzungen, einschließlich Sidekick-Panel und Chatdelegation.
7. Git-Ausgangszustand, vorhandene Benutzeränderungen und aktuelle externe Voraussetzungen ohne Secretwerte.
8. Einen Wiederaufnahmeabschnitt mit erledigten Punkten, nächsten Schritten und noch zu verifizierenden Annahmen.

Vorbereitung ist erst abgeschlossen, wenn entscheidende Architekturfragen konkret beantwortet oder durch eng umrissene technische Nachweise prüfbar gemacht wurden. Eine Liste allgemeiner Fachbegriffe ohne Repositorybezug genügt nicht.

Bei längerer Ausführung aktualisiert der Agent diesen Arbeitskontext nach bedeutenden Entscheidungen und Prüfungen. Nach Kontextkompaktion liest er Spezifikation und Wiederaufnahmeabschnitt und setzt am tatsächlichen Stand fort. Nach Codeänderungen werden veraltete Befunde gekennzeichnet. Planänderungen dürfen die vom User festgelegten Interview- und Hintergrundanforderungen nicht stillschweigend reduzieren.

## 23. Sidekick-Icon als dauerhafte Space-Zentrale

### 23.1 Platzierung und Rolle

Das vorhandene Sidekick-Icon rechts oben öffnet künftig den Space Assistant im vorhandenen rechten Panel. Dort wohnt der dauerhafte Ansprechpartner des aktuell ausgewählten Space. Er kennt das bestätigte Space-Profil, kann den Arbeitsstand erklären und autorisierte Aufträge an Chats oder Agenten übergeben.

Der normale Chatbereich bleibt der Ort, an dem konkrete Arbeitsgespräche, Recherchen und Umsetzungsergebnisse entstehen. Der Space Assistant erhält einen eigenen dauerhaften Steuerungs- und Gesprächsverlauf. Das rechte Panel ist keine zweite Darstellung derselben gerade ausgewählten normalen Chat-Session.

Das Interview verwendet denselben Space Assistant und dieselbe bestätigbare Profilbasis. Für die Ersteinrichtung darf eine größere Ansicht genutzt werden; anschließend ist derselbe Assistant über das Icon erreichbar. Es entsteht keine zusätzliche globale Assistantidentität neben dem eingerichteten Ansprechpartner.

### 23.2 Inhalt des Panels

Das Panel enthält:

- Space-Name und Assistantidentität im Kopf; aktuelle Modellwahl und Funktionsbereitschaft sind nachvollziehbar erreichbar;
- einen eigenen Gesprächsbereich für Wünsche, Rückfragen und Koordination;
- einen kompakten tatsächlichen Aktivitätsüberblick mit aktiven Arbeitschats, Agentenläufen, geplanten Aufgaben und Freigaben;
- direkte Zugänge zu Profil, Verbindungen, Aufgaben und Ergebnissen;
- die Möglichkeit, einen neuen normalen Arbeitschat zu beauftragen oder einen unabhängigen Agenten zu starten;
- Links zum konkreten Arbeitschat bzw. Lauf und wirksame auftragsbezogene Steuerung.

Das Icon darf eine zurückhaltende Zustandsmarkierung für aktive Arbeit oder nötige Useraktion tragen. Farbe oder Animation allein genügt nicht zur Statusvermittlung. Beim Spacewechsel bleibt die Offen/Geschlossen-Präferenz des Panels erhalten; sein Inhalt wechselt zum neuen Scope. Fehler und verspätete Antworten werden nicht dem gerade neu sichtbaren Space zugeschrieben.

### 23.3 Fragen zum Arbeitsstand

Der User kann beispielsweise fragen:

- „Was passiert gerade in diesem Space?“
- „Woran arbeitest du?“
- „Was ist fertig und was wartet auf mich?“
- „Wie weit ist die Recherche?“
- „Welche Aufgabe läuft morgen wieder?“

Dafür liest der Assistant einen serverseitigen Aktivitätssnapshot aus Laufzuständen, Sessionzuordnung und Scheduler. Er nutzt reale IDs, Zeitstempel, letzte Checkpoints und Ergebnisverweise. Er beschreibt keine unbeobachteten Gedanken oder vermeintlichen Fortschritte des Modells. Bei nicht verfügbarem Livezustand wird der letzte Stand samt Zeitpunkt als veraltet gekennzeichnet.

Statusfragen starten keine neue Aufgabe, keinen neuen Chat und keine Automation. Die Überblickskarten funktionieren auch ohne Modellantwort. Der Assistant kann die vorhandenen Fakten sprachlich zusammenfassen; er darf sie nicht durch erfundene Aktivität ergänzen. Zugriff auf andere Spaces erfolgt nur über eine ausdrücklich gewählte Übersicht innerhalb des berechtigten Profils.

### 23.4 Delegation an normale Arbeitschats

Ein konkreter Auftrag wie „Erstelle einen Chat, recherchiere diese drei Anbieter und vergleiche sie“ erzeugt einen normalen Arbeitschat im ursprünglichen Space. Der neue Chat bekommt einen verständlichen Titel und eine erste sichtbare Auftragsnachricht, die Ziel, relevante Angaben, gewünschtes Ergebnis und Grenzen enthält. Das ist eine wirkliche Backend-Session mit vorhandener Chatdarstellung, keine temporäre Nachrichtenliste im Panel.

Der Arbeitschat und die Agentenausführung erhalten einen gemeinsamen `TaskDispatch`. Er verknüpft Ausgangsnachricht, Assistantgespräch, autorisierten Auftrag, Zielchat und gegebenenfalls Run. Ein selbständig laufender Arbeitschat wird über den unabhängigen Runner ausgeführt; die Darstellung im normalen Chatbereich besitzt nicht dessen Lebenszyklus.

Der User sieht im Panel unmittelbar „Auftrag gestartet“ mit einem Link „Arbeitschat öffnen“. Ohne ausdrücklichen Wunsch wird weder der aktuelle Hauptchat gewechselt noch der Space gewechselt. Der User kann weitere Fragen an den Assistant stellen, während der Arbeitschat arbeitet. Ein expliziter Wunsch „öffne den Chat“ öffnet den konkreten Chat bewusst.

Übergaben enthalten das bestätigte Space-Profil und einen auftragsbezogenen Kontextauszug, nicht pauschal sämtliche Interviewantworten, privaten Chats oder offenen Seiten. Anlagen und Seitenkontext werden nur entsprechend der tatsächlichen Auswahl und Berechtigung übergeben. Neue Arbeitschats übernehmen keine weitergehenden Rechte als ihr Dispatch.

Der Assistant darf auf Wunsch auch nur einen Chat vorbereiten, ohne die Ausführung zu starten. „Kannst du so etwas machen?“ oder eine Statusfrage ist keine automatische Startautorisierung. Ein klarer Ausführungsauftrag reicht innerhalb bereits eingerichteter Rechte aus; es wird kein redundanter Bestätigungsdialog vor jeder reversiblen Aufgabe verlangt. Noch fehlende Zugriffe oder risikobehaftete externe Aktionen bleiben konkret freigabepflichtig.

### 23.5 Agenten lossenden und Ergebnisse zurückführen

Der User kann Aufgaben als einmaligen unabhängigen Agentenlauf oder als bewusst eingerichtete wiederkehrende Aufgabe delegieren. Bei umfangreichen Aufträgen kann der Assistant sinnvolle Teilaufgaben vorschlagen. Weitere Agenten entstehen nur innerhalb des ausdrücklich autorisierten Umfangs und der zentralen Ressourcenlimits.

Ein Run darf nicht selbst unbegrenzt weitere Runs oder Chats erzeugen. Delegationstiefe und Gesamtbudget sind begrenzt; standardmäßig delegiert der Space Assistant an eine Ausführungsebene. Eine neue untergeordnete Ebene erfordert eine konkret erlaubte Aufgabenstruktur. Wiederkehrende Läufe erzeugen nicht bei jedem Termin einen unkontrollierten Chatwald; standardmäßig verwenden sie einen zugeordneten Aufgabenverlauf mit getrennten Run-Ergebnissen.

Ergebnisse bleiben vollständig im Arbeitschat bzw. Lauf verfügbar. Der Assistant bekommt eine kurze faktische Rückmeldung mit Verweis, Abschlussstatus und nötiger Useraktion. Ereignisse werden dedupliziert. Aus einem Ergebnis entsteht nicht automatisch der nächste Auftrag, solange dies nicht Teil der bestätigten Aufgabenstruktur ist.

„Stoppe diesen Auftrag“, „Pausiere die Recherche“ oder die entsprechenden Buttons beziehen sich auf eine erkennbare Dispatch-/Run-ID. Bei unklarer Referenz und mehreren Kandidaten wird der konkrete Auftrag geklärt. „Stoppe alle Aufgaben in diesem Space“ gilt nur für den benannten Space. Ein Panel-Schließen oder ein neuer Assistantchat ist kein Stoppbefehl.

### 23.6 Konkreter Integrationseingriff im aktuellen Code

Bei der Nachprüfung am 3. Oktober 2026 wurde gefunden:

- `HeaderComponents.tsx` besitzt den vorhandenen `copilot-toggle-btn` und `onToggleCopilot`.
- `App.tsx` rendert `CopilotSplitView` mit `chatMessages`, `sidekickBusy`, `activeSessionId`, `startNativeChat` und `stopNativeChat` aus dem normalen Chatfluss.
- `useChatStore.ts` verwaltet die ausgewählte normale Session und deren gemeinsamen Streaming-/Composerzustand.
- `usePanelStore.ts` verwaltet Öffnen/Schließen des rechten Panels.

Der bestehende Toggle und Panelrahmen werden weiterverwendet. Die aktuelle gemeinsame Nachrichten- und Laufbindung wird fachlich getrennt: eigener Assistant-Store bzw. scoped Sessioncontroller, eigene Busy-/Request-IDs und separate Run-Abonnements. Ein Assistantaufruf darf nicht `stopNativeChat` auf einen unabhängigen Arbeitschat anwenden oder dessen `activeSessionId` überschreiben.

Vorhandene normale Chats behalten ihre IDs, Inhalte und Auffindbarkeit. Die Umstellung führt keine automatische Konvertierung des bisherigen ausgewählten Chats zum Assistantverlauf durch. Seitenzusammenfassung und Auswahlfragen können weiter als ausdrücklich angeforderte Fähigkeiten des Space Assistant angeboten werden.

Die Backendverträge werden um Scope-Aktivitätssnapshot, Assistantgespräch und idempotente Chat-/Rundelegation ergänzt. Rechteprüfung und Session-/Run-Erstellung bilden einen konsistenten Ablauf: Ein Fehler zwischen Chat-Erstellung und Runstart wird nachvollziehbar als vorbereitet oder fehlgeschlagen gespeichert, ohne doppelte Chats bei einem Retry. Events, Auftragsverknüpfungen und Ergebnisse müssen auch nach Reload oder Spacewechsel wiederaufgebaut werden können.

### 23.7 Abnahmepflicht

Die Umstellung des vorhandenen Icons und Panels ist Teil des Gesamtziels. Eine neue separate Agentenseite ohne Integration des Space Assistant hinter dem Icon erfüllt die Benutzeranforderung nicht. A41–A53 werden zusätzlich zu den bisherigen Kriterien geprüft; Chatdelegation, parallele Assistantkommunikation und Spacewechsel werden in der laufenden App mit einem kontrollierten Arbeitsauftrag praktisch nachgewiesen.

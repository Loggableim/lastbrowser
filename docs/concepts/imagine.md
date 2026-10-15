# Imagine / lokale Bilder der Sidekicks

Status: Konzept. Keine Umsetzung, nicht in der App, nicht im beta.10-Gate.

Zwei zusammengehörige Ideen. Sie teilen sich eine lokale Bild-Engine und eine Queue. Gebaut wird hier nichts.

## 1. Sidekicks erzeugen Bilder im Chat

Ist eine lokale Bild-Engine installiert, können die Sidekicks sie von sich aus benutzen. Der Nutzer bestellt ein Bild im Chat, im Quickchat oder im Standard-Chat, in normalen Worten. Der Sidekick formuliert daraus den Auftrag an die Engine. Er findet die Engine nicht, bleibt der Chat beim Text. Es gibt keinen stillen Cloud-Ersatz.

Der Chat im Vordergrund hat immer Vorrang. Ein Bildauftrag aus dem sichtbaren Chat startet, sobald die Engine frei ist. Aufträge aus Chats, die gerade nicht sichtbar sind, reihen sich dahinter ein. Wechselt der Nutzer den Chat, wird der neue Vordergrund-Auftrag der nächste. Der unterbrochene Auftrag bleibt in der Queue, der Prompt geht nicht verloren. Es läuft immer nur ein Bildauftrag. Die Engine wird nicht von zwei Chats gleichzeitig belegt.

Der Sidekick sagt im Chat, dass das Bild in Arbeit ist oder wartet. Das fertige Bild erscheint in derselben Unterhaltung. Der Warte-Satz der Latenz-Überbrückung ist ein anderes Konzept und wird hier nicht verwendet.

## 2. Plugin Imagine

Imagine ist ein eigenes One-Page-Werkzeug im Extensions- und Plugin-Hub.

- Ein Eintrag unter „Developer and system tools“ und unter „Browser utilities“.
- Ein eigener Reiter „Plugins“, neben den heutigen Reitern für Erweiterungen und Skills. Imagine liegt auf diesem Reiter, nicht zwischen den Chrome-Erweiterungen.

Die Seite hat eine Fläche. Der Nutzer wählt eine Prompt-Vorlage oder schreibt eine eigene Idee. Darunter stehen nur die Einstellungen, die die erkannte Engine wirklich anbietet, zum Beispiel Größe, Schritte oder Seed. Eine Engine ohne diese Schalter zeigt sie nicht. Erzeugen schickt denselben Auftrag in dieselbe Queue wie der Chat. Der Vordergrund-Chat bleibt vorrangig. Imagine zeigt den Platz in der Queue und das fertige Bild auf derselben Seite.

## Ablauf

1. LastBrowser erkennt beim Start und beim Öffnen von Chat oder Imagine, ob eine lokale Bild-Engine da ist.
2. Der Nutzer bestellt ein Bild im Chat oder in Imagine.
3. Der Auftrag kommt in die Queue. Vordergrund vor Hintergrund. Imagine zählt nicht als Vordergrund-Chat.
4. Die Engine rechnet einen Auftrag. Der Sidekick oder Imagine zeigt Fortschritt.
5. Das Bild kommt zurück in den Chat oder auf die Imagine-Seite. Schlägt der Auftrag fehl, bleibt der Textauftrag erhalten und der Nutzer kann ihn wiederholen.

## Prioritäts-Queue

| Herkunft | Platz |
| :--- | :--- |
| Sichtbarer Chat, neuer Auftrag | Als Nächstes, vor allen wartenden Hintergrund-Aufträgen |
| Sichtbarer Chat, schon laufend | Läuft zu Ende, wird nicht abgebrochen |
| Chat im Hintergrund | Hinten, in der Reihenfolge des Absendens |
| Imagine | Wie ein Hintergrund-Auftrag, solange ein Chat vorn ist |

Ein Wechsel des sichtbaren Chats sortiert die Queue neu. Laufende Rechnung wird nicht abgebrochen. Es gibt keine zweite Engine und keine parallelen Bilder.

## Engine-Erkennung

Erkannt wird nur eine lokale Engine, die LastBrowser schon als Bildmodell ausführen kann oder die der Nutzer lokal gestartet hat. Kein Netzwerk-Dienst, kein Konto, kein automatischer Download. Fehlt die Engine, sind die Bildaktion im Chat und der Imagine-Knopf sichtbar, aber sie erklären, dass noch keine lokale Bild-Engine installiert ist. Sie starten nichts.

Welche konkreten Engines in der ersten Umsetzung zählen, ist unten offen. Das Konzept bindet sich nicht an einen Modellnamen.

## UI-Skizze

Chat, wenn eine Engine da ist:

- Neben dem Eingabefeld bleibt der normale Versand. Ein Bildwunsch im Satz reicht.
- Unter der Antwort: Status „wartet“ oder „erzeugt“, dann das Bild.

Chat, wenn keine Engine da ist:

- Der Sidekick antwortet mit Text und sagt, dass lokal kein Bildmodell bereitsteht.

Imagine, eine Seite:

- Oben: Vorlagen als kurze Karten, dazu ein freies Promptfeld.
- Mitte: nur die Schalter der erkannten Engine.
- Unten: „Erzeugen“, der Queue-Platz, das Ergebnis.

Hub:

- Reiter Plugins.
- Imagine als Karte unter Developer and system tools und unter Browser utilities. Beide Wege öffnen dieselbe Seite.

## Feature-Vote

Zwei Einträge, noch nicht auf den Roadmap-Seiten:

- ID: `sidekick-local-images`
- Label: Lokale Bilder durch Sidekicks

- ID: `imagine-plugin`
- Label: Plugin Imagine

Die IDs stehen in `lastbrowser.com/assets/js/roadmap-catalog.js`. Die übersetzten Roadmap-Seiten bekommen sie erst, wenn das Konzept angenommen ist.

## Offene Fragen

- Welche installierten Engines gelten als erkannt, und woran erkennt man sie ohne einen Download anzustoßen?
- Darf ein Vordergrund-Auftrag einen laufenden Hintergrund-Auftrag nach einem festen Punkt anhalten, oder nur vorziehen, wenn die Engine frei wird?
- Wo liegt das Bild danach: nur im Chat, oder auch in einer späteren Medienbibliothek des Space?
- Welche Vorlagen liefert LastBrowser mit, und darf der Nutzer eigene Vorlagen speichern?
- Gelten dieselben lokalen Grenzen für Inhalte wie beim Textmodell, oder braucht Imagine eine eigene, lokale Schranke?

## Nicht in diesem Schritt

Keine Engine, keine Queue, keine Hub-Reiter, keine Settings, kein beta.10.

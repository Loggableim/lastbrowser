# VolksAI / LastBrowser Pool

Status: Konzept. Keine Umsetzung, kein beta.10, nicht in der App.

## Ziel

LastBrowser-Nutzer können ein lokales Modell aus Ollama, llama.cpp oder LM Studio in den Einstellungen mit „Add to pool“ freigeben. Ein Vermittlungsserver, zum Beispiel bei Cloudflare, bringt Anfragen und freie Hosts zusammen. Die Rechnung läuft auf dem Host. Der Vermittler speichert den Prompt nicht und kann ihn nicht lesen.

## Rollen

- Nutzer schickt eine Anfrage und wählt die höchste Vertrauensstufe, die dafür erlaubt ist.
- Host stellt ein Modell und Rechenzeit bereit und sieht den Prompt, weil das Modell ihn verarbeiten muss.
- Vermittler kennt nur das Nötigste zum Verbinden: dass eine Anfrage einer Stufe wartet und welcher Host frei ist. Nicht den Inhalt.

## Vertrauensstufen

1. Eigene Geräte. Nur Maschinen desselben Kontos.
2. Freunde und Team. Einladung, kein öffentlicher Beitritt.
3. Verifizierte Hosts. LastBrowser hat den Host geprüft. Die Prüfung ist ein späterer Schritt und hier nicht festgelegt.
4. Public Pool. Jeder freigegebene Host dieser Stufe.

Eine Anfrage darf nur auf einer Stufe landen, die der Nutzer freigegeben hat. Sensible Inhalte, etwa Zugangsdaten, private Dokumente und als vertraulich markierter Space-Kontext, gehen nie in Stufe 4. Das sagt die Oberfläche vor dem Senden in Klartext: der Host sieht den Prompt, der Vermittler nicht.

Innerhalb eines privaten Organisations-Pools (nächster Abschnitt) gelten zuerst die Regeln der Organisation. Nach außen zählt der Pool als eine Gruppe, deren Stufe der Admin festlegt.

## Private Organisations-Pools

Eine Schule, eine Uni oder eine Firma kann einen eigenen Worker-Pool betreiben. Rechner der Organisation stellen Modelle bereit, der Pool ist über eine eigene API-URL erreichbar. Diese URL tritt für die Mitglieder an die Stelle des öffentlichen Vermittlers. Die Prompts bleiben im eigenen Netz, solange der Pool geschlossen bleibt.

Admins der Organisation legen fest, wer beitreten darf: Mitgliederverwaltung mit Rollen, zum Beispiel wer Rechenzeit beisteuert, wer Anfragen stellt und wer den Pool verwaltet. Der Beitritt läuft per Einladung, kein offener Beitritt von außen.

Ein solcher Pool hat zwei Betriebsarten:

- Geschlossen. Nur Mitglieder der Organisation. Keine Verbindung nach außen, Anfragen verlassen das Netz nicht.
- Föderiert. Der Pool hängt sich an den großen Pool an. Regeln der Organisation legen fest, was hinausgehen darf: welche Modelle, welche Vertrauensstufe, welche Inhaltsklassen. Was die Regeln nicht erlauben, bleibt lokal.

Im geschlossenen Fall ist die Organisation selbst der Vermittler. Im föderierten Fall entscheidet der Admin zusätzlich, ob nur ausgehende oder auch eingehende Jobs erlaubt sind. Eingehende Jobs eines fremden Nutzers sehen den Prompt wie jeder andere Host, der Vermittler nicht.

## Transport

Die Nutzlast ist Ende-zu-Ende verschlüsselt zwischen Nutzer und Host. Der Vermittler leitet nur zu und sieht den Klartext nicht. Metadaten für die Vermittlung bleiben klein: Stufe, Modellname, ungefähre Länge, keine Prompt-Kopie.

In einem geschlossenen Organisations-Pool ist die Organisation selbst der Vermittler, die Ende-zu-Ende-Verschlüsselung bleibt gleich. Im föderierten Fall sitzt zwischen Organisation und großem Pool ein weiterer Übergang, der die Regeln der Organisation durchsetzt.

## Ausgleich

Wer Rechenzeit teilt, bekommt Credits. Wer keine GPU hat, kann mit CPU-Arbeit zahlen: Tests, Benchmarks, Embeddings. Alternativ gibt es ein Gratis-Kontingent mit Warteschlange. Credits sind ein Buchhaltungswert in LastBrowser, kein Anspruch auf Auszahlung.

## Missbrauch und Qualität

Stichproben prüfen, ob ein Host das genannte Modell liefert und nicht nur eine leere oder fremde Antwort. Rate-Limits begrenzen Anfragen und freigegebene Jobs pro Host. Wiederholt schlechte Stichproben verlieren die Stufe, bis jemand nachsieht. Das Konzept legt keine konkreten Grenzwerte fest.

## Haftung

Der Host ist für das verantwortlich, was auf seiner Maschine ankommt und welche Antwort sie erzeugt. LastBrowser betreibt die Vermittlung und die Stufenregeln, nicht die Rechnung des Modells. Ein Public-Pool-Host ist kein LastBrowser-Mitarbeiter. Die genauen Vertragstexte gehören in eine spätere rechtliche Prüfung, nicht in diese Skizze.

## Vergleich

- AI Horde verteilt Bild- und Textjobs auf freiwillige Worker und verrechnet Beitrag mit einem Punktekonto. Worker sehen die Aufträge.
- Petals verteilt große Modelle über viele freiwillige Rechner, indem Schichten bei verschiedenen Teilnehmern liegen.
- Exo bündelt vor allem eigene Geräte zu einem lokalen Cluster.
- NVIDIA PAIR (Personal AI Router) verbindet Ollama, llama.cpp und LM Studio auf explizit gekoppelten Geräten im eigenen Netz. Eine Anfrage läuft ganz auf einem Gerät. Kopplung ist gegenseitig, Verkehr zwischen Geräten ist verschlüsselt. Ein öffentlicher Pool und eine Credit-Abrechnung sind dort nicht das Modell.

Der LastBrowser-Pool übernimmt von PAIR die Idee „ein lokales Modell, eine ganze Anfrage, ein gewählter Host“. Von Horde die freiwillige Stufe und das Punktekonto. Er teilt ein Modell nicht wie Petals auf mehrere Unbekannte auf. Der private Organisations-Pool überträgt die PAIR-Idee von gekoppelten Geräten auf eine ganze Organisation mit eigener API-URL und optionaler Föderation.

## Auto-Router

Später kann der Pool ein weiterer Provider im OpenCode-Auto-Router sein. Der Router darf ihn nur wählen, wenn die Vertrauensstufe der Anfrage das erlaubt. Sensibles bleibt bei eigenen Geräten oder beim Team. Diese Anbindung ist nicht Teil dieses Papiers und nicht gebaut.

## Feature-Vote

Vorgeschlagener Eintrag, noch nicht auf den Roadmap-Seiten:

- ID: `volksai-pool`
- Label: VolksAI / LastBrowser Pool

Die ID steht in `lastbrowser.com/assets/js/roadmap-catalog.js`. Die übersetzten Roadmap-Seiten bekommen sie erst, wenn das Konzept angenommen ist.

## Nicht in diesem Schritt

Kein Server, keine Settings-Schaltfläche, kein Verschlüsselungsprototyp, keine Credit-Buchhaltung, kein beta.10. Auch kein zweiter Vermittler, keine Mitgliederverwaltung und keine Föderationsregeln.

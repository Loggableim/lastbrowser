# 0.1.57-beta.6: Chat, Settings und Installer

Direkte Nutzeraufträge vom 14. Oktober 2026. Ausgangsstand beta.5: `bfb4d25d7ef662b2f61f111317bb5056f0515374`.

## Chat als erste Priorität

Quickchat startet im begrenzten Chat-Pool. Vor der HTTP-Startbestätigung werden Scope, Binding, Policy und Writer reserviert; Katalog- und Providerarbeit läuft anschließend im Stream-Worker. Vollständige Provider-Capture bleibt vor jedem SDK-Aufruf verpflichtend. Quickchat bleibt beim kurzen direkten Persönlichkeitsprompt und nutzt keinen Agent-/MCP-/Skills-/Memory-Prozess.

Ein fehlendes oder aufgegebenes ACK bereinigt die Reservierung. Katalog-Wartevorgänge sind pro Chat abbrechbar; gemeinsame Discovery wird dadurch nicht abgebrochen. Exakt gebundene Katalogbelege werden 120 Sekunden wiederverwendet, weiterhin mit allen Credential-, Evidence-, Konfigurations-, Space- und Binding-Prüfungen. Cancel/Pause und Exitbestätigung vertragen ausschließlich das identische Owner-Upgrade von noch fehlender zu vollständig geprüfter Provider-Capture; Approval-/Clarify-Ownership bleibt strikt.

Eigene Nachrichten und das Leeren der Eingabe erfolgen vor asynchroner Vorarbeit. Weitere Nachrichten bleiben während des Start-ACK möglich und werden als Steer mit serialisiertem Stop/Start verarbeitet. Späte ACKs überschreiben keine neueren Entwürfe. Standardchat-Snapshots überschreiben keine während der Vorbereitung angezeigten Nachrichten.

## Settings und lokaler Model Store

Der adaptive Settings-Reiterstreifen wird immer nach intrinsischer Breite gemessen. Die frühere Flexbreite unterschied sich zwischen sichtbarem und verstecktem Zustand und verursachte ständige Moduswechsel. Eine kleine Umschaltschwelle und Fokusübergabe stabilisieren Tabs/Dropdown. Eingaben, Auswahlfelder und Fokusmarkierungen werden über die paginierten Settingsbereiche einheitlich gestaltet; bestehende Werte und gemountete Formulare bleiben erhalten.

Der Model Store bietet Store, Installiert, Mein PC, Downloads/Ergebnisse und lokalen Chat als getrennte Bereiche. Kategorien, lokale Kategorieillustrationen, vollständige Modellnamen, Ressourcen und direkte Installieren-/Entfernen-Aktionen bilden die Produktkarten. Katalogseiten und vier Detailreiter ersetzen lange Informationsstapel. Karten bleiben im äußeren Settings-Pager atomar, damit Informationen und Installationsaktion zusammenbleiben. Keine erfundenen Ratings oder fremden Bildabrufe. Scope-, Scan-, Lizenz- und Installationsgates bleiben erhalten.

## Installer

Die Installationsseite folgt den Maßen der freigegebenen Variante „Sidekick“: 690px Entwurfsbreite, 100px Nova, Segoe UI, zweizeilige Überschrift/Beschreibung, 390px Fortschritt und eigener Footer. Koordinaten skalieren mit Fenster-DPI. Der alte leere Zurück-Button wird aus der Szene entfernt. Fortschritt bleibt der echte NSIS-Fortschritt, keine simulierten Prozentangaben.

## Nachweise und Grenzen

Drei Subagenten bearbeiteten Backend, Renderer/Store und unabhängigen Source-Review; keine verbleibenden konkreten Blocker im geprüften Chat-Diff. Python-Syntax und Renderer-Typecheck wurden geprüft. NSIS-Callback kompiliert mit Warnungen als Fehler. Der integrierte Desktop-Build und das fertige Paket werden zusätzlich separat belegt.

Keine neuen Tests, Provideraufrufe, Modellinstallationen, VM-Läufe, Signierung oder Veröffentlichung gemäß bestehender Nutzeranweisung. Antwortzeiten, sichtbares Layout und Verhalten im Benutzerprofil sind damit noch nicht bestätigt. Die Produktionsabhängigkeitsprüfung aus beta.5 bleibt verpflichtend; ein Build ohne seine benötigten JavaScript-Pakete bricht ab.

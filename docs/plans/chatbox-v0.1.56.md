# Chatbox-Zielbild v0.1.56

Status: Umsetzung als separater Draft-PR; spätere Integration. Diese Änderung gehört nicht zu v0.1.55 und ist weder Merge- noch Releasefreigabe.

## Freigegebene Gestaltung

- Normalmodus: **Kompakte Werkzeugleiste**. Action/Plan und der profilgebundene Modellpicker stehen über einem großzügigen Eingabefeld. Darunter liegen Tabs, weitere Optionen und Senden/Stoppen.
- Zenmodus: **Ruhige Schreibfläche**. Das Eingabefeld steht zuerst; eine dezente Werkzeugzeile hält Modus, Tabs, Modell, weitere Optionen und Senden/Stoppen erreichbar.
- Das vorhandene Sidekick-Bild wird klein wiederverwendet. Flächen und Akzente stammen aus den bestehenden Theme-Tokens, mit klaren Abständen und leicht gerundeten Ecken.
- Seltene Optionen stehen unter „Weitere“: Modellliste, Qualifikationshinweis, Reasoning und Profil-/Workspace-Kontext. Die doppelte sichtbare Reasoning-Beschriftung entfällt. Der tatsächliche Qualifikationsstatus bleibt erreichbar; „Beta“ wird nicht als zweite dauerhafte Modellanzeige gezeigt.
- Der Zenwechsel ist eine reine Darstellung des bestehenden Composer-Zustands. Entwurf, Modus, Modell, Reasoning und Tabs-Kontext dürfen sich dadurch nicht ändern. Tastaturbedienung, sichtbarer Fokus, schmale Fenster und reduzierte Bewegung bleiben berücksichtigt.

## Abgrenzung und Bestand

Die bestehende Chat-Logik und die von v0.1.55 bearbeitete Modell-Discovery bleiben in `NativeChatMain.tsx`; die Chatbox verwendet deren Props und Callbacks. PR #65 für Qualification/Cancel-Persistenz ist ein unabhängiger Reviewpfad. Die Startseite in PR #62 und der Modellkatalogplan in PR #57 bleiben separat. Sidebar, Topbar und Einstellungen werden nicht gestaltet.

Der bestehende native Composer bietet keinen Datei-Anhang-Callback und keine transportierte Datei-Payload. „Anhängen“ aus der Designreferenz bleibt daher ein offener Funktionspunkt für einen eigenen Vertrag und wird in diesem PR nicht als funktionsloser Button ausgegeben. Der bestehende Slash-Befehlsknopf und `@tabs` bleiben erhalten.

## Abnahme

1. Eigener UI-Fixture zeigt Normal- und Zenmodus bei breitem und schmalem Fenster; kein Überlauf, Fokus sichtbar und „Weitere“ per Tastatur erreichbar.
2. Zenwechsel erhält einen bereits getippten Entwurf und die kontrollierten Modus-, Modell- und Reasoning-Werte.
3. Senden/Stoppen, Modellwahl, manuelle Modellliste, Reasoning, Slash-Befehle und Tabs-Kontext bleiben zugänglich; UI-Änderungen behaupten keine neue Backendfähigkeit.
4. Source-Gates nach `AGENTS.md` werden auf dem exakten Head protokolliert. Ein Fixture-Screenshot ist Mock/UI-Evidenz, kein installierter App-, VM- oder Provider-Nachweis.

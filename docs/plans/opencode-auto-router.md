# OpenCode Auto-Router (Prototyp)

Eigener Strang. Nicht Teil des beta.10-Gates. Standard aus.

## Verhalten

Die erste Eingabe im Auto-Modus startet zwei Gratis-Spuren von OpenCode, nur wenn `LASTBROWSER_OPENCODE_AUTO_ROUTER=1` oder `localStorage['lastbrowser.opencodeAutoRouter.v1']==='1'`.

1. Das schnelle Gratis-Modell ist `opencode/cat-jam-free` (Box-Benchmark: Median 4,5 s, p90 7,3 s, Einstufung 70 %, JSON 100 %). Ersatz ist `opencode/space-bunny-free`, danach `opencode-go/cat-jam-free`.
2. Eine komplexe Frage geht nur dann an ein anderes Gratis-Modell, wenn der Katalog eines enthält, das nicht selbst das Schnellmodell ist. `opencode-go/deepseek-v4.1-flash` bleibt aus, bis Cid es freigibt.

Die Klasse ist Heuristik plus Modellurteil. Die Heuristik zählt Länge, Code, Schlüsselwörter und Seitenkontext. Ein fehlendes Modellurteil lässt die Heuristik stehen. `complex`, `uncertain` oder Widerspruch wird komplex.

Nicht im Default: `opencode/deepseek-v4.1-flash-free` (Timeouts), `muse-spark` (unter Last instabil), Bezahlvarianten unter `opencode/*`.

| Signal | Wirkung |
| --- | --- |
| Text über 600 Zeichen | komplex |
| Code (Fence, `function`, `class`, `import`, `def`) | komplex |
| Schlüsselwörter (refactor, debug, implement, architecture, migration, stacktrace, compare, analysiere, architektur, beweis, schritt) | komplex |
| Seitenkontext über 1500 Zeichen | komplex |
| sonst | einfach, Score aus Textlänge |

Einfach: nur die Scout-Spur antwortet, die starke Spur startet nicht. Komplex: die starke Spur setzt denselben Text fort. Der Transcript bleibt eine Blase. Beginnt die starke Antwort mit dem Scout-Text, ersetzt sie ihn. Sonst wird sie angehängt. Eine zweite Antwort daneben gibt es nicht.

Bezahlte Provider kommen in keine Spur. Fehlt ein zweites Gratis-Modell, bleibt auch eine komplexe Frage bei der Scout-Spur.

## Messung

Dieselbe Frage, Quickchat und Standard-Chat, Auto gegen ein fest gewähltes Modell. Zeit bis zum ersten gestreamten Wort. Der Prototyp liefert Klasse, Score und Gründe synchron, bevor ein Token kommt. Die Live-Matrix misst Anker, sobald das Flag in einem Build steht. Sie zählt nicht ins beta.10-Gate.

## Code

`apps/desktop/src/renderer/opencode-auto-router.ts`

Der Nutzer stellt die Reihenfolge unter Einstellungen → Router ein, sichtbar nur mit dem Prototyp-Flag. Auto-Routing ist dort standardmäßig an und per Schalter aus. Bezahlte Modelle stehen in Advanced settings mit Preis, kommen aber nicht in die automatische Reihenfolge. „Benchmark erneut ausführen“ misst die gewählten Gratis-Modelle am lokalen Fragenset und übernimmt den Vorschlag mit einem Klick. Die Tempo-Werte bleiben die Box-Messung, bis Felix die Rohdatei `results.csv` einspielt.

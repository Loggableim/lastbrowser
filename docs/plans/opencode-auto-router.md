# OpenCode Auto-Router (Prototyp)

Eigener Strang. Nicht Teil des beta.10-Gates. Standard aus.

## Verhalten

Die erste Eingabe im Auto-Modus startet zwei Gratis-Spuren von OpenCode, nur wenn `LASTBROWSER_OPENCODE_AUTO_ROUTER=1` oder `localStorage['lastbrowser.opencodeAutoRouter.v1']==='1'`.

1. Ein schnelles Gratis-Modell (`glm-5.3-flash`, sonst `deepseek-v4.1-flash`) streamt sofort eine kurze Einordnung.
2. Parallel wählt der Router ein stärkeres Gratis-Modell (`deepseek-v4.1-flash`, wenn es nicht schon die Scout-Spur ist).

Die Klasse steht vorher per Heuristik fest, damit sie ohne Modellantwort messbar ist:

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

Der laufende Quickchat und der Standard-Chat rufen den Planer auf, wenn `LASTBROWSER_OPENCODE_AUTO_ROUTER=1` oder `localStorage['lastbrowser.opencodeAutoRouter.v1']==='1'`. Ein expliziter Quickchat-Favorit bleibt. Sonst geht die erste Anfrage an das Scout-Modell. Pro Turn schreibt die Konsole eine Zeile `OPENCODE_AUTO_ROUTER` mit Spur, Modell, Klasse, `ttftScoutMs` und `handoffMs`.

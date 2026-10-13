# B7CA38BD — zusätzliche Design- und Layoutprüfungen

2026-10-08, ca. 10:24–10:30 America/Los_Angeles / 17:24–17:30 UTC. Direkter Nutzerauftrag: erneut nach neuem Paket suchen, andernfalls andere offene Tests durchführen. Order-Zweig blieb `871832b60035417c90cb8da583b2152d16f47782`; neuestes veröffentlichtes Paket weiterhin B7CA38BD. Keine neue Version behauptet.

Kandidat: lokal installiertes LastBrowser 0.1.48, Source `b7ca38bd6db7b8a6e5fd814bd322b4916f561e73`, Tree `30f2deb9301b12cf8908e6acd633893b64caa00d`. Installierter ASAR erneut geprüft: `a196a883890cd33a68b0b02fdfb8f2cc8bf608e94fbf96b16e57578cb69b408b` (64092071 Bytes). Setup-Pin aus der Installation: `c84618cd6da1f10010f445d443d39eb604c4dd489b41376a1c55928edad97c95`. Normales synthetisches VM-Profil/Space `VM-UI-046-LLM`; keine Credentials, keine Providerturns, Kosten 0. Windows 11 Enterprise Evaluation, Build 26300. Computer Use über den bereits gelesenen Windows-Skill und `@oai/sky`; keine Produktdateien repariert.

## Ergebnisse

| Fall | Status | Observed / Expected |
|---|---|---|
| `B7_DESIGN_FONT_EXTRA_LARGE`, rev1 | PASS, sichtbare Wirkung | Appearance → Extra large: Settings-Texte und Text im rechten Fehlerpanel wurden größer. Keine pauschale Aussage, dass sämtliche Browser-/Webseiten-Texte skalieren. |
| `B7_DESIGN_FONT_SMALL`, rev1 | PASS, sichtbare Wirkung | Small: Settings-/Paneltexte wurden kleiner. Default anschließend wiederhergestellt. |
| `B7_DESIGN_FONT_LABEL_LAYOUT`, rev1 | FAIL | Bei 1920×1032 mit geöffnetem rechten Panel waren Small, Default und Large in den Auswahlkarten stark gebrochen (`Sma/ll`, `Defau/lt`, `Larg/e`); auch bei kleiner Schrift. Erwartet gut lesbare Beschriftungen, ohne unnatürliche Wortzerlegung. |
| `B7_DESIGN_ACCENT_MATRIX`, rev1 | PASS, begrenzt | Matrix ausgewählt: u.a. Zoom-Regler und Statuspunkt wurden grün; Auswahl wechselte. Andere Bedienelemente blieben cyan. Keine vollständige Farb-/Kontrastabnahme daraus abgeleitet. Default wiederhergestellt. |
| `B7_DESIGN_THEME_LIGHT_DARK`, rev1 | PASS, sichtbare Wirkung | Bei 1100×920 Light aktiviert: Settings-Flächen wurden hell und Text dunkel. Sidebar blieb dunkel. Dark zurückgesetzt, Settings wieder dunkel. |
| `B7_DESIGN_NARROW_WITH_RIGHT_PANEL`, rev1 | FAIL | Fenster von maximiert 1920×1032 auf 1440×920 wiederhergestellt, dann über rechten Rahmen auf 1100×920 verkleinert. Mit rechtem Panel offen blieb für den Appearance-Inhalt nur ein schmaler Streifen; Karten, Titel, Optionen wurden horizontal abgeschnitten. Erwartet erreichbarer, lesbarer Settings-Inhalt. |
| `B7_DESIGN_NARROW_PANEL_CLOSED`, rev1 | PASS, begrenzt | Rechtes Panel via Close geschlossen. Bei gleicher 1100-Pixel-Breite waren Theme-/Palettenkarten wieder lesbar und bedienbar. Kein PASS für Layout mit offenem Panel. |
| `B7_MODEL_ASSISTANT` schmale Composer-/Tastaturprüfung, rev1 | BLOCKED | Rechtes Panel zeigte weiterhin den bereits gemeldeten Profilreferenzfehler und keinen normalen Composer. Nur das tatsächliche Layout dieses Fehlerpanels untersucht; keine erfolgreiche Assistant-Bedienung behauptet. |
| Design-Persistenz nach vollständigem App-Neustart | NOT_TESTED | Ctrl+R betätigt, Auswahl blieb sichtbar. Ein tatsächlicher Reload der Shell wurde nicht unabhängig belegt; Ctrl+R kann den Browserkontext betreffen. Kein Neustart-/Speicher-PASS aus dieser Beobachtung abgeleitet. |
| Custom-Color, Large-Zwischenstufe, übrige Themes, Zoom pro Domain, Message-Layout, Blur/Density | NOT_TESTED | Nicht Teil dieser abgeschlossenen Teilserie. Kein Anspruch vollständiger Design-Abnahme. |

## Schritte / Belege

Bereinigte Screenshots unter [evidence/b7-design-20261008](evidence/b7-design-20261008/):

1. `01-default-appearance.png`: Ausgangswerte Default-Schrift, Default-Palette, Seitenzoom 100%; rechter Fehlerbereich geöffnet.
2. `02-extra-large-font.png`: Extra large ausgewählt, sichtbare Vergrößerung.
3. `03-matrix-font-extra-large.png`: Matrix ausgewählt, grüne Akzente bei großer Schrift.
4. `04-after-control-r.png`: Zustand nach Ctrl+R; kein Beleg eines vollständigen Shell-Neustarts.
5. `05-small-font.png`: Small ausgewählt; unnatürliche Labelumbrüche weiter sichtbar.
6. `06-defaults-restored.png`: Schrift und Palette zurück auf Default; Zoom unangetastet 100%.
7. `07-narrow-1100-with-assistant-clipping.png`: Appearance-Spalte abgeschnitten mit offenem rechten Panel.
8. `08-narrow-1100-panel-closed.png`: Vergleich gleiche Fensterbreite nach Close; Karten wieder lesbar.
9. `09-light-theme.png`: Light-Wirkung auf Settings bei 1100×920.
10. `10-dark-theme-restored.png`: Dark wiederhergestellt.

Abschluss: ursprüngliche Schriftgröße Default, Palette Default und Dark-Theme wiederhergestellt. Fenster wieder maximiert; rechter Panelbereich geschlossen. Keine Provider-/Modelleinstellungen geändert, kein Reset, keine Daten gelöscht. Die schmale Assistant-Composer-Prüfung bleibt bis zur Behebung des Profilreferenzfehlers offen. Bereits veröffentlichte Fehlerberichte nicht überschrieben.

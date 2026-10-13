# Quickchat-Sidekick-Personas — Umsetzungsplan A-031

> Historischer Planungsstand aus PR #46. Die Versionsziele und Startbedingungen unten dokumentieren den damaligen Auftrag; sie sind weder aktueller Implementierungsnachweis noch Releasefreigabe. Der Plan bleibt als Referenz erhalten.

**Phase:** 1, nur Planung
**Ziel der späteren Umsetzung:** v0.1.56; frühestens nach v0.1.55 und nach Freigabe durch Cid
**Branch für Phase 1:** `codex/a-031-sidekick-personas-plan-20261011`
**Zielbild:** [`quickchat-sidekick-personas-zielbild.md`](quickchat-sidekick-personas-zielbild.md)

## Umfangsgrenze

Phase 1 ändert ausschließlich die zwei Dokumente zum Zielbild und zum Umsetzungsplan. Keine UI-, Prompt-, Storage-, Bridge-, Backend-, Asset- oder Testimplementierung. Es werden keine Tests ausgeführt, weil A-031 für diese Dokumentphase keine Pflichtprüfungen vorsieht.

## Abhängigkeiten und Startbedingungen

- **A-026 und A-027:** Laut Slack in PR #43 enthalten. Die spätere Umsetzung soll auf dem dann aktuellen freigegebenen Basisstand aufsetzen.
- **A-030:** PR #45 wurde gegen `release/v0.1.52` eröffnet. A-030 ist fachliche Voraussetzung für Persona-Arbeit am Quickchat, da der Quickchat ohne Space-Assistant-Bereich und mit Space-Isolation bereitstehen muss. Vor Phase 2 Merge-, Test- und Release-Status von PR #45 erneut prüfen.
- **Release-Schranke:** Keine Phase-2-Umsetzung vor Cids Freigabe und vor Release v0.1.55. Ziel ist v0.1.56. Keine Änderungen in den v0.1.54-Kandidaten einbringen.
- **Quellicons:** Die Bilddateien liefert Cid. Bis zur Lieferung ist nur das Original-Avatar als Fallback verfügbar. Lizenz- und Herkunftshinweis vor Asset-Integration mit A-020/A-022 abstimmen.
- **Sprachen:** A-031 nennt sechs verfügbare App-Sprachen. Der aktuelle Repo-Stand hat acht Locale-Dateien: `de`, `en`, `es`, `fr`, `it`, `ja`, `pt-BR`, `ru`. Die spätere Umsetzung deckt den tatsächlichen Stand ab und prüft ihn erneut.

## Teilaufträge und Reihenfolge

| Reihenfolge | Teilauftrag | Abhängigkeiten | Haupt-Hotspots | Konkreter Regressionstest |
|---:|---|---|---|---|
| 1 | **A-031a Datenmodell und Migration** — Versioniertes Schema pro Browserprofil und kanonischem Space-Pfad; Nova-allgemein-Fallback; unbekannte Felder erhalten. | Keine, zuerst umsetzen. | Renderer-Persistenzmodul (neu oder vorhandene Space-Settings), `App.tsx`, Migration-/Storage-Tests. | Ein altes Space-Fixture ohne Persona lädt als Nova allgemein; Reload erhält neue Auswahl; zwei Spaces/Profile bleiben isoliert; Migration verändert bekannte Felder und bewahrt unbekannte Felder unverändert. |
| 2 | **A-031b Space-Setup-Carousel** — Große Icons, sechs Sidekick-Karten, Name, Beschreibung und nur sichtbare Fachgebiets-Tags. Carousel per Maus, Tastatur und Screenreader. | Datenmodell-Schnittstelle A-031a; Asset-Fallback kann vor echten Quellen getestet werden. | `apps/desktop/src/renderer/components/SpaceSetupModal.tsx`, `styles.css`, i18n, Renderer-Komponententests. | Space-Setup zeigt genau sechs Karten; Nova ist ausgewählt; Pfeil-/Enter-/Space-Tastaturbedienung wählt Karte; Screenreader liest Name und Tags; keine Prompt-Details werden im UI gerendert. |
| 2 | **A-031e Assets und i18n** — Quellbilder, abgeleitete Größen/Formate, Transparenz, Fallback und Lizenzhinweis; Namen, Kurzbeschreibungen, Tags, Bestätigungs-/Sicherheitstexte in allen App-Sprachen. | Quellbilder von Cid; i18n kann unabhängig von Daten-/UI-Code vorbereitet werden. | `brand/assets/sidekicks/`, `apps/desktop/tests/brand-assets.test.ts`, `apps/desktop/src/renderer/i18n/keys.ts`, `i18n/locales/*.ts`, Locale-Paritätstests. | Asset-Vertrag prüft je Sidekick PNG/WebP und Dimensionen; fehlende Datei verwendet Original-Avatar; Locale-Paritätstest schlägt fehl, sobald ein Text für eine der acht Locale-Dateien fehlt. |
| 3 | **A-031d Expertenprofile, Prompts und Sicherheit** — Fachrouting für Dash, Sage, Scout, Milo, Rook; Nova allgemein; fachfremde Antworten mit Hinweis; interne Prompt-Regeln bleiben verborgen. | Datenmodell A-031a; bestätigter Quickchat-Startvertrag; Sicherheitsreview für Scout/Milo. | `App.tsx` Quickchat-Sendepfad, `main/quick-chat-controller.ts`, `main/sidekick-api.ts`, bei Bedarf `services/sidekick/web/api/routes.py` und zugehörige API-Tests. | Prompt-Vertrag prüft Persona-/Sprache-Zuordnung und Hinweis bei fachfremder Frage; UI-Transcript enthält nur Nutzereingabe; Scout diagnostiziert nicht und verweist bei Notfall auf Hilfe; Milo erkennt Krisenaussage und gibt sichere, lokalisierte Handlungshinweise ohne erfundene Nummer. |
| 3 | **A-031c Header, Umschalter und Reset** — Name ohne „AI“, Icon und Header-Auswahl; Bestätigung bei Verlauf; bestätigter Wechsel setzt vollständigen Chat zurück und startet neue Persona. | A-031a, A-031b, A-031d; A-030 muss gemergt/integriert und Voraussetzung erfüllt sein. | `App.tsx` Quickchat-Modus/Reset/Scope, `components/CopilotSplitView.tsx`, `styles.css`, i18n, Renderer-/IPC-Vertragstests. | Mit Nachrichten fordert der Wechsel Bestätigung; Abbrechen erhält Transcript und Persona; Bestätigen löscht Transcript, bindet neue Persona und zeigt den Namen ohne „AI“; Wechsel des Space stellt dessen eigenen Verlauf und Sidekick wieder her. |
| 4 | **A-031f Integration und Regressionen** — Gesamter Weg von Auswahl über Persistenz bis bestätigtem Personawechsel; Isolation und Quickchat-Vertrag absichern. | A-031a bis e; A-030-Basis. | Renderer-Integration, Quickchat-IPC-/API-Vertrag, Electron-Smoke und vorhandene Quickchat-Regressionssuite. | Ein Integrationstest erstellt/öffnet Space, wählt Persona, lädt neu, wechselt Space und führt bestätigten Reset aus; bestehende A-030-Tests für ersten Topbar-Klick und Space-Isolation bleiben grün. |

## Verträge und offene technische Prüfungen vor Phase 2

1. Den aktuellen Stand von A-030/PR #45 und die dann gültige Release-Basis feststellen.
2. In Quickchat prüfen, ob Persona-Kontext getrennt von der sichtbaren User-Nachricht bis zum Modell übergeben werden kann. Aktuell enthält `QuickChatStartRequest` ein `prompt`-Feld; falls der Persona-Kontext in einen User-Prompt eingebettet würde, könnte er im Verlauf sichtbar werden. Bevorzugt ist ein klarer, getesteter System-/Persona-Kontext im Quickchat-Vertrag.
3. Den bestehenden Reset-Ablauf auf nötige Bestätigung vor Beenden, Löschen und Neuanlage prüfen. Der Reset muss scopegebunden sein und darf keinen Verlauf aus einem anderen Space ändern.
4. Den versionierten Speicher so gestalten, dass unbekannte Felder bei Read/Modify/Write erhalten bleiben. Unbekannte `sidekickId`-Werte werden zur Laufzeit als Nova angezeigt, aber bei einer Migration nicht stillschweigend entfernt.
5. Medizinische Hinweise und Krisentexte für acht vorhandene Locales auf Bedeutung, Lesbarkeit und korrekte lokalisierte Handlungswege prüfen.
6. Quellen-/Lizenznachweis für die gelieferten Roboter-Icons vor dem Ableiten von Größen dokumentieren. Das Lizenz-README darf keine GPL-3.0-Zuordnung der neu gelieferten Assets suggerieren.

## Abnahme und Übergabe

- Phase 1 ist fertig, wenn Zielbild und dieses Planungsdokument konsistent sind, Links gültig sind und genau die erlaubten Dokumente geändert wurden.
- Pro Teilauftrag müssen Regressionstests vor Implementierung rot und nach Implementierung grün nachweisbar sein.
- Vor Phase 2 prüft Cid Plan, Hotspots, Reihenfolge, Testumfang, Release-Schranke und Icon-Lizenz. Ohne Freigabe bleibt die Arbeit dokumentarisch.
- Implementierung und Merge sind nicht Teil dieser Phase. Cid entscheidet über den Merge des Phase-1-PRs.

# Echte Store-Screenshots

Am 4. Oktober 2026 wurden **232 echte PNG-Aufnahmen** erstellt: **29 Ansichten in acht App-Sprachen**, jeweils **1920 × 1080 Pixel**. Der vollständige Lauf endete mit **0 Navigationsfehlern**. [Galerie](../assets/store/screenshots/index.html) und [Aufnahmebericht](../assets/store/screenshots/capture-report.json) enthalten die Ergebnisse.

## Wiederholen

```powershell
node scripts/capture-store-screenshots.cjs
```

Der Test baut Main, Preload und Renderer aus den vorhandenen lokalen Quellen und Abhängigkeiten nach `out/store-capture/current`. Er startet die echte Electron-App mit dem eingebetteten Python und dem Backend aus `services/sidekick/`. Er installiert keine Abhängigkeiten und synchronisiert keinen externen Quellcode. Der normale Build-Ausgabeordner wird nicht verändert.

Ein temporäres eigenes Browser- und Backendprofil verhindert, dass bestehende App-Sitzungen übernommen werden. Token-Umgebungsvariablen werden entfernt; die GitHub-CLI erhält einen leeren Konfigurationsordner. Der Test registriert sich nicht als Standardbrowser und sendet selbst keine Modellanfrage. Die App kann weiterhin ihre normalen Hintergrundabfragen zur Modellerkennung ausführen; der Test ist kein Nachweis vollständiger Netzwerkisolation.

Der Test klickt die tatsächlichen Bedienelemente an und speichert den gerenderten Fensterinhalt. Es werden keine Chatantworten, Leistungszahlen oder UI-Inhalte erfunden. Abschließend werden die eigene Backendinstanz gestoppt, die eigenen Fenster geschlossen und ausschließlich das eigene temporäre Profil entfernt.

`--probe` erstellt eine einzelne Probeaufnahme; `--no-build` verwendet den zuvor isoliert gebauten Stand. `--gallery-only` erneuert nur die Galerie aus dem Aufnahmebericht.

## Umfang

Sprachen: Englisch, Deutsch, Italienisch, Spanisch, Französisch, Portugiesisch (Brasilien), Russisch und Japanisch. Die Liste stammt aus dem App-Sprachkatalog.

Aufnahmen: Browser/Startseite, Chat, geplante Aufgaben, Kanban, Skills, Agenten, Gedächtnis, Arbeitsbereiche, Profile, Aufgaben/Plan, Nutzung, Logs, Gmail, Discord, Terminal und Einstellungen; zusätzlich alle sieben Einstellungsseiten, Erweiterungs-Hub, Skill-Hub, Downloads, Verlauf, Berechtigungen und Befehlspalette. Der frühere Appstore-Menüpunkt wird durch den tatsächlich zugänglichen Erweiterungs-/Skill-Hub abgedeckt.

Für jeden Store-Sprachentwurf werden vier Ansichten gewählt: `browser.png`, `settings-02.png`, `agents.png` und `kanban.png`. Die vollständige Sammlung wird lokal erhalten.

## Noch vorläufig

Die Bilder zeigen einen Entwicklungsstand vor dem Abschluss von **Multiagent Umsetzung**. Die Navigation und Bildformate wurden geprüft; KI-Aufträge, Integrationseinrichtung und Releaseinstallation wurden damit nicht funktional abgenommen.

Sichtbare Übersetzungslücken wurden an den abhängigen Chat gemeldet: deutsche Space-Karten, englische Favoriten-/Verlaufstexte auf der Startseite, „Zurück zum Web“, „Deaktiviert“ bei Dock-Einstellungen und nicht übersetzte native Panel-/Hub-Beschriftungen. Im nicht eingerichteten KI-Bereich erscheinen zudem Modellerkennungs-/Anfragefehlermeldungen; diese Ansicht wurde nicht für den Store ausgewählt.

Vor der Zertifizierung den Test aus dem fertigen gemeinsamen Stand erneut ausführen, Bilder visuell prüfen und die Store-Auswahl aktualisieren. **Die Store-Freigabesperre bleibt bestehen.**

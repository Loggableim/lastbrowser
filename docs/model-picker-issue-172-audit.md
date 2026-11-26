# Issue #172: OpenCode-Modellwahl – Prüfstand

Stand: 26. November 2026. Das offene Issue verlangt einen live geladenen Modellkatalog mit Gruppen für OpenCode Go und Go Free, profilbezogene Modellschalter, die Ausblendung deaktivierter Modelle sowie Persistenz und eine Chat-Runde je Gruppe.

## Vorhandene Nachweise

- `model-picker-options.ts` teilt erkannte OpenCode-Einträge anhand der Katalogdaten beziehungsweise der Modellkennung in bezahlte und kostenlose Gruppen. Die Einstellungen verwenden die geladenen Kataloggruppen; die Router-Identität bleibt erhalten.
- `active-model-selection.ts` speichert explizit deaktivierte Modelle nach Browser- und Backendprofil. Die Tests rekonstruieren den gespeicherten Zustand in einem neuen Storage-Objekt. Sie prüfen außerdem, dass andere Modelle und Profile davon unberührt bleiben.
- Picker und Quickchat filtern deaktivierte Modelle; der Sendeschutz prüft die Auswahl erneut. Ein Ersatzmodell wird innerhalb des ausgewählten Anbieters gesucht, damit bei lokaler Auswahl nicht unbeabsichtigt ein anderer Anbieter verwendet wird.
- Im Desktop-Verzeichnis bestand `vitest run tests/a027-model-selection.test.ts tests/chat-composer-notices.test.ts tests/provider-model-selection.test.ts tests/quickchat-automatic.test.ts` mit **72 Tests**. Die Tests verwenden Fixtures beziehungsweise kontrollierte Daten; fehlende Source-Maps von zwei gebündelten xterm-Dateien erzeugten Warnungen.

## Noch nicht als Abnahme belegt

- Ein tatsächlicher Katalogabruf mit den aktuell verfügbaren OpenCode-Konten und ein sichtbarer Screenshot der beiden Gruppen und Schalter.
- Ein Katalog-Reload und vollständiger Neustart des gepackten Browsers nach dem Abschalten eines Modells. Der Storage-Unit-Test ersetzt diesen Ablauf nicht.
- Je eine echte Chat-Runde mit einem verfügbaren Modell aus Go und Go Free oder eine überprüfte, verständliche Fehlermeldung. Dafür sind geeignete Zugänge und gegebenenfalls ein bezahlter Tarif nötig; es wurde kein Kauf ausgelöst.
- Der aktuelle Quellstand ist nicht identisch mit dem vorhandenen älteren Windows-Testpaket. Deshalb bleibt das Issue offen, bis diese Abläufe mit dem passenden Build nachgewiesen sind.

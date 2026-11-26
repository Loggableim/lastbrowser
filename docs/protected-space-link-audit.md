# Protected Space: Übergabe von Links

Stand: 26. November 2026, lokaler Arbeitsstand. Dies ist keine Paket- oder Store-Freigabe.

Die zuvor bei einer Quellcodeprüfung befürchteten Linkverluste sind im aktuellen Arbeitsstand bereits behandelt: Der Launcher behält eine Adresse bis zur Bestätigung der Übergabe an den bereiten Renderer in seiner Warteschlange. Schließt der Browser vor der Bestätigung, kann der nächste Start den Link erneut erhalten. Treffen während des Schließens Links ein, bleibt der Entsperrdialog für einen erneuten Start geöffnet. Auch `file://`-Adressen werden angenommen.

Nachweis im Desktop-Verzeichnis: `node ../../node_modules/vitest/vitest.mjs run tests/protected-space-links.test.ts tests/open-url-lifecycle.test.ts` bestand mit 7 Tests. Die Tests simulieren Electron, den Broker und den Datenstrom; sie überprüfen unter anderem erneute Übergabe nach einem fehlgeschlagenen Start, die Reihenfolge, lokale HTML-Dateien und einen Link beim Schließen.

Nicht belegt ist damit ein vollständiger Windows-OS-Test mit dem endgültigen MSIX, echtem verschlüsseltem Space und Dateizuordnung. Die Bestätigung erfolgt nach dem Versand an einen bereiten Renderer; sie beweist nicht, dass die Zielseite erfolgreich geladen wurde. Der Launcher begrenzt die wartenden Links auf 32; darüber hinausgehende Aktivierungen werden derzeit verworfen.

# Issue #283: Update-Kanal und Microsoft Store

Stand: 26. November 2026. Issue #283 verlangt Stable- und Beta-Abonnement, automatische Updates und einen Hinweis auf unsignierte Beta-Builds. Der offene Entwurf #337 betrifft eine ältere Basis und ist kein Nachweis für den aktuellen Store-Build.

## Aktueller Quellstand

- Die Windows-Store-Erkennung verwendet `process.windowsStore`. Der Update-Controller kennzeichnet diese Installation als Store-verwaltet und deaktiviert seinen eigenen Updatepfad; die Einstellungen zeigen stattdessen den Hinweis auf Microsoft Store.
- Bei anderen Installationen gibt es eine gespeicherte Stable-/Beta-Auswahl. Auf Windows prüfen signierte Installationen den Herausgeber von Updates. Der Beta-Hinweis erklärt, dass unsignierte Tagesbetas bei einer signierten Installation manuell installiert werden müssten. Das ist keine Zusage, dass solche Downloads aktuell angeboten werden.
- Eine automatische Installation unsignierter Beta-Artefakte ist damit nicht belegt und wäre mit der vorhandenen Herausgeberprüfung der signierten Windows-Installation nicht vereinbar. Für den Store-Vertrieb ist der Microsoft Store der Updateweg; die historische Forderung nach automatischen unsignierten Betas lässt sich nicht pauschal auf diese Fassung übertragen.

## Nachweis und Grenzen

Im Desktop-Verzeichnis bestanden `vitest run tests/update-controller.test.ts tests/updates-ipc.test.ts tests/windows-nsis-updater.test.ts tests/windows-update-signature.test.ts tests/update-settings-actions.test.ts`: **65 Tests**. Sie prüfen kontrollierte Update- und Signaturfälle, keinen tatsächlichen Download und keine Installation eines Store-Updates. Eine echte Aktualisierung der veröffentlichten Store-App sowie die Verfügbarkeit eines passenden Beta-Kanals im Store sind damit nicht nachgewiesen. Issue #283 bleibt offen.

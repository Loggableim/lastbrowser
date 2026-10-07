# LastBrowser 0.1.47 – interne Testversionsnotizen (Entwurf)

> **Status: Testversion in Vorbereitung.** Diese Notizen dokumentieren gezielte Source-Änderungen und Prüfbelege, keine fertige oder veröffentlichte Version. Ein 0.1.47-Paket, Download-Pins, Gastabnahme, Signierung und Storefreigabe sind derzeit nicht bestätigt.

## Geplante Korrekturen

- **Profilgebundene Provider- und Modellrequests:** Der Main-Prozess akzeptiert die benötigten Provider-/Katalogpfade nur innerhalb der aufgelösten Saved-Space-/Profilbindung. Providerkennungen und Modelllisten werden gegen das erwartete Schema geprüft; der Renderer kann Profil- oder Authentifizierungsheader nicht selbst bestimmen.
- **Chatstart-Diagnostik:** Frühe Bridge-Ausnahmen werden innerhalb des geschützten Fehlerpfads beantwortet. Begrenzte Vor-Header-Phasenprotokolle sollen die Phase eines Chatstart-Timeouts eingrenzen, ohne Requesttext, Schlüssel oder Kontodaten zu protokollieren. Die Ursache des früheren Gast-504 ist damit nicht rückwirkend bewiesen.
- **Quickchat nach Scopewechsel:** Transcript, Fehler- und Resetstatus bleiben dem ursprünglichen Profil/Space zugeordnet. Ein Reset gilt erst nach positivem ACK als abgeschlossen. Modellkataloge werden nur für den weiterhin aktiven Scope übernommen.
- **Quickchat-Modellpicker:** Senden ist während Laden/Fehlern sowie bei veralteten, nicht verfügbaren oder nicht eindeutig gebundenen Provider-/Modellpaaren gesperrt. Die Verfügbarkeitsprüfung vergleicht Provider, Modell, Scope und Auswahlrevision.
- **MiMo-Einstellungen:** MiMo erhält eine eigene Feldbeschriftung. Schlüsselstatus bleibt unbekannt, bis ein gültiger scoped Readback ihn bestätigt; nicht unterstützte `models`-Payloads werden nicht gesendet. Save-/Readback und echte Inferenz sind getrennte Nachweise.
- **Weitere bekannte UI-/Updateänderungen:** „Jetzt aktualisieren“/Updatehinweis, Post-Update-Hinweis, WebUI-Logalias und das Ausblenden des wirkungslosen Trust-Schalters sind im Arbeitsstand als Änderungen bekannt. Ihr Vorhandensein im exakten 0.1.47-Paket und ihr sichtbares Laufzeitverhalten sind noch nicht abgenommen.

## Prüfgrenzen

Die frische Pflichtpipeline für den eingefrorenen 0.1.47-Stand ist bestanden: 1.839 Tests in 195 Dateien, Store-Preflight 39 PASS / 2 WARN / 0 FAIL, Desktop-Build und Python-Syntaxprüfung erfolgreich. Der finale unabhängige Delta-Review schließt die konkreten Source-Gates. Paket- und Laufzeitabnahme bleiben davon getrennt und offen.

Für die genannten Änderungen liegen gezielte Source- und Regressionsevidenzen vor. Diese Einzelprüfungen sind keine vollständige Test-Suite und werden nicht zu einer Gesamtzahl addiert. Ein grüner Sourcecheck belegt weder Paketidentität noch Installation, Upgrade, Providerantwort, Streaming/Stop, Quickchat-Laufzeit oder Storebereitschaft.

Der historische VM-Lauf des unsignierten Kandidaten **0.1.46 / 9615a8ae** belegte nur die Identität von Setup/ASAR sowie Installation und Start. Er erreichte keine erfolgreiche Modellantwort oder Provider-/Quickchat-Abnahme. Seine Befunde sind Ausgangspunkte für gezielte 0.1.47-Prüfungen, keine 0.1.47-Ergebnisse.

Die dazugehörige Prüf- und Freigabeabgrenzung steht in [release-0.1.47-verification.md](release-0.1.47-verification.md). Diese interne Testversionsnotiz ist keine öffentliche Releaseankündigung, Signierbestätigung, Storezertifizierung oder Einreichungsfreigabe.

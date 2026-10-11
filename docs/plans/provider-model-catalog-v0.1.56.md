# Gemeinsamer profilgebundener Provider- und Modellkatalog

**Planungsziel:** Folgeversion **v0.1.56**, ausdrücklich nicht v0.1.55. Dies ist Planung, keine Freigabe zur Runtime-Umsetzung. v0.1.55-Fehlerbehebung und Kandidat haben Vorrang.

## Ziel und Grenzen

Einstellungen, Modell-Picker und Backend verwenden dieselbe profilgebundene Provider-Identität und denselben Katalogvertrag. Discovery stammt ausschließlich aus der passenden Anbieter-API oder einer ausdrücklich konfigurierten lokalen Engine. Kontextgrenzen und Fähigkeiten tragen jeweils Herkunft; unbekannte Werte bleiben unbekannt. Ein Profilwechsel darf weder eine andere lokale Profil-Home noch Zugangsdaten oder Berechtigungen übernehmen.

Drei Aussagen bleiben getrennt:

1. **Gelistet:** API- oder lokale Discovery hat die Modell-ID für genau diese gebundene Provider-Identität geliefert. Statische Rückfallwerte sind als solche markiert und belegen keine aktuelle Verfügbarkeit.
2. **Ausführbar:** Provider/Modell-Paar, gebundene Verbindung, Adapterunterstützung und bekannte erforderliche Kontext-/Fähigkeitsdaten passen zur konkreten Aktion. Das belegt keine erfolgreiche Inferenz.
3. **Live erfolgreich getestet:** Eine vom Nutzer ausdrücklich gestartete echte Anfrage wurde mit derselben Profil-, Provider- und Modellbindung abgeschlossen. Der Nachweis ist zeitlich begrenzt und folgt nicht aus „gelistet“, „verbunden“ oder „ausführbar“.

Jeder Katalog-/Capability-Nachweis führt Abrufzeit, Quelle, Status und Frische. Abgelaufene Einträge werden als veraltet angezeigt. Ein Cache-Key umfasst Provider, opake Profil-/Accountidentität und Konfigurationsrevision; Geheimnisse selbst kommen weder in Key noch Antwort. Es gibt keine automatische kostenpflichtige Inferenz oder Probe. Ein expliziter Verbindungstest zeigt Zweck und mögliche Kosten vorab und läuft nur auf Nutzeraktion.

## Bestandsaufnahme auf `release/v0.1.52` (`7d3d52bb`)

| Bereich | Geprüfter Pfad | Befund für die Planung |
|---|---|---|
| Settings-Katalog | `apps/desktop/src/renderer/panels/SystemPanels.tsx` (Space-Katalog um 2274; Provider-Katalog um 3069), `apps/desktop/src/renderer/provider-settings.ts` | Space- und Provider-Konfigurationskataloge haben getrennte Abrufwege; Scope-Schutz besteht für Provider-Settings. Provenienz und gemeinsame Darstellung sind abzugleichen. |
| Picker und Chat | `apps/desktop/src/renderer/App.tsx` (Auswahl um 2915, Sendauflösung um 3376, Picker-Verfügbarkeit um 4224, Modellwechsel um 5344) | Auswahl ist Space-gebunden. Picker-Verfügbarkeit und erfolgreicher Request müssen unterschiedliche Zustände bleiben. |
| Main/API-Brücke | `apps/desktop/src/main/independent-controller.ts` (modelSelection um 690–704), `services/sidekick/web/api/independent.py` (Dispatcher um 664) | Main validiert Operation/Scope und leitet ans Backend; API delegiert an den profilgebundenen Resolver. Diese Bindungsgrenze bleibt maßgeblich. |
| Katalog und Auswahlmutation | `services/sidekick/runtime/independent/scoped_models.py` (`probe_catalog` um 121, `_native_availability` um 171, `handle_model_selection` ab 275) | Discovery läuft im isolierten Worker. Konfigurationsdigest wird revalidiert; Mutation prüft Revision, Pair und Readback. Fehlender Kontext ist ein eigener Grund. |
| Profilauflösung | `services/sidekick/runtime/independent/scope.py` und `scope_binding.py` | Profil-ID wird gegen Registry, kanonischen Home und Space-Bindung geprüft. Host-HOME-Fallback oder Credential-Kopieren ist unzulässig. |
| Provider-Discovery | `services/sidekick/cli/models.py` (`provider_model_ids` um 1410 und Providerfunktionen), `services/sidekick/web/api/config.py` (ab `_read_live_provider_model_ids` um 3063), `services/sidekick/web/api/routes.py` (`/api/models/live` um 10971+) | API-, lokale Engine- und statische Fallbackpfade existieren parallel. Ihre Herkunft muss im gemeinsamen Katalog erhalten bleiben. |
| Kontext/Fähigkeiten | `services/sidekick/runtime/independent/capabilities.py` (`CapabilityService.catalog` mit kurzem Evidence-Cache), `services/sidekick/runtime/model_metadata.py` (`get_cached_context_length`) | Quellen und Frische sind getrennt. Zusammenführung darf unbekannte Metadaten nicht in positive Behauptungen verwandeln. |

Dies sind Source-Befunde am genannten Basis-Commit, keine aktuelle Anbieter-Live- oder Laufzeitprüfung.

## Zielvertrag

Ein Katalogeintrag enthält mindestens:

* opake Profilreferenz und Profilrevision, Provider-ID, optionale opake Accountreferenz, Modell-ID;
* Herkunft pro Feld: Anbieter-API, lokale Engine, explizite lokale Konfiguration, kuratierter Fallback oder unbekannt;
* `listed` samt Discovery-Zeit, letzter erfolgreicher Aktualisierung und Frischeklasse;
* `executable` samt konkreten Gründen (Konfiguration, Adapter, bekannter Mindestkontext und relevante Fähigkeit), Zeit und Quellbezug;
* optional `liveTest` mit Nutzeraktion, Zeit, Ergebnis und derselben Bindung, ohne Antworttext oder Secrets;
* Kontextfenster, Outputgrenze und Fähigkeiten nur, wenn die Quelle sie geliefert hat, sonst `unknown`;
* Konfigurationsfingerprint zur Invalidierung, ohne Credential-Wert, Token, E-Mail, vollständige URL oder Profilpfad öffentlich zu serialisieren.

Settings, Picker und Backend nutzen denselben Vertrag. Die UI darf sortieren/filtern, aber Identität, verfügbarkeitsrelevante Metadaten und Frische nicht neu ableiten. Das Backend validiert Auswahl und Send weiterhin gegen aktuelle Profilbindung, Konfigurationsrevision, Provider/Modell-Paar, Fähigkeiten und Kontext. Katalogabruf oder früherer Erfolg ersetzt diese Prüfung nicht.

## Migration und Teilaufträge

1. **A-056a – Schema und Beweismatrix:** Felder, Herkunft, Frischezustände, öffentliche Allowlist und Übergang aus `groups`, `providers`, `nativeAvailability` und `provider_model_ids` festlegen. Alte Cacheeinträge ohne belegten Scope/Zeitpunkt als historisch und veraltet behandeln; keinen Zeitpunkt erfinden.
2. **A-056b – Profilgebundener Backend-Resolver:** API und lokale Engine getrennt abfragen und mit gemeinsamer Identität/Provenienz aggregieren. Profil-/Konfigurationsrevision nach Discovery revalidieren; Fehler eines Providers dürfen andere Gruppen nicht gesund erscheinen lassen.
3. **A-056c – Cache und Lebenszyklus:** Scope-/Revisionsgebundene Keys und Ablaufregeln implementieren, erfolgreiche Abrufe atomar speichern, Offline/Stale/Fehler sichtbar unterscheiden. Alte Cacheformate lesend migrieren; Entfernung erst nach Readback- und Rollback-Fenster.
4. **A-056d – Einheitliche UI:** Settings und Picker auf denselben Vertrag umstellen. „Gelistet“, „ausführbar“ und „live erfolgreich“ trennen, veraltete Einträge markieren und explizite Aktualisierung ermöglichen. Kein Hintergrund-Testprompt.
5. **A-056e – Auswahl und Send:** Bestehende Auswahl verlustfrei abbilden; Mutation atomar und profilgebunden halten; vor Send erneut validieren. Legacy-Werte ohne Provenienz nicht still ausführbar machen. Rollback ohne Datenverlust ermöglichen.
6. **A-056f – Regression und Integration:** Schema-, Resolver-, Cache-, UI- und Bindungstests ergänzen. Paket-/Backend-Integration und eine getrennte Live-Abnahme dokumentieren exakten Build, Profilbindung und Provider/Modell; Live-Belege separat von synthetischen Tests führen.

## Deklarierte Implementierungs-Hotspots

Vor jedem Runtime-Write Claims und aktive Abschnitte frisch prüfen und konkrete Überschneidungen abstimmen. Erwartete Prüfpunkte:

* `services/sidekick/runtime/independent/scoped_models.py`, `scope.py`, `scope_binding.py`, `runner.py`, `capabilities.py`;
* `services/sidekick/cli/models.py`, `services/sidekick/web/api/config.py`, `routes.py`, `independent.py`;
* `apps/desktop/src/main/independent-controller.ts`;
* `apps/desktop/src/renderer/panels/SystemPanels.tsx`, `provider-settings.ts`, `App.tsx`;
* passende Regressionen unter `services/sidekick/tests` und `apps/desktop/tests`.

Das ist ein Plan, keine Dateireservierung; nicht jede Datei muss geändert werden. Geteilte Renderer-, IPC-, Auth- oder Katalogabschnitte sind vor Writes konkret zu melden.

## Akzeptanztests

Jeder Test muss ohne den zugehörigen Teilauftrag rot sein:

* Zwei Profile mit unterschiedlichen Verbindungen liefern jeweils nur ihren gebundenen Katalog; Scope-/Konfigurationswechsel während Discovery verwerfen die alte Antwort.
* API- und lokale Discovery behalten ihre Quellen. Offline, API-Fehler, statischer Fallback und leere Antwort werden nicht als aktuelle API-Verfügbarkeit ausgegeben.
* Ein Modell darf gelistet, aber wegen unbekanntem Kontext oder fehlender Fähigkeit nicht ausführbar sein; unbekannte Grenzen werden nicht geraten.
* `liveTest` bleibt leer, bis eine ausdrücklich gestartete Anfrage derselben Bindung tatsächlich erfolgreich zurückkehrt.
* Cache trägt Abrufzeit, Frische und Scope-Bindung; abgelaufene oder fremde Einträge sind nicht frisch/ausführbar. Credential-Rotation invalidiert relevante Einträge, ohne Werte offenzulegen.
* Migration bewahrt Space-Auswahl. Fehlende Legacy-Provenienz bleibt unbekannt/veraltet und aktiviert keine andere Providerbindung.
* Settings und Picker zeigen für denselben Scope gleiche Identität und Gründe; Send blockiert eine inzwischen veraltete/ungültige Bindung.
* Katalogabruf erzeugt keine Inferenz. Kostenpflichtige Tests erfordern ausdrücklichen Start und vorherige Kosten-/Zweckanzeige.
* Antworten, Logs und Artefakte enthalten keine Tokens, API-Schlüssel, E-Mails, Profilpfade oder geheimen Provider-URLs.

## Versions- und Freigabegrenze

Planungsziel ist v0.1.56; v0.1.55-Fehlerbehebungen und Kandidat bleiben vorrangig. Umsetzung benötigt einen separaten Auftrag und eine frische Claim-Prüfung. Dieses Dokument ändert keine Runtime, Version, Release-Metadaten, zentrale `ZIELBILD.md` oder `goal.md`.

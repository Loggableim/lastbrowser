# v0.1.56 Startseite: Luminous Launchpad

**Status:** Planung für v0.1.56; keine Freigabe zur Umsetzung und keine Zusage, dass die beschriebenen Elemente bereits existieren. v0.1.55-Fixes und Kandidat haben Vorrang.

**Scope-Grenze:** Ausschließlich Inhalt der leeren Browser-Startseite (`NativeBrowserStartPage`) sowie eng zugehörige lokale Styles und Wallpaper-Anbindung. Keine Neugestaltung von Browser-Shell, Sidebar, Topbar oder Dock. Historische QuickWins für Spacefarben oder globale Shell werden nicht übernommen.

## Zielbild

Die bestehende leere Browser-New-Tab-Page wird als „Luminous Launchpad“ weiterentwickelt. Variante 1 des vorhandenen Mockups ist die Gestaltungsgrundlage. Das ist nur die Startseitenfläche innerhalb des Lastbrowser-Produkts, nicht die globale Browser-Shell, die öffentliche Website `lastbrowser.com` oder die GitHub-README. Bestehendes Sidekick-Branding und heutige UI-Begriffe haben Vorrang vor historischen „Nova“-Texten im Referenzmaterial. Die gewünschte Richtung ist dunkel, farbig und modern: navy Oberflächen, Cyan-/Violett-/Pink-Akzente, klar sichtbare Original-Wallpapers ohne starke dunkle Überlagerung und eine dezente Aura-/Glas-Anmutung gemäß Zusatzreferenz `codex-clipboard-d4997f39-b38c-4ed0-ad44-94d34ecc3259.png`. Controls sollen weniger pillenförmig und kantiger sein, mit etwa 6–8 px Rundung. Website-Markenicons gefallen. Keine Mockupvariante ist final abgenommen; die Ausarbeitung bleibt reviewbar.

Zielbereiche:

1. Begrüßung mit Uhrzeit und lokal formatiertem Datum, ergänzt um eine zurückhaltende Luminous Aura.
2. Eine Intent-Omnibox, die einen eingegebenen Text eindeutig als Webnavigation/-suche oder als Chat-Anfrage verarbeitet. Die Entscheidung darf keinen stillen Modellwechsel oder kostenpflichtigen Aufruf auslösen. Vorhandene Quick-Actions können als optionale, zugängliche Aktionen erhalten bleiben.
3. Space-Karten zeigen ausschließlich den Space-Namen und die Zahl tatsächlich aktiver Agenten im passenden Scope. Aktive Agenten sind für die Anzeige solche mit verifiziertem Status `running`; queued, waiting-for-approval, paused und terminale Runs zählen nicht. Count und Unavailable-Zustand müssen aus echten Run-Daten kommen, passend zu Backendprofil, Browserprofil und Space. Fehlende, veraltete oder nur teilweise verfügbare Daten dürfen nicht als `0` erscheinen.
4. Vektor-Speed-Dial aus bestehenden Favoriten/konfigurierbaren Einträgen. Domain-Favicon-Auflösung und Fallback müssen lokal verständlich und robust bleiben.
5. Wallpaper-Auswahl mit Galerie, lesbarer Blur-/Aura-Einstellung, manueller Vor-/Zurücksteuerung und optionaler Rotation. Historischer Vorschlag: sechs auswählbare Wallpaper, 60-Minuten-Rotation und 600-ms-Crossfade. Sechs ursprüngliche JPG-Referenzbilder wurden inzwischen gesichert; sie sind noch kein geprüftes, integriertes oder rechtlich freigegebenes Produkt-Bundle und kein bestätigter Produktvertrag.
6. Optionaler Generator mit Würfel für Promptvarianten, nur wenn ein profilgebundener, registrierter Sidekick-`image_generate`-Provider tatsächlich verfügbar und konfiguriert ist. Die vorhandene allgemeine Bildgenerierung ist kein Nachweis für ein beliebiges auswählbares Bildmodell. Keine kostenpflichtige Generierung ohne ausdrückliche Nutzeraktion und sichtbare Kosten-/Providerinformation.

## Aktueller Quellstand (read-only geprüft)

| Heute vorhanden | Quelle | Konsequenz für den Plan |
|---|---|---|
| New-Tab-UI mit Begrüßung, Uhr, Datum und Lastbrowser-Logo | `apps/desktop/src/renderer/panels/NativeBrowserStartPage.tsx` (`getDashboardGreeting`, `formatDashboardTime`, `formatDashboardDate`, Hero-Render) | Diese Komponente bleibt Ausgangspunkt. Aura, Wallpaper, Galerie und Flyout sind nicht belegt. |
| Separate Websuche/-Navigation und „Ask Sidekick“-Schaltfläche, plus Quick-Action-Chips | `NativeBrowserStartPage.tsx` (`submit`, `handleAskAi`, Form um Zeile 289); `apps/desktop/src/renderer/App.tsx` (Einbindung um 6702; Chat-Anfrage um 6716) | Eine Omnibox mit Intent-Routing wäre eine neue UX-/Routingentscheidung. Vorhandene Zielaktionen weiterverwenden; Ambiguität/Fehler sichtbar behandeln. |
| Spaces-Karten mit Name, aktivem Zustand und Tabanzahl | `NativeBrowserStartPage.tsx` (`displayedSpaces`, `getStartPageSpaceTabCount`, Grid um Zeile 365) | Die aktuelle Tabzahl wird im Ziel nicht gezeigt. Space-Karten zeigen nur Name plus belegte aktive Agentenzahl. |
| Favoriten, Meistbesucht und konfigurierbare Speed-Dial-Daten | `NativeBrowserStartPage.tsx` (`favorites`, `mostVisited`, `DEFAULT_SPEED_DIAL_ITEMS`) | Ein Teil des Speed-Dial-Ziels ist vorhanden; echte Vektor-Favicons, Anpassung und ein gemeinsamer Launchpad-Stil sind zu prüfen. |
| Child-Run-Snapshots mit Status und Scope | `apps/desktop/src/renderer/child-run-contracts.ts`, `child-run-client.ts`, `child-run-controller.ts` | Vertrag kennt Backendprofil, Browserprofil und Space sowie Run-Status; die Startseite zeigt derzeit keine solche Space-Zahl. Verfügbarkeit eines vollständigen, aktuellen aggregierten Counts pro Space muss geprüft/implementiert werden. |
| Erscheinungsbild-Präferenzen und UI-Themes, aber kein Startseiten-Wallpaper-Client | `apps/desktop/src/renderer/appearance.css`, `App.tsx` Theme-Anwendung, `SystemPanels.tsx` Appearance-Einstellungen | Theme-Flyout und Wallpaper-Lebenszyklus sind neue Arbeit und vor Implementierung mit vorhandenen Appearance-Controls abzugleichen. |
| Backend-Bildtool nur über aktive Registrierung/Konfiguration | `services/sidekick/runtime/image_gen_registry.py` (`get_active_provider`), `runtime/image_gen_provider.py`, `services/sidekick/web/api/routes.py` (`/api/image_generate`) | Keine bestätigte Renderer-API für Verfügbarkeitsanzeige, Kostenbestätigung, Fortschritt und sicheren Wallpaper-Import. Diese Schnittstelle samt Scope-/Providerprüfung ist zusätzlich zu entwerfen; kein direkter Renderer-Zugriff auf beliebige Providers. |

### Asset-Inventar

Bei der Source-Prüfung wurden keine integrierten Desktop-Wallpaper in `apps/desktop`, `brand/assets` oder `assets` gefunden. Sechs originale Wallpaper-JPGs aus dem Designmaterial liegen unverändert in `docs/design-references/v0.1.56/wallpapers/`; drei wurden visuell als Liquid Obsidian, Nordic Arch und Cyberpunk identifiziert. Die übrigen drei sind in der Referenz-README beschreibend benannt. Ihre Existenz als Quelldateien belegt weder Rechte/Freigabe noch technische Eignung oder Integration. Eine Assetinventur samt Herkunfts-/Rechteprüfung, Formaten, Abmessungen, Bundlegröße und Fallbacks bleibt eigener Lieferpunkt.

## Offene Architekturentscheidung: Wallpaper-Speicherung und Transport

Die historische Master-Spezifikation verlangt sechs lokal mitgelieferte Bilder; der separate Slim-Installer-Plan schlägt HTTPS-Assets unter `lastbrowser.com/assets/wallpapers/` mit persistentem Cache und lokalen Dev-Fallbacks vor. Diese Anforderungen widersprechen sich hinsichtlich Bundlegröße, Offline-Erststart, Netzwerkabhängigkeit und Rechte-/Integritätsprüfung. Für v0.1.56 wird keine Variante vorentschieden.

Vor Implementierung zu entscheiden und zu protokollieren:

* lokales Bundle, HTTPS-Download mit geprüftem lokalen Cache oder Hybrid (kleines Default-Bundle plus optionale Downloads);
* Verhalten beim Offline-Erststart, Downloadfehler, veraltetem/fehlendem Asset, Cachebereinigung und Update;
* zugelassener Host, Manifest/Versionierung, Integritätsprüfung, Cache-Ort und Größenbudget;
* Herkunft und Nutzungsrechte aller Bilder. Keine externen Bilder ohne klaren Zweck und nachvollziehbare Integrität.

## Zusätzliche Teilaufträge und Reihenfolge

1. **A-056g – UI-/Datenverträge und Abgleich:** Mit der dann aktuellen `NativeBrowserStartPage`, Omnibox, Appearance-Settings und profil-/spacegebundenen Run-Daten planen. Sidekick-Branding/Name aus aktueller Konfiguration übernehmen. Bestehende Startseite und ZIELBILD-Future-Eintrag erhalten.
2. **A-056h – Aktive Agentenzahl pro Space:** Aggregation aus verifizierten Child-Run-Daten ableiten und Scope auf Backendprofil, Browserprofil und Space begrenzen. `running` zählt aktiv; queued, waiting-for-approval, paused sowie terminale Zustände zählen nicht. Prüfen, ob Aggregation Vollständigkeit und Aktualität belegen kann. Bei fehlender, partieller, stale oder nicht verfügbarer Quelle einen ehrlichen Unavailable-Zustand zeigen, niemals ersatzweise `0`. Mock-Zahlen 2/1/0 sind Beispieldaten und dürfen nicht als Live-Status erscheinen.
3. **A-056i – Einheitliche Intent-Omnibox:** Bestehende `normalizeNavigationInput`/`onNavigate`- und `onAskAi`-Pfade untersuchen. Intent-Modell, verständliche Auswahl bei mehrdeutigem Text, Tastatur/Screenreader, Profil-/Space-Bindung, Fehlerzustand und keine impliziten Kosten modellieren.
4. **A-056j – Wallpaper-Katalog/Theme:** Die sechs gesicherten Quelldateien inventarisieren und technische Eignung, Quelle/Rechte und Integrität prüfen; erst danach entscheiden, ob sie Produkt-Assets werden. Speicherentscheidung schließen. Galerie, Vorschau, Blur-/Aura-Controls, manuelle Pfeile und Rotation mit pausierbarer/aufräumbarer Timerlogik spezifizieren; Reduced Motion respektieren.
5. **A-056k – Bildgenerierung:** Profilgebundenen Status des aktiven registrierten ImageGen-Providers sicher abfragen; nur bei wirklich verfügbaren konfigurierten Funktionen UI anbieten. Providerfehler, Kosten/Bestätigung, Abbruch, Outputvalidierung, Dateityp-/Größenlimits und lokale Speicherung behandeln. Würfel generiert nur Promptvarianten und löst selbst keine Generierung aus.
6. **A-056l – Regression und Akzeptanz:** Bestehende Startseiten-, Profil-/Space-Run- und Navigationstests erweitern. Auflösungen, leere Zustände, Tastatur/Screenreader, Scope-Isolation, echte Counts, unavailable/stale Daten, Timer/Manuellwechsel, Cache/Offline und Provider fehlt/fehlerhaft/kostenpflichtig abdecken. Release-/Paket- und Nutzerakzeptanz sind eigene Nachweise.

## Deklarierte künftige Hotspots

Nur Planungsstand; vor Umsetzung Branch/Claims und aktuelle Zeilennummern frisch prüfen. Erwartete Prüfflächen:

* `apps/desktop/src/renderer/panels/NativeBrowserStartPage.tsx`, `styles.css`, `appearance.css`, `App.tsx`;
* `apps/desktop/src/renderer/child-run-contracts.ts`, `child-run-client.ts`, `child-run-controller.ts` sowie Profil-/Space-Resolver und Run-Persistenz;
* `apps/desktop/src/renderer/panels/SystemPanels.tsx` und passende Appearance-/Settings-IPC-Typen, falls ein Flyout dort integriert wird;
* `services/sidekick/runtime/image_gen_registry.py`, `runtime/image_gen_provider.py`, `services/sidekick/web/api/routes.py` nur für eng begrenzten Status-/Generierungsvertrag;
* Renderer-, Main- und Backend-Regressionen für tatsächlich geänderte Verträge;
* Wallpaper-Assets/Manifest/Attribution nach beschlossener Quelle.

Dies reserviert keine Dateien. Vor jedem Write müssen Konflikte an gemeinsam genutzten Renderer-, IPC-, Profil-/Auth- und Settings-Abschnitten konkret gemeldet werden. Keine Installer-/Bootstrapper-Implementierung gehört automatisch zu diesem Startseitenauftrag.

## Akzeptanzrahmen für v0.1.56

* Eine einzige Omnibox unterstützt Navigation und Sidekick-Anfrage mit klar erkennbarem Ziel; Tastaturbedienung und Eingaben mit mehrdeutigem Intent bleiben kontrollierbar.
* Begrüßung/Uhr/Datum sind lokalisiert; Bewegung berücksichtigt Nutzereinstellungen.
* Space-Karten zeigen nur Space-Namen und eine aus echten Runs abgeleitete aktive Agentenzahl im korrekten Backendprofil-/Browserprofil-/Space-Scope. Nur verifiziert `running` zählt; fehlende, partielle oder stale Daten werden als unavailable ausgewiesen, nie als null Runs.
* Mockup-Beispieldaten 2/1/0 sind erkennbar nicht live und werden nicht mit Produktstatus verwechselt.
* Speed-Dial-Einträge sind echte funktionierende Ziele mit Icon-Fallback und Tastaturbedienung.
* Wallpaperwechsel funktioniert manuell; Rotation respektiert Lifecycle/Visibility und ist konfigurierbar. Fehlen Assets/Cache, bleibt die Startseite nutzbar.
* Generator ist bei nicht vorhandenem/nicht konfiguriertem Provider nicht aktiv. Nutzergesteuerte Generierung zeigt Provider/Kosten/Fehler; Abbruch und unbrauchbare Dateien lassen keinen falschen Wallpaperstatus zurück.
* Bildbestand und Transport erfüllen die zuvor getroffene, dokumentierte Offline-/Integritäts-/Rechteentscheidung.

## Referenzmaterial und Vertrauensstatus

Die Originale und drei JPG-Mockups liegen unter `docs/design-references/v0.1.56/`; sechs Wallpaper-Quelldateien liegen im Unterordner `wallpapers/`. `README.md` hält Herkunft und beschreibende Motive fest. Das Material sind historische Designvorschläge und Asset-Referenzen, keine aktuelle UI-Abnahme oder Integrations-/Rechtebestätigung. Aussagen der Originaltexte wie „final abgenommen“, „WCAG AA konform“, „ready for implementation“, bereits kompiliert, Installergröße oder vorhandene Bundles sind nicht unabhängig bestätigt und gelten hier nicht als aktuelle Evidenz. Der Slim-Installer-Teil ist Hintergrundmaterial, aber kein Auftrag, den Installer umzubauen.

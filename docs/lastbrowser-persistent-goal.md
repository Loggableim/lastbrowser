# Persistentes Ziel: Lastbrowser vollständig umsetzen und Store-Release vorbereiten

Stand: 5. Oktober 2026. Verbindlicher Auftrag des Users für die weitere Arbeit in `C:\projekte\lastbrowser`.

## Ziel und Abschlussmaßstab

Bringe Lastbrowser auf das vollständige bestätigte Zielbild. Implementiere `independentagent.md` einschließlich §§21–23 und erfülle die Abnahmekriterien A01–A53 sowie alle nachfolgend autorisierten Zusatzfunktionen. Arbeite autonom weiter, bis die Funktionen tatsächlich nutzbar, geprüft und im aktuellen Gesamtpaket enthalten sind.

Eine Planung, ein UI-Prototyp, ein kontrollierter Testadapter oder eine Prozent-Schätzung ersetzt keine vollständige Umsetzung. Melde 100 Prozent erst, wenn alle verpflichtenden Umsetzungsschritte und Abnahmen nachgewiesen sind. Kennzeichne externe Voraussetzungen und ungetestete Fälle ausdrücklich; erfinde keine Freigaben, Quoten, Modellfähigkeiten oder Erfolgsmeldungen.

Der User hat am 5. Oktober 2026 SimplySign-/DRM-Signierung und Veröffentlichung der aktualisierten Website sowie Setup-/Portable-Pakete ausdrücklich autorisiert. Diese Schritte folgen erst nach dem aktuellen Source-Freeze und den Release-Gates. Store-Einreichung bleibt ein separater Freigabeschritt. Details stehen in `docs/root-release-authorization-20261005.md`.

## Produktumfang

1. **Lokale KI:** geprüfter Inferenzadapter für unterstützte lokale Modelle, sicherer Prozesslebenszyklus, Admission und Ressourcenbudgets. Der kleine Router wird nicht im Installer gebündelt, sondern beim ersten Start im Hintergrund über die gepinnte, verifizierte Downloadpipeline geladen. Fortschritt, Abbruch, Offlinefall und Wiederaufnahme sind verständlich. Download allein bedeutet keine nutzbare Inferenz.
2. **AUTO-Modellauswahl:** einfache geeignete Antworten lokal; andernfalls Auswahl eines zulässigen und geeigneten Modells. Routingqualität wird mit festen, getrennten Prüfaufgaben gemessen. Unsichere oder komplexe Aufgaben eskalieren kontrolliert. Providerlimits und Lastverteilung verwenden nur belegte aktuelle Daten; unbekannte Limits bleiben unbekannt. Modellvorschläge erteilen keine Rechte.
3. **Lokale Einrichtung:** verständlicher Standardablauf „PC prüfen → Empfehlung → Einrichten“, möglichst höchstens drei bewusste Aktionen bei erfüllten Voraussetzungen. Erweiterte Details sind optional. Hardwareprüfung funktioniert unabhängig von Space-Einrichtung und verfügbarer Inferenz. Empfehlungen berücksichtigen konkrete Modell-, Runtime-, Kontext- und Speicherbelege. Einstellungen bieten „KI & lokale Modelle“ mit dauerhaft erreichbarer Konfiguration und appweitem Routerstatus.
4. **Spaces und Profile:** Browserprofil, Backendprofil, Home, Provider, Space und Browser-Lease sind ausdrücklich zugeordnet. Laufende Arbeit behält ihren ursprünglichen Kontext nach UI-Wechseln. Neue Gespräche und Läufe erhalten das bestätigte Space-Profil. Zwei Backendprofile dürfen parallel ohne Daten-, Rechte- oder Providervermischung arbeiten.
5. **Space Assistant:** das vorhandene Icon öffnet die dauerhafte Space-Zentrale mit eigenem Gespräch und Streamingzustand. Tatsächliche Aktivität stammt aus Backenddaten. Der Assistant kann autorisierte Arbeitschats und unabhängige Läufe beauftragen, während sein Gespräch nutzbar bleibt. Ergebnisse und erforderliche Useraktionen sind mit dem ursprünglichen Auftrag verknüpft.
6. **Schnellchat:** kurze Seitenaktionen wie Summarize, Explain und TL;DR erscheinen im Schnellchat, ohne normale Arbeitschats anzulegen. Stop erhält dessen Verlauf; Reset leert ausschließlich seine Unterhaltung und sperrt verspätete Ereignisse. Schnellchat und Assistant bilden eine verständliche Panel-Bedienung, behalten aber getrennte Identitäten, Rechte, Gesprächs- und Laufzustände.
7. **Chat-Zusatzfunktionen:** eingerückte, ausklappbare Subagent-Bubbles mit gleichzeitigem echtem Streaming und Farbnuancen; persistente Ziele mit tatsächlicher Weiterarbeit, Pause, Resume und Wiederaufnahme; Slash-Modi einschließlich Modellwahl, Plan, Goal, Grill-me und Boost; manuelle Modellauswahl und korrekt angebotene Denktiefe.
8. **Unabhängige Ausführung:** dauerhafte Zustände, Queue, Checkpoints, Aktionsjournal, Idempotenz, begrenzte Retries und Budgets. Browserarbeit läuft bei Minimierung, Chat-/Spacewechsel und Renderer-Reload weiter. Pause, Übernahme, Stopp, Rechteentzug und Zielverlust wirken tatsächlich; Wiederanlauf wiederholt unklare externe Mutationen nicht blind.
9. **Interview, Scheduler und Governance:** adaptives Interview mit drei bis vier Optionen und gleichwertigem Freitext, ohne feste Fragenanzahl oder automatische Navigation; Korrektur, Wiederaufnahme und manueller Fallback. Zeitpläne behandeln DST, Schlaflücken und doppelte Starts. Bestehende Nova-/Swarm-Governance bleibt wirksam; keine konkurrierende Runtime, Queue oder Freigabeverwaltung.
10. **Sicherheit:** Tool-, Browser-, Raw-CDP-, Connector-, Netzwerk- und Dateigrenzen greifen am tatsächlichen Dispatch. Freigaben binden die konkrete Aktion, Scope, Lease, Target und Generationen. Widerruf und Stopp sperren weitere betroffene Aktionen. Prompt-Injection oder fremde IPC-Absender dürfen keine Autorität erlangen.
11. **Usability und Sprachen:** konsistente Navigation, verständlicher Composer, sichtbare Tab-Schließbuttons und Pinned-App-Steuerung, Randnavigation bei horizontalem Overflow, Tastaturbedienung und passende schmale Layouts. Die angebotenen Website-Sprachen sind im Browser vorhanden, einschließlich Japanisch.
12. **Website-Zusatzauftrag:** den beauftragten Download-Counter umsetzen und verifizieren; keine Veröffentlichung ohne gesonderte Freigabe. Änderungen an der Website bleiben vom Browser-Release nachvollziehbar getrennt.

## Durchführung und Agenten

### Aktuelle Produktpriorität, 2026-10-05

Neuester konkreter Abschlussauftrag: Teamwork gemeinsam mit FIX AGENT 1 bis 4 reparieren, anschließend einen geprüften neuen Commit mit Version 0.1.44 erstellen. FIX1 besitzt Parent-Broker/Governance, FIX2 Worker-/SDK-/Runtime-Verträge, FIX3 den reproduzierbaren echten App-Fehlerlauf, FIX4 Main-/Renderer-Ereigniskette. Root führt die Hunks zusammen und besitzt ausschließlich Git-Index, finale Pflichtprüfungen und Release. Drei gestartete Worker reichen als Erfolg nicht aus: tatsächliche Providerrequests, Beiträge, Synthese und sauberer Stream-/Prozessabschluss sind erforderlich.

Der User hat weitere direkte Computer-Usage-Abnahmen autorisiert und wünscht bis zur nächsten Nutzung eine deutlich einfachere Standardoberfläche: wenige verständliche Schritte, automatisch sinnvolle Voreinstellungen und technische bzw. verschachtelte Konfiguration ausschließlich über bewusst geöffnete erweiterte Einstellungen. Insbesondere lokale KI, Space Assistant/Schnellchat und Teamwork müssen diesen Ablauf praktisch bestehen.

Teamwork soll Gemini, GPT und Ollama Cloud sinnvoll kombinieren: klar begrenzte Aufgabenrollen, passende vorhandene Modellfähigkeiten, überprüfbare Provider-/Kontogrenzen, kontrollierte Parallelität, Fehler-/Abbruchbehandlung und eine nachvollziehbare zusammengeführte Antwort. Verfügbare Limits nur aus echten Providerbelegen übernehmen; unbekannte Limits bleiben unbekannt. Kein automatisches Aktivieren ungeklärter Konten, keine unnötige Übermittlung privater Browserdaten und kein verstecktes Vervielfachen von Kosten.

Root orchestriert FIX AGENT 1–4 und eigene Subagenten, prüft die Integration und verwaltet Git-Index und Commits zentral. Alle zusätzlichen Subagenten verwenden ausschließlich GPT-6-Luna, vorzugsweise mit geringem Denkaufwand. Delegation erfolgt nur bei konkretem Nutzen und mit getrennten Datei- oder Testbereichen.

- FIX1: lokale Inferenz, qualifiziertes Routing und belegte Providerlimits.
- FIX2: lokale Modell-Einrichtung, Settings-Konfiguration und deren UI-Abnahme.
- FIX3: gezielte UI-/Usability-Korrekturen und Regressionen.
- FIX4: Ziele, unabhängige Browserarbeit, Profilisolation, Assistant/Schnellchat und konkrete Integrations-/Sicherheitsfehler.
- Root-Subagenten: eigenständige Test-, Sicherheits-, Scheduler-, Lifecycle- und Abnahmepakete; Produktänderungen nur nach ausdrücklich abgestimmter Zuständigkeit.

Diese Zuordnung darf Root sinnvoll anpassen. Niemand überschreibt fremde aktive Hunks oder führt parallele Git-Mutationen aus. Routineentscheidungen werden selbst getroffen; konkrete Konflikte und notwendige menschliche Angaben werden früh gemeldet.

Pflege `docs/independent-agent-preparation.md` als laufendes Arbeitsgedächtnis und `docs/root-acceptance-ledger.md` als Nachweisübersicht. Trenne dort aktuellen Code, gezielte Tests, echte App-Ausführung und aktuellen Paketnachweis. Lies nach Unterbrechungen diesen Zielauftrag und den Wiederaufnahmeabschnitt und arbeite an den verbleibenden Schritten weiter.

## Git, Daten und Architektur

- Regelmäßige nachvollziehbare lokale Commits sind ausdrücklich erwünscht. Prüfe vor einem Commit die vorgeschriebenen Repository-Checks und die vollständige atomare Feature-Änderung. Nimm keine fremden oder ungeprüften Benutzeränderungen pauschal auf.
- Pushes und Merges bleiben ohne weitere ausdrückliche Freigabe aus.
- Bestehende staged, unstaged und untracked Änderungen bleiben erhalten. Kein Reset, keine Überschreibung und keine Löschung zur Herstellung grüner Tests.
- Backend bleibt in `services/sidekick`; In-Tree- und Offline-Packaging sind verbindlich. Keine externen Repository-Clones, keine Find-and-replace-Patchskripte und kein `services/webui`.
- Keine Secrets, Datenbanken oder persönlichen Profile im Commit oder Paket. Keine involuntäre Telemetrie.
- Praktische Prüfungen verwenden eigene temporäre Profile, lokale Testseiten und kontrollierte Provider. Keine echten externen Nachrichten, Käufe oder sonstigen Nebenwirkungen ohne konkrete Autorisierung.

## Abschließende Prüfung und Artefakte

Nach Abschluss der Produktänderungen koordiniert Root einen Source-Freeze und führt selbst die Gesamtprüfung aus:

1. Nichtinteraktiver vollständiger Desktop-Testlauf; Beziehung zu `npm test` aus AGENTS dokumentieren.
2. Vollständige passende Backend-Prüfung im reproduzierbaren Projekt-Testsetup und Python-Syntaxcheck.
3. Desktop-Build und Store-Preflight mit aktuellen Ergebnissen, nicht historischen Zahlen.
4. Praktische Abnahme der Pflichtabläufe und fehlenden A01–A53-/Zusatznachweise im frisch gebauten Gesamtpaket.
5. Aktuellen Installer und Portable aus demselben Source-Stand erstellen und prüfen.
6. Installation, manuellen Upgrade, Daten-Erhalt und Neustart in einer isolierten geeigneten Windows-Umgebung prüfen. Live-Auto-Update mit Feed/Signaturen ist ein gesonderter Nachweis und erfordert seine tatsächlichen Voraussetzungen.
7. Runtime-/Modell-Lizenzen, Herkunft, Notices, Source-/UI-Entsprechung und app-lokale Abhängigkeiten prüfen; Clean-Windows-Nachweis erbringen. Technische Prüfsummen ersetzen keine Lizenzberechtigung.

Fehlende VM, Lizenzangaben oder andere externe Voraussetzungen werden präzise dokumentiert. Windows-Features, Konten und globale Installationen werden nicht heimlich verändert. Alle unabhängigen Arbeiten werden trotzdem abgeschlossen.

## Windows Store und SimplySign

### Aktuelle Benutzerfreigabe, 2026-10-05

Der User hat das eigene Xiaomi mit geöffneter SimplySign-App per USB angeschlossen und ausdrücklich erlaubt, den benötigten Signiertoken über ADB zu verwenden. Nach Abschluss der Implementierung und Gesamtprüfung sind Signierung der fertigen Artefakte, Versionsupdate und Website-Aktualisierung einschließlich der neuen Featurebeschreibungen autorisiert. Diese neue Freigabe ersetzt die frühere offene SimplySign-Schranke für diesen konkreten Abschlusslauf. Token/Anmeldedaten niemals in Chat, Toolausgaben, Dateien, Logs oder Git ausgeben; erst unmittelbar für den tatsächlichen freigegebenen Signierschritt verwenden.

Die Reihenfolge bleibt Umsetzung → Gesamtprüfung → konkrete Artefakte/Version → Signierung/Signaturprüfung → Website-Aktualisierung. Store-Einreichung und sonstige nicht konkret autorisierte Veröffentlichungen bleiben getrennt. Kein pauschaler Repository-Push oder Merge aus dem Wort „etc.“ ableiten.

Erst nach Umsetzung und Gesamtprüfung darf Root zusätzlich den vorhandenen Windows-Store-Integration-Agenten orchestrieren. Root darf ihm konkrete Store-Vorbereitungsaufträge senden, geeignete Luna-Subagenten einsetzen und Ergebnisse zusammenführen.

Vorbereitung umfasst die tatsächlich passende Paketform und Identität, Versionierung, Zertifizierungs- und Packaging-Regeln, benötigte Beschreibungen, Datenschutzhinweise, Icons/Screenshots, Distributionsnachweise und einen konkret prüfbaren Einreichungsplan. Bestehende Partner-Center-Daten werden zuerst gelesen; eine finale Einreichung oder Veröffentlichung erfolgt nicht ohne ausdrückliche Freigabe.

**Signierungsgrenze:** Die konkrete SimplySign-Freigabe für diesen Abschlusslauf liegt seit 2026-10-05 vor. Sobald die final geprüften Artefakte bereitstehen, nennt Root Version und Signierungsumfang und nutzt den freigegebenen Authentifizierungspfad. Falls das Xiaomi dann über ADB nicht erreichbar oder SimplySign gesperrt ist, meldet Root genau diese fehlende Voraussetzung. Kein Umgehen der Authentifizierung; Zertifikatdetails und Zugangsdaten werden nicht offengelegt.

Anschließend werden Signaturen und finale Artefakte erneut geprüft. Versions- und Website-Aktualisierung einschließlich neuer Featurebeschreibungen sind ebenfalls für diesen Abschlusslauf freigegeben. Store-Einreichung und weitere Veröffentlichungen bleiben gesondert freizugeben; ein pauschaler Git-Push oder Merge ist daraus nicht autorisiert.

## Abschlussbericht

Berichte kurz: tatsächlich umgesetzte Funktionen, ausgeführte Prüfungen, aktuelle Artefaktpfade und Identitäten, praktische Nachweise, externe Blocker und eine Anleitung zum Testen. Markiere die vollständige Umsetzung nicht als erreicht, solange Pflichtpunkte offen sind. Melde Release-Vorbereitung und ausstehende Signierungs-/Veröffentlichungsfreigaben getrennt.

## App-Zielverwaltung

Das aktive App-Ziel verweist inzwischen ausdrücklich auf dieses Repositorydokument. Die frühere Einschränkung beim Ersetzen des Objective-Texts ist damit historisch. Dieses Dokument bleibt die vollständige Auftragsgrundlage; abgeschlossen wird das App-Ziel erst nach nachgewiesener Erfüllung aller verpflichtenden Punkte.

## Verifizierter Release-Zwischenstand, 2026-10-05

Die ausdrücklich beauftragten Installer-, Signierungs- und Veröffentlichungsarbeiten haben Version 0.1.45 erreicht: signiertes Setup und Portable sind auf GitHub veröffentlicht, Widevine-VMP ist verifiziert, 152 native Signaturen wurden erfolgreich geprüft und beide realen Starttests bestanden. Die gepushten Integrations-/Release-Commits liegen auf `codex/release-0.1.45`; fremde Remote-Änderungen wurden nicht überschrieben. Einzelentwickler-Nutzung von Visual Studio Community wurde vom Benutzer bestätigt. Details und verbleibende Nachweisgrenzen stehen in `release-0.1.45-verification.md`.

Die Produktionswebsite wurde einschließlich Download-Funktionen veröffentlicht und in allen sieben Sprachfassungen gegen Version und Prüfsummen geprüft. Setup-/Portable-Dateinamen und byteidentische Update-Metadaten wurden über die öffentlichen Proxys bestätigt.

Das Gesamtziel bleibt offen: insbesondere Clean-Windows-Installation/Upgrade, Store-Zertifizierung und die explizit offenen Funktions-/Qualitätsabnahmen werden nicht durch einen erfolgreichen Release-Start ersetzt.

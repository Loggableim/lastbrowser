# Lokaler Modell-Store: Implementierungsstand

Phase 1, 8. Oktober 2026. Implementierung ohne Tests, Builds, Compilechecks oder Commit im direkten Humanauftrag. Dieser Stand ist kein Paket-, Geräte- oder Release-Nachweis.

## Produktintegration

Settings enthält eine eigene Sektion **Lokale KI**. Der Store bleibt auch bei übersprungener lokaler Einrichtung erreichbar. Die vorhandenen erweiterten Local-AI-Einstellungen bleiben erhalten.

Der private Main-Controller bindet Hardware und Modellverzeichnis an den tatsächlichen Backend-/Browserprofil-/Space-Kontext. Neue Store-Aktionen verwenden ausschließlich die bestehende authentifizierte Bridge. Installations- und Inferenzaktionen aktualisieren den Hardware-Scan; der Renderer darf weder Pfade noch Lizenzautorität liefern. Importierte Gewichte werden über einen eigenen Main-Dateidialog ausgewählt, gegen ein kuratiertes Artefakt gehasht und in den eigenen Cache kopiert. Originaldateien bleiben erhalten.

Der Katalog umfasst die vorbereiteten 24 Herausgeberkandidaten mit neuer read-only Publisher-Metadatenqualifikation. Gesamtparameterzahlen stammen aus Safetensors-Metadaten, nicht aus aktiven MoE-Parametern oder Namen. Die konkrete frei zugängliche LFM2.5-2.6B-Q4_0-GGUF ist inklusive Revision, Bytes, SHA256 und Herausgeber-Lizenz gepinnt. Dieses Artefakt trägt **kein** übertragenes QAD-/Ollama-Testbadge. Dessen historischer Vergleich ist separat als Forschungsevidenz sichtbar.

Andere Architekturen bleiben mangels exakter gebündelter Runtime-/Artefaktqualifikation gesperrt. Keine Forks, Runtime-Downloads oder versteckten Major-Upgrades wurden eingeführt. Ungeklärte Karten können explizit eingeblendet werden; ein Größenhaken umgeht keine Kompatibilitäts- oder Lizenzprüfung. Bei sehr großen unbekannten Artefakten kann eine konservative 2-bit-Untergrenze einen offensichtlichen RAM-Mangel erklären, stellt aber kein Speicherprofil dar.

## Benchmarks und Nutzung

Eine ausführbare neue synthetische Suite enthält 16 versionierte Aufgaben; der Kurztest verwendet sechs. Standard führt eine Aufwärmanfrage und drei Wiederholungen durch. JSON-Inhalt und strikte Form werden getrennt bewertet; Toolausgaben werden niemals ausgeführt. Abbruch beendet die eigene Session, verhindert Folgeanfragen und erhält Teilresultate. ComputeAdmission teilt reale Slots mit bestehenden Jobs; Slots werden erst nach bestätigtem Ende eigener Prozesse freigegeben.

Die SSE-Messung unterscheidet sichtbaren Content vom ersten Streamereignis. Runtime-gemeldete Tokenzahlen/Decodewerte bleiben gekennzeichnet. RSS wird optional über vorhandenes psutil alle 100 ms für die eigene Session beobachtet; fehlende Messung bleibt unbekannt. Keine GPU-Messbehauptung. Lokale Ergebnisse bleiben lokal; Exporte enthalten keine privaten Pfade, Credentials oder Nutzernamen. Importe werden schema-/hashgeprüft und immer als fremde Gerätebelege behandelt.

Bewusste Aktivierung nach erfolgreichem Gerätebenchmark ermöglicht einen reinen Settings-Textchat. Für den bestehenden nativen AUTO-Textpfad ist eine strengere Qualifikation implementiert: exaktes Standardartefakt/-gerät, 48/48 Inhalt und strikte Form, keine Sicherheits-/Toolfehler, gemessener RAM innerhalb Budget und Antwort-SLO. Bestehende Native-Writer-, Stop-, positive Simple-Task-, Governance-, Goal-, Attachment- und Teamwork-Gates bleiben wirksam. Eine fehlgeschlagene lokale Anfrage wird nicht automatisch in der Cloud wiederholt. Kein pauschaler Zugriff auf Browsertools und keine Agentenfreigabe aus einer Chat-Empfehlung.

## Lizenz

Strikt mehr als 100.000.000.000 Gesamtparameter benötigt kommerzielle LastBrowser-Berechtigung; genau 100B nicht. Quantisierung/MoE/Import ändern die Grenze nicht. Unbekannte Parameterzahlen sind gesperrt. Es wurde keine vorhandene vertrauenswürdige kommerzielle Lizenzverifikation entdeckt; die Entitlement-Schnittstelle verweigert daher die Großmodellfreigabe. Rendererflags, lokale JSON-Einstellungen und Herausgeber-Lizenzannahme können die LastBrowser-Berechtigung nicht ersetzen. Preise, Kaufablauf und Aktivierungsserver wurden nicht erfunden.

## Verbleibende konkrete Grenzen

- Kein Test/Build oder tatsächlicher Settings-/Download-/Lade-/Stop-/Paketnachweis in Phase 1.
- Kommerzieller Verifier fehlt; Großmodelle bleiben gesperrt, bis eine echte Berechtigungsquelle angebunden ist.
- Die weiteren 23 Kandidaten benötigen konkrete Artefakte, Runtimequalifikation und gegebenenfalls Herausgeber-Lizenzfreigabe; Karte ist keine Installationsfreigabe.
- Der implementierte gebündelte Pfad ist CPU. CUDA/Vulkan, Hybridprofile, Projektionen, MTP/Drafter und frei wählbare Quantisierungen sind nicht qualifiziert.
- Download-Stop erhält partielle Daten, ein erneuter expliziter Installationsauftrag kann sie fortsetzen. Eine separate Pause-Schaltfläche ist nicht implementiert.
- Unbekannte importierte Modelldateien werden nicht freigeschaltet; nur kuratierte exakte Gewichte sind zulässig.
- Benchmarks liefern getrennte Rohwerte und deterministische Validatoren; neue gespeicherte Bewertungsversionen sowie komplexe sprachliche Rubriken sind nicht implementiert.
- Oberfläche derzeit deutsch; bestehende Local-AI-Oberfläche behält ihre Lokalisierung.

Phase 2 wurde vom selben Owner durchgeführt: Die Store-Response bekam einen eigenen `storeResult`-Vertrag, die Benchmarkauswertung trennt nicht anwendbare Tools und prüft verschachtelte Typen, doppelte Auftrags-/Ergebnisimporte werden begrenzt, und Löschen entfernt eine aktive Auswahl. Synthetische Backendverträge prüfen unter anderem die exakte 100B-Grenze, Rendererflags und Tool-/Sicherheitsfehler. Die vollständige AGENTS-Pipeline wird zusätzlich auf einem isolierten Baum mit ausschließlich eigenen Änderungen ausgeführt. Diese Quellprüfungen ersetzen keine tatsächliche Geräte-/Paketabnahme. Fremde Baselineänderungen sind ausgeschlossen.

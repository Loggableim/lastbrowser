# FIX1: Lokale Inferenz, AUTO-Routing und Ressourcenlimits

Stand: 2026-10-05

## Ergebnis des echten CPU-Laufs

Ein einmaliger, explizit autorisierter Benchmark hat eine echte lokale Antwort
über den vorhandenen `ModelRuntimeManager`, den privaten `bootstrap_benchmark`
und das gepinnte llama.cpp-Build erzeugt. Er startete keinen zweiten Agenten-
Stack und änderte keine Verfügbarkeitsevidenz des Produkts.

| Messwert | Beobachtung |
| --- | --- |
| Modell | `LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0` |
| Modellrevision / SHA-256 | `b27f8147d98080b0d6f063ff41de6e381ea9a530` / `e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292` |
| GGUF-Größe | 149,081,056 Bytes |
| Runtime | `llama-cpp-b11377-win-cpu-x64`, SHA-256 `e400ec25de0f806ac45ddbd93813b8ebd8816a3883460a7b252418d6eaf04f6b` |
| Hardware | AMD64 Family 25 Model 33, 32 logische Kerne, 32 GiB RAM |
| Testgrenze | CPU, 1,024 Kontexttokens, ein paralleler Request, 768 MiB Prozess-RAM-Cap |
| Cold start / Antwort / gesamte Operation | 1,011 ms / 170 ms / 2,463 ms |
| Gemessener Spitzenarbeitsspeicher | 297,373,696 Bytes (ca. 284 MiB) |
| Kontrollierte Antwort | `Die Hauptstadt von Österreich ist Wien.` |

Das beweist genau diese einzelne lokale Textantwort unter den genannten
Bedingungen. Es beweist keine allgemeine Antwortqualität, 64K-Kontext,
Tool-Aufrufe, Klassifikation, AUTO-Entscheidung, Parallelbetrieb,
Speicherprofil-Envelope oder produktive Agentenrolle. Der normale Produktpfad
bleibt wegen `agent_64k_tool_adapter_unverified` und der ausstehenden Prüfung
der Redistribution-/Offline-Lizenzfreigabe unverändert gesperrt.

## Separater 350M-Kurzchatnachweis

Ein weiterer explizit autorisierter CPU-Lauf testete genau das gepinnte
`LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0` als begrenzte Chatrolle. Die
Modellrevision ist `9969000761ce34de907bf20017cbfc3d52d6eaf9`, die GGUF ist
219,312,832 Bytes groß und ihr SHA-256 ist
`3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d`. Der
revision-gepinnte Lizenztext ist 10,596 Bytes groß; SHA-256
`5188f2b355da20647257a3156db5834c794e5fb5e6d8dc4d4cdbb3180e75b85b`.

Bei 1,024 Kontexttokens, einem parallelen Request und einem privaten
768-MiB-Limit bestanden drei kontrollierte Kurzantworten („Wien“, „4“, „H₂O“).
Cold Start: 975 ms; langsamste Antwort: 181 ms; gemessene Spitze: 440,377,344
Bytes (ca. 420 MiB); gesamter Lauf: 2.67 s. Das erlaubt ausschließlich
eine begrenzte Chat-Adaptervorbereitung mit frischem Qualitäts-/SLO-Beleg. Es
beweist weder allgemeine Konversationsqualität noch Routerklassifikation,
Tool-Use oder 64K-Agentenfähigkeit. `productAvailable` und
`recommendationEligible` bleiben false; die gesonderte Produktfreigabe prüft
außerdem Runtime-, Lizenz- und Scope-Belege erneut.

Der 350M wurde zusätzlich als Routerklassifikator geprüft. Er traf nur 2 von 14
festen Labels. AUTO verwendet daher weiter die deterministische, konservative
Policy und kann bei unklarer/komplexer Aufgabe nur den exakt gewählten Provider
beibehalten. Der bestehende Streamingpfad ist noch nicht angeschlossen. Der
Integrationspunkt im Backend ist `streaming.py` direkt nach
`resolve_model_provider(model_with_provider_context(model, provider_context))`;
die Entscheidung benötigt dort den trusted Scope-/Profil- und aktuellen
Capability-Check. Diese Datei wurde in FIX1 nicht verändert, damit die
gemeinsame Providerauswahl koordiniert bleibt.

## Installationsbefund

Der Installer lud die Lizenz zuvor über die revision-gepinnte Hugging-Face
`/resolve/.../LICENSE`-Adresse, die eine HTML-Seite statt des Lizenztexts
zurückgab. Dadurch stimmte der erwartete Digest nicht. Die tatsächliche
`/raw/{revision}/LICENSE`-Datei lieferte 10,574 Bytes mit dem gepinnten
SHA-256 `30adf9d6478191fb87f2424f63ba0728598335aaf99cd2848ef17e8e545fe94b`.
Der Installer nutzt nun genau diese Raw-Datei; der für den Nutzer sichtbare
Lizenzverweis bleibt auf der Blob-Seite. Modellgewichte wurden in diesem Lauf
nicht heruntergeladen: die vorhandene Datei wurde vor Verwendung auf Größe und
SHA-256 geprüft. Setup, Hashprüfung und atomare Installation liefen weiter über
die bestehende Installer-Implementierung.

## UI- und Backend-Vertrag

Der Renderer kann globale Laufzeit- und Routerfähigkeit anzeigen, soll die
einzelne Benchmark-Beobachtung aber nicht als aktiven Router darstellen. Ein
stabiler lesender Statusvertrag sollte mindestens diese Zustände trennen:

```ts
type LocalAiCapabilityStatus = {
  schemaVersion: 1;
  revision: string;
  runtime: {
    state: "ready" | "blocked" | "unavailable" | "unknown";
    backend: "cpu" | "gpu" | null;
    buildRef: string | null;
    reasonCodes: string[];
  };
  router: {
    state: "ready" | "blocked" | "unavailable" | "unknown";
    productAvailable: boolean;
    reasonCodes: string[];
  };
  observations: Array<{
    role: string;
    artifactId: string;
    artifactRevision: string;
    contextTokens: number;
    parallelRequests: number;
    observedAt: string;
    evidenceRef: string;
  }>;
};
```

`observations` sind reine Nachweise und schalten nichts frei. `router.state`
bleibt `blocked`/`unknown`, bis eine produktive, aktuelle Operationsevidenz
inklusive Runtime-, Adapter-, Qualitäts- und Ressourcenfreigabe vorliegt.
Reason-Codes bleiben maschinenlesbar und die UI lokalisiert ihre Anzeige.
Anfragen müssen an Scope und Profilrevision gebunden und read-only sein; der
Renderer liefert weder Hardwarebelege noch Lizenzzustimmungen, Plan-Digests,
Pfade oder Runtime-Identitäten.

## AUTO-Routing und Quoten: nächster Nachweis

Der echte 230M-QAD-Lauf prüfte zusätzlich drei festgelegte deutsche
Routerprompt-Beispiele. Erwartet waren `SIMPLE`, `COMPLEX`, `UNCLEAR`; beobachtet
wurden `UNCLEAR`, `UNCLEAR`, `SIMPLE`. Das Modell ist somit als Router nicht
qualifiziert, obwohl es den separaten Hauptstadt-Fakt korrekt beantwortete.
Eine automatische lokale Klassifikation über dieses Modell bleibt gesperrt.

`auto_router.py` enthält eine deterministische Vorentscheidung für kurze,
einfache Anfragen, komplexe Aufgaben und unklare Formulierungen. Die
Policy routet lokal nur dann, wenn der vertrauenswürdige Host
`local_chat_ready=true` liefert. Solange die Produktnachweise fehlen, bleibt
der exakt aktive Provider für alle Kategorien die Route. Komplexe und unklare
Anfragen wechseln ebenfalls nicht selbsttätig den Provider. Ist kein verifizierter
Pfad verfügbar, lautet der Zustand `unavailable`. Eine lokale Route ist strikt
auf 1K Kontext, 48 Ausgabetokens, eine gleichzeitige Anfrage, 768 MiB und 25
Sekunden begrenzt.

Das ist eine getestete Policy, aber noch kein Anschluss an den Chat-Streaming-
Pfad. Für diesen fehlen derzeit ein produktiver Chat-Adapter, passende
Operation-/Memory-Profilevidenz und eine Integration des trusted capability
checks in den bestehenden Provider-Auswahlpfad. Der Renderer darf diese Gates
nicht ersetzen. AUTO-Klassifikation durch ein Modell benötigt einen anderen
gepinnten Adapter und einen bestandenen echten Qualitätslauf; sie kann nicht aus
der deterministischen Policy oder dem Antwortbeleg abgeleitet werden.

Die einzige gemessene Quote dieses Laufs ist das private Testlimit von 768 MiB
für einen Request. Die gemessene Spitze war ca. 284 MiB bei 1K Kontext; sie ist
kein allgemeines Speicherprofil. Produktquoten brauchen getrennte Messungen für
kalten und warmen Start, größere Kontextstufen, wiederholte Anfragen,
Abbruch/Unload und Speicherdruck unter Browserlast. Der vorhandene Broker muss
weiterhin der einzige Compute-Admission-Owner bleiben; unbekannte oder alte
Messungen erlauben keine zusätzliche Parallelität.

## Änderungen und Prüfung

- `bootstrap.py`: der feste Agent-Benchmarkprompt ist deutsch; ein echter
  Loader-Fehler wird im privaten Benchmark als stabiler Grundcode sichtbar.
- `model_manager.py`: kleiner Agent-Kontext ist nur mit einmaligem privatem
  Benchmark-Permit möglich; normale Produktloads behalten ihre Grenzen.
  Diagnose-Stderr ist standardmäßig weiterhin stumm und nur im opt-in Test
  temporär in eine eigene Datei umgeleitet.
- `router_bootstrap_download.py`, `registry.py`, `setup.py`: revision-gepinnte
  Lizenz-Downloadadresse und Referenz werden getrennt geprüft.
- `auto_router.py`: deterministische, konservative Routing-Policy mit exactem
  Providererhalt und lokalen Ressourcenobergrenzen.
- `model_adapters.py`, `role_adapters.py`, `role_pipeline.py` und
  `product_profiles.py`: eng begrenzte Rolle `chat.answer` für den exakt
  gepinnten 350M-QAD-Kandidaten (1K Kontext, höchstens 48 Ausgabetokens, ein
  paralleler Request); `agent` bleibt gesperrt.
- `resources.py` und `local_ai_runtime_host.py`: Chat-Ausführung erfordert
  frische Qualitäts-/SLO-Belege sowie passende Scope-, Runtime-, Adapter- und
  Ressourcenbelege; Diagnosebenchmark wird nicht als Produktverfügbarkeit
  ausgegeben.
- `test_local_ai_auto_router.py`: deutsche Fixtures für einfache, komplexe und
  unklare Aufgaben sowie Providererhalt und fehlende Fähigkeit.
- `test_local_ai_real_inference_smoke.py`: opt-in echter CPU-Lauf mit
  expliziter Autorisierung, geprüftem Modellhash, privatem Testprofil,
  RAM-/Zeitlimit und begrenztem Cleanup. Er erzeugt keine Produktverfügbarkeit.
- Verifiziert in diesem Turn: gezielte Regressionen über Router-Policy,
  Adapter, Profile, Runtime-Ressourcen, Kompatibilität und Host **59 passed**;
  350M opt-in CPU-Benchmark **1 passed** mit `operationVerified=true`,
  typisierten Belegen vorhanden, aber `productAvailable=false` und
  `recommendationEligible=false`. Separater 230M-Lauf: echte Antwort korrekt,
  Router-QAD-Qualität ausdrücklich nicht bestanden.
- Nicht ausgeführt: vollständige Sidekick-/Desktop-Suite, Chat-Streaming-
  Integration, produktive Router-Klassifikation und Redistribution-/Store-
  Freigabe.

Die Änderungen sind uncommitted; Git-Index und Commits bleiben beim Root-Agenten.

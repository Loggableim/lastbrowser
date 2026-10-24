# Installer-Größe: Modelle und Engines bei Bedarf nachladen

Status: Konzept + Prototyp (Branch `feat/322-on-demand-model-runtime`), kein Release.
Bezug: #322, Bead `la-5ry`.

## 1. Messung

Größe der veröffentlichten Windows-Installer (GitHub-Release-Assets):

| Version | Setup.exe |
| --- | ---: |
| 0.1.52 | 161,2 MB |
| 0.1.53 | 160,7 MB |
| 0.1.55 | 167,3 MB |
| 0.1.56 | 277,6 MB |
| 0.1.58 | 640,2 MB |

Der Sprung 0.1.55 → 0.1.56 (+110 MB) fällt mit der Einführung von Local AI zusammen.
Der Sprung 0.1.56 → 0.1.58 (+363 MB) ist nicht durch Modellgewichte erklärbar.

## 2. Ursache in 0.1.58

Ab 0.1.58 wird `apps/desktop/runtime/local-ai` als zusätzliche Ressource mit
`filter: ["**/*"]` verpackt. Der gepinnte Katalog
`services/sidekick/runtime/local_ai/store-runtime-registry.json` listet vier Engines:

| Engine | Backend | Dateien | Rohgröße |
| --- | --- | ---: | ---: |
| llama.cpp b11429 | CPU | 45 | 53,9 MB |
| llama.cpp b11429 | Vulkan | 46 | 99,2 MB |
| stable-diffusion.cpp 964 | CPU | 35 | 46,4 MB |
| stable-diffusion.cpp 964 | Vulkan | 36 | 89,1 MB |
| **Summe** | | **162** | **288,5 MB** |

Die Engine-DLLs (`ggml-vulkan.dll` 45,3 MB, `stable-diffusion.dll` 35,5 MB)
sind bereits komprimiert; ZIP/NSIS gewinnt dort kaum. Das erklärt den
Großteil des Wachstums. Modellgewichte (`.gguf`) sind in beiden Linien
**nicht** im Installer: Der Paketfilter schließt `**/*.gguf` aus, und der
`LocalAiManager` lädt Gewichte ausschließlich nach expliziter Nutzeraktion
von Hugging Face (immutable Revision, Größe + SHA-256).

Auf dem aktuellen Basisbranch (`codex/lastbrowser-electron-shell`, llama.cpp
b11377) werden CPU- und Vulkan-Engine weiterhin als ZIPs gebündelt:
19,4 MB + 33,3 MB = **52,6 MB Archiv**, entpackt deutlich mehr. Auch diese
Engine-Binaries müssen nicht in den Installer.

## 3. Was der Installer künftig enthält

Nur noch Katalog und Vertrauensanker:

- `models.json` (Modellkatalog, keine Gewichte)
- `runtime-lock.json` (Engine-Version, Download-URLs, Byte-Größen, SHA-256,
  exakte Dateiliste)
- Lizenzen
- Python-Runtime und Sidekick (unverändert; laut Audit ~104,6 MB entpackt,
  davon ~7.450 Dateien)

Zusätzlich ausgeschlossen: `sidekick/tests` (~3,3 MB Quelle), `sidekick/docs`,
Source Maps. `__pycache__`, `.pyc`, `.pytest_cache` und
`site-packages/tests` waren bereits ausgeschlossen.

## 4. Zielbild: Engine und Gewicht getrennt nachladen

1. Installer startet ohne lokale Engine. Local AI ist optional und zeigt
   "Runtime herunterladen".
2. Die App lädt das gepinnte Engine-Archiv (CPU oder Vulkan) über HTTPS,
   prüft Byte-Größe und SHA-256 des Archivs, entpackt **nur** die im Katalog
   gelisteten Dateien, prüft jede Datei erneut per SHA-256 und ersetzt das
   Backend-Verzeichnis atomar.
3. Erst danach sind Modell-Download, Import und Start freigeschaltet.
4. Modellgewichte bleiben wie heute separat und mit derselben
   Prüfkette (Größe + SHA-256, Resume, atomare Installation).
5. Der Katalog ist die einzige Quelle für URLs und Pfade. Renderer-IPC
   akzeptiert weder beliebige URLs noch Dateipfade.

## 5. Prototyp in diesem Branch

- `apps/desktop/src/main/local-ai-runtime.ts`
  - validiert `runtime-lock.json` (Plattform, Backend, HTTPS-Quelle,
    sichere relative Pfade, Hashes),
  - lädt mit Fortschritt und Abbruch, prüft Größe + SHA-256,
  - liest ZIP lokal (stored/deflate), extrahiert ausschließlich gepinnte
    Dateien, prüft jede Datei per SHA-256,
  - arbeitet in einem Staging-Verzeichnis und ersetzt das Backend atomar.
- `apps/desktop/vendor/local-ai/runtime-lock.json` enthält jetzt `url` und
  `bytes` für beide b11377-Archive.
- `LocalAiManager.installRuntime(backend)`, IPC
  `lastbrowser:localAi:installRuntime`, Preload und UI-Button.
- `local-ai-contract.ts`: `runtimeBackends` meldet installierte Backends;
  `start()` verweigert nicht installierte Backends mit klarer Meldung.
- Paketierung: `extraResources` kopiert nur noch Kataloge/Lizenzen, keine
  `cpu/`- oder `vulkan/`-Binaries.
- `prepare-local-ai.mjs` prüft die Archive weiterhin offline. Entpacken
  passiert nur mit `LASTBROWSER_BUNDLE_LOCAL_AI_RUNTIME=1`.
- `verify-local-ai-signatures.cjs` schlägt bei `EVS_REQUIRED=1` bewusst fehl,
  solange keine signierten On-Demand-Archive existieren (fail closed).
- Tests: `apps/desktop/tests/local-ai-runtime.test.ts` deckt Erfolg,
  manipuliertes Archiv, fehlende Datei, falschen Dateihash, unsichere
  Katalogpfade, fremde Plattform und Idempotenz ab.

## 6. Größenwirkung (Schätzung)

- Aktueller Basisbranch: ca. 50 MB weniger Installer (Engine-ZIPs).
- 0.1.58-Linie: 288,5 MB Engine-Payload weniger; da die DLLs kaum
  komprimierbar sind, ist die Einsparung im Setup nahe der Rohgröße.
- Zusätzlich klein: `sidekick/tests` und Docs.

Die exakte Setup-Größe muss auf Windows mit Cid gemessen werden; dieser
Branch enthält keine Release-Artefakte.

## 7. Offene Blocker vor einer Aktivierung als Standard

1. **Signierung**: Heute signiert die Release-Pipeline gebündelte
   Engine-Binaries per Azure Trusted Signing und `afterPack` verifiziert sie.
   Heruntergeladene Dateien sind damit nicht automatisch signiert. Vor dem
   Default muss der Release-Prozess die Engine-Archive signieren, gehashte
   Kopien auf einer eigenen Download-Domain hosten und die App die
   Authenticode-Signatur zusätzlich zur SHA-256 prüfen. Bis dahin bleibt der
   Prototyp fail-closed und nicht release-fähig.
2. **Offline-Installation**: Ein Setup ohne Netz kann Local AI nicht
   bereitstellen. Cloud-Chat und Browser bleiben nutzbar; die UI muss das
   klar sagen. Optional ist ein separates Offline-Engine-Paket möglich.
3. **Store-Richtlinien**: Nachladen von ausführbarem Code nach der
   Installation muss mit den Microsoft-Store-Regeln und der
   Datenschutzerklärung abgeglichen werden.
4. **Erster Start**: Download-Größe, Fortschritt, Abbruch/Resume und
   Fehlerfälle (Proxy, AV, Port) brauchen einen kurzen UX-Test.
5. **Lizenzen**: Engine- und Modelllizenzen müssen weiterhin mitgeliefert
   und bei On-Demand-Downloads angezeigt werden.

## 8. Nicht-Ziele

- Kein Release, kein Tag, kein Merge.
- Keine Änderung an Modellkatalog, Modell-Downloads oder Cloud-Providern.
- Keine Lockerung der Python-Pins oder Test-Skips.
- Keine Signatur-Abmilderung: der `afterPack`-Gate bleibt fail closed.

## 9. Abnahmekriterien für die Folgearbeit

- Signierte Engine-Archive auf eigener Domain, SHA-256 + Authenticode
  geprüft, Release-Gate wieder aktiv.
- Gemessener Windows-Installer mit Zielwert (Vorschlag: < 300 MB) und
  dokumentierten Exit-Codes.
- Clean-Machine-Test: Installation ohne Netz, Runtime-Download mit
  Abbruch/Resume, CPU- und Vulkan-Start, Modell-Download und Tool-Test.
- Store- und Rechtsprüfung abgeschlossen.

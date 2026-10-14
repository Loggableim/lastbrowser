# Ausschließlich installierbare Store-Auswahl

Quellbasis: `ee8a361a5c956cd2bd340ce659e91902fb2ccdc1`. Nutzerauftrag: alle gelisteten Modelle mit direktem Installieren und Deinstallieren; nicht einfach installierbare Kandidaten entfernen.

## Ergebnis

43 kuratierte Einträge vor Anpassung, 38 gültige Runtime-Bundles, exakt 38 übereinstimmende Modelle danach. Kein Runtime-Bundle liegt außerhalb der verbleibenden Curation. Alle folgenden Modelle besitzen unveränderliche Artefakt-, Lizenz- und vorhandene Enginebindungen; dies bestätigt keinen erfolgreichen Lauf auf dem konkreten Nutzergerät.

Entfernt wurden:

- `prism-ml/Ternary-Bonsai-2-27B-gguf` — Prism-PQ2-Engine fehlt.
- `deepseek-ai/DeepSeek-V4.1-Flash` — kein qualifizierter Loader und kein vollständiges gepinntes Bundle.
- `prism-ml/bonsai-image-ternary-4B-gemlite-2bit` — Gemlite/HQQ-Engine fehlt.
- `robbyant/lingbot-video-moe-30b-a3b` — MoE-/Refiner-Shardrezept nicht qualifiziert.
- `Nanbeige/Nanbeige4.2-3B` — eigener nanbeige42-Engine-Fork erforderlich.

Die getrennte Bonsai-WebGPU-Demofunktion ist kein Store-Modell und wird hierdurch nicht entfernt.

## Installieren und Entfernen

`ModelStore.view()` bietet neue Einträge nur mit `curated`, `installQualified` und vorhandenem `artifactManifest` an. Schon installierte Legacy-Modelle bleiben sichtbar, damit ihre Dateien entfernt werden können. Eine spätere redaktionelle Curation kann dadurch keine neue Discovery-only-Kachel ohne Installationspfad einblenden.

`_download_allowed()` hängt nicht von einem Inferenz-/Benchmarkbeleg oder einer GPU-Empfehlung ab. Er prüft die bereits qualifizierte Bundlebindung, aktuellen Hardware-Scan, Windows/x64, gemessenen freien Datenträger für Download und Staging sowie mindestens 512 MiB freien RAM. Die Aktivierung bzw. Ausführung bleibt separat an echte Geräte- und Ressourcenbelege gebunden. Hardwareempfehlung und Installation sind damit getrennt; ein Modell oberhalb der eigenen VRAM-Klasse kann bewusst heruntergeladen werden, wenn ausreichend Datenträger vorhanden ist.

Die bestehenden `install`- und `remove`-Operationen sind in beiden lokalen Backend-Routen angebunden. Installation transportiert den aktuellen `licenseDigest`, verifiziert jedes Bundlefile und hinterlegt eine scoped Installation. Entfernen löscht ausschließlich die im Modellmanifest genannten Dateien unter dem scoped `models/<model-key>`-Verzeichnis und entfernt den Installationseintrag. Die gemeinsam genutzte gebündelte Engine wird nicht gelöscht. Eine aktive Modellauswahl wird zurückgesetzt; laufende Jobs oder Sessions führen zu `model_store_busy`, statt aktive Prozesse oder fremde Dateien heimlich zu löschen. Alle Text-, Bild- und Videomodelle nutzen diesen gemeinsamen Pfad.

## Verbleibende Modelle

### Text / Assistenz / Coding — 29

- IBM Granite 4.2 3B, 8B, 30B
- YoozLabs Qwen3.5 4B QAT GGUF
- Google Gemma 4 E2B, E4B, 12B, 26B-A4B, 31B
- Mistral Ministral 3 3B, 8B, 14B Instruct; 14B Reasoning
- Qwen3.5 9B, 122B-A10B
- Qwen3.8 27B
- Qwen3.6 35B-A3B
- Qwen3 Coder Next
- Qwen3 235B-A22B Instruct 2507
- Z.ai GLM-4.6V Flash, GLM-4.7 Flash, GLM-5.3 Flash
- OpenAI GPT-OSS 20B, 120B
- InclusionAI Ling 3.0 Tiny GGUF, Ling 3.0 Flash
- Mistral Devstral Small 2 24B
- Mistral Small 4 119B
- Nanbeige 4.1 3B

### Bild — 4

- FLUX.2 Klein 4B
- Z-Image Turbo
- Qwen Image 2512
- LongCat Image

### Video — 5

- Lingbot Video Dense 1.3B
- Wan 2.2 TI2V 5B
- Wan 2.2 T2V A14B
- Wan 2.2 I2V A14B
- Wan 2.2 S2V 14B

## Prüfgrenze

Quellprüfung von Bundlemanifesten, Curation-/Registry-Abgleich, Install-/Remove-Routen und Python-Syntax. Keine Gewichte heruntergeladen, keine Modell- oder Installationsläufe, keine Volltests. Der separate Root-UI-Patch stellt direkte Kartenaktionen und sichtbare Lizenzinformation bereit; dieses Dokument bestätigt dessen Laufzeitverhalten nicht.

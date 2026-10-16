# Vorhut-Training, 16.10.2026

Arbeitsbericht von Cid. Nur Dokumentation. Pipeline und Controller liegen lokal bei Cid und sind nicht Teil dieses Pull Requests.

Stand 16.10.2026. Hardware: Intel Arc A770, 16 GB.

`local-ai-controller.ts` und `LocalVorhutController` bleiben auf Cids Rechner. Sie sind nicht im Repo, und das bleibt so.

## Sidekick Cortex Lite

Modell `granite-4.0-350m`, Lizenz Apache-2.0.

- 3.000 Samples, 600 pro Sidekick
- LoRA r=32, alpha=64, all-linear, Assistant-only Loss
- GGUF Q4_K_M, etwa 260 MB
- Benchmark, 500 Runs: 98,8 % (494/500)
- Persona-Invarianz: 97,0 %
- super_easy: 100 %
- Behoben: 39 zu konservative Einstufungen, 22 Code-Fehlleitungen

## Sidekick Cortex

Modell `granite-3.1-1b-a400m-instruct`, Mixture of Experts. 1,34 Milliarden Parameter gesamt, 400 Millionen aktiv, 32 Experten, Top-8.

- 5-Level-Schema L1 bis L5
- 3.000 Train, 250 Val
- 4 Epochen, 752 Steps
- Train Loss 0,193
- Eval Loss 0,0126
- GGUF Q4_K_M, 782 MB, etwa 875 MB VRAM
- Ollama-Name: `lastbrowser-vorhut-xl`
- Benchmark, 500 Runs: 92,0 % gesamt (460/500)
- L1 85 %, L2 78 %, L3 99 %, L4 99 %, L5 99 %
- Latenz: p50 147 ms, p95 183 ms, p99 213 ms
- Persona-Invarianz: 87 %
- Schwachstelle: Verwechslung L1/L2 (7 und 11 Fälle) sowie einige L1/L2, die in L3 landen

## Fix für den Intel-Treiber

Granite-MoE stürzte auf Level-Zero ab (`UR_RESULT_ERROR_DEVICE_LOST`). Fancy-Indexing in `GraniteMoeTopKGating` und `GraniteMoeMoE` wurde per Monkey-Patch durch `torch.index_select` ersetzt. Danach lief das Training stabil in bf16, 0,58 Sekunden pro Step.

## Artefakte

Die Dateien liegen lokal bei Cid:

- `1_generate_dataset_xl.py`
- `2_train_lora_xl.py`
- `Modelfile.vorhut-xl`
- `benchmark_xl_100.py`
- `run_benchmark_xl_100.py`
- `REPORT_BENCHMARK_XL.md`
- `data/lastbrowser_facts.yaml`

## Offen

- L1/L2-Trennschärfe bei Sidekick Cortex verbessern
- Ausgabeformat auf die Satz-Pool-Spezifikation in #296 umstellen: für L3 bis L5 nur die Stufe, kein frei generierter Satz

Kein Build, kein Merge, kein Tag, kein Release.

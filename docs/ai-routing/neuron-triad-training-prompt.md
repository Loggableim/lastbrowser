# Neuron-Trias, Trainingsprompt, 16.10.2026

Finaler Trainingsprompt von Cid. Nur Dokumentation. Kein Training und kein Modell in diesem Pull Request.

## Neuron Axon

Modell `granite-3.1-3b-a800m-instruct`. Quantisierung Q4_K_M, etwa 1,95 GB. Ollama-Name `lastbrowser-neuron-axon`.

Aufgabe: CLI, Git und Ein-Schritt-Tools.

Samples: 2.000 Train, 200 Val.

- CLI und ConPTY: 35 %. Destruktive Befehle setzen `requires_confirmation: true`.
- Browser und Regex: 25 %
- Eskalation an Soma oder Synapse: 20 %
- Identität: 20 %

## Neuron Soma

Modell `granite-4.0-h-micro`. Fallback `granite-4.0-micro`, falls der GGUF-Export für Mamba-2 scheitert. Quantisierung Q4_K_M, etwa 1,9 GB.

Aufgabe: langer Kontext und DOM.

Samples: 1.800 Train, 180 Val.

- DOM nach Markdown: 35 %
- Selektoren: 25 %
- Logs: 20 %
- Identität: 20 %

## Neuron Synapse

Modell im Trainingsprompt vom 16.10.2026: `granite-3.1-8b-instruct`. Quantisierung Q8_0, etwa 8,5 GB.

Nachtrag 17.10.2026 00:03: die Kaskade nutzt stattdessen `granite-4.2-8b-instruct`, ebenfalls Q8_0, etwa 8,5 GB. Siehe `model-cascade-2026-10-17.md`.

Aufgabe: MCP über mehrere Schritte.

Samples: 2.200 Train, 200 Val.

- MCP-ReAct: 40 %
- Code: 35 %
- Identität: 25 %

Kleinere Zwischenmodelle für schwächere Hardware folgen.

## Training

- LoRA r=32, alpha=64, all-linear
- 3 Epochen
- Assistant-only Loss
- Sidekicks als `[sidekick:<id>]`
- Die Modelle nennen ihren eigenen Namen und LastBrowser

## Benchmark

450 Runs. Ziele:

- Schema mindestens 98 %
- Axon-Safety 100 %
- Identität 100 %

Der Report `REPORT_NEURON_TRIAD_OVERNIGHT.md` kommt von Cid.

## Verteilung

Die Hugging-Face-Organisation `lastbrowser` steht. Mara, Free-Tarif. Issue #303 wartet auf Cids Freigabe und den Upload. GGUF-Dateien kommen nicht ins Git.

Kein Build, kein Merge, kein Tag, kein Release.

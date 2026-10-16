# 5-Modell-Kaskade, 17.10.2026 00:03

Festlegung von Cid für die nächste Version. Nur Dokumentation. Die Modelle trainiert Cid. Die `phrase_id` wählt der Client, nie das Modell.

| Stufe | Name | Modell | Größe | Aufgabe |
| --- | --- | --- | --- | --- |
| 1 | Sidekick Cortex Lite | granite-4.0-350m | etwa 0,25 GB | Router und Latenz-Maskierung, etwa 114 ms |
| 2 | Sidekick Cortex | granite-3.1-1b-a400m MoE | etwa 0,88 GB | Routing L1 bis L5 und Direktantworten L1/L2, etwa 147 ms |
| 3 | Neuron Axon | granite-3.1-3b-a800m MoE | etwa 1,95 GB | CLI, Git und Ein-Schritt-Tools |
| 4 | Neuron Soma | granite-4.0-h-micro, Mamba-2-Hybrid | etwa 1,9 GB | langer Kontext, DOM und Logs |
| 5 | Neuron Synapse | granite-4.2-8b-instruct | Q8_0, etwa 8,5 GB | Code und MCP-Agenten |

Neuron Synapse ersetzt damit `granite-3.1-8b-instruct` aus dem Trainingsprompt vom 16.10.2026.

## Betriebsarten

- Standard: Router plus Axon plus Soma, etwa 5 GB
- Flagship: zusätzlich Synapse, etwa 12,1 GB

Kleinere Zwischenmodelle für schwächere Hardware folgen. Kein Build, kein Merge, kein Tag, kein Release.

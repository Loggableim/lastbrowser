# Model Store: Nutzervorschläge für die nächste private Beta

Stand: 14. Oktober 2026. Quellbasis der ersten Kandidatenauswahl: `ff12244e8ed722c421724208b6e80ae792893e0f`.
Nachfolgende Nutzerentscheidung: ausschließlich installierbare Modelle im Store. Daher ist Nanbeige 4.2 aus der sichtbaren Curation entfernt; seine folgende Bewertung bleibt als historische Entscheidung dokumentiert. Aktuell maßgeblich ist `model-store-installable-selection-20261014.md`.
Öffentliche Metadaten, Lizenzdeklarationen, Lizenztexte und gepinnte Loaderquellen wurden gelesen.
Keine Gewichte heruntergeladen, kein Modell ausgeführt, keine Leistung gemessen.

## Integriert

| Modell | Store-Status | Konfiguration und Ressourcen |
|---|---|---|
| [Nanbeige 4.1 3B](https://huggingface.co/Nanbeige/Nanbeige4.1-3B) | Gepinnter Downloadkandidat, Geräteprüfung weiterhin erforderlich | mradermacher Q4_K_M, 2.443.113.024 Bytes; 3.933.637.120 Gesamtparameter. 6 GiB freier RAM bzw. 4 GiB VRAM-Anforderung; empfohlene GPU-Klasse 6 GiB. Kurzer 4K-Kontext für Erstprüfung. |
| [Qwen3 235B A22B Instruct 2507](https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507) | Gepinnter Downloadkandidat für große Systeme, Geräteprüfung erforderlich | Unsloth Q4_K_M: drei Shards, 142.154.074.880 Bytes (132,39 GiB). 235.093.634.560 Gesamtparameter. 150 GiB freier RAM bzw. 144 GiB VRAM-Anforderung. GPU-Klasse 192 GiB, RAM-Klasse 192–256 GiB. |
| [Nanbeige 4.2 3B](https://huggingface.co/Nanbeige/Nanbeige4.2-3B) | Nur entdecken; Engine nicht verfügbar | Neue `nanbeige`-Architektur statt normaler Llama-Layer. Herausgeber verlangt `nanbeige42`-Fork. Q4-Ressourcen sind Schätzungen, keine vermessenen Artefakte. |

Bei beiden Downloadkandidaten sind Gewichte, Notices, Lizenztexte und Loaderquellen unveränderlich auf Revision und SHA256 gebunden. Die gebündelten Engines bleiben unverändert. Ein Registry-Eintrag bestätigt Downloadintegrität und vorhandenen Architekturpfad; er bestätigt weder lokale Inferenz noch funktionierende Werkzeugaufrufe. Der bestehende Store verlangt weiterhin Geräte- und Tool-API-Prüfungen vor der jeweiligen Freigabe.

Nanbeige 4.1 verwendet `LlamaForCausalLM`, nicht Llama-3.1-Basisgewichte. Die eigene [Nanbeige4-3B-Base-Card](https://huggingface.co/Nanbeige/Nanbeige4-3B-Base) sowie Original und [Community-Quantisierung](https://huggingface.co/mradermacher/Nanbeige4.1-3B-GGUF) deklarieren Apache-2.0. Die Original-Repos enthalten keine separate LICENSE-Datei; deshalb werden alle drei Deklarationen und der exakt gehashte kanonische Apache-2.0-Text mit ausgeliefert. Das ist kein erfundenes originales LICENSE-Dokument. Sein Chat-Template verwendet ChatML und `<tool_call>`-JSON sowie Thinking. Das wurde nicht gegen den laufenden LastBrowser-Parser geprüft; es wird nicht automatisch als schnellstes Quickchat-Modell ausgewählt.

Qwen ist Apache-2.0 mit eigener gepinnter LICENSE-Datei. [Unsloth](https://huggingface.co/unsloth/Qwen3-235B-A22B-Instruct-2507-GGUF) liefert die drei zusammengehörigen Q4_K_M-Dateien. Der erste Shard ist der Einstieg, alle drei werden in ihrer ursprünglichen Unterverzeichnisstruktur heruntergeladen und gehasht. 22B aktive Parameter beschreiben Rechenarbeit je Token, nicht den Speicher für die gesamten 235B Gewichte. Vollständiger GPU-Betrieb passt nicht in 128 GiB. Der aktuelle Vulkan-Pfad bindet `Vulkan0` mit `--split-mode none`; Multi-GPU-Routing wird nicht behauptet. CPU-Betrieb ist eine getrennte große RAM-Konfiguration. 256K ist die Architekturgrenze, keine Zusage für den empfohlenen kurzen Erstkontext.

Nanbeige 4.2 deklariert Apache-2.0 ebenso wie sein eigenes Basismodell. Die [offizielle Anleitung](https://huggingface.co/Nanbeige/Nanbeige4.2-3B#llamacpp) verlangt jedoch einen anderen llama.cpp-Fork. Keine Remote-Code-Ausführung und kein Engine-Austausch erfolgen aus dem Store. FP8/GPTQ sind alternative Loaderformate; DSpark ist ein zusätzliches Beschleunigungsgewicht und kein eigenständiger Assistent.

## Ausgeschlossen oder zurückgestellt

| Vorschlag | Entscheidung |
|---|---|
| [HAMMER 2.1](https://huggingface.co/collections/MadeAgents/hammer21), 0.5B / 1.5B / 7B | CC-BY-NC-4.0; gemäß Nutzerregel nicht in der permissiven kuratierten Auswahl. |
| [HAMMER 2.1 3B](https://huggingface.co/MadeAgents/Hammer2.1-3b/blob/main/LICENSE) | Qwen Research License, kommerzielle Nutzung separat genehmigungspflichtig. |
| [Katanemo](https://huggingface.co/katanemo) Arch-Router / Arch-Agent / Plano-Orchestrator | Technisch interessant für Routing und Werkzeugwahl. Die aktuellen LICENSE-Dateien von Router 1.5B, Agent 3B und Plano 4B verlangen eine gesonderte kommerzielle Lizenz. Die tatsächlichen Dateien haben Vorrang vor älteren Modelcard-Angaben. Kein pauschales Apache-Label oder installierbarer Storeeintrag. |
| [ToolACE-2 Llama 3.1 8B](https://huggingface.co/Team-ACE/ToolACE-2-Llama-3.1-8B) | Apache-Label des Finetunings hebt [Llama-3.1-Basisbedingungen](https://github.com/meta-llama/llama-models/blob/main/models/llama3_1/LICENSE) nicht auf. Außerdem Python-artige Funktionslisten statt unseres geprüften Tool-Protokolls. Wegen permissiver Lizenzpolitik ausgeschlossen. Doppelt zugesandter Link zusammengeführt. |
| [Salesforce xLAM-2 70B fc-r](https://huggingface.co/Salesforce/Llama-xLAM-2-70b-fc-r) | Aktuelle offizielle Card CC-BY-NC-4.0; zusätzlich Llama-Basis. Ausgeschlossen. |
| [Nanbeige ToolMind-Web 3B](https://huggingface.co/Nanbeige/ToolMind-Web-3B) | Apache-2.0-Metadaten, Llama-Architektur, aber unzureichende offizielle Gebrauchsdokumentation für den jetzigen Store; spezialisierter Web-Trainingskandidat, keine schnelle automatische Freigabe. |
| [CoSineVerifier-Tool 4B](https://huggingface.co/Nanbeige/CoSineVerifier-Tool-4B) | MIT-Finetuning auf Apache-Qwen3-4B. Nützlicher wissenschaftlicher Verifier, benötigt Frage, Referenzantwort und Vorhersage plus genaue Prompt-/Python-Tool-Kette. Für künftige Qualitätsprüfung vorgemerkt, kein allgemeiner Chatbot und kein unkontrollierter Python-Demoimport. |
| Nanbeige4 3B Thinking 2510 / 2511 | Durch 4.1 bzw. 4.2 überholt; keine redundanten alten Store-Kacheln. |
| Nanbeige4 Base / 4.2 Base | Basismodelle für Training, nicht die gewünschte fertige Assistenz. |
| Nanbeige4.2 FP8 / GPTQ-Int8 / DSpark | Kein kompatibler gebündelter Loader bzw. Zusatzgewicht; nicht separat installierbar. |

## Provenienz

Nanbeige-Quantisierung: `c2c9e50a6bffb92c194c286e90cdf794b5657b13`, Q4_K_M SHA256 `0ba28f064c66071646e7959c752851abf02a096f1d37e7d0e443e3502e12ca02`.

Qwen-Quantisierung: `437d6915c5c512869e4cf8b16b840bbe3fb172bc`; Shard SHA256 stehen vollständig in `store-runtime-registry.json`.

Loaderbelege: llama.cpp `d81235049384534c167caea52b85a694f6103d14`, `src/models/llama.cpp` und `src/models/qwen3moe.cpp`. Diese Quellen stammen exakt aus der bereits gebündelten b11429-Engine-Revision.

Prüfung: Curation- und Registry-Schema erfolgreich geladen; Python-Syntax und Git-Diff-Hygiene geprüft. Nicht verifiziert: Inferenz, Template-/Toolparser, Benchmarkwerte, große Hardwarekonfigurationen, reale Downloadinstallation.

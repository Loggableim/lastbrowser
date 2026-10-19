# Spezifikationen (`docs/specs`)

Dieser Ordner enthaelt maschinenlesbare Spezifikationen fuer LastBrowser.

## Einheitliches Spezialisten-Manifest

Issue: #309 (Epic: Lokale KI-Alternative mit Granite-Spezialisten).

- Schema: [`specialist-manifest.schema.json`](./specialist-manifest.schema.json)
- Beispiele:
  - [`examples/neuron-zen-lora.example.json`](./examples/neuron-zen-lora.example.json) — LoRA-Persona (#307)
  - [`examples/granite-pdf-ocr.example.json`](./examples/granite-pdf-ocr.example.json) — eigenstaendiger Einzelaufgaben-Spezialist

Das Manifest beschreibt lokale KI-Spezialisten (LoRA-Personas, kleine
Einzelaufgaben-Modelle und Laufzeit-Module) in einer einheitlichen Form. Ziel ist,
dass Module zwischen Installationen austauschbar und reproduzierbar pruefbar sind,
ohne pro Modul ein eigenes Format zu pflegen.

### Abnahmekriterien aus #309 → Schemafelder

| Anforderung | Feld | Bedeutung |
| --- | --- | --- |
| Basis-Hash | `base.sha256` | SHA-256 der eingefrorenen Basisgewichte. Kompatibilitaetsgrenze: nur exakter Treffer erlaubt das Laden. |
| Aufgabe | `task` | `task.id`, `task.title`, `task.kind`, `task.category`, `inputs`, `outputs`. |
| Benchmark | `benchmark` | `suite`, `metrics[]` je mit `value`/`threshold`/`passed`, `thresholdsMet`, `referenceHardware`. |
| Groesse | `size` | `bytes` (Artefakt), `parameters`, `quantization`, `minDiskBytes`. |
| Hardware-Stufe | `hardware` | `minTier`, `tiers[]`, `requirements.ramBytes`/`vramBytes`. |
| Nur lokal, Telemetrie mit Opt-in | `telemetry` | Fester Wert `"opt-in"`; ein Manifest mit anderem Wert ist ungueltig. |

Pflichtfelder: `manifestVersion`, `id`, `name`, `version`, `task`, `base`,
`artifact`, `size`, `benchmark`, `hardware`, `license`, `telemetry`.

### Kompatibilitaetsregel (Basis-Hash)

Ein Adapter oder Spezialist darf nur geladen werden, wenn der SHA-256 der bereits
installierten Basisgewichte exakt `base.sha256` entspricht. Stimmt der Hash nicht
ueberein, wird das Modul abgelehnt statt mit einer fremden Basis gestartet. Das
ist die Voraussetzung fuer austauschbare Store-Module (#307).

### Hardware-Stufen

Die Stufen entsprechen der Einstufung des Installers
(`installer/launcher.py`, `CPU_TIERS`/`GPU_TIERS`):

| Stufe | Kriterium |
| --- | --- |
| `cpu_low` | unter 8 GB RAM, keine dedizierte GPU |
| `cpu_medium` | ab 8 GB RAM, keine dedizierte GPU |
| `cpu_high` | ab 16 GB RAM, keine dedizierte GPU |
| `gpu_low` | ab 4 GB VRAM |
| `gpu_medium` | ab 6–8 GB VRAM |
| `gpu_high` | ab 12 GB VRAM (NVIDIA/AMD) |

Beispiele: 8 GB RAM ohne GPU entspricht `cpu_medium`, 16 GB RAM mit kleiner GPU
entspricht `cpu_high` bzw. `gpu_low`, eine Intel Arc A770 16 GB wird vom Installer
als `gpu_medium` eingestuft.

### Validierung

Die Beispiele sind gueltige Instanzen des Schemas (JSON Schema Draft 2020-12).
Zur Pruefung genuegt ein vorhandener Validator, es werden keine neuen Abhaengigkeiten
benoetigt:

```bash
# Python (falls jsonschema vorhanden)
python3 -m jsonschema -i docs/specs/examples/granite-pdf-ocr.example.json docs/specs/specialist-manifest.schema.json

# Node (falls ajv-cli vorhanden)
npx --no-install ajv validate -s docs/specs/specialist-manifest.schema.json -d "docs/specs/examples/*.example.json"
```

Die SHA-256-Werte in den Beispielen sind Platzhalter, keine echten Pruefsummen.

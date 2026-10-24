# Granite-Modellkatalog für Router L1–L5

Stand: 2026-10-18. **Recherche und Entwurf; keine Umsetzung.** Es wurde kein
Modell heruntergeladen, kein Inferenz-Server gestartet und keine Router-Konfiguration
geändert. Alle Werte sind aus den unten genannten Quellen übernommen; Latenzwerte
sind ausdrücklich als Fremdmessungen gekennzeichnet.

Bezug: Bead `la-m4t` / Issue **#295** („Granite-Modellkatalog für Router L1–L5
(Größe, Lizenz, Latenz)"). Abnahme: Tabelle + Draft-PR.

## 1. Ausgangslage

Der Free-Tier-Router (`#320`, Branch `feature/320-router-m1`) kennt heute drei
Tiers — **leicht / mittel / schwer** — und mappt sie auf Ollama-Cloud-Modelle
außerhalb der Granite-Familie:

| Tier | Modell (M1) | Reasoning |
|------|-------------|-----------|
| leicht | `nemotron-3-nano` | off |
| mittel | `gpt-oss:20b` | off |
| schwer | `glm-5.3-flash` (nur Opt-in) | low |

`#321` und der Router als Ganzes sind laut Board-Bead `la-b0v` **pausiert**. Diese
Recherche ist deshalb eine reine Vorarbeit: Sie liefert einen Granite-Katalog, aus
dem später ein 5-stufiges Routing (L1–L5) abgeleitet werden kann. Es wird nichts
verdrahtet.

## 2. Annahme: Definition L1–L5

Im Repository existiert **kein** formales L1–L5-Schema (weder in Code, Docs noch
Beads). Damit die Tabelle eindeutig ist, wird hier folgende Arbeitsdefinition
vorgeschlagen — **vom Mayor/Felix zu bestätigen**:

| Level | Aufgabe | Latenz-Ziel | Beispiel-Trigger |
|-------|---------|-------------|------------------|
| **L1** | Routing/Intent, JSON-Klassifikation, einfache Extraktion | sehr niedrig (lokal, < ~0,5 s) | „Ordne diese Anfrage einem Provider zu" |
| **L2** | Einfache Chat-Antwort, kurze Zusammenfassung, Übersetzung | niedrig | „Fasse diesen Absatz zusammen" |
| **L3** | Standard-Assistenz, RAG, Funktionsaufruf, kurzer Code | mittel | „Beantworte per Websuche" |
| **L4** | Agentisch, Mehrtool/Abläufe, Coding-Aufgaben | höher | „Führe eine mehrstufige Aufgabe aus" |
| **L5** | Schwere Reasoning-/Planungs-/Debug-Aufgaben | am höchsten | „Analysiere diesen Fehler tiefgehend" |

Die Stufen sind an den bestehenden Router angelehnt: `leicht` ≈ L1–L2,
`mittel` ≈ L3–L4, `schwer` ≈ L5.

## 3. Granite-Familien im Überblick

Alle hier gelisteten Granite-Sprachmodelle stehen unter **Apache 2.0**
(keine Nutzungsbeschränkung, kommerziell und Forschung) und sind laut IBM
**kryptografisch signiert** sowie unter **ISO 42001** zertifiziert (AIMS der
Granite-Sprachmodelle).

| Generation | Release | Architektur | Größen | Besonderheit |
|------------|---------|-------------|--------|--------------|
| **Granite 4.0** | Okt 2025 | Hybrid Mamba-2/Transformer, teils MoE | 350M, 1B, 3B (dense/hybrid), 7B-A1B, 32B-A9B | ~70 % weniger Speicher, ~2× schneller; „Nano" für Edge |
| **Granite 4.1** | 29.04.2026 | Dense Decoder-only | 3B, 8B, 30B | Basis für Guardian 4.1; 8B ≈ 4.0 32B-MoE |
| **Granite 4.2** | 25.08.2026 | Dense Decoder-only, **Reasoning** | 3B, 8B, 30B | natives `<think>`-CoT, Thinking off/low/high; 128K, Long-Context-Erweiterung auf 512K (laut IBM-Doku für das 30B-Modell) |

Hinweis: **Granite 4.2** ist die aktuelle Generation (Stand 2026-10-18) und für
den Router die naheliegendste Wahl, weil sie Reasoning-Level (`enable_thinking`,
`reasoning_effort`) direkt mitbringt. Granite 4.1 ist die reasoning-freie
Alternative, Granite 4.0 (inkl. Nano/MoE) die speichereffiziente/kantennahe
Alternative.

## 4. Katalog (Haupttabelle)

Parameter = Nominalgröße laut IBM/Modellkarte. **Footprint** = Standard-Quantisierung
aus der Ollama-Library (üblicherweise Q4_K_M; `bf16`/`q8_0` wo angegeben). Kontext =
natives Kontextfenster.

| Level | Modell | Parameter | Footprint (Ollama) | Kontext | Lizenz | Latenz-Referenz (Fremdmessung) | Quelle |
|-------|--------|-----------|--------------------|---------|--------|--------------------------------|--------|
| **L1** | `granite4:350m` (4.0) | 350M (0,35B) | **708 MB** | 32K | Apache 2.0 | RPi5 Q8_0: **~23,7 tok/s**, Median-Gen. 0,66 s | Ollama `granite4`, GH `Jewelzufo/granite4-rpi5-benchmark` |
| **L1** | `granite4:350m-h` (4.0 Hybrid) | 350M | **366 MB** | 1M | Apache 2.0 | keine belastbare Messung gefunden | Ollama `granite4` |
| **L2** | `granite4:1b` (4.0) | 1B | 3,3 GB (bf16) | 128K | Apache 2.0 | keine belastbare Messung gefunden | Ollama `granite4` |
| **L2** | `granite4:1b-h` (4.0 Hybrid) | 1B | **1,6 GB** (q8_0) | 1M | Apache 2.0 | keine belastbare Messung gefunden | Ollama `granite4` |
| **L3** | `granite4.2:3b` | 3B | **2,2 GB** | 128K | Apache 2.0 | A40 Q4TP: **89,5 tok/s**; M4 Air Q4TP: 34,8 tok/s, TTFT 0,57 s; Xeon-CPU Q4TP: 11,9 tok/s | Ollama `granite4.2`, HF `granite-4.2-3b`, `infosave/Granite-4.2-cmf` |
| **L3** | `granite4.1:3b` | 3B | 2,1 GB | 128K | Apache 2.0 | keine belastbare Messung gefunden | Ollama `granite4.1` |
| **L4** | `granite4.2:8b` | 8B | **5,3 GB** | 128K | Apache 2.0 | A40 Q4TP: **49,9 tok/s** (Q8: 30,9); SWE-Bench Verified 47,67 | Ollama `granite4.2`, HF, `infosave/…-cmf` |
| **L4** | `granite4.1:8b` | 8B | 5,3 GB | 128K | Apache 2.0 | keine belastbare Messung gefunden | Ollama `granite4.1` |
| **L5** | `granite4.2:30b` | 30B | **18 GB** | 128K (→512K) | Apache 2.0 | A40 Q4TP: **22,9 tok/s** (Q8: 5,3); SWE-Bench Verified 57,00 | Ollama `granite4.2`, HF, `infosave/…-cmf` |
| **L5** | `granite4.1:30b` | 30B | 17 GB | 128K | Apache 2.0 | keine belastbare Messung gefunden | Ollama `granite4.1` |

### 4.1 Alternative MoE-Varianten (Granite 4.0)

Für Umgebungen mit knappem Speicher, in denen höhere Qualität als ein 3B-Dense
gebraucht wird, ohne 30B-Dense-Kosten zu zahlen:

| Level-Vorschlag | Modell | Parameter (aktiv) | Footprint | Kontext | Lizenz |
|-----------------|--------|-------------------|-----------|---------|--------|
| L4 | `granite4:7b-a1b-h` (Tiny-H) | 7B total / **1B aktiv** | **4,2 GB** | 1M | Apache 2.0 |
| L5 | `granite4:32b-a9b-h` (Small-H) | 32B total / **9B aktiv** | **19 GB** | 1M | Apache 2.0 |

Quelle: Ollama `granite4` (Modellkarte nennt 70 % geringeren Speicher und ~2×
schnellere Inferenz gegenüber vergleichbaren Modellen).

## 5. Lizenz

| Familie | Lizenz | Kommerziell | Signiert | ISO-Zertifizierung |
|---------|--------|-------------|----------|--------------------|
| Granite 4.0 / 4.0 Nano | Apache 2.0 | ja | ja | ISO 42001 (AIMS) |
| Granite 4.1 | Apache 2.0 | ja | ja | ISO 42001 (AIMS) |
| Granite 4.2 | Apache 2.0 | ja | ja | ISO 42001 (AIMS) |

Es gibt **keine** Granite-Variante mit abweichender oder eingeschränkter Lizenz
(Gegensatz z. B. zu LFM, das kommerzielle Beschränkungen hat). Für Lastbrowser
ist damit keine Lizenz-/Beipackzettel-Sonderbehandlung nötig — anders als bei
den in `docs/local-ai-onboarding.md` dokumentierten Modellen.

## 6. Latenz: Methodik und Vorbehalte

**Wichtig:** Es wurden **keine eigenen Messungen** durchgeführt. Die tok/s-Werte
stammen aus Fremd-Benchmarks und sind nur eingeschränkt übertragbar:

- Die A40-Werte stammen aus dem Community-Benchmark `infosave/Granite-4.2-cmf`
  (single-stream steady decode, 100 Tokens, Vulkan, Werte ohne Modell-Load und
  Prefill). Sie beziehen sich auf CMF-Quantisierungen (Q4TP/Q8_2F), nicht auf GGUF.
- Die M4-/CPU-Werte (3B) stammen aus denselben Benchmark.
- Der RPi5-Wert (350M, Q8_0) stammt aus `Jewelzufo/granite4-rpi5-benchmark`.
- Für 4.1/4.0-Modelle ohne genannten Wert liegt **keine belastbare Messung** vor;
  die Spalte bleibt bewusst leer statt zu schätzen.

`TTFT` = Time to first token. `tok/s` = generierte Tokens pro Sekunde.

Für eine echte Router-Entscheidung wären eigene, reproduzierbare Messungen nötig
(vgl. `docs/local-ai-onboarding.md`, das Messwerte mit Hardware nennt). Das ist
ausdrücklich **nicht** Teil dieses Beads.

## 7. Empfehlung für Router L1–L5

Als Startpunkt (vorbehaltlich Felix’ Abnahme und eigener Messungen):

| Level | Empfehlung | Begründung |
|-------|------------|------------|
| **L1** | `granite4:350m-h` (366 MB) oder `granite4:350m` | kleinster Footprint, für Klassifikation/JSON; Hybrid-Variante mit 1M Kontext |
| **L2** | `granite4:1b-h` (1,6 GB) | 1B-Klasse, guter Kompromiss aus Qualität und Speicher |
| **L3** | `granite4.2:3b` (2,2 GB) | aktuelle Generation, Thinking optional abschaltbar |
| **L4** | `granite4.2:8b` (5,3 GB) | bester Footprint/Qualität-Punkt, tool-fähig |
| **L5** | `granite4.2:30b` (18 GB) | stärkstes Granite-Reasoning (SWE-Bench Verified 57) |

Wenn 4.2 gegenüber 4.1/4.0 nicht verfügbar ist, sind `granite4.1:3b/8b/30b`
die 1:1-Alternativen. Die MoE-Varianten (7B-A1B, 32B-A9B) sind die Option für
speicherarme Umgebungen. Gegenüber der M1-Belegung (nemotron/gpt-oss/glm) wäre
der Vorteil: eine Familie, ein Lizenzmodell, konsistenteres Tool-Calling.

## 8. Offene Punkte

1. **L1–L5-Definition bestätigen** — die Level-Zuordnung in §2/§4 ist ein Vorschlag.
2. **Eigene Latenzmessung** auf Zielhardware fehlt; Fremdwerte sind nicht als
   Router-SLA geeignet.
3. **Verfügbarkeit im Router-Zielpfad** prüfen: Der M1-Router nutzt
   Ollama-Cloud; Granite 4.1/4.2 sind lokal/über Ollama verfügbar, die
   Cloud-Verfügbarkeit wurde hier nicht geprüft.
4. **Kosten**: Granite ist lokal kostenlos; OpenAI-kompatible Cloud-Preise
   wurden nicht recherchiert (kein bezahlpflichtiger Zugriff verwendet).

## 9. Quellen

- IBM Granite 4.0 — <https://www.ibm.com/granite/docs/models/granite4-0>
- IBM Granite 4.1 — <https://www.ibm.com/granite/docs/models/granite4-1>
- IBM Granite 4.2 — <https://www.ibm.com/granite/docs/models/granite4-2>
- IBM Research, Granite 4.2 (25.08.2026) — <https://research.ibm.com/blog/introducing-granite-4-2>
- HF `ibm-granite/granite-4.2-3b` / `-8b` / `-30b` (Modellkarten, Werte, Apache 2.0)
- HF `ibm-granite/granite-4.0-nano-language-models`, `granite-4.0-350m`
- Ollama Library: `granite4`, `granite4.1`, `granite4.2` (Footprints, Standard-Quantisierung)
- Community-Benchmark `infosave/Granite-4.2-cmf` (A40 Vulkan, M4 Air, Xeon) —
  Fremdmessung, klar gekennzeichnet
- Community-Benchmark `Jewelzufo/granite4-rpi5-benchmark` (Granite 4.0 H 350M,
  RPi5) — Fremdmessung

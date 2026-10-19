# Installer-Größe 0.1.56 vs. 0.1.58 — Top-20-Brocken

Stand: 2026-10-19 · Bead: `la-fkl` · Issue: #322

## Ergebnis

| Kennzahl | 0.1.56 | 0.1.58 | Delta |
| :--- | ---: | ---: | ---: |
| Installer (`Lastbrowser-*-x64-setup.exe`) | 264.77 MiB | 610.55 MiB | **+345.78 MiB (+130,6 %)** |
| Entpackte Installation | 847.77 MiB | ~1.44 GiB (rekonstruiert) | **~+627 MiB** |
| Dateien in der Installation | 11.797 | nicht messbar (siehe Befund) | — |

Die Verdopplung ist kein einzelner Modell-Download. Der größte Treiber ist die
neue Local-AI-Engine-Ablage `apps/desktop/runtime/local-ai` (275,11 MiB), die
**sowohl im `app.asar` als auch noch einmal als `extraResources`** landet.
Zusätzlich wird der gesamte Build-Ordner `apps/desktop/runtime` (Python-Runtime,
venvs, Wheelhouse, Installer-Werkzeuge) weiterhin in das `app.asar` gepackt,
obwohl dieselben Dateien bereits als `extraResources` ausgeliefert werden.
Electron 45 Alpha und Mermaid/Katex in `node_modules` kommen hinzu.

## Methodik

- Release-Assets von `Loggableim/lastbrowser` geladen:
  - `Lastbrowser-0.1.56-x64-setup.exe` (277.629.344 Bytes)
  - `Lastbrowser-0.1.58-x64-setup.exe` (640.207.744 Bytes)
- 0.1.56 mit 7-Zip 26.04 vollständig entpackt: 888.955.068 Bytes,
  11.797 Dateien, 1.225 Ordner. Alle 0.1.56-Werte sind exakte Bytes aus dieser
  Extraktion (MiB = 1024 × 1024).
- Das in 0.1.58 eingebettete `$PLUGINSDIR/app-64.7z` (639.394.190 Bytes) lässt
  sich mit 7-Zip 26.04 und p7zip 16.02 **nicht öffnen** (Details im Abschnitt
  „Befund zum 0.1.58-Archiv“). Die 0.1.58-Werte sind deshalb aus folgenden
  belastbaren Quellen rekonstruiert und als `~` gekennzeichnet:
  - Git-Tag `v0.1.58` (Packaging-Konfiguration, Quellbaum)
  - `services/sidekick/runtime/local_ai/store-runtime-registry.json`
    (exakte Byte-Größen der gepinnten Engines)
  - Electron-45.0.0-alpha.14+wvcus-Win-x64-Release (exakte Dateigrößen)
  - gepackter `app.asar` aus 0.1.56 als Basis für unveränderte Runtime-Teile
  - lokaler Build von `v0.1.58` (`dist/renderer` und `dist/main`, Exit 0)
- `resources/services` für 0.1.58 wurde aus dem Tag mit denselben
  Ausschlussfiltern wie in `package.json` gemessen.
- Dass `runtime/local-ai` im `app.asar` landet, folgt aus dem 0.1.56-Befund:
  Dort liegen `runtime/python`, `runtime/castlabs-venv`, `runtime/wheelhouse`
  und `runtime/installer-asset-tools` trotz der `files`-Liste im `app.asar`.
  Die 0.1.58-Konfiguration enthält keine Ausschlussregel für `runtime/**`.

## Tabelle 1 — Top-20-Brocken (Pfad + MiB)

Sortiert nach 0.1.58. `—` bedeutet: in dieser Version nicht vorhanden.

| # | Pfad | 0.1.56 MiB | 0.1.58 MiB | Delta MiB |
| ---: | :--- | ---: | ---: | ---: |
| 1 | `resources/app.asar` | 319,77 | ~630,0 | **+310,2** |
| 2 | `resources/apps/desktop/runtime/local-ai` | — | 275,11 | **+275,11** |
| 3 | `Lastbrowser.exe` | 195,65 | 238,41 | **+42,76** |
| 4 | `resources/runtime/python` | 142,17 | ~148,0 | +5,8 |
| 5 | `locales/` | 42,50 | 48,38 | +5,88 |
| 6 | `resources/services` | 39,28 | 36,35 | −2,93 |
| 7 | `dxcompiler.dll` | 24,72 | 24,58 | −0,14 |
| 8 | `resources/app.asar.unpacked` | 23,30 | ~23,30 | 0,00 |
| 9 | `resources.pak` | 5,76 | 12,75 | +6,99 |
| 10 | `icudtl.dat` | 9,98 | 10,32 | +0,34 |
| 11 | `LICENSES.chromium.html` | 14,56 | 5,37 | −9,19 |
| 12 | `resources/brand` | 5,32 | 5,32 | 0,00 |
| 13 | `vk_swiftshader.dll` | 5,30 | 5,20 | −0,10 |
| 14 | `d3dcompiler_47.dll` | 4,52 | 4,53 | +0,01 |
| 15 | `ffmpeg.dll` | 2,92 | 2,95 | +0,03 |
| 16 | `vulkan-1.dll` | 0,90 | 0,91 | +0,01 |
| 17 | `chrome_200_percent.pak` | 0,25 | 0,88 | +0,63 |
| 18 | `v8_context_snapshot.bin` | 0,67 | 0,72 | +0,05 |
| 19 | `chrome_100_percent.pak` | 0,16 | 0,54 | +0,38 |
| 20 | `electron_wer.dll` | — | 0,40 | +0,40 |

Weitere Brocken: `snapshot_blob.bin` 0,36 MiB (0.1.58), `libGLESv2.dll`
7,70 MiB und `dxil.dll` 1,43 MiB sowie `libEGL.dll` 0,50 MiB (alle nur 0.1.56;
in Electron 45 nicht mehr enthalten).

Die Top-20 erklären den Großteil der Differenz; der Rest verteilt sich auf
kleinere Electron-Dateien, den `app.asar`-Header und die in Electron 45
entfallenen Dateien.

## Tabelle 2 — `app.asar` intern (gepackte Bytes)

Die Werte sind die im `app.asar` tatsächlich gepackten Bytes. Dateien aus
`app.asar.unpacked` (u. a. `node-pty`, `@esbuild`, `@rollup`) sind hier nicht
enthalten.

| Pfad im `app.asar` | 0.1.56 MiB | 0.1.58 MiB | Bemerkung |
| :--- | ---: | ---: | :--- |
| `runtime/local-ai` | — | 275,11 | 4 Engine-Bundles, exakt aus Registry |
| `runtime/python` | 140,14 | ~146,0 | Python-Runtime; in 0.1.58 zusätzlich `mcp`, `jsonschema`, `Pillow`, `psutil`, `httpx-sse` |
| `runtime/castlabs-venv` | 41,38 | 41,38 | reines Build-/Signing-Artefakt |
| `runtime/wheelhouse` | 23,76 | 23,76 | reines Build-Artefakt |
| `runtime/installer-asset-tools` | 20,10 | 20,10 | reines Build-Artefakt |
| `node_modules` | 52,28 | ~71,1 | 0.1.58: Mermaid 41,71 + Katex 4,05, dafür keine `.map` mehr |
| `dist` | 18,98 | 26,88 | Renderer/Main aus `v0.1.58` gebaut |
| `src` | 15,20 | 16,64 | Quellbaum wird mitgepackt |
| `tests` | 2,22 | 2,47 | App-Tests werden mitgepackt |
| `scripts` | 0,45 | 0,49 | Build-Skripte werden mitgepackt |
| **Summe gepackt** | **314,53** | **~623,9** | plus Header ≈ 5 MiB |
| **`app.asar`-Datei** | **319,77** | **~629,2** | gerundet ~630 |

## Tabelle 3 — Local-AI-Engines (0.1.58, exakt)

Quelle: `store-runtime-registry.json`, Revision `2026-10-14.3`.

| Engine | Dateien | MiB |
| :--- | ---: | ---: |
| `llama-cpp-b11429-cpu` | 45 | 51,36 |
| `llama-cpp-b11429-vulkan` | 46 | 94,56 |
| `sd-cpp-964-cpu` | 35 | 44,25 |
| `sd-cpp-964-vulkan` | 36 | 84,95 |
| **Summe** | **162** | **275,11** |

Größte Einzeldateien: `ggml-vulkan.dll` 43,21 MiB (llama.cpp Vulkan),
`ggml-vulkan.dll` 40,70 MiB und `stable-diffusion.dll` 33,83 MiB
(SD Vulkan), `stable-diffusion.dll` 33,83 MiB (SD CPU), danach
`llama-server-impl.dll` 8,75 MiB und `llama-common.dll` 7,56 MiB je Backend.

## Tabelle 4 — Electron-Anteil

| Datei | 0.1.56 (Electron 37.10.3) | 0.1.58 (Electron 45.0.0-alpha.14) | Delta |
| :--- | ---: | ---: | ---: |
| `Lastbrowser.exe` (aus `electron.exe`) | 195,65 | 238,41 | +42,76 |
| `locales/` | 42,50 | 48,38 | +5,88 |
| `resources.pak` | 5,76 | 12,75 | +6,99 |
| `LICENSES.chromium.html` | 14,56 | 5,37 | −9,19 |
| `dxcompiler.dll` | 24,72 | 24,58 | −0,14 |
| `libGLESv2.dll` | 7,70 | — | −7,70 |
| `dxil.dll` | 1,43 | — | −1,43 |
| `libEGL.dll` | 0,50 | — | −0,50 |
| `icudtl.dat` | 9,98 | 10,32 | +0,34 |
| `vk_swiftshader.dll` | 5,30 | 5,20 | −0,10 |
| **Netto** | | | **≈ +36,9** |

## Ursachen

1. **Local-AI-Engines doppelt verpackt.** `runtime/local-ai` (275,11 MiB) wird
   als `extraResources` nach `resources/apps/desktop/runtime/local-ai` kopiert
   und gleichzeitig als Teil von `apps/desktop/runtime` in `app.asar` gepackt.
   Das ist der größte Einzelposten der neuen 345,78 MiB.
2. **`apps/desktop/runtime` gehört nicht in `app.asar`.** Bereits 0.1.56
   enthielt `app.asar` die Python-Runtime (140,14 MiB), `castlabs-venv`
   (41,38 MiB), `wheelhouse` (23,76 MiB) und `installer-asset-tools`
   (20,10 MiB). Dieselbe Python-Runtime liegt zusätzlich als `extraResources`
   unter `resources/runtime/python` (142,17 MiB). Die effektive Doppelung
   beträgt rund 500 MiB entpackt, davon rund 275 MiB neu in 0.1.58.
3. **Electron 45 Alpha statt 37.10.3.** Die `electron.exe` wächst um
   42,76 MiB; Locales und `resources.pak` kommen hinzu, dafür entfallen
   `libGLESv2`, `dxil` und `libEGL`. Netto rund +37 MiB.
4. **Mermaid und Katex in `node_modules`.** 0.1.58 ergänzt `mermaid@12.2.0`
   (41,71 MiB ohne Source-Maps) und `katex@0.19.0` (4,05 MiB). Beide sind
   bereits im Renderer-Bundle (`dist/renderer`) enthalten; die
   `node_modules`-Kopien werden zusätzlich mitgeschleppt. Der neue
   `!**/*.map`-Ausschluss spart gleichzeitig rund 27 MiB.
5. **Verbesserungen in 0.1.58.** `services/sidekick/tests` und `__pycache__`/
   `.pyc` werden nicht mehr mitgeliefert (−2,93 MiB gegenüber 0.1.56). Das ist
   korrekt, reicht aber nicht gegen die neuen Posten.
6. **Risiko Modelle.** Der `extraResources`-Filter für `runtime/local-ai`
   lautet `["**/*", "!**/*.partial"]` und enthält **keinen** `!**/*.gguf`-
   oder `!**/*.safetensors`-Ausschluss (anders als `services`). Liegen im
   Build-Verzeichnis heruntergeladene Modelle, werden sie mit ausgeliefert.
   Das konnte im 0.1.58-Artefakt nicht verifiziert werden, weil das
   `app-64.7z` nicht lesbar ist (siehe unten). Die 640 MiB sind aber bereits
   ohne Modelle durch die Doppelung erklärbar; ein Modell würde die Zahl
   weiter erhöhen.

## Befund zum 0.1.58-Archiv

Das in `Lastbrowser-0.1.58-x64-setup.exe` eingebettete
`$PLUGINSDIR/app-64.7z` ist mit 7-Zip 26.04 und p7zip 16.02 nicht öffnbar:

- Dateigröße: 639.394.190 Bytes
- 7z-Startheader: `next-header offset = 4.934.361.413`
  (`0x1_261C6145`)
- Die unteren 32 Bit sind `639.394.117` = Dateigröße − 73, also exakt die
  relative Position, die auch 0.1.56 verwendet (0.1.56:
  `276.804.318` = Dateigröße − 73).
- An dieser Position und im gesamten Tail befindet sich **kein 7z-Endheader**;
  beide Tools melden „Unexpected end of archive“.
- Das 0.1.56-Archiv (`app-64.7z`, 276.804.391 Bytes) öffnet mit demselben
  Werkzeug fehlerfrei.

Das Muster `2^32 + (Dateigröße − 73)` spricht für einen 4-GiB-Offsetüberlauf
beim Packen oder für ein abgeschnittenes Archiv. Ob der Windows-Installer
davon betroffen ist, muss auf Windows verifiziert werden; `nsis7z.dll` könnte
den hohen Offset anders behandeln. Der Befund ist separat als `la-7xf`
erfasst.

## Empfehlungen

| Maßnahme | Erwartete Ersparnis (entpackt) | Risiko |
| :--- | ---: | :--- |
| `files: ["!runtime/**"]` in der Electron-Builder-Konfiguration; Runtime nur über `extraResources` ausliefern | ~500 MiB (Local-AI 275 + Python 140 + venv 41 + wheelhouse 24 + Asset-Tools 20) | niedrig; Runtime bleibt unter `resources/` verfügbar, Pfade müssen geprüft werden |
| Local-AI-Engines bei Bedarf nachladen oder nur ein Backend (CPU **oder** Vulkan) bündeln | 275 MiB (extraResources) bzw. 179 MiB (nur CPU statt CPU+Vulkan) | mittel; Offline-Fähigkeit und First-Run-Erlebnis |
| Build-only-Verzeichnisse (`castlabs-venv`, `wheelhouse`, `installer-asset-tools`) aus dem Paket entfernen | 85 MiB | niedrig |
| `node_modules` auf Produktionsabhängigkeiten pruning; Mermaid/Katex nicht zusätzlich zu `dist` mitliefern | ~46 MiB (Mermaid/Katex) + ~24 MiB (Dev-Binaries) | niedrig |
| Locales auf `de`/`en` (plus Fallback) reduzieren | ~46 MiB | niedrig, aber Sprachabdeckung prüfen |
| `services/sidekick/docs` und verbleibende Caches ausschließen | ~2 MiB | niedrig |
| `!**/*.gguf`, `!**/*.safetensors`, `!**/*.part` im `runtime/local-ai`-Filter ergänzen | verhindert unkontrollierte Modell-Pakete | niedrig |
| Electron statt Alpha auf eine stabile Version heben | ~37 MiB gegenüber 45 Alpha | mittel; separat testen, keine reine Größenmaßnahme |

Nach Umsetzung der ersten vier Maßnahmen ist ein Installer im Bereich
**250–300 MiB** realistisch (grob, abhängig von Kompression und Signatur).
Das wäre wieder nahe am 0.1.56-Niveau, ohne die Python-Runtime oder die
Offline-Engines grundsätzlich aufzugeben.

## Reproduktion

```bash
# 0.1.56 (exakt)
gh release download v0.1.56 --repo Loggableim/lastbrowser \
  -p 'Lastbrowser-0.1.56-x64-setup.exe'
7zz x Lastbrowser-0.1.56-x64-setup.exe -o0.1.56
find 0.1.56 -type f -printf '%s\t%p\n' | sort -nr | head -20

# 0.1.58 (Archiv derzeit nicht lesbar)
gh release download v0.1.58 --repo Loggableim/lastbrowser \
  -p 'Lastbrowser-0.1.58-x64-setup.exe'
7zz l -slt Lastbrowser-0.1.58-x64-setup.exe | grep -A7 'app-64.7z'
7zz x Lastbrowser-0.1.58-x64-setup.exe -o0.1.58
7zz t '0.1.58/$PLUGINSDIR/app-64.7z'   # -> Unexpected end of archive

# 0.1.58-Rekonstruktion
git worktree add --detach /tmp/lb-0158 v0.1.58
cd /tmp/lb-0158 && npm ci --ignore-scripts
npm --workspace apps/desktop run build   # Exit 0
```

## Einschränkungen

- 0.1.58 ist **nicht** byte-genau gemessen. Die `~`-Werte sind aus Registry,
  Electron-Release und dem 0.1.56-Basis-`app.asar` rekonstruiert; sie können
  durch die tatsächliche Python-Runtime und den Build-Zustand um wenige MiB
  abweichen.
- Die 0.1.58-Installation wurde nicht auf Windows ausgeführt. Ob der
  Installer mit dem auffälligen `app-64.7z`-Header funktioniert, ist offen.
- Modell-Downloads wurden nicht in das 0.1.58-Paket hineingerechnet; der
  `runtime/local-ai`-Filter ist aber ein offensichtliches Risiko.

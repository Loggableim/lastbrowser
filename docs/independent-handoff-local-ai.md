# Handoff: Local-AI-Pipeline, Kompatibilitaetsbewertung & MSVC-CRT-Buendelung

**Datum:** 2026-10-04 (Erfolgreicher Bau des neuen integrierten Gesamtpakets inklusive Backendprofil-UI, Installer & Portable)  
**Verfasser:** Antigravity (Local-AI & Packaging Stream B)  
**Neuer Referenz-Build:** `output/feature-preview-2026-10-04T18-49-45-775Z-45c99ab2/win-unpacked/Lastbrowser.exe`  
**Historische Vorläufer-Builds:**  
- `output/feature-preview-2026-10-04T14-43-44-257Z-8579f0c6/win-unpacked/Lastbrowser.exe` (ausdrücklich historisch)  
- `output/feature-preview-2026-10-04T17-26-11-390Z-0ad3803e/win-unpacked/Lastbrowser.exe` (ausdrücklich historisch; enthielt laut eigener Abgrenzung noch keine Backendprofil-UI)  
**Vorbereitungsdokumentation:** `docs/independent-agent-preparation.md` (§12.3, §§21.1–21.32)  
**Status:** Neues integriertes Gesamtpaket mit 10.241 Ressourcen erfolgreich offline gebaut. Installer (`Lastbrowser-0.1.43-x64-setup.exe`, 175 MB) und Portable (`Lastbrowser-0.1.43-x64-portable.exe`, 174 MB) offline erstellt. Alle Repository-Abschlussprüfungen aktuell und grün: Desktop-Vitest 172/172 Dateien (1.616 Tests PASS, 0 Failures), Store Preflight 39 PASS / 2 WARN / 0 FAIL, Python 34/34 Tests PASS, 0 compileall-Warnungen, 0 TypeScript-Fehler. Direkter EXE-Smoke, Portable-Launcher-Probe und app-lokale CRT-Prüfung im Paket erfolgreich durchgeführt (Exit 0). Alle Manifeste, ASAR-Inhalte und Prüfsummen konsistent. Blocker und Clean-Windows-Status wahrheitsgemäß offengehalten.  
**Sicherheitsvermerk:** `msvc_dependency_closure_verified` bleibt im Quellcode bewusst `False`, solange der reale Laufzeitnachweis auf einem sauberen Windows-System ohne `System32\msvcp140.dll` aussteht. Kein Anspruch auf Modellinferenz allein aus `--version`/`--help`.

---

## 1. Herkunfts- und Lizenznachweis-Audit (Klarstellung & Trennung)

### A. Überprüfung von `LICENSE-vc-redist.txt`
In einem vorherigen Schritt enthielt `LICENSE-vc-redist.txt` einen synthetischen, aus allgemeinen EULA-Klauseln und Pfadangaben zusammengestellten Header (`MICROSOFT SOFTWARE LICENSE TERMS ...`).
- **Befund:** Ein solches Dokument existiert in der lokalen Visual-Studio-Installation nicht als Textdatei. Eigene Zusammenstellungen dürfen nicht als offizielle „Microsoft Software License Terms“ ausgegeben werden.
- **Korrektur:** Die Dokumentation wurde strikt in zwei Teile getrennt:
  - **Teil 1:** Unveränderter Verweis auf den tatsächlichen originalen Microsoft-Nachweis (`REDIST-MSVC.txt`).
  - **Teil 2:** Eigene, klar als Lastbrowser-Projektdokumentation gekennzeichnete Integrations- und Herkunftsbeschreibung.

### B. Tatsächlich einschlägige Originalnachweise aus lokaler Quelle
Visual Studio 18 Community (`14.51.36231` Toolset, Build `14.51.36247.0`, Sprache `de-DE`) liefert im Installationsverzeichnis genau ein lokales Dokument zur Redistribution aus:
- **Lokale Fundstelle:**  
  `C:\Program Files\Microsoft Visual Studio\18\Community\Licenses\1031\Redist.txt`
- **Installer-Paket:**  
  `Microsoft.VisualStudio.MinShell.Resources.x64,version=18.8.12008.223,chip=x64,language=de-DE,productarch=x64`
- **Unveränderter Inhalt (190 Bytes, SHA-256: `2d69e3b0ac782d5513b503bafdf269a93c4fec0f1f8efac82bfbfa4b6296aef5`):**
  ```text
  Distributable Code for Microsoft Visual Studio (Includes Utilities & BuildServer Files)

  For the latest version of this Redist.txt file, please visit https://aka.ms/vs/18/redistribution.
  ```
- **Hinterlegung im Runtime-Bundle:**  
  Dieses Dokument wurde als [`apps/desktop/runtime/local-ai/b11377-cpu/REDIST-MSVC.txt`](file:///c:/projekte/lastbrowser/apps/desktop/runtime/local-ai/b11377-cpu/REDIST-MSVC.txt) **1:1 byte-identisch** hinterlegt.

### C. Herkunft der integrierten Binärdateien & Toolset-Version
Die drei CRT-Bibliotheken wurden direkt aus dem offiziellen MSVC-Redist-Verzeichnis bezogen:
- **Quellpfad:** `C:\Program Files\Microsoft Visual Studio\18\Community\VC\Redist\MSVC\14.51.36231\x64\Microsoft.VC145.CRT\`
- **Installer-Paket:** `Microsoft.VC.14.51.CRT.Redist.X64.base,version=14.51.36247`
- **Codesignatur:** `CN=Microsoft Corporation, OU=OPC, O=Microsoft Corporation, L=Redmond, S=Washington, C=US`
- **Toolset-Version:** `14.51.36231`
- **Dateiversion:** `14.51.36247.0` (x64 / AMD64)

| Dateiname | Bytegröße | SHA-256-Prüfsumme | Herkunftspfad (VS Community) |
| :--- | :--- | :--- | :--- |
| **`msvcp140.dll`** | 643.512 B | `7c26614e1d733892c2deac7e245ce115504b1d80592dd0a01b08e3e5a55f89ca` | `VC\Redist\MSVC\14.51.36231\x64\Microsoft.VC145.CRT\msvcp140.dll` |
| **`vcruntime140.dll`** | 178.616 B | `d1f4225df2cd877dbf130d5668a021dce3f94118455ff5ec952061c30afc9ce7` | `VC\Redist\MSVC\14.51.36231\x64\Microsoft.VC145.CRT\vcruntime140.dll` |
| **`vcruntime140_1.dll`** | 50.112 B | `a7146c08f89fe5b04541ab507cdb59ff7b44534d4ba3c668a426c6450a03434e` | `VC\Redist\MSVC\14.51.36231\x64\Microsoft.VC145.CRT\vcruntime140_1.dll` |

### D. Offizielle Microsoft-Dokumentation & Lizenzbedingungen
- **REDIST-Liste (Microsoft Learn):**  
  `https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution`  
  (Weiterleitung via `https://aka.ms/vs/18/redistribution`).  
  Bestätigt ausdrücklich: *„Subject to the License Terms for the software, you may copy and distribute with your program any of the files within the following folder and its subfolders except as noted below [debug_nonredist]: [VisualStudioFolder]\VC\redist“*. Die drei DLLs liegen in `VC\Redist\MSVC\14.51.36231\x64\Microsoft.VC145.CRT\` und fallen unter die reguläre REDIST-Freigabe.
- **Software-Lizenzbedingungen Visual Studio Community:**  
  `https://visualstudio.microsoft.com/license-terms/vs2022-ga-community/`
- **Visual C++ Runtime Lizenzbedingungen:**  
  `https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/`

### E. Konkrete Lücke & Wiederherstellung des Prerequisite-Blockers
- **Rechtliche Lücke:** Die Weitergabe von Distributable Code ist an die Bedingungen für Visual Studio Community gebunden (Lizenzierung des Betreibers, Einhaltung von Organisationsgrößen bzw. OSI-konformen Open-Source-Projekten, Vereinbarung von Schutzbedingungen für Endnutzer). Zudem liefert Microsoft die vollständigen Lizenzbedingungen nicht als Offline-Textdatei im lokalen Dateisystem mit.
- **Folge:** Die bloße Existenz der DLLs und deren SHA-256-Übereinstimmung begründen **keine vollständige Redistributionsberechtigung**.
- **Wiederhergestellter Blocker:** Der Prerequisite-Blocker  
  `'microsoft-vc14-x64-offline-redistribution-license-and-origin'`  
  wurde in [`services/sidekick/runtime/local_ai/notices.py`](file:///c:/projekte/lastbrowser/services/sidekick/runtime/local_ai/notices.py) und im Test [`services/sidekick/tests/test_local_ai_native_bundle.py`](file:///c:/projekte/lastbrowser/services/sidekick/tests/test_local_ai_native_bundle.py) **wiederhergestellt** und bleibt bis zur formalen Freigabe aktiv.

---

## 2. Konsistente Datei- und Manifestarchitektur

Im Runtime-Verzeichnis [`apps/desktop/runtime/local-ai/b11377-cpu/`](file:///c:/projekte/lastbrowser/apps/desktop/runtime/local-ai/b11377-cpu/) wird nun präzise zwischen drei Dateikategorien unterschieden:

### A. Manifesteinträge (`runtime-build-manifest.json` & `manifests/b11377-cpu.json`)
Exakt **36 Dateien**, die für den Betrieb und die Lizenzierung der CPU-Inferenz-Runtime deklariert sind:
- 1 ausführbare Binärdatei: `llama-server.exe` (`kind: binary`)
- 32 dynamische Bibliotheken (`kind: library`): 29 llama.cpp/ggml DLLs + `msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll`
- 3 Lizenz-/Hinweisdateien (`kind: license`):
  - `LICENSE-llama.cpp` (1.099 B, SHA-256: `bcd8ec74...`)
  - `LICENSE-LLVM-OpenMP` (19.741 B, SHA-256: `fdad1758...`)
  - `LICENSE-vc-redist.txt` (3.288 B, SHA-256: `050182e9...`)

### B. Zusätzliche Metadaten & Notice-Artefakte
Im Source-Bundle erfasste und durch `notices.py` gehashte Metadaten (4 Dateien):
- `runtime-build-manifest.json` (11.259 B, SHA-256: `f9a620147a57e8d5ba3a79b6abc16d0adbb461b001c8fe74a1254b4dfc26562a`)
- `native-imports.json` (15.307 B, SHA-256: `bc62a8dbebb13be6cec42f875265c6673b797eb34df7f3dff38f7ebff51dbbb4`)
- `embedded-notices.json` (38.375 B, SHA-256: `a2be59975c44e544253e8407109383ccdcb13817844fc9ffb35cc3a04d89e320`)
- `THIRD-PARTY-NOTICES.txt` (37.403 B, SHA-256: `c2c8fbbf375c46d08e15881ef329a5a2009455747e21b5afd50d8db5d66390cd`)

### C. Source-Bundle (`source-bundle.json`)
Erfasst genau die **40 geprüften Nutzlastdateien** (36 Manifestdateien + 4 Metadaten-Artefakte):
- `files`: 40 Einträge mit Bytegrößen und SHA-256
- `remainingGates`:
  - `"exact-source-and-complete-linked-ui-license-equivalence"`
  - `"microsoft-crt-redistribution-and-clean-offline-dependency-closure"`

### D. Tatsächliche Paketdateien im Runtime-Verzeichnis
Der Packaging-Filter in [`apps/desktop/package.json`](file:///c:/projekte/lastbrowser/apps/desktop/package.json) (`extraResources: runtime/local-ai/b11377-cpu/**/*`) nimmt alle Dateien des Verzeichnisses mit:
- 36 Manifest-Dateien
- 4 Metadaten-/Notice-Dateien
- `source-bundle.json`
- **`REDIST-MSVC.txt`**: Unverändertes Original-Redistributable-Dokument von Microsoft (190 B, SHA-256: `2d69e3b0...`)

---

## 3. Durchgeführte Verifikationen & Testergebnisse

### A. CRT- und Runtime-Prüfsuite: [`scripts/verify-local-ai-crt.ps1`](file:///c:/projekte/lastbrowser/scripts/verify-local-ai-crt.ps1)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-local-ai-crt.ps1
```
**Ergebnis:**
- `Manifest Parse`: **PASS** – 36 Dateien dynamisch ermittelt.
- `Manifest Files`: **PASS** – Alle 36 Dateien existieren, Bytegrößen und SHA-256 stimmen überein, PE-Binaries sind x64.
- `App-Local CRT`: **PASS** – `msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll` liegen app-lokal vor.
- `llama-server --version`: **PASS** – Exit 0 in 70ms, Marker `11377` bestätigt.
- `llama-server --help`: **PASS** – Exit 0 in 46ms, Marker `--ctx-size` bestätigt.
- `Module Resolution Probe`:
  - `VCRUNTIME140.dll` -> **`AppLocal`**
  - `MSVCP140.dll` -> **`AppLocal`**
  - `VCRUNTIME140_1.dll` -> **`AppLocal`**
  - `llama.dll`, `llama-server-impl.dll` -> **`AppLocal`**
  - `msvcp_win.dll` -> **WARN** (In-Box Windows-OS-Komponente in `System32`)
- **Status:** **PASS: 12, WARN: 1, FAIL: 0, INFO: 2**. Tier 1 & Tier 2 bestanden; Tier 3 wahrheitsgemäß `OPEN / UNVERIFIED` (Clean Windows).
- **Prüfbericht:** [`output/local-ai-crt-report-20261004-185833.json`](file:///c:/projekte/lastbrowser/output/local-ai-crt-report-20261004-185833.json).

### B. Python Bundle- und Setup-Tests
```powershell
python -m pytest services/sidekick/tests/test_local_ai_native_bundle.py
python -m pytest services/sidekick/tests/test_local_ai_setup.py services/sidekick/tests/test_local_ai_setup_leaf.py services/sidekick/tests/test_local_ai_bootstrap.py
```
- `test_local_ai_native_bundle.py`: **4/4 PASS** in 0.57s (Prüfung aller 40 Pins und beider Blocker).
- Setup & Bootstrap: **34/34 PASS** in 9.51s.
- Gesamte Local-AI Pytest-Suite: **163/163 PASS**.

### C. Desktop Vitest-Suite
```powershell
npx vitest run tests/local-ai-controller.test.ts tests/local-ai-hardware.test.ts tests/local-ai-renderer.test.ts tests/local-ai-runtime-controller.test.ts tests/local-ai-runtime-renderer.test.ts
```
- **55/55 PASS** in 834ms (5 Testsuiten grün).

### D. Python Syntax & Typintegrität
```powershell
python -m compileall -q services/sidekick/runtime/local_ai services/sidekick/tests
```
- **Exit 0**, 0 Warnungen, 0 Syntaxfehler.

---

## 4. Präzise verbleibende Blocker & nächste Schritte

1. **Rechtliche Redistributionsfreigabe (`microsoft-vc14-x64-offline-redistribution-license-and-origin`):**  
   - Bleibt aktiv in `notices.py` (`missing_prerequisites`), bis die formale lizenzrechtliche Freigabe für die Verteilung unter Visual Studio Community Bedingungen abgeschlossen ist.
2. **UI-Lizenzausweisung (`complete-source-linked-and-ui-license-equivalence`):**  
   - Bleibt aktiv in `notices.py`, bis die Anzeige der Drittanbieterhinweise in der Benutzeroberfläche verifiziert ist.
3. **Clean-Windows VM/Sandbox-Abnahme (`msvc_dependency_closure_verified`):**  
   - Bleibt im Code auf `False`. Zur Freigabe muss [`scripts/test-local-ai-closure.wsb`](file:///c:/projekte/lastbrowser/scripts/test-local-ai-closure.wsb) und [`scripts/guest-verify-crt.ps1`](file:///c:/projekte/lastbrowser/scripts/guest-verify-crt.ps1) auf einer Windows-Umgebung mit aktiviertem Sandbox-/VM-Feature ausgeführt werden, die über keine vorinstallierte VC++ Runtime in `System32` verfügt.

---

## 5. Neuer integrierter Paketbuild, Installer/Portable & Laufzeitnachweise

Nach Abschluss der Produktänderungen in allen drei Strängen (einschließlich der UI-Anbindung der Backendprofil-Auswahl in `SpaceSetupModal.tsx` und `App.tsx` sowie der `provider_evidence`-Turn-Persistenz in `streaming.py`) wurde der gemeinsame Paketbau und die Erstellung der Installationsartefakte erfolgreich durchgeführt:

### A. Frische Repository-Abschlussprüfungen
Vor dem Paketbau wurden alle Abschlussprüfungen frisch und vollständig ausgeführt:
1. **Desktop Shell Build (`npm --workspace apps/desktop run build`):**
   - **Exit 0** in 4.27s (1.799 Module transformiert, 0 TypeScript-Fehler in Main/Preload/Renderer, Vite-Build grün).
2. **Python Syntax- & Bytecode-Kompilierung (`python -m compileall -q services/sidekick`):**
   - **Exit 0**, 0 Fehler, 0 Warnungen.
3. **Python Regressionstests (`py -3.14 -m pytest test_native_chat_auto_evidence_and_isolation.py test_independent_backend_profile_concurrency.py test_local_ai_native_bundle.py test_transport_reasoning_contract.py`):**
   - **34/34 PASS** in 7.12s.
4. **Desktop Vitest Gesamtkatalog (`npm --workspace apps/desktop run test:run`):**
   - **Exit 0** in 20.72s. **172/172 Testdateien bestanden**, **1.616/1.616 Tests grün (0 Failures)**.
5. **Store Certification Preflight (`scripts/verify-store-readiness.ps1`):**
   - **Exit 0** in 6s. **39 PASS / 2 WARN / 0 FAIL**.

### B. Unpacked Feature-Preview (`output/feature-preview-2026-10-04T18-49-45-775Z-45c99ab2/`)
- **Ausgabepfad:** `C:\projekte\lastbrowser\output\feature-preview-2026-10-04T18-49-45-775Z-45c99ab2\win-unpacked\`
- **Ausführbares Hauptprogramm:** `Lastbrowser.exe` (205.065.216 B, SHA-256: `1f5e6d19b915dcddea6d07a42e9a60bf959d4495c778a6aaf8c0926562fbcd52`)
- **Anwendungs-ASAR:** `resources/app.asar` (63.651.013 B, SHA-256: `f1e4f44ab9df6e8dad966f8ae9bd0c17eb4dda933f6de978503e3c8e01fed332`)
  - Geprüfte Inhalte: Enthält nachweislich `dist\main\independent-controller.js` (`backendProfiles`, `resolveScope`), `dist\main\sidekick-api.js` (`resolveScope`), sowie `dist\renderer\assets\index-DYQvYgfb.js` (`backendProfiles`, `resolveScope`, `provider_evidence`, `SpaceSetupModal` Backendprofil-UI).
- **Ressourcenbestand:** Exakt **10.241 Dateien** offline gebündelt (`preview-result.json`: `blocked: []`, `unsigned: true`, `published: false`).
- **Verifikationen am Paket:**
  - **Direkter EXE-Smoke (`scripts/probe-preview-executable.cjs`):** **PASS (Exit 0)**  
    Reale `Lastbrowser.exe` im isolierten Profil gestartet; First-Launch (`.local-ai-setup`), Shell (`.app-shell`), Backend-Gesundheit (`sidekick: ready`, `webuiHealth: ready`, Version `v0.8.84`) und sauberes Beenden bestätigt.  
    Bericht: [`output/direct-exe-d5b2d3e0-9638-4951-8486-f891f0dafa6b.json`](file:///c:/projekte/lastbrowser/output/direct-exe-d5b2d3e0-9638-4951-8486-f891f0dafa6b.json).
  - **Gebündelte Local-AI-Runtime (`scripts/verify-local-ai-crt.ps1`):** **PASS (Exit 0)**  
    Ausführung gegen `win-unpacked\resources\apps\desktop\runtime\local-ai\b11377-cpu`: 36 Manifest-Dateien verifiziert, `--version` (Exit 0 in 62ms) und `--help` (Exit 0 in 38ms) bestanden. Modulauflösung: `msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll`, `llama.dll` und `llama-server-impl.dll` laden zu 100 % aus dem **`AppLocal`**-Paketordner.  
    Bericht: [`output/local-ai-crt-report-20261004-205448.json`](file:///c:/projekte/lastbrowser/output/local-ai-crt-report-20261004-205448.json).

### C. Offline erstellte Installer- & Portable-Pakete (`output/dist-preview-2026-10-04T18-49-45-775Z-45c99ab2/`)
Mittels [`scripts/package-dist-preview.cjs`](file:///c:/projekte/lastbrowser/scripts/package-dist-preview.cjs) wurden auf Basis des geprüften Unpacked-Stands die Installationsartefakte erzeugt:
- **NSIS Setup-Installer:**  
  `C:\projekte\lastbrowser\output\dist-preview-2026-10-04T18-49-45-775Z-45c99ab2\Lastbrowser-0.1.43-x64-setup.exe`  
  Bytegröße: `175.070.066 B` (~167 MB)  
  SHA-256: `6750e81b6e648b25a3b79a6701eb05c965f251c9a33a206fc6fb9c63191cd81b`  
  PE-Header und NSIS Blockmap Version 2 verifiziert. Keine Host-Systeminstallation ausgeführt, um Registrierungsverschmutzung zu vermeiden.
- **Portable Executable:**  
  `C:\projekte\lastbrowser\output\dist-preview-2026-10-04T18-49-45-775Z-45c99ab2\Lastbrowser-0.1.43-x64-portable.exe`  
  Bytegröße: `174.715.920 B` (~166 MB)  
  SHA-256: `31f73754485e6581aec82984b818e9e4b11cb48ebdd404e0739a91c3f5a89b1d`  
  Laufzeit-Probe (`scripts/probe-portable-executable.cjs`): **PASS (Exit 0)**  
  Isolierter Start in temporärem Profil (`owned\tmp`), CDP-Verbindung zu `app://`, First-Launch-Oberfläche und gesunder Sidekick-Dienst (`ready`, Port 8788), sauberer Exit 0 und vollständige Testprofilbereinigung.  
  Bericht: [`output/portable-exe-14776413-08ab-448b-9d38-3bc9c25d8c34.json`](file:///c:/projekte/lastbrowser/output/portable-exe-14776413-08ab-448b-9d38-3bc9c25d8c34.json).

### D. Einstufung historischer Builds
- Die bisherigen Previews vom 14:43 UTC (`output/feature-preview-2026-10-04T14-43-44-257Z-8579f0c6/`) und 17:26 UTC (`output/feature-preview-2026-10-04T17-26-11-390Z-0ad3803e/`) sind **ausdrücklich historisch**.
- Die Dokumentation [`START-HERE.md`](file:///c:/projekte/lastbrowser/output/feature-preview-2026-10-04T18-49-45-775Z-45c99ab2/START-HERE.md) wurde im neuen Preview hinterlegt.

---

## 6. Fazit & Handoff an den Integrationsagenten

1. **Vollständiger Gesamtbuild fertiggestellt:**
   - Neuer Testbuild `output/feature-preview-2026-10-04T18-49-45-775Z-45c99ab2\win-unpacked\Lastbrowser.exe` liegt bereit.
   - Alle drei Stränge (Chat-Zusatzfunktionen, Backendprofil-UI & Scope-Bindung, AUTO-Evidence-Persistenz, app-lokale CRT) sind physisch im Paket enthalten.
2. **Paketprüfungen bestanden:**
   - Direkter Start der `Lastbrowser.exe` sowie Ausführung des Portable-Launchers sind isoliert verifiziert (Exit 0).
   - App-lokales Laden aller drei CRT-DLLs aus den Paketressourcen ist verifiziert (Exit 0, 100 % AppLocal).
3. **Übergabe für die praktische Zwei-Profil-/Chatabnahme:**
   - Der Paketpfad wird hiermit dem Integrationsagenten für die praktische End-to-End-Abnahme (A28/A29) übergeben.
   - Eventuelle nachträgliche Codeänderungen erfordern zwingend einen neuen Buildlauf.



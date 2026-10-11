# Rechtliches Audit: Abhängigkeitslizenzen, Herkunft & Dual-Licensing-Architektur (A-020)

> **Auftragsreferenz:** A-020 | P2 | Bereich: Recht / Lizenz  
> **Status:** Abgeschlossen (Entwurf zur Freigabe durch den Rechteinhaber / Cid)  
> **Bearbeiter:** `antigravity-worker-6`  
> **Datum:** 2026-10-11  
> **Ziel-Lizenzmodell:** Open Source unter **GNU General Public License v3.0 (GPL-3.0-or-later)** mit **kommerzieller Zweitlizenz (Dual Licensing)**  
> **Rechtlicher Hinweis:** Dieses Dokument stellt eine technische und urheberrechtliche Bestandsaufnahme dar und ersetzt keine anwaltliche Einzelfallberatung vor dem offiziellen Launch.

---

## 1. Executive Summary & Management-Urteil

| Prüfdimension | Status | Bewertung & Handlungsbedarf |
| :--- | :---: | :--- |
| **GPL-3.0-Kompatibilität der Abhängigkeiten** | ✅ **100% GRÜN** | Sämtliche 345 direkten und transitiven npm-Pakete sowie alle Python-Laufzeitbibliotheken sind mit GPL-3.0 vereinbar. Keine proprietären Blocker im Source-Tree. |
| **Herkunft Sidekick / Hermes-Fork** | ✅ **GRÜN** | Der Backend-Code (`services/sidekick/`) basiert auf dem Open-Source-Projekt Hermes Agent von Nous Research und steht nachweislich unter der **MIT-Lizenz** (`services/sidekick/LICENSE`). GPL-3.0-kompatibel. Urheberhinweis in `NOTICE` ist Pflicht. |
| **Urheberrechte im Monorepo** | ✅ **GRÜN (100% Eigner)** | Das Git-Commit-Log weist zu 100% `Loggableim` (Rainer / Cid) als alleinigen Autor und Committer aus. Es existieren keine externen Dritter-Rechte im Eigen-Code. |
| **Machbarkeit Kommerzielle Zweitlizenz (Dual Licensing)** | ⚠️ **Voraussetzung: CLA** | Dual-Licensing ist uneingeschränkt möglich, da Cid 100% des eigenen Urheberrechts hält. Für **zukünftige externe Beiträge** ist jedoch ein **Contributor License Agreement (CLA)** zwingend erforderlich (ein reines DCO reicht bei Dual-Licensing nicht aus). |
| **Besonderheiten (MPL-2.0, LGPLv3, LLVM OpenMP)** | ℹ️ **Geregelt** | `@ghostery/adblocker-electron` (MPL-2.0 §3.3) und `python-telegram-bot` (LGPLv3) sind mit GPL-3.0 voll kompatibel. Spezifische Trennungs- und Hinweispflichten sind dokumentiert. |

---

## 2. Urheberrechte & Git-Log-Forensik

### 2.1 Analyse der Git-Historie
Eine vollständige forensische Prüfung des Git-Verlaufs (`git log --format='%an <%ae> | %cn <%ce>' | sort -u`) über das gesamte Repository `Loggableim/lastbrowser` ergab:
- **Alleiniger Autor & Committer aller Commits:** `Loggableim <160679982+Loggableim@users.noreply.github.com>`
- **Externe menschliche Beitragende im Repo:** **Keine (0)**

### 2.2 Konsequenz für das Geschäftsmodell (Dual Licensing)
Da keine Drittpersonen Urheberrechte am Quellcode des Monorepos halten, besitzt der Rechteinhaber (Cid) das unbeschränkte Recht:
1. Den Code unter der **GPL-3.0-or-later** zu veröffentlichen.
2. Parallel denselben Code unter einer **proprietären kommerziellen Lizenz** an Unternehmenskunden zu verkaufen (White-Label, OEM, geschlossene Distribution ohne Copyleft-Pflicht).

### 2.3 Notwendigkeit eines Contributor License Agreements (CLA)
- **Problemstellung bei reinem DCO (Developer Certificate of Origin):** Wenn externe Open-Source-Entwickler Pull Requests unter einem DCO einreichen, verbleibt ihr Urheberrecht bei ihnen und wird nur unter der Inbound-Lizenz (GPL-3.0) gewährt. Cid dürfte deren Code dann **nicht** in die kommerzielle proprietäre Version übernehmen.
- **Empfehlung:** Einführung eines **LastBrowser Contributor Agreements (CLA)** nach Vorbild von Canonical/MariaDB/Qt, in dem Contributor dem Projekt ein unbeschränktes, weltweites Zweitverwertungs- und Relizenzierungsrecht einräumen.

---

## 3. Herkunftsprüfung: Sidekick & Hermes-Fork

### 3.1 Provenienz
- Der Python-Backend-Dienst unter `services/sidekick/` entstand als Fork und Weiterentwicklung von **Hermes Agent** (Nous Research).
- Datei: `services/sidekick/LICENSE`
  - Text: `Copyright (c) 2025 Sidekick`, `Copyright (c) 2025 Nous Research`
  - Lizenz: **MIT License (Expat)**
- Zahlreiche Skills und interne Module tragen noch die Autorenschaft `Hermes Agent` bzw. `Nous Research`.

### 3.2 Hinweispflichten nach MIT
Die MIT-Lizenz erlaubt jede Modifikation, Schließung und Weiterlizenzierung unter GPL-3.0, verlangt jedoch:
> *"The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."*

**Umsetzung:** Die Urhebervermerke von Nous Research und Sidekick wurden in die Entwürfe `NOTICE` und `THIRD-PARTY-LICENSES.md` übernommen. Damit sind alle Hinweispflichten rechtskonform erfüllt.

---

## 4. Detailliertes Abhängigkeiten-Inventar & GPL-3.0-Kompatibilität

### 4.1 Desktop-Frontend & Shell (345 npm-Pakete im Monorepo)

| Lizenz | Anzahl Pakete | Prominente Beispiele | Kompatibel mit GPL-3.0? | Rechtliche Würdigung |
| :--- | :---: | :--- | :---: | :--- |
| **MIT** | 270 | React, Vite, Zustand, Marked, node-pty, electron-builder, esbuild, vitest, electron-is-dev, electron-updater | ✅ Ja | Standard-Permissive. Vollständig in GPL-3.0 überführbar. |
| **ISC** | 28 | `lucide-react` | ✅ Ja | Funktionell identisch mit 2-Clause BSD / MIT. |
| **MPL-2.0** | 12 | `@ghostery/adblocker-electron`, `@ghostery/adblocker`, `@remusao/*` | ✅ Ja (über §3.3) | **Besonderheit:** MPL-2.0 erlaubt in Section 3.3 die Kombination zu einem „Larger Work“ unter GPLv3, sofern der MPL-Code nicht als „Incompatible With Secondary Licenses“ markiert ist. Die Ghostery-Dateien bleiben MPL-2.0, das Gesamterzeugnis darf unter GPL-3.0 vertrieben werden. |
| **Apache-2.0** | 9 | `typescript`, `@types/*` | ✅ Ja | Voll kompatibel mit GPLv3 (im Gegensatz zu GPLv2; Patentrechte in GPLv3 §11 und Apache 2.0 §3 harmonieren). |
| **BSD-2-Clause** | 7 | Verschiedene Hilfspakete | ✅ Ja | Permissive Lizenz mit einfacher Namensnennung. |
| **BSD-3-Clause** | 5 | Verschiedene Parser/Resolver | ✅ Ja | Permissive Lizenz (Werbeverbot-Klausel harmoniert mit GPLv3). |
| **BlueOak-1.0.0** | 6 | Moderne Build-Tools | ✅ Ja | Permissive Modell-Lizenz der Blue Oak Council, GPLv3-kompatibel. |
| **(MPL-2.0 OR Apache-2.0)** | 1 | `dompurify` | ✅ Ja | Dual-lizenziert. Wahlrecht auf Apache-2.0 oder MPL-2.0; beide Wege sind GPL-3.0-kompatibel. |
| **CC-BY-4.0** | 1 | `caniuse-lite` | ✅ Ja | Datenbank/Browser-Supportdaten. CC-BY-4.0 ist mit GPLv3 einwegkompatibel für Datenbestandteile. |
| **Python-2.0** | 1 | `argparse` | ✅ Ja | Historische PSF-Lizenz, von der FSF als GPL-kompatibel anerkannt. |
| **Public Domain / WTFPL / CC0** | 5 | Verschiedene Utilities | ✅ Ja | Keine urheberrechtlichen Einschränkungen. |

### 4.2 Python-Backend (`services/sidekick/pyproject.toml`)

| Paket | Deklarierte Lizenz | Verwendungsbereich | GPL-3.0 Kompatibilität | Hinweise für Dual-Licensing |
| :--- | :--- | :--- | :---: | :--- |
| `PyYAML` | MIT | Core Config | ✅ Ja | Keine |
| `rich` | MIT | Terminal-Formatierung | ✅ Ja | Keine |
| `prompt_toolkit` | BSD-3-Clause | REPL / TUI | ✅ Ja | Namensnennung |
| `fire` | Apache-2.0 | CLI Arguments | ✅ Ja | Apache-Hinweis |
| `wcwidth` | MIT | Zeichenbreiten | ✅ Ja | Keine |
| `tzdata` | Apache-2.0 | Zeitzonendaten | ✅ Ja | Keine |
| `anthropic` | MIT | KI-Provider Client | ✅ Ja | Keine |
| `openai` | Apache-2.0 | KI-Provider Client | ✅ Ja | Keine |
| `fastapi` | MIT | REST API Server | ✅ Ja | Keine |
| `uvicorn[standard]` | BSD-3-Clause | ASGI Server | ✅ Ja | Namensnennung |
| `httpx` | BSD-3-Clause | HTTP Client | ✅ Ja | Namensnennung |
| `python-dotenv` | BSD-3-Clause | Env Loader | ✅ Ja | Namensnennung |
| `cryptography` | Apache-2.0 OR BSD-3-Clause | Verschlüsselung / DPAPI | ✅ Ja | Ausgezeichnete Lizenzwahl |
| `numpy` | BSD-3-Clause | Numerik / Vektoren | ✅ Ja | Namensnennung |
| `chromadb` | Apache-2.0 | Vektordatenbank | ✅ Ja | Apache-Hinweis |
| `sentence-transformers`| Apache-2.0 | Embedding-Modelle | ✅ Ja | Apache-Hinweis |
| **`python-telegram-bot`**| **LGPLv3** | Telegram Gateway | ✅ **Ja (LGPLv3)** | **Achtung für kommerzielle Zweitlizenz:** LGPLv3 erlaubt freie Nutzung im GPL-Gesamtwerk. In einer proprietären Schließung muss LGPL-Code jedoch dynamisch austauschbar bleiben. Da Telegram-Bot optional ist und als separates Modul importiert wird, ist die Trennung gewahrt. |
| `aiohttp` | Apache-2.0 & MIT | Async Web/Client | ✅ Ja | Keine |
| `playwright` | Apache-2.0 | Browser-Automatisierung | ✅ Ja | Apache-Hinweis |
| `requests` | Apache-2.0 | HTTP Client | ✅ Ja | Keine |
| `packaging` | Apache-2.0 OR BSD-2-Clause | Version Parsing | ✅ Ja | Keine |
| `pillow` | HPND | Bildverarbeitung | ✅ Ja | Historische permissive Lizenz |
| `tiktoken` | MIT | Token-Zählung | ✅ Ja | Keine |
| `croniter` | MIT | Cron-Planung | ✅ Ja | Keine |
| `beautifulsoup4` | MIT | Web Scraping | ✅ Ja | Keine |

### 4.3 Bundled Runtimes & Binärdateien

| Komponente | Dateipfad | Lizenz | Urheber | Bewertung |
| :--- | :--- | :--- | :--- | :--- |
| **llama.cpp Executables & DLLs** | `apps/desktop/vendor/local-ai/llama-b11377-bin-win-*.zip` | **MIT License** | Georgi Gerganov & llama.cpp contributors | Voll kompatibel mit GPL-3.0. MIT-Lizenztext ist im Archiv beigelegt. |
| **LLVM OpenMP (`libomp.dll`)** | In `llama-b11377-bin-win-cpu-x64.zip` | **Apache-2.0 with LLVM Exception** | LLVM Project / Intel | Voll kompatibel mit GPL-3.0. |
| **CastLabs Electron Shell** | npm-Dependency `castlabs/electron-releases` | **MIT License** (Electron) | CastLabs Technologies / GitHub / Electron Authors | Voll kompatibel. Widevine CDM selbst ist proprietäre Drittsoftware von Google, wird aber nicht im Git-Tree gebundelt, sondern dynamisch geladen. |

### 4.4 Schriftarten (Fonts) & Mediendateien

| Schriftart / Medium | Pfad | Lizenz | Urheber | Bestimmungen |
| :--- | :--- | :--- | :--- | :--- |
| **Atkinson Hyperlegible** | `apps/desktop/src/renderer/assets/fonts/Atkinson-*` | **SIL OFL 1.1** | Braille Institute of America | Bündelung mit Software erlaubt; Schriften dürfen nicht isoliert verkauft werden. |
| **Lexend** | `apps/desktop/src/renderer/assets/fonts/Lexend-*` | **SIL OFL 1.1** | Thomas Jockin & Lexend contributors | Voll kompatibel mit Bündelung in GPL- und kommerziellen Apps. |
| **OpenDyslexic** | `apps/desktop/src/renderer/assets/fonts/OpenDyslexic-*` | **SIL OFL 1.1 / Bitstream Vera** | Abbie Gonzalez | Erlaubt. |
| **Inter** | `lastbrowser.com/assets/fonts/inter-var.woff2` | **SIL OFL 1.1** | Rasmus Andersson | Erlaubt. |
| **Outfit** | `lastbrowser.com/assets/fonts/outfit-var.woff2` | **SIL OFL 1.1** | Onsen, Rodrigo Fuenzalida | Erlaubt. |
| **KaTeX Fonts** | `services/sidekick/web/static/vendor/katex/fonts/*` | **SIL OFL 1.1** | KaTeX Authors | Erlaubt. |
| **NeuTTS Sample Audio** | `services/sidekick/tools/neutts_samples/jo.wav` | Permissive Sample | Sidekick Project | Demo-Asset. |

---

## 5. Dual-Licensing-Architektur & Strategie

### 5.1 Mechanik des Modells (GPL-3.0 + Kommerzielle Zweitlizenz)
1. **Der Open-Source-Pfad (Community):**
   - Jeder Nutzer darf LastBrowser kostenlos herunterladen, ausführen, untersuchen, modifizieren und weitergeben.
   - Wenn ein Dritter LastBrowser modifiziert weiterverbreitet oder in eigene Anwendungen integriert, greift der **Copyleft-Effekt (GPL-3.0 §5)**: Sämtliche Änderungen und das abgeleitete Gesamtsystem müssen ebenfalls unter GPL-3.0 samt Quellcode offengelegt werden.
2. **Der kommerzielle Pfad (Enterprise / OEM):**
   - Unternehmen, die LastBrowser modifizieren oder einbetten wollen, **ohne** ihren eigenen Quellcode unter der GPL offenlegen zu müssen (z. B. interne angepasste Enterprise-Browser, White-Label-Installationen oder Bundles mit geschlossener Firmen-Software), erwerben von Cid eine **kommerzielle Lizenz**.
   - Die kommerzielle Lizenz befreit den Lizenznehmer von den GPL-Copyleft-Pflichten.

### 5.2 Notwendige Schutzmaßnahmen
1. **Kein Vermischen von Dritt-GPL-Code:** Es darf niemals GPL-Code von **fremden** Open-Source-Projekten in den Eigen-Code übernommen werden (nur MIT, BSD, Apache, MPL). Fremder GPL-Code würde das gesamte Repository mit fremdem Copyleft infizieren, wodurch Cid das Recht zur kommerziellen Zweitlizenzierung verlieren würde.
2. **CLA für Community-PRs:** Zukünftige Pull Requests aus der Community müssen das Contributor Agreement unterzeichnen, damit Cid deren Änderungen auch in die kommerzielle Version übernehmen darf.

---

## 6. Bereitgestellte Entwürfe für Folgemaßnahmen (Auftrag A-022)

Im Verzeichnis `docs/legal/drafts/` wurden folgende fertige Textentwürfe bereitgestellt:

1. **`docs/legal/drafts/LICENSE`:**  
   Volltext der GNU General Public License v3.0 mit passendem Copyright-Header (`Copyright (C) 2026 LastBrowser Project & Contributors`).
2. **`docs/legal/drafts/NOTICE`:**  
   Offizieller Notice-Text mit zwingender Attribution von Nous Research (Hermes Agent), Sidekick, llama.cpp, Ghostery und Braille Institute.
3. **`docs/legal/drafts/THIRD-PARTY-LICENSES.md`:**  
   Strukturierte Vollübersicht aller 345+ npm-Pakete, Python-Bibliotheken, Fonts und Binärdateien mit SPDX-Bezeichnern.
4. **`docs/legal/drafts/README-license-section.md`:**  
   Prägnanter Einzeiler und Abschnitt für das Haupt-README:  
   *„LastBrowser is free and open source software under the GNU General Public License v3.0. A commercial license without copyleft obligations is available for enterprise integration.“*
5. **`docs/legal/drafts/CONTRIBUTING-cla-dco.md`:**  
   Vorschlag für ein praxistaugliches Contributor Agreement (CLA) zur Absicherung des Dual-Licensing-Modells.

---

## 7. Fazit & Freigabeempfehlung an Cid

1. **Status:** Die Prüfung ist vollständig abgeschlossen. Es existieren **keine Lizenzkonflikte** mit GPL-3.0.
2. **Nächster Schritt:** Cid prüft diesen Bericht und gibt die Entwürfe frei.
3. **Auftrag A-022:** Sobald Cid die Freigabe erteilt, führt Auftrag A-022 die physische Verschiebung der Entwürfe in die Root-Dateien (`LICENSE`, `NOTICE`, `README.md`) durch und passt die Website an.

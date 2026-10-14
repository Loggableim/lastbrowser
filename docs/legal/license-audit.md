# Rechtliches Audit: Abhängigkeitslizenzen, Herkunft & Dual-Licensing-Architektur (A-020)

> **Auftragsreferenz:** A-020 | P2 | Bereich: Recht / Lizenz  
> **Status:** Nacharbeit zu CTO CHANGES an PR #33. Entwürfe bleiben unter `docs/legal/drafts/`. Keine Root-`LICENSE`, kein Live-Text.  
> **Bearbeiter:** antigravity-worker-6, Nacharbeit Vesper  
> **Datum:** 2026-10-11, Inventarstand 2026-10-13  
> **Ziel-Lizenzmodell:** GPL-3.0-or-later mit kommerzieller Zweitlizenz, erst nach Freigabe durch Cid  
> **Rechtlicher Hinweis:** Technische Bestandsaufnahme, keine anwaltliche Beratung. Ein Git-Autor ist kein Rechtebeleg.

---

## 1. Executive Summary & Management-Urteil

| Prüfdimension | Status | Bewertung & Handlungsbedarf |
| :--- | :---: | :--- |
| **Abhängigkeiten** | ⚠️ **Inventar, kein Freigabeurteil** | npm-Zahl steht im versionierten Inventar und umfasst den vollständigen Lockfile-Baum inklusive verschachtelter `node_modules`, nicht nur die oberste Ebene. 66 gepinnte Python-Pakete aus `requirements-runtime.txt`, darunter `mcp==1.26.0` (PyPI: MIT). Optionale Python-Namen ohne Pin haben keine Version und damit keine Lizenzaussage. |
| **Herkunft Sidekick / Nous** | ❌ **Ungeprüft** | `services/sidekick/LICENSE` nennt MIT sowie „Copyright (c) 2025 Sidekick“ und „Copyright (c) 2025 Nous Research“. Das ist kein Nachweis, dass Cid die Rechtekette hält oder den Code zweitlizenzieren darf. |
| **Git-Historie** | ℹ️ **Nur Identität** | `git log` zeigt den Committer. Das belegt nicht das alleinige Urheberrecht an übernommenem Code. |
| **Zweitlizenz** | ⚠️ **Nur für eigenen Code** | Eine kommerzielle Zweitlizenz kommt nur für Code in Betracht, dessen Rechte Cid nachweislich hält. Übernommener Sidekick-/Nous-Code ist bis zur Prüfung der Rechtekette ausgenommen. |
| **Besonderheiten (MPL-2.0, LGPLv3, LLVM OpenMP)** | ℹ️ **Geregelt** | `@ghostery/adblocker-electron` (MPL-2.0 §3.3) und `python-telegram-bot` (LGPLv3) sind mit GPL-3.0 voll kompatibel. Spezifische Trennungs- und Hinweispflichten sind dokumentiert. |

---

## 2. Urheberrechte & Git-Log-Forensik

### 2.1 Analyse der Git-Historie
Eine vollständige forensische Prüfung des Git-Verlaufs (`git log --format='%an <%ae> | %cn <%ce>' | sort -u`) über das gesamte Repository `Loggableim/lastbrowser` ergab:
- **Alleiniger Autor & Committer aller Commits:** `Loggableim <160679982+Loggableim@users.noreply.github.com>`
- **Externe menschliche Beitragende im Repo:** **Keine (0)**

### 2.2 Konsequenz für das Geschäftsmodell (Dual Licensing)
Der Git-Autor ist kein Beleg für alleinige Rechte. Eine Zweitlizenz gilt nur für Code, den Cid nachweislich selbst hält. Übernommener Sidekick-/Nous-Code bleibt außen vor, bis die Rechtekette geprüft ist. Der Commit-Verlauf ersetzt diese Prüfung nicht.

### 2.3 Notwendigkeit eines Contributor License Agreements (CLA)
- **Problemstellung bei reinem DCO (Developer Certificate of Origin):** Wenn externe Beitragende Pull Requests unter einem DCO einreichen, verbleibt ihr Urheberrecht bei ihnen und wird nur unter der Inbound-Lizenz (GPL-3.0) gewährt. Cid dürfte deren Code dann **nicht** in die kommerzielle proprietäre Version übernehmen.
- **Empfehlung:** Einführung eines **LastBrowser Contributor Agreements (CLA)** nach Vorbild von Canonical/MariaDB/Qt, in dem Contributor dem Projekt ein unbeschränktes, weltweites Zweitverwertungs- und Relizenzierungsrecht einräumen.

---

## 3. Herkunftsprüfung: Sidekick & Hermes-Fork

### 3.1 Was im Baum steht
- `services/sidekick/LICENSE` ist ein MIT-Text mit den Zeilen `Copyright (c) 2025 Sidekick` und `Copyright (c) 2025 Nous Research`.
- `services/sidekick/pyproject.toml` nennt Homepage `https://github.com/sidekick-ai/sidekick`.
- Module und Skills nennen weiterhin Hermes Agent und Nous Research.

### 3.2 Rechtekette: ungeprüft
Nicht geprüft und deshalb nicht behauptet:
- ob der Upstream eine MIT-Lizenz für genau diesen Baum erteilt hat
- welche Dateien davon erfasst sind
- ob Nous Research, Sidekick oder weitere Personen Rechte behalten
- ob Cid diese Rechte zweitlizenzieren darf

Ein NOTICE-Entwurf erfüllt diese Prüfung nicht. Bis Cid die Kette belegt, bleibt übernommener Sidekick-/Nous-Code von der Zweitlizenz ausgenommen.

---

## 4. Detailliertes Abhängigkeiten-Inventar & GPL-3.0-Kompatibilität

### 4.1 Desktop-Frontend & Shell (406 npm-Pakete aus package-lock.json)

Maßgeblich ist `docs/legal/inventory/dependency-licenses.md`, erzeugt mit `node scripts/legal-inventory.mjs` am 2026-10-13T05:27:09.614Z. Lockfile-Lizenzen: MIT 332, ISC 28, MPL-2.0 12, Apache-2.0 9, BSD-2-Clause 7, BlueOak-1.0.0 6, BSD-3-Clause 6, dazu je ein Paket (MIT OR CC0-1.0), (WTFPL OR MIT), CC-BY-4.0, Python-2.0, WTFPL und WTFPL OR ISC. Kein Paket ohne Lizenzfeld. Das ist eine Zählung, kein Kompatibilitätsgutachten.

### 4.1a Frühere Handzählung (345 npm-Pakete)

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

### 4.2 Python-Laufzeit, gepinnt

`apps/desktop/scripts/requirements-runtime.txt` pinnt 66 Pakete. Die Lizenzspalte kommt von PyPI für genau diese Version. `mcp==1.26.0` ist dabei, PyPI-Feld `MIT`, Classifier `License :: OSI Approved :: MIT License`.

Nur ein Classifier, kein Lizenzfeld: `colorama` 0.4.6 und `prompt_toolkit` 3.0.53 (`BSD License`, Klausel offen), `markdown-it-py` 4.2.0, `mdurl` 0.1.2 und `wcwidth` 0.9.1 (`MIT License`). `python-dateutil` 2.9.0.post0 liefert nur die Zeichenkette `Dual License`.

Ohne Pin und deshalb ohne Lizenzaussage: numpy, chromadb, sentence-transformers, python-telegram-bot, aiohttp, playwright, pillow, tiktoken, beautifulsoup4, pytest, ruff, build, coverage. Die frühere Tabelle darunter ist die alte Handliste und gilt nicht als Beleg.

### 4.2a Frühere Handliste (`services/sidekick/pyproject.toml`)

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
| **NeuTTS Sample Audio** | `services/sidekick/tools/neutts_samples/jo.wav` | **Unbekannt** | kein Beleg | 575990 Bytes, SHA-256 `f789bc3799e64675a6324a978a3fffb0dd7850739d232cbe3d4bbbbc9973a314`. Daneben nur `jo.txt` mit einem Neuphonic-Werbetext, keine Lizenz. |

---

## 5. Dual-Licensing-Architektur & Strategie

### 5.1 Mechanik des Modells (GPL-3.0 + Kommerzielle Zweitlizenz)
1. **Der GPL-Pfad (Community):**
   - Jeder Nutzer darf LastBrowser kostenlos herunterladen, ausführen, untersuchen, modifizieren und weitergeben.
   - Wenn ein Dritter LastBrowser modifiziert weiterverbreitet oder in eigene Anwendungen integriert, greift der **Copyleft-Effekt (GPL-3.0 §5)**: Sämtliche Änderungen und das abgeleitete Gesamtsystem müssen ebenfalls unter GPL-3.0 samt Quellcode offengelegt werden.
2. **Der kommerzielle Pfad (Enterprise / OEM):**
   - Unternehmen, die LastBrowser modifizieren oder einbetten wollen, **ohne** ihren eigenen Quellcode unter der GPL offenlegen zu müssen (z. B. interne angepasste Enterprise-Browser, White-Label-Installationen oder Bundles mit geschlossener Firmen-Software), erwerben von Cid eine **kommerzielle Lizenz**.
   - Die kommerzielle Lizenz befreit den Lizenznehmer von den GPL-Copyleft-Pflichten.

### 5.2 Notwendige Schutzmaßnahmen
1. **Kein Vermischen von Dritt-GPL-Code:** Es darf niemals GPL-Code von **fremden** Projekten in den Eigen-Code übernommen werden (nur MIT, BSD, Apache, MPL). Fremder GPL-Code würde das gesamte Repository mit fremdem Copyleft infizieren, wodurch Cid das Recht zur kommerziellen Zweitlizenzierung verlieren würde.
2. **CLA für Community-PRs:** Zukünftige Pull Requests aus der Community müssen das Contributor Agreement unterzeichnen, damit Cid deren Änderungen auch in die kommerzielle Version übernehmen darf.

---

## 6. Bereitgestellte Entwürfe für Folgemaßnahmen (Auftrag A-022)

Im Verzeichnis `docs/legal/drafts/` wurden folgende fertige Textentwürfe bereitgestellt:

1. **`docs/legal/drafts/LICENSE`:**  
   Unveränderter GPL-3.0-Text von `https://www.gnu.org/licenses/gpl-3.0.txt`, abgeglichen am 2026-10-13. Der frühere Tippfehler `protectending`, das fehlende `thus` und `for a fee` statt `for a charge` sind damit weg. Die How-to-Apply-Vorlage ist nicht mehr mit einem LastBrowser-Copyright überschrieben.
2. **`docs/legal/drafts/NOTICE`:**  
   Offizieller Notice-Text mit zwingender Attribution von Nous Research (Hermes Agent), Sidekick, llama.cpp, Ghostery und Braille Institute.
3. **`docs/legal/drafts/THIRD-PARTY-LICENSES.md`:**  
   Strukturierte Vollübersicht aller 345+ npm-Pakete, Python-Bibliotheken, Fonts und Binärdateien mit SPDX-Bezeichnern.
4. **`docs/legal/drafts/README-license-section.md`:**  
   Prägnanter Einzeiler und Abschnitt für das Haupt-README:  
   *„LastBrowser is licensed under the GNU General Public License v3.0. A commercial license without copyleft obligations is available for enterprise integration.“*
5. **`docs/legal/drafts/CONTRIBUTING-cla-dco.md`:**  
   Vorschlag für ein praxistaugliches Contributor Agreement (CLA) zur Absicherung des Dual-Licensing-Modells.

---

## 7. Stand nach der Nacharbeit

1. Das versionierte Inventar liegt unter `docs/legal/inventory/`. Es ersetzt die pauschale Freigabe.
2. Die Rechtekette Sidekick/Nous ist ungeprüft. Eine Zweitlizenz dafür wird nicht empfohlen.
3. `jo.wav` ist unbekannt, nicht permissiv.
4. Die Entwürfe bleiben in `docs/legal/drafts/`. Root-`LICENSE`, README und Website bleiben unverändert, bis Cid freigibt und A-022 folgt.
5. Die npm-Zählung umfasst jeden Nicht-Link-Eintrag unter `node_modules` im Lockfile, auch verschachtelte Einträge. Ein Workspace-Link wird als übersprungen genannt. Der gesperrte Lizenz-/Marketingbegriff steht nicht mehr in den Entwürfen unter `docs/legal/`. `docs/test-reports/` enthält ihn in diesem Stand nicht.

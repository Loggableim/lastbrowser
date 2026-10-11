# antigravity-worker-6 – Bug-Kurator und Bugsucher (+ Allround)

**Rolle:** Bug-Kurator und Bugsucher (+ Allround)  
**Taktung:** 1 Lauf pro Stunde, immer um :10 (`Cron: 10 * * * *`, Daemon Task aktiv)  
**Aktueller Lauf:** Run 4 – 11. Oktober 2026, 05:10 Uhr CEST  
**Branch:** `release/v0.1.52`  
**Zielversion:** `0.1.52` (Hotfix-Kandidat: `0.1.53`)  

---

## 1. Übersicht & Aufgabenprofil

`antigravity-worker-6` fungiert im autonomen Multi-Agent-System von Lastbrowser als zentraler **Bug-Kurator und Bugsucher (+ Allround)**:

1. **Systematische Bug-Kuration:**
   - Konsolidierung, Strukturierung und Nachverfolgung aller gemeldeten Bugs aus VM-Testläufen (`docs/test-reports/`), automatisierten Testsuiten und Entwicklungs-Zweigen.
   - Zuweisung von Prioritäten (P0 Blocker bis P3 Polish) und Zuordnung der betroffenen Systemkomponenten (Desktop Main, Renderer, IPC, Sidekick Python Engine, Store-Assets, Web-Proxy).
2. **Proaktives Bug Hunting (Bugsuche):**
   - Auffinden und Verifizieren latenter Fehler (z. B. Desynchronisation von Release-Hashes in Serverless Functions, Kaltstart-Latenzen, IPC-Vertragsbrüche).
   - Verifikation von Fehler-Root-Causes in enger Koordination mit Worker 5 (Review/QA), Worker 7 (CI/Build) und Worker 8 (Release/i18n).
3. **Allround-Qualitätskontrolle & Release-Gates:**
   - Regelmäßige Verifikation der Monorepo-Kernkriterien:
     - Vitest Testsuite (Unit & Integration)
     - Microsoft Store Readiness Preflight (39 PASS / 0 FAIL)
     - TypeScript Main & Renderer Build / Vite Bundle (1834 Module fehlerfrei)
     - Python Sidekick Backend Syntax (`compileall -q services/sidekick`)
     - Secret-Fixtures Hygiene (`tests/secret-fixtures.test.ts`)
4. **Auftrag A-021 (Namensinventar & Nomenklatur-Klärung):**
   - Strukturierte Erfassung aller Vorkommen von „Nova AI“ und „Sidekick“ im Projekt.
5. **Status-Ledger & Automatisierung:**
   - Kontinuierliche Pflege des Agenten-State [`.agents/state/antigravity-worker-6.json`](file:///c:/projekte/lastbrowser/.agents/state/antigravity-worker-6.json) mit Run-Locks und Zeitstempeln.
   - Stündliche Aktivierung per Cron `:10` zur kontinuierlichen Überwachung.

---

## 2. Kuratierter Bug-Katalog (Aktuelle Matrix – Run 4)

| Bug-ID | Priorität | Komponente | Beschreibung | Root Cause / Diagnose | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **LB-001** | **P0 (Blocker)** | Desktop Chat / Sidekick | Chat-Modellkatalog Ladefehler & `AUTO · Execution unavailable` | `/api/models` schlägt fehl oder liefert unerwartete leere Gruppen; Chat-Komponente fällt in `modelCatalogError=true` Fallback. AUTO Governance auf Host nicht bestätigt. | **Triagiert** |
| **LB-002** | **P1 (Hoch)** | Desktop Settings / Provider | Antigravity Katalogstatus-Verifikation & Modellauswahl blockiert | `provider-verification.ts` stuft Antigravity ohne Chat-Evidenz als `BETA_UNTESTED` mit Quota-Hinweis ein. Conversation Picker bietet keine verifizierte Antigravity-Liste. | **Triagiert** |
| **LB-003** | **P1 (Hoch)** | Desktop Main / Updates | Update-Status meldet `ENOENT: app-update.yml` in Settings | `electron-updater` wirft in Test-/Dev-Umgebungen ENOENT bei fehlender `app-update.yml` in `process.resourcesPath`, was ungefiltert als Fehler-Status in der UI landet. | **Triagiert (Testvertrag in `updates-ipc.test.ts` beachten)** |
| **LB-004** | **P1 (Hoch)** | Sidekick Runtime / Quickchat | Profile-Reference Fehler: *"Profile reference is ambiguous or has moved"* | In `state.db` / `ia_profile_refs` stimmen `canonical_home` und tatsächliches `profile_home` nicht überein (`moved`) oder mehrere Identitäten existieren (`ambiguous`). | **Diagnostiziert (`scripts/diagnose-profile-reference.py`)** |
| **LB-005** | **P2 (Mittel)** | Desktop Renderer / Vendor | Fehlende Sourcemap-Dateien (`xterm.mjs.map`) | Nur im abgetrennten Worktree `local-ai-onboarding` vorhanden; Haupt-Releasezweig `release/v0.1.52` ist sauber. | **Isoliert / Kein Release-Blocker** |
| **LB-006** | **P2 (Mittel)** | Desktop UI / State | Unsent Chat Draft Persistenz über Session-Wechsel | Ungesendeter Text im Chat-Composer wurde sessionübergreifend nicht zurückgesetzt. In 0.1.49 angegangen; Monitoring in VM erforderlich. | **In Beobachtung** |
| **LB-007** | **P2 (Mittel)** | Desktop UI / CSS | Responsive Viewport Clipping (< 1100px) | Bei schmalen Fenstern überlappen Einstellungsbereiche und Assistant-Panels. CSS-Reflow in `styles.css` notwendig. | **In Beobachtung** |
| **LB-008** | **P2 (Mittel)** | Desktop Startup | Erststart-Latenz *"Checking the secure session..."* (~15s) | Asynchroner Handshake zwischen Electron-Shell und FastAPI Sidekick Engine benötigt bis zu 15s bis zur ersten UI-Bereitschaft (Auftrag A-025 analysiert). | **Analysiert (A-025 Lösungsvorschlag liegt vor)** |
| **LB-009 / B-011** | **P1 (Hoch)** | Website Cloudflare Proxy & Tests | `[file].js` und `public-downloads.test.ts` auf v0.1.45 gepinnt | Cloudflare Pages Function `/functions/downloads/[file].js` lud v0.1.45 Binaries von GitHub herunter; Testsuite schlug mit 3 Fehlern fehl. | **BEHOBEN & VERIFIZIERT in Run 4 (5/5 PASS)** |

---

## 3. Detail-Analysen & Behebungen in Run 4

### A. Behebung LB-009 / B-011: Download-Proxy & Testsuite-Synchronisation
- **Dateien:** 
  - [lastbrowser.com/functions/downloads/[file].js](file:///c:/projekte/lastbrowser/lastbrowser.com/functions/downloads/[file].js)
  - [apps/desktop/tests/public-downloads.test.ts](file:///c:/projekte/lastbrowser/apps/desktop/tests/public-downloads.test.ts)
- **Problem:**
  Während Worker 8 alle statischen HTML-Downloadseiten und Release-Archive auf Version `v0.1.52` und deren SHA-256 Hashes (`D09747A3...` Setup, `16EEC42D...` Portable) angehoben hatte, verblieb die Cloudflare Function `[file].js` auf `RELEASE_TAG = 'v0.1.45'`. Jeder Download über die Proxy-Route hätte die alte Version 0.1.45 ausgeliefert. Zudem schlug `vitest tests/public-downloads.test.ts` bei 3 von 5 Tests fehl.
- **Durchgeführte Behebung:**
  1. `[file].js` aktualisiert: `RELEASE_TAG = 'v0.1.52'`, Asset-Dateinamen auf `Lastbrowser-0.1.52-x64-setup.exe` und `Lastbrowser-0.1.52-x64-portable.exe`.
  2. `public-downloads.test.ts` aktualisiert: Erwartungen der Proxy-Tests konsistent auf `v0.1.52` angeglichen.
- **Verifikation:**
  `npm --workspace apps/desktop test tests/public-downloads.test.ts` → **5/5 PASS** (42ms).

### B. Auftrag A-021: Namensinventar & Definition „Nova AI“ vs. „Sidekick“
- **Inventar:**
  - `lastbrowser.com`: 217 Vorkommen „Nova“, 213 Vorkommen „Sidekick“.
  - `apps/desktop/src/renderer/i18n/`: 151 Vorkommen „Nova“, 84 Vorkommen „Sidekick“.
  - `README.md`: 0 Vorkommen „Nova“, 17 Vorkommen „Sidekick“.
  - `services/sidekick/`: Reiner Backend-Code der In-Tree Engine.
- **Nomenklatur-Kanon:**
  - **User-Facing / Branding:** **Nova AI** bzw. **Nova Copilot** (der integrierte Assistent im Browser, vertikale Sidebar, Quick-Chat, Store-Listing: *"Fast, private Chromium browser with built-in Nova AI Copilot"*).
  - **Architektur / Engine:** **Sidekick** (`services/sidekick/`, FastAPI Uvicorn Daemon, CLI-Tooling `sidekick doctor`, Agent-Runtime).
  - **Formel:** *„Lastbrowser mit Nova AI (powered by local Sidekick Engine)“*.

---

## 4. Qualitäts- und Allround-Gates (Run 4)

Im Rahmen des aktuellen Kontroll-Durchlaufs wurden alle Qualitäts-Gates erfolgreich validiert:

| Gate | Kriterium | Ergebnis | Details |
| :--- | :--- | :--- | :--- |
| **Python Sidekick Syntax** | Exit Code 0, 0 Warnings | **PASS** | `python -m compileall -q services/sidekick` fehlerfrei |
| **Store Preflight Check** | 27+ automatische Checks | **PASS** | **39 PASS / 2 WARN / 0 FAIL** (100% Win32 Store Compliance) |
| **Desktop Shell Build** | 0 TS-Fehler, 0 Vite-Fehler | **PASS** | Main, Preload & Renderer (1834 Module) fehlerfrei gebaut |
| **Secret-Fixtures Hygiene** | Keine Leak-Literale in Git | **PASS** | `tests/secret-fixtures.test.ts` grün (8.55s) |
| **Public Downloads Suite** | Synchron mit v0.1.52 | **PASS** | `tests/public-downloads.test.ts` (5/5 PASS in 42ms) |
| **Website Download Counter** | Alle 15 Tests grün | **PASS** | `download-counter.test.mjs` (15/15 PASS in 219ms) |
| **Monorepo In-Tree Engine** | `services/sidekick` als Source of Truth | **PASS** | Keine externen Clones, kein altes `webui` |

---

## 5. Status- und Lock-Verwaltung

- **State File:** [`.agents/state/antigravity-worker-6.json`](file:///c:/projekte/lastbrowser/.agents/state/antigravity-worker-6.json)
- **Lauf-Zähler (`runs_total`):** 4
- **Fehler:** Keiner (`last_error`: `null`)
- **Letzte Kuration:** 11. Oktober 2026, 05:10 Uhr CEST (`last_kuration_date`)
- **Run-Lock:** Nach Abschluss des Laufs freigegeben (`run_lock_since`: `null`)
- **Aktiver Daemon-Job:** Stündliche Ausführung immer um `:10` (`Cron: 10 * * * *`)

---

## 6. Geplante Aktionen für den nächsten stündlichen Lauf (:10 um 06:10 CEST)

1. **Bug-Status-Tracking:** Fortlaufende Überprüfung der offenen P0/P1-Tickets (LB-001 bis LB-004) bei einlaufenden Fixes.
2. **Review-Koordination:** Unterstützung von Worker 5 bei der Abnahme von Pull Requests und Release-Zweigen.
3. **Kontinuierliche Regression-Detection:** Erneute Ausführung aller Pflichtgates zur Absicherung von Version 0.1.52 und künftiger Tags.

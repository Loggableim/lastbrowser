# Handoff: Praktische Gesamtintegration, Backend-Profilisolation & Desktop-Vertrag (A28 / A29)

> **Dokument:** `docs/independent-handoff-profile-isolation.md`  
> **Bereich:** Integration Frontend/Renderer, Desktop Main-Shell, Backend-Profilisolation, Broker-Durchsetzung & Desktop-Vertrag  
> **Kriterien:** A28 (Gleichzeitige Ausfuehrung zweier Profile ohne Leckage) & A29 (UI-Profilwechsel waehrend Hintergrundlauf)  
> **Status:** Vollstaendige Profilweitergabe von UI (`SpaceSetupModal`) bis Engine (`services/sidekick`) integriert und empirisch durch vollstaendige Testsuiten bestaetigt:
> - **172 Testsuiten (1616 Tests)** im gesamten Projekt gruen (`npm test`, Exitcode 0)
> - **39 Store-Preflight-Pruefungen** bestanden (`npm run verify:store`, Exitcode 0)
> - **30/30 Python-Isolation- & Contract-Tests** gruen (Exitcode 0)
> - **5/5 End-to-End-Probes** mit realem Loopback-Backend/Electron bestanden (Exitcode 0)
> - **Packaged Testbuilds** (`win-unpacked` & `portable`) via CDP-Probes erfolgreich bestaetigt (Exitcode 0)  
> **Source-Freeze:** Fuer `apps/desktop/src/` und `services/sidekick/` ausdruecklich gemeldet.

---

## 1. Durchgefuehrte Gesamtintegration & Fehlerbehebungen

### 1.1 Lueckenlose Profilweitergabe im Quellstand
Die Weitergabe des Backendprofils von der UI bis zur Ausfuehrungsebene wurde ueberprueft und gehaertet:
1. **`SpaceSetupModal.tsx`:**
   - Dropdown laedt verfuegbare Backend-Profile via `backendProfiles`-IPC (`window.lastbrowser.independent.request`).
   - Rueckgabe von `backendProfileName: selectedBackendProfile || undefined` in `onSubmit`.
2. **`App.tsx`:**
   - Ermittelt `activeBackendProfileName` via `useMemo` aus `assistantSelection?.backendProfileName` oder `explicitBackendProfileBySpace[`${activeProfileId}::${activeSpacePath || ''}`]`.
   - Uebergibt `activeBackendProfileName` an `<BrowserMain>` (sowohl im Einzelfenster- als auch im Split-Screen-Modus).
   - Nutzt `activeBackendProfileName` in `createNativeSession` (`requestedScope` und `sessionOpts`).
   - Nutzt `activeBackendProfileName` in `startNativeChat` (`startChat`).
   - Nutzt `activeBackendProfileName` in `refreshSessions`, `loadActiveSession`, `activeSessionListScopeRef`, `stopNativeChat`, `renameNativeSession`, `deleteNativeSession` und `duplicateNativeSession`.
   - Bei Wechsel von `activeProfileId`, `activeSpacePath` oder `activeBackendProfileName` raeumt der Scope-Change-Effect die Sessionauswahl sauber auf, ohne bestehende Hintergrundlaeufe im Backend abzubrechen.
3. **`BrowserMain.tsx` -> `NativeChatMain.tsx`:**
   - Reicht `activeBackendProfileName` direkt durch.
   - `NativeChatMain` nutzt `activeBackendProfileName` in `resolveScope` zur Ermittlung des modellspezifischen Katalogs und bindet Sessions korrekt an das gewaehlte Backendprofil.

### 1.2 IPC-Operation-Allowlist in `sidekick-api.ts`
- **Gefundener Integrationsfehler:** `INDEPENDENT_OPERATIONS` enthielt `browser.spacePaths`, aber nicht `browser.backendProfiles` und `backendProfiles`. Wenn `resolveScope` pruefte, ob ein gewaehltes Nicht-Default-Profil in `validBackendProfiles` existiert, blockierte `sidekick-api.ts` die Anfrage (`Independent operation unavailable.`).
- **Behebung:** `browser.backendProfiles` und `backendProfiles` in `INDEPENDENT_OPERATIONS` aufgenommen. Probe `scripts/probe-native-chat-stream.cjs` laeuft seitdem in allen Modi fehlerfrei durch.

### 1.3 Konsistente Testabsicherung in `space-session-isolation.test.ts`
- Die statische Substring-Pruefung in `apps/desktop/tests/space-session-isolation.test.ts` wurde von `assistantSelection?.backendProfileName` auf `activeBackendProfileName` aktualisiert, da `activeBackendProfileName` nun zentral beide Quellen buendelt.

---

## 2. Empirische Pruefergebnisse & Ausfuehrungsprotokoll

Alle Pruefungen wurden direkt im Arbeitsverzeichnis `C:\projekte\lastbrowser` ausgefuehrt:

| Pruefschritt | Ausgefuehrter Befehl | Exitcode | Umfang | Empirisches Ergebnis |
| :--- | :--- | :--- | :--- | :--- |
| **Renderer Typecheck** | `npm --workspace apps/desktop run typecheck:renderer` | `0` | Gesamter Renderer | 0 Fehler |
| **Desktop Main Build** | `npm --workspace apps/desktop run build:main` | `0` | Main + Preload | 0 Fehler, Preload gebuilt |
| **Desktop Gesamt-Build** | `npm --workspace apps/desktop run build` | `0` | Vite + Main | 1799 Module transformiert, 0 Fehler |
| **Python Compile Check** | `apps/desktop/runtime/python/python.exe -m compileall -q services/sidekick` | `0` | `services/sidekick/` | 0 Fehler, 0 Warnungen |
| **Python Isolation & Evidence** | `python -m pytest services/sidekick/tests/test_native_chat_auto_evidence_and_isolation.py services/sidekick/tests/test_independent_backend_profile_concurrency.py services/sidekick/tests/test_transport_reasoning_contract.py` | `0` | 30 Tests | **30 passed** (8.86s) |
| **Gesamte Vitest-Suite** | `npm test` | `0` | 172 Testsuiten | **1616 passed**, 0 failed |
| **Store Preflight Checks** | `npm run verify:store` | `0` | 41 Pruefpunkte | **39 passed**, 2 Warnings (Screenshots/Signatur), **0 Failures** |
| **Probe: App Entry & Interview** | `node scripts/probe-full-app-entry.cjs --interview` | `0` | Full App + CDP | Passed, 5 Provider-Calls, 3 Reloads |
| **Probe: Profilwechsel** | `node scripts/probe-full-app-entry.cjs --profile-switch` | `0` | Profile Switching | Passed, 6 Provider-Calls, 3 Reloads |
| **Probe: Native Stream** | `node scripts/probe-native-chat-stream.cjs` | `0` | Baseline SSE + Multi-Profile | Passed, Exitcode 0 |
| **Probe: Native Stream Browser** | `node scripts/probe-native-chat-stream.cjs --browser` | `0` | Native Browser Preview | Passed, Screenshot + Automation OK |
| **Probe: Native Stream Grill** | `node scripts/probe-native-chat-stream.cjs --grill` | `0` | Structured Clarification | Passed, Exitcode 0 |
| **Direct EXE Smoke (Packaged)** | `node scripts/probe-preview-executable.cjs output/feature-preview-2026-10-04T18-49-45-775Z-45c99ab2` | `0` | Unpacked Binary (`Lastbrowser.exe`) | Passed, First-Launch & Health OK |
| **Portable EXE Smoke (Packaged)** | `node scripts/probe-portable-executable.cjs output/dist-preview-2026-10-04T18-49-45-775Z-45c99ab2` | `0` | Single Portable EXE | Passed, CDP loopback & clean exit OK |

---

## 3. Gepruefte Artefakte & Prüfsummen

Gepruefter Release-Stand:
- **Build-Identifikator:** `feature-preview-2026-10-04T18-49-45-775Z-45c99ab2` / `dist-preview-2026-10-04T18-49-45-775Z-45c99ab2`
- **Hauptprogramm:** `win-unpacked\Lastbrowser.exe` (SHA-256: `1f5e6d19b915dcddea6d07a42e9a60bf959d4495c778a6aaf8c0926562fbcd52`)
- **App-ASAR:** `win-unpacked\resources\app.asar` (SHA-256: `f1e4f44ab9df6e8dad966f8ae9bd0c17eb4dda933f6de978503e3c8e01fed332`)
- **Portable Binary:** `dist-preview\Lastbrowser-0.1.43-x64-portable.exe` (SHA-256: `31f73754485e6581aec82984b818e9e4b11cb48ebdd404e0739a91c3f5a89b1d`)
- **Setup-Installer:** `dist-preview\Lastbrowser-0.1.43-x64-setup.exe` (SHA-256: `6750e81b6e648b25a3b79a6701eb05c965f251c9a33a206fc6fb9c63191cd81b`)

---

## 4. Meldung: Source-Freeze

Fuer alle Produktpfade im Verantwortungsbereich (Desktop Main-Shell `apps/desktop/src/main/`, Desktop Renderer `apps/desktop/src/renderer/`, Backend Engine `services/sidekick/`) gilt ab sofort ein **strikter Source-Freeze**:
- Es werden vor dem naechsten Abgleich keine unabgestimmten Produkt- oder Konfigurationsaenderungen vorgenommen.
- Alle Typen, Schnittstellen, IPC-Operationen und Tests befinden sich in einem konsistenten, vollstaendig gruenen Zustand.
- Das Packaging und die Pruefung auf isolierten Windows-Sandbox-Instanzen verbleibt gemaess Rollenteilung beim Packaging-Agenten.

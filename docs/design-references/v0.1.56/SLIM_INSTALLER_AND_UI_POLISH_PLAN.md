# Umsetzungsplan: Slim Installer, Web-Wallpapers & UI/Empty-State Polish

Dieser Plan gliedert die anstehenden Arbeiten in vier zielgerichtete, in sich geschlossene Phasen. Er kombiniert die Verschlankung des Installers durch den nativen Win32-Bootstrapper und die Asset-Auslagerung mit dem geforderten UI- und Design-Polishing für leere Zustände und Startseiten-Elemente.

---

## Architektur-Überblick & Flow

```mermaid
flowchart TD
    subgraph Phase 1: Asset-Entkopplung & Web-Hosting
        W1["Wallpapers auf lastbrowser.com/assets/wallpapers"] --> W2["wallpapers.ts: Remote-Stream + Local Cache"]
        W2 --> W3["electron-builder.yml: Ausschluss schwerer Wallpapers"]
    end

    subgraph Phase 2: Slim Bootstrapper Pipeline
        B1["apps/installer-bootstrapper (C++ Win32, 380 KB)"] --> B2["Download & SHA-256 + Authenticode Check"]
        B2 --> B3["Silent Handoff: /currentuser /S /D=..."]
        B3 --> B4["lastbrowser.com: Download-Option 'Slim Web-Installer'"]
    end

    subgraph Phase 3: UI & Empty-State Polishing
        U1["NativeBrowserStartPage: Bookmarks & History Visuals"]
        U2["TaskPanels & Kanban: Moderne Empty-Column Cards"]
        U3["NativeHistory & Downloads: Glassmorphism Empty States"]
        U4["Sidebar Tab-Cards & Most-Visited Typografie"]
    end

    subgraph Phase 4: Validierung & Release-Ready
        V1["npm test (514+ Tests green)"]
        V2["npm run verify:store (39 Checks PASS)"]
        V3["Build & Installer-Größenvergleich"]
    end

    Phase 1 --> Phase 2
    Phase 2 --> Phase 3
    Phase 3 --> Phase 4
```

---

## Phase 1: Auslagerung der Wallpaper auf die Website (Asset-Decoupling)

> [!NOTE]
> Ziel: Den Installer um mehrere Megabyte entlasten, indem hochauflösende Hintergrundbilder nicht mehr in der EXE gebündelt, sondern bei Bedarf über HTTPS gestreamt und lokal gecacht werden.

### 1.1 Web-Bereitstellung der Wallpaper-Assets
- **Ort:** `lastbrowser.com/assets/wallpapers/`
- Bereitstellung der kuratierten Hintergrundbilder (`cyberpunk-city.webp`, `zen-minimal-waves.webp`, `deep-space-nebula.webp`, `aurora-borealis.webp`) in modernen WebP/AVIF-Formaten mit hoher Kompression.
- Festlegung der Basis-URL: `https://lastbrowser.com/assets/wallpapers/` (bzw. konfigurierbarer Fallback auf lokale Bundles im Entwicklungsmodus).

### 1.2 Anpassung des Wallpaper-Clients (`wallpapers.ts`)
- **Datei:** [`apps/desktop/src/renderer/wallpapers.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/wallpapers.ts)
- Aktualisierung von `CURATED_WALLPAPERS`: URLs zeigen auf den Web-Host.
- Implementierung eines resilienten Offline-Cachings:
  - Bei Online-Verbindung: Bild wird im Hintergrund geladen und im Browser-Cache / IndexedDB persistent abgelegt.
  - Bei Offline-Start: Automatische Verwendung der bereits gecachten Version oder eleganter CSS-Gradient-Fallback (kein harter Bildausfall).

### 1.3 Installer-Payload-Ausschluss
- **Datei:** [`apps/desktop/electron-builder.yml`](file:///c:/projekte/lastbrowser/apps/desktop/electron-builder.yml)
- Überprüfung der `extraResources` und Bundle-Filter, sodass keine redundanten Bilddateien im Core-Installer mitgeführt werden.

---

## Phase 2: Slim Installer (Bootstrapper) Pipeline & Web-Integration

> [!TIP]
> Der native Bootstrapper (`apps/installer-bootstrapper/`) ist bereits in modernem C++ implementiert und kompiliert auf unter 400 KB. Er benötigt lediglich den sauberen Handoff und die Web-Bereitstellung.

### 2.1 Bootstrapper-Pinning & Build-Skript
- **Dateien:** 
  - [`apps/installer-bootstrapper/bootstrapper.cpp`](file:///c:/projekte/lastbrowser/apps/installer-bootstrapper/bootstrapper.cpp)
  - [`apps/installer-bootstrapper/CMakeLists.txt`](file:///c:/projekte/lastbrowser/apps/installer-bootstrapper/CMakeLists.txt)
- Konfiguration des Release-Endpoint-URLs im Bootstrapper für die jeweils aktuelle Setup-Payload.
- Bereitstellung eines PowerShell-Build-Skripts `scripts/build-bootstrapper.ps1`, das das C++-Projekt isoliert via CMake/MSVC (`/MT`) baut und das Release-Artefakt `LastbrowserBootstrapper.exe` signierfähig bereitstellt.

### 2.2 Integration in `lastbrowser.com`
- **Datei:** [`lastbrowser.com/index.html`](file:///c:/projekte/lastbrowser/lastbrowser.com/index.html)
- Erweiterung des Download-Bereichs:
  - **Primärer Download:** „Schnell-Installer (380 KB) – Sofort starten & automatische Installation“ (`LastbrowserBootstrapper.exe`).
  - **Alternativer Download:** „Vollständiges Offline-Setup (~150 MB)“ für Air-Gapped / Offline-Umgebungen.

---

## Phase 3: Umfassendes UI- & Empty-State-Polishing

> [!IMPORTANT]
> Hier werden die vom Nutzer bemängelten kahlen Stellen behoben: leere Seiten, Typografie, Gittereffekte und die Tab-Karten in der Sidebar.

### 3.1 Startseite: Leere Zustände mit visueller Führung (`NativeBrowserStartPage.tsx`)
- **Bookmarks (Lesezeichen):**
  - Statt des nüchternen Textes `Keine Lesezeichen`:
  - Ansprechende Illustration mit dezentem, schwebendem `Star`-Icon, Titel *„Noch keine Lesezeichen gespeichert“* und kurzem Tipp: *„Klicke auf den Stern in der Omnibox (Ctrl+D), um deine wichtigsten Seiten hier abzulegen.“*
- **History (Verlauf / Meistbesucht):**
  - Statt `Kein Verlauf`:
  - Dezentes `TrendingUp`/`Clock`-Symbol mit dem Hinweis: *„Deine am häufigsten besuchten Webseiten erscheinen automatisch hier, sobald du surfst.“*
- **Typografie & Listen-Lesbarkeit:**
  - Optimierung der Schriftstärken und Zeilenabstände (`font-medium`, 13px, sanfter Kontrast `#cbd5e1` statt hartem Grau).

### 3.2 Kanban-, Task- & History-Panels
- **Dateien:** 
  - [`apps/desktop/src/renderer/panels/TaskPanels.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/panels/TaskPanels.tsx)
  - [`apps/desktop/src/renderer/NativeHistory.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/NativeHistory.tsx)
  - [`apps/desktop/src/renderer/NativeDownloads.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/NativeDownloads.tsx)
- Ersetzen der simplen Textplatzhalter (`"Empty"`, `"No history yet."`) durch moderne Glassmorphism-Karten mit passenden Lucide-Icons (`KanbanSquare`, `History`, `DownloadCloud`) und Hilfstexten.

### 3.3 Semantische Farbkorrektur & Gittereffekt-Reduzierung
- **Datei:** [`apps/desktop/src/renderer/styles.css`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/styles.css)
- **Hintergrund & Kacheln:** 
  - Kacheln im Dark-Mode leicht anheben auf `rgba(255, 255, 255, 0.05)` mit weichem `backdrop-filter: blur(16px)`.
  - Harte `1px solid rgba(255, 255, 255, 0.12)` Umrandungen durch weichere Gradient-Borders (`rgba(255, 255, 255, 0.06)` und inneren Schatten) ersetzen, um den „Box-in-Box“-Gittereffekt zu eliminieren.
- **Sidebar Tab-Karten:**
  - Optimierung der Tab-Items (Titel-Truncation, Mute-/Audio-Indikator, Split-Button-Ergonomie) für flüssige Bedienung.

---

## Phase 4: Qualitätssicherung & Release-Pipeline

| Prüfschritt | Auszuführender Befehl | Kriterium |
| :--- | :--- | :--- |
| **Vitest Tests** | `npm test` | Alle 204+ Testsuiten grün, >1.890 Tests bestanden |
| **Store Preflight** | `npm run verify:store` | 39 PASS, 0 FAIL |
| **Shell Build** | `npm --workspace apps/desktop run build` | 0 TypeScript- und Vite-Fehler |
| **Bootstrapper Core Tests** | `ctest` in `apps/installer-bootstrapper/build` | Alle Redirect- & Hash-Validierungen PASS |
| **Größen-Vergleich** | Inspektion der resultierenden EXE-Dateien | Bootstrapper < 500 KB, Setup schlanker |

---

## Nächste Schritte zur Freigabe

1. **Freigabe des Plans** durch Bestätigung.
2. **Start mit Phase 1 & Phase 3 parallel:** Auslagerung der Wallpaper-Pfade und direktes UI-Polishing der Startseite und Empty States.
3. **Abschluss mit Phase 2:** Bereitstellung des Bootstrapper-Builds und Einbindung auf der Landing Page.

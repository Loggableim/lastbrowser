# Vision-Impaired Mode 2.0: Architektur & Spezifikation

> **Status:** Implementierte Spezifikation und Verifikationsmatrix; Laufzeit-Smokes bleiben Teil der Release-Abnahme.
> **Geltungsbereich:** `apps/desktop/src/renderer/`, `apps/desktop/src/main/`
> **Konformitätsziel:** WCAG 2.2 Level AAA (Sehbehinderung, Low-Vision, Photophobie, Nystagmus, Farbenfehlsichtigkeit)

---

## 1. Vision & Leitbild

Der bisherige Sehbehinderten-Modus beschränkte sich im Wesentlichen auf statische Farbänderungen im Einstellungsdialog. **Vision-Impaired 2.0** transformiert Lastbrowser in einen vollwertigen, hochgradig personalisierbaren Barrierefreiheits-Browser für Menschen mit starker Sehschwäche, Blendungsempfindlichkeit, eingeschränktem Sehfeld (Tunnelblick/Makuladegeneration) oder motorisch-visuellen Kopplungseinschränkungen.

### Kernprinzipien
1. **Kein Informationsverlust:** Absolutes Verbot von Textabschneidungen (`text-overflow: ellipsis`) bei aktiver Barrierefreiheit.
2. **Erweiterung statt Entkernung:** Keine radikale Reduktion funktioneller Bedienelemente, sondern proportionale Vergrößerung, markante Konturen und verbesserte Abstände.
3. **Modulare Zuschaltbarkeit:** Alle Hauptfeatures (Fonts, Zeilenabstände, Bionic Reading, Smart Invert, Lupe etc.) sind im Einstellungsmenü über dedizierte Schalter und Regler feingranular konfigurierbar.
4. **Zero-Distortion Magnification:** Zoom und Lupenfunktionen dürfen Layouts nicht zerreißen; Webview-Inhalt und Desktop-Chrome-UI skalieren getrennt.

---

## 2. Konfigurations- & State-Modell

Alle Einstellungen des Vision-Impaired-Modus werden im Zustand-Store (`usePanelStore`) und persistent in `localStorage` unter `lastbrowser.a11y.visionImpaired.v2` geführt.

### TypeScript Interface: `VisionImpairedConfig`
```typescript
// apps/desktop/src/renderer/stores/a11y-config.ts

export type HighContrastPalette = 'ambra-matte' | 'onyx-cyan' | 'ivory-navy' | 'monochrom-high';
export type LoupePosition = 'top' | 'bottom' | 'left' | 'right';
export type ColorVisionFilter = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
export type CursorSize = 'normal' | 'large' | 'huge' | 'mega'; // 24px, 36px, 48px, 64px

export interface VisionImpairedConfig {
  // --- Modus-Status ---
  enabled: boolean;                        // Hauptschalter Vision-Impaired Modus

  // --- Typografie & Leseführung (Punkte 1, 2, 3, 4, 6) ---
  fontFamily: 'system' | 'atkinson' | 'lexend' | 'opendyslexic'; // Punkt 1
  enhancedSpacing: boolean;               // Punkt 2: WCAG 1.4.12 Spacing-Multiplier
  boldWeight: boolean;                    // Punkt 3: Forciertes Halbfett/Fett (650-750)
  noEllipsisWrap: boolean;                // Punkt 4: Mehrzeiliger Umbruch statt ...
  bionicReading: boolean;                 // Punkt 6: Blickfixierung (Anfänge gefettet)

  // --- Layout & Tabs (Punkte 9, 11, 58) ---
  superSizedVerticalTabs: boolean;        // Punkt 9: Extrabreite vertikale Tab-Kacheln
  enlargedTopBar: boolean;                // Punkt 11: Größere Titelleiste mit Lupen-Icon
  minClickTargetSize: 48 | 56 | 64;       // Punkt 58: Mindestgröße Buttons/Klickziele in px

  // --- Mauszeiger & Integrierte Lupe (Mauszeiger, Punkt 26) ---
  cursorSize: CursorSize;                 // Punkt 26: 24px, 36px, 48px oder 64px
  shakeToLocate: boolean;                 // Punkt 26: Schüttel-Geste & Strg-Taste zeigt Radar
  cursorLoupeEnabled: boolean;            // Maus-Begleitlupe aktiv
  cursorLoupePosition: LoupePosition;     // Position: links, rechts, oben, unten
  cursorLoupeSize: 120 | 180 | 240;       // Durchmesser/Kantenlänge der Lupe in px
  cursorLoupeFactor: 1.5 | 2.0 | 3.0 | 4.0; // Vergrößerungsfaktor der Lupe

  // --- Split-Screen Magnifier (Punkt 18) ---
  splitScreenMagnifier: boolean;          // Punkt 18: Geteilte synchron mitscrollende Lupenansicht

  // --- Paletten & Farbmanagement (Punkte 19, 20, 21, 22, 23, 24) ---
  palette: HighContrastPalette;           // Punkt 19: Ambra-Matte, Onyx-Cyan, Ivory-Navy, Monochrom
  smartInvertWebview: boolean;            // Punkt 20: Intelligenter Webview-Smart-Invert
  antiHalation: boolean;                  // Punkt 21: Max. 85% Luminanz gegen Lichthöfe
  colorVisionFilter: ColorVisionFilter;   // Punkt 22: Protanopie/Deuteranopie/Tritanopie/Achromatopsie
  softContrastText: boolean;              // Punkt 23: Anti-Verstrahlung (#F8FAFC auf Schwarz)
  reduceMotionStrict: boolean;            // Punkt 24: Deaktivierung aller Parallax-/CSS-Animationen

  // --- Audio & Signalgebung (Punkt 36) ---
  copilotAudioChime: boolean;             // Punkt 36: Akustischer Gong bei fertiger Nova-Antwort
}
```

---

## 3. Typografie & Schriftergonomie (Features 1, 2, 3, 4, 6)

### 3.1 Lokales Font-Bundling (Feature 1)
* **Dateien:** `apps/desktop/src/renderer/assets/fonts/`
* **Fonts:**
  - `Atkinson-Hyperlegible-Regular.woff2`, `Atkinson-Hyperlegible-Bold.woff2`
  - `Lexend-SemiBold.woff2`, `Lexend-Bold.woff2`
  - `OpenDyslexic-Regular.woff2`, `OpenDyslexic-Bold.woff2` (SIL Open Font License 1.1; Lizenzdatei liegt bei den Assets)
* **CSS-Einbindung via `@font-face`:**
  ```css
  @font-face {
    font-family: 'Atkinson Hyperlegible';
    src: url('./assets/fonts/Atkinson-Hyperlegible-Regular.woff2') format('woff2');
    font-weight: 400 600;
    font-display: swap;
  }
  @font-face {
    font-family: 'Atkinson Hyperlegible';
    src: url('./assets/fonts/Atkinson-Hyperlegible-Bold.woff2') format('woff2');
    font-weight: 700 800;
    font-display: swap;
  }
  ```
* **Auswirkung:** Bei Auswahl überschreibt `body.a11y-font-atkinson` bzw. `.a11y-font-lexend` die globale Schriftart.
  OpenDyslexic ist ebenfalls lokal gebündelt und über `fontFamily: 'opendyslexic'` auswählbar.

### 3.2 WCAG 1.4.12 Enhanced Text-Spacing Multiplier (Feature 2)
Wenn `enhancedSpacing: true` aktiv ist, wendet Lastbrowser global folgende CSS-Variablen an:
```css
body[data-a11y-enhanced-spacing="true"] {
  --lb-line-height: 1.65 !important;
  --lb-letter-spacing: 0.12em !important;
  --lb-word-spacing: 0.16em !important;
}

body[data-a11y-enhanced-spacing="true"] p,
body[data-a11y-enhanced-spacing="true"] span,
body[data-a11y-enhanced-spacing="true"] button,
body[data-a11y-enhanced-spacing="true"] input,
body[data-a11y-enhanced-spacing="true"] small,
body[data-a11y-enhanced-spacing="true"] strong {
  line-height: var(--lb-line-height) !important;
  letter-spacing: var(--lb-letter-spacing) !important;
  word-spacing: var(--lb-word-spacing) !important;
}
```

### 3.3 Forcierte Halbfett-Gewichtung (Feature 3)
Um das „Ausfransen“ dünner Schriften bei Hornhauttrübungen oder Astigmatismus zu verhindern:
```css
body[data-a11y-bold-weight="true"] {
  font-weight: 650 !important;
}
body[data-a11y-bold-weight="true"] strong,
body[data-a11y-bold-weight="true"] b,
body[data-a11y-bold-weight="true"] h1,
body[data-a11y-bold-weight="true"] h2,
body[data-a11y-bold-weight="true"] h3 {
  font-weight: 850 !important;
}
```

### 3.4 No-Ellipsis-Garantie (Feature 4)
Verhindert jegliches Abschneiden von Labels, Tab-Titeln und Navigationspunkten:
```css
body[data-a11y-no-ellipsis="true"] * {
  text-overflow: clip !important;
  white-space: normal !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
```
*Layout-Anforderung:* Alle Flex- und Grid-Elemente im Shell-UI (Nav-Items, Tab-Tiles, Kacheln) müssen `min-height: auto` und `height: auto` besitzen, damit dynamisch wachsender Text Container nicht überlappt.

### 3.5 Bionic Reading Blickfixierung (Feature 6)
Ein intelligenter Text-Transformer fettet die ersten 30–50 % jedes Wortes in UI-Beschreibungen und (optional via Content-Script Injektion) im Webview:
```typescript
// apps/desktop/src/renderer/utils/bionic-reading.ts
export function toBionicHtml(text: string): string {
  return text.split(/\s+/).map((word) => {
    if (word.length <= 3) return `<b>${word}</b>`;
    const mid = Math.ceil(word.length * 0.45);
    return `<b>${word.slice(0, mid)}</b>${word.slice(mid)}`;
  }).join(' ');
}
```

---

## 4. Mauszeiger-System & Begleit-Lupe

### 4.1 Skalierbarer High-Contrast-Mauszeiger (Feature 26)
* **Custom SVG Cursors:** Eingebettet als Data-URI oder Canvas-Cursor in 4 Größen (24px, 36px, 48px, 64px).
* **Dual-Border-Design:** Kräftiger Signalkern (Amber `#FFC107` oder Cyan `#00E5FF`), umschlossen von einem 2.5px dicken tiefschwarzen Außenrand (`#000000`). Auf weißem wie auf schwarzem Hintergrund jederzeit mit >15:1 Kontrast sichtbar.
```css
body[data-cursor-size="large"] { cursor: url('./assets/cursors/cursor-amber-36.svg') 0 0, auto !important; }
body[data-cursor-size="huge"]  { cursor: url('./assets/cursors/cursor-amber-48.svg') 0 0, auto !important; }
body[data-cursor-size="mega"]  { cursor: url('./assets/cursors/cursor-amber-64.svg') 0 0, auto !important; }
```

### 4.2 Shake-to-Locate & Hotkey-Radar (Feature 26)
* **Geste:** Rasche Hin- und Herbewegung der Maus innerhalb von 300ms (Messung von $\Delta x / \Delta t$ im Window-Event-Listener) oder Betätigung der linken `Strg`-Taste.
* **Effekt:** Zentrierte radiale Animationswelle (Durchmesser bis 250px) mit hochkontrastierendem Goldring, der zum Cursor hin konvergiert, um ihn sofort ins Sichtfeld zu holen.

### 4.3 Die Maus-Begleitlupe (Maus-Hover-Lupe)
Der Nutzer kann den Mauszeiger um eine mitlaufende Lupe ergänzen:
* **Position:** Relativ zum Zeiger (`left`, `right`, `top`, `bottom`) mit 18px Offset.
* **Geometrie:** Abgerundetes Quadrat (`border-radius: 14px`) mit 3px hochkontrastivem Goldrand und dezentem Schatten.
* **Größen:** 120px (Kompakt), 180px (Standard), 240px (Groß).
* **Faktor:** 1.5×, 2×, 3× oder 4×.
* **Technische Implementierung im Renderer:**
  - Komponente: `<CursorLoupeHUD />` wird auf oberster Ebene (`z-index: 99999`) gerendert.
  - Tracking: `pointermove`-Listener aktualisiert via `transform: translate3d(x, y, 0)` die Position.
  - Bildextraktion: Die Lupe greift entweder via CSS `element()` / SVG-Canvas-Sampling auf den sichtbaren Bereich zu oder nutzt die Chromium Webview Zoom-Mirror API (`capturePage` Throttled Stream 60fps), um den Bereich pixelgenau vergrößert darzustellen.

### 4.4 Bildschirmlupen-Icon in der Titelleiste (Feature 11)
* In der oberen `ModernTitlebar` wird neben den Zen-/Split-Controls ein barrierefreies 42px-Icon (Stilisiertes Lupen-Symbol mit Kontrastrand) platziert.
* Ein Klick oder der Shortcut `Ctrl + Shift + L` schaltet die Lupe sofort ein oder aus.

---

## 5. UI-Chrome, Vertikale Tabs & Klickziele

### 5.1 Super-Sized Vertikale Tabs (Feature 9)
Horizontale Tabs schneiden bei vergrößerter Schrift Titel gnadenlos ab. Bei aktiviertem Vision-Impaired Modus steht optional ein großformatiges vertikales Tab-Panel zur Verfügung:
* **Abmessungen:** Mindestbreite 260px, Kachelhöhe mind. 56px (bei Zielgröße 64px: 68px).
* **Inhalt je Kachel:**
  1. Extragroßes Favicon (28×28px) mit 2px Kontur.
  2. Zweizeiliger Tab-Titel (14px Atkinson Bold, kein Ellipsis-Abschneiden).
  3. Domain-Pille (z. B. `[github.com]` in gedämpftem Kontrast).
  4. Audio-/Mute-Badge und Unread-Indikator.
  5. Prominenter Schließen-Button mit 48×48px Klickfläche.

### 5.2 Vergrößertes Chrome-Design ohne Entrümpelung (Feature 11)
Die Funktionen der Titelleiste und Werkzeuge werden **nicht gelöscht**, sondern im Sehbehinderten-Modus vergrößert:
* Titelleisten-Höhe: Skaliert von `42px` auf `54px` (oder `62px` bei `minClickTargetSize: 64`).
* Adressleiste: Schriftgröße mind. 16px, Domain-Highlighter hebt Hostname in Gold/Cyan hervor.
* Icon-Buttons (Zurück, Vor, Reload, Downloads, Einstellungen): Mindest-Klickfläche mindestens 48×48px.

### 5.3 Konfigurierbarer Klickziel-Regler (Feature 58)
Schieberegler im Einstellungsmenü mit drei Stufen:
* `48px`: Standard WCAG AAA Mindestzielgröße.
* `56px`: Komfort-Modus für leichte Zitterbewegungen / periphere Klicks.
* `64px`: Maximal-Modus für stark eingeschränkte Motorik und Low-Vision.
* **CSS-Token:** `--lb-min-target-size: 48px | 56px | 64px`. Alle Buttons im Browser binden `min-height: var(--lb-min-target-size)` und `min-width: var(--lb-min-target-size)` ein.

---

## 6. Split-Screen Magnifier (Feature 18)

Ein dedizierter Vergrößerungs-Modus für langes Lesen:
* **Layout:** Das Browserfenster teilt sich horizontal in zwei Bereiche:
  - **Oberes Fenster (65 % Höhe):** Die reguläre Webseite in voller Übersicht, der aktuell gelesene Absatz wird mit einem leuchtenden Rahmen hervorgehoben.
  - **Unteres Fenster (35 % Höhe):** Hochkontrastige Lupenansicht (2.5× vergrößert) des aktiven Absatzes mit automatischer Zeilenbegrenzung (max. 70 Zeichen pro Zeile) und synchronem Mitscrollen.
* **Steuerung:** `Alt + M` schaltet den Split-Screen-Magnifier ein/aus.

---

## 7. Farbpaletten, Photophobie & Webview-Smart-Invert

### 7.1 Vier dedizierte Hochkontrast-Paletten (Feature 19)
| Palette | Hintergrund | Primärtext | Akzent / Fokus | Einsatzgebiet |
| :--- | :--- | :--- | :--- | :--- |
| **Ambra-Matte** | Anthrazit `#111827` | Warmweiß `#F3F4F6` | Bernstein `#F59E0B` | Photophobie / Blendungsschutz |
| **Onyx-Cyan** | Tiefschwarz `#000000` | Reinweiß `#FFFFFF` | Neon-Cyan `#00E5FF` | Maximale Konturenschärfe |
| **Ivory-Navy** | Creme/Elfenbein `#FAF0CA` | Tiefblau `#0B132B` | Königsblau `#1D4ED8` | Klassischer Positiv-Kontrast |
| **Monochrom-High** | Pechschwarz `#000000` | Reinweiß `#FFFFFF` | Reinweiß / Reingelb | Reine Schwarz-Weiß-Führung |

### 7.2 Intelligenter Webview Smart-Invert (Feature 20)
Herkömmliche CSS-Invertierungen machen Gesichter und Fotos zu gruseligen Negativen. Der Lastbrowser Smart-Invert injiziert in den Webview:
```css
/* Injektion in Webview bei smartInvertWebview = true */
html {
  filter: invert(1) hue-rotate(180deg) !important;
  background-color: #000 !important;
}

/* Re-Invertierung von Medieninhalten zum Schutz der Originalfarben */
img,
video,
canvas,
svg:not(.icon),
[style*="background-image"] {
  filter: invert(1) hue-rotate(180deg) !important;
}
```

### 7.3 Anti-Halation & Blendungsdämpfung (Feature 21)
Begrenzt grelle Spitzenhelligkeit von Webseiten auf maximal 85 %:
```css
body[data-a11y-anti-halation="true"] webview {
  filter: brightness(0.85) contrast(1.15) !important;
}
```

### 7.4 Farbfehlsichtigkeits-Korrekturfilter (Feature 22)
Integration von SVG-Farbmatrizen im Renderer, die auf Knopfdruck aktivierbar sind:
- *Protanopie (Rotschwäche):* Verschiebt Rot-Anteile in unterscheidbare Gelb- und Blautöne.
- *Deuteranopie (Grünschwäche):* Optimiert Rot-Grün-Trennung.
- *Tritanopie (Blaublindheit):* Verstärkt Türkis- und Magentatrennung.
- *Achromatopsie:* Wandelt das UI in eine reine Graustufen-Helligkeitsmatrix um.

### 7.5 Anti-Verstrahlungs-Textkontrast (Feature 23)
Um „Bleeding“ (Überstrahlen weißer Buchstaben auf schwarzem Grund) zu verhindern, wird Text im Modus nicht in grellem `#FFFFFF`, sondern im sanften, aber kontraststarken `#F8FAFC` gerendert.

### 7.6 Strikte Bewegungsreduktion (Feature 24)
```css
body[data-a11y-reduced-motion="true"] * {
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important;
  scroll-behavior: auto !important;
}
```

---

## 8. Akustisches Feedback (Feature 36)

### Nova Copilot Audio-Chime
Wenn der KI-Assistent Nova eine komplexe Aufgabe (Web-Zusammenfassung, Formular-Hilfe, Coding-Antwort) im Hintergrund fertiggestellt hat, muss ein sehbehinderter Nutzer nicht ständig auf das Chat-Fenster starren:
* **Audio-Synthese (Offline, Web Audio API):**
```typescript
// apps/desktop/src/renderer/utils/audio-chimes.ts
export function playCopilotSuccessChime(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Audio Context nicht verfügbar
  }
}
```

---

## 9. Interaktive Seh-Testkarte in den Einstellungen (Feature 57)

In `SystemPanels.tsx` (Bereich *Darstellung* / *Barrierefreiheit*) wird eine interaktive Live-Vorschaukarte eingebunden:
* **Komponente:** `<AccessibilityTestCard />`
* **Inhalt:**
  - Drei dynamische Textblöcke (Fließtext, Überschrift, Codezeile).
  - Interaktiver Button und Eingabefeld.
  - Live-Slider für Schriftgröße (14px–28px) und Zeilenabstand (1.2×–2.0×).
  - Palette-Umschalter mit Sofort-Feedback im Vorschaubox-Bereich, bevor das globale Theme umgeschaltet wird.

---

## 10. Betroffene Dateien & Architektur-Matrix

| Datei | Zuständigkeit |
| :--- | :--- |
| [`apps/desktop/src/renderer/stores/usePanelStore.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/stores/usePanelStore.ts) | Ablage aller `VisionImpairedConfig`-Felder & Actions |
| [`apps/desktop/src/renderer/styles.css`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/styles.css) | Farbpaletten, Cursor-Styles, Text-Spacing Multiplier, No-Ellipsis |
| [`apps/desktop/src/renderer/panels/SystemPanels.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/panels/SystemPanels.tsx) | Einstellungs-UI: Checkboxen für 1, 2, 3, 4, 6, 19, 20, 21, 22, 23, 24, Slider 58, Testkarte 57 |
| [`apps/desktop/src/renderer/components/HeaderComponents.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/HeaderComponents.tsx) | Lupen-Icon in der Titelleiste (Feature 11) |
| [`apps/desktop/src/renderer/components/CursorLoupeHUD.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/CursorLoupeHUD.tsx) | Schwebende Mauszeiger-Begleitlupe (Mauszeiger) & Shake-to-Locate Radar |
| [`apps/desktop/src/renderer/components/SplitScreenMagnifier.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/SplitScreenMagnifier.tsx) | Synchron mitscrollender Split-Screen Magnifier (Feature 18) |
| [`apps/desktop/src/renderer/components/SuperSizedTabStrip.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/components/SuperSizedTabStrip.tsx) | Extrabreite vertikale Tabs (Feature 9) |
| [`apps/desktop/src/renderer/utils/audio-chimes.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/utils/audio-chimes.ts) | Web-Audio-Chimes für Nova Copilot (Feature 36) |
| [`apps/desktop/tests/vision-impaired.test.ts`](file:///c:/projekte/lastbrowser/apps/desktop/tests/vision-impaired.test.ts) | Vitest-Testsuite zur Verifikation aller Klassen, Tokens und Berechnungen |

---

## 11. Phasenweiser Umsetzungsplan

### Phase 1: Datenmodell, Einstellungen & Typografie-Engine (Features 1, 2, 3, 4, 6, 57, 58)
1. **Store erweitern:** `usePanelStore.ts` um `VisionImpairedConfig` und State-Persistenz erweitern.
2. **Settings-Panel bauen:**
   - Checkboxen für Features 1, 2, 3, 4, 6, 20, 21, 23, 24 hinzufügen.
   - Schieberegler für Mindest-Klickzielgröße (48px, 56px, 64px, Feature 58).
   - Paletten-Auswahl (Ambra-Matte, Onyx-Cyan, Ivory-Navy, Monochrom-High, Feature 19).
   - Farbsehschwächen-Filter Dropdown (Feature 22).
   - Interaktive Seh-Testkarte (`<AccessibilityTestCard />`, Feature 57) implementieren.
3. **CSS-Engine ausbauen:**
   - Bundling von Atkinson Hyperlegible & Lexend Fonts.
   - CSS-Regeln für `data-a11y-enhanced-spacing`, `data-a11y-bold-weight`, `data-a11y-no-ellipsis`.

### Phase 2: Mauszeiger, Shake-to-Locate & Begleit-Lupe (Mauszeiger, Features 11, 26)
1. **Mega-Cursor SVGs:** Bereitstellen der 4 Cursor-Größen mit kontrastreichem Dual-Border.
2. **Shake-to-Locate & Radar:** Event-Listener für Maus-Schütteln und `Ctrl`-Tap zur Einblendung der Lokalisierungswelle.
3. **Maus-Begleitlupe:** Bau der `<CursorLoupeHUD />`-Komponente mit wählbarer Position (oben/unten/links/rechts), Durchmesser (120/180/240px) und Vergrößerungsfaktor (1.5× bis 4.0×).
4. **Titelleisten-Lupenbutton:** Ergänzen des Lupen-Icons in `ModernTitlebar` mit Shortcut `Ctrl+Shift+L`.

### Phase 3: Großformat-Chrome, Vertikale Tabs & Split-Screen Magnifier (Features 9, 11, 18)
1. **Super-Sized Vertikale Tabs:** Umschaltbare Kachelansicht für Tabs mit vollständigen Titeln, Favicons und großen Touch-Zielen.
2. **Vergrößertes Minimal-Chrome:** Sicherstellen, dass Titelleiste, Adressleiste und Sidebar bei aktiviertem Modus auf mindestens 54px Höhe skalieren.
3. **Split-Screen Magnifier:** Synchron mitscrollende Split-Pane am unteren Fensterrand.

### Phase 4: Farb-Invertierung, Photophobie & Audio-Feedback (Features 20, 21, 22, 36)
1. **Smart Invert Injektion:** Webview-Preload-Injektion für inhaltsbasierte Invertierung unter Schutz von Mediendaten (`img`, `video`, `canvas`).
2. **Anti-Halation & Farbkorrektur:** Helligkeitsdeckel (85%) und SVG-Farbmatrizen für Rot-Grün- und Blaublindheit.
3. **Copilot Audio Chime:** Einbindung der Web Audio API in `NativeChatMain.tsx`, sodass bei Fertigstellung einer Copilot-Antwort der diskrete Zweiklang ertönt.
4. **Testabdeckung & Regression:** Erweiterung der `tests/vision-impaired.test.ts` auf 100% grüne Tests und Verifikation mit `npm run verify:store`.

---

## 12. Multi-Agent Koordination & Regeln

* **Stream A (Desktop UI & Renderer):** Dieser Plan berührt primär `apps/desktop/src/renderer/`.
* **Keine Kollisionen:** Wenn parallel ein anderer Agent im Backend (`services/sidekick/`) oder in anderen Frontend-Panels arbeitet, beschränkt sich dieser Scope exakt auf Barrierefreiheits-Komponenten und Einstellungsdialoge.
* **Testing-Gebot:** Jede Änderung muss `npm test` und `npm run verify:store` ohne Regressionen bestehen.

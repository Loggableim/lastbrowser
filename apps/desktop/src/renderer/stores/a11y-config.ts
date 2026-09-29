// Vision-Impaired Mode 2.0 — configuration model (docs/visionimpaired.md §2).
// Types + defaults + localStorage persistence. Wired into usePanelStore so
// every renderer surface (settings panel, titlebar, HUDs) shares one source
// of truth and the DOM stays in sync via data-* attributes.

export type HighContrastPalette = 'ambra-matte' | 'onyx-cyan' | 'ivory-navy' | 'monochrom-high';
export type LoupePosition = 'top' | 'bottom' | 'left' | 'right';
export type ColorVisionFilter = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
export type CursorSize = 'normal' | 'large' | 'huge' | 'mega'; // 24px, 36px, 48px, 64px
export type A11yFontFamily = 'system' | 'atkinson' | 'lexend' | 'opendyslexic';
export type MinClickTargetSize = 48 | 56 | 64;
export type CursorLoupeSize = 120 | 180 | 240;
export type CursorLoupeFactor = 1.5 | 2.0 | 3.0 | 4.0;

export interface VisionImpairedConfig {
  // --- Modus-Status ---
  enabled: boolean;

  // --- Typografie & Leseführung (Features 1, 2, 3, 4, 6) ---
  fontFamily: A11yFontFamily;
  enhancedSpacing: boolean;
  boldWeight: boolean;
  noEllipsisWrap: boolean;
  bionicReading: boolean;

  // --- Layout & Tabs (Features 9, 11, 58) ---
  superSizedVerticalTabs: boolean;
  enlargedTopBar: boolean;
  minClickTargetSize: MinClickTargetSize;

  // --- Mauszeiger & Integrierte Lupe (Feature 26) ---
  cursorSize: CursorSize;
  shakeToLocate: boolean;
  cursorLoupeEnabled: boolean;
  cursorLoupePosition: LoupePosition;
  cursorLoupeSize: CursorLoupeSize;
  cursorLoupeFactor: CursorLoupeFactor;

  // --- Split-Screen Magnifier (Feature 18) ---
  splitScreenMagnifier: boolean;

  // --- Paletten & Farbmanagement (Features 19-24) ---
  palette: HighContrastPalette;
  smartInvertWebview: boolean;
  antiHalation: boolean;
  colorVisionFilter: ColorVisionFilter;
  softContrastText: boolean;
  reduceMotionStrict: boolean;

  // --- Audio & Signalgebung (Feature 36) ---
  copilotAudioChime: boolean;
}

export const visionImpairedStorageKey = 'lastbrowser.a11y.visionImpaired.v2';

export const DEFAULT_VISION_IMPAIRED_CONFIG: VisionImpairedConfig = {
  enabled: false,
  fontFamily: 'system',
  enhancedSpacing: false,
  boldWeight: false,
  noEllipsisWrap: false,
  bionicReading: false,
  superSizedVerticalTabs: false,
  enlargedTopBar: false,
  minClickTargetSize: 48,
  cursorSize: 'normal',
  shakeToLocate: false,
  cursorLoupeEnabled: false,
  cursorLoupePosition: 'right',
  cursorLoupeSize: 180,
  cursorLoupeFactor: 2.0,
  splitScreenMagnifier: false,
  palette: 'ambra-matte',
  smartInvertWebview: false,
  antiHalation: false,
  colorVisionFilter: 'none',
  softContrastText: false,
  reduceMotionStrict: false,
  copilotAudioChime: false
};

export type ToggleableVisionFeature = 'cursorLoupeEnabled' | 'splitScreenMagnifier';

/** Shortcut/titlebar activation must also enable the master mode that renders the feature. */
export function toggleVisionImpairedFeature(
  config: VisionImpairedConfig,
  feature: ToggleableVisionFeature
): Partial<Pick<VisionImpairedConfig, 'enabled' | ToggleableVisionFeature>> {
  const isActive = config.enabled && config[feature];
  return isActive
    ? { enabled: config.enabled, [feature]: false }
    : { enabled: true, [feature]: true };
}

const FONT_FAMILIES: readonly A11yFontFamily[] = ['system', 'atkinson', 'lexend', 'opendyslexic'];
const PALETTES: readonly HighContrastPalette[] = ['ambra-matte', 'onyx-cyan', 'ivory-navy', 'monochrom-high'];
const LOUPE_POSITIONS: readonly LoupePosition[] = ['top', 'bottom', 'left', 'right'];
const CVD_FILTERS: readonly ColorVisionFilter[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
const CURSOR_SIZES: readonly CursorSize[] = ['normal', 'large', 'huge', 'mega'];
const MIN_TARGET_SIZES: readonly MinClickTargetSize[] = [48, 56, 64];
const LOUPE_SIZES: readonly CursorLoupeSize[] = [120, 180, 240];
const LOUPE_FACTORS: readonly CursorLoupeFactor[] = [1.5, 2.0, 3.0, 4.0];

function pickEnum<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Parses an unknown persisted object into a fully validated config. */
export function normalizeVisionImpairedConfig(raw: unknown): VisionImpairedConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VISION_IMPAIRED_CONFIG };
  const record = raw as Record<string, unknown>;
  return {
    enabled: pickBoolean(record.enabled, DEFAULT_VISION_IMPAIRED_CONFIG.enabled),
    fontFamily: pickEnum(record.fontFamily, FONT_FAMILIES, DEFAULT_VISION_IMPAIRED_CONFIG.fontFamily),
    enhancedSpacing: pickBoolean(record.enhancedSpacing, DEFAULT_VISION_IMPAIRED_CONFIG.enhancedSpacing),
    boldWeight: pickBoolean(record.boldWeight, DEFAULT_VISION_IMPAIRED_CONFIG.boldWeight),
    noEllipsisWrap: pickBoolean(record.noEllipsisWrap, DEFAULT_VISION_IMPAIRED_CONFIG.noEllipsisWrap),
    bionicReading: pickBoolean(record.bionicReading, DEFAULT_VISION_IMPAIRED_CONFIG.bionicReading),
    superSizedVerticalTabs: pickBoolean(record.superSizedVerticalTabs, DEFAULT_VISION_IMPAIRED_CONFIG.superSizedVerticalTabs),
    enlargedTopBar: pickBoolean(record.enlargedTopBar, DEFAULT_VISION_IMPAIRED_CONFIG.enlargedTopBar),
    minClickTargetSize: pickEnum(record.minClickTargetSize, MIN_TARGET_SIZES, DEFAULT_VISION_IMPAIRED_CONFIG.minClickTargetSize),
    cursorSize: pickEnum(record.cursorSize, CURSOR_SIZES, DEFAULT_VISION_IMPAIRED_CONFIG.cursorSize),
    shakeToLocate: pickBoolean(record.shakeToLocate, DEFAULT_VISION_IMPAIRED_CONFIG.shakeToLocate),
    cursorLoupeEnabled: pickBoolean(record.cursorLoupeEnabled, DEFAULT_VISION_IMPAIRED_CONFIG.cursorLoupeEnabled),
    cursorLoupePosition: pickEnum(record.cursorLoupePosition, LOUPE_POSITIONS, DEFAULT_VISION_IMPAIRED_CONFIG.cursorLoupePosition),
    cursorLoupeSize: pickEnum(record.cursorLoupeSize, LOUPE_SIZES, DEFAULT_VISION_IMPAIRED_CONFIG.cursorLoupeSize),
    cursorLoupeFactor: pickEnum(record.cursorLoupeFactor, LOUPE_FACTORS, DEFAULT_VISION_IMPAIRED_CONFIG.cursorLoupeFactor),
    splitScreenMagnifier: pickBoolean(record.splitScreenMagnifier, DEFAULT_VISION_IMPAIRED_CONFIG.splitScreenMagnifier),
    palette: pickEnum(record.palette, PALETTES, DEFAULT_VISION_IMPAIRED_CONFIG.palette),
    smartInvertWebview: pickBoolean(record.smartInvertWebview, DEFAULT_VISION_IMPAIRED_CONFIG.smartInvertWebview),
    antiHalation: pickBoolean(record.antiHalation, DEFAULT_VISION_IMPAIRED_CONFIG.antiHalation),
    colorVisionFilter: pickEnum(record.colorVisionFilter, CVD_FILTERS, DEFAULT_VISION_IMPAIRED_CONFIG.colorVisionFilter),
    softContrastText: pickBoolean(record.softContrastText, DEFAULT_VISION_IMPAIRED_CONFIG.softContrastText),
    reduceMotionStrict: pickBoolean(record.reduceMotionStrict, DEFAULT_VISION_IMPAIRED_CONFIG.reduceMotionStrict),
    copilotAudioChime: pickBoolean(record.copilotAudioChime, DEFAULT_VISION_IMPAIRED_CONFIG.copilotAudioChime)
  };
}

export function loadVisionImpairedConfig(): VisionImpairedConfig {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(visionImpairedStorageKey);
      if (raw !== null) return normalizeVisionImpairedConfig(JSON.parse(raw));
    }
  } catch {
    // Corrupt JSON or unavailable localStorage — fall back to defaults.
  }
  return { ...DEFAULT_VISION_IMPAIRED_CONFIG };
}

export function saveVisionImpairedConfig(config: VisionImpairedConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(visionImpairedStorageKey, JSON.stringify(config));
    }
  } catch {
    // Storage unavailable (e.g. quota) — settings stay session-only.
  }
}

/**
 * Mirrors the config onto <html> as data-* attributes + CSS custom
 * properties so styles.css can react without any class juggling in React.
 */
export function applyVisionImpairedToDom(config: VisionImpairedConfig): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  const enabled = config.enabled;
  root.dataset.a11yViEnabled = String(config.enabled);
  root.dataset.a11yFont = enabled ? config.fontFamily : 'system';
  root.dataset.a11yEnhancedSpacing = String(enabled && config.enhancedSpacing);
  root.dataset.a11yBoldWeight = String(enabled && config.boldWeight);
  root.dataset.a11yNoEllipsis = String(enabled && config.noEllipsisWrap);
  root.dataset.a11yBionicReading = String(enabled && config.bionicReading);
  root.dataset.a11ySuperTabs = String(enabled && config.superSizedVerticalTabs);
  root.dataset.a11yEnlargedTopbar = String(enabled && config.enlargedTopBar);
  root.dataset.a11yMinTarget = String(enabled ? config.minClickTargetSize : 48);
  root.dataset.a11yPalette = enabled ? config.palette : 'ambra-matte';
  root.dataset.a11ySmartInvert = String(enabled && config.smartInvertWebview);
  root.dataset.a11yAntiHalation = String(enabled && config.antiHalation);
  root.dataset.a11yCvdFilter = enabled ? config.colorVisionFilter : 'none';
  root.dataset.a11ySoftContrast = String(enabled && config.softContrastText);
  root.dataset.a11yReducedMotion = String(enabled && config.reduceMotionStrict);
  root.dataset.a11yCopilotChime = String(enabled && config.copilotAudioChime);
  root.dataset.a11ySplitMagnifier = String(enabled && config.splitScreenMagnifier);
  root.dataset.cursorSize = enabled ? config.cursorSize : 'normal';
  root.dataset.a11yShakeLocate = String(enabled && config.shakeToLocate);
  root.dataset.a11yLoupeEnabled = String(enabled && config.cursorLoupeEnabled);
  root.dataset.a11yLoupePosition = config.cursorLoupePosition;
  root.style.setProperty('--lb-min-target-size', `${enabled ? config.minClickTargetSize : 48}px`);
  root.style.setProperty('--lb-loupe-size', `${config.cursorLoupeSize}px`);
  root.style.setProperty('--lb-loupe-factor', String(config.cursorLoupeFactor));
}

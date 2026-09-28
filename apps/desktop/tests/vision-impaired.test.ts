import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesPath = resolve(__dirname, '../src/renderer/styles.css');
// Normalize CRLF so line-ending churn in the working tree cannot break
// multi-line selector assertions.
const css = readFileSync(stylesPath, 'utf8').replace(/\r\n/g, '\n');

/** Extract a CSS rule block by selector prefix (first match). */
function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return '';
  const braceStart = css.indexOf('{', start);
  const braceEnd = css.indexOf('}', braceStart);
  return braceStart === -1 || braceEnd === -1 ? '' : css.slice(braceStart + 1, braceEnd);
}

describe('vision-impaired theme (goal.md Paket 4)', () => {
  it('defines the theme with pure maximal contrast colors', () => {
    expect(css).toContain('.theme-vision-impaired {');
    expect(block('.theme-vision-impaired {')).toContain('background: #000000');
    expect(block('.theme-vision-impaired {')).toContain('color: #FFFFFF');
  });

  it('uses yellow #FFD700 as primary accent and cyan #00FFFF for links', () => {
    const themeRegion = css.slice(css.indexOf('.theme-vision-impaired'), css.indexOf('.theme-vision-impaired') + 6000);
    expect(themeRegion).toContain('#FFD700');
    expect(block('.theme-vision-impaired a,')).toContain('color: #00FFFF');
  });

  it('enforces a 16px sans-serif base font', () => {
    const rootBlock = block('.theme-vision-impaired {');
    expect(rootBlock).toContain('font-size: 16px');
    expect(rootBlock).toContain('font-family: Arial, Helvetica, sans-serif');
  });

  it('draws 2px element borders on interactive controls', () => {
    const inputBlock = block('.theme-vision-impaired input,');
    expect(inputBlock).toContain('border: 2px solid #FFFFFF');
  });

  it('draws 3px focus outlines in accent yellow', () => {
    const focusBlock = block('.theme-vision-impaired input:focus-visible,');
    expect(focusBlock).toContain('outline: 3px solid #FFD700');
  });

  it('disables glassmorphism for readability', () => {
    const glassBlock = block('.theme-vision-impaired,');
    expect(glassBlock).toContain('--glass-blur: 0px');
    expect(glassBlock).toContain('backdrop-filter: none');
  });
});

describe('glassmorphism levels (goal.md Paket 4)', () => {
  it('defines --glass-bg and --glass-border for every level', () => {
    for (const level of ['solid', 'subtle', 'modern', 'deep']) {
      const levelBlock = block(`[data-glass-level="${level}"] {`);
      expect(levelBlock, `missing [data-glass-level="${level}"] block`).not.toBe('');
      expect(levelBlock).toContain('--glass-bg:');
      expect(levelBlock).toContain('--glass-border:');
    }
  });

  it('keeps solid fully opaque and deep at 36px blur per spec', () => {
    expect(block('[data-glass-level="solid"] {')).toContain('--glass-blur: 0px');
    expect(block('[data-glass-level="deep"] {')).toContain('--glass-blur: 36px');
  });
});

describe('chat layout overflow guards (goal.md Paket 4)', () => {
  it('protects pre/code blocks from horizontal clipping in all 3 modes', () => {
    for (const mode of ['bubbles', 'compact', 'expanded']) {
      expect(css).toContain(`[data-message-layout="${mode}"] pre`);
    }
    expect(block('[data-message-layout="bubbles"] pre,')).toContain('overflow-x: auto');
  });

  it('protects grounding citations and process cards', () => {
    const guardSelector = '.grounding-citation,\n.grounding-citations,\n.teamwork-process-card,\n.smart-track-process-card {';
    expect(css).toContain(guardSelector);
    expect(block(guardSelector)).toContain('max-width: 100%');
    expect(block(guardSelector)).toContain('overflow-x: auto');
    expect(block(guardSelector)).toContain('min-width: 0');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   VISION-IMPAIRED MODE 2.0 (docs/visionimpaired.md)
   ═══════════════════════════════════════════════════════════════════════════ */

describe('Vision-Impaired 2.0 §2: config model & persistence', () => {
  // Lazy import: the store module touches window/document at load time.
  vi.mock('../src/renderer/shell-state.js', () => ({
    lastbrowserPanels: [{ id: 'browser', label: 'Browser' }],
    loadInitialPanel: () => 'browser',
    saveActivePanel: () => undefined,
    loadBooleanPreference: (_key: unknown, storageKey: string, fallback: boolean) => fallback,
    saveBooleanPreference: () => undefined,
    loadNumericPreference: (_key: unknown, storageKey: string, fallback: number) => fallback,
    saveNumericPreference: () => undefined,
    loadInstalledSidebarApps: () => [],
    saveInstalledSidebarApps: () => undefined,
    leftSidebarCollapsedStorageKey: 'test',
    contextSidebarWidthStorageKey: 'test',
    workspacePanelWidthStorageKey: 'test',
    workspacePanelCollapsedStorageKey: 'test'
  }));

  it('exposes the full VisionImpairedConfig interface with spec defaults', async () => {
    const mod = await import('../src/renderer/stores/a11y-config.js');
    expect(mod.DEFAULT_VISION_IMPAIRED_CONFIG).toEqual({
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
    });
  });

  it('normalizes corrupt persisted values back to safe defaults', async () => {
    const mod = await import('../src/renderer/stores/a11y-config.js');
    const normalized = mod.normalizeVisionImpairedConfig({
      enabled: 'yes-please',
      fontFamily: 'comic-sans',
      minClickTargetSize: 999,
      cursorLoupeFactor: 10,
      palette: 'rainbow',
      colorVisionFilter: 'nope'
    });
    expect(normalized.enabled).toBe(false);
    expect(normalized.fontFamily).toBe('system');
    expect(normalized.minClickTargetSize).toBe(48);
    expect(normalized.cursorLoupeFactor).toBe(2.0);
    expect(normalized.palette).toBe('ambra-matte');
    expect(normalized.colorVisionFilter).toBe('none');
  });

  it('keeps valid persisted values untouched', async () => {
    const mod = await import('../src/renderer/stores/a11y-config.js');
    const normalized = mod.normalizeVisionImpairedConfig({
      enabled: true,
      fontFamily: 'atkinson',
      minClickTargetSize: 64,
      cursorLoupeFactor: 4.0,
      palette: 'onyx-cyan',
      colorVisionFilter: 'deuteranopia'
    });
    expect(normalized.enabled).toBe(true);
    expect(normalized.fontFamily).toBe('atkinson');
    expect(normalized.minClickTargetSize).toBe(64);
    expect(normalized.cursorLoupeFactor).toBe(4.0);
    expect(normalized.palette).toBe('onyx-cyan');
    expect(normalized.colorVisionFilter).toBe('deuteranopia');
  });

  it('persists under the spec storage key lastbrowser.a11y.visionImpaired.v2', async () => {
    const mod = await import('../src/renderer/stores/a11y-config.js');
    expect(mod.visionImpairedStorageKey).toBe('lastbrowser.a11y.visionImpaired.v2');
  });
});

describe('Vision-Impaired 2.0 §3: typography engine (CSS)', () => {
  it('bundles Atkinson Hyperlegible and Lexend as @font-face', () => {
    expect(css).toContain("font-family: 'Atkinson Hyperlegible'");
    expect(css).toContain("font-family: 'Lexend'");
    expect(css).toContain('Atkinson-Hyperlegible-Regular.woff2');
    expect(css).toContain('Atkinson-Hyperlegible-Bold.woff2');
    expect(css).toContain('Lexend-SemiBold.woff2');
    expect(css).toContain('Lexend-Bold.woff2');
  });

  it('ships the woff2 font files on disk', () => {
    for (const font of [
      'Atkinson-Hyperlegible-Regular.woff2',
      'Atkinson-Hyperlegible-Bold.woff2',
      'Lexend-SemiBold.woff2',
      'Lexend-Bold.woff2'
    ]) {
      expect(existsSync(resolve(__dirname, '../src/renderer/assets/fonts', font)), font).toBe(true);
    }
  });

  it('applies WCAG 1.4.12 enhanced spacing multipliers (1.65 / 0.12em / 0.16em)', () => {
    const spacingBlock = block("html[data-a11y-enhanced-spacing='true'] {");
    expect(spacingBlock).toContain('--lb-line-height: 1.65');
    expect(spacingBlock).toContain('--lb-letter-spacing: 0.12em');
    expect(spacingBlock).toContain('--lb-word-spacing: 0.16em');
  });

  it('forces semi-bold weight 650 with 850 for headings (Feature 3)', () => {
    expect(block("html[data-a11y-bold-weight='true'] body {")).toContain('font-weight: 650');
    expect(block("html[data-a11y-bold-weight='true'] body strong,")).toContain('font-weight: 850');
  });

  it('guarantees no-ellipsis: clip, wrap, break-word (Feature 4)', () => {
    const noEllipsisBlock = block("html[data-a11y-no-ellipsis='true'] body *:not(webview):not(webview *) {");
    expect(noEllipsisBlock).toContain('text-overflow: clip');
    expect(noEllipsisBlock).toContain('white-space: normal');
    expect(noEllipsisBlock).toContain('overflow-wrap: break-word');
    expect(noEllipsisBlock).toContain('word-break: break-word');
  });
});

describe('Vision-Impaired 2.0 §3.5: bionic reading transformer', () => {
  it('bolds the first ~45% of every word', async () => {
    const { toBionicHtml } = await import('../src/renderer/utils/bionic-reading.js');
    // ceil(len * 0.45): 'Lesen'(5) → 3 chars, 'Brille'(6) → 3 chars.
    expect(toBionicHtml('Lesen')).toBe('<b>Les</b>en');
    expect(toBionicHtml('Brille')).toBe('<b>Bri</b>lle');
  });

  it('fully bolds words with ≤3 characters', async () => {
    const { toBionicHtml } = await import('../src/renderer/utils/bionic-reading.js');
    expect(toBionicHtml('der')).toBe('<b>der</b>');
    expect(toBionicHtml('a')).toBe('<b>a</b>');
  });

  it('preserves whitespace between words exactly', async () => {
    const { toBionicHtml } = await import('../src/renderer/utils/bionic-reading.js');
    expect(toBionicHtml('Der schnelle Blick')).toBe('<b>Der</b> <b>schn</b>elle <b>Bli</b>ck');
  });

  it('toBionicSegments splits without HTML injection', async () => {
    const { toBionicSegments } = await import('../src/renderer/utils/bionic-reading.js');
    const segments = toBionicSegments('Guter Text');
    // Whitespace merges into the previous non-bold segment — compare trimmed.
    expect(segments.some((s) => s.bold && s.text === 'Gut')).toBe(true);
    expect(segments.some((s) => !s.bold && s.text.trim() === 'er')).toBe(true);
  });

});

describe('Vision-Impaired 2.0 §4: cursor, loupe & radar (CSS)', () => {
  it('provides high-contrast cursors in 36/48/64px with amber core + black border', () => {
    for (const size of ['large', 'huge', 'mega']) {
      const cursorBlock = block(`html[data-cursor-size='${size}'] body {`);
      expect(cursorBlock, `missing cursor rule for ${size}`).not.toBe('');
      expect(cursorBlock).toContain('cursor: url("data:image/svg+xml');
      expect(cursorBlock).toContain('%23FFC107');
      expect(cursorBlock).toContain("stroke='%23000000'");
      expect(cursorBlock).toContain('stroke-width=\'2.5\'');
    }
  });

  it('ships the cursor SVG assets on disk', () => {
    for (const size of [24, 36, 48, 64]) {
      expect(
        existsSync(resolve(__dirname, '../src/renderer/assets/cursors', `cursor-amber-${size}.svg`)),
        `cursor-amber-${size}.svg`
      ).toBe(true);
    }
  });

  it('renders the shake-to-locate radar as a converging gold wave', () => {
    expect(block('.lb-locate-radar {')).toContain('width: 250px');
    expect(block('.lb-locate-radar {')).toContain('border: 4px solid #FFD700');
    expect(css).toContain('@keyframes lb-locate-converge');
  });

  it('styles the cursor loupe with 14px radius and 3px gold border', () => {
    const loupeBlock = block('.lb-cursor-loupe {');
    expect(loupeBlock).toContain('border-radius: 14px');
    expect(loupeBlock).toContain('border: 3px solid #FFD700');
    expect(loupeBlock).toContain('z-index: 99999');
  });
});

describe('Vision-Impaired 2.0 §5: super tabs, chrome & click targets (CSS)', () => {
  it('sizes super tabs at ≥260px width and ≥56px tile height', () => {
    const stripBlock = block("html[data-a11y-super-tabs='true'] .lb-supertabs {");
    expect(stripBlock).toContain('min-width: 260px');
    expect(block('.lb-supertab-tile {')).toContain('min-height: 56px');
  });

  it('grows super tab tiles to 68px for the 64px target size', () => {
    expect(block("html[data-a11y-min-target='64'] .lb-supertab-tile {")).toContain('min-height: 68px');
  });

  it('keeps super tab titles two-line without ellipsis', () => {
    const titleBlock = block('.lb-supertab-title {');
    expect(titleBlock).toContain('-webkit-line-clamp: 2');
    expect(titleBlock).toContain('white-space: normal');
  });

  it('draws 48×48px close buttons on super tabs', () => {
    const closeBlock = block('.lb-supertab-close {');
    expect(closeBlock).toContain('min-width: 48px');
    expect(closeBlock).toContain('min-height: 48px');
  });

  it('enlarges the titlebar to 54px (62px for 64px targets) without de-cluttering', () => {
    expect(block("html[data-a11y-enlarged-topbar='true'] .modern-titlebar {")).toContain('min-height: 54px');
    expect(
      block("html[data-a11y-enlarged-topbar='true'][data-a11y-min-target='64'] .modern-titlebar {")
    ).toContain('min-height: 62px');
  });

  it('binds all buttons to the --lb-min-target-size token (Feature 58)', () => {
    const targetBlock = block("html[data-a11y-vi-enabled='true'] body button,");
    expect(targetBlock).toContain('min-height: var(--lb-min-target-size, 48px)');
    expect(targetBlock).toContain('min-width: var(--lb-min-target-size, 48px)');
  });
});

describe('Vision-Impaired 2.0 §6: split-screen magnifier (CSS)', () => {
  it('renders the magnifier as a bottom 35% pane with gold top border', () => {
    const splitBlock = block('.lb-split-magnifier {');
    expect(splitBlock).toContain('height: 35%');
    expect(splitBlock).toContain('border-top: 3px solid #FFD700');
  });

  it('magnifies body text 2.5× with a 70-character line limit', () => {
    const bodyBlock = block('.lb-split-magnifier-body {');
    expect(bodyBlock).toContain('font-size: calc(1em * 2.5)');
    expect(bodyBlock).toContain('max-width: 70ch');
  });
});

describe('Vision-Impaired 2.0 §7: palettes, photophobia & filters (CSS)', () => {
  it('defines all 4 spec palettes with exact colors', () => {
    expect(block("html[data-a11y-palette='ambra-matte'] body {")).toContain('--lb-vi-bg: #111827');
    expect(block("html[data-a11y-palette='ambra-matte'] body {")).toContain('--lb-vi-accent: #F59E0B');
    expect(block("html[data-a11y-palette='onyx-cyan'] body {")).toContain('--lb-vi-bg: #000000');
    expect(block("html[data-a11y-palette='onyx-cyan'] body {")).toContain('--lb-vi-accent: #00E5FF');
    expect(block("html[data-a11y-palette='ivory-navy'] body {")).toContain('--lb-vi-bg: #FAF0CA');
    expect(block("html[data-a11y-palette='ivory-navy'] body {")).toContain('--lb-vi-text: #0B132B');
    expect(block("html[data-a11y-palette='monochrom-high'] body {")).toContain('--lb-vi-accent: #FFD700');
  });

  it('caps webview luminance at 85% for anti-halation (Feature 21)', () => {
    expect(block("html[data-a11y-anti-halation='true'] webview.browser-view {")).toContain(
      'filter: brightness(0.85) contrast(1.15)'
    );
  });

  it('wires all 4 color-vision filters to SVG matrix targets (Feature 22)', () => {
    for (const filter of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia']) {
      expect(css).toContain(`html[data-a11y-cvd-filter='${filter}'] body {`);
      expect(css).toContain(`filter: url('#lb-cvd-${filter}')`);
    }
  });

  it('uses soft #F8FAFC instead of glaring white for anti-bloom (Feature 23)', () => {
    expect(block("html[data-a11y-soft-contrast='true'] body {")).toContain('color: #F8FAFC');
  });

  it('reduces all motion to 0.001ms when strict mode is on (Feature 24)', () => {
    const motionBlock = block("html[data-a11y-reduced-motion='true'] body *:not(webview):not(webview *) {");
    expect(motionBlock).toContain('animation-duration: 0.001ms');
    expect(motionBlock).toContain('transition-duration: 0.001ms');
    expect(motionBlock).toContain('scroll-behavior: auto');
  });
});

describe('Vision-Impaired 2.0 §7.4: CVD correction matrices', () => {
  it('defines correction matrices for all 4 color-vision deficiencies', async () => {
    const { CVD_FILTER_MATRIXES } = await import('../src/renderer/utils/cvd-filters.js');
    expect(Object.keys(CVD_FILTER_MATRIXES)).toEqual([
      'lb-cvd-protanopia',
      'lb-cvd-deuteranopia',
      'lb-cvd-tritanopia',
      'lb-cvd-achromatopsia'
    ]);
    // Each matrix has 20 values (5×4 feColorMatrix rows).
    for (const matrix of Object.values(CVD_FILTER_MATRIXES)) {
      expect(matrix.trim().split(/\s+/)).toHaveLength(20);
    }
  });
});

describe('Vision-Impaired 2.0 §7.2: smart webview invert', () => {
  it('inverts the page but re-inverts media to protect original colors', async () => {
    const { smartInvertWebviewCss } = await import('../src/renderer/utils/smart-invert.js');
    expect(smartInvertWebviewCss).toContain('filter: invert(1) hue-rotate(180deg)');
    expect(smartInvertWebviewCss).toContain('img,');
    expect(smartInvertWebviewCss).toContain('video,');
    expect(smartInvertWebviewCss).toContain('canvas,');
    expect(smartInvertWebviewCss).toContain('svg:not(.icon),');
    expect(smartInvertWebviewCss).toContain('[style*="background-image"]');
  });

  it('injects via the webview insertCSS API', async () => {
    const { applySmartInvertToWebview } = await import('../src/renderer/utils/smart-invert.js');
    const insertCSS = vi.fn().mockResolvedValue('key');
    await applySmartInvertToWebview({ insertCSS } as unknown as Electron.WebviewTag);
    expect(insertCSS).toHaveBeenCalledTimes(1);
  });

  it('tolerates guests without insertCSS (no crash)', async () => {
    const { applySmartInvertToWebview } = await import('../src/renderer/utils/smart-invert.js');
    await expect(applySmartInvertToWebview(null)).resolves.toBeUndefined();
  });
});

describe('Vision-Impaired 2.0 §8: copilot audio chime', () => {
  it('synthesizes the D5→A5 sine gong via the Web Audio API', async () => {
    const { playCopilotSuccessChime } = await import('../src/renderer/utils/audio-chimes.js');
    // Node test env: no AudioContext — the chime must fail silently.
    expect(() => playCopilotSuccessChime()).not.toThrow();
  });
});

describe('Vision-Impaired 2.0 §9: settings UI wiring (source contracts)', () => {
  const settingsSource = readFileSync(
    resolve(__dirname, '../src/renderer/panels/SystemPanels.tsx'),
    'utf8'
  ).replace(/\r\n/g, '\n');
  const appSource = readFileSync(resolve(__dirname, '../src/renderer/App.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const headerSource = readFileSync(
    resolve(__dirname, '../src/renderer/components/HeaderComponents.tsx'),
    'utf8'
  ).replace(/\r\n/g, '\n');

  it('mounts the VisionImpairedSettingsCard in the appearance section', () => {
    expect(settingsSource).toContain('function VisionImpairedSettingsCard');
    expect(settingsSource).toContain('<VisionImpairedSettingsCard />');
    expect(settingsSource).toContain('<AccessibilityTestCard />');
  });

  it('subscribes the card to live store updates (no getState bindings)', () => {
    expect(settingsSource).toContain('const vi = usePanelStore((s) => s.visionImpaired);');
    expect(settingsSource).toContain('const setVisionImpaired = usePanelStore((s) => s.setVisionImpaired);');
  });

  it('offers all spec controls: font, spacing, bold, no-ellipsis, bionic, invert, halation, cvd, motion', () => {
    for (const key of [
      'viEnable',
      'viFont',
      'viEnhancedSpacing',
      'viBoldWeight',
      'viNoEllipsis',
      'viBionicReading',
      'viSmartInvert',
      'viAntiHalation',
      'viSoftContrast',
      'viReduceMotion',
      'viMinTarget',
      'viPalette',
      'viCvdFilter',
      'viCursorSize',
      'viShakeToLocate',
      'viLoupe',
      'viLoupePosition',
      'viLoupeSize',
      'viLoupeFactor',
      'viSuperTabs',
      'viEnlargedTopBar',
      'viSplitMagnifier',
      'viAudioChime'
    ]) {
      expect(settingsSource).toContain(`t('settings.panels.appearance.${key}')`);
    }
  });

  it('mounts the CursorLoupeHUD at app-shell level', () => {
    expect(appSource).toContain('<CursorLoupeHUD />');
  });

  it('mounts the SuperSizedTabStrip in the browser main section', () => {
    expect(appSource).toContain('<SuperSizedTabStrip');
  });

  it('mounts the SplitScreenMagnifier inside the webview frame', () => {
    expect(appSource).toContain('<SplitScreenMagnifier webview={webviewRef.current}');
  });

  it('attaches Electron WebView events through addEventListener and reconciles smart invert on dom-ready', () => {
    expect(appSource).toContain("el.addEventListener('dom-ready', handleDomReady)");
    expect(appSource).toContain('const guestWebview = el as Electron.WebviewTag');
    expect(appSource).toContain('refreshSmartInvertForWebview(guestWebview, config.enabled && config.smartInvertWebview)');
    expect(appSource).not.toContain('onDomReady=');
    expect(appSource).not.toContain('onDidFailLoad=');
  });

  it('registers the Ctrl+Shift+L loupe and Alt+M split-magnifier shortcuts', () => {
    expect(appSource).toContain("event.key.toLowerCase() === 'l'");
    expect(appSource).toContain("event.key.toLowerCase() === 'm'");
  });

  it('keeps Vision-Impaired hooks above BrowserMain panel early returns', () => {
    const browserMainStart = appSource.indexOf('function BrowserMain(');
    const browserMainEnd = appSource.indexOf('function NativeSpacesMain(', browserMainStart);
    const browserMain = appSource.slice(browserMainStart, browserMainEnd);
    expect(browserMain.indexOf('const superTabsActive = usePanelStore')).toBeGreaterThan(-1);
    expect(browserMain.indexOf('const splitMagnifierActive = usePanelStore')).toBeGreaterThan(-1);
    expect(browserMain.indexOf('const superTabsActive = usePanelStore')).toBeLessThan(browserMain.indexOf("if (activePanel === 'chat')"));
    expect(browserMain.indexOf('const splitMagnifierActive = usePanelStore')).toBeLessThan(browserMain.indexOf("if (activePanel === 'chat')"));
    const firstPanelReturn = browserMain.indexOf("if (activePanel === 'chat')");
    expect(browserMain.slice(firstPanelReturn)).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Ref|Reducer|Context|SyncExternalStore)\s*\(/);
    expect(appSource).toContain('loupeActive={visionImpaired.enabled && visionImpaired.cursorLoupeEnabled}');
  });

  it('plays the copilot chime when a chat run finishes successfully', () => {
    expect(appSource).toContain('playCopilotSuccessChime()');
    expect(appSource).toContain('copilotAudioChime');
  });

  it('adds the loupe toggle button with ZoomIn icon to the ModernTitlebar', () => {
    expect(headerSource).toContain('loupe-toggle-btn');
    expect(headerSource).toContain('onToggleLoupe');
    expect(headerSource).toContain('<ZoomIn size={15} />');
  });

  it('mounts the hidden CVD SVG filter defs in the app shell', () => {
    expect(appSource).toContain('CVD_FILTER_MATRIXES');
    expect(appSource).toContain('feColorMatrix');
  });
});

describe('Vision-Impaired 2.0 §4.3: cursor loupe capture geometry', () => {
  it('centers a source crop sized to the configured magnification', async () => {
    const { getLoupeCaptureRect } = await import('../src/renderer/utils/cursor-loupe.js');
    expect(getLoupeCaptureRect(500, 300, 1200, 800, 180, 2)).toEqual({
      x: 455, y: 255, width: 90, height: 90
    });
  });

  it('clamps the crop to webview edges without changing its square dimensions', async () => {
    const { getLoupeCaptureRect } = await import('../src/renderer/utils/cursor-loupe.js');
    expect(getLoupeCaptureRect(2, 4, 1200, 800, 240, 4)).toEqual({
      x: 0, y: 0, width: 60, height: 60
    });
    expect(getLoupeCaptureRect(1199, 799, 1200, 800, 240, 4)).toEqual({
      x: 1140, y: 740, width: 60, height: 60
    });
  });

  it('returns a WebView-local crop only when the pointer is over that guest', async () => {
    const { getWebviewLoupeCaptureRect } = await import('../src/renderer/utils/cursor-loupe.js');
    expect(getWebviewLoupeCaptureRect(500, 300, { x: 200, y: 100, width: 800, height: 600 }, 180, 2)).toEqual({
      x: 255, y: 155, width: 90, height: 90
    });
    expect(getWebviewLoupeCaptureRect(199, 300, { x: 200, y: 100, width: 800, height: 600 }, 180, 2)).toBeNull();
    expect(getWebviewLoupeCaptureRect(1000, 700, { x: 200, y: 100, width: 800, height: 600 }, 180, 2)).toBeNull();
  });

  it('rejects invalid viewport and magnification values', async () => {
    const { getLoupeCaptureRect } = await import('../src/renderer/utils/cursor-loupe.js');
    expect(getLoupeCaptureRect(0, 0, 0, 800, 180, 2)).toBeNull();
    expect(getLoupeCaptureRect(0, 0, 1200, 800, 180, 0)).toBeNull();
  });
});

describe('Vision-Impaired 2.0 §9: accessibility test card (CSS)', () => {
  it('styles the test card with palette-driven colors and 48px controls', () => {
    const cardBlock = block('.a11y-test-card {');
    expect(cardBlock).toContain('border: 2px solid var(--lb-vi-accent, #F59E0B)');
    expect(block('.a11y-test-card button {')).toContain('min-height: 48px');
    expect(block(".a11y-test-card input[type='text'] {")).toContain('min-height: 48px');
  });

  it('previews a palette locally and persists it only through the Apply button', () => {
    const source = readFileSync(resolve(__dirname, '../src/renderer/components/AccessibilityTestCard.tsx'), 'utf8');
    expect(source).toContain('data-preview-palette={previewPalette}');
    expect(source).toContain("onClick={() => setPreviewPalette(palette.id)}");
    expect(source).toContain("onClick={() => setVisionImpaired({ palette: previewPalette })}");
    expect(source).not.toContain('onClick={() => setVisionImpaired({ palette: palette.id })}');
    expect(source).toContain("previewPalette !== config.palette");
  });
});

describe('Vision-Impaired font availability', () => {
  it('does not expose or apply an unbundled OpenDyslexic font', async () => {
    const { normalizeVisionImpairedConfig } = await import('../src/renderer/stores/a11y-config.js');
    const systemPanels = readFileSync(resolve(__dirname, '../src/renderer/panels/SystemPanels.tsx'), 'utf8');
    const configSource = readFileSync(resolve(__dirname, '../src/renderer/stores/a11y-config.ts'), 'utf8');

    expect(normalizeVisionImpairedConfig({ fontFamily: 'opendyslexic' }).fontFamily).toBe('system');
    expect(systemPanels).not.toContain('value="opendyslexic"');
    expect(configSource).not.toContain("'opendyslexic'");
    expect(css).not.toContain('OpenDyslexic');
    expect(css).toContain("font-family: 'Atkinson Hyperlegible', system-ui, sans-serif !important");
  });
});

describe('Vision-Impaired 2.0: store integration (usePanelStore)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exposes setVisionImpaired which patches, persists and syncs the DOM', async () => {
    const storage = new Map<string, string>();
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (key: string) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key: string, value: string) => void storage.set(key, value),
        removeItem: (key: string) => void storage.delete(key)
      }
    };
    const dataset: Record<string, string> = {};
    const styleProps: Record<string, string> = {};
    (globalThis as Record<string, unknown>).document = {
      documentElement: {
        dataset,
        style: {
          setProperty: (name: string, value: string) => void (styleProps[name] = value),
          removeProperty: (name: string) => delete styleProps[name]
        }
      }
    };

    const { usePanelStore } = await import('../src/renderer/stores/usePanelStore.js');
    const { visionImpairedStorageKey } = await import('../src/renderer/stores/a11y-config.js');

    usePanelStore.getState().setVisionImpaired({ enabled: true, palette: 'onyx-cyan', minClickTargetSize: 64 });

    const state = usePanelStore.getState().visionImpaired;
    expect(state.enabled).toBe(true);
    expect(state.palette).toBe('onyx-cyan');
    expect(state.minClickTargetSize).toBe(64);
    expect(dataset.a11yViEnabled).toBe('true');
    expect(dataset.a11yPalette).toBe('onyx-cyan');
    expect(styleProps['--lb-min-target-size']).toBe('64px');
    expect(JSON.parse(storage.get(visionImpairedStorageKey) || '{}').enabled).toBe(true);

    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
  });
});

describe('Vision-Impaired 2.0: i18n parity', () => {
  it('covers every vision-impaired key in all 7 locales', async () => {
    const keys = (await import('../src/renderer/i18n/keys.js')).desktopTranslationKeys;
    const viKeys = keys.filter((key) => key.startsWith('settings.panels.appearance.vi'));
    expect(viKeys.length).toBeGreaterThanOrEqual(73);

    const { visionImpairedTranslations } = await import(
      '../src/renderer/i18n/vision-impaired-translations.js'
    );
    for (const locale of ['en', 'de', 'es', 'fr', 'it', 'pt-BR', 'ru'] as const) {
      const localeKeys = Object.keys(visionImpairedTranslations[locale]);
      expect(new Set(localeKeys), `${locale} must cover all vi keys`).toEqual(new Set(viKeys));
      for (const [key, value] of Object.entries(visionImpairedTranslations[locale])) {
        expect(value.trim(), `${locale}.${key} must not be empty`).not.toBe('');
      }
    }
  });
});

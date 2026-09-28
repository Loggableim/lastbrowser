import { describe, expect, it, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Environment shim for Node environment (localStorage & document)
// ---------------------------------------------------------------------------
const _ls: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => _ls[k] ?? null,
  setItem: (k: string, v: string) => { _ls[k] = String(v); },
  removeItem: (k: string) => { delete _ls[k]; },
  clear: () => { Object.keys(_ls).forEach((k) => delete _ls[k]); }
};

const _classes = new Set<string>();
const _styles: Record<string, string> = {};
const _datasets: Record<string, string> = {};
let systemThemeIsLight = false;
const systemThemeListeners = new Set<() => void>();

const documentMock = {
  documentElement: {
    dataset: _datasets,
    classList: {
      toggle: (cls: string, force?: boolean) => {
        if (force === undefined) {
          if (_classes.has(cls)) _classes.delete(cls);
          else _classes.add(cls);
        } else if (force) {
          _classes.add(cls);
        } else {
          _classes.delete(cls);
        }
      },
      contains: (cls: string) => _classes.has(cls)
    },
    style: {
      colorScheme: 'dark',
      zoom: '1',
      setProperty: (prop: string, val: string) => { _styles[prop] = val; },
      getPropertyValue: (prop: string) => _styles[prop] || '',
      removeProperty: (prop: string) => { delete _styles[prop]; }
    }
  }
};

(globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage = localStorageMock;
(globalThis as unknown as { window: unknown }).window = {
  localStorage: localStorageMock,
  matchMedia: () => ({
    get matches() { return systemThemeIsLight; },
    addEventListener: (_event: string, listener: () => void) => systemThemeListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => systemThemeListeners.delete(listener)
  })
};
(globalThis as unknown as { document: typeof documentMock }).document = documentMock;

import {
  normalizeAppearanceTheme,
  normalizeAppearanceSkin,
  hexToRgb,
  computeAccentTokens,
  getDomainFromUrl,
  getEffectiveZoomForUrl,
  saveDomainZoom,
  applyDesktopAppearance,
  watchSystemThemeChanges,
  mergeDesktopSettings,
  fetchDesktopSettingsWithRetry
} from '../src/renderer/App.js';
import { applyDesktopAppearancePreview } from '../src/renderer/panels/SystemPanels.js';

describe('Appearance Relaunch & Design-System Engine', () => {
  beforeEach(() => {
    localStorageMock.clear();
    _classes.clear();
    Object.keys(_styles).forEach((k) => delete _styles[k]);
    Object.keys(_datasets).forEach((k) => delete _datasets[k]);
    documentMock.documentElement.style.zoom = '1';
    systemThemeIsLight = false;
    systemThemeListeners.clear();
  });

  describe('1. Theme Normalization & OLED Support', () => {
    it('prefers persisted server appearance over a stale renderer cache after relaunch', () => {
      const merged = mergeDesktopSettings(
        { settings: { theme: 'light', skin: 'custom', accent_color: '#ff00aa' } },
        { theme: 'dark', skin: 'matrix', accent_color: '' },
        null
      );

      expect(merged).toMatchObject({ theme: 'light', skin: 'custom', accent_color: '#ff00aa' });
    });

    it('retries the settings read after a transient startup fetch failure', async () => {
      let attempts = 0;
      const settings = await fetchDesktopSettingsWithRetry(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('service is still starting');
        return { theme: 'light', skin: 'custom' };
      }, 3, 0);

      expect(attempts).toBe(2);
      expect(settings).toEqual({ theme: 'light', skin: 'custom' });
    });

    it('stops retry delays when the settings load is cancelled', async () => {
      const controller = new AbortController();
      let attempts = 0;
      const pending = fetchDesktopSettingsWithRetry(async () => {
        attempts += 1;
        throw new Error('service is still starting');
      }, 4, 1000, controller.signal);

      await Promise.resolve();
      controller.abort();
      await expect(pending).rejects.toThrow();
      expect(attempts).toBe(1);
    });

    it('normalizes light, dark, system, and oled correctly', () => {
      expect(normalizeAppearanceTheme('dark')).toBe('dark');
      expect(normalizeAppearanceTheme('light')).toBe('light');
      expect(normalizeAppearanceTheme('system')).toBe('system');
      expect(normalizeAppearanceTheme('oled')).toBe('oled');
      expect(normalizeAppearanceTheme('OLED')).toBe('oled');
      expect(normalizeAppearanceTheme('unknown-theme')).toBe('dark');
      expect(normalizeAppearanceTheme('')).toBe('dark');
    });

    it('normalizes the vision-impaired high-contrast theme', () => {
      expect(normalizeAppearanceTheme('vision-impaired')).toBe('vision-impaired');
      expect(normalizeAppearanceTheme('Vision-Impaired')).toBe('vision-impaired');
      expect(normalizeAppearanceTheme('vision impaired')).not.toBe('vision-impaired');
    });

    it('updates the resolved appearance when the OS color preference changes in System mode', () => {
      const settings = { theme: 'system' };
      applyDesktopAppearance(settings);
      expect(_datasets.theme).toBe('dark');

      const stopWatching = watchSystemThemeChanges(settings);
      expect(systemThemeListeners.size).toBe(1);
      systemThemeIsLight = true;
      systemThemeListeners.forEach((listener) => listener());
      expect(_datasets.theme).toBe('light');
      expect(_classes.has('theme-light')).toBe(true);

      stopWatching();
      expect(systemThemeListeners.size).toBe(0);
    });
  });

  describe('2. Skin Normalization', () => {
    it('normalizes skins including matrix, sienna, and custom', () => {
      expect(normalizeAppearanceSkin('default')).toBe('default');
      expect(normalizeAppearanceSkin('matrix')).toBe('matrix');
      expect(normalizeAppearanceSkin('sienna')).toBe('sienna');
      expect(normalizeAppearanceSkin('custom')).toBe('custom');
      expect(normalizeAppearanceSkin('  Charizard  ')).toBe('charizard');
      expect(normalizeAppearanceSkin('')).toBe('default');
    });
  });

  describe('3. Hex Color Computation & Accent Tokens', () => {
    it('parses valid 3-digit and 6-digit hex colors into RGB components', () => {
      expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#0ea5e9')).toEqual({ r: 14, g: 165, b: 233 });
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#1g3456')).toBeNull();
      expect(hexToRgb('#12.456')).toBeNull();
    });

    it('computes glow, hover, and contrasting text color dynamically', () => {
      // Light color -> black text
      const lightTokens = computeAccentTokens('#ffff00');
      expect(lightTokens).not.toBeNull();
      expect(lightTokens?.text).toBe('#000000');
      expect(lightTokens?.glow).toContain('0.45');

      // Dark color -> white text
      const darkTokens = computeAccentTokens('#1e1e2f');
      expect(darkTokens).not.toBeNull();
      expect(darkTokens?.text).toBe('#ffffff');

      // Cyan / Brand blue
      const blueTokens = computeAccentTokens('#0ea5e9');
      expect(blueTokens).not.toBeNull();
      expect(blueTokens?.primary).toBe('#0ea5e9');
      expect(blueTokens?.rgbStr).toBe('14, 165, 233');
    });
  });

  describe('4. Domain-based Zoom Engine', () => {
    it('extracts hostnames cleanly from valid web URLs and ignores app schemes', () => {
      expect(getDomainFromUrl('https://disneyplus.com/de/login')).toBe('disneyplus.com');
      expect(getDomainFromUrl('https://netflix.com/browse')).toBe('netflix.com');
      expect(getDomainFromUrl('http://localhost:3000/test')).toBe('localhost');
      expect(getDomainFromUrl('app://lastbrowser/renderer/index.html')).toBe('');
      expect(getDomainFromUrl('about:blank')).toBe('');
      expect(getDomainFromUrl('not-a-url')).toBe('');
    });

    it('falls back to default zoom percentage for unvisited domains', () => {
      expect(getEffectiveZoomForUrl('https://never-visited-example-123.com', 125)).toBe(1.25);
      expect(getEffectiveZoomForUrl('https://never-visited-example-456.com', 100)).toBe(1.0);
    });

    it('remembers domain-specific zoom factor overrides', () => {
      saveDomainZoom('github.com', 1.15);
      expect(getEffectiveZoomForUrl('https://github.com/Loggableim/lastbrowser', 100)).toBe(1.15);
    });
  });

  describe('5. DOM Synchronization & Custom Color Injection', () => {
    it('applies theme-oled, dataset properties, and custom accent CSS variables', () => {
      applyDesktopAppearance({
        theme: 'oled',
        skin: 'custom',
        accent_color: '#00d26a',
        font_size: 'large',
        message_layout: 'compact',
        syntax_theme: 'one-dark'
      });

      const root = documentMock.documentElement;
      expect(root.dataset.theme).toBe('oled');
      expect(root.dataset.skin).toBe('custom');
      expect(root.dataset.fontSize).toBe('large');
      expect(root.dataset.messageLayout).toBe('compact');
      expect(root.dataset.syntaxTheme).toBe('one-dark');

      expect(root.classList.contains('theme-oled')).toBe(true);
      expect(root.classList.contains('theme-light')).toBe(false);

      // Custom CSS properties
      expect(root.style.getPropertyValue('--user-accent-primary')).toBe('#00d26a');
      expect(root.style.getPropertyValue('--accent-primary')).toBe('#00d26a');
      expect(root.style.getPropertyValue('--user-accent-glow')).toContain('0.45');
    });

    it('restores the vision-impaired theme class from persisted settings and clears it for other themes', () => {
      applyDesktopAppearance({ theme: 'vision-impaired', skin: 'default' });
      expect(documentMock.documentElement.dataset.theme).toBe('vision-impaired');
      expect(documentMock.documentElement.classList.contains('theme-vision-impaired')).toBe(true);

      applyDesktopAppearance({ theme: 'dark', skin: 'default' });
      expect(documentMock.documentElement.classList.contains('theme-vision-impaired')).toBe(false);
    });

    it('removes custom accent variables when switching back to a preset skin', () => {
      applyDesktopAppearance({
        theme: 'dark',
        skin: 'ares',
        accent_color: '',
        font_size: 'default',
        message_layout: 'bubbles'
      });

      const root = documentMock.documentElement;
      expect(root.dataset.theme).toBe('dark');
      expect(root.dataset.skin).toBe('ares');
      expect(root.classList.contains('theme-dark')).toBe(true);
      expect(root.classList.contains('theme-oled')).toBe(false);
      expect(root.style.getPropertyValue('--user-accent-primary')).toBe('');
    });

    it('clears a previously applied accent when the draft color becomes invalid', () => {
      applyDesktopAppearance({ theme: 'dark', skin: 'custom', accent_color: '#00d26a' });
      expect(documentMock.documentElement.style.getPropertyValue('--accent-primary')).toBe('#00d26a');

      applyDesktopAppearance({ theme: 'dark', skin: 'custom', accent_color: '#0g526a' });
      expect(documentMock.documentElement.style.getPropertyValue('--accent-primary')).toBe('');
      expect(documentMock.documentElement.style.getPropertyValue('--user-accent-glow')).toBe('');
    });

    it('clears invalid custom accents from the live settings preview', () => {
      applyDesktopAppearancePreview('dark', 'custom', 'default', 'bubbles', '', '#00d26a');
      expect(documentMock.documentElement.style.getPropertyValue('--accent-primary')).toBe('#00d26a');

      applyDesktopAppearancePreview('dark', 'custom', 'default', 'bubbles', '', '#0g526a');
      expect(documentMock.documentElement.style.getPropertyValue('--accent-primary')).toBe('');
    });

    it('toggles the theme-vision-impaired root class', () => {
      applyDesktopAppearancePreview('vision-impaired', 'default', 'default', 'bubbles', '', '');
      const root = documentMock.documentElement;
      expect(root.classList.contains('theme-vision-impaired')).toBe(true);
      expect(root.classList.contains('theme-dark')).toBe(false);

      applyDesktopAppearancePreview('dark', 'default', 'default', 'bubbles', '', '');
      expect(root.classList.contains('theme-vision-impaired')).toBe(false);
      expect(root.classList.contains('theme-dark')).toBe(true);
    });

    it('keeps page zoom separate from the independently controlled browser UI zoom', () => {
      // The accessibility UI zoom owns documentElement.style.zoom. Appearance's
      // default page zoom is applied to WebContents by BrowserMain instead.
      documentMock.documentElement.style.zoom = '1.3';
      applyDesktopAppearancePreview('dark', 'default', 'default', 'bubbles', '', '');
      expect(documentMock.documentElement.style.zoom).toBe('1.3');
    });
  });

  describe('6. BrowserMain desktopSettings Contract & Zoom Resilience', () => {
    it('declares desktopSettings in BrowserMain parameters and prop types', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
      const browserMainIndex = appTsx.indexOf('function BrowserMain(');
      expect(browserMainIndex).toBeGreaterThan(0);
      const browserMainSignature = appTsx.slice(browserMainIndex, appTsx.indexOf('): JSX.Element {', browserMainIndex));
      expect(browserMainSignature).toContain('desktopSettings = null');
      expect(browserMainSignature).toContain('desktopSettings?: DesktopSettingsRecord | null;');
    });

    it('passes desktopSettings to all BrowserMain call sites in App.tsx', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
      const browserMainCalls = appTsx.match(/<BrowserMain[\s\S]*?\/>/g) || [];
      expect(browserMainCalls.length).toBeGreaterThanOrEqual(2);
      for (const call of browserMainCalls) {
        expect(call).toContain('desktopSettings={desktopSettings}');
      }
    });
  });

  describe('7. Appearance controls affect browser chrome', () => {
    it('uses valid CSS math for the configurable minimum font size', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles.css'), 'utf8');
      expect(css).toContain('font-size: max(var(--min-font-size, 0px), 1em);');
      expect(css).not.toContain('font-size: max(var(--min-font-size, 0px), inherit);');
      expect(css).toContain('.theme-vision-impaired');
      expect(css).toContain('font-size: 16px');
    });

    it('consumes glass and density tokens in the titlebar and collapsed sidebar', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles.css'), 'utf8');
      expect(css).toContain('background: rgba(9, 14, 31, var(--glass-bg-opacity, 0.72))');
      expect(css).toContain('backdrop-filter: blur(var(--glass-blur, 16px))');
      expect(css).toContain('height: var(--titlebar-height, 42px)');
      expect(css).toContain('width: var(--dock-width, 48px)');
    });

    it('applies each selected syntax theme to both transcript and Copilot code blocks', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/appearance.css'), 'utf8');

      for (const theme of ['tomorrow-night', 'one-dark', 'github-light']) {
        expect(css).toContain(`html[data-syntax-theme="${theme}"] .rich-code-block`);
        expect(css).toContain(`html[data-syntax-theme="${theme}"] .copilot-code-block`);
        expect(css).toContain(`html[data-syntax-theme="${theme}"] .rich-code-block pre`);
        expect(css).toContain(`html[data-syntax-theme="${theme}"] .copilot-code-content`);
      }
      expect(css).toContain('color: #24292f');
      expect(css).toContain('background: #f6f8fa');
    });

    it('applies the accent palette to the Default skin while leaving named skins in control', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/appearance.css'), 'utf8');
      for (const accent of ['neon-cyan', 'electric-violet', 'emerald-flow', 'solar-amber', 'monochrome-slate']) {
        expect(css).toContain(`html[data-skin="default"][data-theme-accent="${accent}"]`);
      }
      expect(css).toContain('--accent-primary: #00d9ff');
      expect(css).not.toContain('html[data-skin="ares"][data-theme-accent=');
    });

    it('wires font size and every message layout to the native Sidekick transcript markup', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/appearance.css'), 'utf8');
      const baseCss = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles.css'), 'utf8');

      expect(css).toContain('html[data-font-size] .chat-message .message-body p');
      expect(css).toContain('font-size: var(--chat-font-size, 14px)');
      expect(baseCss).toContain('[data-message-layout="compact"] .chat-message');
      expect(baseCss).toContain('[data-message-layout="expanded"] .chat-message');
      expect(css).toContain('html[data-message-layout="bubbles"] .chat-message');
      expect(css).toContain('html[data-message-layout="bubbles"] .chat-message .message-body');
      expect(css).toContain('html[data-message-layout="expanded"] .chat-message .message-body');
    });

    it('keeps native settings controls readable on the light theme', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles.css'), 'utf8');

      expect(css).toContain('html.theme-light .settings-section-button-text strong');
      expect(css).toContain('html.theme-light .settings-section-button-text small');
      expect(css).toContain('html.theme-light .settings-card-header strong');
      expect(css).toContain('html.theme-light .settings-editor-head strong');
      expect(css).toContain('html.theme-light .settings-editor .secondary-action');
      expect(css).toContain('html.theme-light .settings-editor .secondary-action:disabled');
      expect(css).toContain('html.theme-light .provider-status-row.active .provider-copy strong');
      expect(css).toContain('html.theme-light .provider-status-row .provider-badge');
      expect(css).toContain('html.theme-light .downloads-panel');
      expect(css).toContain('html.theme-light .downloads-panel > header strong');
      expect(css).toContain('html.theme-light .downloads-empty');
      expect(css).toContain('html.theme-light .settings-theme-btn.active strong');
      expect(css).toContain('html.theme-light .settings-skin-btn:not(.active) strong');
      expect(css).toContain('html.theme-light .settings-custom-color-card strong');
      expect(css).toContain('html.theme-light .settings-field input');
      expect(css).toContain('html.theme-light .provider-copy .provider-verification-note.untested');
      expect(css).toContain('html.theme-light .provider-copy .provider-verification-note.verified');
      expect(css).toContain('color: #854d0e;');
      expect(css).toContain('color: #166534;');
      expect(css).toContain('color: #075985;');
      expect(css).toContain('color: var(--lb-muted);');
    });
  });
});

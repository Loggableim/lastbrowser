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
      setProperty: (prop: string, val: string) => { _styles[prop] = val; },
      getPropertyValue: (prop: string) => _styles[prop] || '',
      removeProperty: (prop: string) => { delete _styles[prop]; }
    }
  }
};

(globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage = localStorageMock;
(globalThis as unknown as { window: unknown }).window = {
  localStorage: localStorageMock,
  matchMedia: () => ({ matches: false })
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
  applyDesktopAppearance
} from '../src/renderer/App.js';

describe('Appearance Relaunch & Design-System Engine', () => {
  beforeEach(() => {
    localStorageMock.clear();
    _classes.clear();
    Object.keys(_styles).forEach((k) => delete _styles[k]);
    Object.keys(_datasets).forEach((k) => delete _datasets[k]);
  });

  describe('1. Theme Normalization & OLED Support', () => {
    it('normalizes light, dark, system, and oled correctly', () => {
      expect(normalizeAppearanceTheme('dark')).toBe('dark');
      expect(normalizeAppearanceTheme('light')).toBe('light');
      expect(normalizeAppearanceTheme('system')).toBe('system');
      expect(normalizeAppearanceTheme('oled')).toBe('oled');
      expect(normalizeAppearanceTheme('OLED')).toBe('oled');
      expect(normalizeAppearanceTheme('unknown-theme')).toBe('dark');
      expect(normalizeAppearanceTheme('')).toBe('dark');
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
});

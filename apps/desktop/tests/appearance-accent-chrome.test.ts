import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeAccentTokens } from '../src/renderer/App.js';

const styles = readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8');
const appearance = readFileSync(new URL('../src/renderer/appearance.css', import.meta.url), 'utf8');

function contrastRatio(hex: string, text: string): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const rgb = hex.match(/[a-f\d]{2}/gi)?.map((value) => Number.parseInt(value, 16)) ?? [];
  const textRgb = text === '#000000' ? [0, 0, 0] : [255, 255, 255];
  const luminance = ([r, g, b]: number[]): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const values = [luminance(rgb), luminance(textRgb)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('appearance accent reaches browser chrome', () => {
  it('chooses readable text for bright, dark, and saturated custom accent colors', () => {
    for (const color of ['#00d9ff', '#a855f7', '#10b981', '#f59e0b', '#94a3b8', '#0ea5e9', '#1e1e2f']) {
      const tokens = computeAccentTokens(color);
      expect(tokens, color).not.toBeNull();
      expect(contrastRatio(color, tokens!.text), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the saved default-skin palette ahead of base skin colors', () => {
    const baseSkin = styles.indexOf('[data-skin="default"] { --accent-primary:');
    const selectedPalette = styles.lastIndexOf('html[data-skin="default"][data-theme-accent="neon-cyan"]');
    expect(baseSkin).toBeGreaterThanOrEqual(0);
    expect(selectedPalette).toBeGreaterThan(baseSkin);
    for (const accent of ['neon-cyan', 'electric-violet', 'emerald-flow', 'solar-amber', 'monochrome-slate']) {
      expect(styles).toContain(`html[data-skin="default"][data-theme-accent="${accent}"]`);
      expect(appearance).toContain(`html[data-skin="default"][data-theme-accent="${accent}"]`);
    }
  });

  it('uses the accent token for tabs, Spaces, sidebars, primary dialog actions, toggles, and focus rings', () => {
    expect(styles).toContain('--lb-accent: var(--accent-primary');
    expect(styles).toContain('html:not(.theme-vision-impaired) .tab.active');
    expect(styles).toContain('html:not(.theme-vision-impaired) .space-list button.active');
    expect(styles).toContain('html:not(.theme-vision-impaired) .sidebar-session-item.is-active');
    expect(styles).toContain('html:not(.theme-vision-impaired) .primary-action');
    expect(styles).toContain('html:not(.theme-vision-impaired) .extension-toggle-switch.active');
    expect(styles).toContain('html:not(.theme-vision-impaired) button:focus-visible');
    expect(styles).toContain('background-color: var(--lb-accent-soft)');
    expect(styles).toContain('box-shadow: 0 0 10px color-mix(in srgb, var(--lb-accent) 20%, transparent)');
  });
});

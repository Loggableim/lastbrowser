import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
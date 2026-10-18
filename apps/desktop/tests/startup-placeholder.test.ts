import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { brandAssets } from '../src/renderer/brand.js';
import { StartupPlaceholder, chooseStartupPlaceholderIcon, startupPlaceholderIcons } from '../src/renderer/startup/StartupPlaceholder.js';

const sourceRoot = path.resolve(process.cwd(), 'src/renderer/startup');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');

describe('startup placeholder', () => {
  it('offers every sidebar sidekick icon through an injected random source', () => {
    const selected = startupPlaceholderIcons.map((_, index) => chooseStartupPlaceholderIcon(() => (index + 0.5) / startupPlaceholderIcons.length));
    expect(selected).toEqual(startupPlaceholderIcons);
    expect(new Set(selected).size).toBe(Object.keys(brandAssets.sidebarIcons).length);
    expect(selected.every(icon => icon.includes('/sidebar-icons/'))).toBe(true);
  });

  it('rejects invalid random values instead of selecting unpredictably', () => {
    for (const value of [-0.1, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => chooseStartupPlaceholderIcon(() => value)).toThrow(RangeError);
    }
  });

  it('renders a single glowing sidebar icon plus the password form without the heavy startup screen', () => {
    const markup = renderToStaticMarkup(createElement(StartupPlaceholder, {
      locale: 'de',
      phase: 'session',
      retryContent: createElement('section', { className: 'startup-screen__auth' }, 'Passwort')
    }));

    expect(markup).toContain('startup-placeholder');
    expect(markup).toMatch(/startup-placeholder__icon" src="\.\/sidebar-icons\/[^"]+-modern-popart\.png"/);
    expect(markup).toContain('Sitzungsschutz wird geprüft');
    expect(markup).toContain('startup-screen__auth');
    expect(markup).toContain('Passwort');
    expect(markup).not.toContain('startup-screen__quote');
    expect(markup).not.toContain('startup-rainbow');
    expect(markup).not.toContain('startup-preferences');
    expect(markup).not.toContain('sidekick-0');
  });

  it('keeps the error and retry path available on the light placeholder', () => {
    const markup = renderToStaticMarkup(createElement(StartupPlaceholder, {
      locale: 'en',
      phase: 'engine',
      error: 'Engine unavailable',
      onRetry: () => undefined
    }));

    expect(markup).toContain('Startup could not be completed');
    expect(markup).toContain('Engine unavailable');
    expect(markup).toContain('Try again');
  });

  it('does not import the preferences panel or startup animation assets', () => {
    const source = readFileSync(path.join(sourceRoot, 'StartupPlaceholder.tsx'), 'utf8');
    expect(source).not.toContain('StartupPreferencesPanel');
    expect(source).not.toContain('startup-preferences');
    expect(source).not.toContain('sidekick-0');
  });

  it('mounts the light placeholder on the locked auth path before the full startup screen', () => {
    const app = readFileSync(appPath, 'utf8');
    const authPath = app.indexOf('if (accessAuthRequired) {');
    const placeholder = app.indexOf('<StartupPlaceholder', authPath);
    const fullScreen = app.indexOf('<StartupScreen', placeholder);

    expect(authPath).toBeGreaterThanOrEqual(0);
    expect(placeholder).toBeGreaterThan(authPath);
    expect(fullScreen).toBeGreaterThan(placeholder);
  });
});

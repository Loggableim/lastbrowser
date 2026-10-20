import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { brandAssets } from '../src/renderer/brand.js';
import { StartupPlaceholder, chooseStartupPlaceholderIcon, startupPlaceholderIcons } from '../src/renderer/startup/StartupPlaceholder.js';

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
      status: 'Sitzungsschutz wird geprüft',
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

  it('renders the retry control when the auth check fails', () => {
    const markup = renderToStaticMarkup(createElement(StartupPlaceholder, {
      error: 'Sitzung konnte nicht geprüft werden',
      errorTitle: 'Browser gesperrt',
      retryLabel: 'Erneut versuchen',
      onRetry: () => undefined
    }));

    expect(markup).toContain('startup-placeholder--error');
    expect(markup).toContain('Browser gesperrt');
    expect(markup).toContain('Sitzung konnte nicht geprüft werden');
    expect(markup).toContain('Erneut versuchen');
  });
});

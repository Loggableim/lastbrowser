import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StartupAuthPlaceholder, chooseStartupAuthIcon, shouldShowStartupAuthPlaceholder, startupAuthIcons } from '../src/renderer/startup/StartupAuthPlaceholder.js';

describe('startup authentication placeholder', () => {
  it('chooses an available sidebar icon for each random interval', () => {
    expect(startupAuthIcons.map((_, index) => chooseStartupAuthIcon(() => (index + 0.5) / startupAuthIcons.length))).toEqual(startupAuthIcons);
  });

  it('renders the checking message without the full startup animation or controls', () => {
    const html = renderToStaticMarkup(createElement(StartupAuthPlaceholder, { message: 'Checking session', icon: startupAuthIcons[0] }));
    expect(html).toContain('Checking session');
    expect(html).toContain('role="status"');
    expect(html).toContain('/sidebar-icons/');
    expect(html).not.toContain('startup-screen__quote');
    expect(html).not.toContain('startup-preferences');
    expect(html).not.toContain('startup-rainbow');
  });

  it('never hides the password form or the retry screen after an auth error', () => {
    expect(shouldShowStartupAuthPlaceholder({ checked: false, required: false, error: '', failure: false })).toBe(true);
    expect(shouldShowStartupAuthPlaceholder({ checked: false, required: true, error: '', failure: false })).toBe(false);
    expect(shouldShowStartupAuthPlaceholder({ checked: false, required: true, error: 'invalid password', failure: false })).toBe(false);
    expect(shouldShowStartupAuthPlaceholder({ checked: false, required: false, error: 'network failure', failure: true })).toBe(false);
    expect(shouldShowStartupAuthPlaceholder({ checked: true, required: false, error: '', failure: false })).toBe(false);
  });
});

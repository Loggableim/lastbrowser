import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccessPasswordInput } from '../src/renderer/components/AccessPasswordInput.js';

describe('access password input', () => {
  it('starts concealed and provides an accessible non-submit visibility control', () => {
    const markup = renderToStaticMarkup(createElement(AccessPasswordInput, {
      value: '', onChange: () => {}, resetKey: 1,
      showLabel: 'Passwort anzeigen', hideLabel: 'Passwort ausblenden'
    }));
    expect(markup).toContain('type="password"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('aria-label="Passwort anzeigen"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('type="button"');
  });
});

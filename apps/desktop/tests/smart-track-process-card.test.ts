import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SmartTrackProcessCard } from '../src/renderer/components/SmartTrackProcessCard.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';

describe('Smart Track process card', () => {
  it('renders its localized single-track label in the i18n context without claiming unmeasured savings', () => {
    const markup = renderToStaticMarkup(React.createElement(
      DesktopI18nProvider,
      null,
      React.createElement(SmartTrackProcessCard, {
        metadata: { effort: 'high', model: 'runtime-model', provider: 'runtime-provider' },
      })
    ));

    expect(markup).toContain('<button');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toMatch(/title="[^"]+"/);
    expect(markup).not.toMatch(/\d+\s*%\s*Token-Ersparnis/i);
  });
});

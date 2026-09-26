import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SmartTrackProcessCard } from '../src/renderer/components/SmartTrackProcessCard.js';

describe('Smart Track process card', () => {
  it('labels the single track without claiming an unmeasured token saving', () => {
    const markup = renderToStaticMarkup(React.createElement(SmartTrackProcessCard, {
      metadata: { effort: 'high', model: 'runtime-model', provider: 'runtime-provider' },
    }));

    expect(markup).toContain('Einzelspur');
    expect(markup).not.toMatch(/\d+\s*%\s*Token-Ersparnis/i);
  });
});

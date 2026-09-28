import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BionicText } from '../src/renderer/panels/ChatComponents.js';
import { toBionicSegments } from '../src/renderer/utils/bionic-reading.js';

describe('Bionic Reading for app-owned chat text', () => {
  it('renders the configured word anchors as React elements and preserves all text', () => {
    const input = 'Readable chat message';
    const markup = renderToStaticMarkup(React.createElement(BionicText, { text: input }));
    expect(markup).toContain('<strong>Read</strong>');
    expect(markup.replace(/<[^>]+>/g, '')).toBe(input);
  });

  it('renders normal text when disabled', () => {
    const markup = renderToStaticMarkup(React.createElement(BionicText, { text: 'Readable chat', enabled: false }));
    expect(markup).toBe('<p>Readable chat</p>');
    expect(markup).not.toContain('<strong>');
  });

  it('keeps markup-like message content inert in both modes', () => {
    const input = '<img src=x onerror=alert(1)>';
    for (const enabled of [true, false]) {
      const markup = renderToStaticMarkup(React.createElement(BionicText, { text: input, enabled }));
      expect(markup).not.toContain('<img');
      expect(markup).toContain('&lt;');
      expect(markup).toContain('&gt;');
    }
  });

  it('does not split supplementary Unicode characters', () => {
    const parts = toBionicSegments('😀😀😀😀');
    expect(parts.map((part) => part.text).join('')).toBe('😀😀😀😀');
    expect(parts.every((part) => !/[\uD800-\uDBFF]$/.test(part.text))).toBe(true);
  });

  it('connects the preference to chat message rendering without touching web pages', () => {
    const source = readFileSync(resolve(__dirname, '../src/renderer/panels/ChatComponents.tsx'), 'utf8');
    expect(source).toContain('state.visionImpaired.enabled && state.visionImpaired.bionicReading');
    expect(source).toContain('<BionicText text={view.text} />');
    expect(source).not.toContain('executeJavaScript');
    expect(source).not.toContain('webview');
  });
});

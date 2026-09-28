import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SuperSizedTabStrip } from '../src/renderer/components/SuperSizedTabStrip.js';

describe('SuperSizedTabStrip accessibility', () => {
  const tab = {
    id: 'tab-1',
    title: 'A very long browser tab title that must remain completely readable without clipping',
    url: 'https://www.example.com/path',
    isPlayingAudio: true
  };

  const render = (overrides: Partial<React.ComponentProps<typeof SuperSizedTabStrip>> = {}) =>
    renderToStaticMarkup(
      React.createElement(SuperSizedTabStrip, {
        tabs: [tab],
        activeTabId: 'tab-1',
        onActivateTab: vi.fn(),
        onCloseTab: vi.fn(),
        onToggleTabMute: vi.fn(),
        ...overrides
      })
    );

  it('keeps the full title available to wrapping instead of clamping it to two lines', () => {
    const html = render();
    expect(html).toContain(tab.title);
    expect(html).toContain('overflow-wrap:anywhere');
    expect(html).toContain('-webkit-line-clamp:unset');
  });

  it('uses separate native buttons for activation, close, and mute', () => {
    const html = render();
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Close ' + tab.title + '"');
    expect(html).toContain('aria-label="Mute ' + tab.title + '"');
    expect(html).toContain('aria-label="' + tab.title + ', example.com"');
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toMatch(/<button[^>]*class="lb-supertab-activate"[^>]*>[\s\S]*?<\/button><button[^>]*class="lb-supertab-close"/);
  });

  it('marks the selected tab and labels unread state when the caller supplies it', () => {
    const html = render({ unreadTabIds: new Set(['tab-1']) });
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('current tab, unread');
    expect(html).toContain('— Unread');
  });

  it('does not expose audio controls when no mute callback is available', () => {
    const html = render({ onToggleTabMute: undefined });
    expect(html).not.toContain('aria-label="Mute ' + tab.title + '"');
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InPageActionBar } from '../src/renderer/components/InPageActionBar.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { actionBarCopy } from '../src/renderer/i18n/action-bar-copy.js';

const barProps = {
  variant: 'in-page' as const,
  onAction: vi.fn(),
  zoomFactor: 1.25,
  onResetZoom: vi.fn(),
  onFindOpen: vi.fn(),
  downloadsOpen: false,
  onToggleDownloads: vi.fn(),
  historyOpen: false,
  onToggleHistory: vi.fn(),
  muted: false,
  onToggleMute: vi.fn(),
  dockMode: 'bottom' as const,
  onSetDockMode: vi.fn()
};

function renderBar(locale: string): string {
  const store = new Map<string, string>([['lastbrowser.locale', locale]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); }
  });
  return renderToStaticMarkup(
    React.createElement(DesktopI18nProvider, null, React.createElement(InPageActionBar, barProps))
  );
}

describe('tab action bar locale', () => {
  it('keeps German dock and tooltip copy on de', () => {
    const copy = actionBarCopy('de');
    expect(copy.dock.sidebar).toBe('Seitenmenü (Links)');
    expect(copy.mute).toBe('Tab stummschalten (Ctrl+M)');
    const markup = renderBar('de');
    expect(markup).toContain('Auf Seite suchen (Ctrl+F)');
    expect(markup).toContain('Verlauf');
    expect(markup).toContain('Tab stummschalten (Ctrl+M)');
    expect(markup).toContain('Andock-Position ändern (Unten (Zentriert))');
    expect(markup).toContain('Zusammenfassen');
    expect(markup).not.toContain('Verlauf / Chronik');
    expect(markup).not.toContain('Seite zusammenfassen (Nova AI)');
  });

  it('uses English dock and tooltip copy on en', () => {
    const copy = actionBarCopy('en');
    expect(copy.dock.sidebar).toBe('Side menu (left)');
    expect(copy.unmute).toBe('Unmute tab (Ctrl+M)');
    const markup = renderBar('en');
    expect(markup).toContain('Find in page (Ctrl+F)');
    expect(markup).toContain('History');
    expect(markup).toContain('Mute tab (Ctrl+M)');
    expect(markup).toContain('Change dock position (Bottom (centered))');
    expect(markup).toContain('Reset zoom to 100% (Ctrl+0)');
    expect(markup).toContain('Hold and drag freely');
    expect(markup).toContain('Summarize');
    expect(markup).not.toContain('Seitenmenü');
    expect(markup).not.toContain('Auf Seite suchen');
    expect(markup).not.toContain('Tab stummschalten');
  });
});

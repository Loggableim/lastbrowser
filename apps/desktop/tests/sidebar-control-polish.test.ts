import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PinnedAppGrid } from '../src/renderer/components/PinnedAppGrid.js';
import { DesktopI18nProvider, desktopLocaleIds, desktopLocaleOverrides, desktopLocaleStorageKey } from '../src/renderer/i18n.js';

const renderer = resolve(process.cwd(), 'src/renderer');
const sidebar = readFileSync(resolve(renderer, 'components/SidekickSidebar.tsx'), 'utf8');
const pinnedApps = readFileSync(resolve(renderer, 'components/PinnedAppGrid.tsx'), 'utf8');
const css = readFileSync(resolve(renderer, 'styles.css'), 'utf8');

describe('sidebar close and pinned-app controls', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['en', 'PINNED APPS'],
    ['ja', 'ピン留めアプリ'],
  ])('renders the pinned-app heading in %s', (locale, heading) => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === desktopLocaleStorageKey ? locale : null,
    });
    const html = renderToStaticMarkup(createElement(DesktopI18nProvider, {
      children: createElement(PinnedAppGrid, { layout: 'grid', apps: [], onOpenApp: () => {} }),
    }));

    const headingId = html.match(/role="region" aria-labelledby="([^"]+)"/)?.[1];
    expect(headingId).toBeTruthy();
    expect(html).toContain(`<span id="${headingId}" class="pinned-grid-title">${heading}</span>`);
  });

  it('keeps close as an accessible button and prevents row activation from its keyboard event', () => {
    expect(sidebar).toMatch(/className="vtab-close-btn"[\s\S]*?aria-label=\{t\('sidebar\.tabs\.close'\)\}[\s\S]*?onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onCloseTab\(tab\.id\)/);
    expect(css).toMatch(/\.vertical-tab-item:hover \.vtab-close-btn,[\s\S]*?\.vertical-tab-item:focus-within \.vtab-close-btn\s*\{\s*opacity:\s*1;/);
    expect(css).toMatch(/\.vtab-close-btn\s*\{[\s\S]*?width:\s*26px;[\s\S]*?height:\s*26px;[\s\S]*?color:\s*rgba\(232,\s*242,\s*255,\s*0\.86\)/);
    expect(css).toContain('.vtab-close-btn:focus-visible');
  });

  it('gives both pinned-app add entry points the same localized action and keyboard focus', () => {
    expect(pinnedApps.match(/onClick=\{onAddApp\}/g)).toHaveLength(3);
    expect(pinnedApps.match(/t\('sidebar\.pinnedApps\.add'\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(css).toContain('.pinned-grid-quick-add:focus-visible');
    for (const locale of desktopLocaleIds) {
      expect(desktopLocaleOverrides[locale]['sidebar.pinnedApps.add'], `${locale} add label`).toBeTruthy();
      expect(desktopLocaleOverrides[locale]['sidebar.pinnedApps.addShort'], `${locale} short label`).toBeTruthy();
    }
  });
});

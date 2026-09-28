import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShellRail, getShellRailLabels } from '../src/renderer/components/ShellRail.js';
import { DesktopI18nProvider, createDesktopI18n, desktopLocaleStorageKey } from '../src/renderer/i18n.js';
import { panelLabelTranslationKey } from '../src/renderer/shell-state.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function renderRail(locale: 'de' | 'ru'): string {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([[desktopLocaleStorageKey, locale]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    }
  });

  try {
    return renderToStaticMarkup(React.createElement(
      DesktopI18nProvider,
      null,
      React.createElement(ShellRail, {
        activePanel: 'tasks',
        leftCollapsed: false,
        installedSidebarApps: [],
        onPanel: () => undefined,
        onToggleLeft: () => undefined
      })
    ));
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

describe('localized shell navigation', () => {
  it('provides i18n context to the app shell before rendering translated panel titles', () => {
    const appSource = readFileSync(resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    const wrapper = appSource.slice(appSource.indexOf('export function App(): JSX.Element {'), appSource.indexOf('function AppContent(): JSX.Element {'));
    const content = appSource.slice(appSource.indexOf('function AppContent(): JSX.Element {'), appSource.indexOf('function BrowserMain('));

    expect(wrapper).toContain('<DesktopI18nProvider>');
    expect(wrapper).toContain('<AppContent />');
    expect(content).toContain('const { t } = useDesktopI18n();');
    expect(content).toContain('{t(panelLabelTranslationKey(activePanel))}');
  });

  it.each([
    ['de', 'Aufgaben', 'Lastbrowser-Navigation', 'Seitenleiste ein- oder ausblenden'],
    ['ru', 'Задачи', 'Навигация Lastbrowser', 'Переключить боковую панель']
  ] as const)('renders translated labels, title and ARIA name for %s', (locale, taskLabel, navigationLabel, toggleLabel) => {
    const markup = renderRail(locale);
    expect(markup).toContain(`aria-label="${navigationLabel}"`);
    expect(markup).toContain(`aria-label="${taskLabel}"`);
    expect(markup).toContain(`title="${taskLabel}"`);
    expect(markup).toContain(`>${taskLabel}</span>`);
    expect(markup).toContain(`aria-label="${toggleLabel}"`);
    expect(markup).toContain(`title="${toggleLabel}"`);
  });

  it.each([
    ['de', 'Aufgaben'],
    ['ru', 'Задачи']
  ] as const)('uses the same translated panel label in the collapsed hover flyout for %s', (locale, expected) => {
    const source = readFileSync(resolve(__dirname, '../src/renderer/components/ShellRail.tsx'), 'utf8');
    const labels = getShellRailLabels(createDesktopI18n(locale).t, 'tasks');

    expect(labels).toEqual({ label: expected, ariaLabel: expected, title: expected, hoverLabel: expected });
    expect(source).toContain('onMouseEnter={(event) => showHoverLabel(event, labels.hoverLabel)}');
    expect(source).toContain('role="tooltip"');
    expect(source).toMatch(/>\s*\{hoverLabel\.text\}\s*<\/div>/);
  });

  it('maps every visible panel to an existing localized catalog key', () => {
    const source = readFileSync(resolve(__dirname, '../src/renderer/shell-state.ts'), 'utf8');
    expect(source).toContain("workspaces: 'panel.spaces'");
    expect(source).toContain("browser: 'sidebar.items.browser.title'");
    expect(source).toContain("terminal: 'sidebar.items.terminal.title'");
    expect(panelLabelTranslationKey('workspaces')).toBe('panel.spaces');
    const appSource = readFileSync(resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    const contextSidebarSource = readFileSync(resolve(__dirname, '../src/renderer/components/ContextSidebar.tsx'), 'utf8');
    expect(appSource).toContain('t(panelLabelTranslationKey(activePanel))');
    expect(contextSidebarSource).toContain('t(panelLabelTranslationKey(panel.id))');
  });
});

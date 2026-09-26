import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesktopI18n, desktopLocaleIds } from '../src/renderer/i18n.js';

describe('Settings language switch', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8');

  it('updates the live React catalog and persists the selected language', () => {
    expect(source).toContain('const { t, locale, setLocale } = useDesktopI18n();');
    expect(source).toContain("updateDraftField('language', event.target.value);");
    expect(source).toContain('setLocale(event.target.value);');
    expect(source).not.toContain('window.lastbrowser?.i18n?.setLocale?.(event.target.value)');
  });

  it('localizes the default-browser action feedback in every shipped language', () => {
    for (const locale of desktopLocaleIds) {
      const i18n = createDesktopI18n(locale);
      expect(i18n.t('settings.panels.preferences.defaultBrowserOpened')).not.toBe('Default Browser Opened');
      expect(i18n.t('settings.panels.preferences.defaultBrowserError')).not.toBe('Default Browser Error');
    }
    expect(source).toContain("showToast(t('settings.panels.preferences.defaultBrowserOpened'))");
    expect(source).toContain("showToast(t('settings.panels.preferences.defaultBrowserError'))");
  });
});

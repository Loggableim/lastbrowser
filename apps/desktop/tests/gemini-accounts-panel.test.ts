import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { desktopLocaleCatalogs } from '../src/renderer/i18n.js';

describe('Gemini consumer subscription migration notice', () => {
  it('provides only migration links, with no login, install, status, or subscription connector action', () => {
    const source = readFileSync(new URL('../src/renderer/panels/GeminiAccountsPanel.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('startOAuth(');
    expect(source).not.toContain('pollOAuth(');
    expect(source).not.toContain('gemini-cli-acp');
    expect(source).toContain('https://antigravity.google/docs/cli/gcli-migration');
    expect(source).toContain('https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/');
  });

  it('localizes the date, affected consumer tiers, enterprise exception, migration, and separate API-key route', () => {
    for (const catalog of Object.values(desktopLocaleCatalogs)) {
      expect(catalog['settings.panels.providers.geminiSubscriptionMigration']).toContain('2026');
      expect(catalog['settings.panels.providers.geminiSubscriptionMigration']).toContain('Antigravity');
      expect(catalog['settings.panels.providers.geminiSubscriptionApiKey']).toBeTruthy();
      expect(catalog['settings.panels.providers.geminiSubscriptionDocs']).toBeTruthy();
    }
    expect(desktopLocaleCatalogs.en['settings.panels.providers.geminiSubscriptionMigration']).toContain('Google AI Pro and Ultra');
    expect(desktopLocaleCatalogs.en['settings.panels.providers.geminiSubscriptionMigration']).toContain('Standard and Enterprise');
    expect(desktopLocaleCatalogs.en['settings.panels.providers.geminiSubscriptionMigration']).toContain('no longer serves individual/free accounts');
  });
});

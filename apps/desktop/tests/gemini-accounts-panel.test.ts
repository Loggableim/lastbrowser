import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { desktopLocaleCatalogs, desktopLocaleOverrides } from '../src/renderer/i18n.js';

describe('Antigravity multi-account panel', () => {
  it('wires the functional OAuth flow: start, poll, list, and remove accounts', () => {
    const source = readFileSync(new URL('../src/renderer/panels/GeminiAccountsPanel.tsx', import.meta.url), 'utf8');
    // The panel is functional again: it starts the backend OAuth flow and
    // polls for completion instead of only showing migration links.
    expect(source).toContain("startOAuth({ provider: 'antigravity' })");
    expect(source).toContain('pollOAuth(flowId)');
    expect(source).toContain('/api/antigravity/accounts');
    expect(source).toContain('action: \'remove\'');
    // The migration guide link is retained for reference.
    expect(source).toContain('https://antigravity.google/docs/');
  });

  it('keeps the migration notice localized for the retired consumer tier', () => {
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

  it('localizes the new Antigravity account-management strings in all 7 locales', () => {
    const keys = [
      'settings.panels.providers.antigravityRoundRobinHint',
      'settings.panels.providers.antigravityAddAccount',
      'settings.panels.providers.antigravityEmptyHint',
      'settings.panels.providers.antigravityStarting',
      'settings.panels.providers.antigravityWaiting'
    ] as const;
    for (const catalog of Object.values(desktopLocaleCatalogs)) {
      for (const key of keys) {
        expect(catalog[key], `${key} missing in a locale`).toBeTruthy();
      }
    }
    // The raw overrides must carry them too (parity test contract).
    for (const overrides of Object.values(desktopLocaleOverrides)) {
      for (const key of keys) {
        expect(overrides[key], `${key} missing in raw overrides`).toBeTruthy();
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { desktopLocaleCatalogs, desktopLocaleOverrides } from '../src/renderer/i18n.js';
import { createAntigravityAuthUrlOpener } from '../src/renderer/panels/antigravity-auth-flow.js';

describe('Antigravity multi-account panel', () => {
  it('wires the functional OAuth flow: start, poll, list, and remove accounts', () => {
    const source = readFileSync(new URL('../src/renderer/panels/GeminiAccountsPanel.tsx', import.meta.url), 'utf8');
    // The panel is functional again: it starts the backend OAuth flow and
    // polls for completion instead of only showing migration links.
    expect(source).toContain("startOAuth({ provider: 'antigravity' })");
    expect(source).toContain('pollOAuth(flowId)');
    expect(source).toContain('openAuthUrlOnce((poll as { auth_url?: string }).auth_url)');
    expect(source).toContain('/api/antigravity/accounts');
    expect(source).toContain('action: \'remove\'');
    // The migration guide link is retained for reference.
    expect(source).toContain('https://antigravity.google/docs/');
  });

  it('opens the browser once when auth_url first appears in a pending poll', async () => {
    const openExternal = vi.fn(async (_url: string) => undefined);
    const flowMessages: string[] = [];
    const onOpened = vi.fn(() => flowMessages.push('waiting'));
    const openAuthUrlOnce = createAntigravityAuthUrlOpener(openExternal, onOpened);
    const startResponse: { flow_id: string; auth_url?: string } = { flow_id: 'flow-1' };

    openAuthUrlOnce(startResponse.auth_url);
    const firstPoll = { status: 'pending', auth_url: 'https://accounts.google.com/o/oauth2/v2/auth?state=test' };
    openAuthUrlOnce(firstPoll.auth_url);
    flowMessages.push('OAuth timed out');
    await Promise.resolve();
    await Promise.resolve();

    // Subsequent polls may keep returning the pending auth_url. Do not open
    // another tab for the same flow.
    openAuthUrlOnce(firstPoll.auth_url);
    openAuthUrlOnce(undefined);

    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(firstPoll.auth_url);
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(flowMessages.at(-1)).toBe('OAuth timed out');
  });

  it('reports a failed system-browser launch and retries the same auth URL', async () => {
    const openExternal = vi.fn()
      .mockRejectedValueOnce(new Error('IPC unavailable'))
      .mockResolvedValueOnce(undefined);
    const onOpened = vi.fn();
    const onOpenFailed = vi.fn();
    const openAuthUrlOnce = createAntigravityAuthUrlOpener(openExternal, onOpened, onOpenFailed);
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=test';

    openAuthUrlOnce(authUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));
    openAuthUrlOnce(authUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(onOpenFailed).toHaveBeenCalledTimes(1);
    expect(onOpened).toHaveBeenCalledTimes(2);
  });

  it('treats a resolved false browser-launch result as failure and allows retry', async () => {
    const openExternal = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const onOpened = vi.fn();
    const onOpenFailed = vi.fn();
    const openAuthUrlOnce = createAntigravityAuthUrlOpener(openExternal, onOpened, onOpenFailed);
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=test';

    openAuthUrlOnce(authUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));
    openAuthUrlOnce(authUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(onOpenFailed).toHaveBeenCalledTimes(1);
    expect(onOpened).toHaveBeenCalledTimes(2);
  });

  it('keeps the OAuth poll alive after a temporary system-browser launch failure', () => {
    const source = readFileSync(new URL('../src/renderer/panels/GeminiAccountsPanel.tsx', import.meta.url), 'utf8');
    const openFailedBody = source.match(
      /\(\) => \{\s*if \(flowFinished\) return;([\s\S]*?)\n\s*\}\n\s*\);/
    )?.[1] || '';

    expect(openFailedBody).toContain("setFlowMessage(`✗ ${t('settings.panels.providers.connectionError')}`)");
    expect(openFailedBody).not.toMatch(/flowFinished\s*=\s*true|clearInterval|cancelOAuth|setFlowBusy\(false\)/);

    // A subsequent successful poll replaces the transient launch error with
    // the connected account, clearing the error state from the visible panel.
    expect(source).toContain("setFlowMessage(email ? `✓ ${email}` : '✓')");
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

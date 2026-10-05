import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CapabilityCatalog, IndependentScope, ResolvedAssistantScope } from '../src/renderer/independent-contracts.js';
import { DesktopI18nProvider, desktopLocaleIds, desktopLocaleOverrides } from '../src/renderer/i18n.js';
import { UrlOnlyPluginBrowserAccess } from '../src/renderer/components/IndependentConnections.js';
import { IndependentAssistantClient } from '../src/renderer/independent-assistant-client.js';
import { isSafePluginStartUrl, openPluginBrowserCapability, type PluginBrowserContext } from '../src/renderer/plugin-browser-navigation.js';

const scope = (): IndependentScope => ({ backendProfileId: randomUUID(), spaceId: randomUUID(), browserProfileId: 'default' });

function context(s: IndependentScope, selectionRevision = 1): PluginBrowserContext {
  const selection: ResolvedAssistantScope = {
    schemaVersion: 1, scope: s, spaceName: 'Research', workspacePath: null,
    bindingRevision: 4, setupStatus: 'confirmed', backendProfileName: 'default'
  };
  return {
    selection, selectionRevision, activeBrowserProfileId: 'default', activeWorkspacePath: null,
    activeBackendProfileName: 'default', selectionPathMatchesActive: true,
    requestScope: { profile: 'default', workspacePath: null, backendProfileName: 'default' }
  };
}

function catalog(s: IndependentScope, startUrl = 'https://example.invalid/app'): CapabilityCatalog {
  return {
    schemaVersion: 1, scope: s, observedAt: '2026-10-05T12:00:00Z', entries: [{
      schemaVersion: 1, capabilityId: 'plugin:url-only', scope: s, title: 'URL only', startUrl,
      supportedTasks: [], connectionKind: 'connector', status: 'restricted', evidenceKind: 'configuration',
      connections: [{ connectionId: 'plugin:url-only', revision: 1, status: 'configured',
        configurationStatus: 'configured', authenticationStatus: 'unknown', healthStatus: 'unknown',
        installed: true, adapterAvailable: false,
        setupActions: [{ kind: 'settings', availability: 'unavailable', reasonCode: 'scoped_adapter_unavailable' }] }]
    }]
  };
}

describe('A31 URL-only plugin browser access', () => {
  it('renders explicit browser access and no API or permission controls', () => {
    const s = scope();
    const html = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null,
      React.createElement(UrlOnlyPluginBrowserAccess, { capability: catalog(s).entries[0], scope: s, onOpen: async () => true })));
    expect(desktopLocaleIds.some(locale => html.includes(desktopLocaleOverrides[locale]['spaceAssistant.browserAccess']))).toBe(true);
    expect(desktopLocaleIds.some(locale => html.includes(desktopLocaleOverrides[locale]['spaceAssistant.openPluginBrowser']))).toBe(true);
    expect(html).not.toContain('checkbox');
    expect(html).not.toContain('Bind');
  });

  it('does not render the browser affordance for API-capable or non-plugin entries', () => {
    const s = scope();
    const entry = catalog(s).entries[0];
    for (const capability of [
      { ...entry, capabilityId: 'mcp:url-only' },
      { ...entry, supportedTasks: ['browser.account.use'] },
      { ...entry, connectionKind: 'browser_account' as const },
      { ...entry, startUrl: 'javascript:alert(1)' }
    ]) {
      expect(renderToStaticMarkup(React.createElement(DesktopI18nProvider, null,
        React.createElement(UrlOnlyPluginBrowserAccess, { capability, scope: s })))).toBe('');
    }
  });

  it('opens only a fresh matching URL for the currently selected complete Space scope', async () => {
    const s = scope(), current = { value: context(s) }, openTab = vi.fn();
    const result = await openPluginBrowserCapability({
      scope: s, capabilityId: 'plugin:url-only', startUrl: 'https://example.invalid/app',
      getContext: () => current.value, refreshCatalog: async () => ({ ok: true, value: catalog(s) }), openTab
    });
    expect(result).toBe(true);
    expect(openTab).toHaveBeenCalledExactlyOnceWith('https://example.invalid/app');
  });

  it('does not open an old capability after the active Space changes while refresh is pending', async () => {
    const a = scope(), b = scope(), current = { value: context(a) }, openTab = vi.fn();
    let complete!: (value: { ok: true; value: CapabilityCatalog }) => void;
    const pending = new Promise<{ ok: true; value: CapabilityCatalog }>(resolve => { complete = resolve; });
    const opening = openPluginBrowserCapability({
      scope: a, capabilityId: 'plugin:url-only', startUrl: 'https://example.invalid/app',
      getContext: () => current.value, refreshCatalog: async () => pending, openTab
    });
    current.value = context(b, 2);
    complete({ ok: true, value: catalog(a) });
    expect(await opening).toBe(false);
    expect(openTab).not.toHaveBeenCalled();
  });

  it('rejects URL credentials, unsafe schemes, and a changed fresh catalog target', async () => {
    for (const value of ['javascript:alert(1)', 'file:///private', 'https://user:pass@example.invalid', 'https://@example.invalid',
      'https://example.invalid/?access_token=secret', 'https://example.invalid/?auth-token=secret', 'https://example.invalid/#token=secret']) {
      expect(isSafePluginStartUrl(value)).toBe(false);
    }
    expect(isSafePluginStartUrl('https://example.invalid/app')).toBe(true);
    const s = scope(), openTab = vi.fn(), refreshCatalog = vi.fn(async () => ({ ok: true as const, value: catalog(s, 'https://other.invalid/') }));
    const result = await openPluginBrowserCapability({
      scope: s, capabilityId: 'plugin:url-only', startUrl: 'https://example.invalid/app',
      getContext: () => context(s), refreshCatalog, openTab
    });
    expect(result).toBe(false);
    expect(openTab).not.toHaveBeenCalled();
  });

  it('rejects unsafe start URLs received from the capability API contract', async () => {
    const s = scope();
    const client = new IndependentAssistantClient({ request: async () => ({ ok: true, value: catalog(s, 'javascript:alert(1)') }) });
    const result = await client.request({ schemaVersion: 1, operation: 'capabilities', scope: s, payload: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_response');
  });
});

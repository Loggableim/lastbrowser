import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProviderWorkspace, providerWorkspaceTabForKey } from '../src/renderer/components/ProviderWorkspace.js';

describe('ProviderWorkspace', () => {
  it('renders a real provider list and an accessible, connection-first tablist', () => {
    const markup = renderToStaticMarkup(React.createElement(ProviderWorkspace, {
      providers: [{ id: 'openai-codex', label: 'OpenAI Codex', mark: '⌘' }, { id: 'local-ai', label: 'Local AI', mark: '⌂' }],
      initialProviderId: 'openai-codex', scopeKey: 'profile-a', providerListLabel: 'Providers', tabsAriaLabel: 'Provider settings',
      emptyMessage: 'No providers', tabLabels: { connection: 'Connection', models: 'Models', chat: 'Chat default' },
      panel: (provider, tab) => React.createElement('p', null, `${provider.label}: ${tab}`)
    }));

    expect(markup).toContain('aria-label="Providers"');
    expect(markup).toContain('OpenAI Codex');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('Connection');
  });

  it('supports roving tab keyboard controls', () => {
    expect(providerWorkspaceTabForKey('ArrowRight', 'connection')).toBe('models');
    expect(providerWorkspaceTabForKey('ArrowLeft', 'connection')).toBe('chat');
    expect(providerWorkspaceTabForKey('Home', 'chat')).toBe('connection');
    expect(providerWorkspaceTabForKey('End', 'connection')).toBe('chat');
    expect(providerWorkspaceTabForKey('Escape', 'connection')).toBeNull();
  });
});

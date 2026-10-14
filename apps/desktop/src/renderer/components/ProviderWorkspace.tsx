import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import './provider-workspace.css';

export type ProviderWorkspaceTab = 'connection' | 'models' | 'chat';

export type ProviderWorkspaceItem = {
  id: string;
  label: string;
  mark: ReactNode;
  color?: string;
  detail?: string;
};

export const PROVIDER_WORKSPACE_TABS: ProviderWorkspaceTab[] = ['connection', 'models', 'chat'];

export function providerWorkspaceTabForKey(key: string, current: ProviderWorkspaceTab): ProviderWorkspaceTab | null {
  const index = PROVIDER_WORKSPACE_TABS.indexOf(current);
  if (key === 'ArrowRight') return PROVIDER_WORKSPACE_TABS[(index + 1) % PROVIDER_WORKSPACE_TABS.length];
  if (key === 'ArrowLeft') return PROVIDER_WORKSPACE_TABS[(index + PROVIDER_WORKSPACE_TABS.length - 1) % PROVIDER_WORKSPACE_TABS.length];
  if (key === 'Home') return PROVIDER_WORKSPACE_TABS[0];
  if (key === 'End') return PROVIDER_WORKSPACE_TABS[PROVIDER_WORKSPACE_TABS.length - 1];
  return null;
}

export function ProviderWorkspace({
  providers,
  initialProviderId,
  scopeKey,
  providerListLabel,
  tabsAriaLabel,
  emptyMessage,
  tabLabels,
  panel,
  footer,
  navigation
}: {
  providers: ProviderWorkspaceItem[];
  initialProviderId: string;
  scopeKey: string;
  providerListLabel: string;
  tabsAriaLabel: string;
  emptyMessage: string;
  tabLabels: Record<ProviderWorkspaceTab, string>;
  panel: (provider: ProviderWorkspaceItem, tab: ProviderWorkspaceTab) => ReactNode;
  footer?: ReactNode;
  navigation?: ReactNode;
}): JSX.Element {
  const [selectedId, setSelectedId] = useState(initialProviderId);
  const [selectedTab, setSelectedTab] = useState<ProviderWorkspaceTab>('connection');
  const tabRefs = useRef<Partial<Record<ProviderWorkspaceTab, HTMLButtonElement | null>>>({});
  const selectedProvider = providers.find((provider) => provider.id === selectedId) || providers[0];

  useEffect(() => {
    setSelectedId(initialProviderId);
    setSelectedTab('connection');
  // A scope can render once with the previous profile's active provider while
  // its settings are still loading. Resync when that resolved provider arrives.
  }, [scopeKey, initialProviderId]);

  useEffect(() => {
    if (providers.some((provider) => provider.id === selectedId)) return;
    setSelectedId(initialProviderId && providers.some((provider) => provider.id === initialProviderId)
      ? initialProviderId : providers[0]?.id || '');
  }, [providers, selectedId, initialProviderId]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const next = providerWorkspaceTabForKey(event.key === 'ArrowDown' ? 'ArrowRight' : event.key === 'ArrowUp' ? 'ArrowLeft' : event.key, selectedTab);
    if (!next) return;
    event.preventDefault();
    setSelectedTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="provider-workspace" data-provider-scope={scopeKey}>
      <nav className="provider-workspace-list" aria-label={providerListLabel}>
        {navigation}
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className={`provider-workspace-item${provider.id === selectedProvider?.id ? ' active' : ''}`}
            aria-pressed={provider.id === selectedProvider?.id}
            onClick={() => setSelectedId(provider.id)}
          >
            <span className="provider-workspace-mark" style={provider.color ? { backgroundColor: provider.color } : undefined}>{provider.mark}</span>
            <span className="provider-workspace-item-copy">
              <strong>{provider.label}</strong>
              {provider.detail && <small>{provider.detail}</small>}
            </span>
          </button>
        ))}
        {selectedProvider && <div className="provider-workspace-tabs" role="tablist" aria-orientation="vertical" aria-label={tabsAriaLabel}>
          {PROVIDER_WORKSPACE_TABS.map((tab) => (
            <button
              key={tab}
              ref={(element) => { tabRefs.current[tab] = element; }}
              type="button"
              role="tab"
              id={`provider-workspace-tab-${tab}`}
              aria-selected={selectedTab === tab}
              aria-controls="provider-workspace-panel"
              tabIndex={selectedTab === tab ? 0 : -1}
              onClick={() => setSelectedTab(tab)}
              onKeyDown={handleTabKeyDown}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>}
      </nav>

      {selectedProvider ? <section className="provider-workspace-main" aria-label={selectedProvider.label}>
        <header className="provider-workspace-heading">
          <span className="provider-workspace-mark" style={selectedProvider.color ? { backgroundColor: selectedProvider.color } : undefined}>{selectedProvider.mark}</span>
          <h2>{selectedProvider.label}</h2>
        </header>
        <div className="provider-workspace-panel" role="tabpanel" id="provider-workspace-panel"
          aria-labelledby={`provider-workspace-tab-${selectedTab}`} tabIndex={0}>
          {panel(selectedProvider, selectedTab)}
        </div>
        {footer && <footer className="provider-workspace-footer">{footer}</footer>}
      </section> : <div className="provider-workspace-empty" role="status">{emptyMessage}</div>}
    </div>
  );
}

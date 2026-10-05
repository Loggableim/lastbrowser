import React, { useEffect, useRef, useState } from 'react';
import { useDesktopI18n } from '../i18n.js';
import type { IndependentAssistantController } from '../independent-assistant-controller.js';
import { independentBrowserConfirmationCopy } from '../i18n/independent-browser-copy.js';
import { BrowserAccountSetup } from './BrowserAccountSetup.js';
import { browserAccountCopy,browserAccountUseCopy } from '../i18n/browser-account-copy.js';
import { assistantScopeKey,newIndependentRequestId, type CapabilityCatalog, type CapabilityCatalogEntry,
  type CapabilityConnection, type ConnectionSetupFlow, type IndependentScope, type SpaceBindingsView } from '../independent-contracts.js';
import { isSafePluginStartUrl } from '../plugin-browser-navigation.js';

export function UrlOnlyPluginBrowserAccess({ capability, scope, onOpen, onUnavailable }: {
  capability: CapabilityCatalogEntry; scope: IndependentScope;
  onOpen?: (capabilityId: string, startUrl: string, scope: IndependentScope) => Promise<boolean>;
  onUnavailable?: () => void;
}): React.JSX.Element | null {
  const { t } = useDesktopI18n();
  if (!capability.capabilityId.startsWith('plugin:') || capability.connectionKind !== 'connector'
    || capability.status !== 'restricted' || capability.supportedTasks.length !== 0
    || !isSafePluginStartUrl(capability.startUrl)) return null;
  const startUrl = capability.startUrl;
  return <div className="space-assistant-card" data-testid="url-only-plugin-browser-access">
    <p>{t('spaceAssistant.browserAccess')}</p>
    <button type="button" data-testid="space-assistant-browser-access" disabled={!onOpen} onClick={() => {
      if (!onOpen) return;
      void onOpen(capability.capabilityId, startUrl, scope).then(opened => {
        if (!opened) onUnavailable?.();
      });
    }}>{t('spaceAssistant.openPluginBrowser')}</button>
  </div>;
}

export function IndependentConnections({ scope, controller, onOpenPluginBrowser, onOpenProviderSettings }: { scope: IndependentScope; controller: IndependentAssistantController;
  onOpenPluginBrowser?: (capabilityId: string, startUrl: string, scope: IndependentScope) => Promise<boolean>;
  onOpenProviderSettings?: () => void }): React.JSX.Element {
  const { t, locale } = useDesktopI18n();
  const [catalog, setCatalog] = useState<CapabilityCatalog | null>(null), [bindings, setBindings] = useState<SpaceBindingsView | null>(null);
  const [uses, setUses] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [flow, setFlow] = useState<ConnectionSetupFlow | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [apiKey, setApiKey] = useState(''), [baseUrl, setBaseUrl] = useState(''), [model, setModel] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const lock = useRef(false), current = useRef(true);
  const setupCard = useRef<HTMLElement>(null);
  const [retry, setRetry] = useState(0);
  async function refresh() {
    const [capabilities, binding] = await Promise.all([
      controller.request({ schemaVersion: 1, operation: 'capabilities', scope, payload: { refresh: true } }),
      controller.request({ schemaVersion: 1, operation: 'bindings', scope, payload: { action: 'list' } })
    ]);
    if (!current.current) return;
    if (capabilities.ok) setCatalog(capabilities.value); else setError(capabilities.error.message);
    if (binding.ok) setBindings(binding.value); else setError(binding.error.message);
  }
  useEffect(() => {
    if (!flow) return;
    setupCard.current?.scrollIntoView({ block: 'nearest' });
    setupCard.current?.querySelector<HTMLElement>('input,button')?.focus();
  }, [flow?.flowId]);
  useEffect(() => {
    current.current = true; void refresh();
    return () => { current.current = false; };
  }, [controller, retry]);
  useEffect(() => {
    if (!flow || !['starting', 'awaiting_user'].includes(flow.setupStatus)) return;
    const flowId = flow.flowId;
    let active = true, polling = false;
    async function poll() {
      if (polling) return; polling = true;
      try {
        const result = await controller.request({ schemaVersion: 1, operation: 'connectionSetup', scope, payload: { action: 'poll', flowId } });
        if (!active || !current.current) return;
        if (!result.ok) setError(result.error.message);
        else { setFlow(result.value); if (!['starting', 'awaiting_user'].includes(result.value.setupStatus)) void refresh(); }
      } finally { polling = false; }
    }
    const timer = setInterval(() => { void poll(); }, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [flow?.flowId, flow?.setupStatus, controller]);
  async function setup(connection: CapabilityConnection) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setApiKey(''); setBaseUrl(''); setModel('');
    try {
      const result = await controller.request({ schemaVersion: 1, operation: 'connectionSetup', scope, payload: {
        action: 'start', connectionId: connection.connectionId, clientRequestId: newIndependentRequestId()
      } });
      if (!current.current) return;
      if (result.ok) setFlow(result.value); else setError(result.error.message);
    } finally { lock.current = false; if (current.current) setBusy(false); }
  }
  async function configure(event: React.FormEvent) {
    event.preventDefault(); const next = flow?.nextStep;
    if (lock.current || next?.kind !== 'human_form') return;
    const configuration = { ...(apiKey ? { apiKey } : {}), ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}), ...(model.trim() ? { model: model.trim() } : {}) };
    if (!Object.keys(configuration).length) return;
    // Secret state is private to this mounted form. Never put it in a message,
    // localStorage, events or a retained request history.
    setApiKey(''); setBaseUrl(''); setModel(''); lock.current = true; setBusy(true); setError('');
    try {
      const result = await controller.request({ schemaVersion: 1, operation: 'connectionConfigure', scope, payload: {
        connectionId: next.connectionId, expectedConnectionRevision: next.expectedConnectionRevision, clientRequestId: newIndependentRequestId(), configuration
      } });
      if (!current.current) return;
      if (result.ok) { setFlow(null); await refresh(); }
      else setError(t('spaceAssistant.configurationFailed'));
    } finally { lock.current = false; if (current.current) setBusy(false); }
  }
  async function bind(capability: CapabilityCatalogEntry, connection: CapabilityConnection, revoke = false) {
    if (lock.current) return;
    const old = bindings?.connectionBindings?.find(row => row.capabilityId === capability.capabilityId && row.connectionId === connection.connectionId);
    const permittedUse = uses[`${capability.capabilityId}:${connection.connectionId}`] ?? old?.permittedUse ?? [];
    if (revoke && !old || !revoke && !permittedUse.length) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await controller.request({ schemaVersion: 1, operation: 'bindings', scope, payload: revoke && old
        ? { action: 'revoke', bindingId: old.bindingId, expectedRevision: old.revision, clientRequestId: newIndependentRequestId() }
        : { action: 'bind', capabilityId: capability.capabilityId, connectionId: connection.connectionId, permittedUse, expectedRevision: old?.revision ?? 0, clientRequestId: newIndependentRequestId() } });
      if (!current.current) return;
      if (result.ok) { setBindings(result.value); await controller.poll(scope); } else setError(result.error.message);
    } finally { lock.current = false; if (current.current) setBusy(false); }
  }
  const ongoing = flow && ['starting', 'awaiting_user'].includes(flow.setupStatus);
  const knownTask = { conversation: 'spaceAssistant.title', adaptive_interview: 'spaceAssistant.setup', agent_reasoning: 'spaceAssistant.definitions' } as const;
  function taskLabel(task: string) { return task==='browser.account.use'?browserAccountUseCopy[locale]:task === 'conversation' || task === 'adaptive_interview' || task === 'agent_reasoning' ? t(knownTask[task]) : task; }
  const isBound = (capability: CapabilityCatalogEntry, connection: CapabilityConnection) => Boolean(bindings?.connectionBindings?.some(row =>
    row.capabilityId === capability.capabilityId && row.connectionId === connection.connectionId && row.status !== 'revoked'));
  const configuredEntries = catalog?.entries.filter(capability => capability.connectionKind === 'browser_account'
    || ['configured', 'connected', 'reauth_required'].includes(capability.status)
    || capability.connections?.some(connection => ['configured', 'connected', 'reauth_required'].includes(connection.status)
      || connection.configurationStatus === 'configured' || isBound(capability, connection))) ?? [];
  const pluginEntries = catalog?.entries.filter(capability => capability.capabilityId.startsWith('plugin:')
    && capability.connectionKind === 'connector' && capability.status === 'restricted' && capability.supportedTasks.length === 0
    && isSafePluginStartUrl(capability.startUrl)) ?? [];
  const configuredIds = new Set(configuredEntries.map(capability => capability.capabilityId));
  const otherProviders = catalog?.entries.filter(capability => capability.connectionKind === 'provider' && !configuredIds.has(capability.capabilityId)) ?? [];
  const chosenProvider = otherProviders.find(capability => capability.capabilityId === selectedProvider);
  function compactCapability(capability: CapabilityCatalogEntry) {
    const title = capability.capabilityId === 'browser.account' ? browserAccountCopy(locale).title
      : capability.capabilityId === 'assistant.conversation' ? t('spaceAssistant.title') : capability.title || capability.capabilityId;
    return <article className="space-assistant-connection-summary" key={capability.capabilityId}>
      <div className="space-assistant-connection-summary-heading"><strong>{title}</strong><span>{t(`spaceAssistant.connection.${capability.status}`)}</span></div>
      {capability.connections?.map(connection => {
        const binding = bindings?.connectionBindings?.find(row => row.capabilityId === capability.capabilityId && row.connectionId === connection.connectionId && row.status !== 'revoked');
        return <div className="space-assistant-connection-summary-row" key={connection.connectionId}>
          <span>{connection.title || connection.providerId || connection.connectionId}</span>
          <span>{t(`spaceAssistant.connection.${connection.status}`)}</span>
          {binding && <span role="status">{t(`spaceAssistant.binding.${binding.status}`)}</span>}
          {binding && <button type="button" disabled={busy || binding.status === 'revoking'} onClick={() => void bind(capability, connection, true)}>{t('spaceAssistant.revoke')}</button>}
        </div>;
      })}
    </article>;
  }
  return <section aria-label={t('spaceAssistant.connections')} data-testid="space-assistant-connections">
    <h3>{t('spaceAssistant.connections')}</h3>
    {error && <p role="alert">{error}</p>}
    {!catalog && <p role="status">{t(error ? 'spaceAssistant.stale' : 'spaceAssistant.connecting')}</p>}
    {catalog && error && <p role="status">{t('spaceAssistant.stale')}</p>}
    {catalog && <time className="space-assistant-observed-at" dateTime={catalog.observedAt}>{t('spaceAssistant.observedAt', { time: new Date(catalog.observedAt).toLocaleString(locale) })}</time>}
    {catalog && !configuredEntries.length && !pluginEntries.length && <p>{t('spaceAssistant.noConfiguredConnections')}</p>}
    {configuredEntries.map(compactCapability)}
    {pluginEntries.map(capability => <article className="space-assistant-connection-summary" key={capability.capabilityId}>
      <strong>{capability.title || capability.capabilityId}</strong>
      <p className="space-assistant-note">{t('spaceAssistant.browserOnlyPlugin')}</p>
      <UrlOnlyPluginBrowserAccess capability={capability} scope={scope} onOpen={onOpenPluginBrowser}
        onUnavailable={() => { if (current.current) setError(t('spaceAssistant.stale')); }} />
    </article>)}
    {catalog && otherProviders.length > 0 && <div className="space-assistant-provider-picker" data-testid="space-assistant-provider-picker">
      <label htmlFor="space-assistant-other-provider">{t('spaceAssistant.otherProviders')}</label>
      <select id="space-assistant-other-provider" data-testid="space-assistant-provider-select" value={selectedProvider} onChange={event => setSelectedProvider(event.target.value)}>
        <option value="">{t('spaceAssistant.chooseProvider')}</option>
        {otherProviders.map(capability => <option key={capability.capabilityId} value={capability.capabilityId}>
          {capability.title || capability.capabilityId}{capability.connections?.[0]?.title ? ` · ${capability.connections[0].title}` : ''}
        </option>)}
      </select>
      {chosenProvider && <article className="space-assistant-connection-summary">
        <strong>{chosenProvider.title || chosenProvider.capabilityId}</strong><p>{t(`spaceAssistant.connection.${chosenProvider.status}`)}</p>
        {chosenProvider.connections?.map(connection => <div className="space-assistant-connection-summary-row" key={connection.connectionId}>
          <span>{connection.title || connection.providerId || connection.connectionId}</span><span>{t(`spaceAssistant.connection.${connection.status}`)}</span>
          {connection.adapterAvailable && connection.setupActions.some(action => action.availability === 'available')
            ? <button type="button" data-testid="space-assistant-connect-provider" disabled={busy || Boolean(ongoing)} onClick={() => void setup(connection)}>{t('spaceAssistant.setupConnection')}</button>
            : <button type="button" disabled={!onOpenProviderSettings} onClick={onOpenProviderSettings}>{t('spaceAssistant.connectInSettings')}</button>}
        </div>)}
      </article>}
    </div>}
    <details className="space-assistant-connections-advanced" data-testid="space-assistant-connection-details">
      <summary><span>{t('spaceAssistant.advancedConnectionDetails')}</span></summary>
      <p className="space-assistant-note">{t('spaceAssistant.connectionSeparation')}</p>
      <button type="button" disabled={busy} onClick={() => { setError(''); setRetry(value => value + 1); }}>{t('common.retry')}</button>
      {catalog && <time dateTime={catalog.observedAt}>{new Date(catalog.observedAt).toLocaleString(locale)}</time>}
    {catalog?.entries.map(capability => <article className="space-assistant-card" key={capability.capabilityId}>
      <strong>{capability.capabilityId==='browser.account'?browserAccountCopy(locale).title:capability.capabilityId === 'assistant.conversation' ? t('spaceAssistant.title') : capability.title || capability.capabilityId}</strong>
      <p>{t(`spaceAssistant.connection.${capability.status}`)}</p>
      {capability.connectionKind==='browser_account'&&<BrowserAccountSetup key={`${assistantScopeKey(scope)}:${capability.capabilityId}`} scope={scope} controller={controller} connections={capability.connections??[]} onChanged={()=>{void refresh();}}/>}
      {capability.connections?.map(connection => {
        const key = `${capability.capabilityId}:${connection.connectionId}`;
        const binding = bindings?.connectionBindings?.find(row => row.capabilityId === capability.capabilityId && row.connectionId === connection.connectionId);
        const selected = uses[key] ?? binding?.permittedUse ?? [];
        return <section className="space-assistant-card" key={connection.connectionId} data-connection-id={connection.connectionId}>
          <strong>{connection.title || connection.providerId || connection.connectionId}</strong><p>{t(`spaceAssistant.connection.${connection.status}`)}</p>
          <p className="space-assistant-note">{t(connection.installed ? 'spaceAssistant.installed' : 'spaceAssistant.notInstalled')} · {connection.authenticationStatus==='user_confirmed'?independentBrowserConfirmationCopy[locale]:t(`spaceAssistant.authentication.${connection.authenticationStatus}`)}</p>
          <p className="space-assistant-note">{t('spaceAssistant.healthUnverified')}</p>
          {!connection.adapterAvailable && <p>{t('spaceAssistant.adapterUnavailable')}</p>}
          {!!connection.setupActions.length && <button type="button" disabled={busy || Boolean(ongoing) || !connection.adapterAvailable || connection.setupActions.every(action => action.availability !== 'available')}
            onClick={() => void setup(connection)}>{t('spaceAssistant.setupConnection')}</button>}
          {capability.supportedTasks.map(task => <label className="space-interview-option" key={task}><input type="checkbox" disabled={busy || !connection.adapterAvailable}
            checked={selected.includes(task)} onChange={() => setUses(previous => ({ ...previous, [key]: selected.includes(task) ? selected.filter(item => item !== task) : [...selected, task] }))} /><span>{taskLabel(task)}</span></label>)}
          <div className="space-assistant-controls"><button type="button" disabled={busy || !connection.adapterAvailable || !['configured', 'connected'].includes(connection.status) || !selected.length}
            onClick={() => void bind(capability, connection)}>{t('spaceAssistant.bind')}</button>
            {binding && binding.status !== 'revoked' && <button type="button" disabled={busy || binding.status === 'revoking'} onClick={() => void bind(capability, connection, true)}>{t('spaceAssistant.revoke')}</button>}</div>
          {binding && <p>{t(`spaceAssistant.binding.${binding.status}`)}</p>}
        </section>;
      })}
    </article>)}
    </details>
    {flow && <section ref={setupCard} className="space-assistant-card" aria-label={t('spaceAssistant.setupConnection')}>
      <strong>{flow.providerId || flow.connectionId}</strong><p role="status">{t(`spaceAssistant.setup.${flow.setupStatus}`)}</p>
      {flow.nextStep?.kind === 'oauth' && flow.nextStep.authorizationUrl && <button type="button" onClick={() => {
        const next = flow.nextStep; if (next?.kind === 'oauth' && next.authorizationUrl) void window.lastbrowser.system.openExternal(next.authorizationUrl);
      }}>{t('spaceAssistant.openSignIn')}</button>}
      {flow.nextStep?.kind === 'human_form' && <form data-testid="independent-connection-form" onSubmit={event => void configure(event)}><fieldset disabled={busy}>
        <p>{t('spaceAssistant.privateCredentials')}</p>
        {flow.nextStep.fields.includes('apiKey') && <label className="space-assistant-field"><span>{t('spaceAssistant.apiKey')}</span><input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} /></label>}
        {flow.nextStep.fields.includes('baseUrl') && <label className="space-assistant-field"><span>{t('spaceAssistant.endpoint')}</span><input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} /></label>}
        {flow.nextStep.fields.includes('model') && <label className="space-assistant-field"><span>{t('spaceAssistant.model')}</span><input value={model} onChange={event => setModel(event.target.value)} /></label>}
        <button type="submit" disabled={!apiKey && !baseUrl.trim() && !model.trim()}>{t('spaceAssistant.configureConnection')}</button>
      </fieldset></form>}
      {flow.nextStep?.kind === 'settings' && <p>{t('spaceAssistant.scopedSettingsRequired')}</p>}
      {ongoing && <button type="button" onClick={() => { void controller.request({ schemaVersion: 1, operation: 'connectionSetup', scope, payload: { action: 'cancel', flowId: flow.flowId } })
        .then(result => { if (!current.current) return; if (result.ok) setFlow(result.value); else setError(result.error.message); }); }}>{t('spaceAssistant.cancelSetup')}</button>}
    </section>}
  </section>;
}

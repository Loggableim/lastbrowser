import React, { useEffect, useRef, useState } from 'react';
import { useDesktopI18n } from '../i18n.js';
import type { IndependentAssistantController } from '../independent-assistant-controller.js';
import { assistantScopeKey, newIndependentRequestId, type ActivitySnapshot, type AgentDefinitionView, type DefinitionBudget,
  type CapabilityBinding, type DefinitionDraft, type IndependentScope, type PermissionView, type ScopedModelSelection } from '../independent-contracts.js';
import { qualifyModelForProvider, resolveLiteralCatalogModelSelection } from '../provider-model-selection.js';

const defaultBudget: DefinitionBudget = { maxToolCalls: 50, maxProviderRequests: 20, maxActiveSeconds: 900, maxMeasuredTokens: 100000,
  maxSafeReadRetries: 2, providerTimeoutSeconds: 120, toolTimeoutSeconds: 30 };
const noPermissions = { browserOrigins: [], networkOrigins: [], connectorBindings: [], allowedWorkspaceRoots: [], allowedEffects: [], rawCdp: false, terminal: false, desktop: false } as const;
export function IndependentDefinitions({ scope, controller, activity, onOpenWorkChat }: {
  scope: IndependentScope; controller: IndependentAssistantController; activity?: ActivitySnapshot | null;
  onOpenWorkChat: (sessionId: string, scope: IndependentScope) => void;
}): React.JSX.Element {
  const { t, locale } = useDesktopI18n();
  const [definitions, setDefinitions] = useState<readonly AgentDefinitionView[]>([]);
  const [schedules, setSchedules] = useState<readonly Readonly<{ definitionId: string; definitionRevision: number; nextRunAt: string | null; enabled: boolean }>[]>([]);
  const [models, setModels] = useState<ScopedModelSelection | null>(null);
  const [permissions, setPermissions] = useState<PermissionView | null>(null);
  const [connections, setConnections] = useState<readonly CapabilityBinding[]>([]), [selectedConnections, setSelectedConnections] = useState<readonly string[]>([]);
  const [editing, setEditing] = useState<AgentDefinitionView | null>(null);
  const [title, setTitle] = useState(''), [instruction, setInstruction] = useState(''), [desiredResult, setDesiredResult] = useState('');
  const [modelChoice, setModelChoice] = useState('');
  const [budget, setBudget] = useState<DefinitionBudget>(defaultBudget);
  const [rights, setRights] = useState<DefinitionDraft['permissionScope']>(noPermissions);
  const [enabled, setEnabled] = useState(true), [scheduled, setScheduled] = useState(false), [cron, setCron] = useState('');
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [catchUp, setCatchUp] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), view = useRef(assistantScopeKey(scope)); view.current = assistantScopeKey(scope);
  const [retry, setRetry] = useState(0);
  const scopeKey = assistantScopeKey(scope);
  useEffect(() => {
    let current = true;
    setDefinitions([]); setSchedules([]); setModels(null); setPermissions(null); setEditing(null); setTitle(''); setInstruction(''); setDesiredResult('');
    setBudget(defaultBudget); setRights(noPermissions); setConnections([]); setSelectedConnections([]); setEnabled(true); setScheduled(false); setCron(''); setError('');
    void Promise.all([
      controller.request({ schemaVersion: 1, operation: 'definitions', scope, payload: { action: 'list' } }),
      controller.request({ schemaVersion: 1, operation: 'modelSelection', scope, payload: { action: 'get' } }),
      controller.request({ schemaVersion: 1, operation: 'permissions', scope, payload: {} }),
      controller.request({ schemaVersion: 1, operation: 'bindings', scope, payload: { action: 'list' } })
    ]).then(([list, catalogue, grants, bindings]) => {
      if (!current) return;
      if (list.ok && 'definitions' in list.value) { setDefinitions(list.value.definitions); setSchedules(list.value.schedules); }
      else if (!list.ok) setError(list.error.message);
      if (catalogue.ok) { setModels(catalogue.value); setModelChoice(qualifyModelForProvider(catalogue.value.model, catalogue.value.provider)); }
      else setError(catalogue.error.message);
      if (grants.ok) setPermissions(grants.value);
      else setError(grants.error.message);
      if (bindings.ok) setConnections(bindings.value.connectionBindings ?? []);
      else setError(bindings.error.message);
    });
    return () => { current = false; };
  }, [scopeKey, controller, retry]);
  useEffect(() => {
    let current = true, reading = false;
    async function refreshDefinitions() {
      if (reading) return; reading = true;
      try {
        const result = await controller.request({ schemaVersion: 1, operation: 'definitions', scope, payload: { action: 'list' } });
        if (!current) return;
        if (result.ok && 'definitions' in result.value) { setDefinitions(result.value.definitions); setSchedules(result.value.schedules); }
        else if (!result.ok) setError(result.error.message);
      } finally { reading = false; }
    }
    const timer = setInterval(() => { void refreshDefinitions(); }, 5000);
    return () => { current = false; clearInterval(timer); };
  }, [scopeKey, controller]);
  function edit(definition: AgentDefinitionView) {
    setEditing(definition); setTitle(definition.title); setInstruction(definition.instruction); setDesiredResult(definition.desiredResult ?? '');
    setModelChoice(qualifyModelForProvider(definition.provider.model, definition.provider.provider)); setBudget(definition.budget);
    setRights(definition.permissionScope); setEnabled(definition.enabled); setScheduled(Boolean(definition.schedule));
    setSelectedConnections(definition.connectionBindings.flatMap(connection => connection.bindingId ? [connection.bindingId] : []));
    setCron(definition.schedule?.cronExpression ?? ''); setTimezone(definition.schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
    setCatchUp(definition.schedule?.missedPolicy === 'one_catch_up'); setError('');
  }
  function toggleRight(key: keyof Pick<PermissionView, 'browserOrigins' | 'networkOrigins' | 'allowedWorkspaceRoots' | 'connectorBindings' | 'allowedEffects'>, value: string) {
    if (key === 'allowedEffects') {
      const effect = permissions?.allowedEffects.find(item => item === value); if (!effect) return;
      setRights(previous => ({ ...previous, allowedEffects: previous.allowedEffects.includes(effect) ? previous.allowedEffects.filter(item => item !== effect) : [...previous.allowedEffects, effect] }));
    } else setRights(previous => ({ ...previous, [key]: previous[key].includes(value) ? previous[key].filter(item => item !== value) : [...previous[key], value] }));
  }
  async function refreshProjection(captured: string) {
    const result = await controller.request({ schemaVersion: 1, operation: 'definitions', scope, payload: { action: 'list' } });
    if (view.current !== captured) return;
    if (result.ok && 'definitions' in result.value) { setDefinitions(result.value.definitions); setSchedules(result.value.schedules); }
    else if (!result.ok) setError(result.error.message);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || !models || !permissions) return;
    const independentGroups = models.groups?.filter(group => group.configured).map(group => ({ providerId: group.provider_id,
      models: [...group.models, ...(group.extra_models ?? [])].filter(model => model.supportsIndependent) })) ?? [];
    const provider = resolveLiteralCatalogModelSelection(modelChoice, independentGroups);
    if (!provider?.model) { setError(t('spaceAssistant.notReady')); return; }
    const draft: DefinitionDraft = { ...(editing ? { definitionId: editing.definitionId } : {}), title: title.trim(), instruction: instruction.trim(), desiredResult: desiredResult.trim() || null,
      provider: { model: provider.model, provider: provider.provider ?? '' }, permissionScope: rights, budget,
      connectionBindings: connections.flatMap(connection => connection.status === 'active' && connection.connectionId && connection.connectionKind
        && connection.connectionRevision && selectedConnections.includes(connection.bindingId)
        ? [{ connectionId: connection.connectionId, capabilityId: connection.capabilityId, kind: connection.connectionKind,
          revision: connection.revision, bindingId: connection.bindingId, connectionRevision: connection.connectionRevision }] : []), enabled,
      schedule: scheduled ? { cronExpression: cron.trim(), timezone: timezone.trim(), gapPolicy: 'skip', foldPolicy: 'first', missedPolicy: catchUp ? 'one_catch_up' : 'skip', revision: editing?.schedule?.revision ?? 1 } : null };
    // The complete instruction remains in the definition. Its source message is
    // a bounded description of this explicit form submission, never a model turn.
    const userIntent = `${t('spaceAssistant.saveDefinition')}: ${draft.title}\n${draft.instruction.slice(0, 30000)}\n${t('spaceAssistant.desiredResult')}: ${(draft.desiredResult ?? '').slice(0, 15000)}\n${t('spaceAssistant.model')}: ${provider.provider ?? ''} / ${provider.model}\n${t('spaceAssistant.schedule')}: ${scheduled ? `${cron} (${timezone}); ${catchUp ? 'one_catch_up' : 'skip'}` : t('spaceAssistant.manualStart')}`.slice(0, 64000);
    const captured = scopeKey; lock.current = true; setBusy(true); setError('');
    try {
      const result = await controller.request({ schemaVersion: 1, operation: 'definitions', scope, payload: { action: 'save', draft,
        expectedRevision: editing?.revision ?? null, clientRequestId: newIndependentRequestId(), userIntent } });
      if (view.current !== captured) return;
      if (!result.ok) setError(result.error.message);
      else if ('definition' in result.value) { const definition = result.value.definition; setDefinitions(previous => [definition, ...previous.filter(item => item.definitionId !== definition.definitionId)]); edit(definition); await controller.poll(scope); await refreshProjection(captured); }
    } finally { lock.current = false; if (view.current === captured) setBusy(false); }
  }
  async function control(definition: AgentDefinitionView, action: 'start' | 'disable') {
    if (lock.current || !permissions) return;
    const captured = scopeKey; lock.current = true; setBusy(true); setError('');
    try {
      const base = { definitionId: definition.definitionId, expectedRevision: definition.revision, clientRequestId: newIndependentRequestId() };
      const result = await controller.request({ schemaVersion: 1, operation: 'definitions', scope, payload: action === 'start'
        ? { ...base, action, expectedPermissionRevision: permissions.revision, userIntent: `${t('spaceAssistant.startDefinition')}: ${definition.title}\n${definition.instruction.slice(0, 30000)}` }
        : { ...base, action } });
      if (view.current !== captured) return;
      if (!result.ok) setError(result.error.message);
      else if ('definition' in result.value) { const changed = result.value.definition; setDefinitions(previous => previous.map(item => item.definitionId === changed.definitionId ? changed : item)); if (editing?.definitionId === changed.definitionId) edit(changed); }
      await controller.poll(scope);
      await refreshProjection(captured);
    } finally { lock.current = false; if (view.current === captured) setBusy(false); }
  }
  const budgetFields = [['maxToolCalls', 'spaceAssistant.toolBudget', 1, 10000], ['maxProviderRequests', 'spaceAssistant.requestBudget', 1, 10000],
    ['maxActiveSeconds', 'spaceAssistant.timeBudget', 1, 86400], ['maxMeasuredTokens', 'spaceAssistant.tokenBudget', 1, 10000000],
    ['maxSafeReadRetries', 'spaceAssistant.retryBudget', 0, 2], ['providerTimeoutSeconds', 'spaceAssistant.providerTimeout', 1, 120], ['toolTimeoutSeconds', 'spaceAssistant.toolTimeout', 1, 45]] as const;
  const rightLabels = { browserOrigins: 'spaceAssistant.browserSites', networkOrigins: 'spaceAssistant.networkSites', allowedWorkspaceRoots: 'spaceAssistant.workspaceRoots', connectorBindings: 'spaceAssistant.connections', allowedEffects: 'spaceAssistant.effects' } as const;
  return <section aria-label={t('spaceAssistant.definitions')}>
    <h3>{t('spaceAssistant.definitions')}</h3>
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{t('common.retry')}</button></div>}
    {definitions.map(definition => <article className="space-assistant-card" key={definition.definitionId} data-definition-id={definition.definitionId}>
      <strong dir="auto">{definition.title}</strong><p>{definition.provider.provider} · {definition.provider.model}</p>
      {definition.schedule && <p>{definition.schedule.cronExpression} · {definition.schedule.timezone}</p>}
      {definition.enabled && schedules.filter(schedule => schedule.definitionId === definition.definitionId && schedule.definitionRevision === definition.revision && schedule.enabled && schedule.nextRunAt)
        .map(schedule => <time key={schedule.definitionId} dateTime={schedule.nextRunAt!}>{new Date(schedule.nextRunAt!).toLocaleString(locale)}</time>)}
      <div className="space-assistant-controls"><button type="button" disabled={busy} onClick={() => edit(definition)}>{t('spaceAssistant.editDefinition')}</button>
        <button type="button" disabled={busy || !definition.enabled} onClick={() => void control(definition, 'start')}>{t('spaceAssistant.startDefinition')}</button>
        <button type="button" disabled={busy || !definition.enabled} onClick={() => void control(definition, 'disable')}>{t('spaceAssistant.disableDefinition')}</button></div>
      {activity?.runs.filter(run => run.definitionId === definition.definitionId && run.targetSessionId).map(run => <button type="button" key={run.runId} onClick={() => onOpenWorkChat(run.targetSessionId!, scope)}>{t('spaceAssistant.openChat')}</button>)}
    </article>)}
    <form data-testid="independent-definition-form" onSubmit={event => void save(event)}><fieldset disabled={busy || !models || !permissions}>
      <legend>{t(editing ? 'spaceAssistant.editDefinition' : 'spaceAssistant.newDefinition')}</legend>
      <label className="space-assistant-field"><span>{t('spaceAssistant.taskTitle')}</span><input required maxLength={500} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label className="space-assistant-field"><span>{t('spaceAssistant.instruction')}</span><textarea required maxLength={64000} dir="auto" value={instruction} onChange={event => setInstruction(event.target.value)} /></label>
      <label className="space-assistant-field"><span>{t('spaceAssistant.desiredResult')}</span><textarea maxLength={32000} dir="auto" value={desiredResult} onChange={event => setDesiredResult(event.target.value)} /></label>
      <label className="space-assistant-field"><span>{t('spaceAssistant.model')}</span><select required value={modelChoice} onChange={event => setModelChoice(event.target.value)}>
        <option value="">{t('spaceAssistant.notReady')}</option>
        {models?.groups?.filter(group => group.configured).map(group => <optgroup label={group.provider} key={group.provider_id || group.provider}>
          {[...group.models, ...(group.extra_models ?? [])].map(model => <option key={model.id} disabled={!model.supportsIndependent} value={qualifyModelForProvider(model.id, group.provider_id)}>{model.label}</option>)}
        </optgroup>)}</select></label>
      <details><summary>{t('spaceAssistant.budgets')}</summary>{budgetFields.map(([key, label, min, max]) => <label className="space-assistant-field" key={key}><span>{t(label)}</span>
        <input type="number" required min={min} max={max} step={1} value={budget[key]} onChange={event => setBudget(previous => ({ ...previous, [key]: Number(event.target.value) }))} /></label>)}</details>
      <details><summary>{t('spaceAssistant.definitionPermissions')}</summary><p>{t('spaceAssistant.onlyGranted')}</p>
        {(Object.keys(rightLabels) as Array<keyof typeof rightLabels>).map(key => <div key={key}><strong>{t(rightLabels[key])}</strong>
          {permissions?.[key].map(value => <label className="space-interview-option" key={value}><input type="checkbox" checked={rights[key].some(selected => selected === value)} onChange={() => toggleRight(key, value)} /><span>{value}</span></label>)}
        </div>)}</details>
      <details><summary>{t('spaceAssistant.connections')}</summary><p>{t('spaceAssistant.connectionSeparation')}</p>
        {connections.filter(connection => connection.status === 'active').map(connection => <label className="space-interview-option" key={connection.bindingId}>
          <input type="checkbox" disabled={!connection.connectionKind || !connection.connectionRevision} checked={selectedConnections.includes(connection.bindingId)}
            onChange={() => setSelectedConnections(previous => previous.includes(connection.bindingId) ? previous.filter(id => id !== connection.bindingId) : [...previous, connection.bindingId])} />
          <span>{connection.connectionId} · {connection.capabilityId}<small>{connection.permittedUse.join(', ')}</small></span>
        </label>)}
      </details>
      <label className="space-interview-option"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>{t('spaceAssistant.enabled')}</span></label>
      <label className="space-interview-option"><input type="checkbox" checked={scheduled} onChange={event => setScheduled(event.target.checked)} /><span>{t('spaceAssistant.schedule')}</span></label>
      {scheduled && <><label className="space-assistant-field"><span>{t('spaceAssistant.cron')}</span><input required maxLength={128} value={cron} placeholder="0 9 * * 1-5" onChange={event => setCron(event.target.value)} /></label>
        <label className="space-assistant-field"><span>{t('spaceAssistant.timezone')}</span><input required maxLength={128} value={timezone} onChange={event => setTimezone(event.target.value)} /></label>
        <label className="space-interview-option"><input type="checkbox" checked={catchUp} onChange={event => setCatchUp(event.target.checked)} /><span>{t('spaceAssistant.catchUp')}</span></label>
        <p className="space-assistant-note">{t('spaceAssistant.schedulePolicy')}</p></>}
      <button type="submit">{t('spaceAssistant.saveDefinition')}</button>
      {editing && <button type="button" onClick={() => { setEditing(null); setTitle(''); setInstruction(''); setDesiredResult(''); setRights(noPermissions); setSelectedConnections([]); setBudget(defaultBudget); setScheduled(false); }}>{t('spaceAssistant.newDefinition')}</button>}
    </fieldset></form>
  </section>;
}

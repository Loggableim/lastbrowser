import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Bot, RefreshCw, ChevronRight, Activity, MousePointer2, FileText, MessageCircle } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import { RichTextRenderer } from '../NativeRichText.js';
import { SpaceInterview } from './SpaceInterview.js';
import { IndependentDefinitions } from './IndependentDefinitions.js';
import { IndependentConnections } from './IndependentConnections.js';
import { IndependentRunClarification } from './IndependentRunClarification.js';
import { IndependentResetSection } from './IndependentResetSection.js';
import { IndependentRunProgress } from './IndependentRunProgress.js';
import { IndependentMessageControl } from './IndependentMessageControl.js';
import { IndependentApprovalCard } from './IndependentApprovalCard.js';
import { NativeChatBrowserView } from './NativeChatBrowserView.js';
import { independentBrowserSessionCopy } from '../i18n/independent-browser-copy.js';
import { IndependentAssistantController } from '../independent-assistant-controller.js';
import { assistantScopeKey, newIndependentRequestId, sameAssistantScope, type BrowserLeaseView, type BrowserPreview,
  type IndependentScope, type PermissionView, type ProfilePatch, type ResolvedAssistantScope, type RunView } from '../independent-contracts.js';
import { useSpaceAssistantStore } from '../stores/useSpaceAssistantStore.js';
import './independent-assistant.css';

export interface SpaceAssistantPanelProps {
  selection: ResolvedAssistantScope; controller: IndependentAssistantController;
  onClose: () => void; onOpenWorkChat: (sessionId: string, scope: IndependentScope) => void;
  onOpenPluginBrowser?: (capabilityId: string, startUrl: string, scope: IndependentScope) => Promise<boolean>;
  onSwitchToQuickChat?: () => void;
  onOpenGlobalOverview: () => void; onEnterSpace: () => void; onOpenProviderSettings: () => void;
  onSelectPageContext?: (kind: 'selection' | 'page') => Promise<readonly string[]>;
  beginSetup?: boolean;
  setupSeed?: ProfilePatch;
}
export function SpaceAssistantPanel({ selection, controller, onClose, onOpenWorkChat, onOpenPluginBrowser, onSwitchToQuickChat, onOpenGlobalOverview, onEnterSpace, onOpenProviderSettings, onSelectPageContext, beginSetup = false, setupSeed }: SpaceAssistantPanelProps): React.JSX.Element {
  const { t, locale } = useDesktopI18n(); const scope = selection.scope;
  const scopeKey = assistantScopeKey(scope);
  const entry = useSpaceAssistantStore(state => state.entries[assistantScopeKey(scope)]);
  const [setupExpanded, setSetupExpanded] = useState(beginSetup);
  const [setupVisitedScope, setSetupVisitedScope] = useState<string | null>(() => beginSetup ? scopeKey : null);
  const [activityExpanded, setActivityExpanded] = useState(() => Boolean(entry?.activity && (
    [...(entry.activity.approvals ?? []), ...(entry.activity.nativeApprovals ?? [])].some(item => item.state === 'pending')
    || entry.activity.clarificationQuestions?.length)));
  const [permissions, setPermissions] = useState<PermissionView | null>(null);
  const [origins, setOrigins] = useState('');
  const [allowWrite, setAllowWrite] = useState(false);
  const [preview, setPreview] = useState<BrowserPreview | null>(null);
  const [takeovers, setTakeovers] = useState<Readonly<Record<string, BrowserLeaseView>>>({});
  const [localError, setLocalError] = useState('');
  const selectedScope = useRef(scopeKey); selectedScope.current = scopeKey;
  const permissionRequest = useRef<string | null>(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  useEffect(() => {
    setSetupExpanded(beginSetup); setSetupVisitedScope(beginSetup ? scopeKey : null); setActivityExpanded(false);
    setPermissions(null); setOrigins(''); setAllowWrite(false); setPreview(null); setLocalError(''); setTakeovers({}); permissionRequest.current = null; setPermissionBusy(false);
    void controller.load(scope);
    const release = controller.observe(scope);
    return release;
  }, [scopeKey, controller]);
  const setupVisited = setupVisitedScope === scopeKey;
  useEffect(() => {
    if (!setupVisited) return;
    let current = true;
    void controller.request({ schemaVersion: 1, operation: 'permissions', scope, payload: {} }).then(permission => {
      if (!current || selectedScope.current !== scopeKey) return;
      if (permission.ok) { setPermissions(permission.value); setOrigins(permission.value.browserOrigins.join('\n')); setAllowWrite(permission.value.allowedEffects.includes('write')); }
    });
    return () => { current = false; };
  }, [scopeKey, setupVisited, controller]);
  const snapshot = entry?.snapshot; const activity = entry?.activity;
  const busy = entry?.busy ?? false;
  const active = activity?.runs.filter(run => !['completed', 'failed', 'cancelled', 'interrupted'].includes(run.state)) ?? [];
  const attentionCount = active.length + (activity?.activeChats.length ?? 0)
    + [...(activity?.approvals ?? []), ...(activity?.nativeApprovals ?? [])].filter(item => item.state === 'pending').length
    + (activity?.clarificationQuestions?.length ?? 0);
  const pendingApprovalCount = [...(activity?.approvals ?? []), ...(activity?.nativeApprovals ?? [])].filter(item => item.state === 'pending').length;
  useEffect(() => {
    // Real approvals and questions are actionable, so never leave them hidden
    // behind a collapsed activity disclosure.
    if (pendingApprovalCount || activity?.clarificationQuestions?.length) setActivityExpanded(true);
  }, [pendingApprovalCount, activity?.clarificationQuestions?.length]);
  async function send(event: React.FormEvent) { event.preventDefault(); if (entry?.composer.trim()) await controller.send(scope, entry.composer); }
  async function page(kind: 'selection' | 'page') {
    if (!onSelectPageContext) return;
    const captured = scopeKey;
    try { const refs = await onSelectPageContext(kind); if (selectedScope.current !== captured) return; await controller.send(scope, entry?.composer.trim() || (kind === 'selection' ? t('spaceAssistant.askSelection') : t('browser.actions.summarize')), refs); }
    catch { if (selectedScope.current === captured) setLocalError(t('spaceAssistant.stale')); }
  }
  async function changePermissions(action: 'grant' | 'revoke' | 'refresh') {
    if (!permissions || permissionRequest.current === scopeKey) return;
    const captured = scopeKey; permissionRequest.current = captured; setPermissionBusy(true); setLocalError('');
    try {
    const result = await controller.request({ schemaVersion: 1, operation: 'permissions', scope, payload: action === 'refresh' ? {} : {
      action, expectedRevision: permissions.revision, clientRequestId: newIndependentRequestId(),
      permissions: { browserOrigins: action === 'grant' ? origins.split('\n').map(origin => origin.trim()).filter(Boolean) : [],
        networkOrigins: permissions.networkOrigins, connectorBindings: permissions.connectorBindings, allowedWorkspaceRoots: permissions.allowedWorkspaceRoots,
        allowedEffects: action === 'grant' ? [...permissions.allowedEffects.filter(effect => !['read', 'write'].includes(effect)), 'read', ...(allowWrite ? ['write' as const] : [])] : [],
        rawCdp: false, terminal: false, desktop: false }
    } });
    if (selectedScope.current !== captured) return;
    if (result.ok) { setPermissions(result.value); setOrigins(result.value.browserOrigins.join('\n')); setAllowWrite(result.value.allowedEffects.includes('write')); await controller.poll(scope); }
    else setLocalError(result.error.message);
    } finally {
      if (permissionRequest.current === captured) permissionRequest.current = null;
      if (selectedScope.current === captured) setPermissionBusy(false);
    }
  }
  async function browser(run: RunView, action: 'openBrowser' | 'takeover') {
    const captured = scopeKey;
    const result = action === 'openBrowser'
      ? await controller.request({ schemaVersion: 1, operation: 'openBrowser', scope, payload: { runId: run.runId, clientRequestId: newIndependentRequestId() } })
      : await controller.request({ schemaVersion: 1, operation: 'takeover', scope, payload: { runId: run.runId, clientRequestId: newIndependentRequestId() } });
    if (selectedScope.current !== captured) return;
    if (!result.ok) { setLocalError(result.error.message); return; }
    if ('kind' in result.value) setPreview(result.value);
    else { const lease = result.value; setTakeovers(previous => ({ ...previous, [run.runId]: lease })); }
    await controller.poll(scope);
  }
  async function resumeBrowser(run: RunView) {
    const lease = takeovers[run.runId]; if (!lease) return;
    const captured = scopeKey;
    const result = await controller.request({ schemaVersion: 1, operation: 'resumeBrowser', scope, payload: {
      runId: run.runId, navigationEpoch: lease.navigationEpoch, permissionEpoch: lease.permissionEpoch, clientRequestId: newIndependentRequestId()
    } });
    if (selectedScope.current !== captured) return;
    if (result.ok) { setTakeovers(previous => { const next = { ...previous }; delete next[run.runId]; return next; }); await controller.poll(scope); }
    else setLocalError(result.error.message);
  }
  const messages = snapshot?.messages ?? [];
  const providerFailure = (code: string | null | undefined) => code === 'context_metadata_required' || code === 'provider_requires_broker_adapter' || code === 'main_model_context_unsupported';
  const errorCode = entry?.error?.code;
  const [connectionsExpanded, setConnectionsExpanded] = useState(false);
  useEffect(() => { setConnectionsExpanded(false); }, [scopeKey]);
  const openConnections = () => setConnectionsExpanded(true);
  const activityState = activity?.sourceState === 'live' ? t('spaceAssistant.live')
    : activity ? t('spaceAssistant.stale') : entry?.busy ? t('spaceAssistant.connecting') : t('spaceAssistant.activityUnavailable');
  return <aside className="copilot-split-view space-assistant" aria-label={`${t('spaceAssistant.title')}: ${selection.spaceName}`} data-testid="space-assistant-panel">
    <header className="space-assistant-header"><span className="space-assistant-mark"><Bot size={18} aria-hidden="true" /></span><div className="space-assistant-heading"><strong>{t('spaceAssistant.title')}</strong><span className="space-assistant-space-name" dir="auto">{selection.spaceName}</span>
      </div>
      {onSwitchToQuickChat && <button className="space-assistant-mode-switch" type="button" aria-label={t('spaceAssistant.switchToQuickChat')} title={t('spaceAssistant.switchToQuickChat')} onClick={onSwitchToQuickChat}><MessageCircle size={14} aria-hidden="true" />{t('spaceAssistant.switchToQuickChat')}</button>}
      <button type="button" aria-label={t('common.close')} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="space-assistant-scroll">
      <div className={`space-assistant-status ${snapshot?.providerReady ? 'is-configured' : activity ? 'is-stale' : ''}`} role="status" data-testid="space-assistant-compact-activity">
        <span className="space-assistant-status-dot" aria-hidden="true" />
        <span>{snapshot ? (snapshot.providerReady ? t('spaceAssistant.connection.configured') : t('spaceAssistant.notReady'))
          : entry?.error ? t('spaceAssistant.activityUnavailable') : t('spaceAssistant.connecting')}</span>
        <span className="space-assistant-status-separator" aria-hidden="true">·</span>
        <span className="space-assistant-status-activity">{activityState}</span>
        {attentionCount > 0 && <button type="button" className="space-assistant-attention" onClick={() => setActivityExpanded(true)}>
          {pendingApprovalCount ? t('spaceAssistant.pendingApprovals', { count: pendingApprovalCount }) : t('spaceAssistant.activeItems', { count: attentionCount })}
        </button>}
      </div>
      {snapshot && !snapshot.providerReady && <div className="space-assistant-not-ready"><span>{t('spaceAssistant.notReady')}</span><button type="button" onClick={onOpenProviderSettings}>{t('spaceAssistant.setupConnection')}</button></div>}
      {(entry?.error || localError) && <div role="alert" className="space-assistant-error"><p>{localError || (providerFailure(errorCode) ? t(`spaceAssistant.${errorCode}`) : entry?.error?.message)}</p>
        {providerFailure(errorCode) && snapshot?.providerReady !== false && <button type="button" onClick={onOpenProviderSettings}>{t('spaceAssistant.setupConnection')}</button>}
        <button type="button" onClick={() => void controller.load(scope)}><RefreshCw size={12} /> {t('common.retry')}</button></div>}
        {!messages.length && <div className="space-assistant-welcome"><span className="space-assistant-welcome-icon"><Bot size={24} aria-hidden="true" /></span><p>{t('spaceAssistant.intro')}</p></div>}
        {messages.map(message => <article key={message.id} className={`space-assistant-message ${message.role}`}>
          {message.controlResolution && message.controlResolution.kind !== 'conversation' && snapshot
            ? <IndependentMessageControl key={`${scopeKey}:${message.id}`} message={message} snapshot={snapshot} activity={activity} controller={controller} busy={busy}/>
            : <div dir="auto"><RichTextRenderer content={message.pending && entry?.streamingMessage?.turnId === message.turnId ? entry?.streamingMessage?.content ?? message.content : message.content} /></div>}
          {message.pending && <span role="status">{t('spaceAssistant.running')}</span>}
          {message.targetSessionId && <button type="button" onClick={() => onOpenWorkChat(message.targetSessionId!, scope)}>{t('spaceAssistant.openChat')}</button>}
        </article>)}
        <div className="space-assistant-quick-actions" aria-label={t('spaceAssistant.quickActions')}>
          <button type="button" disabled={busy || !snapshot} onClick={() => void controller.send(scope, t('spaceAssistant.statusQuestion'))}><Activity size={16} aria-hidden="true" />{t('spaceAssistant.statusQuestion')}</button>
        {onSelectPageContext && <div className="space-assistant-controls">
          <button type="button" disabled={busy} onClick={() => void page('selection')}><MousePointer2 size={16} aria-hidden="true" />{t('spaceAssistant.askSelection')}</button>
          <button type="button" disabled={busy} onClick={() => void page('page')}><FileText size={16} aria-hidden="true" />{t('browser.actions.summarize')}</button>
        </div>}
        </div>
      <details className="space-assistant-setup" data-testid="space-assistant-setup" open={setupExpanded} onToggle={event => {
        const open = event.currentTarget.open; setSetupExpanded(open); if (open) setSetupVisitedScope(scopeKey);
      }}>
        <summary><ChevronRight size={15} className="space-assistant-disclosure-icon" aria-hidden="true" />{t('spaceAssistant.setup')}</summary>
        {setupVisited && <>
        {snapshot?.interview ? <SpaceInterview state={snapshot.interview} busy={busy}
          onAnswer={answer => controller.answer(scope, answer)} onReview={() => controller.review(scope)}
          onContinue={() => controller.continueInterview(scope)} onConfirm={values => controller.confirm(scope, values)}
          onSkip={() => controller.skip(scope)} onEnterSpace={onEnterSpace} onContinueSetup={openConnections} />
          : <>{snapshot?.confirmedProfile && <section className="space-assistant-profile" aria-label={t('spaceAssistant.profile')}><h3>{t('spaceAssistant.profile')}</h3><dl>
              <dt>{t('spaceAssistant.purpose')}</dt><dd dir="auto">{snapshot.confirmedProfile.values.purpose??'—'}</dd>
              <dt>{t('spaceAssistant.help')}</dt><dd dir="auto">{snapshot.confirmedProfile.values.requestedHelp?.join(' · ')??'—'}</dd>
              <dt>{t('spaceAssistant.style')}</dt><dd dir="auto">{snapshot.confirmedProfile.values.workingStyle??'—'}</dd>
              <dt>{t('spaceAssistant.background')}</dt><dd dir="auto">{snapshot.confirmedProfile.values.backgroundPreferences??'—'}</dd>
            </dl></section>}
            {!snapshot?.confirmedProfile && <div className="space-assistant-setup-actions"><p>{t('spaceAssistant.setupHint')}</p><button data-testid="space-assistant-start-interview" type="button" disabled={busy || !snapshot} onClick={() => void controller.startInterview(scope, locale, setupSeed)}>{t('spaceAssistant.setup')}</button></div>}</>}
        <details className="space-assistant-advanced" data-testid="space-assistant-advanced">
          <summary><ChevronRight size={14} aria-hidden="true" />{t('spaceAssistant.advanced')}</summary>
        {permissions && <form data-testid="independent-browser-permissions" onSubmit={event => { event.preventDefault(); void changePermissions('grant'); }}><fieldset disabled={permissionBusy}>
          <legend>{t('spaceAssistant.browserPermissions')}</legend>
          <label className="space-assistant-field"><span>{t('spaceAssistant.browserSites')}</span><textarea value={origins} placeholder="https://example.com" onChange={event => setOrigins(event.target.value)} /></label>
          <label className="space-interview-option"><input type="checkbox" checked={allowWrite} onChange={event => setAllowWrite(event.target.checked)} /><span>{t('spaceAssistant.authorizeWrite')}</span></label>
          <div className="space-assistant-controls"><button type="submit">{t('spaceAssistant.saveBrowserPermissions')}</button>
            <button type="button" onClick={() => void changePermissions('refresh')}>{t('spaceAssistant.refreshPermissions')}</button>
            <button type="button" onClick={() => void changePermissions('revoke')}>{t('spaceAssistant.revokePermissions')}</button></div>
        </fieldset></form>}
        {snapshot && <IndependentResetSection key={scopeKey} scope={scope} revision={snapshot.revision} controller={controller} />}
          <IndependentDefinitions key={scopeKey} scope={scope} controller={controller} activity={activity} onOpenWorkChat={onOpenWorkChat} />
        </details>
        </>}
      </details>
      <IndependentConnections key={scopeKey} scope={scope} controller={controller} expanded={connectionsExpanded} onExpandedChange={setConnectionsExpanded} onOpenPluginBrowser={onOpenPluginBrowser} onOpenProviderSettings={onOpenProviderSettings} />
      <details className="space-assistant-activity" data-testid="space-assistant-activity" aria-label={`${t('spaceAssistant.activity')}: ${attentionCount}`} open={activityExpanded}
        onToggle={event => setActivityExpanded(event.currentTarget.open)}>
        <summary><ChevronRight size={15} className="space-assistant-disclosure-icon" aria-hidden="true" /><span>{t('spaceAssistant.activity')}</span>
          <span className="space-assistant-activity-count" aria-label={activity ? String(attentionCount) : t('spaceAssistant.activityUnavailable')}>{activity ? attentionCount : '—'}</span></summary>
        <div className="space-assistant-activity-content">
        {activity && <time dateTime={activity.observedAt}>{new Date(activity.observedAt).toLocaleString(locale)}</time>}
        {activity?.sourceState !== 'live' && <p role="status">{t('spaceAssistant.stale')}</p>}
        {activity && activity.nativeChatObservation?.sourceState !== 'live' && <p role="status">
          {t('spaceAssistant.nativeSourceIncomplete')}
          {activity.nativeChatObservation && <time dateTime={activity.nativeChatObservation.observedAt}> {new Date(activity.nativeChatObservation.observedAt).toLocaleString(locale)}</time>}
        </p>}
        {activity?.sourceState === 'live' && activity.nativeChatObservation?.sourceState === 'live'
          && !active.length && !activity.activeChats.length && <p>{t('spaceAssistant.noActivity')}</p>}
        {active.map(run => <article className="space-assistant-card" key={run.runId} data-run-id={run.runId}>
          <strong>{t(`spaceAssistant.${run.state}`)}</strong> <code>{run.runId.slice(0, 8)}</code>
          {run.reasonCode && <p>{providerFailure(run.reasonCode) ? t(`spaceAssistant.${run.reasonCode}`) : run.reasonCode}</p>}
          {providerFailure(run.reasonCode) && <button type="button" onClick={onOpenProviderSettings}>{t('spaceAssistant.setupConnection')}</button>}
          <time dateTime={run.updatedAt}>{new Date(run.updatedAt).toLocaleString(locale)}</time>
          {activity?.runProgress?.filter(progress=>progress.runId===run.runId).map(progress=><IndependentRunProgress key={progress.runId} progress={progress}/>) }
          {activity?.clarificationQuestions?.filter(question => question.runId === run.runId).map(question => <IndependentRunClarification key={question.questionIdentity} waiting={question} controller={controller} />)}
          {takeovers[run.runId]?.accountSource==='explicit_agent_login' && <p role="status">{independentBrowserSessionCopy[locale]}</p>}
          <div className="space-assistant-controls">
            {run.targetSessionId && <button type="button" onClick={() => onOpenWorkChat(run.targetSessionId!, scope)}>{t('spaceAssistant.openChat')}</button>}
            {!['completed', 'failed', 'cancelled', 'interrupted', 'cancelling'].includes(run.state) && <>
              <button type="button" disabled={run.state === 'pausing'} onClick={() => void controller.control(scope, run, run.state === 'paused' ? 'resume' : 'pause')}>{t(run.state === 'paused' ? 'spaceAssistant.resume' : 'spaceAssistant.pause')}</button>
              <button type="button" onClick={() => void controller.control(scope, run, 'cancel')}>{t('chat.stop')}</button>
              <button type="button" onClick={() => void browser(run, 'openBrowser')}>{t('spaceAssistant.browser')}</button>
              {takeovers[run.runId]?.visible && takeovers[run.runId]?.state === 'paused' ? <button type="button" onClick={() => void resumeBrowser(run)}>{t('spaceAssistant.resume')}</button>
                : <button type="button" disabled={run.state === 'pausing'} onClick={() => void browser(run, 'takeover')}>{t('spaceAssistant.takeover')}</button>}
            </>}
          </div>
        </article>)}
        {activity?.activeChats.map(chat => <article className="space-assistant-card" key={chat.sessionId}>
          <button type="button" onClick={() => onOpenWorkChat(chat.sessionId, scope)}>{t('spaceAssistant.openChat')}</button>
          <time dateTime={chat.observedAt}>{new Date(chat.observedAt).toLocaleString(locale)}</time>
          {chat.sourceActuality==='live'&&chat.activeStreamId&&<NativeChatBrowserView key={`${scopeKey}:${chat.sessionId}:${chat.activeStreamId}`}
            scope={scope} sessionId={chat.sessionId} streamId={chat.activeStreamId} observedAt={chat.observedAt} active={activity.sourceState==='live'} client={controller}/>}
        </article>)}
        {[...(activity?.approvals??[]),...(activity?.nativeApprovals??[])].filter(approval => ['pending','expired'].includes(approval.state)).map(approval => <IndependentApprovalCard key={approval.approvalId}
          approval={approval} controller={controller} spaceName={selection.spaceName} stale={activity?.sourceState!=='live'} onOpenChat={onOpenWorkChat} onRefresh={()=>controller.poll(scope)}/>)}
        {activity?.schedules.map(schedule => <p key={schedule.definitionId}>{schedule.definitionId.slice(0, 8)} · {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString(locale) : t('spaceAssistant.tasks')}</p>)}
        <button type="button" onClick={onOpenGlobalOverview}>{t('spaceAssistant.global')}</button>
        </div>
      </details>
      {preview && <figure><img src={`data:${preview.mimeType};base64,${preview.base64}`} alt={`${selection.spaceName}: ${t('spaceAssistant.browser')}`} /><figcaption>{new Date(preview.observedAt).toLocaleString(locale)}
        {preview.accountSource==='explicit_agent_login'&&<p>{independentBrowserSessionCopy[locale]}</p>}</figcaption></figure>}
    </div>
    <form className="space-assistant-composer" onSubmit={event => void send(event)}>
      <label className="sr-only" htmlFor="space-assistant-composer">{t('spaceAssistant.ask')}</label>
      <textarea id="space-assistant-composer" value={entry?.composer ?? ''} dir="auto" disabled={!snapshot}
        placeholder={t('spaceAssistant.ask')} onChange={event => useSpaceAssistantStore.getState().setComposer(scope, event.target.value)} />
      {busy && entry?.turnId ? <button type="button" onClick={() => void controller.cancelTurn(scope)}>{t('chat.stop')}</button>
        : <button type="submit" disabled={busy || !entry?.composer.trim()} aria-label={t('chat.send')}><Send size={16} /></button>}
    </form>
  </aside>;
}

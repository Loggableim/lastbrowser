import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import type { GlobalActivitySnapshot, GlobalActivitySpace, IndependentScope } from '../independent-contracts.js';
import { assistantScopeKey } from '../independent-contracts.js';
import type { IndependentAssistantController } from '../independent-assistant-controller.js';
import './independent-assistant.css';
import { IndependentRunClarification } from './IndependentRunClarification.js';
import { IndependentRunProgress } from './IndependentRunProgress.js';
import { IndependentApprovalCard } from './IndependentApprovalCard.js';

export interface IndependentActivityOverviewProps {
  scope: IndependentScope; controller: IndependentAssistantController; onClose: () => void;
  onOpenSpace: (space: GlobalActivitySpace, sessionId?: string) => Promise<void>;
}

/** A backend projection. Opening or closing this view never creates or controls a run. */
export function IndependentActivityOverview({ scope, controller, onClose, onOpenSpace }: IndependentActivityOverviewProps): React.JSX.Element {
  const { t, locale } = useDesktopI18n();
  const [snapshot, setSnapshot] = useState<GlobalActivitySnapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const refresh = useRef<() => Promise<void>>(async() => {});
  const scopeKey = assistantScopeKey(scope);
  useEffect(() => {
    let current = true, polling = false;
    const previousFocus = document.activeElement;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    setSnapshot(null); setUnavailable(false); setError('');
    async function load() {
      if (polling) return; polling = true;
      try {
        const result = await controller.request({ schemaVersion: 1, operation: 'globalActivity', scope, payload: {} });
        if (!current) return;
        if (result.ok) { setSnapshot(result.value); setUnavailable(false); }
        else setUnavailable(true);
      } finally { polling = false; }
    }
    refresh.current = load;
    void load(); const timer = setInterval(() => { void load(); }, 1000);
    return () => { current = false; clearInterval(timer); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, [scopeKey, controller]);
  async function open(space: GlobalActivitySpace, sessionId?: string) {
    if (opening) return; setOpening(true); setError('');
    try { await onOpenSpace(space, sessionId); }
    catch { setError(t('spaceAssistant.stale')); }
    finally { setOpening(false); }
  }
  function keyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className="space-assistant-overview-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="space-assistant space-assistant-overview" role="dialog" aria-modal="true" aria-labelledby="independent-overview-title" onKeyDown={keyboard}>
      <header className="space-assistant-header"><h2 id="independent-overview-title">{t('spaceAssistant.global')}</h2>
        <button type="button" onClick={onClose} aria-label={t('common.close')}><X size={18} /></button></header>
      <div className="space-assistant-scroll">
        {snapshot && <time dateTime={snapshot.observedAt}>{new Date(snapshot.observedAt).toLocaleString(locale)}</time>}
        {(!snapshot || unavailable) && <p role="status">{t(unavailable ? 'spaceAssistant.stale' : 'spaceAssistant.running')}</p>}
        {unavailable && <button type="button" onClick={() => refresh.current()}>{t('common.retry')}</button>}
        {error && <p role="alert">{error}</p>}
        {snapshot?.spaces.map(space => {
          const active = space.activity.runs.filter(run => !['completed', 'cancelled', 'failed', 'interrupted'].includes(run.state));
          return <section key={assistantScopeKey(space.scope)} className="space-assistant-card" aria-label={space.spaceName}>
            <h3 dir="auto">{space.spaceName}</h3>
            <time dateTime={space.activity.observedAt}>{new Date(space.activity.observedAt).toLocaleString(locale)}</time>
            {space.activity.sourceState !== 'live' && <p>{t('spaceAssistant.stale')}</p>}
            {space.activity.sourceState === 'live' && !active.length && !space.activity.activeChats.length&&![...space.activity.approvals,...(space.activity.nativeApprovals??[])].some(approval=>approval.state==='pending') && <p>{t('spaceAssistant.noActivity')}</p>}
            {active.map(run => <article key={run.runId}><strong>{t(`spaceAssistant.${run.state}`)}</strong><code> {run.runId.slice(0, 8)}</code>
              {run.targetSessionId && space.workspacePath !== undefined && <button type="button" disabled={opening} onClick={() => void open(space, run.targetSessionId!)}>{t('spaceAssistant.openChat')}</button>}
              {space.activity.runProgress?.filter(progress=>progress.runId===run.runId).map(progress=><IndependentRunProgress key={progress.runId} progress={progress}/>) }
              {space.activity.clarificationQuestions?.filter(question => question.runId === run.runId).map(question => <IndependentRunClarification key={question.questionIdentity} waiting={question} controller={controller} onAccepted={() => refresh.current()} />)}
            </article>)}
            {space.activity.activeChats.map(chat => <p key={chat.sessionId}>
              {space.workspacePath !== undefined ? <button type="button" disabled={opening} onClick={() => void open(space, chat.sessionId)}>{t('spaceAssistant.openChat')}</button> : <code>{chat.sessionId.slice(0, 8)}</code>}
            </p>)}
            {[...space.activity.approvals,...(space.activity.nativeApprovals??[])].filter(approval=>['pending','expired'].includes(approval.state)).map(approval=><IndependentApprovalCard key={approval.approvalId}
              approval={approval} controller={controller} spaceName={space.spaceName} stale={unavailable||space.activity.sourceState!=='live'} onRefresh={()=>refresh.current()}
              onOpenChat={space.workspacePath!==undefined?(sessionId)=>{void open(space,sessionId);}:undefined}/>)}
            {space.workspacePath !== undefined && <button type="button" disabled={opening} onClick={() => void open(space)}>{t('spaceAssistant.openSpace')}</button>}
          </section>;
        })}
        {snapshot && !unavailable && !snapshot.spaces.length && <p>{t('spaceAssistant.noActivity')}</p>}
      </div>
    </div>
  </div>;
}

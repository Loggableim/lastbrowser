import React, { useEffect,useRef, useState } from 'react';
import { captureCommandContext, type CommandAction, type CommandContext } from '../CommandActionContracts.js';
import { chatCommandCopy } from '../chat-command-copy.js';
import { isEditableGoalText, readPersistentGoalView } from '../persistent-goal-view.js';
import { readPersistentGoalStateError } from '../persistent-goal-state.js';
import { nativeGoalPausedReasonCopy } from '../native-goal-errors.js';
import './chat-command-controls.css';

export interface GoalControlsProps {
  session: unknown; context: CommandContext; locale: string;
  busy: boolean; pending?: boolean; available: boolean;
  editorOpenToken?: number;
  authoritativeRevision?:number;
  stateLoaded?:boolean;
  migrationRequired?:boolean;
  onDismissEmpty?: () => void;
  onAction: (action: CommandAction) => void;
}
export function shouldRenderPersistentGoalControls(session: unknown, context: CommandContext, editorViewKey: string | null,
  currentViewKey: string): boolean {
  const goal = readPersistentGoalView(session, context);
  return Boolean(goal && goal.status !== 'cleared') || editorViewKey === currentViewKey;
}
export function GoalControls({ session, context, locale, busy, pending = false, available, editorOpenToken, authoritativeRevision, stateLoaded=true, migrationRequired=false, onDismissEmpty, onAction }: GoalControlsProps): React.JSX.Element {
  const copy = chatCommandCopy(locale);
  const goal = readPersistentGoalView(session, context);
  const ownsSession = Boolean(session && typeof session === 'object' && 'session_id' in session
    && (session as { session_id: unknown }).session_id === context.sessionId);
  const error = ownsSession ? readPersistentGoalStateError(session) : null;
  const [editing, setEditing] = useState(Boolean(editorOpenToken));
  const [draft, setDraft] = useState(goal?.goal || '');
  const [detailsOpen, setDetailsOpen] = useState(Boolean(editorOpenToken));
  const editor=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(editing)editor.current?.focus();},[editing]);
  useEffect(() => { setEditing(false); setDraft(''); setDetailsOpen(false); }, [context.sessionId, context.profileId, context.spacePath, context.browserProfileId]);
  const runOwned = goal?.continuationOwner === 'independent_run';
  const revision=authoritativeRevision??goal?.revision;
  const actualRevision=typeof revision==='number'&&Number.isSafeInteger(revision)&&revision>=0?revision:(goal===null?0:undefined);
  const disabled = !available || pending || !stateLoaded || !context.sessionId || actualRevision===undefined || Boolean(runOwned) || Boolean(error);
  useEffect(() => {
    if (editorOpenToken && !disabled && !busy && !migrationRequired) { setDraft(goal?.goal || ''); setDetailsOpen(true); setEditing(true); }
  }, [editorOpenToken, disabled, busy, migrationRequired]);
  function openEditor(): void { setDraft(goal?.goal || ''); setDetailsOpen(true); setEditing(true); }
  function send(args: string): void {
    if (disabled || migrationRequired && args !== 'pause') return;
    onAction({ kind: 'goal_command', args, context: captureCommandContext(context), clientRequestId: crypto.randomUUID(),
      expectedRevision:actualRevision });
    setEditing(false);
  }
  return <section className="persistent-goal-controls" aria-label={copy.goal} aria-busy={!stateLoaded}>
    {error && <p role="alert">{error}</p>}
    {!available && <p role="status">{copy.unavailable}</p>}
    {goal ? <>
      <div className="persistent-goal-compact-row">
        <strong className="persistent-goal-title" title={goal.goal}>{goal.goal}</strong>
        <span className="persistent-goal-status">{copy[goal.status]}</span>
        {goal.status === 'active' && <button type="button" disabled={disabled} onClick={() => send('pause')}>{copy.pause}</button>}
        {goal.status === 'paused' && <button type="button" disabled={disabled || busy || migrationRequired} onClick={() => send('resume')}>{copy.resume}</button>}
        {(goal.status === 'done' || goal.status === 'cleared') && <button type="button" disabled={disabled || busy || migrationRequired} onClick={openEditor}>{copy.edit}</button>}
      </div>
      <details className="persistent-goal-details" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
        <summary>{copy.details}</summary>
        <p className="persistent-goal-objective">{goal.goal}</p>
        <p>{copy.revision}: {goal.revision ?? copy.unknown}</p>
        <p>{copy.turns}: {goal.turnsUsed ?? copy.unknown} / {goal.maxTurns === null ? copy.unlimited : goal.maxTurns ?? copy.unknown}</p>
        {(goal.pausedReason || goal.lastReason) && <p role="status">{nativeGoalPausedReasonCopy(locale,goal.pausedReason||goal.lastReason||'')}</p>}
        {goal.pendingJudge && <p role="status">{copy.pendingJudge}</p>}
        {runOwned && <p role="status">{copy.runOwned}</p>}
        <div className="persistent-goal-buttons">
          <button type="button" disabled={disabled || busy || migrationRequired} onClick={openEditor}>{copy.edit}</button>
          <button type="button" disabled={!available || pending || !context.sessionId}
            onClick={() => onAction({ kind: 'goal_command', args: 'status', context: captureCommandContext(context), clientRequestId: crypto.randomUUID() })}>{copy.refresh}</button>
          {(goal.status === 'active' || goal.status === 'paused') && <>
            <button type="button" disabled={disabled || migrationRequired} onClick={() => send('complete')}>{copy.completeAction}</button>
            <button type="button" disabled={disabled || migrationRequired} onClick={() => send('cancel')}>{copy.cancelAction}</button>
          </>}
        </div>
        {editing && <form onSubmit={event => { event.preventDefault(); if (isEditableGoalText(draft) && !busy && !migrationRequired) send(draft.trim()); }}>
          <textarea ref={editor} aria-label={copy.goalPlaceholder} placeholder={copy.goalPlaceholder} value={draft} maxLength={8000} onChange={event => setDraft(event.target.value)} />
          <button type="submit" disabled={disabled || busy || migrationRequired || !isEditableGoalText(draft)}>{copy.start}</button>
          <button type="button" aria-label={copy.clear} onClick={() => { setEditing(false); if (!goal || goal.status === 'cleared') onDismissEmpty?.(); }}>×</button>
        </form>}
      </details>
    </> : <>
      <div className="persistent-goal-heading"><strong>{copy.goal}</strong></div>
      {editing && <form onSubmit={event => { event.preventDefault(); if (isEditableGoalText(draft) && !busy && !migrationRequired) send(draft.trim()); }}>
        <textarea ref={editor} aria-label={copy.goalPlaceholder} placeholder={copy.goalPlaceholder} value={draft} maxLength={8000} onChange={event => setDraft(event.target.value)} />
        <button type="submit" disabled={disabled || busy || migrationRequired || !isEditableGoalText(draft)}>{copy.start}</button>
        <button type="button" aria-label={copy.clear} onClick={() => { setEditing(false); onDismissEmpty?.(); }}>×</button>
      </form>}
    </>}
  </section>;
}

import { useRef, useState } from 'react';
import { assistantScopeKey, newIndependentRequestId, type IndependentScope } from '../independent-contracts.js';

export type AssistantResetAction = 'clear_interview_history' | 'reset_assistant';
export type AssistantResetPreview = Readonly<{
  schemaVersion: 1; scope: IndependentScope; action: AssistantResetAction; expectedRevision: number;
  conversationId: string; previewDigest: string; removedInterviewMessages: number;
  removedConversationMessages: number; removedAnswerRecords: number; clearedCachedStates: number;
  removedProfileFields: readonly string[]; removedDraftFields: readonly string[]; preservedProfileFields: readonly string[]; confirmedProfileId: string | null;
  preservedSnapshotCount: number; preservedSnapshotEvidenceCount: number;
  preservedDefinitions: readonly Readonly<{ definitionId: string; title: string; revision: number; enabled: boolean; scheduled: boolean }>[];
  preservedRuns: readonly Readonly<{ runId: string; definitionId: string; state: string; stateRevision: number; controlEpoch: number }>[];
  preservedConnections: readonly Readonly<{ bindingId: string; connectionId: string; capabilityId: string; revision: number; status: string }>[];
  preservedSchedules: readonly Readonly<{ jobId: string; definitionId: string; enabled: boolean; nextRunAt: string | null }>[];
  permissionRevision: number; permissionControlEpoch: number; browserBindingRevision: number;
}>;
export type AssistantResetApply = Readonly<{
  mode: 'apply'; action: AssistantResetAction; expectedRevision: number; previewDigest: string; clientRequestId: string;
}>;
export type AssistantResetLabels = Readonly<{
  title: string; choose: string; clearInterview: string; resetAssistant: string; preview: string;
  confirm: string; busy: string; cancel: string; removed: string; preserved: string; interviewMessages: string;
  conversationMessages: string; answers: string; cachedStates: string; draftFields: string; currentProfileFields: string;
  keptProfileFields: string; snapshots: string; snapshotEvidence: string; definitions: string; runs: string;
  connections: string; schedules: string; unchangedAccess: string; noSecureErasure: string;
  empty: string; enabled: string; disabled: string; applied: string; failed: string; stalePreview: string;
  fieldNames: Readonly<Record<string, string>>; runStates: Readonly<Record<string, string>>;
}>;

type Props = {
  scope: IndependentScope; expectedRevision: number; labels: AssistantResetLabels;
  onPreview: (scope: IndependentScope, payload: Readonly<{ mode: 'preview'; action: AssistantResetAction; expectedRevision: number }>) => Promise<AssistantResetPreview>;
  onApply: (scope: IndependentScope, payload: AssistantResetApply) => Promise<void>;
};

/** Explicit review and apply; changing scope/revision abandons the old form. */
export function IndependentAssistantReset(props: Props): React.JSX.Element {
  return <ResetForm key={`${assistantScopeKey(props.scope)}:${props.expectedRevision}`} {...props} />;
}

function ResetForm({ scope, expectedRevision, labels, onPreview, onApply }: Props): React.JSX.Element {
  const [action, setAction] = useState<AssistantResetAction>('clear_interview_history');
  const [preview, setPreview] = useState<AssistantResetPreview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [applied, setApplied] = useState(false);
  const lock = useRef(false), retry = useRef<AssistantResetApply | null>(null);
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : labels.failed); }
    finally { lock.current = false; setBusy(false); }
  };
  const fields = (values: readonly string[]) => values.length ? values.map(value => labels.fieldNames[value] ?? value).join(', ') : labels.empty;
  return <section className="independent-assistant-reset" aria-busy={busy}>
    <h3>{labels.title}</h3>
    <label>{labels.choose}<select value={action} disabled={busy} onChange={event => {
      setAction(event.target.value as AssistantResetAction); setPreview(null); retry.current = null; setApplied(false); setError('');
    }}><option value="clear_interview_history">{labels.clearInterview}</option><option value="reset_assistant">{labels.resetAssistant}</option></select></label>
    <button type="button" disabled={busy} onClick={() => void run(async () => {
      const result = await onPreview(scope, { mode: 'preview', action, expectedRevision });
      if (result.schemaVersion !== 1 || assistantScopeKey(result.scope) !== assistantScopeKey(scope)
        || result.action !== action || result.expectedRevision !== expectedRevision || !/^[a-f0-9]{64}$/.test(result.previewDigest)) {
        throw new Error(labels.stalePreview);
      }
      setPreview(result); retry.current = null; setApplied(false);
    })}>{busy ? labels.busy : labels.preview}</button>
    {preview && <>
      <h4>{labels.removed}</h4>
      <ul><li>{labels.interviewMessages}: {preview.removedInterviewMessages}</li>
        <li>{labels.conversationMessages}: {preview.removedConversationMessages}</li><li>{labels.answers}: {preview.removedAnswerRecords}</li>
        <li>{labels.cachedStates}: {preview.clearedCachedStates}</li>
        <li>{labels.draftFields}: {fields(preview.removedDraftFields)}</li>
        <li>{labels.currentProfileFields}: {fields(preview.removedProfileFields)}</li>
      </ul>
      <h4>{labels.preserved}</h4>
      <p>{labels.keptProfileFields}: {fields(preview.preservedProfileFields)}</p>
      <p>{labels.snapshots}: {preview.preservedSnapshotCount} · {labels.snapshotEvidence}: {preview.preservedSnapshotEvidenceCount}</p>
      <p>{labels.unchangedAccess}</p>
      <h5>{labels.definitions}</h5><ul>{preview.preservedDefinitions.length ? preview.preservedDefinitions.map(item => <li key={item.definitionId}>{item.title} · {item.enabled ? labels.enabled : labels.disabled}</li>) : <li>{labels.empty}</li>}</ul>
      <h5>{labels.runs}</h5><ul>{preview.preservedRuns.length ? preview.preservedRuns.map(item => <li key={item.runId}>{preview.preservedDefinitions.find(def => def.definitionId === item.definitionId)?.title ?? item.runId} · {labels.runStates[item.state] ?? item.state}</li>) : <li>{labels.empty}</li>}</ul>
      <h5>{labels.connections}</h5><ul>{preview.preservedConnections.length ? preview.preservedConnections.map(item => <li key={item.bindingId}>{item.capabilityId} · {item.connectionId}</li>) : <li>{labels.empty}</li>}</ul>
      <h5>{labels.schedules}</h5><ul>{preview.preservedSchedules.length ? preview.preservedSchedules.map(item => <li key={item.jobId}>{preview.preservedDefinitions.find(def => def.definitionId === item.definitionId)?.title ?? item.jobId} · {item.enabled ? labels.enabled : labels.disabled}{item.nextRunAt ? ` · ${item.nextRunAt}` : ''}</li>) : <li>{labels.empty}</li>}</ul>
      <p>{labels.noSecureErasure}</p>
      <button type="button" disabled={busy} onClick={() => void run(async () => {
        const payload = retry.current ?? { mode: 'apply' as const, action: preview.action,
          expectedRevision: preview.expectedRevision, previewDigest: preview.previewDigest, clientRequestId: newIndependentRequestId() };
        retry.current = payload;
        await onApply(scope, payload); setPreview(null); setApplied(true);
      })}>{labels.confirm}</button>
      <button type="button" disabled={busy} onClick={() => { setPreview(null); retry.current = null; setError(''); }}>{labels.cancel}</button>
    </>}
    {error && <p role="alert">{error}</p>}{applied && <p role="status">{labels.applied}</p>}
  </section>;
}

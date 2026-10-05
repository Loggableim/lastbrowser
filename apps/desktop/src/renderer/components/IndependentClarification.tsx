import { useId, useRef, useState } from 'react';
import { assistantScopeKey, newIndependentRequestId, type IndependentScope } from '../independent-contracts.js';

export type IndependentWaitingQuestion = Readonly<{
  schemaVersion: 1; scope: IndependentScope; runId: string; questionIdentity: string;
  question: string; expectedRevision: number; controlEpoch: number;
}>;
export type IndependentAnswerSubmission = Readonly<{
  command: 'answer'; runId: string; questionIdentity: string; expectedRevision: number;
  controlEpoch: number; clientRequestId: string; answer: string;
}>;
export type ClarificationLabels = Readonly<{
  title: string; answer: string; submit: string; sending: string; sent: string; failed: string;
}>;

/** The owner supplies localized labels and a scope-bound, real API callback. */
export function IndependentClarification(props: {
  waiting: IndependentWaitingQuestion; labels: ClarificationLabels;
  onSubmit: (scope: IndependentScope, payload: IndependentAnswerSubmission) => Promise<void>;
}): React.JSX.Element {
  const key = `${assistantScopeKey(props.waiting.scope)}:${props.waiting.runId}:${props.waiting.questionIdentity}:${props.waiting.expectedRevision}:${props.waiting.controlEpoch}`;
  // Remount form state on any identity/revision change; old replies cannot
  // clear a newly displayed question or reuse its previous draft/request ID.
  return <ClarificationForm key={key} {...props} />;
}

function ClarificationForm({ waiting, labels, onSubmit }: {
  waiting: IndependentWaitingQuestion; labels: ClarificationLabels;
  onSubmit: (scope: IndependentScope, payload: IndependentAnswerSubmission) => Promise<void>;
}): React.JSX.Element {
  const id = useId();
  const [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [sent, setSent] = useState(false);
  const locked = useRef(false);
  const retry = useRef<IndependentAnswerSubmission | null>(null);
  return <form className="independent-clarification" aria-busy={busy} onSubmit={event => {
    event.preventDefault();
    if (locked.current || sent || !answer.trim() || answer.length > 16000) return;
    locked.current = true; setBusy(true); setError('');
    const submission = retry.current?.answer === answer ? retry.current : {
      command: 'answer' as const, runId: waiting.runId, questionIdentity: waiting.questionIdentity,
      expectedRevision: waiting.expectedRevision, controlEpoch: waiting.controlEpoch,
      clientRequestId: newIndependentRequestId(), answer,
    };
    retry.current = submission;
    void onSubmit(waiting.scope, submission).then(() => setSent(true)).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : labels.failed);
    }).finally(() => { locked.current = false; setBusy(false); });
  }}>
    <h4>{labels.title}</h4>
    <p style={{ whiteSpace: 'pre-wrap' }}>{waiting.question}</p>
    <label htmlFor={id}>{labels.answer}</label>
    <textarea id={id} value={answer} maxLength={16000} required disabled={busy || sent}
      onChange={event => setAnswer(event.target.value)} />
    <button type="submit" disabled={busy || sent || !answer.trim()}>{busy ? labels.sending : labels.submit}</button>
    {error && <p role="alert">{error}</p>}
    {sent && <p role="status">{labels.sent}</p>}
  </form>;
}

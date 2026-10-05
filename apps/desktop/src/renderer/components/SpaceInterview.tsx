import React, { useEffect, useState } from 'react';
import { useDesktopI18n } from '../i18n.js';
import type { AssistantSnapshot, IndependentResult, InterviewAnswerRecord, InterviewAnswerRequest, InterviewState, ProfilePatch } from '../independent-contracts.js';

type Result = Promise<IndependentResult<AssistantSnapshot>>;
export interface SpaceInterviewProps {
  state: InterviewState; busy: boolean;
  onAnswer: (answer: Omit<InterviewAnswerRequest, 'clientRequestId' | 'expectedRevision'>) => Result;
  onReview: () => Result; onContinue: () => Result; onConfirm: (values: ProfilePatch) => Result;
  onSkip: () => Result; onEnterSpace: () => void;
  onContinueSetup?: () => void;
}
export function SpaceInterview({ state, busy, onAnswer, onReview, onContinue, onConfirm, onSkip, onEnterSpace, onContinueSetup }: SpaceInterviewProps): React.JSX.Element {
  const { t } = useDesktopI18n();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [editing, setEditing] = useState<InterviewAnswerRecord | null>(null);
  const [values, setValues] = useState<ProfilePatch>(state.draft);
  useEffect(() => { setSelected([]); setFreeText(''); setEditing(null); }, [state.questionId]);
  useEffect(() => { setValues(state.draft); }, [state.revision, state.draft]);
  const replaced = new Set(state.answers.flatMap(answer => answer.replacesAnswerId ? [answer.replacesAnswerId] : []));
  const answers = state.answers.filter(answer => !replaced.has(answer.answerId));
  const question = editing?.question ?? state.question;
  const questionId = editing?.questionId ?? state.questionId;
  const reviewing = state.stage === 'review' && !editing;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!questionId || busy || (!selected.length && !freeText.trim())) return;
    const result = await onAnswer({ questionId, selectedOptionIds: selected, freeText: freeText.trim() || null, replacesAnswerId: editing?.answerId ?? null });
    if (result.ok) { setSelected([]); setFreeText(''); setEditing(null); }
  }
  function correct(answer: InterviewAnswerRecord) {
    setEditing(answer); setSelected(answer.selectedOptionIds); setFreeText(answer.freeText ?? '');
  }
  const profileFields = [
    ['purpose', 'spaceAssistant.purpose'], ['requestedHelp', 'spaceAssistant.help'], ['workingStyle', 'spaceAssistant.style'], ['backgroundPreferences', 'spaceAssistant.background']
  ] as const;
  const topicKeys = { purpose: 'spaceAssistant.purpose', help: 'spaceAssistant.help', style: 'spaceAssistant.style', context: 'spaceAssistant.context', connections: 'spaceAssistant.connections', background_work: 'spaceAssistant.background' } as const;
  return <section className="space-interview" aria-label={t('spaceAssistant.setup')}>
    {state.manualFallback && <p role="status" className="space-assistant-note">{t('spaceAssistant.manual')}</p>}
    {reviewing ? <>
      <h3>{t('spaceAssistant.review')}</h3>
      {state.review && <p className="space-assistant-prose" dir="auto">{state.review.summary}</p>}
      {!!state.review?.missingTopics.length && <p className="space-assistant-note">{t('spaceAssistant.unresolved')}: {state.review.missingTopics.map(topic => t(topicKeys[topic])).join(', ')}</p>}
      {profileFields.map(([key, label]) => <label className="space-assistant-field" key={key}>
        <span>{t(label)}</span>
        <textarea value={key === 'requestedHelp' ? (values.requestedHelp ?? []).join('\n') : values[key] ?? ''}
          disabled={busy} dir="auto" onChange={event => setValues(previous => ({ ...previous,
            [key]: key === 'requestedHelp' ? event.target.value.split('\n').filter(line => line.trim()) : event.target.value }))} />
      </label>)}
      <p className="space-assistant-note">{t('spaceAssistant.noPermission')}</p>
      <div className="space-assistant-controls">
        <button type="button" disabled={busy} onClick={() => void onConfirm(values)}>{t('spaceAssistant.confirm')}</button>
        <button type="button" disabled={busy} onClick={() => void onContinue()}>{t('spaceAssistant.continue')}</button>
      </div>
    </> : (state.stage === 'confirmed' || state.stage === 'skipped') && !editing ? <>
      {profileFields.map(([key, label]) => {
        const value = key === 'requestedHelp' ? (state.draft.requestedHelp ?? []).join('\n') : state.draft[key];
        return value ? <div className="space-assistant-card" key={key}><strong>{t(label)}</strong><p className="space-assistant-prose" dir="auto">{value}</p></div> : null;
      })}
      <p className="space-assistant-note">{t('spaceAssistant.noPermission')}</p>
      <button type="button" disabled={busy} onClick={() => void onContinue()}>{t('spaceAssistant.adjust')}</button>
      {onContinueSetup && <button type="button" onClick={onContinueSetup}>{t('spaceAssistant.connections')}</button>}
    </> : question && questionId ? <form onSubmit={event => void submit(event)}>
      <fieldset disabled={busy}>
        <legend dir="auto">{question.prompt}</legend>
        {question.explanation && <p className="space-assistant-note" dir="auto">{question.explanation}</p>}
        <div className="space-interview-options">
          {question.options.map(option => <label className={`space-interview-option ${selected.includes(option.id) ? 'selected' : ''}`} key={option.id}>
            <input type={question.selection === 'single' ? 'radio' : 'checkbox'} name={`question-${questionId}`}
              value={option.id} checked={selected.includes(option.id)} onChange={() => setSelected(previous => question.selection === 'single' ? [option.id]
                : previous.includes(option.id) ? previous.filter(id => id !== option.id) : [...previous, option.id])} />
            <span dir="auto">{option.label}{option.description && <small>{option.description}</small>}</span>
          </label>)}
        </div>
        <p id={`answer-hint-${state.interviewId}`} className="space-assistant-note">{t('spaceAssistant.choiceHint')}</p>
        <label className="space-assistant-field"><span>{t('spaceAssistant.ownAnswer')}</span>
          <textarea value={freeText} dir="auto" aria-describedby={`answer-hint-${state.interviewId}`} onChange={event => setFreeText(event.target.value)} />
        </label>
        <button type="submit" disabled={!selected.length && !freeText.trim()}>{t('spaceAssistant.sendAnswer')}</button>
      </fieldset>
    </form> : null}
    {!!state.understood.length && <details>
      <summary>{t('spaceAssistant.understood')}</summary>
      {state.understood.map(item => <p dir="auto" key={item.topic}><strong>{t(topicKeys[item.topic])}:</strong> {item.summary}</p>)}
    </details>}
    <div className="space-assistant-controls space-interview-navigation">
      {editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setSelected([]); setFreeText(''); }}>{t('common.back')}</button>}
      {state.stage === 'interview' && !editing && <button type="button" disabled={busy} onClick={() => void onReview()}>{t('spaceAssistant.review')}</button>}
      <button type="button" disabled={busy} onClick={() => {
        if (state.stage === 'confirmed' || state.stage === 'skipped') onEnterSpace();
        else void onSkip().then(result => { if (result.ok) onEnterSpace(); });
      }}>{t('spaceAssistant.skip')}</button>
    </div>
    {answers.length > 0 && <details>
      <summary>{t('spaceAssistant.answers')}</summary>
      {answers.map(answer => <article className="space-interview-answer" key={answer.answerId}>
        <p dir="auto"><strong>{answer.question.prompt}</strong></p><p className="space-assistant-prose" dir="auto">{answer.text}</p>
        <button type="button" disabled={busy || state.stage === 'confirmed' || state.stage === 'skipped'} onClick={() => correct(answer)}>{t('spaceAssistant.correct')}</button>
      </article>)}
    </details>}
  </section>;
}

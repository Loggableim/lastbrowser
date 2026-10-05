import type { IndependentScope } from '../independent-contracts';

export type ControlCandidate = Readonly<{
  runId: string; dispatchId: string; title: string; state: string;
  expectedRevision: number; controlEpoch: number;
}>;
export type ControlChoiceRequest = Readonly<{
  scope: IndependentScope; humanTurnId: string; originalText: string;
  command: 'cancel' | 'pause' | 'resume'; requestDigest: string;
  candidate: ControlCandidate;
}>;
export type IndependentControlChoiceProps = Readonly<{
  scope: IndependentScope; humanTurnId: string; originalText: string;
  command: ControlChoiceRequest['command']; requestDigest: string;
  candidates: readonly ControlCandidate[];
  localizedLabels: Readonly<{ heading: string; explanation: string; choose: string; runId: string; state: string }>;
  onChoose: (request: ControlChoiceRequest) => void; disabled?: boolean;
}>;

/** Presents actual candidates only. Caller revalidates scope/revision/epoch. */
export function IndependentControlChoice(props: IndependentControlChoiceProps) {
  const { localizedLabels: labels } = props;
  return <section className="independent-control-choice" aria-label={labels.heading}>
    <h3>{labels.heading}</h3>
    <p>{labels.explanation}</p>
    <ul>{props.candidates.map(candidate => <li key={candidate.runId}>
      <strong>{candidate.title}</strong>
      <div>{labels.runId}: <code>{candidate.runId}</code></div>
      <div>{labels.state}: {candidate.state}</div>
      <button type="button" disabled={props.disabled} onClick={() => props.onChoose({
        scope: props.scope, humanTurnId: props.humanTurnId, originalText: props.originalText,
        command: props.command, requestDigest: props.requestDigest, candidate,
      })}>{labels.choose}</button>
    </li>)}</ul>
  </section>;
}

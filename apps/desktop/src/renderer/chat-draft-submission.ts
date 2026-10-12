export type ChatDraftSubmission = {
  draft: string;
  revision: number;
  contextKey: string;
  definitelyRejected: boolean;
  stoppedBeforeAcceptance?: boolean;
};

/** Synchronous reservation protects the awaits before React can render busy. */
export class ChatDraftSubmissionGate {
  private active: ChatDraftSubmission | null = null;

  begin(draft: string, revision: number, contextKey: string): ChatDraftSubmission | null {
    if (this.active) return null;
    const submission = { draft, revision, contextKey, definitelyRejected: true };
    this.active = submission;
    return submission;
  }

  restore(submission: ChatDraftSubmission, revision: number, contextKey: string): string | null {
    return this.active === submission && submission.definitelyRejected && !submission.stoppedBeforeAcceptance
      && submission.revision === revision && submission.contextKey === contextKey ? submission.draft : null;
  }

  finish(submission: ChatDraftSubmission): void {
    if (this.active === submission) this.active = null;
  }
}

export function isDefiniteChatStartRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  // A timeout can occur after the backend accepted the turn. Never turn an
  // unknown outcome back into an accidentally sendable duplicate.
  if (/timeout|timed?\s*out|did not start a response in time|network|socket|fetch failed/i.test(message)) return false;
  return /\b(?:400|401|403|404|409|422)\b|unsupported_provider|model_inactive|no_active_models|model_unavailable|scope_denied/i.test(message);
}

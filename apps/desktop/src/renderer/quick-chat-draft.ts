import { ChatDraftSubmissionGate, isDefiniteChatStartRejection } from './chat-draft-submission.js';

/** Clear before the IPC acknowledgement; a late acknowledgement must never clear a newer draft. */
export async function submitQuickChatDraft(options: {
  gate: ChatDraftSubmissionGate; draft: string; revision: number; scope: string;
  current: () => { revision: number; scope: string };
  setDraft: (draft: string) => void;
  send: () => void | boolean | Promise<void | boolean>;
}): Promise<void> {
  const submission = options.gate.begin(options.draft, options.revision, options.scope);
  if (!submission) return;
  options.setDraft('');
  try {
    submission.definitelyRejected = await options.send() === false;
  } catch (error) {
    submission.definitelyRejected = isDefiniteChatStartRejection(error);
  } finally {
    const current = options.current();
    const restored = options.gate.restore(submission, current.revision, current.scope);
    if (restored !== null) options.setDraft(restored);
    options.gate.finish(submission);
  }
}

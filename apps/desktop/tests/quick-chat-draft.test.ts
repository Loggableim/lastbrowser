import { describe, expect, it, vi } from 'vitest';
import { ChatDraftSubmissionGate } from '../src/renderer/chat-draft-submission.js';
import { submitQuickChatDraft } from '../src/renderer/quick-chat-draft.js';

function fixture() {
  let resolve!: (accepted: boolean) => void;
  let reject!: (error: Error) => void;
  const response = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
  const state = { draft: '  exact prompt\n', revision: 0, scope: 'home' };
  const send = vi.fn(() => response);
  const options = { gate: new ChatDraftSubmissionGate(), draft: state.draft, revision: 0, scope: 'home',
    current: () => state, setDraft: (draft: string) => { state.draft = draft; }, send };
  return { state, options, send, resolve, reject };
}
describe('Quickchat delayed submission', () => {
  it('clears before acknowledgement and reserves repeated Enter synchronously', async () => {
    const f = fixture(); const pending = submitQuickChatDraft(f.options);
    expect(f.state.draft).toBe('');
    await submitQuickChatDraft(f.options);
    expect(f.send).toHaveBeenCalledTimes(1);
    f.resolve(true); await pending;
  });
  it('restores the exact untouched draft on definite rejection', async () => {
    const f = fixture(); const pending = submitQuickChatDraft(f.options);
    f.resolve(false); await pending;
    expect(f.state.draft).toBe('  exact prompt\n');
  });
  it.each([true, false])('never overwrites a newly typed draft after acknowledgement %s', async accepted => {
    const f = fixture(); const pending = submitQuickChatDraft(f.options);
    f.state.draft = 'next prompt'; f.state.revision++;
    f.resolve(accepted); await pending;
    expect(f.state.draft).toBe('next prompt');
  });
  it('does not restore a rejected turn into a different scope', async () => {
    const f = fixture(); const pending = submitQuickChatDraft(f.options);
    f.state.scope = 'other'; f.resolve(false); await pending;
    expect(f.state.draft).toBe('');
  });
  it('keeps ambiguous timeout outcomes cleared to avoid duplicate requests', async () => {
    const f = fixture(); const pending = submitQuickChatDraft(f.options);
    f.reject(new Error('route handler did not start a response in time')); await pending;
    expect(f.state.draft).toBe('');
  });
  it('restores a definite provider rejection but not a superseded accepted start', async () => {
    for (const [message, restored] of [['HTTP 403 provider rejected request', true], ['Quickchat start superseded after acceptance', false]] as const) {
      const f = fixture(); const pending = submitQuickChatDraft(f.options);
      f.reject(new Error(message)); await pending;
      expect(f.state.draft).toBe(restored ? '  exact prompt\n' : '');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { finishStoppedLiveChatMessage } from '../src/renderer/chat-live-stream.js';

describe('stopped chat presentation', () => {
  it('removes a stopped stream placeholder after terminal processing already cleared its live flags', () => {
    expect(finishStoppedLiveChatMessage([
      { role: 'assistant', content: 'Working on it...', pending: false, streaming: false, chatStreamId: 's' },
    ], 's')).toEqual([]);
  });
  it('clears the unbound placeholder used by the scope-owned Quickchat transcript', () => {
    expect(finishStoppedLiveChatMessage([
      { role: 'user', content: 'request' },
      { role: 'assistant', content: 'Working on it...', pending: true, streaming: true },
    ])).toEqual([{ role: 'user', content: 'request' }]);
  });
  it('removes only the cancelled empty assistant placeholder and preserves user/history/other streams', () => {
    const user = { role: 'user', content: 'request' };
    const history = { role: 'assistant', content: 'Working on it...' };
    const other = { role: 'assistant', content: 'Working on it...', pending: true, chatStreamId: 'other' };
    expect(finishStoppedLiveChatMessage([user, history, other,
      { role: 'assistant', content: 'Working on it...', pending: true, streaming: true, chatStreamId: 'cancelled' },
    ], 'cancelled')).toEqual([user, history, other]);
  });
  it('preserves partial tokens and reasoning while clearing live progress', () => {
    expect(finishStoppedLiveChatMessage([
      { role: 'assistant', content: 'Partial', streaming: true, chatStreamId: 's', progress: 'busy' },
      { role: 'assistant', content: 'Working on it...', reasoning: 'Thinking', pending: true, chatStreamId: 's' },
    ], 's')).toEqual([
      { role: 'assistant', content: 'Partial', streaming: false, pending: false, chatStreamId: 's', progress: undefined },
      { role: 'assistant', content: '', reasoning: 'Thinking', pending: false, streaming: false, chatStreamId: 's', progress: undefined },
    ]);
  });
});

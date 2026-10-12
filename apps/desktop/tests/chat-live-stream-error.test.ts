import { describe, expect, it } from 'vitest';
import {
  applyLiveChatDelta,
  finishLiveChatMessageWithError,
  finishStoppedLiveChatMessage,
  readNativeChatStreamError,
} from '../src/renderer/chat-live-stream.js';

describe('native chat stream errors', () => {
  it('extracts provider messages from supported SSE error payloads', () => {
    expect(readNativeChatStreamError({ error: 'Ollama Cloud quota exhausted' })).toBe('Ollama Cloud quota exhausted');
    expect(readNativeChatStreamError({ detail: { message: 'Provider unavailable' } })).toBe('Provider unavailable');
    expect(readNativeChatStreamError('Connection reset')).toBe('Connection reset');
    expect(readNativeChatStreamError({ code: 429 })).toContain('provider stream failed');
  });

  it('finalizes the pending bubble while preserving partial answer and reasoning', () => {
    let messages = [{ role: 'assistant', content: 'Working on it...', pending: true, reasoning: '' }];
    messages = applyLiveChatDelta(messages, 'reasoning', 'Checking the request.');
    messages = applyLiveChatDelta(messages, 'token', 'Partial answer');

    const finished = finishLiveChatMessageWithError(messages, 'Provider disconnected');
    expect(finished).toEqual([{
      role: 'assistant',
      content: 'Partial answer',
      pending: false,
      streaming: false,
      reasoning: 'Checking the request.',
      progress: undefined,
    }]);
  });

  it('replaces the placeholder when failure arrives before any streamed output', () => {
    expect(finishLiveChatMessageWithError([
      { role: 'assistant', content: 'Working on it...', pending: true, progress: 'Connecting' },
    ], 'Invalid API key')).toEqual([{
      role: 'assistant',
      content: 'Sidekick could not respond: Invalid API key',
      pending: false,
      progress: undefined,
      streaming: false,
    }]);
  });

  it('removes a stopped placeholder and preserves actual partial answers', () => {
    const messages = [
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Working on it...', pending: true, streaming: true, chatStreamId: 'stopped' },
      { role: 'assistant', content: 'Partial answer', pending: true, streaming: true, chatStreamId: 'other' },
    ];
    expect(finishStoppedLiveChatMessage(messages, 'stopped')).toEqual([messages[0], messages[2]]);
    expect(finishStoppedLiveChatMessage(messages.slice(0, 2))).toEqual([messages[0]]);
    expect(finishStoppedLiveChatMessage([
      { role: 'assistant', content: 'Partial answer', pending: true, streaming: true },
    ])).toEqual([{ role: 'assistant', content: 'Partial answer', pending: false, streaming: false, progress: undefined }]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  adoptCreatedTurnSession,
  continuationAfterTerminalEvent,
  isActiveTurnContextCurrent,
  isGoalContinuationContextCurrent,
  readGoalContinuationPrompt,
  startGoalContinuation
} from '../src/renderer/goal-continuation.js';

const expected = { sessionId: 'session-1', profileId: 'work', spacePath: 'C:/spaces/research' };

describe('persistent goal continuation handoff', () => {
  it('drops a queued continuation when the stream is cancelled', () => {
    const prompt = 'Continue the active task from the latest result.';
    expect(continuationAfterTerminalEvent(prompt, 'cancel')).toBeNull();
    expect(continuationAfterTerminalEvent(prompt, 'error')).toBeNull();
    expect(continuationAfterTerminalEvent(prompt, 'stream_end')).toBe(prompt);
  });
  it('accepts only an exact continuation event for the current stream and session', () => {
    const prompt = 'Continue the active task from the latest result.';
    expect(readGoalContinuationPrompt({
      streamId: 'stream-1',
      event: 'goal_continue',
      data: { session_id: expected.sessionId, continuation_prompt: prompt, text: prompt }
    }, 'stream-1', expected.sessionId)).toBe(prompt);
  });

  it('rejects unrelated, stale, malformed, and mismatched continuation events', () => {
    const data = { session_id: expected.sessionId, continuation_prompt: 'Continue', text: 'Continue' };
    expect(readGoalContinuationPrompt({ streamId: 'old-stream', event: 'goal_continue', data }, 'stream-1', expected.sessionId)).toBeNull();
    expect(readGoalContinuationPrompt({ streamId: 'stream-1', event: 'message', data }, 'stream-1', expected.sessionId)).toBeNull();
    expect(readGoalContinuationPrompt({ streamId: 'stream-1', event: 'goal_continue', data: { ...data, session_id: 'other-session' } }, 'stream-1', expected.sessionId)).toBeNull();
    expect(readGoalContinuationPrompt({ streamId: 'stream-1', event: 'goal_continue', data: { ...data, text: 'different prompt' } }, 'stream-1', expected.sessionId)).toBeNull();
    expect(readGoalContinuationPrompt({ streamId: 'stream-1', event: 'goal_continue', data: null }, 'stream-1', expected.sessionId)).toBeNull();
  });

  it('starts the next turn with the exact backend prompt after the stream completes', async () => {
    const startChat = vi.fn(async () => ({ streamId: 'next-stream' }));
    const prompt = 'Continue the active task from the latest result.';

    const started = await startGoalContinuation(prompt, expected, {
      sessionId: expected.sessionId,
      profileId: expected.profileId,
      spacePath: expected.spacePath
    }, startChat);

    expect(started).toBe(true);
    expect(startChat).toHaveBeenCalledOnce();
    expect(startChat).toHaveBeenCalledWith(prompt);
  });

  it('keeps asynchronous turns bound to their original session, profile, and Space', () => {
    expect(isActiveTurnContextCurrent(expected, expected)).toBe(true);
    expect(isActiveTurnContextCurrent(expected, {
      ...expected,
      sessionId: 'newly-selected-session'
    })).toBe(false);
    expect(isActiveTurnContextCurrent(expected, {
      ...expected,
      profileId: 'personal'
    })).toBe(false);
    expect(isActiveTurnContextCurrent(expected, {
      ...expected,
      spacePath: 'C:/spaces/other'
    })).toBe(false);
    expect(isActiveTurnContextCurrent({ ...expected, sessionId: '' }, {
      ...expected,
      sessionId: null
    })).toBe(true);
  });

  it('adopts the backend session for a new chat while retaining context-change guards', () => {
    const freshContext = { sessionId: '', profileId: 'work', spacePath: 'C:/spaces/research' };
    const adopted = adoptCreatedTurnSession(freshContext, {
      sessionId: null,
      profileId: freshContext.profileId,
      spacePath: freshContext.spacePath
    }, 'created-session');
    expect(adopted).toEqual({ ...freshContext, sessionId: 'created-session' });

    expect(adoptCreatedTurnSession(freshContext, {
      sessionId: 'user-selected-session',
      profileId: freshContext.profileId,
      spacePath: freshContext.spacePath
    }, 'created-session')).toBeNull();
    expect(adoptCreatedTurnSession(freshContext, {
      sessionId: null,
      profileId: 'personal',
      spacePath: freshContext.spacePath
    }, 'created-session')).toBeNull();
    expect(adoptCreatedTurnSession(freshContext, {
      sessionId: null,
      profileId: freshContext.profileId,
      spacePath: 'C:/spaces/other'
    }, 'created-session')).toBeNull();
  });

  it('does not start the next turn after the user switches session, profile, or Space', async () => {
    const startChat = vi.fn(async () => undefined);
    const contexts = [
      { sessionId: 'other-session', profileId: expected.profileId, spacePath: expected.spacePath },
      { sessionId: expected.sessionId, profileId: 'personal', spacePath: expected.spacePath },
      { sessionId: expected.sessionId, profileId: expected.profileId, spacePath: 'C:/spaces/other' }
    ];

    for (const current of contexts) {
      expect(isGoalContinuationContextCurrent(expected, current)).toBe(false);
      expect(await startGoalContinuation('Continue', expected, current, startChat)).toBe(false);
    }
    expect(await startGoalContinuation('  ', expected, expected, startChat)).toBe(false);
    expect(startChat).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { readPersistentGoalStateError } from '../src/renderer/persistent-goal-state.js';

describe('persistent goal state availability in session payloads', () => {
  it('surfaces the backend retryable warning while preserving the session payload', () => {
    const session = {
      session_id: 'session-1',
      messages: [{ role: 'assistant', content: 'Prior answer' }],
      goal_state_error: {
        error: 'goal_state_unavailable',
        message: 'Could not load persistent goal state. Please retry.',
        retryable: true,
      },
    };

    expect(session.session_id).toBe('session-1');
    expect(session.messages).toHaveLength(1);
    expect('goal' in session).toBe(false);
    expect(readPersistentGoalStateError(session)).toBe('Could not load persistent goal state. Please retry.');
  });

  it('does not mistake a confirmed empty goal state or unrelated warning for a goal-store failure', () => {
    expect(readPersistentGoalStateError({ goal: null })).toBeNull();
    expect(readPersistentGoalStateError({
      goal_state_error: { error: 'other', message: 'ignore', retryable: true },
    })).toBeNull();
    expect(readPersistentGoalStateError({
      goal_state_error: { error: 'goal_state_unavailable', message: 'retry', retryable: false },
    })).toBeNull();
  });
});

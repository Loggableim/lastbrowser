import { describe, expect, it } from 'vitest';
import { shouldRenderPersistentGoalControls } from '../src/renderer/panels/GoalControls.js';

const context = { sessionId: 'chat-a', profileId: 'default', browserProfileId: 'default', spacePath: 'C:/spaces/a' };
const emptySession = { session_id: 'chat-a', goal: null };
const persistedGoal = { session_id: 'chat-a', goal: {
  session_id: 'chat-a', goal: 'Finish the audit', status: 'active', revision: 4,
} };

describe('native persistent-goal panel visibility', () => {
  it('keeps a normal new chat free of goal controls until the user invokes /goal', () => {
    expect(shouldRenderPersistentGoalControls(emptySession, context, null, 'chat-a-view')).toBe(false);
    expect(shouldRenderPersistentGoalControls(emptySession, context, 'chat-a-view', 'chat-a-view')).toBe(true);
    expect(shouldRenderPersistentGoalControls(emptySession, context, null, 'chat-a-view')).toBe(false);
  });

  it('keeps a persisted goal visible after reload, but hides cleared goals', () => {
    expect(shouldRenderPersistentGoalControls(persistedGoal, context, null, 'chat-a-view')).toBe(true);
    expect(shouldRenderPersistentGoalControls({ ...persistedGoal, goal: { ...persistedGoal.goal, status: 'cleared' } },
      context, null, 'chat-a-view')).toBe(false);
  });

  it('does not carry a goal or an explicitly opened empty editor into another chat', () => {
    const otherContext = { ...context, sessionId: 'chat-b', spacePath: 'C:/spaces/b' };
    expect(shouldRenderPersistentGoalControls(persistedGoal, otherContext, null, 'chat-b-view')).toBe(false);
    expect(shouldRenderPersistentGoalControls(emptySession, otherContext, 'chat-a-view', 'chat-b-view')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildPersistentGoalCommandBody,
  parsePersistentGoalCommand,
  requestPersistentGoalControlWhileBusy,
  requestPersistentGoalCommand,
  shouldDispatchPersistentGoalControlWhileBusy,
} from '../src/renderer/persistent-goal-command.js';

describe('persistent goal chat command bridge', () => {
  it('recognizes /goal with optional multiline arguments only as a complete command', () => {
    expect(parsePersistentGoalCommand('/goal')).toEqual({ args: '' });
    expect(parsePersistentGoalCommand('  /GOAL  research the issue\nthen verify the fix  ')).toEqual({
      args: 'research the issue\nthen verify the fix',
    });
    expect(parsePersistentGoalCommand('/goalkeeper research')).toBeNull();
    expect(parsePersistentGoalCommand('please /goal status')).toBeNull();
  });

  it('dispatches goal controls while busy without treating resume or goal creation as controls', () => {
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal status', true)).toBe(true);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal', true)).toBe(true);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal pause', true)).toBe(true);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal clear', true)).toBe(true);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal resume', true)).toBe(false);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal Ship the feature', true)).toBe(false);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal pause', false)).toBe(false);
    expect(shouldDispatchPersistentGoalControlWhileBusy('ordinary chat message', true)).toBe(false);
  });

  it('sends a busy pause to the goal API without requesting a second chat stream', async () => {
    const calls: unknown[] = [];
    const response = await requestPersistentGoalControlWhileBusy(async (request) => {
      calls.push(request);
      return { message: 'Goal paused.' };
    }, '/goal pause', true, {
      sessionId: 'active-session',
      profileId: 'default',
      workspace: 'C:/work/space',
    });

    expect(calls).toEqual([{
      method: 'POST',
      path: '/api/goal',
      body: {
        session_id: 'active-session',
        args: 'pause',
        profile: 'default',
        workspace: 'C:/work/space',
        scope_goals_to_workspace: true,
      },
    }]);
    expect(response?.message).toBe('Goal paused.');
    expect(await requestPersistentGoalControlWhileBusy(async () => ({}), '/goal resume', true, {
      sessionId: 'active-session',
      profileId: 'default',
      workspace: 'C:/work/space',
    })).toBeNull();
  });

  it('binds every request to the active session, profile, Space path, and selected model', () => {
    expect(buildPersistentGoalCommandBody('pause', {
      sessionId: 'session-1',
      profileId: 'work',
      workspace: 'C:/work/space',
      model: 'deepseek-v4.1-flash',
      modelProvider: 'ollama-cloud',
    })).toEqual({
      session_id: 'session-1',
      args: 'pause',
      profile: 'work',
      workspace: 'C:/work/space',
      scope_goals_to_workspace: true,
      model: 'deepseek-v4.1-flash',
      model_provider: 'ollama-cloud',
    });
  });

  it('omits optional empty fields without losing the session scope', () => {
    expect(buildPersistentGoalCommandBody('status', {
      sessionId: 'session-2',
      profileId: 'default',
      workspace: '',
    })).toEqual({ session_id: 'session-2', args: 'status', profile: 'default' });
  });

  it('sends commands to the dedicated persistent goal API', async () => {
    const calls: unknown[] = [];
    const response = await requestPersistentGoalCommand(async (request) => {
      calls.push(request);
      return { message: 'Goal paused.' };
    }, 'pause', {
      sessionId: 'session-3',
      profileId: 'default',
      workspace: '/spaces/research',
    });

    expect(calls).toEqual([{
      method: 'POST',
      path: '/api/goal',
      body: {
        session_id: 'session-3',
        args: 'pause',
        profile: 'default',
        workspace: '/spaces/research',
        scope_goals_to_workspace: true,
      },
    }]);
    expect(response.message).toBe('Goal paused.');
  });
});

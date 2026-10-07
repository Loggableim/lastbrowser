import { describe, expect, it } from 'vitest';
import {
  buildPersistentGoalCommandBody,
  parsePersistentGoalCommand,
  requestPersistentGoalControlWhileBusy,
  requestPersistentGoalCommand,
  requestNativePersistentGoalCommand,
  shouldAcceptPersistentGoalCommand,
  shouldDispatchPersistentGoalControlWhileBusy,
} from '../src/renderer/persistent-goal-command.js';
import { isNativeGoalWriterRunning, nativeGoalErrorCopy, NativeGoalCommandError } from '../src/renderer/native-goal-errors.js';

describe('persistent goal chat command bridge', () => {
  it('requires an actual native success ACK, preserves codeful CAS/owner failures, and rejects a foreign session',async()=>{
    const context={sessionId:'controlled-a',profileId:'actual-browser',browserProfileId:'actual-browser',workspace:'C:/controlled/a',expectedRevision:7,clientRequestId:crypto.randomUUID()};
    for(const code of ['goal_revision_conflict','goal_owned_by_run','command_interrupted','persistence_failed'])
      await expect(requestNativePersistentGoalCommand(async()=>({ok:false,error:code}),'pause',context)).rejects.toMatchObject({code});
    await expect(requestNativePersistentGoalCommand(async()=>({ok:true,session_id:'foreign'}),'pause',context)).rejects.toMatchObject({code:'goal_response_foreign_session'});
    await expect(requestNativePersistentGoalCommand(async()=>({ok:true,session_id:context.sessionId}),'pause',context)).resolves.toMatchObject({ok:true});
    for(const locale of ['en','de','it','es','fr','pt-BR','ru','ja'] as const){
      expect(nativeGoalErrorCopy(locale,new NativeGoalCommandError('goal_revision_conflict'))).not.toEqual(nativeGoalErrorCopy(locale,new NativeGoalCommandError('goal_owned_by_run')));
    }
  });
  it('accepts completion only with a persisted done snapshot and cancellation only with the clear ACK', async () => {
    const context={sessionId:'controlled-a',profileId:'actual-browser',browserProfileId:'actual-browser',workspace:'C:/controlled/a',expectedRevision:7,clientRequestId:'complete-request'};
    const complete = { ok: true, action: 'complete', session_id: context.sessionId, revision: 8,
      goal: { session_id: context.sessionId, status: 'done', revision: 8 } };
    await expect(requestNativePersistentGoalCommand(async () => complete, 'complete', context)).resolves.toEqual(complete);
    await expect(requestNativePersistentGoalCommand(async () => ({ ...complete, goal: { ...complete.goal, status: 'active' } }), 'complete', context))
      .rejects.toMatchObject({ code: 'goal_completion_unconfirmed' });
    await expect(requestNativePersistentGoalCommand(async () => ({ ok: true, action: 'clear', session_id: context.sessionId, revision: 8 }), 'cancel', context))
      .resolves.toMatchObject({ action: 'clear', revision: 8 });
    await expect(requestNativePersistentGoalCommand(async () => ({ ok: true, action: 'cancel', session_id: context.sessionId, revision: 8 }), 'cancel', context))
      .rejects.toMatchObject({ code: 'goal_cancel_unconfirmed' });
  });
  it('treats agent_running as a definitive non-mutation and tells the user to retry after refresh', () => {
    const error = new NativeGoalCommandError('agent_running');
    expect(isNativeGoalWriterRunning(error)).toBe(true);
    expect(nativeGoalErrorCopy('de', error)).toContain('läuft noch');
  });
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
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal complete', true)).toBe(true);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal cancel', true)).toBe(true);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal resume', true)).toBe(false);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal Ship the feature', true)).toBe(false);
    expect(shouldDispatchPersistentGoalControlWhileBusy('/goal pause', false)).toBe(false);
    expect(shouldDispatchPersistentGoalControlWhileBusy('ordinary chat message', true)).toBe(false);
  });

  it('synchronously accepts safe Goal controls but rejects Resume/start while a writer is busy', () => {
    for (const command of ['status', 'pause', 'clear', 'cancel', 'complete', 'stop', 'done'])
      expect(shouldAcceptPersistentGoalCommand(`/goal ${command}`, true)).toBe(true);
    expect(shouldAcceptPersistentGoalCommand('/goal resume', true)).toBe(false);
    expect(shouldAcceptPersistentGoalCommand('/goal Start research', true)).toBe(false);
    expect(shouldAcceptPersistentGoalCommand('/goal resume', false)).toBe(true);
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

  it('captures the selected reasoning effort in a goal start request', () => {
    expect(buildPersistentGoalCommandBody('Research this topic', {
      sessionId: 'goal-session', profileId: 'research', workspace: 'C:/work/space',
      model: 'gpt-5.3-codex', modelProvider: 'openai-codex', reasoningEffort: 'xhigh'
    })).toMatchObject({ model: 'gpt-5.3-codex', model_provider: 'openai-codex', reasoning_effort: 'xhigh' });
  });
  it('preserves an actual goal revision and idempotent client ID in the captured request',()=>{
    const clientRequestId=crypto.randomUUID();
    expect(buildPersistentGoalCommandBody('pause',{sessionId:'controlled-session',profileId:'work',workspace:'C:/controlled/work',
      expectedRevision:7,clientRequestId})).toMatchObject({session_id:'controlled-session',profile:'work',expected_revision:7,client_request_id:clientRequestId});
    expect(buildPersistentGoalCommandBody('new goal',{sessionId:'controlled-session',profileId:'work',workspace:'C:/controlled/work'})).not.toHaveProperty('expected_revision');
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

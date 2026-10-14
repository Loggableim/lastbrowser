import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { sessionDeletionSucceeded, sessionListResponseMatchesScope } from '../src/renderer/session-list-scope.js';

// Execute the actual handler, with controlled React state and IPC scheduling.
// This proves its delayed-response decisions, not mounted DOM or disk persistence.
const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Map<string, ts.FunctionDeclaration>();
function find(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name) handlers.set(node.name.text, node);
  ts.forEachChild(node, find);
}
find(source);
function fixture(handlerName = 'deleteNativeSession') {
  const handler = handlers.get(handlerName);
  if (!handler) throw new Error('Production handler missing: ' + handlerName);
  const compiled = ts.transpileModule(handler.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  let rows = [{ session_id: 'first' }, { session_id: 'second' }];
  let complete!: (value: unknown) => void;
  let fail!: (error: Error) => void;
  const pending = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
  const refs = { activeProfileIdRef: { current: 'browser' }, activeSpacePathRef: { current: 'C:/space' },
    activeBackendProfileNameRef: { current: 'alpha' }, activeSessionIdRef: { current: 'first' },
    sessionsRef: { get current() { return rows; } } };
  const deleteSession = vi.fn(() => pending);
  const confirm = vi.fn(() => true), setSessionError = vi.fn(), setActiveSessionId = vi.fn();
  const setActiveSession = vi.fn(), setActivePanel = vi.fn();
  const bindings = { ...refs, activeProfileId: 'browser', activeSpacePath: 'C:/space', activeBackendProfileName: 'alpha',
    locale: 'de', sessionTitle: () => 'Chat', window: { confirm, prompt: () => 'Renamed', lastbrowser: {
      sidekick: { deleteSession, renameSession: deleteSession, duplicateSession: deleteSession } } },
    setSessions: (update: (current: typeof rows) => typeof rows) => { rows = update(rows); },
    setSessionError, setActiveSessionId, setActiveSession, setActivePanel, sessionDeletionSucceeded, sessionListResponseMatchesScope };
  const remove = new Function(...Object.keys(bindings), `${compiled}; return ${handlerName};`)(...Object.values(bindings)) as
    (session: { session_id: string }, confirmation: string) => Promise<void>;
  return { remove, complete, fail, refs, deleteSession, confirm, setSessionError, setActiveSessionId, setActiveSession, setActivePanel, rows: () => rows };
}

describe('actual scoped single-chat deletion handler', () => {
  it('ignores a late deletion after only the backend profile changes', async () => {
    const state = fixture();
    const deleting = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');
    state.refs.activeBackendProfileNameRef.current = 'beta';
    state.complete({ deleted: true });
    await deleting;
    expect(state.rows()).toHaveLength(2);
    expect(state.setActiveSessionId).not.toHaveBeenCalled();
    expect(state.setSessionError).not.toHaveBeenCalled();
    expect(state.deleteSession).toHaveBeenCalledWith({ sessionId: 'first', profile: 'browser', workspacePath: 'C:/space', backendProfileName: 'alpha' });
  });

  it('does not move the current chat when the user selected another while deletion was pending', async () => {
    const state = fixture();
    const deleting = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');
    state.refs.activeSessionIdRef.current = 'second';
    state.complete({ deleted: true });
    await deleting;
    expect(state.rows()).toEqual([{ session_id: 'second' }]);
    expect(state.setActiveSessionId).not.toHaveBeenCalled();
    expect(state.confirm).not.toHaveBeenCalled();
  });

  it('retains the chat and shows an error on an explicit backend refusal', async () => {
    const state = fixture();
    const deleting = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');
    state.complete({ deleted: false });
    await deleting;
    expect(state.rows()).toHaveLength(2);
    expect(state.setActiveSessionId).not.toHaveBeenCalled();
    expect(state.setSessionError).toHaveBeenCalledWith('Chat konnte nicht gelöscht werden.');
  });

  it('does not put an old request error into a newly selected backend profile', async () => {
    const state = fixture();
    const deleting = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');
    state.refs.activeBackendProfileNameRef.current = 'beta';
    state.fail(new Error('Old backend failed'));
    await deleting;
    expect(state.setSessionError).not.toHaveBeenCalled();
    expect(state.rows()).toHaveLength(2);
  });

  it.each(['renameNativeSession', 'duplicateNativeSession'])('ignores a late %s response after a backend-only switch', async handler => {
    const state = fixture(handler);
    const request = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');
    state.refs.activeBackendProfileNameRef.current = 'beta';
    state.complete({ session: { session_id: 'copied', title: 'Renamed' } });
    await request;
    expect(state.rows()).toEqual([{ session_id: 'first' }, { session_id: 'second' }]);
    expect(state.setActiveSessionId).not.toHaveBeenCalled();
    expect(state.setActiveSession).not.toHaveBeenCalled();
    expect(state.setActivePanel).not.toHaveBeenCalled();
    expect(state.setSessionError).not.toHaveBeenCalled();
  });

  it.each(['renameNativeSession', 'duplicateNativeSession'])('ignores a late %s error after a backend-only switch', async handler => {
    const state = fixture(handler);
    const request = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');
    state.refs.activeBackendProfileNameRef.current = 'beta';
    state.fail(new Error('Old backend failed'));
    await request;
    expect(state.setSessionError).not.toHaveBeenCalled();
    expect(state.rows()).toHaveLength(2);
  });
});

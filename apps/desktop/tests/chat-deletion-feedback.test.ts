import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import {
  sessionDeletionFailureMessage,
  sessionDeletionSucceeded,
  sessionListResponseMatchesScope
} from '../src/renderer/session-list-scope.js';
import {
  isSessionDeleteArmExpired,
  nextSessionDeleteStep,
  pruneSessionDeleteErrors,
  settleSessionDeleteArm,
  settleSessionDeleteErrors,
  SESSION_DELETE_ARM_MS,
  type SessionDeleteArm
} from '../src/renderer/session-delete-arm.js';

// The production deleteNativeSession, executed against controlled state and IPC.
const appSource = readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
const source = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findFunction(name: string): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) throw new Error('Production handler missing: ' + name);
  return found;
}

function deletionFixture() {
  let rows = [{ session_id: 'first' }, { session_id: 'second' }];
  let complete!: (value: unknown) => void;
  let fail!: (error: Error) => void;
  const pending = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
  const refs = {
    activeProfileIdRef: { current: 'browser' }, activeSpacePathRef: { current: 'C:/space' },
    activeBackendProfileNameRef: { current: 'alpha' }, activeSessionIdRef: { current: 'first' },
    removedSessionIdsRef: { current: new Set<string>() },
    sessionsRef: { get current() { return rows; } }
  };
  const deleteSession = vi.fn(() => pending);
  const setSessionError = vi.fn(), setActiveSessionId = vi.fn();
  const bindings = {
    ...refs, activeProfileId: 'browser', activeSpacePath: 'C:/space', activeBackendProfileName: 'alpha',
    locale: 'en', sessionTitle: () => 'Chat',
    window: { confirm: () => true, lastbrowser: { sidekick: { deleteSession } } },
    setSessions: (update: (current: typeof rows) => typeof rows) => { rows = update(rows); },
    setSessionError, setActiveSessionId, setActiveSession: vi.fn(), setActivePanel: vi.fn(),
    sessionDeletionSucceeded, sessionDeletionFailureMessage, sessionListResponseMatchesScope
  };
  const compiled = ts.transpileModule(findFunction('deleteNativeSession').getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const remove = new Function(...Object.keys(bindings), `${compiled}; return deleteNativeSession;`)(...Object.values(bindings)) as
    (session: { session_id: string }, confirmation: string) => Promise<{ deleted: boolean; message: string }>;
  return { remove, complete, fail, refs, deleteSession, setSessionError, setActiveSessionId, rows: () => rows };
}

describe('refused chat deletion stays on its row with the backend message', () => {
  it('keeps the row and reports the backend message', async () => {
    const state = deletionFixture();
    const backendMessage = 'This chat is still being written by an active turn. Stop that turn before changing or deleting the chat.';
    const deleting = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');

    state.complete({ ok: false, deleted: false, error: backendMessage });
    const outcome = await deleting;

    expect(outcome).toEqual({ deleted: false, message: backendMessage });
    expect(state.rows().map((row) => row.session_id)).toEqual(['first', 'second']);
    expect(state.setSessionError).toHaveBeenCalledWith(backendMessage);
    expect(state.setActiveSessionId).not.toHaveBeenCalled();
  });

  it('reports a thrown IPC failure on the row instead of dropping it', async () => {
    const state = deletionFixture();
    const deleting = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');

    state.fail(new Error('Sidekick is still starting.'));
    const outcome = await deleting;

    expect(outcome).toEqual({ deleted: false, message: 'Sidekick is still starting.' });
    expect(state.rows()).toHaveLength(2);
  });

  it('reports nothing when the user moved to another Space while the request was pending', async () => {
    const state = deletionFixture();
    const deleting = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');

    state.refs.activeBackendProfileNameRef.current = 'beta';
    state.complete({ ok: false, deleted: false, error: 'late refusal' });
    const outcome = await deleting;

    expect(outcome).toEqual({ deleted: false, message: '' });
    expect(state.setSessionError).not.toHaveBeenCalled();
    expect(state.rows()).toHaveLength(2);
  });
});

describe('successful chat deletion removes the row', () => {
  it('drops the chat and reports success without a message', async () => {
    const state = deletionFixture();
    const deleting = state.remove({ session_id: 'first' }, 'sidebar-inline-confirmed');

    state.complete({ ok: true });
    const outcome = await deleting;

    expect(outcome).toEqual({ deleted: true, message: '' });
    expect(state.rows().map((row) => row.session_id)).toEqual(['second']);
    expect(state.setSessionError).toHaveBeenLastCalledWith('');
  });
});

describe('deletion messages from the backend', () => {
  it('shows backend text as sent', () => {
    expect(sessionDeletionFailureMessage({ ok: false, error: 'This work chat is owned by its independent run; pause or stop that run first' }, 'en'))
      .toBe('This work chat is owned by its independent run; pause or stop that run first');
  });

  it('localizes the raw goal-state code', () => {
    expect(sessionDeletionFailureMessage({ ok: false, error: 'goal_state_unavailable' }, 'de'))
      .toBe('Das Ziel dieses Chats konnte nicht gelöscht werden. Bitte erneut versuchen.');
    expect(sessionDeletionFailureMessage({ ok: false, error: 'goal_state_unavailable' }, 'en'))
      .toBe('The goal of this chat could not be cleared. Please try again.');
  });

  it('falls back to a localized sentence when the backend gives no text', () => {
    expect(sessionDeletionFailureMessage({ ok: false }, 'de')).toBe('Chat konnte nicht gelöscht werden.');
    expect(sessionDeletionFailureMessage(undefined, 'en')).toBe('Chat could not be deleted.');
    expect(sessionDeletionSucceeded({ ok: false, error: 'x' })).toBe(false);
  });
});

describe('two-step deletion arm', () => {
  const scope = 'browser::C:/space::first::chat';

  it('arms on the first click and confirms on a second click inside the window', () => {
    const armed = nextSessionDeleteStep(null, 'first', scope, 1_000);
    expect(armed.confirm).toBe(false);
    expect(armed.arm.expiresAt).toBe(1_000 + SESSION_DELETE_ARM_MS);

    expect(nextSessionDeleteStep(armed.arm, 'first', scope, 2_000).confirm).toBe(true);
  });

  it('re-arms instead of deleting once the window has passed, or for another row or scope', () => {
    const armed = nextSessionDeleteStep(null, 'first', scope, 1_000).arm;
    expect(nextSessionDeleteStep(armed, 'first', scope, armed.expiresAt).confirm).toBe(false);
    expect(nextSessionDeleteStep(armed, 'second', scope, 2_000).confirm).toBe(false);
    expect(nextSessionDeleteStep(armed, 'first', 'other-scope', 2_000).confirm).toBe(false);
  });

  it('clears the arm after a successful deletion', () => {
    const armed = nextSessionDeleteStep(null, 'first', scope, 1_000).arm;
    expect(settleSessionDeleteArm(armed, 'first', { deleted: true, message: '' })).toBeNull();
  });

  it('pins the arm after a refusal, so it does not reset on the timer and the retry still confirms', () => {
    const armed = nextSessionDeleteStep(null, 'first', scope, 1_000).arm;
    const pinned = settleSessionDeleteArm(armed, 'first', { deleted: false, message: 'refused' }) as SessionDeleteArm;

    expect(pinned.pinned).toBe(true);
    expect(isSessionDeleteArmExpired(pinned, pinned.expiresAt + 60_000)).toBe(false);
    expect(nextSessionDeleteStep(pinned, 'first', scope, pinned.expiresAt + 60_000).confirm).toBe(true);
  });

  it('keeps an unpinned arm expiring on its own window', () => {
    const armed = nextSessionDeleteStep(null, 'first', scope, 1_000).arm;
    expect(isSessionDeleteArmExpired(armed, armed.expiresAt - 1)).toBe(false);
    expect(isSessionDeleteArmExpired(armed, armed.expiresAt)).toBe(true);
  });

  it('clears the arm when the attempt ends silently because the context changed', () => {
    const armed = nextSessionDeleteStep(null, 'first', scope, 1_000).arm;
    expect(settleSessionDeleteArm(armed, 'first', { deleted: false, message: '' })).toBeNull();
  });
});

describe('row messages follow their rows', () => {
  it('stores a refusal message under its row and clears it on success', () => {
    const refused = settleSessionDeleteErrors({}, 'first', { deleted: false, message: 'refused' });
    expect(refused).toEqual({ first: 'refused' });
    expect(settleSessionDeleteErrors(refused, 'first', { deleted: true, message: '' })).toEqual({});
  });

  it('drops messages for rows that are no longer listed', () => {
    const kept = pruneSessionDeleteErrors({ first: 'refused', gone: 'old' }, new Set(['first', 'second']));
    expect(kept).toEqual({ first: 'refused' });
  });
});

describe('sidebar wiring for deletion feedback', () => {
  const sidebar = readFileSync(new URL('../src/renderer/components/SidekickSidebar.tsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main/main.ts', import.meta.url), 'utf8');

  it('hides the delete control for read-only CLI imports instead of calling the route', () => {
    expect(sidebar).toContain('{onDeleteSession && !session.read_only && <button');
  });

  it('shows the message on the affected row with an alert role', () => {
    expect(sidebar).toContain('className="sidebar-session-error" role="alert"');
    expect(sidebar).toContain('{deleteFailedLabel}: {deleteError}');
  });

  it('returns refusals from the main process as results, not IPC faults', () => {
    expect(main).toContain("return { ok: false, deleted: false, error: error instanceof Error ? error.message : String(error) };");
  });
});

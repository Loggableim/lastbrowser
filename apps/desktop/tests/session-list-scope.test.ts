import { describe, expect, it } from 'vitest';
import {
  mergeSessionListSnapshot,
  resolveSessionBackendProfile,
  resolveSessionListSelection,
  sessionListResponseMatchesScope,
  type SessionListScope
} from '../src/renderer/session-list-scope.js';

const workScope: SessionListScope = { profile: 'default', workspacePath: 'C:/spaces/work' };
const personalScope: SessionListScope = { profile: 'personal', workspacePath: 'C:/spaces/work' };
const otherSpaceScope: SessionListScope = { profile: 'default', workspacePath: 'C:/spaces/personal' };
const session = (session_id: string) => ({ session_id });

describe('profile and Space scoped session lists', () => {
  it('never borrows an old resolved backend during a Space or profile switch', () => {
    expect(resolveSessionBackendProfile(workScope, 'alpha', workScope)).toBe('alpha');
    expect(resolveSessionBackendProfile(workScope, 'alpha', personalScope)).toBeUndefined();
    expect(resolveSessionBackendProfile(workScope, 'alpha', otherSpaceScope)).toBeUndefined();
    const beta = { ...workScope, backendProfileName: 'beta' };
    expect(resolveSessionBackendProfile(workScope, 'alpha', beta)).toBe('beta');
    expect(resolveSessionBackendProfile(beta, 'beta', beta)).toBe('beta');
    expect(resolveSessionBackendProfile(null, 'alpha', beta)).toBe('beta');
  });
  it('rejects session-list responses from an earlier profile or Space', () => {
    expect(sessionListResponseMatchesScope(workScope, workScope)).toBe(true);
    expect(sessionListResponseMatchesScope(workScope, personalScope)).toBe(false);
    expect(sessionListResponseMatchesScope(workScope, otherSpaceScope)).toBe(false);
  });

  it('retains an active session only for refreshes in the same scope', () => {
    const current = session('active');
    const result = mergeSessionListSnapshot(
      workScope,
      workScope,
      [current],
      [session('other')],
      'active'
    );

    expect(result.scopeChanged).toBe(false);
    expect(result.sessions.map((item) => item.session_id)).toEqual(['active', 'other']);
    expect(resolveSessionListSelection('active', result.sessions, result.scopeChanged, false)).toBe('active');
  });

  it('drops the previous scope and selects only from the new scoped snapshot', () => {
    const result = mergeSessionListSnapshot(
      workScope,
      otherSpaceScope,
      [session('foreign')],
      [session('space-session')],
      'foreign'
    );

    expect(result.scopeChanged).toBe(true);
    expect(result.sessions.map((item) => item.session_id)).toEqual(['space-session']);
    expect(resolveSessionListSelection('foreign', result.sessions, result.scopeChanged, false)).toBe('space-session');
    expect(resolveSessionListSelection('foreign', [], result.scopeChanged, false)).toBeNull();
    expect(resolveSessionListSelection('foreign', result.sessions, result.scopeChanged, true)).toBeNull();
  });
});

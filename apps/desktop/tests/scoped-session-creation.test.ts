import { describe, expect, it, vi } from 'vitest';
import { createAndLoadScopedSession } from '../src/renderer/scoped-session-creation.js';
import type { SessionListScope } from '../src/renderer/session-list-scope.js';

const nonDefaultScope: SessionListScope = {
  profile: 'browser-profile-2',
  workspacePath: 'C:/spaces/alpha',
  backendProfileName: 'backend-alpha'
};

describe('scoped session creation and activation', () => {
  it('creates then loads through the same non-default backend profile before activation', async () => {
    const calls: string[] = [];
    const create = vi.fn(async (scope: SessionListScope) => {
      calls.push('create');
      expect(scope).toEqual(nonDefaultScope);
      return { session: { session_id: 'created-session' } };
    });
    const load = vi.fn(async (sessionId: string, scope: SessionListScope) => {
      calls.push('load');
      expect(sessionId).toBe('created-session');
      expect(scope).toEqual(nonDefaultScope);
      return { session: { session_id: sessionId, profile: 'backend-alpha' } };
    });

    const result = await createAndLoadScopedSession(nonDefaultScope, () => true, create, load);

    expect(calls).toEqual(['create', 'load']);
    expect(result?.loaded.session?.session_id).toBe('created-session');
  });

  it('does not load or activate a created session after the Space changes during creation', async () => {
    let current = true;
    const load = vi.fn();
    const result = await createAndLoadScopedSession(nonDefaultScope, () => current, async () => {
      current = false;
      return { session: { session_id: 'created-in-old-space' } };
    }, load);

    expect(result).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('discards a getSession response that arrives after a profile switch', async () => {
    let current = true;
    const resultPromise = createAndLoadScopedSession(nonDefaultScope, () => current,
      async () => ({ session: { session_id: 'created-session' } }),
      async () => {
        current = false;
        return { session: { session_id: 'created-session' } };
      });

    await expect(resultPromise).resolves.toBeNull();
  });

  it('rejects a create response that cannot be loaded as the created chat', async () => {
    await expect(createAndLoadScopedSession(nonDefaultScope, () => true,
      async () => ({ session: { session_id: 'created-session' } }),
      async () => ({ session: { session_id: 'other-session' } })))
      .rejects.toThrow('The new chat could not be loaded in the selected Space.');
  });
});

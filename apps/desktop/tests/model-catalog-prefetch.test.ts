import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefetchModelCatalog, watchModelCatalogPrefetch } from '../src/renderer/model-catalog-prefetch.js';

type PrefetchGuard = NonNullable<Parameters<typeof prefetchModelCatalog>[1]>;

function shell(visibilityState: DocumentVisibilityState) {
  const events = new EventTarget();
  const view = Object.assign(new EventTarget(), { visibilityState });
  const removeItem = vi.fn();
  const setItem = vi.fn();
  vi.stubGlobal('window', Object.assign(events, { localStorage: { removeItem, setItem } }));
  vi.stubGlobal('document', view);
  return {
    removeItem,
    setItem,
    settingsSaved: () => events.dispatchEvent(new Event('lastbrowser:settings-changed')),
    show: (state: DocumentVisibilityState) => {
      view.visibilityState = state;
      view.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('automatic model catalog prefetch', () => {
  it('invalidates hidden settings changes and refreshes once when visible again', () => {
    const view = shell('visible');
    const refresh = vi.fn(async (_guard: PrefetchGuard) => {});
    const unsubscribe = watchModelCatalogPrefetch(refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
    view.show('hidden');
    view.settingsSaved();
    view.settingsSaved();
    expect(view.removeItem).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0][0]('publish')).toBe(false);
    view.show('visible');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh.mock.calls[1][0]('publish')).toBe(true);
    view.show('hidden');
    view.show('visible');
    expect(refresh).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('defers a hidden mount and leaves no refresh on show after cleanup', () => {
    const view = shell('hidden');
    const refresh = vi.fn(async () => {});
    const unsubscribe = watchModelCatalogPrefetch(refresh);
    expect(refresh).not.toHaveBeenCalled();
    view.show('visible');
    expect(refresh).toHaveBeenCalledTimes(1);
    view.show('hidden');
    view.settingsSaved();
    unsubscribe();
    view.show('visible');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('defers discovery when a visible prefetch resolves its scope after the shell hides', async () => {
    const view = shell('visible');
    const scope = {
      browserProfileId: 'local',
      backendProfileId: '11111111-1111-4111-8111-111111111111',
      spaceId: '22222222-2222-4222-8222-222222222222',
    };
    let resolveScope!: () => void;
    const scopeResponse = new Promise(resolve => {
      resolveScope = () => resolve({
        ok: true, value: { schemaVersion: 1, scope, spaceName: 'Home', workspacePath: null, bindingRevision: 1, setupStatus: 'confirmed' },
      });
    });
    const request = vi.fn(async ({ operation }: { operation: string }) => operation === 'resolveScope'
      ? scopeResponse
      : { ok: true, value: { schemaVersion: 1, scope, revision: 1, model: 'local', provider: 'ollama',
          configured: true, supportsIndependent: true, groups: [] } });
    Object.assign(window, { lastbrowser: { independent: { request } } });
    const refresh = vi.fn((guard: PrefetchGuard) => prefetchModelCatalog({
      viewKey: 'local', browserProfileId: scope.browserProfileId, workspacePath: null,
    }, guard));
    const unsubscribe = watchModelCatalogPrefetch(refresh);
    view.show('hidden');
    resolveScope();
    await refresh.mock.results[0].value;
    expect(request.mock.calls.map(([call]) => call.operation)).toEqual(['resolveScope']);
    view.show('visible');
    await refresh.mock.results[1].value;
    expect(request.mock.calls.map(([call]) => call.operation)).toEqual(['resolveScope', 'resolveScope', 'modelSelection']);
    expect(view.setItem).toHaveBeenCalledOnce();
    view.show('hidden');
    view.show('visible');
    expect(refresh).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

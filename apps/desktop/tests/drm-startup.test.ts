import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeCastlabsWidevine, type WidevineReadiness } from '../src/main/drm.js';
import { startPrimaryInstanceStartup } from '../src/main/app-startup.js';

describe('bounded Widevine shell startup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('creates the shell after a hanging component deadline without declaring DRM ready', async () => {
    const statuses: WidevineReadiness[] = [];
    const createShell = vi.fn();
    const whenReady = vi.fn(() => new Promise<void>(() => {}));
    startPrimaryInstanceStartup(true, () => {}, () => Promise.resolve(), async () => {
      const ready = await initializeCastlabsWidevine({ components: { whenReady } }, { timeoutMs: 3000, onStatus: status => statuses.push(status) });
      expect(ready).toBe(false);
      createShell();
    }, () => {});
    await vi.advanceTimersByTimeAsync(2999);
    expect(createShell).not.toHaveBeenCalled();
    expect(statuses).toEqual([{ status: 'pending', reason: 'initializing' }]);
    await vi.advanceTimersByTimeAsync(1);
    expect(createShell).toHaveBeenCalledOnce();
    expect(whenReady).toHaveBeenCalledOnce();
    expect(statuses.at(-1)).toEqual({ status: 'pending', reason: 'deadline_exceeded' });
  });

  it('starts immediately after actual component readiness and clears its deadline', async () => {
    const statuses: WidevineReadiness[] = [];
    const ready = await initializeCastlabsWidevine({ components: { whenReady: async () => undefined } }, { onStatus: status => statuses.push(status) });
    expect(ready).toBe(true);
    expect(statuses.at(-1)).toEqual({ status: 'ready', reason: 'components_ready' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps real component failure unavailable and does not wait for the deadline', async () => {
    const statuses: WidevineReadiness[] = [];
    const ready = await initializeCastlabsWidevine({ components: { whenReady: async () => { throw new Error('installation failed'); } } },
      { onStatus: status => statuses.push(status) });
    expect(ready).toBe(false);
    expect(statuses.at(-1)).toEqual({ status: 'unavailable', reason: 'component_error' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes real late readiness after a timeout while the shell remains active', async () => {
    let resolve!: () => void;
    const statuses: WidevineReadiness[] = [];
    const ready = initializeCastlabsWidevine({ components: { whenReady: () => new Promise<void>(done => { resolve = done; }) } },
      { timeoutMs: 3000, onStatus: status => statuses.push(status), isActive: () => true });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await ready).toBe(false);
    expect(statuses.some(status => status.status === 'ready')).toBe(false);
    resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toEqual({ status: 'ready', reason: 'components_ready' });
  });

  it('suppresses late updates after shutdown and handles late updater rejection', async () => {
    let reject!: (error: Error) => void;
    let active = true;
    const statuses: WidevineReadiness[] = [];
    const ready = initializeCastlabsWidevine({ components: { whenReady: () => new Promise<void>((_done, fail) => { reject = fail; }) } },
      { timeoutMs: 3000, onStatus: status => statuses.push(status), isActive: () => active });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await ready).toBe(false);
    active = false;
    reject(new Error('late updater failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toEqual({ status: 'pending', reason: 'deadline_exceeded' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports stock Electron as unsupported and rejects invalid deadline configuration', async () => {
    const statuses: WidevineReadiness[] = [];
    expect(await initializeCastlabsWidevine({}, { onStatus: status => statuses.push(status) })).toBe(false);
    expect(statuses).toEqual([{ status: 'unavailable', reason: 'unsupported' }]);
    await expect(initializeCastlabsWidevine({}, { timeoutMs: Infinity })).rejects.toThrow('Invalid Widevine startup deadline');
  });
});

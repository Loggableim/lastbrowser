import { describe, expect, it, vi } from 'vitest';
import {
  detachRequestKey,
  isGuestOwnedByRenderer,
  parseDetachTabPayload,
  PendingTabDetachRegistry,
  serializeNavigationHistory
} from '../src/main/window-tab-transfer.js';

describe('Main-process detached tab request handling', () => {
  it('rejects malformed tab identity or coordinates before a destination is created', () => {
    expect(parseDetachTabPayload({ tab: { url: 'https://example.com' }, screenX: 10, screenY: 20 })).toBeNull();
    expect(parseDetachTabPayload({ tab: { id: 'tab-1', url: '' }, guestWebContentsId: 9, screenX: 10, screenY: 20 })).toBeNull();
    expect(parseDetachTabPayload({ tab: { id: 'tab-1', url: 'https://example.com' }, guestWebContentsId: 9, screenX: Number.NaN, screenY: 20 })).toBeNull();
    expect(parseDetachTabPayload({ tab: { id: 'tab-1', url: 'https://example.com' }, guestWebContentsId: 0, screenX: 10, screenY: 20 })).toBeNull();
    expect(parseDetachTabPayload({ tab: { id: 'tab-1', url: 'https://example.com' }, guestWebContentsId: 9, screenX: 10, screenY: 20 })).toMatchObject({
      tab: { id: 'tab-1', url: 'https://example.com' },
      guestWebContentsId: 9,
      screenX: 10,
      screenY: 20
    });
  });

  it('only accepts guest webContents owned by the invoking renderer', () => {
    const guest = { hostWebContents: { id: 42 } };
    expect(isGuestOwnedByRenderer(guest, 42)).toBe(true);
    expect(isGuestOwnedByRenderer(guest, 43)).toBe(false);
    expect(isGuestOwnedByRenderer(undefined, 42)).toBe(false);
    expect(isGuestOwnedByRenderer({ hostWebContents: { id: Number.NaN } }, 42)).toBe(false);
  });

  it('serializes Electron navigation history for restoration, including page state and active index', () => {
    const history = {
      getAllEntries: () => [
        { url: 'https://first.example/', title: 'First', pageState: 'first-state', extra: 'discard me' },
        { url: 'https://second.example/', title: 'Second', pageState: 'second-state' }
      ],
      getActiveIndex: () => 0
    };
    expect(serializeNavigationHistory(history)).toEqual({
      entries: [
        { url: 'https://first.example/', title: 'First', pageState: 'first-state' },
        { url: 'https://second.example/', title: 'Second', pageState: 'second-state' }
      ],
      index: 0
    });
  });

  it('omits invalid or unavailable navigation history rather than restoring malformed entries', () => {
    expect(serializeNavigationHistory({ getAllEntries: () => [], getActiveIndex: () => -1 })).toBeNull();
    expect(serializeNavigationHistory({ getAllEntries: () => [{ url: 'https://only.example/', title: 'Only' }], getActiveIndex: () => 1 })).toBeNull();
    expect(serializeNavigationHistory({ getAllEntries: () => { throw new Error('guest gone'); }, getActiveIndex: () => 0 })).toBeNull();
  });

  it('coalesces simultaneous requests for the same source window and tab', async () => {
    const registry = new PendingTabDetachRegistry<string>();
    const operation = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'one-window';
    });
    const key = detachRequestKey(10, 'tab-1');

    const first = registry.run(key, operation);
    const second = registry.run(key, operation);
    expect(second).toBe(first);
    await expect(Promise.all([first, second])).resolves.toEqual(['one-window', 'one-window']);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('keeps detach requests from different sources or tabs independent and clears settled requests', async () => {
    const registry = new PendingTabDetachRegistry<number>();
    const operation = vi.fn(async () => 1);
    const firstKey = detachRequestKey(10, 'tab-1');
    const otherWindowKey = detachRequestKey(11, 'tab-1');
    const otherTabKey = detachRequestKey(10, 'tab-2');

    await Promise.all([
      registry.run(firstKey, operation),
      registry.run(otherWindowKey, operation),
      registry.run(otherTabKey, operation)
    ]);
    expect(operation).toHaveBeenCalledTimes(3);

    await registry.run(firstKey, operation);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('clears a failed request so the user can retry the detach', async () => {
    const registry = new PendingTabDetachRegistry<{ success: boolean }>();
    const operation = vi.fn(async () => ({ success: false }));
    const key = detachRequestKey(10, 'tab-1');

    await expect(registry.run(key, operation)).resolves.toEqual({ success: false });
    await expect(registry.run(key, operation)).resolves.toEqual({ success: false });
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

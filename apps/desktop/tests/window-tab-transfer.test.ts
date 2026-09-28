import { describe, expect, it, vi } from 'vitest';
import {
  detachRequestKey,
  ensureDetachedPageReady,
  isGuestOwnedByRenderer,
  matchesNavigationHistorySnapshot,
  normalizeRestoredNavigationHistory,
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

  it('requires the restored active history index even when URLs are duplicated', () => {
    const snapshot = {
      entries: [
        { url: 'https://same.example/', title: 'Same' },
        { url: 'https://same.example/', title: 'Same' },
        { url: 'https://other.example/', title: 'Other' }
      ],
      index: 1
    };
    expect(matchesNavigationHistorySnapshot(snapshot, snapshot.entries, 1)).toBe(true);
    expect(matchesNavigationHistorySnapshot(snapshot, snapshot.entries, 0)).toBe(false);
    expect(matchesNavigationHistorySnapshot(snapshot, snapshot.entries.slice(0, 2), 1)).toBe(false);
  });

  it.each([
    ['initial about:blank', 'about:blank'],
    ['duplicate source URL', 'https://second.example/']
  ])('normalizes a trailing %s entry and keeps the snapshot URL active', async (_kind, extraUrl) => {
    const snapshot = {
      entries: [
        { url: 'https://first.example/', title: 'First' },
        { url: 'https://second.example/', title: 'Second' }
      ],
      index: 1
    };
    const entries = [...snapshot.entries.map(({ url }) => ({ url })), { url: extraUrl }];
    let activeIndex = 2;
    const operations: string[] = [];
    const history = {
      getAllEntries: () => entries,
      getActiveIndex: () => activeIndex,
      getEntryAtIndex: (index: number) => entries[index] ?? null,
      removeEntryAtIndex: (index: number) => {
        operations.push(`remove:${index}`);
        if (index === activeIndex) return false;
        entries.splice(index, 1);
        if (index < activeIndex) activeIndex -= 1;
        return true;
      }
    };
    const navigateToIndex = vi.fn(async (index: number) => {
      operations.push(`navigate:${index}`);
      activeIndex = index;
    });

    await expect(normalizeRestoredNavigationHistory(snapshot, history, navigateToIndex)).resolves.toBe(true);
    expect(navigateToIndex).toHaveBeenCalledWith(snapshot.index);
    expect(operations).toEqual(['navigate:1', 'remove:2']);
    expect(matchesNavigationHistorySnapshot(snapshot, history.getAllEntries(), history.getActiveIndex())).toBe(true);
  });

  it('fails closed without pruning entries when restored history diverges from the source sequence', async () => {
    const snapshot = {
      entries: [
        { url: 'https://first.example/', title: 'First' },
        { url: 'https://second.example/', title: 'Second' }
      ],
      index: 1
    };
    const entries = [{ url: 'https://other.example/' }, { url: 'https://second.example/' }];
    const history = {
      getAllEntries: () => entries,
      getActiveIndex: () => 1,
      getEntryAtIndex: (index: number) => entries[index] ?? null,
      removeEntryAtIndex: vi.fn(() => true)
    };
    const navigateToIndex = vi.fn(async () => undefined);

    await expect(normalizeRestoredNavigationHistory(snapshot, history, navigateToIndex)).resolves.toBe(false);
    expect(navigateToIndex).not.toHaveBeenCalled();
    expect(history.removeEntryAtIndex).not.toHaveBeenCalled();
  });

  it('does not report a detached page ready when both history restore and URL fallback fail', async () => {
    const fallback = vi.fn(async () => { throw new Error('navigation failed'); });
    await expect(ensureDetachedPageReady(false, fallback)).resolves.toBe(false);
    expect(fallback).toHaveBeenCalledOnce();
    await expect(ensureDetachedPageReady(true, fallback)).resolves.toBe(true);
    expect(fallback).toHaveBeenCalledOnce();
    await expect(ensureDetachedPageReady(false, async () => 'loaded')).resolves.toBe(true);
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

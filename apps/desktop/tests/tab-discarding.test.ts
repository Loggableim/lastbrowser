/**
 * Phase 11.1 – Smart Tab-Discarding & Memory Saver Engine
 *
 * Tests for pure helper functions in tabs.ts that power the tab sleeping
 * feature. All helpers are tested without any Electron/main-process imports.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  discardTabById,
  wakeTabById,
  discardInactiveTabs,
  getSavedMemoryEstimateMb,
  DISCARD_MEMORY_ESTIMATE_MB,
  DEFAULT_IDLE_THRESHOLD_MS,
  createInitialTab
} from '../src/renderer/tabs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTab(overrides: Partial<ReturnType<typeof createInitialTab>> = {}) {
  return { ...createInitialTab('https://example.com'), ...overrides };
}

// ---------------------------------------------------------------------------
// discardTabById
// ---------------------------------------------------------------------------

describe('discardTabById', () => {
  it('marks a background tab as discarded', () => {
    const active = makeTab({ id: 'active' });
    const bg = makeTab({ id: 'bg', url: 'https://bg.com', favicon: 'bg.ico' });
    const result = discardTabById([active, bg], 'bg', 'active');
    const discarded = result.find((t) => t.id === 'bg')!;
    expect(discarded.isDiscarded).toBe(true);
    expect(discarded.discardedUrl).toBe('https://bg.com');
    expect(discarded.favicon).toBeUndefined();
    expect(discarded.isLoading).toBe(false);
  });

  it('never discards the currently active tab', () => {
    const tab = makeTab({ id: 'active' });
    const result = discardTabById([tab], 'active', 'active');
    expect(result[0].isDiscarded).toBeUndefined();
  });

  it('never discards a pinned tab', () => {
    const active = makeTab({ id: 'active' });
    const pinned = makeTab({ id: 'pinned', pinned: true });
    const result = discardTabById([active, pinned], 'pinned', 'active');
    expect(result.find((t) => t.id === 'pinned')!.isDiscarded).toBeUndefined();
  });

  it('never discards a tab that is playing audio', () => {
    const active = makeTab({ id: 'active' });
    const audio = makeTab({ id: 'audio', isPlayingAudio: true });
    const result = discardTabById([active, audio], 'audio', 'active');
    expect(result.find((t) => t.id === 'audio')!.isDiscarded).toBeUndefined();
  });

  it('leaves other tabs unchanged', () => {
    const a = makeTab({ id: 'a' });
    const b = makeTab({ id: 'b' });
    const c = makeTab({ id: 'c' });
    const result = discardTabById([a, b, c], 'b', 'a');
    expect(result.find((t) => t.id === 'a')).toEqual(a);
    expect(result.find((t) => t.id === 'c')).toEqual(c);
  });
});

// ---------------------------------------------------------------------------
// wakeTabById
// ---------------------------------------------------------------------------

describe('wakeTabById', () => {
  it('restores a discarded tab', () => {
    const tab = makeTab({
      id: 'sleeping',
      isDiscarded: true,
      discardedUrl: 'https://restored.com',
      url: 'about:blank'
    });
    const result = wakeTabById([tab], 'sleeping');
    const woken = result.find((t) => t.id === 'sleeping')!;
    expect(woken.isDiscarded).toBe(false);
    expect(woken.url).toBe('https://restored.com');
    expect(woken.discardedUrl).toBeUndefined();
    expect(woken.lastActiveAt).toBeGreaterThan(0);
  });

  it('is a no-op for a tab that is not discarded', () => {
    const tab = makeTab({ id: 'awake' });
    const result = wakeTabById([tab], 'awake');
    expect(result[0]).toEqual(tab);
  });

  it('does not affect other tabs', () => {
    const sleeping = makeTab({ id: 'sleeping', isDiscarded: true, discardedUrl: 'https://x.com', url: 'about:blank' });
    const active = makeTab({ id: 'active' });
    const result = wakeTabById([sleeping, active], 'sleeping');
    expect(result.find((t) => t.id === 'active')).toEqual(active);
  });
});

// ---------------------------------------------------------------------------
// discardInactiveTabs
// ---------------------------------------------------------------------------

describe('discardInactiveTabs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('discards idle background tabs', () => {
    vi.setSystemTime(new Date('2025-01-01T12:30:00Z'));
    const active = makeTab({ id: 'active', lastActiveAt: Date.now() });
    const idle = makeTab({ id: 'idle', lastActiveAt: Date.now() - 31 * 60 * 1000 });
    const { tabs, count } = discardInactiveTabs([active, idle], 'active');
    expect(count).toBe(1);
    expect(tabs.find((t) => t.id === 'idle')!.isDiscarded).toBe(true);
    expect(tabs.find((t) => t.id === 'active')!.isDiscarded).toBeUndefined();
    vi.useRealTimers();
  });

  it('respects a custom idle threshold', () => {
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    const active = makeTab({ id: 'active' });
    const tab = makeTab({ id: 'bg', lastActiveAt: Date.now() - 10 * 60 * 1000 });
    const threshold = 5 * 60 * 1000; // 5 min
    const { tabs, count } = discardInactiveTabs([active, tab], 'active', threshold);
    expect(count).toBe(1);
    expect(tabs.find((t) => t.id === 'bg')!.isDiscarded).toBe(true);
    vi.useRealTimers();
  });

  it('never discards pinned tabs', () => {
    vi.setSystemTime(new Date('2025-01-01T12:30:00Z'));
    const active = makeTab({ id: 'active' });
    const pinned = makeTab({ id: 'pinned', pinned: true, lastActiveAt: 0 });
    const { count } = discardInactiveTabs([active, pinned], 'active');
    expect(count).toBe(0);
    vi.useRealTimers();
  });

  it('skips tabs that are already discarded', () => {
    vi.setSystemTime(new Date('2025-01-01T12:30:00Z'));
    const active = makeTab({ id: 'active' });
    const alreadySleeping = makeTab({ id: 'sleep', isDiscarded: true, lastActiveAt: 0 });
    const { count, tabs } = discardInactiveTabs([active, alreadySleeping], 'active');
    expect(count).toBe(0);
    // Still discarded, not double-processed
    expect(tabs.find((t) => t.id === 'sleep')!.isDiscarded).toBe(true);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// getSavedMemoryEstimateMb
// ---------------------------------------------------------------------------

describe('getSavedMemoryEstimateMb', () => {
  it('returns 0 when no tabs are discarded', () => {
    const tabs = [makeTab(), makeTab()];
    expect(getSavedMemoryEstimateMb(tabs)).toBe(0);
  });

  it('returns 50 MB per discarded tab', () => {
    const tabs = [
      makeTab({ isDiscarded: true }),
      makeTab({ isDiscarded: true }),
      makeTab()
    ];
    expect(getSavedMemoryEstimateMb(tabs)).toBe(2 * DISCARD_MEMORY_ESTIMATE_MB);
  });
});

// ---------------------------------------------------------------------------
// Constants sanity checks
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('DISCARD_MEMORY_ESTIMATE_MB is 50', () => {
    expect(DISCARD_MEMORY_ESTIMATE_MB).toBe(50);
  });

  it('DEFAULT_IDLE_THRESHOLD_MS is 30 minutes', () => {
    expect(DEFAULT_IDLE_THRESHOLD_MS).toBe(30 * 60 * 1000);
  });
});

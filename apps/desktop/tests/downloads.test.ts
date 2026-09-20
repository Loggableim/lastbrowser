import { describe, expect, it, vi } from 'vitest';
import { createDownloadTracker } from '../src/main/downloads.js';

type Listener = (...args: unknown[]) => void;

function fakeItem(overrides: Partial<{
  filename: string;
  url: string;
  received: number;
  total: number;
  savePath: string;
  paused: boolean;
}> = {}) {
  const listeners = new Map<string, Listener[]>();
  const state = {
    filename: overrides.filename ?? 'report.pdf',
    url: overrides.url ?? 'https://example.com/report.pdf',
    received: overrides.received ?? 0,
    total: overrides.total ?? 1000,
    savePath: overrides.savePath ?? 'C:/Users/test/Downloads/report.pdf',
    paused: overrides.paused ?? false
  };
  return {
    state,
    getFilename: () => state.filename,
    getURL: () => state.url,
    getReceivedBytes: () => state.received,
    getTotalBytes: () => state.total,
    getSavePath: () => state.savePath,
    isPaused: () => state.paused,
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    fire(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    }
  };
}

function fakeSession() {
  const listeners: Array<(event: unknown, item: ReturnType<typeof fakeItem>) => void> = [];
  return {
    on(_event: 'will-download', listener: (event: unknown, item: ReturnType<typeof fakeItem>) => void) {
      listeners.push(listener);
    },
    start(item: ReturnType<typeof fakeItem>) {
      for (const listener of listeners) listener({}, item);
    }
  };
}

describe('download tracker', () => {
  it('records a download when it starts', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);

    session.start(fakeItem());
    const list = tracker.list();
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe('report.pdf');
    expect(list[0].state).toBe('progressing');
    expect(list[0].total).toBe(1000);
  });

  it('updates progress from the updated event', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    const item = fakeItem();
    session.start(item);

    item.state.received = 400;
    item.fire('updated');

    expect(tracker.list()[0].received).toBe(400);
    expect(tracker.list()[0].state).toBe('progressing');
  });

  it('marks a paused download as interrupted', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    const item = fakeItem();
    session.start(item);

    item.state.paused = true;
    item.fire('updated');

    expect(tracker.list()[0].state).toBe('interrupted');
  });

  it('marks a finished download as completed with its save path', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    const item = fakeItem();
    session.start(item);

    item.state.received = 1000;
    item.fire('done', {}, 'completed');

    const entry = tracker.list()[0];
    expect(entry.state).toBe('completed');
    expect(entry.savePath).toContain('report.pdf');
  });

  it('marks a cancelled download as cancelled', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    const item = fakeItem();
    session.start(item);

    item.fire('done', {}, 'cancelled');
    expect(tracker.list()[0].state).toBe('cancelled');
  });

  it('treats an unknown done state as interrupted', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    const item = fakeItem();
    session.start(item);

    item.fire('done', {}, 'weird-state');
    expect(tracker.list()[0].state).toBe('interrupted');
  });

  it('notifies subscribers on every change', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    const seen = vi.fn();
    tracker.subscribe(seen);

    session.start(fakeItem());
    expect(seen).toHaveBeenCalledTimes(1);

    const item = fakeItem();
    session.start(item);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    const seen = vi.fn();
    const unsubscribe = tracker.subscribe(seen);
    unsubscribe();

    session.start(fakeItem());
    expect(seen).not.toHaveBeenCalled();
  });

  it('clears finished downloads but keeps active ones', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);

    const done = fakeItem({ filename: 'done.pdf' });
    session.start(done);
    done.fire('done', {}, 'completed');

    const active = fakeItem({ filename: 'active.pdf' });
    session.start(active);

    tracker.clearFinished();
    const list = tracker.list();
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe('active.pdf');
  });

  it('clears a single download by id', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    session.start(fakeItem());

    const id = tracker.list()[0].id;
    tracker.clear(id);
    expect(tracker.list()).toHaveLength(0);
  });

  it('attaches to a session only once', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    tracker.attach(session);

    session.start(fakeItem());
    expect(tracker.list()).toHaveLength(1);
  });

  it('sorts newest first', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);

    session.start(fakeItem({ filename: 'first.pdf' }));
    session.start(fakeItem({ filename: 'second.pdf' }));

    expect(tracker.list()[0].filename).toBe('second.pdf');
  });
});

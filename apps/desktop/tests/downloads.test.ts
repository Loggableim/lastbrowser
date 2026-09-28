import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { broadcastDownloadSnapshot, createDownloadTracker } from '../src/main/downloads.js';
import { resolveDownloadsDockMode, resolveDownloadsMinimizedState, shouldRestoreDownloadsFromPillClick, shouldStartDownloadsHeaderDrag } from '../src/renderer/NativeDownloads.js';
import { canApplyDownloadSnapshot } from '../src/renderer/download-snapshot.js';

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
    assignedSavePath: '',
    paused: overrides.paused ?? false
  };
  return {
    state,
    getFilename: () => state.filename,
    getURL: () => state.url,
    getReceivedBytes: () => state.received,
    getTotalBytes: () => state.total,
    getSavePath: () => state.assignedSavePath || state.savePath,
    isPaused: () => state.paused,
    setSavePath: (path: string) => { state.assignedSavePath = path; },
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
  it('keeps the downloads surface mounted at app-shell scope for every active panel', () => {
    const appSource = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const panelMount = appSource.indexOf('<DownloadsPanel open={downloadsOpen}');
    const browserMainDeclaration = appSource.indexOf('function BrowserMain(');
    const appComponentStart = appSource.indexOf('export function App(): JSX.Element {');
    const appScope = appSource.slice(appComponentStart, browserMainDeclaration);

    expect(panelMount).toBeGreaterThan(-1);
    expect(panelMount).toBeLessThan(browserMainDeclaration);
    expect(appSource.match(/<DownloadsPanel open=\{downloadsOpen\}/g)).toHaveLength(1);
    expect(appScope).toMatch(/downloadsOpen,\s*setDownloadsOpen,/);
  });

  it('does not let an older list response overwrite a newer pushed snapshot', () => {
    const requestRevision = 4;

    expect(canApplyDownloadSnapshot(requestRevision, 4)).toBe(true);
    // An onChanged event increments the revision while list() is in flight.
    expect(canApplyDownloadSnapshot(requestRevision, 5)).toBe(false);
  });

  it('broadcasts download changes to every live window and skips destroyed windows', () => {
    const mainSend = vi.fn();
    const detachedSend = vi.fn();
    const destroyedSend = vi.fn();
    const entries = [{ id: 'dl-1', filename: 'a.txt', url: 'https://example.com/a.txt', received: 1, total: 2, state: 'progressing' as const, savePath: '', startedAt: 1 }];

    broadcastDownloadSnapshot([
      { isDestroyed: () => false, webContents: { send: mainSend } },
      { isDestroyed: () => false, webContents: { send: detachedSend } },
      { isDestroyed: () => true, webContents: { send: destroyedSend } }
    ], entries);

    expect(mainSend).toHaveBeenCalledWith('lastbrowser:downloads:changed', entries);
    expect(detachedSend).toHaveBeenCalledWith('lastbrowser:downloads:changed', entries);
    expect(destroyedSend).not.toHaveBeenCalled();
  });

  it('restores only supported dock positions and falls back for stale preferences', () => {
    expect(resolveDownloadsDockMode('dock-tabs')).toBe('dock-tabs');
    expect(resolveDownloadsDockMode('dock-topbar-left')).toBe('dock-topbar-left');
    expect(resolveDownloadsDockMode('dock-sidekick')).toBe('dock-sidekick');
    expect(resolveDownloadsDockMode('legacy-position')).toBe('dropdown');
    expect(resolveDownloadsDockMode(null)).toBe('dropdown');
  });

  it('exposes stable dock modes and localized labels on downloads controls', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/NativeDownloads.tsx'), 'utf8');

    expect(source).toContain('data-dock-mode={dockMode}');
    expect(source).toContain('data-download-action="minimize"');
    expect(source).toContain('data-download-action="close"');
    for (const mode of ['dropdown', 'floating', 'dock-tabs', 'dock-topbar-left', 'dock-topbar-right', 'dock-sidekick']) {
      expect(source).toContain(`data-dock-mode="${mode}"`);
    }
    for (const label of ['undock', 'dockTabs', 'dockSidekick', 'dockTopLeft', 'dockTopRight', 'float', 'dockDropdown']) {
      expect(source).toContain(`aria-label={t('downloads.${label}')}`);
    }
    expect(source).toContain('aria-label={t(\'downloads.minimize\')}');
    expect(source).toContain('aria-label={t(\'downloads.close\')}');
  });

  it('reopens a closed minimized downloads panel in its expanded state', () => {
    expect(resolveDownloadsMinimizedState(false, true)).toBe(false);
    expect(resolveDownloadsMinimizedState(true, false)).toBe(false);
    expect(resolveDownloadsMinimizedState(true, true)).toBe(true);
  });

  it('restores the minimized pill on click but not after a drag', () => {
    expect(shouldRestoreDownloadsFromPillClick(false)).toBe(true);
    expect(shouldRestoreDownloadsFromPillClick(true)).toBe(false);

    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/NativeDownloads.tsx'), 'utf8');
    expect(source).toContain('dragPointerStartRef.current');
    expect(source).toContain('Math.abs(e.clientX - dragPointerStartRef.current.x) >= 4');
    expect(source).toContain('shouldRestoreDownloadsFromPillClick(didDragRef.current)');
  });

  it('does not begin dragging a floating downloads panel from header controls', () => {
    const matchesControl = (selector: string) => selector === 'button, .downloads-dock-controls';
    const buttonTarget = { closest: (selector: string) => matchesControl(selector) ? {} : null } as unknown as EventTarget;
    const headerTarget = { closest: () => null } as unknown as EventTarget;

    expect(shouldStartDownloadsHeaderDrag(buttonTarget)).toBe(false);
    expect(shouldStartDownloadsHeaderDrag(headerTarget)).toBe(true);

    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/NativeDownloads.tsx'), 'utf8');
    expect(source).toContain('shouldStartDownloadsHeaderDrag(event.target)');
  });

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

  it('assigns a default Downloads path before tracking the item', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    const downloadsDirectory = path.join(tmpdir(), `lastbrowser-download-test-${process.pid}-${Math.random()}`);
    tracker.attach(session, downloadsDirectory);
    const item = fakeItem({ filename: 'report.pdf', savePath: '' });

    session.start(item);

    expect(item.state.assignedSavePath).toBe(path.join(downloadsDirectory, 'report.pdf'));
    expect(tracker.list()[0].savePath).toBe(item.state.assignedSavePath);
    expect(tracker.list()[0].state).toBe('progressing');

    item.state.received = 1000;
    item.fire('done', {}, 'completed');
    expect(tracker.list()[0].state).toBe('completed');
    expect(tracker.list()[0].savePath).toBe(item.state.assignedSavePath);
  });

  it('sanitizes suggested names and chooses a free name for concurrent/existing downloads', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    const downloadsDirectory = path.join(tmpdir(), `lastbrowser-download-test-${process.pid}-${Math.random()}`);
    tracker.attach(session, downloadsDirectory);
    const first = fakeItem({ filename: '..\\report?.pdf', savePath: '' });
    const second = fakeItem({ filename: '..\\report?.pdf', savePath: '' });

    session.start(first);
    session.start(second);

    expect(first.state.assignedSavePath).toBe(path.join(downloadsDirectory, 'report_.pdf'));
    expect(second.state.assignedSavePath).toBe(path.join(downloadsDirectory, 'report_ (1).pdf'));
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

  it('keeps paused active downloads through finished-history pruning and clear-finished', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    const paused = fakeItem({ filename: 'paused.pdf' });
    session.start(paused);
    paused.state.paused = true;
    paused.fire('updated');

    for (let index = 0; index < 501; index += 1) {
      const finished = fakeItem({ filename: `finished-${index}.pdf` });
      session.start(finished);
      finished.fire('done', {}, 'completed');
    }

    expect(tracker.list().find((entry) => entry.filename === 'paused.pdf')?.state).toBe('interrupted');
    tracker.clearFinished();
    expect(tracker.list()).toEqual([
      expect.objectContaining({ filename: 'paused.pdf', state: 'interrupted' })
    ]);
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

  it('bounds finished history while preserving every in-progress download', () => {
    const tracker = createDownloadTracker();
    const session = fakeSession();
    tracker.attach(session);
    const active = fakeItem({ filename: 'active.pdf' });
    session.start(active);

    for (let index = 0; index < 501; index += 1) {
      const item = fakeItem({ filename: `finished-${index}.pdf` });
      session.start(item);
      item.fire('done', {}, 'completed');
    }

    const entries = tracker.list();
    expect(entries).toHaveLength(501);
    expect(entries.find((entry) => entry.filename === 'active.pdf')?.state).toBe('progressing');
    expect(entries.find((entry) => entry.filename === 'finished-0.pdf')).toBeUndefined();
    expect(entries.find((entry) => entry.filename === 'finished-1.pdf')?.state).toBe('completed');
    expect(entries[0].filename).toBe('finished-500.pdf');
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

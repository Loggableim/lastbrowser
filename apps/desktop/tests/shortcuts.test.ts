import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  browserShortcutChannel,
  matchBrowserShortcut,
  registerBrowserNavigationCommands,
  registerBrowserShortcuts
} from '../src/main/shortcuts.js';

describe('shortcuts system', () => {
  it('routes shortcuts to the window owning the originating contents and leaves unrelated contents alone', () => {
    let created!: (event: unknown, contents: any) => void;
    const app = { on: (_name: string, listener: typeof created) => { created = listener; } };
    const primary = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    const detached = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    const createContents = () => {
      let handler!: (event: { preventDefault: () => void }, input: any) => void;
      return { on: (_name: string, listener: typeof handler) => { handler = listener; }, fire: (event: any) => handler(event, { type: 'keyDown', key: 't', control: true }) };
    };
    const primaryContents = createContents();
    const detachedGuest = createContents();
    const unrelatedContents = createContents();
    registerBrowserShortcuts({ app, getWindow: (contents: any) => contents === primaryContents ? primary : contents === detachedGuest ? detached : null });
    for (const contents of [primaryContents, detachedGuest, unrelatedContents]) created(null, contents);
    const primaryEvent = { preventDefault: vi.fn() };
    const detachedEvent = { preventDefault: vi.fn() };
    const unrelatedEvent = { preventDefault: vi.fn() };
    primaryContents.fire(primaryEvent);
    detachedGuest.fire(detachedEvent);
    unrelatedContents.fire(unrelatedEvent);
    expect(primary.webContents.send).toHaveBeenCalledTimes(1);
    expect(detached.webContents.send).toHaveBeenCalledWith(browserShortcutChannel, { action: 'new-tab' });
    expect(primaryEvent.preventDefault).toHaveBeenCalledOnce();
    expect(detachedEvent.preventDefault).toHaveBeenCalledOnce();
    expect(unrelatedEvent.preventDefault).not.toHaveBeenCalled();
  });
  it('sends native back and forward commands only to the window that received them', () => {
    const createWindow = () => Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    });
    const primary = createWindow();
    const detached = createWindow();
    registerBrowserNavigationCommands(primary);
    registerBrowserNavigationCommands(detached);

    const event = { preventDefault: vi.fn() };
    detached.emit('app-command', event, 'browser-backward');
    detached.emit('app-command', event, 'browser-forward');
    detached.emit('app-command', event, 'media-play-pause');

    expect(detached.webContents.send.mock.calls).toEqual([
      [browserShortcutChannel, { action: 'history-back' }],
      [browserShortcutChannel, { action: 'history-forward' }]
    ]);
    expect(primary.webContents.send).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
  });

  it('exposes the correct IPC channel name', () => {
    expect(browserShortcutChannel).toBe('lastbrowser:browser:shortcut');
  });

  it('matches tab lifecycle shortcuts', () => {
    expect(matchBrowserShortcut({ type: 'keyDown', key: 't', control: true })).toEqual({ action: 'new-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'T', meta: true })).toEqual({ action: 'new-tab' });

    expect(matchBrowserShortcut({ type: 'keyDown', key: 't', control: true, shift: true })).toEqual({ action: 'reopen-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'T', meta: true, shift: true })).toEqual({ action: 'reopen-tab' });

    expect(matchBrowserShortcut({ type: 'keyDown', key: 'n', control: true, shift: true })).toEqual({ action: 'new-incognito-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'N', meta: true, shift: true })).toEqual({ action: 'new-incognito-tab' });

    expect(matchBrowserShortcut({ type: 'keyDown', key: 'w', control: true })).toEqual({ action: 'close-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'W', meta: true })).toEqual({ action: 'close-tab' });
  });

  it('matches address bar focus shortcuts', () => {
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'l', control: true })).toEqual({ action: 'focus-address' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'L', meta: true })).toEqual({ action: 'focus-address' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'd', alt: true })).toEqual({ action: 'focus-address' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'D', alt: true })).toEqual({ action: 'focus-address' });
  });

  it('matches reload shortcuts', () => {
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'r', control: true })).toEqual({ action: 'reload' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'F5' })).toEqual({ action: 'reload' });

    expect(matchBrowserShortcut({ type: 'keyDown', key: 'r', control: true, shift: true })).toEqual({ action: 'reload-hard' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'F5', control: true })).toEqual({ action: 'reload-hard' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'F5', shift: true })).toEqual({ action: 'reload-hard' });
  });

  it('matches tab navigation and switching shortcuts', () => {
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'Tab', control: true })).toEqual({ action: 'next-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'PageDown', control: true })).toEqual({ action: 'next-tab' });

    expect(matchBrowserShortcut({ type: 'keyDown', key: 'Tab', control: true, shift: true })).toEqual({ action: 'prev-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'PageUp', control: true })).toEqual({ action: 'prev-tab' });

    expect(matchBrowserShortcut({ type: 'keyDown', key: '1', control: true })).toEqual({
      action: 'jump-tab',
      payload: { index: 0 }
    });
    expect(matchBrowserShortcut({ type: 'keyDown', key: '5', meta: true })).toEqual({
      action: 'jump-tab',
      payload: { index: 4 }
    });
    expect(matchBrowserShortcut({ type: 'keyDown', key: '8', control: true })).toEqual({
      action: 'jump-tab',
      payload: { index: 7 }
    });
    expect(matchBrowserShortcut({ type: 'keyDown', key: '9', control: true })).toEqual({
      action: 'jump-last-tab'
    });
  });

  it('routes Ctrl/Cmd+1..8 through the tab consumer without a competing pinned-app listener', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const jumpTabConsumer = app.match(/case 'jump-tab':\s*\{([\s\S]*?)\n\s*case 'jump-last-tab'/)?.[1];

    expect(jumpTabConsumer).toContain('setActiveTabId(allTabs[target].id)');
    expect(jumpTabConsumer).toContain("setActivePanel('browser')");
    expect(app).not.toContain('Ctrl+1..8: jump to pinned app');
    expect(app).not.toContain('const digit = parseInt(event.key, 10)');

    for (let digit = 1; digit <= 8; digit += 1) {
      expect(matchBrowserShortcut({ type: 'keyDown', key: String(digit), control: true })).toEqual({
        action: 'jump-tab',
        payload: { index: digit - 1 }
      });
    }
  });

  it('matches tools and panels shortcuts', () => {
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'f', control: true })).toEqual({ action: 'find-in-page' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'h', control: true })).toEqual({ action: 'open-history' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'j', control: true })).toEqual({ action: 'open-downloads' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: ',', control: true })).toEqual({ action: 'open-settings' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'x', control: true, shift: true })).toEqual({ action: 'open-extensions' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'X', meta: true, shift: true })).toEqual({ action: 'open-extensions' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'b', control: true })).toEqual({ action: 'toggle-sidebar' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'F12' })).toEqual({ action: 'toggle-devtools' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'i', control: true, shift: true })).toEqual({ action: 'toggle-devtools' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'F11' })).toEqual({ action: 'toggle-fullscreen' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'ArrowLeft', alt: true })).toEqual({ action: 'history-back' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'ArrowRight', alt: true })).toEqual({ action: 'history-forward' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'p', control: true })).toEqual({ action: 'print-page' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'P', meta: true })).toEqual({ action: 'print-page' });
  });

  it('matches zoom shortcuts', () => {
    expect(matchBrowserShortcut({ type: 'keyDown', key: '=', control: true })).toEqual({ action: 'zoom-in' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: '+', control: true })).toEqual({ action: 'zoom-in' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: '-', control: true })).toEqual({ action: 'zoom-out' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: '0', control: true })).toEqual({ action: 'zoom-reset' });
  });

  it('ignores standard typing, navigation and non-shortcut keys', () => {
    expect(matchBrowserShortcut({ type: 'keyUp', key: 't', control: true })).toBeNull();
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'a' })).toBeNull();
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'c', control: true })).toBeNull(); // copy
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'v', control: true })).toBeNull(); // paste
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'x', control: true })).toBeNull(); // cut
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'z', control: true })).toBeNull(); // undo
  });

  it('registers web-contents before-input-event and dispatches IPC message', () => {
    let webContentsCreatedListener: ((event: unknown, contents: unknown) => void) | null = null;
    const mockApp = {
      on: vi.fn((event: string, listener: (event: unknown, contents: unknown) => void) => {
        if (event === 'web-contents-created') {
          webContentsCreatedListener = listener;
        }
      })
    };

    const sendMock = vi.fn();
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: sendMock
      }
    };

    registerBrowserShortcuts({
      app: mockApp,
      getWindow: () => mockWindow
    });

    expect(mockApp.on).toHaveBeenCalledWith('web-contents-created', expect.any(Function));

    let inputListener: ((event: { preventDefault: () => void }, input: unknown) => void) | null = null;
    const mockContents = {
      on: vi.fn((event: string, listener: (event: { preventDefault: () => void }, input: unknown) => void) => {
        if (event === 'before-input-event') {
          inputListener = listener;
        }
      })
    };

    webContentsCreatedListener!(null, mockContents);
    expect(mockContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function));

    const preventDefault = vi.fn();
    inputListener!({ preventDefault }, { type: 'keyDown', key: 't', control: true });

    expect(preventDefault).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledWith('lastbrowser:browser:shortcut', { action: 'new-tab' });
  });
});

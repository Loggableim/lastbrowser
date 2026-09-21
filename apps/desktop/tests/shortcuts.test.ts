import { describe, expect, it, vi } from 'vitest';
import {
  browserShortcutChannel,
  matchBrowserShortcut,
  registerBrowserShortcuts
} from '../src/main/shortcuts.js';

describe('shortcuts system', () => {
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

  it('matches tools and panels shortcuts', () => {
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'f', control: true })).toEqual({ action: 'find-in-page' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'h', control: true })).toEqual({ action: 'open-history' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'j', control: true })).toEqual({ action: 'open-downloads' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: ',', control: true })).toEqual({ action: 'open-settings' });
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
